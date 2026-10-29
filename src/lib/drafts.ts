import { useSyncExternalStore } from "react";
import { ACCOUNT_SLOT_CHANGE_EVENT, getScopedStorageKey } from "./accountManager";

const DRAFTS_STORAGE_KEY = "jatext:drafts:v1";

type DraftsMap = Record<string, string>;

let cachedDrafts: DraftsMap | null = null;
let cachedSlotKey = "";
let flushTimer: number | null = null;
const listeners = new Set<() => void>();

function readDraftsFromStorage(): DraftsMap {
  const activeKey = getScopedStorageKey(DRAFTS_STORAGE_KEY);
  if (cachedDrafts && cachedSlotKey === activeKey) return cachedDrafts;
  cachedSlotKey = activeKey;
  if (typeof window === "undefined") {
    cachedDrafts = {};
    return cachedDrafts;
  }
  try {
    const raw = window.localStorage.getItem(activeKey);
    if (!raw) {
      cachedDrafts = {};
      return cachedDrafts;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const clean: DraftsMap = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 0) {
          clean[k] = v;
        }
      }
      cachedDrafts = clean;
      return cachedDrafts;
    }
  } catch {
    // Ignore storage read errors.
  }
  cachedDrafts = {};
  return cachedDrafts;
}

function flushDraftsNow() {
  if (flushTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!cachedDrafts) return;
  const activeKey = getScopedStorageKey(DRAFTS_STORAGE_KEY);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(activeKey, JSON.stringify(cachedDrafts));
    } catch {
      // Ignore quota errors.
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

function persistDraftsDebounced(next: DraftsMap, immediate = false) {
  const activeKey = getScopedStorageKey(DRAFTS_STORAGE_KEY);
  cachedSlotKey = activeKey;
  cachedDrafts = next;

  if (immediate || typeof window === "undefined") {
    flushDraftsNow();
    return;
  }

  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
  }
  // Debounce disk I/O + Sidebar store notifications so typing runs at a locked 60-120fps!
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushDraftsNow();
  }, 360);
}

export function getDraft(scopeKey: string): string {
  return readDraftsFromStorage()[scopeKey] ?? "";
}

export function setDraft(scopeKey: string, value: string): void {
  const current = readDraftsFromStorage();
  if (!value.trim()) {
    if (!(scopeKey in current)) return;
    const next = { ...current };
    delete next[scopeKey];
    persistDraftsDebounced(next, false);
    return;
  }
  if (current[scopeKey] === value) return;
  persistDraftsDebounced(
    {
      ...current,
      [scopeKey]: value,
    },
    false,
  );
}

export function clearDraft(scopeKey: string): void {
  const current = readDraftsFromStorage();
  if (!(scopeKey in current)) return;
  const next = { ...current };
  delete next[scopeKey];
  persistDraftsDebounced(next, true);
}

export function flushPendingDrafts(): void {
  if (flushTimer !== null) {
    flushDraftsNow();
  }
}

function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    const onSlotChange = () => {
      flushPendingDrafts();
      cachedDrafts = null;
      cachedSlotKey = "";
      listener();
    };
    window.addEventListener(ACCOUNT_SLOT_CHANGE_EVENT, onSlotChange);
    return () => {
      listeners.delete(listener);
      window.removeEventListener(ACCOUNT_SLOT_CHANGE_EVENT, onSlotChange);
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useDraftsMap(): DraftsMap {
  return useSyncExternalStore(subscribeDrafts, readDraftsFromStorage, () => ({}));
}
