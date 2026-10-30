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
  isInTursoActivityBurst,
  resolveSlotToken,
  subscribeTursoSyncWake,
  triggerImmediateTursoSync,
  tursoRpc,
  uploadMediaToTurso,
} from "./tursoClient";
import { OAUTH_RETURN_CHATS_FLAG } from "./webRoute";
import { OFFICIAL_COMMUNITY_ID } from "./types";
import type {
  ChatMessage,
  ChatPreview,
  ChatTypingUser,
  CommunityMessage,
  CommunityUser,
  FriendActivity,
  FriendRequest,
  GroupDetails,
  GroupMessage,
  GroupSummary,
  JaUser,
  PollVoter,
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
  groups: GroupSummary[];
  hasRemoteE2EEVault: boolean;
  remoteVaultKeyId: string | null;
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
  groupTypingUsers: ChatTypingUser[];
  communityTypingUsers: ChatTypingUser[];
}

function mergeMessagesById<T extends { id: string; createdAt: number }>(
  prev: T[] | undefined,
  incoming: T[],
): T[] {
  if (!incoming.length) return prev ?? [];
  const map = new Map<string, T>();
  for (const m of prev ?? []) {
    map.set(m.id, m);
  }
  for (const m of incoming) {
    map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
}

const handledAndroidTokens = new Set<string>();

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
  const [serverHasRemoteVault, setServerHasRemoteVault] = useState(false);
  const [serverRemoteVaultKeyId, setServerRemoteVaultKeyId] = useState<string | null>(null);

  const sinceTsRef = useRef<number>(0);
  const lastPresenceBeatRef = useRef<number>(0);
  const syncInFlightRef = useRef<boolean>(false);
  const slotIdRef = useRef(slotId);
  slotIdRef.current = slotId;
  const activeChatRef = useRef(activeChatId);
  activeChatRef.current = activeChatId;
  const activeGroupRef = useRef(activeGroupId);
  activeGroupRef.current = activeGroupId;

  const resetSessionState = useCallback(() => {
    sinceTsRef.current = 0;
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
    setActiveMessagesQuery(undefined);
    setGroupDetailsQuery(undefined);
    setGroupMessagesQuery(undefined);
    setGroupTypingUsers([]);
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
    setCommunityMessagesQuery(boot.communityMessages);
    setGroupsQuery(boot.groups);
    setServerHasRemoteVault(Boolean(boot.hasRemoteE2EEVault));
    setServerRemoteVaultKeyId(boot.remoteVaultKeyId);
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
      return;
    }
    let cancelled = false;
    setActiveMessagesQuery(undefined);
    void tursoRpc<{ messages: ChatMessage[] }>(
      "listMessages",
      { otherId: activeChatId },
      { slotId },
    )
      .then((res) => {
        if (!cancelled) setActiveMessagesQuery(res.messages);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeChatId, isAuthenticated, slotId]);

  // Load active Group details + messages when activeGroupId changes
  useEffect(() => {
    if (!isAuthenticated || !activeGroupId) {
      setGroupDetailsQuery(undefined);
      setGroupMessagesQuery(undefined);
      setGroupTypingUsers([]);
      return;
    }
    let cancelled = false;
    setGroupDetailsQuery(undefined);
    setGroupMessagesQuery(undefined);
    void Promise.all([
      tursoRpc<{ details: GroupDetails | null }>(
        "getGroupDetails",
        { groupId: activeGroupId },
        { slotId },
      ),
      tursoRpc<{ messages: GroupMessage[] }>(
        "listGroupMessages",
        { groupId: activeGroupId },
        { slotId },
      ),
    ])
      .then(([detRes, msgRes]) => {
        if (cancelled) return;
        setGroupDetailsQuery(detRes.details);
        setGroupMessagesQuery(msgRes.messages);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeGroupId, isAuthenticated, slotId]);

  // Adaptive Foreground Delta Sync Engine
  const runDeltaSync = useCallback(async () => {
    if (!isAuthenticated || syncInFlightRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!sinceTsRef.current) return;

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

      if (res.me) setMeQuery(res.me);
      if (res.social) {
        setRawFriendsQuery(res.social.friends);
        setIncoming(res.social.incoming);
        setOutgoing(res.social.outgoing);
        setBlockedUserIds(res.social.blockedUserIds);
        setPreviewsQuery(res.social.previews);
        setFriendActivities(res.social.friendActivities);
      }
      if (res.changedDmMessages?.length && activeChatRef.current === curChat) {
        setActiveMessagesQuery((prev) => mergeMessagesById(prev, res.changedDmMessages!));
      }
      if (res.changedGroupMessages?.length && activeGroupRef.current === curGroup) {
        setGroupMessagesQuery((prev) => mergeMessagesById(prev, res.changedGroupMessages!));
      }
      if (res.changedCommunityMessages?.length) {
        setCommunityMessagesQuery((prev) =>
          mergeMessagesById(prev, res.changedCommunityMessages!),
        );
      }
      if (res.groups) {
        setGroupsQuery(res.groups);
      }
      setGroupTypingUsers(res.groupTypingUsers ?? []);
      setCommunityTypingUsers(res.communityTypingUsers ?? []);
    } catch {
      // transient network hiccup; keep cached state intact
    } finally {
      syncInFlightRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      const delay = isInTursoActivityBurst()
        ? 700
        : activeChatRef.current || activeGroupRef.current
          ? 1800
          : 4500;
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

    const onFocusOrVisible = () => {
      if (!document.hidden) {
        triggerImmediateTursoSync(true);
      }
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      unsubWake();
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [isAuthenticated, runDeltaSync]);

  /* ==================== Auth Actions ==================== */

  const authSignInEmail = useCallback(
    async (email: string, password: string) => {
      const res = await tursoRpc<{ token: string; me: JaUser }>(
        "signInEmail",
        { email: email.trim().toLowerCase(), password },
        { slotId },
      );
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
      const res = await tursoRpc<{ token: string; me: JaUser }>(
        "signUpEmail",
        { email: email.trim().toLowerCase(), password },
        { slotId },
      );
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
    setIsAuthenticated(false);
    setAuthLoading(false);
    resetSessionState();
  }, [resetSessionState]);

  const upload = useCallback(
    async (file: File): Promise<string> => uploadMediaToTurso(file, slotId),
    [slotId],
  );

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
          },
          { slotId },
        );
        if (res.message && activeChatRef.current === args.receiverId) {
          setActiveMessagesQuery((prev) => mergeMessagesById(prev, [res.message]));
        }
        return res.message;
      },

      forwardMessageMut: async (args: { messageId: string; receiverId: string }) => {
        const msg = activeMessagesQuery?.find((m) => m.id === args.messageId);
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
        await tursoRpc("deleteMessageForMe", args, { slotId });
        setActiveMessagesQuery((prev) => prev?.filter((m) => m.id !== args.messageId));
      },

      unsendMut: async (args: { messageId: string }) => {
        const res = await tursoRpc<{ showUnsendNotice: boolean }>(
          "unsendMessage",
          args,
          { slotId },
        );
        setActiveMessagesQuery((prev) =>
          prev?.map((m) =>
            m.id === args.messageId ? { ...m, body: "", unsentAt: Date.now(), reactions: [] } : m,
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
        const res = await tursoRpc<{ results: StickerMedia[] }>("searchKlipy", args, { slotId });
        return res.results;
      },

      saveStickerMut: async (args: {
        storageId: string;
        name: string;
        mediaType: StickerMedia["mediaType"];
      }) => {
        const item: StickerMedia = {
          key: `upload:${args.storageId}`,
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
        }>("upsertSticker", { sticker: item, isFavorite: true }, { slotId });
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
        const msg = activeMessagesQuery?.find((m) => m.id === args.messageId);
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
        const msg = groupMessagesQuery?.find((m) => m.id === args.messageId);
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
        const msg = communityMessagesQuery?.find((m) => m.id === args.messageId);
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
        await tursoRpc(
          "mutateCommunityMessage",
          { messageId: args.messageId, action: "hideForMe" },
          { slotId },
        );
        setCommunityMessagesQuery((prev) => prev?.filter((m) => m.id !== args.messageId));
      },

      unsendCommunityMut: async (args: { messageId: string }) => {
        const res = await tursoRpc<{ showUnsendNotice: boolean }>(
          "mutateCommunityMessage",
          { messageId: args.messageId, action: "unsend" },
          { slotId },
        );
        return Boolean(res.showUnsendNotice);
      },

      sendCommunityForwardMut: async (args: {
        messageId: string;
        targetGroupId?: string;
        targetUserId?: string;
        targetCommunity?: boolean;
      }) => {
        const src = communityMessagesQuery?.find((m) => m.id === args.messageId);
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
          },
          { slotId },
        );
        if (res.message && activeGroupRef.current === args.groupId) {
          setGroupMessagesQuery((prev) => mergeMessagesById(prev, [res.message]));
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
        await tursoRpc(
          "mutateGroupMessage",
          { messageId: args.messageId, action: "hideForMe" },
          { slotId },
        );
        setGroupMessagesQuery((prev) => prev?.filter((m) => m.id !== args.messageId));
      },

      unsendGroupMut: async (args: { messageId: string }) => {
        const res = await tursoRpc<{ showUnsendNotice: boolean }>(
          "mutateGroupMessage",
          { messageId: args.messageId, action: "unsend" },
          { slotId },
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
        const src = groupMessagesQuery?.find((m) => m.id === args.messageId);
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

      queryDmMessages: async (otherId: string) => {
        const res = await tursoRpc<{ messages: ChatMessage[] }>(
          "listMessages",
          { otherId },
          { slotId },
        );
        return res.messages;
      },

      queryGroupMessages: async (groupId: string) => {
        const res = await tursoRpc<{ messages: GroupMessage[] }>(
          "listGroupMessages",
          { groupId },
          { slotId },
        );
        return res.messages;
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
    [activeMessagesQuery, communityMessagesQuery, groupMessagesQuery, slotId],
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
    activeMessagesQuery,
    groupDetailsQuery,
    groupMessagesQuery,
    groupTypingUsers,
    serverHasRemoteVault,
    serverRemoteVaultKeyId,
    authSignInEmail,
    authSignUpEmail,
    authSignInGoogle,
    authSignOut,
    upload,
    ...mutations,
  };
}
