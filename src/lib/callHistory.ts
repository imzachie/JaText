import { useSyncExternalStore } from "react";

export interface CallHistoryEntry {
  callId: string;
  kind: "dm" | "group";
  peerId: string;
  peerDisplayName: string;
  peerUsername: string;
  peerAvatarUrl?: string;
  peerAvatarColor: string;
  groupId?: string;
  groupName?: string;
  groupAvatarUrl?: string;
  direction: "outgoing" | "incoming";
  mode: "voice" | "video";
  state: "ringing" | "connected" | "ended" | "missed" | "declined";
  durationSec?: number;
  timestamp: number;
}

const CALL_HISTORY_KEY = "jatext:call-history:v1";
const MAX_HISTORY_ITEMS = 120;

let cachedEntries: CallHistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function loadEntries(): CallHistoryEntry[] {
  if (cachedEntries) return cachedEntries;
  if (typeof window === "undefined") {
    cachedEntries = [];
    return cachedEntries;
  }
  try {
    const raw = window.localStorage.getItem(CALL_HISTORY_KEY);
    if (!raw) {
      cachedEntries = [];
      return cachedEntries;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      cachedEntries = parsed.filter(
        (item): item is CallHistoryEntry =>
          Boolean(item && typeof item === "object" && typeof (item as CallHistoryEntry).callId === "string"),
      );
      return cachedEntries;
    }
  } catch {
    // Ignore storage read errors.
  }
  cachedEntries = [];
  return cachedEntries;
}

function saveEntries(next: CallHistoryEntry[]) {
  cachedEntries = next.slice(0, MAX_HISTORY_ITEMS);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(cachedEntries));
    } catch {
      // Ignore quota errors.
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

export function upsertCallHistoryEntry(entry: CallHistoryEntry): void {
  const cur = loadEntries();
  const existingIdx = cur.findIndex((item) => item.callId === entry.callId);
  if (existingIdx === -1) {
    saveEntries([entry, ...cur].sort((a, b) => b.timestamp - a.timestamp));
    return;
  }
  const merged: CallHistoryEntry = {
    ...cur[existingIdx],
    ...entry,
    timestamp: cur[existingIdx].timestamp || entry.timestamp,
  };
  const next = [...cur];
  next[existingIdx] = merged;
  saveEntries(next.sort((a, b) => b.timestamp - a.timestamp));
}

export function updateCallHistoryStatus(
  callId: string,
  patch: Partial<Pick<CallHistoryEntry, "state" | "durationSec">>,
): void {
  const cur = loadEntries();
  const idx = cur.findIndex((item) => item.callId === callId);
  if (idx === -1) return;
  const next = [...cur];
  next[idx] = { ...next[idx], ...patch };
  saveEntries(next);
}

function subscribeCallHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY_LIST: CallHistoryEntry[] = [];

export function useCallHistoryEntries(): CallHistoryEntry[] {
  return useSyncExternalStore(
    subscribeCallHistory,
    loadEntries,
    () => EMPTY_LIST,
  );
}
