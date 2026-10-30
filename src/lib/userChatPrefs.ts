import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { JaTextNative } from "./nativeBridge";

export interface GroupLocalPrefs {
  isSilenced: boolean;
  isArchived: boolean;
  lastReadAt: number;
  unreadTimestamps: number[];
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

export function markLocalCommunityRead(userId: string, readAt?: number) {
  const prev = getUserChatPrefs(userId);
  const ts = Math.max(Date.now(), readAt ?? 0, prev.communityLastReadAt);
  if (ts === prev.communityLastReadAt) return;
  saveUserChatPrefs(userId, {
    ...prev,
    communityLastReadAt: ts,
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
    lastReadAt: prev.initializedAt || Date.now(),
    unreadTimestamps: [],
  };
  const nextGroup: GroupLocalPrefs = {
    ...existing,
    ...(patch.isSilenced !== undefined ? { isSilenced: patch.isSilenced } : {}),
    ...(patch.isArchived !== undefined ? { isArchived: patch.isArchived } : {}),
  };
  saveUserChatPrefs(userId, {
    ...prev,
    groups: {
      ...prev.groups,
      [groupId]: nextGroup,
    },
  });
}

export function markLocalGroupRead(userId: string, groupId: string, readAt?: number) {
  const prev = getUserChatPrefs(userId);
  const existing = prev.groups[groupId] ?? {
    isSilenced: false,
    isArchived: false,
    lastReadAt: prev.initializedAt || Date.now(),
    unreadTimestamps: [],
  };
  const nextReadAt = Math.max(Date.now(), readAt ?? 0, existing.lastReadAt);
  if (nextReadAt === existing.lastReadAt && existing.unreadTimestamps.length === 0) return;
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

export function recordIncomingGroupSummary(
  userId: string,
  groupId: string,
  lastMessageAt: number,
  isFromOther: boolean,
) {
  if (!userId || !groupId || !lastMessageAt) return;
  const prev = getUserChatPrefs(userId);
  const existing = prev.groups[groupId];
  if (!existing) {
    // Seed initial baseline on first observation so old group history isn't flagged unread
    saveUserChatPrefs(userId, {
      ...prev,
      groups: {
        ...prev.groups,
        [groupId]: {
          isSilenced: false,
          isArchived: false,
          lastReadAt: lastMessageAt,
          unreadTimestamps: [],
        },
      },
    });
    return;
  }
  if (!isFromOther || lastMessageAt <= existing.lastReadAt) return;
  if (existing.unreadTimestamps.includes(lastMessageAt)) return;
  const nextTimestamps = [...existing.unreadTimestamps, lastMessageAt]
    .filter((t) => t > existing.lastReadAt)
    .slice(-99);
  saveUserChatPrefs(userId, {
    ...prev,
    groups: {
      ...prev.groups,
      [groupId]: {
        ...existing,
        unreadTimestamps: nextTimestamps,
      },
    },
  });
}

export function markLocalDmRead(userId: string, friendId: string, readAt?: number) {
  if (!userId || !friendId) return;
  const prev = getUserChatPrefs(userId);
  const existing = prev.dms[friendId] ?? {
    lastReadAt: prev.initializedAt || Date.now(),
    unreadTimestamps: [],
  };
  const nextReadAt = Math.max(Date.now(), readAt ?? 0, existing.lastReadAt);
  if (nextReadAt === existing.lastReadAt && existing.unreadTimestamps.length === 0) return;
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

export function recordIncomingDmPreview(
  userId: string,
  friendId: string,
  createdAt: number,
  isFromFriend: boolean,
) {
  if (!userId || !friendId || !createdAt) return;
  const prev = getUserChatPrefs(userId);
  const existing = prev.dms[friendId];
  if (!existing) {
    saveUserChatPrefs(userId, {
      ...prev,
      dms: {
        ...prev.dms,
        [friendId]: {
          lastReadAt: createdAt,
          unreadTimestamps: [],
        },
      },
    });
    return;
  }
  if (!isFromFriend || createdAt <= existing.lastReadAt) return;
  if (existing.unreadTimestamps.includes(createdAt)) return;
  const nextTimestamps = [...existing.unreadTimestamps, createdAt]
    .filter((t) => t > existing.lastReadAt)
    .slice(-99);
  saveUserChatPrefs(userId, {
    ...prev,
    dms: {
      ...prev.dms,
      [friendId]: {
        ...existing,
        unreadTimestamps: nextTimestamps,
      },
    },
  });
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
