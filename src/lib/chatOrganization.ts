import { useSyncExternalStore } from "react";
import { tursoRpc } from "./tursoClient";
import { OFFICIAL_COMMUNITY_ID } from "./types";

export interface ChatFolder {
  id: string;
  name: string;
  threadIds: string[];
}

export interface ChatOrganizationState {
  pinnedIds: string[];
  customOrder: string[];
  folders: ChatFolder[];
}

export interface PinnedMessageItem {
  id: string;
  messageId: string;
  senderName: string;
  preview: string;
  previewText: string;
  pinnedAt: number;
}

const ORG_STORAGE_KEY = "jatext:chat_org:v1";
const PINNED_MSG_STORAGE_PREFIX = "jatext:pinned_msgs:v1:";

const orgListeners = new Set<() => void>();
const msgPinListeners = new Set<() => void>();

function normalizeState(raw?: Partial<ChatOrganizationState> | null): ChatOrganizationState {
  const pinnedIds = Array.isArray(raw?.pinnedIds)
    ? [...new Set(raw.pinnedIds.map(String).filter((x) => x && x !== OFFICIAL_COMMUNITY_ID))]
    : [];
  const rawOrder = Array.isArray(raw?.customOrder)
    ? [...new Set(raw.customOrder.map(String).filter(Boolean))]
    : [];
  const customOrder = [
    OFFICIAL_COMMUNITY_ID,
    ...rawOrder.filter((x) => x !== OFFICIAL_COMMUNITY_ID && x !== "__jatext_community__"),
  ];
  const folders = Array.isArray(raw?.folders)
    ? raw.folders
        .map((f) => {
          if (!f || typeof f !== "object") return null;
          const id = String(f.id || "").trim();
          const name = String(f.name || "").trim().slice(0, 32);
          if (!id || !name) return null;
          const threadIds = Array.isArray(f.threadIds)
            ? [...new Set(f.threadIds.map(String).filter(Boolean))]
            : [];
          return { id, name, threadIds };
        })
        .filter((f): f is ChatFolder => Boolean(f))
    : [];
  return { pinnedIds, customOrder, folders };
}

function loadInitialOrg(): ChatOrganizationState {
  if (typeof window === "undefined") {
    return { pinnedIds: [], customOrder: [OFFICIAL_COMMUNITY_ID], folders: [] };
  }
  try {
    const raw = localStorage.getItem(ORG_STORAGE_KEY);
    if (!raw) return { pinnedIds: [], customOrder: [OFFICIAL_COMMUNITY_ID], folders: [] };
    return normalizeState(JSON.parse(raw));
  } catch {
    return { pinnedIds: [], customOrder: [OFFICIAL_COMMUNITY_ID], folders: [] };
  }
}

let orgState: ChatOrganizationState = loadInitialOrg();

function saveLocalOrg(next: ChatOrganizationState, syncServer: boolean) {
  orgState = normalizeState(next);
  try {
    localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify(orgState));
  } catch {
    // Ignore
  }
  for (const fn of orgListeners) fn();
  if (syncServer) {
    const serverPayload = {
      ...orgState,
      customOrder: [
        "__jatext_community__",
        ...orgState.customOrder.filter((x) => x !== OFFICIAL_COMMUNITY_ID),
      ],
    };
    void tursoRpc("saveChatOrganization", { chatOrganization: serverPayload }).catch(
      () => undefined,
    );
  }
}

export function ingestServerChatOrganization(raw?: Partial<ChatOrganizationState> | null): void {
  if (!raw || typeof raw !== "object") return;
  const incoming = normalizeState(raw);
  if (
    incoming.pinnedIds.length === 0 &&
    incoming.folders.length === 0 &&
    incoming.customOrder.length <= 1 &&
    (orgState.pinnedIds.length > 0 || orgState.folders.length > 0)
  ) {
    return;
  }
  const sigA = JSON.stringify(orgState);
  const sigB = JSON.stringify(incoming);
  if (sigA !== sigB) {
    saveLocalOrg(incoming, false);
  }
}

export function useChatOrganization(): ChatOrganizationState {
  return useSyncExternalStore(
    (cb) => {
      orgListeners.add(cb);
      return () => orgListeners.delete(cb);
    },
    () => orgState,
    () => orgState,
  );
}

export function togglePinThread(threadKey: string): void {
  if (!threadKey || threadKey === OFFICIAL_COMMUNITY_ID) return;
  const isPinned = orgState.pinnedIds.includes(threadKey);
  const pinnedIds = isPinned
    ? orgState.pinnedIds.filter((id) => id !== threadKey)
    : [threadKey, ...orgState.pinnedIds];
  saveLocalOrg({ ...orgState, pinnedIds }, true);
}

export function moveThreadOrder(
  threadKey: string,
  direction: "up" | "down",
  currentVisibleKeys: string[],
): void {
  if (!threadKey || threadKey === OFFICIAL_COMMUNITY_ID) return;
  const nonCommunity = currentVisibleKeys.filter((k) => k !== OFFICIAL_COMMUNITY_ID);
  const idx = nonCommunity.indexOf(threadKey);
  if (idx < 0) return;
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= nonCommunity.length) return;
  const reordered = [...nonCommunity];
  const [item] = reordered.splice(idx, 1);
  reordered.splice(targetIdx, 0, item);
  const remaining = orgState.customOrder.filter(
    (k) => k !== OFFICIAL_COMMUNITY_ID && !reordered.includes(k),
  );
  saveLocalOrg(
    {
      ...orgState,
      customOrder: [OFFICIAL_COMMUNITY_ID, ...reordered, ...remaining],
    },
    true,
  );
}

export function saveChatFolder(folder: {
  id?: string;
  name: string;
  threadIds: string[];
}): ChatFolder | null {
  const cleanName = folder.name.trim().slice(0, 32);
  if (!cleanName) return null;
  const id = folder.id || `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const nextFolder: ChatFolder = {
    id,
    name: cleanName,
    threadIds: [...new Set(folder.threadIds.filter(Boolean))],
  };
  const existingIdx = orgState.folders.findIndex((f) => f.id === id);
  const folders =
    existingIdx >= 0
      ? orgState.folders.map((f, i) => (i === existingIdx ? nextFolder : f))
      : [...orgState.folders, nextFolder];
  saveLocalOrg({ ...orgState, folders }, true);
  return nextFolder;
}

export function deleteChatFolder(folderId: string): void {
  const folders = orgState.folders.filter((f) => f.id !== folderId);
  saveLocalOrg({ ...orgState, folders }, true);
}

export function toggleThreadInFolder(folderId: string, threadKey: string): void {
  const folders = orgState.folders.map((f) => {
    if (f.id !== folderId) return f;
    const has = f.threadIds.includes(threadKey);
    return {
      ...f,
      threadIds: has ? f.threadIds.filter((t) => t !== threadKey) : [...f.threadIds, threadKey],
    };
  });
  saveLocalOrg({ ...orgState, folders }, true);
}

/* ==================== Client-Side Pinned Messages Per Thread ==================== */

const pinnedMessagesCache = new Map<string, PinnedMessageItem[]>();

function readThreadPins(threadKey: string): PinnedMessageItem[] {
  const cached = pinnedMessagesCache.get(threadKey);
  if (cached) return cached;
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${PINNED_MSG_STORAGE_PREFIX}${threadKey}`);
    const parsed = raw ? JSON.parse(raw) : [];
    const clean = Array.isArray(parsed)
      ? parsed
          .filter((x): x is Record<string, unknown> => Boolean(x && typeof x.id === "string"))
          .map((x) => {
            const id = String(x.id);
            const preview = String(x.preview ?? x.previewText ?? "");
            return {
              id,
              messageId: id,
              senderName: String(x.senderName ?? ""),
              preview,
              previewText: preview,
              pinnedAt: Number(x.pinnedAt ?? Date.now()),
            };
          })
      : [];
    pinnedMessagesCache.set(threadKey, clean);
    return clean;
  } catch {
    return [];
  }
}

export function toggleClientPinnedMessage(
  threadKey: string,
  item: { id: string; senderName: string; preview: string; pinnedAt?: number },
): boolean {
  const current = readThreadPins(threadKey);
  const exists = current.some((p) => p.id === item.id);
  const normalized: PinnedMessageItem = {
    id: item.id,
    messageId: item.id,
    senderName: item.senderName,
    preview: item.preview,
    previewText: item.preview,
    pinnedAt: item.pinnedAt ?? Date.now(),
  };
  const next = exists
    ? current.filter((p) => p.id !== item.id)
    : [normalized, ...current.filter((p) => p.id !== item.id)].slice(0, 25);
  pinnedMessagesCache.set(threadKey, next);
  try {
    localStorage.setItem(`${PINNED_MSG_STORAGE_PREFIX}${threadKey}`, JSON.stringify(next));
  } catch {
    // Ignore
  }
  for (const fn of msgPinListeners) fn();
  return !exists;
}

export function isMessagePinned(conversationKey: string, messageId: string): boolean {
  return readThreadPins(conversationKey).some((p) => p.id === messageId);
}

export function togglePinnedMessage(params: {
  conversationKey: string;
  messageId: string;
  senderName: string;
  previewText: string;
}): boolean {
  return toggleClientPinnedMessage(params.conversationKey, {
    id: params.messageId,
    senderName: params.senderName,
    preview: params.previewText,
    pinnedAt: Date.now(),
  });
}

export function useClientPinnedMessages(threadKey: string): PinnedMessageItem[] {
  return useSyncExternalStore(
    (cb) => {
      msgPinListeners.add(cb);
      return () => msgPinListeners.delete(cb);
    },
    () => readThreadPins(threadKey),
    () => [],
  );
}

export const usePinnedMessages = useClientPinnedMessages;
