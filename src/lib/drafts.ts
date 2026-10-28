import { useSyncExternalStore } from "react";
import { ACCOUNT_SLOT_CHANGE_EVENT, getScopedStorageKey } from "./accountManager";

const DRAFTS_STORAGE_KEY = "jatext:drafts:v1";

type DraftsMap = Record<string, string>;

let cachedDrafts: DraftsMap | null = null;
let cachedSlotKey = "";
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

function persistDrafts(next: DraftsMap) {
  const activeKey = getScopedStorageKey(DRAFTS_STORAGE_KEY);
  cachedSlotKey = activeKey;
  cachedDrafts = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(activeKey, JSON.stringify(next));
    } catch {
      // Ignore quota errors.
    }
  }
  for (const listener of listeners) {
    listener();
  }
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
    persistDrafts(next);
    return;
  }
  if (current[scopeKey] === value) return;
  persistDrafts({
    ...current,
    [scopeKey]: value,
  });
}

export function clearDraft(scopeKey: string): void {
  const current = readDraftsFromStorage();
  if (!(scopeKey in current)) return;
  const next = { ...current };
  delete next[scopeKey];
  persistDrafts(next);
}

function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener(ACCOUNT_SLOT_CHANGE_EVENT, listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener(ACCOUNT_SLOT_CHANGE_EVENT, listener);
    }
  };
}

export function useDraftsMap(): DraftsMap {
  return useSyncExternalStore(
    subscribeDrafts,
    readDraftsFromStorage,
    () => ({}),
  );
}
