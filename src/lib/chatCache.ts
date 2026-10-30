import { useSyncExternalStore } from "react";
import { DEFAULT_ACCOUNT_SLOT_ID } from "./accountManager";
import type {
  ChatMessage,
  ChatPreview,
  CommunityMessage,
  GroupDetails,
  GroupMessage,
  GroupSummary,
  JaUser,
} from "./types";

const BOOTSTRAP_LS_PREFIX = "jatext:bootstrap-cache:v1";
const IDB_NAME = "jatext-chat-cache-v1";
const IDB_STORE = "slot_conversations";
const MAX_CACHED_MESSAGES_PER_CHAT = 250;
const MAX_CACHED_COMMUNITY_MESSAGES = 60;

export interface SlotBootstrapCache {
  userId: string;
  me: JaUser;
  friends: JaUser[];
  previews: ChatPreview[];
  groups: GroupSummary[];
  communityMessages: CommunityMessage[];
  updatedAt: number;
}

export interface CachedDmEntry {
  messages: ChatMessage[];
  rawRows?: ChatMessage[];
  updatedAt: number;
}

export interface CachedGroupEntry {
  details: GroupDetails | null;
  messages: GroupMessage[];
  rawRows?: GroupMessage[];
  updatedAt: number;
}

interface PersistedSlotConversations {
  slotId: string;
  dms: Record<string, CachedDmEntry>;
  groups: Record<string, CachedGroupEntry>;
  updatedAt: number;
}

const memoryBootstrap = new Map<string, SlotBootstrapCache | null>();
const memoryConversations = new Map<string, PersistedSlotConversations>();
const loadedSlotsFromIdb = new Set<string>();
const loadingSlotsFromIdb = new Map<string, Promise<void>>();
const writeDebounceTimers = new Map<string, number>();

let cacheVersion = 0;
const listeners = new Set<() => void>();

function notifyCacheListeners(): void {
  cacheVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

function getBootstrapStorageKey(slotId: string): string {
  return slotId === DEFAULT_ACCOUNT_SLOT_ID
    ? BOOTSTRAP_LS_PREFIX
    : `${BOOTSTRAP_LS_PREFIX}:${slotId}`;
}

export function isPlaceholderEncryptedText(text?: string | null): boolean {
  if (!text) return false;
  return (
    text.includes("__JATEXT_E2EE_V1__:") ||
    text === "Encrypted message" ||
    text === "🔒 Encrypted message" ||
    text.startsWith("🔒 Decrypting") ||
    text.startsWith("Decrypting") ||
    text.startsWith("🔒 Waiting for this message") ||
    text.startsWith("Waiting for this message")
  );
}

function stripEphemeralBlobUrl<T extends { attachmentUrl?: string }>(msg: T): T {
  if (msg.attachmentUrl && msg.attachmentUrl.startsWith("blob:")) {
    return { ...msg, attachmentUrl: undefined };
  }
  return msg;
}

/* ------------------------------------------------------------------ */
/* IndexedDB Persistence for Per-Chat & Per-Group Message Histories    */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

function getOrInitMemorySlot(slotId: string): PersistedSlotConversations {
  let slotData = memoryConversations.get(slotId);
  if (!slotData) {
    slotData = {
      slotId,
      dms: {},
      groups: {},
      updatedAt: 0,
    };
    memoryConversations.set(slotId, slotData);
  }
  return slotData;
}

export function preloadSlotChatCache(slotId: string): Promise<void> {
  if (loadedSlotsFromIdb.has(slotId)) return Promise.resolve();
  const existing = loadingSlotsFromIdb.get(slotId);
  if (existing) return existing;

  const task = (async () => {
    const db = await openCacheDb();
    if (!db) {
      loadedSlotsFromIdb.add(slotId);
      return;
    }
    const persisted = await new Promise<PersistedSlotConversations | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(slotId);
        req.onsuccess = () =>
          resolve((req.result as PersistedSlotConversations | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    loadedSlotsFromIdb.add(slotId);
    if (!persisted) return;

    const current = getOrInitMemorySlot(slotId);
    let addedAny = false;

    if (persisted.dms && typeof persisted.dms === "object") {
      for (const [friendId, entry] of Object.entries(persisted.dms)) {
        if (!current.dms[friendId] && entry && Array.isArray(entry.messages)) {
          current.dms[friendId] = entry;
          addedAny = true;
        }
      }
    }
    if (persisted.groups && typeof persisted.groups === "object") {
      for (const [groupId, entry] of Object.entries(persisted.groups)) {
        if (!current.groups[groupId] && entry && Array.isArray(entry.messages)) {
          current.groups[groupId] = entry;
          addedAny = true;
        }
      }
    }

    if (addedAny) {
      notifyCacheListeners();
    }
  })();

  loadingSlotsFromIdb.set(slotId, task);
  return task.finally(() => {
    loadingSlotsFromIdb.delete(slotId);
  });
}

function schedulePersistSlotToIdb(slotId: string): void {
  if (typeof window === "undefined") return;
  const prevTimer = writeDebounceTimers.get(slotId);
  if (prevTimer !== undefined) {
    window.clearTimeout(prevTimer);
  }
  const timer = window.setTimeout(() => {
    writeDebounceTimers.delete(slotId);
    void flushSlotToIdb(slotId);
  }, 220);
  writeDebounceTimers.set(slotId, timer);
}

async function flushSlotToIdb(slotId: string): Promise<void> {
  const slotData = memoryConversations.get(slotId);
  if (!slotData) return;
  const db = await openCacheDb();
  if (!db) return;

  const cleanDms: Record<string, CachedDmEntry> = {};
  for (const [friendId, entry] of Object.entries(slotData.dms)) {
    cleanDms[friendId] = {
      messages: entry.messages.slice(-MAX_CACHED_MESSAGES_PER_CHAT).map(stripEphemeralBlobUrl),
      rawRows: entry.rawRows?.slice(-MAX_CACHED_MESSAGES_PER_CHAT),
      updatedAt: entry.updatedAt,
    };
  }

  const cleanGroups: Record<string, CachedGroupEntry> = {};
  for (const [groupId, entry] of Object.entries(slotData.groups)) {
    cleanGroups[groupId] = {
      details: entry.details,
      messages: entry.messages.slice(-MAX_CACHED_MESSAGES_PER_CHAT).map(stripEphemeralBlobUrl),
      rawRows: entry.rawRows?.slice(-MAX_CACHED_MESSAGES_PER_CHAT),
      updatedAt: entry.updatedAt,
    };
  }

  const payload: PersistedSlotConversations = {
    slotId,
    dms: cleanDms,
    groups: cleanGroups,
    updatedAt: Date.now(),
  };

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(payload, slotId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Synchronous Bootstrap Snapshot (me, friends, previews, groups)      */
/* ------------------------------------------------------------------ */

export function getSlotBootstrapCache(slotId: string): SlotBootstrapCache | null {
  if (memoryBootstrap.has(slotId)) {
    return memoryBootstrap.get(slotId) ?? null;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getBootstrapStorageKey(slotId));
    if (!raw) {
      memoryBootstrap.set(slotId, null);
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SlotBootstrapCache>;
    if (!parsed || typeof parsed !== "object" || !parsed.me?.id) {
      memoryBootstrap.set(slotId, null);
      return null;
    }
    const clean: SlotBootstrapCache = {
      userId: parsed.me.id,
      me: parsed.me,
      friends: Array.isArray(parsed.friends) ? parsed.friends : [],
      previews: Array.isArray(parsed.previews) ? parsed.previews : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      communityMessages: Array.isArray(parsed.communityMessages)
        ? parsed.communityMessages
        : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
    memoryBootstrap.set(slotId, clean);
    return clean;
  } catch {
    memoryBootstrap.set(slotId, null);
    return null;
  }
}

export function saveSlotBootstrapCache(
  slotId: string,
  patch: {
    me?: JaUser;
    friends?: JaUser[];
    previews?: ChatPreview[];
    groups?: GroupSummary[];
    communityMessages?: CommunityMessage[];
  },
): void {
  const existing = getSlotBootstrapCache(slotId);
  const resolvedMe = patch.me ?? existing?.me;
  if (!resolvedMe?.id) return;
  const sameUserExisting =
    existing && existing.userId === resolvedMe.id ? existing : null;

  // Preserve previously-decrypted preview text if live E2EE hydration is still in flight
  let mergedPreviews =
    patch.previews ?? (sameUserExisting ? sameUserExisting.previews : []);
  if (patch.previews && sameUserExisting && sameUserExisting.previews.length > 0) {
    const prevByFriend = new Map(
      sameUserExisting.previews.map((p) => [p.friendId, p]),
    );
    mergedPreviews = patch.previews.map((live) => {
      if (!isPlaceholderEncryptedText(live.body)) return live;
      const prev = prevByFriend.get(live.friendId);
      if (
        prev &&
        prev.createdAt === live.createdAt &&
        !isPlaceholderEncryptedText(prev.body)
      ) {
        return { ...live, body: prev.body };
      }
      return live;
    });
  }

  let mergedGroups =
    patch.groups ?? (sameUserExisting ? sameUserExisting.groups : []);
  if (patch.groups && sameUserExisting && sameUserExisting.groups.length > 0) {
    const prevByGroup = new Map(sameUserExisting.groups.map((g) => [g.id, g]));
    mergedGroups = patch.groups.map((live) => {
      if (!isPlaceholderEncryptedText(live.lastMessage)) return live;
      const prev = prevByGroup.get(live.id);
      if (
        prev &&
        prev.lastMessageAt === live.lastMessageAt &&
        !isPlaceholderEncryptedText(prev.lastMessage)
      ) {
        return { ...live, lastMessage: prev.lastMessage };
      }
      return live;
    });
  }

  const next: SlotBootstrapCache = {
    userId: resolvedMe.id,
    me: resolvedMe,
    friends: patch.friends ?? (sameUserExisting ? sameUserExisting.friends : []),
    previews: mergedPreviews,
    groups: mergedGroups,
    communityMessages: (
      patch.communityMessages ??
      (sameUserExisting ? sameUserExisting.communityMessages : [])
    )
      .slice(-MAX_CACHED_COMMUNITY_MESSAGES)
      .map(stripEphemeralBlobUrl),
    updatedAt: Date.now(),
  };

  memoryBootstrap.set(slotId, next);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(getBootstrapStorageKey(slotId), JSON.stringify(next));
    } catch {
      // Ignore storage quota issues; memoryBootstrap remains active.
    }
  }
}

/* ------------------------------------------------------------------ */
/* Per-Conversation 1:1 DM & Group Chat Cache Accessors                */
/* ------------------------------------------------------------------ */

export function mergeLiveWithCachedMessages<
  T extends {
    id: string;
    body: string;
    editedAt?: number;
    unsentAt?: number;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    bubbleStyle?: ChatMessage["bubbleStyle"];
    e2ee?: ChatMessage["e2ee"];
  },
>(liveMessages: T[], cachedMessages?: T[]): T[] {
  if (!cachedMessages || cachedMessages.length === 0) return liveMessages;
  const cachedById = new Map<string, T>();
  for (const m of cachedMessages) {
    cachedById.set(m.id, m);
  }
  let changed = false;
  const out = liveMessages.map((msg) => {
    if (msg.unsentAt) return msg;
    const prev = cachedById.get(msg.id);
    if (!prev || (prev.editedAt ?? 0) !== (msg.editedAt ?? 0)) return msg;

    const liveNeedsDecrypt = isPlaceholderEncryptedText(msg.body);
    const prevWasDecrypted = !isPlaceholderEncryptedText(prev.body);
    if (liveNeedsDecrypt && prevWasDecrypted) {
      changed = true;
      return {
        ...msg,
        body: prev.body,
        bubbleStyle:
          msg.bubbleStyle && msg.bubbleStyle !== "default"
            ? msg.bubbleStyle
            : prev.bubbleStyle,
        attachmentUrl:
          msg.attachmentUrl && !msg.attachmentUrl.includes("encrypted")
            ? msg.attachmentUrl
            : prev.attachmentUrl ?? msg.attachmentUrl,
        attachmentName:
          msg.attachmentName === "encrypted.jatext"
            ? prev.attachmentName ?? msg.attachmentName
            : msg.attachmentName ?? prev.attachmentName,
        attachmentType:
          msg.attachmentType === "application/octet-stream"
            ? prev.attachmentType ?? msg.attachmentType
            : msg.attachmentType ?? prev.attachmentType,
        e2ee: prev.e2ee ?? msg.e2ee,
      };
    }
    return msg;
  });
  return changed ? out : liveMessages;
}

function isEphemeralWebRtcSignal(body?: string | null): boolean {
  if (!body || !body.startsWith("__JATEXT_CALL_SIG__:")) return false;
  if (
    body.includes('"e2ee_ik"') ||
    body.includes('"e2ee_gk"') ||
    body.includes('"e2ee_vf"') ||
    body.includes('"reaction"') ||
    body.includes('"unfriend"') ||
    body.includes('"refriend"')
  ) {
    return false;
  }
  return true;
}

function trimRawRowsForCache<T extends { body: string }>(rows?: T[]): T[] | undefined {
  if (!rows) return undefined;
  const nonWebRtc = rows.filter((r) => !isEphemeralWebRtcSignal(r.body));
  return nonWebRtc.slice(-MAX_CACHED_MESSAGES_PER_CHAT);
}

export function getCachedDmConversation(
  slotId: string,
  friendId: string | null | undefined,
): CachedDmEntry | null {
  if (!friendId) return null;
  return getOrInitMemorySlot(slotId).dms[friendId] ?? null;
}

export function setCachedDmConversation(
  slotId: string,
  friendId: string,
  messages: ChatMessage[],
  rawRows?: ChatMessage[],
): void {
  if (!friendId) return;
  const slotData = getOrInitMemorySlot(slotId);
  const visible = messages.filter((m) => !m.body.startsWith("__JATEXT_CALL_SIG__:"));
  const capped = visible.slice(-MAX_CACHED_MESSAGES_PER_CHAT);
  const existing = slotData.dms[friendId];
  const recentExistingStatuses = existing
    ? existing.messages
        .slice(-12)
        .map((m) => `${m.id}:${m.deliveryStatus}`)
        .join("|")
    : "";
  const recentNextStatuses = capped
    .slice(-12)
    .map((m) => `${m.id}:${m.deliveryStatus}`)
    .join("|");
  if (
    existing &&
    existing.messages.length === capped.length &&
    existing.messages.at(-1)?.id === capped.at(-1)?.id &&
    existing.messages.at(-1)?.body === capped.at(-1)?.body &&
    existing.messages.at(-1)?.editedAt === capped.at(-1)?.editedAt &&
    existing.messages.at(-1)?.unsentAt === capped.at(-1)?.unsentAt &&
    recentExistingStatuses === recentNextStatuses &&
    (existing.messages.at(-1)?.reactions?.length ?? 0) ===
      (capped.at(-1)?.reactions?.length ?? 0)
  ) {
    return;
  }
  const wasMissing = !existing;
  slotData.dms[friendId] = {
    messages: capped,
    rawRows: trimRawRowsForCache(rawRows),
    updatedAt: Date.now(),
  };
  slotData.updatedAt = Date.now();
  schedulePersistSlotToIdb(slotId);
  if (wasMissing) {
    notifyCacheListeners();
  }
}

export function getCachedGroupConversation(
  slotId: string,
  groupId: string | null | undefined,
): CachedGroupEntry | null {
  if (!groupId) return null;
  return getOrInitMemorySlot(slotId).groups[groupId] ?? null;
}

export function setCachedGroupConversation(
  slotId: string,
  groupId: string,
  patch: {
    details?: GroupDetails | null;
    messages?: GroupMessage[];
    rawRows?: GroupMessage[];
  },
): void {
  if (!groupId) return;
  const slotData = getOrInitMemorySlot(slotId);
  const existing = slotData.groups[groupId];
  const nextDetails = patch.details !== undefined ? patch.details : (existing?.details ?? null);
  const nextMessages =
    patch.messages !== undefined
      ? patch.messages
          .filter((m) => !m.body.startsWith("__JATEXT_CALL_SIG__:"))
          .slice(-MAX_CACHED_MESSAGES_PER_CHAT)
      : (existing?.messages ?? []);
  const nextRawRows =
    patch.rawRows !== undefined
      ? trimRawRowsForCache(patch.rawRows)
      : existing?.rawRows;

  if (
    existing &&
    existing.details?.name === nextDetails?.name &&
    existing.details?.avatarUrl === nextDetails?.avatarUrl &&
    (existing.details?.members.length ?? 0) === (nextDetails?.members.length ?? 0) &&
    existing.messages.length === nextMessages.length &&
    existing.messages.at(-1)?.id === nextMessages.at(-1)?.id &&
    existing.messages.at(-1)?.body === nextMessages.at(-1)?.body &&
    existing.messages.at(-1)?.editedAt === nextMessages.at(-1)?.editedAt &&
    existing.messages.at(-1)?.unsentAt === nextMessages.at(-1)?.unsentAt &&
    (existing.messages.at(-1)?.reactions?.length ?? 0) ===
      (nextMessages.at(-1)?.reactions?.length ?? 0)
  ) {
    return;
  }

  const wasMissing = !existing;
  slotData.groups[groupId] = {
    details: nextDetails,
    messages: nextMessages,
    rawRows: nextRawRows,
    updatedAt: Date.now(),
  };
  slotData.updatedAt = Date.now();
  schedulePersistSlotToIdb(slotId);
  if (wasMissing) {
    notifyCacheListeners();
  }
}

export function markCachedDmMessagesRead(slotId: string, friendId: string): void {
  if (!friendId) return;
  let mutated = false;
  const slotData = getOrInitMemorySlot(slotId);
  const existing = slotData.dms[friendId];
  if (existing) {
    let dmChanged = false;
    const nextMessages = existing.messages.map((m) => {
      if (m.senderId === friendId && m.deliveryStatus !== "read") {
        dmChanged = true;
        return { ...m, deliveryStatus: "read" as const };
      }
      return m;
    });
    const nextRaw = existing.rawRows?.map((m) => {
      if (m.senderId === friendId && m.deliveryStatus !== "read") {
        dmChanged = true;
        return { ...m, deliveryStatus: "read" as const };
      }
      return m;
    });
    if (dmChanged) {
      slotData.dms[friendId] = {
        messages: nextMessages,
        rawRows: nextRaw,
        updatedAt: Date.now(),
      };
      slotData.updatedAt = Date.now();
      schedulePersistSlotToIdb(slotId);
      mutated = true;
    }
  }

  const boot = memoryBootstrap.get(slotId);
  if (boot) {
    let bootChanged = false;
    const nextPreviews = boot.previews.map((p) => {
      if (p.friendId === friendId && (p.unreadCount ?? 0) > 0) {
        bootChanged = true;
        return {
          ...p,
          unreadCount: 0,
        };
      }
      return p;
    });
    if (bootChanged) {
      const nextBoot: SlotBootstrapCache = {
        ...boot,
        previews: nextPreviews,
        updatedAt: Date.now(),
      };
      memoryBootstrap.set(slotId, nextBoot);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(getBootstrapStorageKey(slotId), JSON.stringify(nextBoot));
        } catch {
          // ignore storage quota errors
        }
      }
      mutated = true;
    }
  }

  if (mutated) {
    notifyCacheListeners();
  }
}

export function markCachedBootstrapGroupRead(slotId: string, groupId: string): void {
  if (!groupId) return;
  const boot = memoryBootstrap.get(slotId);
  if (!boot) return;
  let bootChanged = false;
  const nextGroups = boot.groups.map((g) => {
    if (g.id === groupId && ((g.unreadCount ?? 0) > 0 || g.lastMentionedMe)) {
      bootChanged = true;
      return { ...g, unreadCount: 0, lastMentionedMe: false };
    }
    return g;
  });
  if (!bootChanged) return;
  const nextBoot: SlotBootstrapCache = {
    ...boot,
    groups: nextGroups,
    updatedAt: Date.now(),
  };
  memoryBootstrap.set(slotId, nextBoot);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(getBootstrapStorageKey(slotId), JSON.stringify(nextBoot));
    } catch {
      // ignore storage quota errors
    }
  }
  notifyCacheListeners();
}

export async function clearSlotChatCache(slotId: string): Promise<void> {
  const prevTimer = writeDebounceTimers.get(slotId);
  if (prevTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(prevTimer);
    writeDebounceTimers.delete(slotId);
  }
  memoryBootstrap.delete(slotId);
  memoryConversations.delete(slotId);
  loadedSlotsFromIdb.delete(slotId);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(getBootstrapStorageKey(slotId));
    } catch {
      // Ignore
    }
  }
  const db = await openCacheDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(slotId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  notifyCacheListeners();
}

function subscribeChatCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChatCacheVersion(): number {
  return useSyncExternalStore(
    subscribeChatCache,
    () => cacheVersion,
    () => 0,
  );
}
