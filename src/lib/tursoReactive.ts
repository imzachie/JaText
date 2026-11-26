import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  ACCOUNT_SLOT_CHANGE_EVENT,
  SLOT_AUTH_INVALIDATED_EVENT,
  getTursoTokenForSlotSync,
  setTursoTokenForSlot,
} from "./accountManager";
import {
  PUBLIC_TURSO_API_ORIGIN,
  captureUrlOAuthCallbackIfPresent,
  getTursoApiBase,
  hasInFlightTursoMutation,
  isInTursoActivityBurst,
  resolveSlotToken,
  subscribeTursoSyncWake,
  triggerImmediateTursoSync,
  tursoRpc,
  uploadMediaToTurso,
} from "./tursoClient";
import {
  prewarmDecryptedDmBatch,
  prewarmDecryptedGroupBatch,
} from "./e2ee/messagePipeline";
import { registerCommunitySeedEpoch } from "./e2ee/keystore";
import { removeMessageFromConversationCache } from "./chatCache";
import { ingestServerChatOrganization, type ChatOrganizationState } from "./chatOrganization";
import { isAuthorizedIosChatsRuntime } from "./iosDetection";
import {
  ingestServerSoundboards,
  signInWithPasskeyInBrowser,
  type CustomSoundboardClip,
} from "./securityClient";
import {
  EmailVerificationRequiredError,
  setPendingEmailVerificationChallenge,
  setPendingTwoFactorChallenge,
  TwoFactorRequiredError,
} from "./tursoClient";
import { ingestServerOpenedViewOnceIds } from "./viewOnce";
import { OAUTH_RETURN_CHATS_FLAG, OAUTH_RETURN_IOS_CHATS_FLAG } from "./webRoute";
import { OFFICIAL_COMMUNITY_ID } from "./types";
import type {
  ChatMessage,
  ChatPreview,
  ChatTypingUser,
  CommunityMessage,
  CommunityUser,
  ExploreCommunitySummary,
  FriendActivity,
  FriendRequest,
  GroupDetails,
  GroupMessage,
  GroupReadReceipt,
  GroupSummary,
  JaUser,
  PollVoter,
  ScheduledMessage,
  ScheduledTargetKind,
  StickerMedia,
} from "./types";

interface BootstrapResponse {
  serverTime: number;
  me: JaUser;
  friends: JaUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blockedUserIds: string[];
  previews: ChatPreview[];
  friendActivities: FriendActivity[];
  stickerFavorites: StickerMedia[];
  recentStickers: StickerMedia[];
  communityPermissions: { isOwner: boolean; canModerate: boolean; moderatorIds: string[] };
  communityDirectory: CommunityUser[];
  communityMuted: boolean;
  communityMessages: CommunityMessage[];
  communityHasMore?: boolean;
  groups: GroupSummary[];
  exploreCommunities?: ExploreCommunitySummary[];
  hasRemoteE2EEVault: boolean;
  remoteVaultKeyId: string | null;
  openedViewOnceIds?: string[];
  soundboards?: CustomSoundboardClip[];
  chatOrganization?: Partial<ChatOrganizationState>;
}

interface SyncResponse {
  serverTime: number;
  me?: JaUser;
  social?: {
    friends: JaUser[];
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
    blockedUserIds: string[];
    previews: ChatPreview[];
    friendActivities: FriendActivity[];
  };
  changedDmMessages?: ChatMessage[];
  changedGroupMessages?: GroupMessage[];
  changedCommunityMessages?: CommunityMessage[];
  groups?: GroupSummary[];
  exploreCommunities?: ExploreCommunitySummary[];
  groupReadReceipts?: GroupReadReceipt[];
  stickers?: {
    stickerFavorites: StickerMedia[];
    recentStickers: StickerMedia[];
  };
  dmTypingUserIds?: string[];
  typingByGroup?: Record<string, ChatTypingUser[]>;
  groupTypingUsers: ChatTypingUser[];
  communityTypingUsers: ChatTypingUser[];
}

function sameJsonValue<T>(prev: T, next: T): boolean {
  if (Object.is(prev, next)) return true;
  if (prev == null || next == null) return false;
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length === 0 && next.length === 0) return true;
    if (prev.length !== next.length) return false;
  }
  try {
    return JSON.stringify(prev) === JSON.stringify(next);
  } catch {
    return false;
  }
}

function mergeMessagesById<T extends { id: string; createdAt: number }>(
  prev: T[] | undefined,
  incoming: T[],
): T[] {
  if (!incoming.length) return prev ?? [];
  if (prev && prev.length > 0) {
    const map = new Map<string, T>();
    for (const m of prev) {
      map.set(m.id, m);
    }
    let anyChanged = false;
    for (const m of incoming) {
      const existing = map.get(m.id);
      if (!existing || !sameJsonValue(existing, m)) {
        map.set(m.id, m);
        anyChanged = true;
      }
    }
    if (!anyChanged) return prev;
    return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  const map = new Map<string, T>();
  for (const m of incoming) {
    map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
}

const handledAndroidTokens = new Set<string>();
const MAX_PERSISTED_DELETED_IDS = 600;

function readDeletedForMeIds(slotId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(`jatext:deleted-for-me:v1:${slotId}`);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

function writeDeletedForMeIds(slotId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const arr = [...ids].slice(-MAX_PERSISTED_DELETED_IDS);
    window.localStorage.setItem(`jatext:deleted-for-me:v1:${slotId}`, JSON.stringify(arr));
  } catch {
    // ignore storage quota errors
  }
}

export function useTursoReactiveSession(
  slotId: string,
  activeChatId: string | null,
  activeGroupId: string | null,
) {
  const [authLoading, setAuthLoading] = useState<boolean>(() =>
    Boolean(getTursoTokenForSlotSync(slotId)),
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    Boolean(getTursoTokenForSlotSync(slotId)),
  );

  const [meQuery, setMeQuery] = useState<JaUser | null | undefined>(undefined);
  const [previewsQuery, setPreviewsQuery] = useState<ChatPreview[] | undefined>(undefined);
  const [rawFriendsQuery, setRawFriendsQuery] = useState<JaUser[] | undefined>(undefined);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [friendActivities, setFriendActivities] = useState<FriendActivity[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [stickerLibrary, setStickerLibrary] = useState<
    { favorites: StickerMedia[]; recent: StickerMedia[] } | undefined
  >(undefined);
  const [communityPermissions, setCommunityPermissions] = useState<{
    isOwner: boolean;
    canModerate: boolean;
    moderatorIds: string[];
  }>({ isOwner: false, canModerate: false, moderatorIds: [] });
  const [communityDirectory, setCommunityDirectory] = useState<CommunityUser[]>([]);
  const [communityMessagesQuery, setCommunityMessagesQuery] = useState<
    CommunityMessage[] | undefined
  >(undefined);
  const [communityTypingUsers, setCommunityTypingUsers] = useState<ChatTypingUser[]>([]);
  const [groupsQuery, setGroupsQuery] = useState<GroupSummary[] | undefined>(undefined);
  const [exploreCommunitiesQuery, setExploreCommunitiesQuery] = useState<ExploreCommunitySummary[]>(
    [],
  );
  const [activeMessagesQuery, setActiveMessagesQuery] = useState<ChatMessage[] | undefined>(
    undefined,
  );
  const [groupDetailsQuery, setGroupDetailsQuery] = useState<
    GroupDetails | null | undefined
  >(undefined);
  const [groupMessagesQuery, setGroupMessagesQuery] = useState<GroupMessage[] | undefined>(
    undefined,
  );
  const [groupTypingUsers, setGroupTypingUsers] = useState<ChatTypingUser[]>([]);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreOlderGroupMessages, setHasMoreOlderGroupMessages] = useState(false);
  const [loadingOlderGroupMessages, setLoadingOlderGroupMessages] = useState(false);
  const [hasMoreOlderCommunityMessages, setHasMoreOlderCommunityMessages] = useState(false);
  const [loadingOlderCommunityMessages, setLoadingOlderCommunityMessages] = useState(false);
  const [serverHasRemoteVault, setServerHasRemoteVault] = useState(false);
  const [serverRemoteVaultKeyId, setServerRemoteVaultKeyId] = useState<string | null>(null);

  const sinceTsRef = useRef<number>(0);
  const lastPresenceBeatRef = useRef<number>(0);
  const syncInFlightRef = useRef<boolean>(false);
  const pendingWakeRef = useRef<boolean>(false);
  const slotIdRef = useRef(slotId);
  slotIdRef.current = slotId;
  const activeChatRef = useRef(activeChatId);
  activeChatRef.current = activeChatId;
  const activeGroupRef = useRef(activeGroupId);
  activeGroupRef.current = activeGroupId;
  const activeMessagesRef = useRef(activeMessagesQuery);
  activeMessagesRef.current = activeMessagesQuery;
  const groupMessagesRef = useRef(groupMessagesQuery);
  groupMessagesRef.current = groupMessagesQuery;
  const communityMessagesRef = useRef(communityMessagesQuery);
  communityMessagesRef.current = communityMessagesQuery;
  const deletedForMeIdsRef = useRef<Set<string>>(readDeletedForMeIds(slotId));

  const markDeletedForMe = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      deletedForMeIdsRef.current.add(messageId);
      writeDeletedForMeIds(slotIdRef.current, deletedForMeIdsRef.current);
      removeMessageFromConversationCache(slotIdRef.current, messageId);
    },
    [],
  );

  const unmarkDeletedForMe = useCallback(
    (messageId: string) => {
      if (!messageId) return;
      if (deletedForMeIdsRef.current.delete(messageId)) {
        writeDeletedForMeIds(slotIdRef.current, deletedForMeIdsRef.current);
      }
    },
    [],
  );

  const resetSessionState = useCallback(() => {
    sinceTsRef.current = 0;
    pendingWakeRef.current = false;
    setMeQuery(undefined);
    setPreviewsQuery(undefined);
    setRawFriendsQuery(undefined);
    setIncoming([]);
    setOutgoing([]);
    setFriendActivities([]);
    setBlockedUserIds([]);
    setStickerLibrary(undefined);
    setCommunityPermissions({ isOwner: false, canModerate: false, moderatorIds: [] });
    setCommunityDirectory([]);
    setCommunityMessagesQuery(undefined);
    setCommunityTypingUsers([]);
    setGroupsQuery(undefined);
    setExploreCommunitiesQuery([]);
    setActiveMessagesQuery(undefined);
    setGroupDetailsQuery(undefined);
    setGroupMessagesQuery(undefined);
    setGroupTypingUsers([]);
    setHasMoreOlderMessages(false);
    setLoadingOlderMessages(false);
    setHasMoreOlderGroupMessages(false);
    setLoadingOlderGroupMessages(false);
    setHasMoreOlderCommunityMessages(false);
    setLoadingOlderCommunityMessages(false);
    setServerHasRemoteVault(false);
    setServerRemoteVaultKeyId(null);
  }, []);

  const applyBootstrap = useCallback((boot: BootstrapResponse) => {
    sinceTsRef.current = boot.serverTime || Date.now();
    lastPresenceBeatRef.current = Date.now();
    setMeQuery(boot.me);
    setRawFriendsQuery(boot.friends);
    setIncoming(boot.incoming);
    setOutgoing(boot.outgoing);
    setBlockedUserIds(boot.blockedUserIds);
    setPreviewsQuery(boot.previews);
    setFriendActivities(boot.friendActivities);
    setStickerLibrary({
      favorites: boot.stickerFavorites,
      recent: boot.recentStickers,
    });
    setCommunityPermissions(boot.communityPermissions);
    setCommunityDirectory(boot.communityDirectory);
    setCommunityMessagesQuery(
      (boot.communityMessages ?? []).filter(
        (m) => !deletedForMeIdsRef.current.has(m.id) && !m.deleted && m.type !== "deleted",
      ),
    );
    setHasMoreOlderCommunityMessages(Boolean(boot.communityHasMore));
    for (const grp of boot.groups ?? []) {
      if (grp.communityKeySeed) {
        void registerCommunitySeedEpoch(grp.id, grp.communityKeySeed);
      }
    }
    setGroupsQuery(boot.groups);
    setExploreCommunitiesQuery(boot.exploreCommunities ?? []);
    setServerHasRemoteVault(Boolean(boot.hasRemoteE2EEVault));
    setServerRemoteVaultKeyId(boot.remoteVaultKeyId);
    ingestServerOpenedViewOnceIds(boot.openedViewOnceIds);
    ingestServerSoundboards(boot.soundboards);
    ingestServerChatOrganization(boot.chatOrganization);
  }, []);

  const runBootstrap = useCallback(
    async (targetSlot = slotIdRef.current) => {
      await captureUrlOAuthCallbackIfPresent(targetSlot);
      const token = await resolveSlotToken(targetSlot);
      if (!token) {
        if (slotIdRef.current === targetSlot) {
          setIsAuthenticated(false);
          setAuthLoading(false);
          resetSessionState();
        }
        return;
      }
      if (slotIdRef.current === targetSlot) {
        setIsAuthenticated(true);
      }
      try {
        const boot = await tursoRpc<BootstrapResponse>("bootstrap", {}, { slotId: targetSlot });
        if (slotIdRef.current !== targetSlot) return;
        applyBootstrap(boot);
        setIsAuthenticated(true);
        setAuthLoading(false);
      } catch {
        if (slotIdRef.current !== targetSlot) return;
        const stillHasToken = Boolean(getTursoTokenForSlotSync(targetSlot));
        setIsAuthenticated(stillHasToken);
        setAuthLoading(false);
      }
    },
    [applyBootstrap, resetSessionState],
  );

  // Slot switch & initial bootstrap
  useEffect(() => {
    resetSessionState();
    const hasSyncToken = Boolean(getTursoTokenForSlotSync(slotId));
    setIsAuthenticated(hasSyncToken);
    setAuthLoading(true);
    void runBootstrap(slotId);
  }, [resetSessionState, runBootstrap, slotId]);

  // Listen for auth invalidation or slot switches
  useEffect(() => {
    const onInvalidated = (e: Event) => {
      const detailSlot = (e as CustomEvent<string>).detail;
      if (!detailSlot || detailSlot === slotIdRef.current) {
        setIsAuthenticated(false);
        setAuthLoading(false);
        resetSessionState();
      }
    };
    const onSlotChange = () => {
      void runBootstrap(slotIdRef.current);
    };
    window.addEventListener(SLOT_AUTH_INVALIDATED_EVENT, onInvalidated);
    window.addEventListener(ACCOUNT_SLOT_CHANGE_EVENT, onSlotChange);
    return () => {
      window.removeEventListener(SLOT_AUTH_INVALIDATED_EVENT, onInvalidated);
      window.removeEventListener(ACCOUNT_SLOT_CHANGE_EVENT, onSlotChange);
    };
  }, [resetSessionState, runBootstrap]);

  // Android Google OAuth deep-link callback (`com.ahad00010.jatext://auth?tursoToken=...`)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handleAuthUrl = async (rawUrl: string) => {
      try {
        const callback = new URL(rawUrl);
        if (callback.protocol !== "com.ahad00010.jatext:" || callback.hostname !== "auth") {
          return;
        }
        const tursoToken = callback.searchParams.get("tursoToken");
        await Browser.close().catch(() => undefined);
        if (tursoToken && !handledAndroidTokens.has(tursoToken)) {
          handledAndroidTokens.add(tursoToken);
          await setTursoTokenForSlot(slotIdRef.current, tursoToken, PUBLIC_TURSO_API_ORIGIN);
          setIsAuthenticated(true);
          setAuthLoading(true);
          await runBootstrap(slotIdRef.current);
        }
      } catch {
        // ignore malformed deep link
      }
    };

    let listener: PluginListenerHandle | undefined;
    void App.addListener("appUrlOpen", ({ url }) => {
      void handleAuthUrl(url);
    })
      .then((h) => {
        listener = h;
        return App.getLaunchUrl();
      })
      .then((launch) => {
        if (launch?.url) void handleAuthUrl(launch.url);
      })
      .catch(() => undefined);

    return () => {
      if (listener) void listener.remove();
    };
  }, [runBootstrap]);

  // Load active 1:1 DM messages when activeChatId changes
  useEffect(() => {
    if (!isAuthenticated || !activeChatId || activeChatId === OFFICIAL_COMMUNITY_ID) {
      setActiveMessagesQuery(undefined);
      setHasMoreOlderMessages(false);
      setLoadingOlderMessages(false);
      return;
    }
    let cancelled = false;
    let retryTimer: number | null = null;
    setActiveMessagesQuery(undefined);
    setHasMoreOlderMessages(false);
    setLoadingOlderMessages(false);
    const loadDm = (attempt: number) => {
      void tursoRpc<{ messages: ChatMessage[]; hasMore?: boolean }>(
        "listMessages",
        { otherId: activeChatId },
        { slotId },
      )
        .then(async (res) => {
          if (cancelled) return;
          const visible = (res.messages ?? []).filter(
            (m) => !deletedForMeIdsRef.current.has(m.id),
          );
          await prewarmDecryptedDmBatch(visible);
          if (!cancelled) {
            setActiveMessagesQuery(
              visible.filter((m) => !deletedForMeIdsRef.current.has(m.id)),
            );
            setHasMoreOlderMessages(Boolean(res.hasMore));
          }
        })
        .catch(() => {
          if (!cancelled && attempt === 0) {
            retryTimer = window.setTimeout(() => loadDm(1), 650);
          }
        });
    };
    loadDm(0);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [activeChatId, isAuthenticated, slotId]);

  // Load active Group details + messages when activeGroupId changes
  useEffect(() => {
    if (!isAuthenticated || !activeGroupId) {
      setGroupDetailsQuery(undefined);
      setGroupMessagesQuery(undefined);
      setGroupTypingUsers([]);
      setHasMoreOlderGroupMessages(false);
      setLoadingOlderGroupMessages(false);
      return;
    }
    let cancelled = false;
    let retryTimer: number | null = null;
    setGroupDetailsQuery(undefined);
    setGroupMessagesQuery(undefined);
    setHasMoreOlderGroupMessages(false);
    setLoadingOlderGroupMessages(false);
    const loadGroup = (attempt: number) => {
      void Promise.all([
        tursoRpc<{ details: GroupDetails | null }>(
          "getGroupDetails",
          { groupId: activeGroupId },
          { slotId },
        ),
        tursoRpc<{ messages: GroupMessage[]; hasMore?: boolean; readReceipts?: GroupReadReceipt[] }>(
          "listGroupMessages",
          { groupId: activeGroupId },
          { slotId },
        ),
      ])
        .then(async ([detRes, msgRes]) => {
          if (cancelled) return;
          if (detRes.details?.communityKeySeed) {
            try {
              await registerCommunitySeedEpoch(activeGroupId, detRes.details.communityKeySeed);
            } catch {
              // Never block loading community details/messages if WebCrypto seed registration fails
            }
          }
          const visible = (msgRes.messages ?? []).filter(
            (m) => !deletedForMeIdsRef.current.has(m.id),
          );
          try {
            await prewarmDecryptedGroupBatch(visible, activeGroupId);
          } catch {
            // Render messages even if batch prewarm encounters a malformed wire payload
          }
          if (cancelled) return;
          const hydratedDetails = detRes.details
            ? {
                ...detRes.details,
                readReceipts: msgRes.readReceipts ?? detRes.details.readReceipts ?? [],
              }
            : null;
          setGroupDetailsQuery(hydratedDetails);
          setGroupMessagesQuery(
            visible.filter((m) => !deletedForMeIdsRef.current.has(m.id)),
          );
          setHasMoreOlderGroupMessages(Boolean(msgRes.hasMore));
        })
        .catch(() => {
          if (!cancelled && attempt === 0) {
            retryTimer = window.setTimeout(() => loadGroup(1), 650);
          }
        });
    };
    loadGroup(0);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [activeGroupId, isAuthenticated, slotId]);

  const loadOlderMessages = useCallback(async (): Promise<number> => {
    const curChat = activeChatRef.current;
    if (!isAuthenticated || !curChat || curChat === OFFICIAL_COMMUNITY_ID) return 0;
    const current = activeMessagesRef.current ?? [];
    if (!current.length) return 0;
    const oldestTs = current.reduce(
      (min, m) => (m.createdAt > 0 && m.createdAt < min ? m.createdAt : min),
      Infinity,
    );
    if (!Number.isFinite(oldestTs)) return 0;
    setLoadingOlderMessages(true);
    try {
      const res = await tursoRpc<{ messages: ChatMessage[]; hasMore?: boolean }>(
        "listMessages",
        { otherId: curChat, beforeTs: oldestTs, limit: 120 },
        { slotId: slotIdRef.current },
      );
      if (activeChatRef.current !== curChat) return 0;
      const incomingOlder = (res.messages ?? []).filter(
        (m) => !deletedForMeIdsRef.current.has(m.id),
      );
      setHasMoreOlderMessages(Boolean(res.hasMore));
      if (!incomingOlder.length) return 0;
      await prewarmDecryptedDmBatch(incomingOlder);
      if (activeChatRef.current !== curChat) return 0;
      const beforeCount = (activeMessagesRef.current ?? []).length;
      const merged = mergeMessagesById(
        incomingOlder.filter((m) => !deletedForMeIdsRef.current.has(m.id)),
        (activeMessagesRef.current ?? []).filter((m) => !deletedForMeIdsRef.current.has(m.id)),
      );
      setActiveMessagesQuery(merged);
      return Math.max(0, merged.length - beforeCount);
    } catch {
      return 0;
    } finally {
      if (activeChatRef.current === curChat) {
        setLoadingOlderMessages(false);
      }
    }
  }, [isAuthenticated]);

  const loadOlderGroupMessages = useCallback(async (): Promise<number> => {
    const curGroup = activeGroupRef.current;
    if (!isAuthenticated || !curGroup) return 0;
    const current = groupMessagesRef.current ?? [];
    if (!current.length) return 0;
    const oldestTs = current.reduce(
      (min, m) => (m.createdAt > 0 && m.createdAt < min ? m.createdAt : min),
      Infinity,
    );
    if (!Number.isFinite(oldestTs)) return 0;
    setLoadingOlderGroupMessages(true);
    try {
      const res = await tursoRpc<{ messages: GroupMessage[]; hasMore?: boolean }>(
        "listGroupMessages",
        { groupId: curGroup, beforeTs: oldestTs, limit: 120 },
        { slotId: slotIdRef.current },
      );
      if (activeGroupRef.current !== curGroup) return 0;
      const incomingOlder = (res.messages ?? []).filter(
        (m) => !deletedForMeIdsRef.current.has(m.id),
      );
      setHasMoreOlderGroupMessages(Boolean(res.hasMore));
      if (!incomingOlder.length) return 0;
      await prewarmDecryptedGroupBatch(incomingOlder, curGroup);
      if (activeGroupRef.current !== curGroup) return 0;
      const beforeCount = (groupMessagesRef.current ?? []).length;
      const merged = mergeMessagesById(
        incomingOlder.filter((m) => !deletedForMeIdsRef.current.has(m.id)),
        (groupMessagesRef.current ?? []).filter((m) => !deletedForMeIdsRef.current.has(m.id)),
      );
      setGroupMessagesQuery(merged);
      return Math.max(0, merged.length - beforeCount);
    } catch {
      return 0;
    } finally {
      if (activeGroupRef.current === curGroup) {
        setLoadingOlderGroupMessages(false);
      }
    }
  }, [isAuthenticated]);

  const loadOlderCommunityMessages = useCallback(async (): Promise<number> => {
    if (!isAuthenticated) return 0;
    const current = communityMessagesRef.current ?? [];
    if (!current.length) return 0;
    const oldestTs = current.reduce(
      (min, m) => (m.createdAt > 0 && m.createdAt < min ? m.createdAt : min),
      Infinity,
    );
    if (!Number.isFinite(oldestTs)) return 0;
    setLoadingOlderCommunityMessages(true);
    try {
      const res = await tursoRpc<{ messages: CommunityMessage[]; hasMore?: boolean }>(
        "listCommunityMessages",
        { beforeTs: oldestTs, limit: 120 },
        { slotId: slotIdRef.current },
      );
      const incomingOlder = (res.messages ?? []).filter(
        (m) => !deletedForMeIdsRef.current.has(m.id),
      );
      setHasMoreOlderCommunityMessages(Boolean(res.hasMore));
      if (!incomingOlder.length) return 0;
      const beforeCount = (communityMessagesRef.current ?? []).length;
      const merged = mergeMessagesById(
        incomingOlder,
        (communityMessagesRef.current ?? []).filter((m) => !deletedForMeIdsRef.current.has(m.id)),
      );
      setCommunityMessagesQuery(merged);
      return Math.max(0, merged.length - beforeCount);
    } catch {
      return 0;
    } finally {
      setLoadingOlderCommunityMessages(false);
    }
  }, [isAuthenticated]);

  // Adaptive Foreground + Desktop Background Delta Sync Engine
  const runDeltaSync = useCallback(async () => {
    if (!isAuthenticated) return;
    // On Native Android, FCM handles background notifications while hidden; on Desktop Web, keep syncing!
    if (Capacitor.isNativePlatform() && typeof document !== "undefined" && document.hidden) {
      return;
    }
    if (!sinceTsRef.current) return;
    if (syncInFlightRef.current || hasInFlightTursoMutation()) {
      // Yield network priority to user mutations (send/unsend) and run immediately after!
      pendingWakeRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    const targetSlot = slotIdRef.current;
    const curChat = activeChatRef.current;
    const curGroup = activeGroupRef.current;
    const now = Date.now();
    const shouldBeat = now - lastPresenceBeatRef.current >= 25_000;
    if (shouldBeat) lastPresenceBeatRef.current = now;

    try {
      const res = await tursoRpc<SyncResponse>(
        "sync",
        {
          sinceTs: sinceTsRef.current,
          activeFriendId: curChat && curChat !== OFFICIAL_COMMUNITY_ID ? curChat : null,
          activeGroupId: curGroup,
          includeCommunity: curChat === OFFICIAL_COMMUNITY_ID,
          touchPresence: shouldBeat,
          includePresence: shouldBeat,
        },
        { slotId: targetSlot },
      );
      if (slotIdRef.current !== targetSlot) return;
      sinceTsRef.current = res.serverTime || Date.now();

      if (res.changedDmMessages?.length && activeChatRef.current === curChat) {
        await prewarmDecryptedDmBatch(res.changedDmMessages);
      }
      if (res.changedGroupMessages?.length && curGroup && activeGroupRef.current === curGroup) {
        await prewarmDecryptedGroupBatch(res.changedGroupMessages, curGroup);
      }
      if (slotIdRef.current !== targetSlot) return;

      if (res.me) {
        const nextMe = res.me;
        setMeQuery((prev) => (prev && sameJsonValue(prev, nextMe) ? prev : nextMe));
      }
      if (res.social) {
        const soc = res.social;
        const dmSet = new Set(res.dmTypingUserIds ?? []);
        const patchedActivities = soc.friendActivities.map((a) =>
          dmSet.has(a.userId) && !a.isTyping ? { ...a, isTyping: true } : a,
        );
        setRawFriendsQuery((prev) =>
          prev && sameJsonValue(prev, soc.friends) ? prev : soc.friends,
        );
        setIncoming((prev) => (sameJsonValue(prev, soc.incoming) ? prev : soc.incoming));
        setOutgoing((prev) => (sameJsonValue(prev, soc.outgoing) ? prev : soc.outgoing));
        setBlockedUserIds((prev) =>
          sameJsonValue(prev, soc.blockedUserIds) ? prev : soc.blockedUserIds,
        );
        setPreviewsQuery((prev) =>
          sameJsonValue(prev, soc.previews) ? prev : soc.previews,
        );
        setFriendActivities((prev) =>
          sameJsonValue(prev, patchedActivities) ? prev : patchedActivities,
        );
      } else if (Array.isArray(res.dmTypingUserIds)) {
        const dmSet = new Set(res.dmTypingUserIds);
        setFriendActivities((prev) => {
          if (!prev) return prev;
          let changed = false;
          const next = prev.map((a) => {
            const nextTyping = dmSet.has(a.userId);
            if (Boolean(a.isTyping) !== nextTyping) {
              changed = true;
              return { ...a, isTyping: nextTyping };
            }
            return a;
          });
          return changed ? next : prev;
        });
      }
      if (res.changedDmMessages?.length && activeChatRef.current === curChat) {
        const visibleDm = res.changedDmMessages.filter(
          (m) => !deletedForMeIdsRef.current.has(m.id),
        );
        if (visibleDm.length) {
          setActiveMessagesQuery((prev) =>
            mergeMessagesById(
              prev?.filter((m) => !deletedForMeIdsRef.current.has(m.id)),
              visibleDm,
            ),
          );
        }
      }
      if (res.changedGroupMessages?.length && activeGroupRef.current === curGroup) {
        const visibleGroup = res.changedGroupMessages.filter(
          (m) => !deletedForMeIdsRef.current.has(m.id),
        );
        if (visibleGroup.length) {
          setGroupMessagesQuery((prev) =>
            mergeMessagesById(
              prev?.filter((m) => !deletedForMeIdsRef.current.has(m.id)),
              visibleGroup,
            ),
          );
        }
      }
      if (res.changedCommunityMessages?.length) {
        const hardDeletedIds = new Set(
          res.changedCommunityMessages
            .filter((m) => m.deleted || m.type === "deleted")
            .map((m) => m.id),
        );
        const visibleComm = res.changedCommunityMessages.filter(
          (m) => !deletedForMeIdsRef.current.has(m.id) && !m.deleted && m.type !== "deleted",
        );
        if (hardDeletedIds.size > 0 || visibleComm.length > 0) {
          setCommunityMessagesQuery((prev) =>
            mergeMessagesById(
              prev?.filter(
                (m) =>
                  !deletedForMeIdsRef.current.has(m.id) &&
                  !hardDeletedIds.has(m.id) &&
                  !m.deleted &&
                  m.type !== "deleted",
              ),
              visibleComm,
            ),
          );
        }
      }
      if (res.groups) {
        const nextGroups = res.groups;
        for (const grp of nextGroups) {
          if (grp.communityKeySeed) {
            void registerCommunitySeedEpoch(grp.id, grp.communityKeySeed);
          }
        }
        setGroupsQuery((prev) =>
          prev && sameJsonValue(prev, nextGroups) ? prev : nextGroups,
        );
      }
      if (res.exploreCommunities) {
        const nextExplore = res.exploreCommunities;
        setExploreCommunitiesQuery((prev) =>
          sameJsonValue(prev, nextExplore) ? prev : nextExplore,
        );
      }
      if (res.groupReadReceipts && curGroup && activeGroupRef.current === curGroup) {
        const nextReceipts = res.groupReadReceipts;
        setGroupDetailsQuery((prev) => {
          if (!prev || prev.id !== curGroup) return prev;
          if (sameJsonValue(prev.readReceipts ?? [], nextReceipts)) return prev;
          return { ...prev, readReceipts: nextReceipts };
        });
      }
      if (res.stickers) {
        const nextStickers = {
          favorites: res.stickers.stickerFavorites,
          recent: res.stickers.recentStickers,
        };
        setStickerLibrary((prev) =>
          prev && sameJsonValue(prev, nextStickers) ? prev : nextStickers,
        );
      }
      const nextGrpTyping = res.groupTypingUsers ?? [];
      setGroupTypingUsers((prev) =>
        sameJsonValue(prev, nextGrpTyping) ? prev : nextGrpTyping,
      );
      const nextCommTyping = res.communityTypingUsers ?? [];
      setCommunityTypingUsers((prev) =>
        sameJsonValue(prev, nextCommTyping) ? prev : nextCommTyping,
      );
    } catch {
      // transient network hiccup; keep cached state intact
    } finally {
      syncInFlightRef.current = false;
      if (pendingWakeRef.current) {
        pendingWakeRef.current = false;
        window.setTimeout(() => {
          void runDeltaSync();
        }, 15);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: number | null = null;
    let cancelled = false;
    let appStateHandle: PluginListenerHandle | undefined;

    const scheduleNext = () => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      const isHiddenWeb =
        !Capacitor.isNativePlatform() &&
        typeof document !== "undefined" &&
        document.hidden;
      const delay = isHiddenWeb
        ? 3200
        : isInTursoActivityBurst()
          ? 500
          : activeChatRef.current || activeGroupRef.current
            ? 950
            : 1800;
      timer = window.setTimeout(async () => {
        await runDeltaSync();
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    const unsubWake = subscribeTursoSyncWake(() => {
      if (timer !== null) window.clearTimeout(timer);
      void runDeltaSync().finally(() => scheduleNext());
    });

    const onImmediateWake = () => {
      if (!document.hidden) {
        triggerImmediateTursoSync(true);
      }
    };
    window.addEventListener("focus", onImmediateWake);
    window.addEventListener("online", onImmediateWake);
    window.addEventListener("jatext:fcm-wake", onImmediateWake);
    document.addEventListener("visibilitychange", onImmediateWake);

    if (Capacitor.isNativePlatform()) {
      void App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          triggerImmediateTursoSync(true);
        }
      })
        .then((h) => {
          if (cancelled) void h.remove();
          else appStateHandle = h;
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      unsubWake();
      if (appStateHandle) void appStateHandle.remove();
      window.removeEventListener("focus", onImmediateWake);
      window.removeEventListener("online", onImmediateWake);
      window.removeEventListener("jatext:fcm-wake", onImmediateWake);
      document.removeEventListener("visibilitychange", onImmediateWake);
    };
  }, [isAuthenticated, runDeltaSync]);

  /* ==================== Auth Actions ==================== */

  const authSignInEmail = useCallback(
    async (email: string, password: string) => {
      const res = await tursoRpc<{
        requiresTwoFactor?: boolean;
        requiresEmailVerification?: boolean;
        challengeToken?: string;
        maskedEmail?: string;
        retryAfterSec?: number;
        email?: string;
        token?: string;
        me?: JaUser;
      }>("signInEmail", { email: email.trim().toLowerCase(), password }, { slotId });
      if (res.requiresTwoFactor && res.challengeToken) {
        setPendingTwoFactorChallenge(res.challengeToken);
        throw new TwoFactorRequiredError(res.challengeToken, res.email || email);
      }
      // Checked before the password is of any use: an account whose address has never
      // been confirmed has no session to hand out yet, whichever device asks.
      if (res.requiresEmailVerification && res.challengeToken) {
        setPendingEmailVerificationChallenge({
          token: res.challengeToken,
          maskedEmail: res.maskedEmail || "",
        });
        throw new EmailVerificationRequiredError(
          res.challengeToken,
          res.maskedEmail || "",
          Number(res.retryAfterSec || 0),
        );
      }
      if (!res.token || !res.me) {
        throw new Error("Sign-in did not return an active session.");
      }
      await setTursoTokenForSlot(slotId, res.token, PUBLIC_TURSO_API_ORIGIN);
      setMeQuery(res.me);
      setIsAuthenticated(true);
      setAuthLoading(false);
      await runBootstrap(slotId);
    },
    [runBootstrap, slotId],
  );

  const authVerifyEmailCode = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await tursoRpc<{ token: string; me: JaUser }>(
        "verifyEmailCode",
        { challengeToken: challengeToken.trim(), code: code.trim() },
        { slotId, skipAuthClear: true },
      );
      setPendingEmailVerificationChallenge(null);
      await setTursoTokenForSlot(slotId, res.token, PUBLIC_TURSO_API_ORIGIN);
      setMeQuery(res.me);
      setIsAuthenticated(true);
      setAuthLoading(false);
      await runBootstrap(slotId);
    },
    [runBootstrap, slotId],
  );

  const authResendEmailCode = useCallback(
    async (challengeToken: string) => {
      const res = await tursoRpc<{ sent?: boolean; retryAfterSec?: number }>(
        "sendEmailVerification",
        { challengeToken: challengeToken.trim() },
        { slotId, skipAuthClear: true },
      );
      // Handed back so the button counts down the number the server actually enforces.
      return { retryAfterSec: Number(res?.retryAfterSec || 0) };
    },
    [slotId],
  );

  const authCompleteTwoFactorLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await tursoRpc<{ token: string; me: JaUser }>(
        "verifyTwoFactorLogin",
        { challengeToken: challengeToken.trim(), code: code.trim() },
        { slotId, skipAuthClear: true },
      );
      setPendingTwoFactorChallenge(null);
      await setTursoTokenForSlot(slotId, res.token, PUBLIC_TURSO_API_ORIGIN);
      setMeQuery(res.me);
      setIsAuthenticated(true);
      setAuthLoading(false);
      await runBootstrap(slotId);
    },
    [runBootstrap, slotId],
  );

  const authSignInPasskey = useCallback(
    async (emailHint?: string) => {
      const res = await signInWithPasskeyInBrowser(emailHint);
      setPendingTwoFactorChallenge(null);
      await setTursoTokenForSlot(slotId, res.token, PUBLIC_TURSO_API_ORIGIN);
      setMeQuery(res.me);
      setIsAuthenticated(true);
      setAuthLoading(false);
      await runBootstrap(slotId);
    },
    [runBootstrap, slotId],
  );

  const authSignUpEmail = useCallback(
    async (email: string, password: string) => {
      const res = await tursoRpc<{
        token?: string;
        me?: JaUser;
        requiresEmailVerification?: boolean;
        challengeToken?: string;
        maskedEmail?: string;
        retryAfterSec?: number;
      }>("signUpEmail", { email: email.trim().toLowerCase(), password }, { slotId });
      // The account exists but is not handed over: onboarding, chats and settings all
      // wait behind the code, which is the point of asking for it.
      if (res.requiresEmailVerification && res.challengeToken) {
        setPendingEmailVerificationChallenge({
          token: res.challengeToken,
          maskedEmail: res.maskedEmail || "",
        });
        throw new EmailVerificationRequiredError(
          res.challengeToken,
          res.maskedEmail || "",
          Number(res.retryAfterSec || 0),
        );
      }
      if (!res.token || !res.me) {
        throw new Error("Sign-up did not return an active session.");
      }
      await setTursoTokenForSlot(slotId, res.token, PUBLIC_TURSO_API_ORIGIN);
      setMeQuery(res.me);
      setIsAuthenticated(true);
      setAuthLoading(false);
      await runBootstrap(slotId);
    },
    [runBootstrap, slotId],
  );

  const authSignInGoogle = useCallback(async () => {
    const base = getTursoApiBase() || window.location.origin;
    if (isAuthorizedIosChatsRuntime()) {
      try {
        window.sessionStorage.setItem(OAUTH_RETURN_IOS_CHATS_FLAG, "1");
      } catch {
        // ignore
      }
      window.location.assign(`${base}/api/oauth-google?action=start&platform=ios_web`);
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      try {
        window.sessionStorage.setItem(OAUTH_RETURN_CHATS_FLAG, "1");
      } catch {
        // ignore
      }
      window.location.assign(`${base}/api/oauth-google?action=start&platform=web`);
      return;
    }
    await Browser.open({
      url: `${PUBLIC_TURSO_API_ORIGIN}/api/oauth-google?action=start&platform=android`,
    });
  }, []);

  const authSignOut = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      if (!isAuthorizedIosChatsRuntime()) {
        await tursoRpc("disconnectLinkedDevice", {}, { slotId, skipAuthClear: true }).catch(
          () => undefined,
        );
      }
      await setTursoTokenForSlot(slotId, "", PUBLIC_TURSO_API_ORIGIN).catch(() => undefined);
      try {
        const tokenKey =
          slotId === "default" ? "jatext:turso-jwt:v1" : `jatext:turso-jwt:v1:${slotId}`;
        window.localStorage.removeItem(tokenKey);
      } catch {
        // ignore
      }
    }
    setIsAuthenticated(false);
    setAuthLoading(false);
    resetSessionState();
  }, [resetSessionState, slotId]);

  const upload = useCallback(
    async (file: File): Promise<string> => uploadMediaToTurso(file, slotId),
    [slotId],
  );

  const hiddenRawDmRef = useRef<Map<string, ChatMessage>>(new Map());
  const hiddenRawGroupRef = useRef<Map<string, GroupMessage>>(new Map());
  const hiddenRawCommunityRef = useRef<Map<string, CommunityMessage>>(new Map());
  const inFlightHideRpcRef = useRef<Map<string, Promise<unknown>>>(new Map());

  /* ==================== Direct Queries & Mutations ==================== */

  const mutations = useMemo(
    () => ({
      saveProfileMut: async (args: {
        displayName: string;
        username: string;
        bio: string;
        pronouns: string;
        avatarColor: string;
        avatarUrl?: string | null;
        bannerUrl?: string | null;
        socials?: JaUser["socials"];
        website?: JaUser["website"] | null;
        syncedTheme?: JaUser["syncedTheme"] | null;
      }) => {
        const res = await tursoRpc<{ me: JaUser }>("saveProfile", args, { slotId });
        setMeQuery(res.me);
        return res.me;
      },

      sendRequestMut: async (args: { username: string }) => {
        await tursoRpc("sendFriendRequest", args, { slotId });
      },

      respondMut: async (args: { requestId: string; accept: boolean }) => {
        await tursoRpc("respondFriendRequest", args, { slotId });
      },

      removeFriendMut: async (args: { friendId: string }) => {
        await tursoRpc("removeFriend", args, { slotId });
      },

      sendMessageMut: async (args: {
        receiverId: string;
        body: string;
        attachmentId?: string;
        attachmentName?: string;
        attachmentType?: string;
        replyToId?: string;
        isSpoiler?: boolean;
      }) => {
        const res = await tursoRpc<{ message: ChatMessage }>(
          "sendMessage",
          {
            receiverId: args.receiverId,
            body: args.body,
            ...(args.attachmentId ? { attachmentUrl: args.attachmentId } : {}),
            ...(args.attachmentName ? { attachmentName: args.attachmentName } : {}),
            ...(args.attachmentType ? { attachmentType: args.attachmentType } : {}),
            ...(args.replyToId ? { replyToId: args.replyToId } : {}),
            ...(args.isSpoiler ? { isSpoiler: true } : {}),
          },
          { slotId },
        );
        if (res.message && activeChatRef.current === args.receiverId) {
          setActiveMessagesQuery((prev) => mergeMessagesById(prev, [res.message]));
        }
        if (
          res.message &&
          !args.body.startsWith("__JATEXT_SIG__:") &&
          !args.body.startsWith("__JATEXT_CALL_SIG__:") &&
          !args.body.startsWith("__JATEXT_REACT__:") &&
          !args.body.startsWith("__JATEXT_SEEN__:")
        ) {
          setPreviewsQuery((prev) => {
            const list = prev ? [...prev] : [];
            const idx = list.findIndex((p) => p.friendId === args.receiverId);
            const nextBody =
              res.message.body ||
              (res.message.attachmentType?.startsWith("audio/")
                ? "Voice note"
                : res.message.attachmentName
                  ? `Attachment: ${res.message.attachmentName}`
                  : "");
            if (idx >= 0) {
              list[idx] = {
                ...list[idx],
                body: nextBody,
                createdAt: res.message.createdAt,
                senderId: res.message.senderId,
              };
            } else {
              list.unshift({
                friendId: args.receiverId,
                body: nextBody,
                createdAt: res.message.createdAt,
                senderId: res.message.senderId,
                unreadCount: 0,
              });
            }
            list.sort((a, b) => b.createdAt - a.createdAt);
            return list;
          });
        }
        return res.message;
      },

      forwardMessageMut: async (args: { messageId: string; receiverId: string }) => {
        const msg = activeMessagesRef.current?.find((m) => m.id === args.messageId);
        await tursoRpc(
          "sendMessage",
          {
            receiverId: args.receiverId,
            body: msg?.body || "",
            ...(msg?.attachmentUrl ? { attachmentUrl: msg.attachmentUrl } : {}),
            ...(msg?.attachmentName ? { attachmentName: msg.attachmentName } : {}),
            ...(msg?.attachmentType ? { attachmentType: msg.attachmentType } : {}),
            forwardedFromId: msg?.senderId,
          },
          { slotId },
        );
      },

      toggleReactionMut: async (args: { messageId: string; emoji: string }) => {
        const res = await tursoRpc<{ reactions: ChatMessage["reactions"] }>(
          "toggleMessageReaction",
          args,
          { slotId },
        );
        setActiveMessagesQuery((prev) =>
          prev?.map((m) => (m.id === args.messageId ? { ...m, reactions: res.reactions } : m)),
        );
      },

      deleteForMeMut: async (args: { messageId: string }) => {
        markDeletedForMe(args.messageId);
        let capturedRaw: ChatMessage | undefined;
        setActiveMessagesQuery((prev) => {
          const found = prev?.find((m) => m.id === args.messageId);
          if (found) {
            capturedRaw = found;
            hiddenRawDmRef.current.set(args.messageId, found);
          }
          return prev?.filter((m) => m.id !== args.messageId);
        });
        const hidePromise = tursoRpc("deleteMessageForMe", args, { slotId }).finally(() => {
          if (inFlightHideRpcRef.current.get(args.messageId) === hidePromise) {
            inFlightHideRpcRef.current.delete(args.messageId);
          }
        });
        inFlightHideRpcRef.current.set(args.messageId, hidePromise);
        try {
          await hidePromise;
        } catch (err) {
          unmarkDeletedForMe(args.messageId);
          if (capturedRaw) {
            setActiveMessagesQuery((prev) => mergeMessagesById(prev ?? [], [capturedRaw!]));
          }
          throw err;
        }
      },

      restoreForMeMut: async (args: { message: ChatMessage }) => {
        unmarkDeletedForMe(args.message.id);
        const rawToRestore = hiddenRawDmRef.current.get(args.message.id) ?? args.message;
        hiddenRawDmRef.current.delete(args.message.id);
        setActiveMessagesQuery((prev) => mergeMessagesById(prev ?? [], [rawToRestore]));
        const pendingHide = inFlightHideRpcRef.current.get(args.message.id);
        if (pendingHide) {
          await pendingHide.catch(() => undefined);
        }
        await tursoRpc("restoreMessageForMe", { messageId: args.message.id }, { slotId });
        unmarkDeletedForMe(args.message.id);
        setActiveMessagesQuery((prev) => mergeMessagesById(prev ?? [], [rawToRestore]));
      },

      unsendMut: async (args: { messageId: string }) => {
        const res = await tursoRpc<{ showUnsendNotice: boolean }>(
          "unsendMessage",
          args,
          { slotId },
        );
        const nowTs = Date.now();
        setActiveMessagesQuery((prev) =>
          prev?.map((m) =>
            m.id === args.messageId
              ? {
                  ...m,
                  body: "",
                  attachmentUrl: undefined,
                  attachmentName: undefined,
                  attachmentType: undefined,
                  unsentAt: nowTs,
                  reactions: [],
                }
              : m,
          ),
        );
        return Boolean(res.showUnsendNotice);
      },

      editMessageMut: async (args: { messageId: string; body: string }) => {
        await tursoRpc("editMessage", args, { slotId });
        setActiveMessagesQuery((prev) =>
          prev?.map((m) =>
            m.id === args.messageId ? { ...m, body: args.body, editedAt: Date.now() } : m,
          ),
        );
      },

      updateConversationMut: async (args: {
        friendId: string;
        archived?: boolean;
        muted?: boolean;
        deleteHistory?: boolean;
      }) => {
        await tursoRpc(
          "setConversationPrefs",
          {
            friendId: args.friendId,
            ...(args.archived !== undefined ? { isArchived: args.archived } : {}),
            ...(args.muted !== undefined ? { isMuted: args.muted } : {}),
            ...(args.deleteHistory ? { deleteHistory: true } : {}),
          },
          { slotId },
        );
        if (args.deleteHistory && activeChatRef.current === args.friendId) {
          setActiveMessagesQuery([]);
        }
      },

      setTypingMut: async (args: { receiverId: string; isTyping: boolean }) => {
        await tursoRpc("setTyping", args, { slotId });
      },

      markReadMut: async (args: { otherId: string }) => {
        setPreviewsQuery((prev) =>
          prev?.map((p) => (p.friendId === args.otherId ? { ...p, unreadCount: 0 } : p)),
        );
        setActiveMessagesQuery((prev) =>
          prev?.map((m) =>
            m.senderId === args.otherId && m.deliveryStatus !== "read"
              ? { ...m, deliveryStatus: "read" }
              : m,
          ),
        );
        await tursoRpc("markMessagesRead", { friendId: args.otherId }, { slotId });
      },

      setBlockMut: async (args: { userId: string; blocked: boolean }) => {
        await tursoRpc(
          "setUserBlocked",
          { friendId: args.userId, blocked: args.blocked },
          { slotId },
        );
      },

      setActivityMut: async (args: { status: string; customStatus: string }) => {
        await tursoRpc("setActivity", args, { slotId });
      },

      heartbeatMut: async (_args?: { active?: boolean }) => {
        // Presence heartbeat is already integrated into Turso delta sync (`touchPresence: true`).
      },

      disconnectMut: async () => {
        await tursoRpc("disconnectPresence", {}, { slotId, skipAuthClear: true }).catch(
          () => undefined,
        );
      },

      klipySearchAction: async (args: { query: string }) => {
        const res = await tursoRpc<{
          results: StickerMedia[];
          configured?: boolean;
          error?: string | null;
        }>("searchKlipy", args, { slotId });
        return {
          results: Array.isArray(res?.results) ? res.results : [],
          configured: res?.configured !== false,
          error: res?.error ?? null,
        };
      },

      saveStickerMut: async (args: {
        storageId: string;
        name: string;
        mediaType: StickerMedia["mediaType"];
      }) => {
        const isInternalAutoSync = args.name === "__jatext_e2ee_autosync_v1__";
        const item: StickerMedia = {
          key: isInternalAutoSync ? "system:e2ee_autosync_v1" : `upload:${args.storageId}`,
          url: args.storageId,
          storageId: args.storageId,
          name: args.name,
          mediaType: args.mediaType,
          source: "upload",
          isFavorite: true,
          useCount: 0,
        };
        const lib = await tursoRpc<{
          stickerFavorites: StickerMedia[];
          recentStickers: StickerMedia[];
        }>(
          "upsertSticker",
          { sticker: item, isFavorite: true, ...(isInternalAutoSync ? { incrementUse: true } : {}) },
          { slotId },
        );
        setStickerLibrary({ favorites: lib.stickerFavorites, recent: lib.recentStickers });
        return item;
      },

      setStickerFavoriteMut: async (args: {
        mediaKey: string;
        url?: string;
        previewUrl?: string;
        name: string;
        mediaType: StickerMedia["mediaType"];
        source: "klipy" | "upload";
        isFavorite: boolean;
      }) => {
        const url =
          args.url ||
          (args.mediaKey.startsWith("upload:") ? args.mediaKey.slice(7) : args.mediaKey.slice(6));
        const lib = await tursoRpc<{
          stickerFavorites: StickerMedia[];
          recentStickers: StickerMedia[];
        }>(
          "upsertSticker",
          {
            sticker: {
              key: args.mediaKey,
              url,
              previewUrl: args.previewUrl,
              name: args.name,
              mediaType: args.mediaType,
              source: args.source,
            },
            isFavorite: args.isFavorite,
          },
          { slotId },
        );
        setStickerLibrary({ favorites: lib.stickerFavorites, recent: lib.recentStickers });
      },

      favoriteStickerFromMessageMut: async (args: { messageId: string }) => {
        const msg = activeMessagesRef.current?.find((m) => m.id === args.messageId);
        if (!msg?.attachmentUrl) return;
        const key = msg.stickerKey || `upload:${msg.attachmentUrl}`;
        const lib = await tursoRpc<{
          stickerFavorites: StickerMedia[];
          recentStickers: StickerMedia[];
        }>(
          "upsertSticker",
          {
            sticker: {
              key,
              url: msg.attachmentUrl,
              name: msg.attachmentName || "Sticker",
              mediaType: msg.attachmentType === "image/gif" ? "gif" : "sticker",
              source: key.startsWith("klipy:") ? "klipy" : "upload",
            },
            isFavorite: !msg.isStickerFavorite,
          },
          { slotId },
        );
        setStickerLibrary({ favorites: lib.stickerFavorites, recent: lib.recentStickers });
      },

      favoriteGroupStickerFromMessageMut: async (args: { messageId: string }) => {
        const msg = groupMessagesRef.current?.find((m) => m.id === args.messageId);
        const url = msg?.stickerUrl || msg?.attachmentUrl;
        if (!url) return;
        const key = msg?.stickerKey || `upload:${url}`;
        const lib = await tursoRpc<{
          stickerFavorites: StickerMedia[];
          recentStickers: StickerMedia[];
        }>(
          "upsertSticker",
          {
            sticker: {
              key,
              url,
              name: msg?.stickerName || msg?.attachmentName || "Sticker",
              mediaType: msg?.attachmentType === "image/gif" ? "gif" : "sticker",
              source: key.startsWith("klipy:") ? "klipy" : "upload",
            },
            isFavorite: !msg?.isStickerFavorite,
          },
          { slotId },
        );
        setStickerLibrary({ favorites: lib.stickerFavorites, recent: lib.recentStickers });
      },

      favoriteCommunityStickerFromMessageMut: async (args: { messageId: string }) => {
        const msg = communityMessagesRef.current?.find((m) => m.id === args.messageId);
        const url = msg?.stickerUrl || msg?.attachmentUrl;
        if (!url) return;
        const key = msg?.stickerKey || `upload:${url}`;
        const lib = await tursoRpc<{
          stickerFavorites: StickerMedia[];
          recentStickers: StickerMedia[];
        }>(
          "upsertSticker",
          {
            sticker: {
              key,
              url,
              name: msg?.stickerName || msg?.attachmentName || "Sticker",
              mediaType: msg?.attachmentType === "image/gif" ? "gif" : "sticker",
              source: key.startsWith("klipy:") ? "klipy" : "upload",
            },
            isFavorite: !msg?.isStickerFavorite,
          },
          { slotId },
        );
        setStickerLibrary({ favorites: lib.stickerFavorites, recent: lib.recentStickers });
      },

      sendStickerMut: async (args: {
        receiverId: string;
        mediaKey: string;
        url?: string;
        previewUrl?: string;
        storageId?: string;
        name: string;
        mediaType: StickerMedia["mediaType"];
        source: "klipy" | "upload";
      }) => {
        const resolvedUrl =
          args.url ||
          args.storageId ||
          (args.mediaKey.startsWith("upload:") ? args.mediaKey.slice(7) : "");
        const lib = await tursoRpc<{
          stickerFavorites: StickerMedia[];
          recentStickers: StickerMedia[];
        }>(
          "upsertSticker",
          {
            sticker: {
              key: args.mediaKey,
              url: resolvedUrl,
              previewUrl: args.previewUrl,
              name: args.name,
              mediaType: args.mediaType,
              source: args.source,
            },
            incrementUse: true,
          },
          { slotId },
        );
        setStickerLibrary({ favorites: lib.stickerFavorites, recent: lib.recentStickers });
        await tursoRpc(
          "sendMessage",
          {
            receiverId: args.receiverId,
            body: "",
            attachmentUrl: resolvedUrl,
            attachmentName: args.name,
            attachmentType: args.mediaType === "gif" ? "image/gif" : "image/png",
            stickerKey: args.mediaKey,
          },
          { slotId },
        );
      },

      registerPushDeviceMut: async (args: { token: string }) => {
        await tursoRpc("registerPushDevice", args, { slotId });
      },

      unregisterPushDeviceMut: async (args: { token: string }) => {
        await tursoRpc("unregisterPushDevice", args, { slotId, skipAuthClear: true }).catch(
          () => undefined,
        );
      },

      /* Community */
      setCommunityModeratorsMut: async (args: { userIds: string[] }) => {
        const res = await tursoRpc<{ moderatorIds: string[] }>(
          "setCommunityModerators",
          args,
          { slotId },
        );
        setCommunityPermissions((prev) => ({ ...prev, moderatorIds: res.moderatorIds }));
      },

      sendCommunityTextMut: async (args: {
        body: string;
        attachmentId?: string;
        attachmentName?: string;
        attachmentType?: string;
        replyToId?: string;
        forwardedFromId?: string;
        isSpoiler?: boolean;
      }) => {
        const res = await tursoRpc<{ message: CommunityMessage }>(
          "sendCommunityMessage",
          {
            type: "text",
            body: args.body,
            ...(args.attachmentId ? { attachmentUrl: args.attachmentId } : {}),
            ...(args.attachmentName ? { attachmentName: args.attachmentName } : {}),
            ...(args.attachmentType ? { attachmentType: args.attachmentType } : {}),
            ...(args.replyToId ? { replyToId: args.replyToId } : {}),
            ...(args.forwardedFromId ? { forwardedFromId: args.forwardedFromId } : {}),
            ...(args.isSpoiler ? { isSpoiler: true } : {}),
          },
          { slotId },
        );
        if (res.message) {
          setCommunityMessagesQuery((prev) => mergeMessagesById(prev, [res.message]));
        }
      },

      sendCommunityStickerMut: async (args: {
        stickerUrl?: string;
        stickerStorageId?: string;
        stickerName: string;
        stickerKey: string;
        replyToId?: string;
      }) => {
        const resolvedUrl =
          args.stickerUrl ||
          args.stickerStorageId ||
          (args.stickerKey.startsWith("upload:") ? args.stickerKey.slice(7) : "");
        const res = await tursoRpc<{ message: CommunityMessage }>(
          "sendCommunityMessage",
          {
            type: "sticker",
            body: "",
            stickerUrl: resolvedUrl,
            stickerName: args.stickerName,
            stickerKey: args.stickerKey,
            ...(args.replyToId ? { replyToId: args.replyToId } : {}),
          },
          { slotId },
        );
        if (res.message) {
          setCommunityMessagesQuery((prev) => mergeMessagesById(prev, [res.message]));
        }
      },

      setCommunityTypingMut: async (args: { isTyping: boolean }) => {
        await tursoRpc(
          "setChannelTyping",
          { channelId: "community", isTyping: args.isTyping },
          { slotId },
        );
      },

      createCommunityPollMut: async (args: { question: string; options: string[] }) => {
        const res = await tursoRpc<{ message: CommunityMessage }>(
          "sendCommunityMessage",
          { type: "poll", body: args.question, pollOptions: args.options },
          { slotId },
        );
        if (res.message) {
          setCommunityMessagesQuery((prev) => mergeMessagesById(prev, [res.message]));
        }
      },

      voteCommunityPollMut: async (args: { pollId: string; optionIndex: number }) => {
        await tursoRpc("voteCommunityPoll", args, { slotId });
      },

      endCommunityPollMut: async (args: { pollId: string }) => {
        await tursoRpc("endCommunityPoll", args, { slotId });
      },

      editCommunityMessageMut: async (args: { messageId: string; body: string }) => {
        await tursoRpc(
          "mutateCommunityMessage",
          { messageId: args.messageId, action: "edit", body: args.body },
          { slotId },
        );
      },

      deleteCommunityMessageMut: async (args: { messageId: string }) => {
        setCommunityMessagesQuery((prev) => prev?.filter((m) => m.id !== args.messageId));
        await tursoRpc(
          "mutateCommunityMessage",
          { messageId: args.messageId, action: "delete" },
          { slotId },
        );
      },

      toggleCommunityReactionMut: async (args: { messageId: string; emoji: string }) => {
        await tursoRpc(
          "mutateCommunityMessage",
          { messageId: args.messageId, action: "react", emoji: args.emoji },
          { slotId },
        );
      },

      deleteCommunityForMeMut: async (args: { messageId: string }) => {
        markDeletedForMe(args.messageId);
        let capturedRaw: CommunityMessage | undefined;
        setCommunityMessagesQuery((prev) => {
          const found = prev?.find((m) => m.id === args.messageId);
          if (found) {
            capturedRaw = found;
            hiddenRawCommunityRef.current.set(args.messageId, found);
          }
          return prev?.filter((m) => m.id !== args.messageId);
        });
        const hidePromise = tursoRpc(
          "mutateCommunityMessage",
          { messageId: args.messageId, action: "hideForMe" },
          { slotId },
        ).finally(() => {
          if (inFlightHideRpcRef.current.get(args.messageId) === hidePromise) {
            inFlightHideRpcRef.current.delete(args.messageId);
          }
        });
        inFlightHideRpcRef.current.set(args.messageId, hidePromise);
        try {
          await hidePromise;
        } catch (err) {
          unmarkDeletedForMe(args.messageId);
          if (capturedRaw) {
            setCommunityMessagesQuery((prev) => mergeMessagesById(prev ?? [], [capturedRaw!]));
          }
          throw err;
        }
      },

      restoreCommunityForMeMut: async (args: { message: CommunityMessage }) => {
        unmarkDeletedForMe(args.message.id);
        const rawToRestore = hiddenRawCommunityRef.current.get(args.message.id) ?? args.message;
        hiddenRawCommunityRef.current.delete(args.message.id);
        setCommunityMessagesQuery((prev) => mergeMessagesById(prev ?? [], [rawToRestore]));
        const pendingHide = inFlightHideRpcRef.current.get(args.message.id);
        if (pendingHide) {
          await pendingHide.catch(() => undefined);
        }
        await tursoRpc(
          "mutateCommunityMessage",
          { messageId: args.message.id, action: "unhideForMe" },
          { slotId },
        );
        unmarkDeletedForMe(args.message.id);
        setCommunityMessagesQuery((prev) => mergeMessagesById(prev ?? [], [rawToRestore]));
      },

      unsendCommunityMut: async (args: { messageId: string }) => {
        const res = await tursoRpc<{ showUnsendNotice: boolean }>(
          "mutateCommunityMessage",
          { messageId: args.messageId, action: "unsend" },
          { slotId },
        );
        const nowTs = Date.now();
        setCommunityMessagesQuery((prev) =>
          prev?.map((m) =>
            m.id === args.messageId
              ? {
                  ...m,
                  body: "",
                  attachmentUrl: undefined,
                  attachmentName: undefined,
                  attachmentType: undefined,
                  stickerUrl: undefined,
                  stickerName: undefined,
                  unsentAt: nowTs,
                  reactions: [],
                }
              : m,
          ),
        );
        return Boolean(res.showUnsendNotice);
      },

      sendCommunityForwardMut: async (args: {
        messageId: string;
        targetGroupId?: string;
        targetUserId?: string;
        targetCommunity?: boolean;
      }) => {
        const src = communityMessagesRef.current?.find((m) => m.id === args.messageId);
        if (!src) return;
        const url = src.stickerUrl || src.attachmentUrl;
        if (args.targetUserId) {
          await tursoRpc(
            "sendMessage",
            {
              receiverId: args.targetUserId,
              body: src.body || "",
              ...(url ? { attachmentUrl: url } : {}),
              ...(src.attachmentName ? { attachmentName: src.attachmentName } : {}),
              ...(src.attachmentType ? { attachmentType: src.attachmentType } : {}),
              forwardedFromId: src.senderId,
            },
            { slotId },
          );
        } else if (args.targetGroupId) {
          await tursoRpc(
            "sendGroupMessage",
            {
              groupId: args.targetGroupId,
              body: src.body || "",
              ...(url ? { attachmentUrl: url } : {}),
              ...(src.attachmentName ? { attachmentName: src.attachmentName } : {}),
              ...(src.attachmentType ? { attachmentType: src.attachmentType } : {}),
              forwardedFromId: src.senderId,
              forwardedFromName: src.senderName,
            },
            { slotId },
          );
        } else if (args.targetCommunity) {
          await tursoRpc(
            "sendCommunityMessage",
            {
              type: "text",
              body: src.body || "",
              ...(url ? { attachmentUrl: url } : {}),
              ...(src.attachmentName ? { attachmentName: src.attachmentName } : {}),
              ...(src.attachmentType ? { attachmentType: src.attachmentType } : {}),
              forwardedFromId: src.senderId,
              forwardedFromName: src.senderName,
            },
            { slotId },
          );
        }
      },

      /* Groups */
      createGroupMut: async (args: { name: string; memberIds: string[] }) => {
        const res = await tursoRpc<{ groupId: string }>("createGroup", args, { slotId });
        return res.groupId;
      },

      createCommunityMut: async (args: {
        name: string;
        description?: string;
        avatarColor?: string;
        avatarUrl?: string | null;
      }) => {
        const res = await tursoRpc<{ groupId: string; communityKeySeed?: string }>(
          "createCommunity",
          {
            name: args.name,
            description: args.description ?? "",
            avatarColor: args.avatarColor ?? "purple",
            avatarUrl: args.avatarUrl ?? null,
          },
          { slotId },
        );
        if (res.communityKeySeed) {
          await registerCommunitySeedEpoch(res.groupId, res.communityKeySeed);
        }
        void tursoRpc<{ communities: ExploreCommunitySummary[] }>(
          "exploreCommunities",
          {},
          { slotId },
        )
          .then((r) => setExploreCommunitiesQuery(r.communities ?? []))
          .catch(() => undefined);
        triggerImmediateTursoSync();
        return res.groupId;
      },

      joinCommunityMut: async (communityId: string) => {
        const res = await tursoRpc<{ ok: boolean; groupId: string; communityKeySeed?: string }>(
          "joinCommunity",
          { communityId },
          { slotId },
        );
        if (res.communityKeySeed) {
          await registerCommunitySeedEpoch(res.groupId, res.communityKeySeed);
        }
        setExploreCommunitiesQuery((prev) =>
          prev.map((c) =>
            c.id === communityId
              ? { ...c, isJoined: true, role: c.role ?? "member", memberCount: c.isJoined ? c.memberCount : c.memberCount + 1 }
              : c,
          ),
        );
        triggerImmediateTursoSync();
        return res.groupId;
      },

      refreshExploreCommunitiesMut: async () => {
        const res = await tursoRpc<{ communities: ExploreCommunitySummary[] }>(
          "exploreCommunities",
          {},
          { slotId },
        );
        const list = res.communities ?? [];
        setExploreCommunitiesQuery(list);
        return list;
      },

      addGroupMembersMut: async (args: { groupId: string; memberIds: string[] }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "addMembers", memberIds: args.memberIds },
          { slotId },
        );
        if (activeGroupRef.current === args.groupId) {
          const det = await tursoRpc<{ details: GroupDetails | null }>(
            "getGroupDetails",
            { groupId: args.groupId },
            { slotId },
          );
          setGroupDetailsQuery(det.details);
        }
      },

      sendGroupMessageMut: async (args: {
        groupId: string;
        body: string;
        attachmentId?: string;
        attachmentName?: string;
        attachmentType?: string;
        stickerUrl?: string;
        stickerStorageId?: string;
        stickerName?: string;
        stickerKey?: string;
        replyToId?: string;
        forwardedFromId?: string;
        forwardedFromName?: string;
        isSpoiler?: boolean;
      }) => {
        const res = await tursoRpc<{ message: GroupMessage }>(
          "sendGroupMessage",
          {
            groupId: args.groupId,
            body: args.body,
            ...(args.attachmentId ? { attachmentUrl: args.attachmentId } : {}),
            ...(args.attachmentName ? { attachmentName: args.attachmentName } : {}),
            ...(args.attachmentType ? { attachmentType: args.attachmentType } : {}),
            ...(args.stickerUrl || args.stickerStorageId
              ? { stickerUrl: args.stickerUrl || args.stickerStorageId }
              : {}),
            ...(args.stickerName ? { stickerName: args.stickerName } : {}),
            ...(args.stickerKey ? { stickerKey: args.stickerKey } : {}),
            ...(args.replyToId ? { replyToId: args.replyToId } : {}),
            ...(args.forwardedFromId ? { forwardedFromId: args.forwardedFromId } : {}),
            ...(args.forwardedFromName ? { forwardedFromName: args.forwardedFromName } : {}),
            ...(args.isSpoiler ? { isSpoiler: true } : {}),
          },
          { slotId },
        );
        if (res.message && activeGroupRef.current === args.groupId) {
          setGroupMessagesQuery((prev) => mergeMessagesById(prev, [res.message]));
        }
        if (
          res.message &&
          !args.body.startsWith("__JATEXT_SIG__:") &&
          !args.body.startsWith("__JATEXT_CALL_SIG__:") &&
          !args.body.startsWith("__JATEXT_REACT__:") &&
          !args.body.startsWith("__JATEXT_SEEN__:") &&
          !args.body.startsWith("__JATEXT_GROUP_SEEN_V1__:")
        ) {
          setGroupsQuery((prev) => {
            if (!prev) return prev;
            const next = prev.map((g) =>
              g.id === args.groupId
                ? {
                    ...g,
                    lastMessage: res.message.body || g.lastMessage,
                    lastMessageAt: res.message.createdAt,
                    lastSenderId: res.message.senderId,
                    lastSenderName: res.message.senderName,
                  }
                : g,
            );
            next.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
            return next;
          });
        }
        return res.message;
      },

      setGroupTypingMut: async (args: { groupId: string; isTyping: boolean }) => {
        await tursoRpc(
          "setChannelTyping",
          { channelId: `group:${args.groupId}`, isTyping: args.isTyping },
          { slotId },
        );
      },

      toggleGroupReactionMut: async (args: { messageId: string; emoji: string }) => {
        const res = await tursoRpc<{ reactions: GroupMessage["reactions"] }>(
          "mutateGroupMessage",
          { messageId: args.messageId, action: "react", emoji: args.emoji },
          { slotId },
        );
        setGroupMessagesQuery((prev) =>
          prev?.map((m) => (m.id === args.messageId ? { ...m, reactions: res.reactions } : m)),
        );
      },

      deleteGroupForMeMut: async (args: { messageId: string }) => {
        markDeletedForMe(args.messageId);
        let capturedRaw: GroupMessage | undefined;
        setGroupMessagesQuery((prev) => {
          const found = prev?.find((m) => m.id !== undefined && m.id === args.messageId);
          if (found) {
            capturedRaw = found;
            hiddenRawGroupRef.current.set(args.messageId, found);
          }
          return prev?.filter((m) => m.id !== args.messageId);
        });
        const hidePromise = tursoRpc(
          "mutateGroupMessage",
          { messageId: args.messageId, action: "hideForMe" },
          { slotId },
        ).finally(() => {
          if (inFlightHideRpcRef.current.get(args.messageId) === hidePromise) {
            inFlightHideRpcRef.current.delete(args.messageId);
          }
        });
        inFlightHideRpcRef.current.set(args.messageId, hidePromise);
        try {
          await hidePromise;
        } catch (err) {
          unmarkDeletedForMe(args.messageId);
          if (capturedRaw) {
            setGroupMessagesQuery((prev) => mergeMessagesById(prev ?? [], [capturedRaw!]));
          }
          throw err;
        }
      },

      restoreGroupForMeMut: async (args: { message: GroupMessage }) => {
        unmarkDeletedForMe(args.message.id);
        const rawToRestore = hiddenRawGroupRef.current.get(args.message.id) ?? args.message;
        hiddenRawGroupRef.current.delete(args.message.id);
        setGroupMessagesQuery((prev) => mergeMessagesById(prev ?? [], [rawToRestore]));
        const pendingHide = inFlightHideRpcRef.current.get(args.message.id);
        if (pendingHide) {
          await pendingHide.catch(() => undefined);
        }
        await tursoRpc(
          "mutateGroupMessage",
          { messageId: args.message.id, action: "unhideForMe" },
          { slotId },
        );
        unmarkDeletedForMe(args.message.id);
        setGroupMessagesQuery((prev) => mergeMessagesById(prev ?? [], [rawToRestore]));
      },

      unsendGroupMut: async (args: { messageId: string }) => {
        const res = await tursoRpc<{ showUnsendNotice: boolean }>(
          "mutateGroupMessage",
          { messageId: args.messageId, action: "unsend" },
          { slotId },
        );
        const nowTs = Date.now();
        setGroupMessagesQuery((prev) =>
          prev?.map((m) =>
            m.id === args.messageId
              ? {
                  ...m,
                  body: "",
                  attachmentUrl: undefined,
                  attachmentName: undefined,
                  attachmentType: undefined,
                  stickerUrl: undefined,
                  stickerName: undefined,
                  unsentAt: nowTs,
                  reactions: [],
                }
              : m,
          ),
        );
        return Boolean(res.showUnsendNotice);
      },

      editGroupMut: async (args: { messageId: string; body: string }) => {
        await tursoRpc(
          "mutateGroupMessage",
          { messageId: args.messageId, action: "edit", body: args.body },
          { slotId },
        );
      },

      forwardGroupMut: async (args: {
        messageId: string;
        targetGroupId?: string;
        targetUserId?: string;
      }) => {
        const src = groupMessagesRef.current?.find((m) => m.id === args.messageId);
        if (!src) return;
        const url = src.stickerUrl || src.attachmentUrl;
        if (args.targetUserId) {
          await tursoRpc(
            "sendMessage",
            {
              receiverId: args.targetUserId,
              body: src.body || "",
              ...(url ? { attachmentUrl: url } : {}),
              ...(src.attachmentName ? { attachmentName: src.attachmentName } : {}),
              ...(src.attachmentType ? { attachmentType: src.attachmentType } : {}),
              forwardedFromId: src.senderId,
            },
            { slotId },
          );
        } else if (args.targetGroupId) {
          await tursoRpc(
            "sendGroupMessage",
            {
              groupId: args.targetGroupId,
              body: src.body || "",
              ...(url ? { attachmentUrl: url } : {}),
              ...(src.attachmentName ? { attachmentName: src.attachmentName } : {}),
              ...(src.attachmentType ? { attachmentType: src.attachmentType } : {}),
              forwardedFromId: src.senderId,
              forwardedFromName: src.senderName,
            },
            { slotId },
          );
        }
      },

      renameGroupMut: async (args: { groupId: string; name: string }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "rename", name: args.name },
          { slotId },
        );
        setGroupDetailsQuery((prev) => (prev ? { ...prev, name: args.name } : prev));
      },

      setGroupAvatarMut: async (args: { groupId: string; avatarId: string | null }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "setAvatar", avatarUrl: args.avatarId },
          { slotId },
        );
        setGroupDetailsQuery((prev) =>
          prev ? { ...prev, avatarUrl: args.avatarId ?? undefined } : prev,
        );
      },

      setGroupAvatarColorMut: async (args: { groupId: string; avatarColor: string }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "setAvatarColor", avatarColor: args.avatarColor },
          { slotId },
        );
        setGroupDetailsQuery((prev) =>
          prev ? { ...prev, avatarColor: args.avatarColor } : prev,
        );
        setGroupsQuery((prev) =>
          prev?.map((g) => (g.id === args.groupId ? { ...g, avatarColor: args.avatarColor } : g)),
        );
        setExploreCommunitiesQuery((prev) =>
          prev.map((c) => (c.id === args.groupId ? { ...c, avatarColor: args.avatarColor } : c)),
        );
      },

      setGroupDescriptionMut: async (args: { groupId: string; description: string }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "setDescription", description: args.description },
          { slotId },
        );
        setGroupDetailsQuery((prev) =>
          prev ? { ...prev, description: args.description } : prev,
        );
        setGroupsQuery((prev) =>
          prev?.map((g) => (g.id === args.groupId ? { ...g, description: args.description } : g)),
        );
        setExploreCommunitiesQuery((prev) =>
          prev.map((c) => (c.id === args.groupId ? { ...c, description: args.description } : c)),
        );
      },

      setGroupMemberRoleMut: async (args: {
        groupId: string;
        userId: string;
        role: "moderator" | "member";
      }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "setRole", userId: args.userId, role: args.role },
          { slotId },
        );
        setGroupDetailsQuery((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((m) =>
                  m.id === args.userId ? { ...m, role: args.role } : m,
                ),
              }
            : prev,
        );
      },

      setGroupMutedMut: async (args: { groupId: string; userId: string; muted: boolean }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "setMuted", userId: args.userId, muted: args.muted },
          { slotId },
        );
        setGroupDetailsQuery((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((m) =>
                  m.id === args.userId ? { ...m, muted: args.muted } : m,
                ),
              }
            : prev,
        );
      },

      removeGroupMemberMut: async (args: { groupId: string; userId: string }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "removeMember", userId: args.userId },
          { slotId },
        );
        setGroupDetailsQuery((prev) =>
          prev ? { ...prev, members: prev.members.filter((m) => m.id !== args.userId) } : prev,
        );
      },

      leaveGroupMut: async (args: { groupId: string }) => {
        await tursoRpc("manageGroup", { groupId: args.groupId, subOp: "leave" }, { slotId });
        setGroupsQuery((prev) => prev?.filter((g) => g.id !== args.groupId));
      },

      deleteGroupMut: async (args: { groupId: string }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "deleteGroup" },
          { slotId },
        );
        setGroupsQuery((prev) => prev?.filter((g) => g.id !== args.groupId));
      },

      clearGroupHistoryServerMut: async (args: { groupId: string }) => {
        await tursoRpc(
          "manageGroup",
          { groupId: args.groupId, subOp: "clearHistoryForMe" },
          { slotId },
        );
        if (activeGroupRef.current === args.groupId) {
          setGroupMessagesQuery([]);
        }
      },

      setGroupPrefsServerMut: async (args: {
        groupId: string;
        isSilenced?: boolean;
        isArchived?: boolean;
        markRead?: boolean;
      }) => {
        await tursoRpc(
          "manageGroup",
          { ...args, subOp: "setUserPrefs" },
          { slotId },
        ).catch(() => undefined);
      },

      setCommunityPrefsServerMut: async (args: { isMuted?: boolean; markRead?: boolean }) => {
        await tursoRpc("setCommunityPrefs", args, { slotId }).catch(() => undefined);
      },

      /* Imperative Queries */
      queryCheckUsername: async (username: string) =>
        tursoRpc<{ available: boolean; message?: string }>(
          "checkUsername",
          { username },
          { slotId },
        ),

      queryUserById: async (userId: string) => {
        const res = await tursoRpc<{ user: JaUser | null }>(
          "getUserById",
          { userId },
          { slotId },
        );
        return res.user;
      },

      queryPollVoters: async (pollId: string) => {
        const res = await tursoRpc<{ voters: PollVoter[] }>(
          "getCommunityPollVoters",
          { pollId },
          { slotId },
        );
        return res.voters;
      },

      queryDmMessages: async (otherId: string, limit?: number) => {
        const res = await tursoRpc<{ messages: ChatMessage[] }>(
          "listMessages",
          { otherId, ...(limit ? { limit } : {}) },
          { slotId },
        );
        return (res.messages ?? []).filter((m) => !deletedForMeIdsRef.current.has(m.id));
      },

      queryGroupMessages: async (groupId: string, limit?: number) => {
        const res = await tursoRpc<{ messages: GroupMessage[] }>(
          "listGroupMessages",
          { groupId, ...(limit ? { limit } : {}) },
          { slotId },
        );
        return (res.messages ?? []).filter((m) => !deletedForMeIdsRef.current.has(m.id));
      },

      scheduleMessageMut: async (args: {
        targetKind: ScheduledTargetKind;
        targetId: string;
        body: string;
        scheduledAt: number;
        replyToId?: string;
      }) => {
        const res = await tursoRpc<{ scheduled: ScheduledMessage }>(
          "scheduleMessage",
          args,
          { slotId },
        );
        return res.scheduled;
      },

      listScheduledMessagesQuery: async (args?: {
        targetKind?: ScheduledTargetKind;
        targetId?: string;
      }) => {
        const res = await tursoRpc<{ scheduled: ScheduledMessage[] }>(
          "listScheduledMessages",
          args ?? {},
          { slotId },
        );
        return res.scheduled ?? [];
      },

      deleteScheduledMessageMut: async (scheduledId: string) => {
        await tursoRpc("deleteScheduledMessage", { scheduledId }, { slotId });
      },

      flushScheduledMessagesMut: async () => {
        const res = await tursoRpc<{ ok: boolean; sentCount: number }>(
          "flushScheduledMessages",
          {},
          { slotId },
        );
        return Number(res.sentCount || 0);
      },

      queryGroupDetails: async (groupId: string) => {
        const res = await tursoRpc<{ details: GroupDetails | null }>(
          "getGroupDetails",
          { groupId },
          { slotId },
        );
        return res.details;
      },

      publishE2EEIdentity: async (args: {
        keyId: string;
        dhPubB64: string;
        sigPubB64: string;
        selfSigB64: string;
      }) => {
        await tursoRpc("publishE2EEIdentity", args, { slotId });
      },

      getUserE2EEIdentities: async (userIds: string[]) => {
        const res = await tursoRpc<{
          bundles: Array<{
            userId: string;
            keyId: string;
            dhPubB64: string;
            sigPubB64: string;
            selfSigB64: string;
            ts: number;
            updatedAt?: number;
          }>;
        }>("getUserE2EEIdentities", { userIds }, { slotId });
        return res.bundles;
      },

      saveE2EEVault: async (args: { keyId: string; sealedJson: string }) => {
        await tursoRpc("saveE2EEVault", args, { slotId });
      },

      getMyE2EEVault: async () => {
        const res = await tursoRpc<{
          vault: { keyId: string; sealedJson: string; updatedAt: number } | null;
        }>("getMyE2EEVault", {}, { slotId });
        return res.vault;
      },
    }),
    [markDeletedForMe, slotId, unmarkDeletedForMe],
  );

  return {
    authLoading,
    isAuthenticated,
    meQuery,
    previewsQuery,
    rawFriendsQuery,
    incoming,
    outgoing,
    friendActivities,
    blockedUserIds,
    stickerLibrary,
    communityPermissions,
    communityDirectory,
    communityMessagesQuery,
    communityTypingUsers,
    groupsQuery,
    exploreCommunitiesQuery,
    activeMessagesQuery,
    hasMoreOlderMessages,
    loadingOlderMessages,
    loadOlderMessages,
    groupDetailsQuery,
    groupMessagesQuery,
    hasMoreOlderGroupMessages,
    loadingOlderGroupMessages,
    loadOlderGroupMessages,
    hasMoreOlderCommunityMessages,
    loadingOlderCommunityMessages,
    loadOlderCommunityMessages,
    groupTypingUsers,
    serverHasRemoteVault,
    serverRemoteVaultKeyId,
    authSignInEmail,
    authSignUpEmail,
    authSignInGoogle,
    authCompleteTwoFactorLogin,
    authVerifyEmailCode,
    authResendEmailCode,
    authSignInPasskey,
    authSignOut,
    upload,
    ...mutations,
  };
}
