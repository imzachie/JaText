import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { JaTextNative } from "./nativeBridge";

export interface GroupLocalPrefs {
  isSilenced: boolean;
  isArchived: boolean;
  lastReadAt: number;
  unreadTimestamps: number[];
  clearedAt?: number;
}

export interface DmLocalPrefs {
  lastReadAt: number;
  unreadTimestamps: number[];
}

export interface UserChatPrefsState {
  initializedAt: number;
  communityMuted: boolean;
  communityLastReadAt: number;
  groups: Record<string, GroupLocalPrefs>;
  dms: Record<string, DmLocalPrefs>;
}

const STORAGE_PREFIX = "jatext:user-chat-prefs:v1:";
const SUPPRESSED_PUSH_KEY = "jatext:suppressed-push-targets";

const cacheByUser = new Map<string, UserChatPrefsState>();
const listeners = new Set<() => void>();

const EMPTY_PREFS: UserChatPrefsState = {
  initializedAt: 0,
  communityMuted: false,
  communityLastReadAt: 0,
  groups: {},
  dms: {},
};

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUserChatPrefs(userId: string | null | undefined): UserChatPrefsState {
  if (!userId) return EMPTY_PREFS;
  const mem = cacheByUser.get(userId);
  if (mem) return mem;

  const now = Date.now();
  let state: UserChatPrefsState = {
    initializedAt: now,
    communityMuted: false,
    communityLastReadAt: now,
    groups: {},
    dms: {},
  };

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserChatPrefsState>;
        if (parsed && typeof parsed === "object") {
          state = {
            initializedAt:
              typeof parsed.initializedAt === "number" ? parsed.initializedAt : now,
            communityMuted: Boolean(parsed.communityMuted),
            communityLastReadAt:
              typeof parsed.communityLastReadAt === "number"
                ? parsed.communityLastReadAt
                : now,
            groups: parsed.groups && typeof parsed.groups === "object" ? parsed.groups : {},
            dms: parsed.dms && typeof parsed.dms === "object" ? parsed.dms : {},
          };
        }
      } else {
        window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(state));
      }
    } catch {
      // ignore storage errors
    }
  }

  cacheByUser.set(userId, state);
  return state;
}

function saveUserChatPrefs(userId: string, next: UserChatPrefsState) {
  cacheByUser.set(userId, next);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }
  notifyListeners();
}

export function useUserChatPrefs(userId: string | null | undefined): UserChatPrefsState {
  return useSyncExternalStore(
    subscribe,
    () => getUserChatPrefs(userId),
    () => EMPTY_PREFS,
  );
}

export function setLocalCommunityMuted(userId: string, muted: boolean) {
  const prev = getUserChatPrefs(userId);
  if (prev.communityMuted === muted) return;
  saveUserChatPrefs(userId, {
    ...prev,
    communityMuted: muted,
  });
}

/**
 * Strictly idempotent: uses ONLY message/event timestamp (never Date.now())
 * so repeated calls for the same chat state are guaranteed 0-op!
 */
export function markLocalCommunityRead(userId: string, latestMessageAt?: number) {
  const prev = getUserChatPrefs(userId);
  const candidate = latestMessageAt ?? prev.communityLastReadAt;
  const nextReadAt = Math.max(candidate, prev.communityLastReadAt);
  if (nextReadAt <= prev.communityLastReadAt) return;
  saveUserChatPrefs(userId, {
    ...prev,
    communityLastReadAt: nextReadAt,
  });
}

export function updateLocalGroupSettings(
  userId: string,
  groupId: string,
  patch: { isSilenced?: boolean; isArchived?: boolean },
) {
  const prev = getUserChatPrefs(userId);
  const existing = prev.groups[groupId] ?? {
    isSilenced: false,
    isArchived: false,
    lastReadAt: prev.initializedAt || 0,
    unreadTimestamps: [],
  };
  const nextSilenced = patch.isSilenced ?? existing.isSilenced;
  const nextArchived = patch.isArchived ?? existing.isArchived;
  if (nextSilenced === existing.isSilenced && nextArchived === existing.isArchived) {
    return;
  }
  saveUserChatPrefs(userId, {
    ...prev,
    groups: {
      ...prev.groups,
      [groupId]: {
        ...existing,
        isSilenced: nextSilenced,
        isArchived: nextArchived,
      },
    },
  });
}

export function clearLocalGroupHistory(userId: string, groupId: string, clearedAt: number) {
  if (!userId || !groupId) return;
  const prev = getUserChatPrefs(userId);
  const existing = prev.groups[groupId] ?? {
    isSilenced: false,
    isArchived: false,
    lastReadAt: clearedAt,
    unreadTimestamps: [],
  };
  const nextClearedAt = Math.max(clearedAt, existing.clearedAt ?? 0);
  const nextReadAt = Math.max(clearedAt, existing.lastReadAt ?? 0);
  saveUserChatPrefs(userId, {
    ...prev,
    groups: {
      ...prev.groups,
      [groupId]: {
        ...existing,
        lastReadAt: nextReadAt,
        unreadTimestamps: [],
        clearedAt: nextClearedAt,
      },
    },
  });
}

/**
 * Strictly idempotent: clears unreadTimestamps once and advances lastReadAt
 * only to latestMessageAt and never loops!
 */
export function markLocalGroupRead(userId: string, groupId: string, latestMessageAt?: number) {
  const prev = getUserChatPrefs(userId);
  const existing = prev.groups[groupId];
  if (!existing) {
    if (!latestMessageAt) return;
    saveUserChatPrefs(userId, {
      ...prev,
      groups: {
        ...prev.groups,
        [groupId]: {
          isSilenced: false,
          isArchived: false,
          lastReadAt: latestMessageAt,
          unreadTimestamps: [],
        },
      },
    });
    return;
  }
  const candidate = latestMessageAt ?? existing.lastReadAt;
  const nextReadAt = Math.max(candidate, existing.lastReadAt);
  if (nextReadAt <= existing.lastReadAt && existing.unreadTimestamps.length === 0) {
    return;
  }
  saveUserChatPrefs(userId, {
    ...prev,
    groups: {
      ...prev.groups,
      [groupId]: {
        ...existing,
        lastReadAt: nextReadAt,
        unreadTimestamps: [],
      },
    },
  });
}

export function recordIncomingGroupSummariesBatch(
  userId: string,
  items: Array<{ groupId: string; lastMessageAt: number; isFromOther: boolean }>,
) {
  if (!userId || items.length === 0) return;
  const prev = getUserChatPrefs(userId);
  let mutatedGroups: Record<string, GroupLocalPrefs> | null = null;

  for (const { groupId, lastMessageAt, isFromOther } of items) {
    if (!groupId || !lastMessageAt) continue;
    const currentMap = mutatedGroups ?? prev.groups;
    const existing = currentMap[groupId];
    if (!existing) {
      if (!mutatedGroups) mutatedGroups = { ...prev.groups };
      mutatedGroups[groupId] = {
        isSilenced: false,
        isArchived: false,
        lastReadAt: lastMessageAt,
        unreadTimestamps: [],
      };
      continue;
    }
    if (!isFromOther || lastMessageAt <= existing.lastReadAt) continue;
    if (existing.unreadTimestamps.includes(lastMessageAt)) continue;
    const nextTimestamps = [...existing.unreadTimestamps, lastMessageAt]
      .filter((t) => t > existing.lastReadAt)
      .slice(-99);
    if (!mutatedGroups) mutatedGroups = { ...prev.groups };
    mutatedGroups[groupId] = {
      ...existing,
      unreadTimestamps: nextTimestamps,
    };
  }

  if (mutatedGroups) {
    saveUserChatPrefs(userId, {
      ...prev,
      groups: mutatedGroups,
    });
  }
}

/**
 * Strictly idempotent: clears unreadTimestamps once and advances lastReadAt
 * only to latestMessageAt and never loops!
 */
export function markLocalDmRead(userId: string, friendId: string, latestMessageAt?: number) {
  if (!userId || !friendId) return;
  const prev = getUserChatPrefs(userId);
  const existing = prev.dms[friendId];
  if (!existing) {
    if (!latestMessageAt) return;
    saveUserChatPrefs(userId, {
      ...prev,
      dms: {
        ...prev.dms,
        [friendId]: {
          lastReadAt: latestMessageAt,
          unreadTimestamps: [],
        },
      },
    });
    return;
  }
  const candidate = latestMessageAt ?? existing.lastReadAt;
  const nextReadAt = Math.max(candidate, existing.lastReadAt);
  if (nextReadAt <= existing.lastReadAt && existing.unreadTimestamps.length === 0) {
    return;
  }
  saveUserChatPrefs(userId, {
    ...prev,
    dms: {
      ...prev.dms,
      [friendId]: {
        lastReadAt: nextReadAt,
        unreadTimestamps: [],
      },
    },
  });
}

export function recordIncomingDmPreviewsBatch(
  userId: string,
  items: Array<{ friendId: string; createdAt: number; isFromFriend: boolean }>,
) {
  if (!userId || items.length === 0) return;
  const prev = getUserChatPrefs(userId);
  let mutatedDms: Record<string, DmLocalPrefs> | null = null;

  for (const { friendId, createdAt, isFromFriend } of items) {
    if (!friendId || !createdAt) continue;
    const currentMap = mutatedDms ?? prev.dms;
    const existing = currentMap[friendId];
    if (!existing) {
      if (!mutatedDms) mutatedDms = { ...prev.dms };
      mutatedDms[friendId] = {
        lastReadAt: createdAt,
        unreadTimestamps: [],
      };
      continue;
    }
    if (!isFromFriend || createdAt <= existing.lastReadAt) continue;
    if (existing.unreadTimestamps.includes(createdAt)) continue;
    const nextTimestamps = [...existing.unreadTimestamps, createdAt]
      .filter((t) => t > existing.lastReadAt)
      .slice(-99);
    if (!mutatedDms) mutatedDms = { ...prev.dms };
    mutatedDms[friendId] = {
      ...existing,
      unreadTimestamps: nextTimestamps,
    };
  }

  if (mutatedDms) {
    saveUserChatPrefs(userId, {
      ...prev,
      dms: mutatedDms,
    });
  }
}

let lastSyncedNativePayload = "";

export function syncSuppressedPushTargetsToNative(params: {
  dmIds: string[];
  groupIds: string[];
  communityMuted: boolean;
}) {
  if (!Capacitor.isNativePlatform()) return;
  const payload = JSON.stringify({
    dmIds: [...new Set(params.dmIds)].sort(),
    groupIds: [...new Set(params.groupIds)].sort(),
    communityMuted: Boolean(params.communityMuted),
  });
  if (payload === lastSyncedNativePayload) return;
  lastSyncedNativePayload = payload;
  void JaTextNative.setAuthStorageItem({
    key: SUPPRESSED_PUSH_KEY,
    value: payload,
  }).catch(() => undefined);
}
