import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App } from "@capacitor/app";
import { PUBLIC_TURSO_API_ORIGIN, triggerImmediateTursoSync } from "./tursoClient";
import { useTursoReactiveSession } from "./tursoReactive";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { JaTextNative } from "./nativeBridge";
import { JaTextContext } from "./store";
import {
  finalizeSignOutCurrentSlot,
  getActiveAccountSlotId,
  getMultiAccountState,
  getScopedStorageKey,
  hasStoredAuthForSlot,
  syncActiveUserToSavedAccounts,
} from "./accountManager";
import {
  getCachedDmConversation,
  getCachedGroupConversation,
  getSlotBootstrapCache,
  isPlaceholderEncryptedText,
  markCachedBootstrapGroupRead,
  markCachedDmMessagesRead,
  mergeLiveWithCachedMessages,
  preloadSlotChatCache,
  saveSlotBootstrapCache,
  setCachedDmConversation,
  setCachedGroupConversation,
  useChatCacheVersion,
} from "./chatCache";
import {
  applyRemoteSyncedThemeIfChanged,
  registerThemeRemoteSyncHandler,
  setThemeUserScope,
  type SyncedThemePayload,
} from "./themeEngine";
import { loadNotificationPreferences, saveNotificationPreferences } from "./alerts";
import {
  encodeForwardedBody,
  extractForwardedContext,
  stripForwardedMetadataFromText,
  type ForwardedMessageContext,
} from "./forwardedContext";
import { normalizeImageFileForUpload } from "./imageUtils";
import {
  unpackAvatarColorWithMeta,
} from "./profileMetaEnvelope";
import {
  clearLocalGroupHistory,
  markLocalCommunityRead,
  markLocalDmRead,
  markLocalGroupRead,
  recordIncomingDmPreviewsBatch,
  recordIncomingGroupSummariesBatch,
  setLocalCommunityMuted,
  syncSuppressedPushTargetsToNative,
  updateLocalGroupSettings,
  useUserChatPrefs,
} from "./userChatPrefs";
import {
  LEGACY_SERVER_REACTION_EMOJIS,
  foldReactionSignals,
  formatGroupReactionPreview,
  loadLocalCommunityReactions,
  saveLocalCommunityReaction,
  serializeReactionSignal,
  type LocalUserReactionState,
  type ReactionSignalOp,
} from "./reactionSignals";
import {
  BUBBLE_STYLE_REMOTE_SYNC_EVENT,
  WALLPAPER_PREFIX,
  attachBubbleStyleToFile,
  attachBubbleStyleToOutgoing,
  extractMessageBubbleStyle,
  getSavedOutgoingBubbleStyle,
  isValidBubbleStyleId,
  saveOutgoingBubbleStyle,
  stripBubbleStyleFromText,
  type BubbleStyleId,
} from "./chatCustomization";
import {
  E2EE_AUTOSYNC_STICKER_NAME,
  E2EE_BUBBLE_PREF_PREFIX,
  E2EE_DEVSYNC_REQ_PREFIX,
  E2EE_DEVSYNC_RES_PREFIX,
  E2EE_VAULT_STICKER_NAME,
  createGroupKeySignalPacket,
  generateDeviceSyncKeypair,
  generateGroupEpochSecretB64,
  openAutoSyncKeyring,
  openSealedE2EEVault,
  sealAutoSyncKeyring,
  sealE2EEVault,
  toPublicIdentityBundle,
  unwrapDeviceSyncResponse,
  wrapVaultForDeviceSync,
  type DeviceSyncRequest,
  type DeviceSyncResponse,
  type LocalDeviceSyncKeypair,
  type PublicIdentityBundle,
  type SealedAutoSyncKeyring,
  type SealedE2EEVault,
} from "./e2ee/cryptoPrimitives";
import {
  clearActiveE2EESession,
  clearDecryptedSessionCaches,
  ensureInitialGroupEpoch,
  ensureUserE2EEInitialized,
  exportCurrentVaultContents,
  getActiveE2EEState,
  getAllMyIdentities,
  getGroupEpochAllSecrets,
  getKnownPacketSecretB64,
  getLatestGroupEpoch,
  getPeerKnownBundles,
  importRestoredVaultContents,
  ingestPeerIdentityBundle,
  markCurrentIdentityBackedUp,
  mergeAutoSyncedKeyring,
  parseGroupKeySignal,
  parseIdentitySignal,
  recordPacketSecretB64,
  rotateGroupEpoch,
  serializeGroupKeySignal,
  serializeIdentitySignal,
  serializeVerifySignal,
  setPeerVerifiedState,
  storeGroupEpochSecret,
  useE2EESnapshot,
} from "./e2ee/keystore";
import {
  hydrateDecryptedChatPreview,
  hydrateDecryptedDmMessage,
  hydrateDecryptedDmMessageAsync,
  hydrateDecryptedGroupMessage,
  hydrateDecryptedGroupMessageAsync,
  hydrateDecryptedGroupSummary,
  isInternalE2EEStickerName,
  prepareOutgoingDmEncrypted,
  prepareOutgoingGroupEncrypted,
  scanDmRowsForE2EESignalsAsync,
  scanGroupRowsForE2EESignalsAsync,
} from "./e2ee/messagePipeline";
import { OFFICIAL_COMMUNITY_ID } from "./types";
import type {
  ChatMessage,
  CommunityMessage,
  GroupDetails,
  GroupMessage,
  JaTextStore,
  JaUser,
  ProfileInput,
  StickerMedia,
  StatusPreference,
} from "./types";

const PUSH_TOKEN_STORAGE_KEY = "jatext-push-token-v1";
export const CONVERSATION_MARKED_READ_EVENT = "jatext:conversation-marked-read";

function isControlPayload(text: string): boolean {
  return text.startsWith("__JATEXT_CALL") || text.startsWith(WALLPAPER_PREFIX);
}

function isSilentWireOrControlBody(text?: string | null): boolean {
  if (!text) return false;
  return (
    text.startsWith("__JATEXT_CALL_SIG__:") ||
    text.startsWith("__JATEXT_GC_SIG__:") ||
    text.startsWith("__JATEXT_REACT__:") ||
    text.startsWith("__JATEXT_SEEN__:") ||
    text.startsWith("__JATEXT_GROUP_SEEN_V1__:") ||
    text.startsWith("__JATEXT_IK_V1__:") ||
    text.startsWith("__JATEXT_GK_V1__:") ||
    text.startsWith("__JATEXT_E2EE_IK__:") ||
    text.startsWith("__JATEXT_E2EE_GK__:") ||
    text.startsWith("__JATEXT_E2EE_VER__:") ||
    text.startsWith(WALLPAPER_PREFIX) ||
    text.startsWith(E2EE_BUBBLE_PREF_PREFIX) ||
    text.startsWith(E2EE_DEVSYNC_REQ_PREFIX) ||
    text.startsWith(E2EE_DEVSYNC_RES_PREFIX) ||
    text.includes("(__JATEXT_CALL_CANCEL__") ||
    text.includes("(__JATEXT_CALL_CLAIM__")
  );
}

function cleanAttachmentMime(mime?: string): string | undefined {
  if (!mime) return mime;
  return mime.replace(/;jbs=[a-z0-9-]+/gi, "");
}

function normalizeDirectMessage(raw: ChatMessage): ChatMessage {
  const { cleanBody, bubbleStyle } = extractMessageBubbleStyle(raw.body, raw.attachmentType);
  return {
    ...raw,
    body: cleanBody,
    bubbleStyle: bubbleStyle !== "default" ? bubbleStyle : (raw.bubbleStyle ?? "default"),
    attachmentType: cleanAttachmentMime(raw.attachmentType),
    replyTo: raw.replyTo
      ? { ...raw.replyTo, body: stripBubbleStyleFromText(raw.replyTo.body) }
      : undefined,
  };
}

function normalizeGroupMessage(raw: GroupMessage): GroupMessage {
  const { cleanBody, bubbleStyle } = extractMessageBubbleStyle(raw.body, raw.attachmentType);
  return {
    ...raw,
    body: cleanBody,
    bubbleStyle: bubbleStyle !== "default" ? bubbleStyle : (raw.bubbleStyle ?? "default"),
    attachmentType: cleanAttachmentMime(raw.attachmentType),
    replyTo: raw.replyTo
      ? { ...raw.replyTo, body: stripBubbleStyleFromText(raw.replyTo.body) }
      : undefined,
  };
}

function normalizeCommunityMessage(raw: CommunityMessage): CommunityMessage {
  const { cleanBody: bubbleCleanBody, bubbleStyle } = extractMessageBubbleStyle(
    raw.body,
    raw.attachmentType,
  );
  const { context: fwdContext, strippedBody } = extractForwardedContext(bubbleCleanBody);
  return {
    ...raw,
    body: strippedBody,
    bubbleStyle,
    forwardedContext: fwdContext ?? raw.forwardedContext,
    forwardedFromName: raw.forwardedFromName ?? fwdContext?.originalSenderName,
    attachmentType: cleanAttachmentMime(raw.attachmentType),
    replyTo: raw.replyTo
      ? {
          ...raw.replyTo,
          body: stripForwardedMetadataFromText(stripBubbleStyleFromText(raw.replyTo.body)),
        }
      : undefined,
  };
}

async function checkNativeFirebaseConfigured(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await JaTextNative.checkPushSupport();
    return res.firebaseConfigured === true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Real Convex store, active when VITE_CONVEX_URL is set.              */
/* All data (users, friend requests, messages, file uploads) goes     */
/* through the Convex functions in /convex. Auth = Convex Auth with    */
/* Google OAuth + email/password providers.                            */
/* ------------------------------------------------------------------ */

export function TursoStoreProvider({ children }: { children: ReactNode }) {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const slotId = getActiveAccountSlotId();
  const convexUrl = PUBLIC_TURSO_API_ORIGIN;
  const {
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
    authSignOut,
    upload,
    saveProfileMut,
    sendRequestMut,
    respondMut,
    removeFriendMut,
    sendMessageMut,
    forwardMessageMut,
    toggleReactionMut,
    deleteForMeMut,
    unsendMut,
    editMessageMut,
    updateConversationMut,
    setTypingMut,
    markReadMut,
    setBlockMut,
    setActivityMut,
    heartbeatMut,
    disconnectMut,
    klipySearchAction,
    saveStickerMut,
    setStickerFavoriteMut,
    favoriteStickerFromMessageMut,
    favoriteGroupStickerFromMessageMut,
    favoriteCommunityStickerFromMessageMut,
    sendStickerMut,
    registerPushDeviceMut,
    unregisterPushDeviceMut,
    setCommunityModeratorsMut,
    sendCommunityTextMut,
    sendCommunityStickerMut,
    sendCommunityForwardMut,
    setCommunityTypingMut,
    createCommunityPollMut,
    voteCommunityPollMut,
    endCommunityPollMut,
    editCommunityMessageMut,
    deleteCommunityMessageMut,
    toggleCommunityReactionMut,
    deleteCommunityForMeMut,
    unsendCommunityMut,
    createGroupMut,
    addGroupMembersMut,
    sendGroupMessageMut,
    forwardGroupMut,
    setGroupTypingMut,
    toggleGroupReactionMut,
    deleteGroupForMeMut,
    unsendGroupMut,
    editGroupMut,
    renameGroupMut,
    setGroupAvatarMut,
    setGroupMemberRoleMut,
    setGroupMutedMut,
    removeGroupMemberMut,
    leaveGroupMut,
    deleteGroupMut,
    clearGroupHistoryServerMut,
    setGroupPrefsServerMut,
    setCommunityPrefsServerMut,
    queryCheckUsername,
    queryUserById,
    queryPollVoters,
    queryDmMessages,
    queryGroupMessages,
    queryGroupDetails,
    publishE2EEIdentity,
    getUserE2EEIdentities,
    saveE2EEVault,
    getMyE2EEVault,
  } = useTursoReactiveSession(slotId, activeChatId, activeGroupId);
  const [notificationPreferences, setNotificationPreferences] = useState(loadNotificationPreferences);
  const [pushRegistrationStatus, setPushRegistrationStatus] =
    useState<JaTextStore["pushRegistrationStatus"]>("idle");
  const [optimisticReactions, setOptimisticReactions] = useState<
    Record<string, LocalUserReactionState>
  >({});
  const [localCommunityReactions, setLocalCommunityReactions] = useState(
    loadLocalCommunityReactions,
  );
  const e2eeServerSupportedRef = useRef<boolean | null>(null);
  const announcedDmKeysRef = useRef(new Set<string>());
  const announcedGroupKeysRef = useRef(new Set<string>());
  const lastAppliedRemoteBubbleRef = useRef<BubbleStyleId | null>(null);
  const seededInitialBubbleSyncRef = useRef(false);
  const stickerFavoritesRef = useRef<StickerMedia[]>([]);
  const localDeviceSyncRef = useRef<LocalDeviceSyncKeypair | null>(null);
  const [activeDeviceSyncCode, setActiveDeviceSyncCode] = useState<string | null>(null);
  const [pendingDeviceSyncRequests, setPendingDeviceSyncRequests] = useState<DeviceSyncRequest[]>([]);
  const [remoteVaultSealed, setRemoteVaultSealed] = useState<SealedE2EEVault | null>(null);
  const [, bumpE2EEHydration] = useState(0);
  const triggerE2EERerender = useCallback(() => {
    bumpE2EEHydration((v) => v + 1);
  }, []);
  const e2eeSnapshot = useE2EESnapshot();

  const cacheVersion = useChatCacheVersion();

  useEffect(() => {
    void preloadSlotChatCache(slotId);
  }, [slotId]);

  const hasStoredAuth = useMemo(
    () => hasStoredAuthForSlot(convexUrl, slotId),
    [authLoading, convexUrl, isAuthenticated, slotId],
  );
  const bootstrapCache = useMemo(() => {
    void cacheVersion;
    return getSlotBootstrapCache(slotId);
  }, [cacheVersion, slotId]);
  const cachedSlotMe = useMemo<JaUser | null>(() => {
    if (bootstrapCache?.me) return bootstrapCache.me;
    const saved = getMultiAccountState().accounts.find(
      (a) => a.slotId === slotId && a.userId && a.username,
    );
    if (!saved) return null;
    return {
      id: saved.userId,
      username: saved.username,
      displayName: saved.displayName || saved.username,
      email: saved.email,
      bio: "",
      pronouns: "",
      avatarColor: saved.avatarColor || "#5865f2",
      avatarUrl: saved.avatarUrl,
      statusPreference: saved.statusPreference ?? "online",
      onboardingComplete: true,
    };
  }, [bootstrapCache?.me, slotId]);

  const canUseCachedSession = isAuthenticated || (authLoading && hasStoredAuth);



  const rawMe: JaUser | null | undefined = isAuthenticated
    ? meQuery !== undefined
      ? meQuery
      : cachedSlotMe ?? undefined
    : canUseCachedSession
      ? cachedSlotMe ?? undefined
      : null;

  const me: JaUser | null | undefined = useMemo(() => {
    if (!rawMe) return rawMe;
    const unpacked = unpackAvatarColorWithMeta(
      rawMe.avatarColor,
      rawMe.socials,
      rawMe.website,
      rawMe.syncedTheme,
    );
    return {
      ...rawMe,
      avatarColor: unpacked.avatarColor,
      socials: unpacked.socials,
      website: unpacked.website,
      syncedTheme: unpacked.syncedTheme,
    };
  }, [rawMe]);

  useEffect(() => {
    setThemeUserScope(me?.id);
    if (me?.id) {
      applyRemoteSyncedThemeIfChanged(me.id, me.syncedTheme, meQuery !== undefined);
    }
  }, [me?.id, me?.syncedTheme, meQuery]);

  const userChatPrefs = useUserChatPrefs(me?.id);

  useEffect(() => {
    if (!isAuthenticated || !me?.id || !meQuery?.id) return;
    saveSlotBootstrapCache(slotId, { me });
    void syncActiveUserToSavedAccounts(me, convexUrl);
  }, [convexUrl, isAuthenticated, me, meQuery?.id, slotId]);

  const rawFriends = useMemo(
    () =>
      (rawFriendsQuery !== undefined
        ? rawFriendsQuery
        : canUseCachedSession
          ? (bootstrapCache?.friends ?? [])
          : []
      ).map((f) => {
        const unpacked = unpackAvatarColorWithMeta(f.avatarColor, f.socials, f.website);
        return {
          ...f,
          avatarColor: unpacked.avatarColor,
          socials: unpacked.socials,
          website: unpacked.website,
        };
      }),
    [bootstrapCache?.friends, canUseCachedSession, rawFriendsQuery],
  );
  const [localUnfriendedIds, setLocalUnfriendedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(getScopedStorageKey("jatext:unfriended:v1"));
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const rawPreviews = useMemo(() => previewsQuery ?? [], [previewsQuery]);
  const friends = useMemo(() => {
    const hiddenSet = new Set(localUnfriendedIds);
    const previewSource =
      previewsQuery !== undefined
        ? rawPreviews
        : canUseCachedSession
          ? (bootstrapCache?.previews ?? [])
          : [];
    for (const p of previewSource) {
      if (p.body === "__JATEXT_CALL_SIG__:{\"kind\":\"unfriend\"}") {
        hiddenSet.add(p.friendId);
      }
    }
    return rawFriends.filter((f) => !hiddenSet.has(f.id));
  }, [bootstrapCache?.previews, canUseCachedSession, localUnfriendedIds, previewsQuery, rawFriends, rawPreviews]);

  useEffect(() => {
    if (!isAuthenticated || rawFriendsQuery === undefined) return;
    saveSlotBootstrapCache(slotId, { friends });
  }, [friends, isAuthenticated, rawFriendsQuery, slotId]);

  const previews = useMemo(() => {
    // Reference e2eeSnapshot.version so previews re-decrypt immediately when keys arrive
    void e2eeSnapshot.version;
    void cacheVersion;
    if (previewsQuery === undefined) {
      return canUseCachedSession ? (bootstrapCache?.previews ?? []) : [];
    }
    if (!me?.id) return rawPreviews;
    const cachedByFriend = new Map(
      (bootstrapCache?.previews ?? []).map((p) => [p.friendId, p]),
    );
    return rawPreviews.map((raw) => {
      const hydrated = hydrateDecryptedChatPreview(raw, me.id, triggerE2EERerender);
      let resolvedBody = hydrated.body;
      let effectiveSenderId = hydrated.senderId;
      let effectiveCreatedAt = hydrated.createdAt;

      if (isPlaceholderEncryptedText(resolvedBody)) {
        const cached = cachedByFriend.get(hydrated.friendId);
        if (
          cached &&
          cached.createdAt === hydrated.createdAt &&
          cached.body &&
          !isPlaceholderEncryptedText(cached.body) &&
          !isSilentWireOrControlBody(cached.body)
        ) {
          resolvedBody = cached.body;
        }
      }

      const cachedConv = getCachedDmConversation(slotId, hydrated.friendId);
      const isControlHead =
        isSilentWireOrControlBody(raw.body) || isSilentWireOrControlBody(resolvedBody);

      if (isControlHead) {
        const lastVisibleCached = cachedConv?.messages
          ? [...cachedConv.messages]
              .reverse()
              .find((m) => !m.unsentAt && !isSilentWireOrControlBody(m.body))
          : undefined;
        const cachedPreview = cachedByFriend.get(hydrated.friendId);
        if (lastVisibleCached) {
          resolvedBody = lastVisibleCached.body || (lastVisibleCached.attachmentName ?? "");
          effectiveSenderId = lastVisibleCached.senderId;
          effectiveCreatedAt = lastVisibleCached.createdAt;
        } else if (cachedPreview && !isSilentWireOrControlBody(cachedPreview.body)) {
          resolvedBody = cachedPreview.body;
          effectiveSenderId = cachedPreview.senderId;
          effectiveCreatedAt = cachedPreview.createdAt;
        } else {
          resolvedBody = "";
        }
      }

      const isActivelyOpenDm =
        activeChatId === hydrated.friendId &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible";

      let unreadCount = raw.unreadCount;
      if (isActivelyOpenDm || effectiveSenderId === me.id) {
        unreadCount = 0;
      } else if (unreadCount === undefined) {
        const dmPrefs = userChatPrefs.dms[hydrated.friendId];
        if (cachedConv && cachedConv.messages.length > 0) {
          let myLatestSentTs = 0;
          for (const m of cachedConv.messages) {
            if (m.senderId === me.id && m.createdAt > myLatestSentTs) {
              myLatestSentTs = m.createdAt;
            }
          }
          const cutoff = Math.max(dmPrefs?.lastReadAt ?? 0, myLatestSentTs);
          const unreadInCached = cachedConv.messages.filter(
            (m) =>
              m.senderId === hydrated.friendId &&
              !m.unsentAt &&
              m.deliveryStatus !== "read" &&
              m.createdAt > cutoff &&
              !isSilentWireOrControlBody(m.body),
          ).length;
          const maxCachedTs = cachedConv.messages.at(-1)?.createdAt ?? 0;
          const extraUnfetched = (dmPrefs?.unreadTimestamps ?? []).filter(
            (t) => t > cutoff && t > maxCachedTs,
          ).length;
          unreadCount = unreadInCached + extraUnfetched;
        } else {
          const cutoff = dmPrefs?.lastReadAt ?? 0;
          unreadCount = isControlHead
            ? 0
            : (dmPrefs?.unreadTimestamps ?? []).filter((t) => t > cutoff).length;
        }
      }

      return {
        ...hydrated,
        senderId: effectiveSenderId,
        createdAt: effectiveCreatedAt,
        body: resolvedBody,
        unreadCount,
      };
    });
  }, [
    activeChatId,
    bootstrapCache?.previews,
    cacheVersion,
    canUseCachedSession,
    e2eeSnapshot.version,
    me?.id,
    previewsQuery,
    rawPreviews,
    slotId,
    triggerE2EERerender,
    userChatPrefs.dms,
  ]);

  useEffect(() => {
    if (!me?.id || previewsQuery === undefined) return;
    const rawByFriend = new Map(rawPreviews.map((r) => [r.friendId, r]));
    const batch: Array<{ friendId: string; createdAt: number; isFromFriend: boolean }> = [];
    for (const p of previews) {
      const raw = rawByFriend.get(p.friendId);
      if (
        p.createdAt > 0 &&
        p.body &&
        !isPlaceholderEncryptedText(p.body) &&
        !isSilentWireOrControlBody(p.body) &&
        (!raw || !isSilentWireOrControlBody(raw.body))
      ) {
        batch.push({
          friendId: p.friendId,
          createdAt: p.createdAt,
          isFromFriend: p.senderId === p.friendId,
        });
      }
    }
    recordIncomingDmPreviewsBatch(me.id, batch);
  }, [me?.id, previews, previewsQuery, rawPreviews]);

  useEffect(() => {
    if (!isAuthenticated || previewsQuery === undefined) return;
    saveSlotBootstrapCache(slotId, { previews });
  }, [isAuthenticated, previews, previewsQuery, slotId]);


  const cachedDm = useMemo(() => {
    void cacheVersion;
    return canUseCachedSession && activeChatId && activeChatId !== OFFICIAL_COMMUNITY_ID
      ? getCachedDmConversation(slotId, activeChatId)
      : null;
  }, [activeChatId, cacheVersion, canUseCachedSession, slotId]);
  useEffect(() => {
    if (!e2eeSnapshot.ready) return;
    if (activeMessagesQuery) {
      void scanDmRowsForE2EESignalsAsync(activeMessagesQuery as ChatMessage[]);
    } else if (cachedDm?.rawRows?.length) {
      void scanDmRowsForE2EESignalsAsync(cachedDm.rawRows);
    }
  }, [activeMessagesQuery, cachedDm?.rawRows, e2eeSnapshot.myKeyId, e2eeSnapshot.ready]);
  const dmFold = useMemo(() => {
    void e2eeSnapshot.version;
    const peerId = activeChatId && activeChatId !== OFFICIAL_COMMUNITY_ID ? activeChatId : "";
    const sourceRows =
      activeMessagesQuery !== undefined
        ? (activeMessagesQuery as ChatMessage[])
        : (cachedDm?.rawRows ?? []);
    const hydrated = sourceRows.map((row) =>
      normalizeDirectMessage(hydrateDecryptedDmMessage(row, peerId, triggerE2EERerender)),
    );
    const folded = foldReactionSignals(hydrated, optimisticReactions);
    if (activeMessagesQuery !== undefined) {
      return {
        ...folded,
        messages: mergeLiveWithCachedMessages(folded.messages, cachedDm?.messages),
      };
    }
    if (!cachedDm) {
      return { ...folded, messages: [] as ChatMessage[] };
    }
    if (cachedDm.rawRows?.length && e2eeSnapshot.ready && folded.messages.length > 0) {
      return {
        ...folded,
        messages: mergeLiveWithCachedMessages(folded.messages, cachedDm.messages),
      };
    }
    return {
      ...folded,
      messages: cachedDm.messages,
    };
  }, [
    activeChatId,
    activeMessagesQuery,
    cachedDm,
    e2eeSnapshot.ready,
    e2eeSnapshot.version,
    optimisticReactions,
    triggerE2EERerender,
  ]);
  const activeMessages = dmFold.messages;
  useEffect(() => {
    if (
      !isAuthenticated ||
      !activeChatId ||
      activeChatId === OFFICIAL_COMMUNITY_ID ||
      activeMessagesQuery === undefined
    ) {
      return;
    }
    setCachedDmConversation(
      slotId,
      activeChatId,
      activeMessages,
      activeMessagesQuery as ChatMessage[],
    );
  }, [activeChatId, activeMessages, activeMessagesQuery, isAuthenticated, slotId]);

  const communityFold = useMemo(
    () =>
      foldReactionSignals(
        ((communityMessagesQuery ?? []) as CommunityMessage[]).map(normalizeCommunityMessage),
        optimisticReactions,
        localCommunityReactions,
      ),
    [communityMessagesQuery, localCommunityReactions, optimisticReactions],
  );
  const communityMessages = useMemo(
    () =>
      communityMessagesQuery !== undefined
        ? communityFold.messages
        : canUseCachedSession
          ? (bootstrapCache?.communityMessages ?? [])
          : [],
    [bootstrapCache?.communityMessages, canUseCachedSession, communityFold.messages, communityMessagesQuery],
  );
  useEffect(() => {
    if (!isAuthenticated || communityMessagesQuery === undefined) return;
    saveSlotBootstrapCache(slotId, { communityMessages });
  }, [communityMessages, communityMessagesQuery, isAuthenticated, slotId]);

  const communityMuted = userChatPrefs.communityMuted;
  const communityUnreadCount = useMemo(() => {
    if (!me?.id) return 0;
    const cutoff = userChatPrefs.communityLastReadAt || userChatPrefs.initializedAt || 0;
    if (!cutoff) return 0;
    return communityMessages.reduce((count, msg) => {
      if (
        msg.senderId !== me.id &&
        !msg.unsentAt &&
        msg.createdAt > cutoff &&
        !msg.body.startsWith("__JATEXT_REACT__:")
      ) {
        return count + 1;
      }
      return count;
    }, 0);
  }, [
    communityMessages,
    me?.id,
    userChatPrefs.communityLastReadAt,
    userChatPrefs.initializedAt,
  ]);

  const groups = useMemo(() => {
    void e2eeSnapshot.version;
    void cacheVersion;
    const baseGroups =
      groupsQuery !== undefined
        ? groupsQuery
        : canUseCachedSession
          ? (bootstrapCache?.groups ?? [])
          : [];
    const cachedByGroup = new Map(
      (bootstrapCache?.groups ?? []).map((g) => [g.id, g]),
    );
    return baseGroups.map((rawGroup) => {
      const group = me?.id
        ? hydrateDecryptedGroupSummary(
            rawGroup,
            me.id,
            me.username,
            triggerE2EERerender,
          )
        : rawGroup;
      const formatted = formatGroupReactionPreview(group.lastMessage);
      let nextGroup = formatted.isSignal
        ? { ...group, lastMessage: formatted.text }
        : group;
      if (isPlaceholderEncryptedText(nextGroup.lastMessage)) {
        const cached = cachedByGroup.get(nextGroup.id);
        if (
          cached &&
          cached.lastMessageAt === nextGroup.lastMessageAt &&
          cached.lastMessage &&
          !isPlaceholderEncryptedText(cached.lastMessage) &&
          !isSilentWireOrControlBody(cached.lastMessage)
        ) {
          nextGroup = { ...nextGroup, lastMessage: cached.lastMessage };
        }
      }

      const cachedGrpConv = getCachedGroupConversation(slotId, nextGroup.id);
      const isControlHead =
        isSilentWireOrControlBody(rawGroup.lastMessage) ||
        isSilentWireOrControlBody(group.lastMessage) ||
        (formatted.isSignal && !formatted.text);

      if (isControlHead && !(formatted.isSignal && formatted.text)) {
        const lastVisibleCached = cachedGrpConv?.messages
          ? [...cachedGrpConv.messages]
              .reverse()
              .find((m) => !m.unsentAt && !isSilentWireOrControlBody(m.body))
          : undefined;
        const cachedSummary = cachedByGroup.get(nextGroup.id);
        if (lastVisibleCached) {
          nextGroup = {
            ...nextGroup,
            lastMessage:
              lastVisibleCached.body ||
              (lastVisibleCached.attachmentName ??
                (lastVisibleCached.stickerName ? "Sticker" : "")),
            lastSenderId: lastVisibleCached.senderId,
            lastSenderName: lastVisibleCached.senderName,
            lastMessageAt: lastVisibleCached.createdAt,
            lastMentionedMe: false,
          };
        } else if (
          cachedSummary &&
          cachedSummary.lastMessage &&
          !isSilentWireOrControlBody(cachedSummary.lastMessage) &&
          !isPlaceholderEncryptedText(cachedSummary.lastMessage)
        ) {
          nextGroup = {
            ...nextGroup,
            lastMessage: cachedSummary.lastMessage,
            lastSenderId: cachedSummary.lastSenderId,
            lastSenderName: cachedSummary.lastSenderName,
            lastMessageAt: cachedSummary.lastMessageAt,
            lastMentionedMe: false,
          };
        } else {
          nextGroup = {
            ...nextGroup,
            lastMessage: "",
            lastSenderId: undefined,
            lastSenderName: undefined,
            lastMentionedMe: false,
          };
        }
      }

      const localGrp = userChatPrefs.groups[nextGroup.id];
      const clearedAt = localGrp?.clearedAt ?? 0;
      const isSilenced = nextGroup.isSilenced ?? localGrp?.isSilenced ?? false;
      const isArchived = nextGroup.isArchived ?? localGrp?.isArchived ?? false;
      const historyCleared = Boolean(
        clearedAt > 0 && (!nextGroup.lastMessageAt || nextGroup.lastMessageAt <= clearedAt),
      );
      const isActivelyOpenGroup =
        activeGroupId === nextGroup.id &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible";

      let unreadCount = historyCleared ? 0 : nextGroup.unreadCount;
      if (isActivelyOpenGroup || (me?.id && nextGroup.lastSenderId === me.id)) {
        unreadCount = 0;
      } else if (unreadCount === undefined) {
        if (cachedGrpConv && cachedGrpConv.messages.length > 0 && me?.id) {
          let myLatestSentTs = 0;
          for (const m of cachedGrpConv.messages) {
            if (m.senderId === me.id && m.createdAt > myLatestSentTs) {
              myLatestSentTs = m.createdAt;
            }
          }
          const cutoff = Math.max(
            clearedAt,
            localGrp?.lastReadAt ?? userChatPrefs.initializedAt ?? 0,
            myLatestSentTs,
          );
          const exactCount = cachedGrpConv.messages.filter(
            (m) =>
              m.senderId !== me.id &&
              !m.unsentAt &&
              m.createdAt > cutoff &&
              !isSilentWireOrControlBody(m.body),
          ).length;
          const maxCachedTs = cachedGrpConv.messages.at(-1)?.createdAt ?? 0;
          const extraUnfetched = (localGrp?.unreadTimestamps ?? []).filter(
            (t) => t > cutoff && t > maxCachedTs,
          ).length;
          unreadCount = exactCount + extraUnfetched;
        } else {
          const cutoff = Math.max(
            clearedAt,
            localGrp?.lastReadAt ?? userChatPrefs.initializedAt ?? 0,
          );
          unreadCount =
            isControlHead || formatted.isSignal
              ? 0
              : (localGrp?.unreadTimestamps ?? []).filter((t) => t > cutoff).length;
        }
      }

      const finalUnread = unreadCount ?? 0;
      return {
        ...nextGroup,
        ...(historyCleared
          ? {
              lastMessage: "",
              lastSenderId: undefined,
              lastSenderName: undefined,
              lastMentionedMe: false,
            }
          : finalUnread === 0
            ? { lastMentionedMe: false }
            : {}),
        isSilenced,
        isArchived,
        unreadCount: finalUnread,
      };
    });
  }, [
    activeGroupId,
    bootstrapCache?.groups,
    cacheVersion,
    canUseCachedSession,
    e2eeSnapshot.version,
    groupsQuery,
    me?.id,
    me?.username,
    slotId,
    triggerE2EERerender,
    userChatPrefs.groups,
    userChatPrefs.initializedAt,
  ]);

  useEffect(() => {
    if (!me?.id || groupsQuery === undefined) return;
    const rawByGroup = new Map(groupsQuery.map((g) => [g.id, g]));
    const batch: Array<{ groupId: string; lastMessageAt: number; isFromOther: boolean }> = [];
    for (const grp of groups) {
      const raw = rawByGroup.get(grp.id);
      const rawDecryptedReaction = raw
        ? formatGroupReactionPreview(
            hydrateDecryptedGroupSummary(raw, me.id, me.username).lastMessage,
          ).isSignal
        : false;
      if (
        grp.lastMessageAt > 0 &&
        grp.lastMessage &&
        !isPlaceholderEncryptedText(grp.lastMessage) &&
        !isSilentWireOrControlBody(grp.lastMessage) &&
        !rawDecryptedReaction &&
        (!raw || !isSilentWireOrControlBody(raw.lastMessage))
      ) {
        batch.push({
          groupId: grp.id,
          lastMessageAt: grp.lastMessageAt,
          isFromOther: Boolean(grp.lastSenderId && grp.lastSenderId !== me.id),
        });
      }
    }
    recordIncomingGroupSummariesBatch(me.id, batch);
  }, [groups, groupsQuery, me?.id, me?.username]);

  useEffect(() => {
    if (!me?.id) return;
    const dmIds = previews
      .filter((p) => p.isArchived || p.isMuted)
      .map((p) => p.friendId);
    const groupIds = groups
      .filter((g) => g.isArchived || g.isSilenced)
      .map((g) => g.id);
    syncSuppressedPushTargetsToNative({
      dmIds,
      groupIds,
      communityMuted,
    });
  }, [communityMuted, groups, me?.id, previews]);

  useEffect(() => {
    if (!isAuthenticated || groupsQuery === undefined) return;
    saveSlotBootstrapCache(slotId, { groups });
  }, [groups, groupsQuery, isAuthenticated, slotId]);

  const cachedGroup = useMemo(() => {
    void cacheVersion;
    return canUseCachedSession && activeGroupId
      ? getCachedGroupConversation(slotId, activeGroupId)
      : null;
  }, [activeGroupId, cacheVersion, canUseCachedSession, slotId]);
  const liveOrCachedGroupDetails: GroupDetails | null =
    groupDetailsQuery !== undefined
      ? ((groupDetailsQuery ?? null) as GroupDetails | null)
      : canUseCachedSession
        ? (cachedGroup?.details ?? null)
        : null;
  const groupDetails = useMemo<GroupDetails | null>(() => {
    if (liveOrCachedGroupDetails) return liveOrCachedGroupDetails;
    if (!canUseCachedSession || !activeGroupId || groupDetailsQuery === null) return null;
    const summary = groups.find((g) => g.id === activeGroupId);
    if (!summary) return null;
    return {
      id: summary.id,
      name: summary.name,
      avatarUrl: summary.avatarUrl,
      ownerId: summary.ownerId,
      role: summary.role,
      members: me
        ? [
            {
              ...me,
              role: summary.role,
              muted: false,
            },
          ]
        : [],
    };
  }, [activeGroupId, canUseCachedSession, groupDetailsQuery, groups, liveOrCachedGroupDetails, me]);

  useEffect(() => {
    if (!e2eeSnapshot.ready) return;
    if (groupMessagesQuery) {
      void scanGroupRowsForE2EESignalsAsync(groupMessagesQuery as GroupMessage[]);
    } else if (cachedGroup?.rawRows?.length) {
      void scanGroupRowsForE2EESignalsAsync(cachedGroup.rawRows);
    }
  }, [cachedGroup?.rawRows, e2eeSnapshot.myKeyId, e2eeSnapshot.ready, groupMessagesQuery]);
  const activeGroupClearedAt = activeGroupId
    ? (userChatPrefs.groups[activeGroupId]?.clearedAt ?? 0)
    : 0;
  const groupFold = useMemo(() => {
    void e2eeSnapshot.version;
    const gid = activeGroupId ?? "";
    const filterCleared = (items: GroupMessage[]) =>
      activeGroupClearedAt > 0
        ? items.filter((m) => m.createdAt > activeGroupClearedAt)
        : items;
    const sourceRows =
      groupMessagesQuery !== undefined
        ? (groupMessagesQuery as GroupMessage[])
        : (cachedGroup?.rawRows ?? []);
    const hydrated = sourceRows.map((row) =>
      normalizeGroupMessage(hydrateDecryptedGroupMessage(row, gid, groupDetails, triggerE2EERerender)),
    );
    const folded = foldReactionSignals(hydrated, optimisticReactions);
    if (groupMessagesQuery !== undefined) {
      return {
        ...folded,
        messages: filterCleared(
          mergeLiveWithCachedMessages(folded.messages, cachedGroup?.messages),
        ),
      };
    }
    if (!cachedGroup) {
      return { ...folded, messages: [] as GroupMessage[] };
    }
    if (cachedGroup.rawRows?.length && e2eeSnapshot.ready && folded.messages.length > 0) {
      return {
        ...folded,
        messages: filterCleared(
          mergeLiveWithCachedMessages(folded.messages, cachedGroup.messages),
        ),
      };
    }
    return {
      ...folded,
      messages: filterCleared(cachedGroup.messages),
    };
  }, [
    activeGroupClearedAt,
    activeGroupId,
    cachedGroup,
    e2eeSnapshot.ready,
    e2eeSnapshot.version,
    groupDetails,
    groupMessagesQuery,
    optimisticReactions,
    triggerE2EERerender,
  ]);
  const groupMessages = groupFold.messages;
  useEffect(() => {
    if (!isAuthenticated || !activeGroupId) return;
    if (groupDetailsQuery === undefined && groupMessagesQuery === undefined) return;
    setCachedGroupConversation(slotId, activeGroupId, {
      ...(groupDetailsQuery !== undefined
        ? { details: (groupDetailsQuery ?? null) as GroupDetails | null }
        : {}),
      ...(groupMessagesQuery !== undefined
        ? {
            messages: groupMessages,
            rawRows: groupMessagesQuery as GroupMessage[],
          }
        : {}),
    });
  }, [
    activeGroupId,
    groupDetailsQuery,
    groupMessages,
    groupMessagesQuery,
    isAuthenticated,
    slotId,
  ]);

  const setActiveChatIdForStore = useCallback((id: string | null) => {
    setActiveChatId(id);
    if (id) setActiveGroupIdState(null);
  }, []);
  const setActiveGroupId = useCallback((id: string | null) => {
    setActiveGroupIdState(id);
    if (id) setActiveChatId(null);
  }, []);

  useEffect(() => {
    if (
      !Capacitor.isNativePlatform() ||
      !isAuthenticated ||
      !notificationPreferences.notificationsEnabled
    ) {
      return;
    }

    let disposed = false;
    const listeners: PluginListenerHandle[] = [];
    const requestRegistration = async () => {
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") {
        setPushRegistrationStatus("error");
        return;
      }
      try {
        await PushNotifications.createChannel({
          id: "messages",
          name: "Messages",
          description: "New JaText messages",
          importance: 5,
          sound: "default",
        });
      } catch (error: unknown) {
        console.warn("Could not create Android notification channel.", error);
      }
      const firebaseConfigured = await checkNativeFirebaseConfigured();
      if (!firebaseConfigured) {
        if (!disposed) setPushRegistrationStatus("unavailable");
        return;
      }
      if (!disposed) {
        setPushRegistrationStatus("registering");
        await PushNotifications.register();
      }
    };
    const registerForPush = async () => {
      const firebaseConfigured = await checkNativeFirebaseConfigured();
      if (!firebaseConfigured) {
        await requestRegistration();
        return;
      }
      listeners.push(
        await PushNotifications.addListener("registration", async ({ value: token }) => {
          if (disposed) return;
          setPushRegistrationStatus("registering");
          const previousToken = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
          try {
            await registerPushDeviceMut({ token });
            localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
            setPushRegistrationStatus("registered");
          } catch (error: unknown) {
            setPushRegistrationStatus("error");
            console.error("Could not register this device for push notifications.", error);
            return;
          }
          if (previousToken && previousToken !== token) {
            await unregisterPushDeviceMut({ token: previousToken }).catch((error: unknown) => {
              console.error("Could not remove the previous push token.", error);
            });
          }
        }),
      );
      listeners.push(
        await PushNotifications.addListener("registrationError", (error) => {
          setPushRegistrationStatus("error");
          console.error("Android push registration failed.", error);
        }),
      );
      listeners.push(
        await PushNotifications.addListener("pushNotificationReceived", () => {
          triggerImmediateTursoSync(true);
        }),
      );
      listeners.push(
        await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
          triggerImmediateTursoSync(true);
          const groupId = notification.data?.groupId;
          const senderId = notification.data?.senderId;
          if (typeof groupId === "string" && groupId) setActiveGroupId(groupId);
          else if (typeof senderId === "string") setActiveChatIdForStore(senderId);
        }),
      );
      listeners.push(
        await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            void PushNotifications.removeAllDeliveredNotifications().catch(() => undefined);
            void requestRegistration().catch((error: unknown) => {
              setPushRegistrationStatus("error");
              console.error("Could not refresh Android push registration.", error);
            });
          }
        }),
      );
      void PushNotifications.removeAllDeliveredNotifications().catch(() => undefined);
      await requestRegistration();
    };

    void registerForPush().catch((error: unknown) => {
      setPushRegistrationStatus("error");
      console.error("Could not initialize Android push notifications.", error);
    });
    return () => {
      disposed = true;
      for (const listener of listeners) void listener.remove();
    };
  }, [
    isAuthenticated,
    notificationPreferences.notificationsEnabled,
    registerPushDeviceMut,
    setActiveChatIdForStore,
    setActiveGroupId,
    unregisterPushDeviceMut,
  ]);

  const refreshPushRegistration = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || !isAuthenticated) {
      throw new Error("Sign in to JaText on the Android app before refreshing push registration.");
    }
    if (!notificationPreferences.notificationsEnabled) {
      throw new Error("Turn on push notifications in Settings before refreshing registration.");
    }
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") {
      throw new Error("Allow JaText notifications in Android settings, then try again.");
    }
    const firebaseConfigured = await checkNativeFirebaseConfigured();
    if (!firebaseConfigured) {
      setPushRegistrationStatus("unavailable");
      throw new Error(
        "In-app alerts are active, while background FCM push requires google-services.json in the APK build.",
      );
    }
    setPushRegistrationStatus("registering");
    await PushNotifications.register();
  }, [isAuthenticated, notificationPreferences.notificationsEnabled]);

  useEffect(() => {
    if (
      !Capacitor.isNativePlatform() ||
      !isAuthenticated ||
      notificationPreferences.notificationsEnabled
    ) {
      return;
    }
    const token = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    if (!token) return;
    void unregisterPushDeviceMut({ token })
      .then(() => localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY))
      .catch((error: unknown) => {
        console.error("Could not disable push notifications for this device.", error);
      });
  }, [isAuthenticated, notificationPreferences.notificationsEnabled, unregisterPushDeviceMut]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let lastActivityAt = Date.now();
    const markActive = () => {
      lastActivityAt = Date.now();
    };
    const heartbeat = () => {
      void heartbeatMut({
        active:
          document.visibilityState === "visible" &&
          Date.now() - lastActivityAt < 5 * 60_000,
      }).catch(() => undefined);
    };
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        lastActivityAt = Date.now();
        heartbeat();
      }
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "mousemove"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    heartbeat();
    const interval = window.setInterval(heartbeat, 25_000);
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, markActive));
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [heartbeatMut, isAuthenticated]);


  const setCommunityModerators = useCallback<JaTextStore["setCommunityModerators"]>(
    async (userIds) => {
      await setCommunityModeratorsMut({ userIds: userIds });
    },
    [setCommunityModeratorsMut],
  );
  const sendCommunityText = useCallback<JaTextStore["sendCommunityText"]>(
    async (body, file, replyToId, forwardedFromId) => {
      const trimmed = body.trim();
      const style = isControlPayload(trimmed) ? "default" : getSavedOutgoingBubbleStyle();
      const wireBody = style === "default" ? trimmed : attachBubbleStyleToOutgoing(trimmed, style);
      const wireFile = file && style !== "default" ? attachBubbleStyleToFile(file, style) : file;
      const attachmentId = wireFile ? await upload(wireFile) : undefined;
      await sendCommunityTextMut({
        body: wireBody,
        ...(attachmentId
          ? { attachmentId, attachmentName: wireFile!.name, attachmentType: wireFile!.type }
          : {}),
        ...(replyToId ? { replyToId: replyToId } : {}),
        ...(forwardedFromId ? { forwardedFromId: forwardedFromId } : {}),
      });
    },
    [sendCommunityTextMut, upload],
  );
  const sendCommunitySticker = useCallback<JaTextStore["sendCommunitySticker"]>(
    async (sticker, replyToId) => {
      await sendCommunityStickerMut({
        ...(sticker.source === "klipy" ? { stickerUrl: sticker.url } : {}),
        ...(sticker.storageId ? { stickerStorageId: sticker.storageId } : {}),
        stickerName: sticker.name,
        stickerKey: sticker.key,
        ...(replyToId ? { replyToId: replyToId } : {}),
      });
    },
    [sendCommunityStickerMut],
  );
  const setCommunityTyping = useCallback<JaTextStore["setCommunityTyping"]>(
    async (isTyping) => {
      await setCommunityTypingMut({ isTyping });
    },
    [setCommunityTypingMut],
  );
  const createCommunityPoll = useCallback<JaTextStore["createCommunityPoll"]>(
    async (question, options) => {
      await createCommunityPollMut({ question, options });
    },
    [createCommunityPollMut],
  );
  const voteCommunityPoll = useCallback<JaTextStore["voteCommunityPoll"]>(
    async (pollId, optionIndex) => {
      await voteCommunityPollMut({ pollId: pollId, optionIndex });
    },
    [voteCommunityPollMut],
  );
  const endCommunityPoll = useCallback<JaTextStore["endCommunityPoll"]>(
    async (pollId) => {
      await endCommunityPollMut({ pollId: pollId });
    },
    [endCommunityPollMut],
  );
  const editCommunityMessage = useCallback<JaTextStore["editCommunityMessage"]>(
    async (messageId, body) => {
      const existing = communityMessages.find((m) => m.id === messageId);
      const preserved = attachBubbleStyleToOutgoing(
        body.trim(),
        existing?.bubbleStyle ?? "default",
      );
      await editCommunityMessageMut({
        messageId: messageId,
        body: preserved,
      });
    },
    [communityMessages, editCommunityMessageMut],
  );
  const deleteCommunityMessage = useCallback<JaTextStore["deleteCommunityMessage"]>(
    async (messageId) => {
      await deleteCommunityMessageMut({ messageId: messageId });
    },
    [deleteCommunityMessageMut],
  );
  const clearOptimisticReactionLater = useCallback((messageId: string) => {
    window.setTimeout(() => {
      setOptimisticReactions((prev) => {
        if (!(messageId in prev)) return prev;
        const copy = { ...prev };
        delete copy[messageId];
        return copy;
      });
    }, 550);
  }, []);

  const toggleCommunityReaction = useCallback<JaTextStore["toggleCommunityReaction"]>(
    async (messageId, emoji) => {
      const cleanEmoji = emoji.trim();
      if (!cleanEmoji || !me) return;
      const targetMsg = communityFold.messages.find((m) => m.id === messageId);
      const currentMyEmojis = Array.from(
        new Set(
          (targetMsg?.reactions ?? [])
            .filter((r) => r.userId === me.id)
            .map((r) => r.emoji),
        ),
      );
      const shouldRemove = currentMyEmojis.includes(cleanEmoji);
      const nextMyEmojis = shouldRemove
        ? currentMyEmojis.filter((e) => e !== cleanEmoji)
        : [...currentMyEmojis, cleanEmoji];
      const key = `${messageId}:${me.id}`;
      const existingSignal = communityFold.signalsByTargetUser.get(key);
      const nativeEmojis = communityFold.nativeReactionsByTargetUser.get(key) ?? [];

      setOptimisticReactions((prev) => ({
        ...prev,
        [messageId]: { userId: me.id, emojis: nextMyEmojis },
      }));

      const writeSignal = async (op: ReactionSignalOp, sigEmojis: string[]) => {
        const body = serializeReactionSignal({
          kind: "reaction",
          targetId: messageId,
          emoji: sigEmojis[0] ?? "",
          emojis: sigEmojis,
          op,
          ts: Date.now(),
        });
        if (existingSignal) {
          try {
            await editCommunityMessageMut({
              messageId: existingSignal.rowId,
              body,
            });
            return;
          } catch {
            // Fall through to inserting a fresh signal row if prior row is no longer editable.
          }
        }
        await sendCommunityTextMut({ body });
      };

      try {
        // Single legacy reaction (0 or 1 emoji) with no multi-emoji needed:
        if (
          nextMyEmojis.length <= 1 &&
          (nextMyEmojis.length === 0 || LEGACY_SERVER_REACTION_EMOJIS.has(nextMyEmojis[0])) &&
          !existingSignal
        ) {
          const single = nextMyEmojis[0] ?? null;
          if (single === null) {
            if (nativeEmojis.includes(cleanEmoji)) {
              await toggleCommunityReactionMut({
                messageId: messageId,
                emoji: cleanEmoji,
              });
            }
            setLocalCommunityReactions(saveLocalCommunityReaction(messageId, me.id, null));
          } else {
            if (!nativeEmojis.includes(single)) {
              await toggleCommunityReactionMut({
                messageId: messageId,
                emoji: single,
              });
            }
            setLocalCommunityReactions(saveLocalCommunityReaction(messageId, me.id, null));
          }
          return;
        }

        // Keep at most 1 legacy reaction synced on the native row for un-updated clients
        const firstLegacy = nextMyEmojis.find((e) => LEGACY_SERVER_REACTION_EMOJIS.has(e));
        if (firstLegacy && !nativeEmojis.includes(firstLegacy)) {
          await toggleCommunityReactionMut({
            messageId: messageId,
            emoji: firstLegacy,
          }).catch(() => undefined);
        } else if (!firstLegacy && nativeEmojis.length === 1) {
          await toggleCommunityReactionMut({
            messageId: messageId,
            emoji: nativeEmojis[0],
          }).catch(() => undefined);
        }

        if (communityPermissions.canModerate) {
          if (nextMyEmojis.length === 0) {
            await writeSignal("clear", []);
          } else {
            await writeSignal("set", nextMyEmojis);
          }
          setLocalCommunityReactions(saveLocalCommunityReaction(messageId, me.id, null));
        } else {
          setLocalCommunityReactions(saveLocalCommunityReaction(messageId, me.id, nextMyEmojis));
        }
      } catch (err) {
        setOptimisticReactions((prev) => {
          const copy = { ...prev };
          delete copy[messageId];
          return copy;
        });
        throw err;
      } finally {
        clearOptimisticReactionLater(messageId);
      }
    },
    [
      clearOptimisticReactionLater,
      communityFold,
      communityPermissions.canModerate,
      editCommunityMessageMut,
      me,
      sendCommunityTextMut,
      toggleCommunityReactionMut,
    ],
  );
  const deleteCommunityMessageForMe = useCallback<JaTextStore["deleteCommunityMessageForMe"]>(
    async (messageId) => {
      await deleteCommunityForMeMut({ messageId: messageId });
    },
    [deleteCommunityForMeMut],
  );
  const unsendCommunityMessage = useCallback<JaTextStore["unsendCommunityMessage"]>(
    async (messageId) => (await unsendCommunityMut({ messageId: messageId })) as boolean,
    [unsendCommunityMut],
  );
  const distributeGroupEpochToMembers = useCallback(
    async (
      groupId: string,
      epochNumber: number,
      epochSecretB64: string,
      targetMemberIds?: string[],
    ) => {
      const state = getActiveE2EEState();
      if (!state) return;
      const details =
        (activeGroupId === groupId ? groupDetails : null) ??
        await queryGroupDetails(groupId).catch(() => null);
      if (!details) return;

      const allowedSet = targetMemberIds ? new Set(targetMemberIds) : null;
      const memberBundles: PublicIdentityBundle[] = getAllMyIdentities(state).map(
        toPublicIdentityBundle,
      );
      for (const m of details.members) {
        if (m.id === state.userId) continue;
        if (allowedSet && !allowedSet.has(m.id)) continue;
        const peer = state.peerKeys[m.id];
        if (peer) {
          memberBundles.push(peer.bundle);
          for (const extraBundle of getPeerKnownBundles(peer)) {
            memberBundles.push(extraBundle);
          }
        }
      }

      const pkt = await createGroupKeySignalPacket({
        groupId,
        epoch: epochNumber,
        epochSecretB64,
        senderIdentity: state.primaryIdentity,
        memberBundles,
      });
      recordPacketSecretB64(pkt.epk, epochSecretB64);
      await sendGroupMessageMut({
        groupId: groupId,
        body: serializeGroupKeySignal(pkt),
      });
    },
    [activeGroupId, groupDetails, queryGroupDetails, sendGroupMessageMut],
  );

  const ensureGroupEpochReadyForSend = useCallback(
    async (groupId: string) => {
      let epochEntry = getLatestGroupEpoch(groupId);
      if (!epochEntry) {
        const rows = await queryGroupMessages(groupId).catch(() => []);
        if (rows.length > 0) {
          await scanGroupRowsForE2EESignalsAsync(rows);
          epochEntry = getLatestGroupEpoch(groupId);
        }
        if (!epochEntry) {
          const maxExistingEpoch = rows.reduce((mx, r) => {
            const pkt = parseGroupKeySignal(r.body);
            return pkt && pkt.ep > mx ? pkt.ep : mx;
          }, 0);
          const nextEpoch = maxExistingEpoch + 1;
          const secretB64 = generateGroupEpochSecretB64();
          epochEntry = await storeGroupEpochSecret(groupId, nextEpoch, secretB64);
          if (epochEntry) {
            await distributeGroupEpochToMembers(
              groupId,
              epochEntry.epoch,
              epochEntry.secretB64,
            ).catch(() => undefined);
          }
        }
      }
      return epochEntry;
    },
    [distributeGroupEpochToMembers, queryGroupMessages],
  );

  const forwardCommunityMessage: JaTextStore["forwardCommunityMessage"] = useCallback(
    async (messageId, target) => {
      const src = communityMessages.find((m) => m.id === messageId);
      if (!src) {
        if (target.groupId) {
          await sendCommunityForwardMut({ messageId: messageId, targetGroupId: target.groupId });
        } else if (target.userId) {
          await sendCommunityForwardMut({ messageId: messageId, targetUserId: target.userId });
        } else if (target.community) {
          await sendCommunityForwardMut({ messageId: messageId, targetCommunity: true });
        }
        return;
      }

      const fwdCtx: ForwardedMessageContext = src.forwardedContext ?? {
        v: 1,
        sourceKind: "community",
        originalMessageId: src.id,
        originalCreatedAt: src.createdAt,
        originalSenderId: src.senderId,
        originalSenderName: src.senderName || "JaText",
        originalSenderUsername: src.senderUsername,
        originalSenderAvatarUrl: src.senderAvatarUrl,
        originalSenderAvatarColor: src.senderAvatarColor,
      };
      const fwdText = encodeForwardedBody(src.body, fwdCtx);

      if (target.community) {
        await sendCommunityTextMut({
          body: fwdText,
          forwardedFromId: messageId,
        });
        return;
      }

      let fwdFile: File | undefined;
      let klipySticker: StickerMedia | undefined;
      const mediaUrl = src.attachmentUrl ?? src.stickerUrl;
      if (mediaUrl) {
        if (src.stickerKey?.startsWith("klipy:")) {
          klipySticker = {
            key: src.stickerKey,
            url: mediaUrl,
            name: src.stickerName || src.attachmentName || "GIF",
            mediaType: "gif",
            source: "klipy",
            isFavorite: false,
            useCount: 0,
          };
        } else {
          try {
            const resp = await fetch(mediaUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              fwdFile = new File([blob], src.attachmentName || src.stickerName || "forwarded", {
                type: src.attachmentType || blob.type || "application/octet-stream",
              });
            }
          } catch {
            // Ignore media fetch failure
          }
        }
      }

      if (target.userId) {
        const enc = await prepareOutgoingDmEncrypted({
          receiverId: target.userId,
          wireBody: fwdText,
          file: fwdFile,
          sticker: klipySticker,
          uploadFile: upload,
        });
        if (enc) {
          await sendMessageMut({
            receiverId: target.userId,
            body: enc.wireBody,
            ...(enc.attachmentId
              ? {
                  attachmentId: enc.attachmentId,
                  attachmentName: enc.attachmentName,
                  attachmentType: enc.attachmentType,
                }
              : {}),
          });
          return;
        }
        await sendCommunityForwardMut({ messageId: messageId, targetUserId: target.userId });
      } else if (target.groupId) {
        await ensureGroupEpochReadyForSend(target.groupId);
        const enc = await prepareOutgoingGroupEncrypted({
          groupId: target.groupId,
          wireBody: fwdText,
          file: fwdFile,
          sticker: klipySticker,
          uploadFile: upload,
        });
        if (enc) {
          await sendGroupMessageMut({
            groupId: target.groupId,
            body: enc.wireBody,
            ...(enc.attachmentId
              ? {
                  attachmentId: enc.attachmentId,
                  attachmentName: enc.attachmentName,
                  attachmentType: enc.attachmentType,
                }
              : {}),
          });
          return;
        }
        await sendCommunityForwardMut({ messageId: messageId, targetGroupId: target.groupId });
      }
    },
    [
      communityMessages,
      ensureGroupEpochReadyForSend,
      sendCommunityForwardMut,
      sendCommunityTextMut,
      sendGroupMessageMut,
      sendMessageMut,
      upload,
    ],
  );
  const favoriteCommunityStickerFromMessage: JaTextStore["favoriteCommunityStickerFromMessage"] = useCallback(
    async (messageId) => {
      await favoriteCommunityStickerFromMessageMut({ messageId: messageId });
    },
    [favoriteCommunityStickerFromMessageMut],
  );
  const createGroup = useCallback<JaTextStore["createGroup"]>(
    async (name, memberIds) => {
      const gid = (await createGroupMut({
        name,
        memberIds: memberIds,
      })) as string;
      const state = getActiveE2EEState();
      if (state) {
        await sendGroupMessageMut({
          groupId: gid,
          body: serializeIdentitySignal(state.primaryIdentity),
        }).catch(() => undefined);
        const epoch = await ensureInitialGroupEpoch(gid);
        if (epoch) {
          await distributeGroupEpochToMembers(gid, epoch.epoch, epoch.secretB64).catch(
            () => undefined,
          );
        }
      }
      return gid;
    },
    [createGroupMut, distributeGroupEpochToMembers, sendGroupMessageMut],
  );
  const addGroupMembers = useCallback<JaTextStore["addGroupMembers"]>(
    async (groupId, memberIds) => {
      await addGroupMembersMut({
        groupId: groupId,
        memberIds: memberIds,
      });
      const epoch = await ensureGroupEpochReadyForSend(groupId);
      if (epoch) {
        await distributeGroupEpochToMembers(groupId, epoch.epoch, epoch.secretB64).catch(
          () => undefined,
        );
      }
    },
    [addGroupMembersMut, distributeGroupEpochToMembers, ensureGroupEpochReadyForSend],
  );
  const sendGroupMessage = useCallback<JaTextStore["sendGroupMessage"]>(
    async (groupId, body, file, replyToId, forwardedFromId) => {
      const trimmed = body.trim();
      const targetGroupRole =
        (activeGroupId === groupId ? groupDetails?.role : undefined) ??
        groupsQuery?.find((g) => g.id === groupId)?.role ??
        "member";
      const canMentionEveryone =
        targetGroupRole === "owner" || targetGroupRole === "moderator";

      if (
        !isControlPayload(trimmed) &&
        /(?:^|[\s(])@everyone\b/i.test(trimmed) &&
        !canMentionEveryone
      ) {
        throw new Error("Only the group owner or moderators can mention @everyone.");
      }

      const style = isControlPayload(trimmed) ? "default" : getSavedOutgoingBubbleStyle();
      const wireBody = style === "default" ? trimmed : attachBubbleStyleToOutgoing(trimmed, style);
      const wireFile = file && style !== "default" ? attachBubbleStyleToFile(file, style) : file;

      // Do not double-encrypt raw E2EE bootstrap packets
      if (!trimmed.includes('"kind":"e2ee_ik"') && !trimmed.includes('"kind":"e2ee_gk"')) {
        await ensureGroupEpochReadyForSend(groupId);
        const enc = await prepareOutgoingGroupEncrypted({
          groupId,
          wireBody,
          file: wireFile,
          canMentionEveryone,
          uploadFile: upload,
        });
        if (enc) {
          await sendGroupMessageMut({
            groupId: groupId,
            body: enc.wireBody,
            ...(enc.attachmentId
              ? {
                  attachmentId: enc.attachmentId,
                  attachmentName: enc.attachmentName,
                  attachmentType: enc.attachmentType,
                }
              : {}),
            ...(replyToId ? { replyToId: replyToId } : {}),
            ...(forwardedFromId ? { forwardedFromId: forwardedFromId } : {}),
          });
          return;
        }
      }

      const attachmentId = wireFile ? await upload(wireFile) : undefined;
      await sendGroupMessageMut({
        groupId: groupId,
        body: wireBody,
        ...(attachmentId
          ? { attachmentId, attachmentName: wireFile!.name, attachmentType: wireFile!.type }
          : {}),
        ...(replyToId ? { replyToId: replyToId } : {}),
        ...(forwardedFromId ? { forwardedFromId: forwardedFromId } : {}),
      });
    },
    [
      activeGroupId,
      ensureGroupEpochReadyForSend,
      groupDetails?.role,
      groupsQuery,
      sendGroupMessageMut,
      upload,
    ],
  );
  const sendGroupSticker = useCallback<JaTextStore["sendGroupSticker"]>(
    async (groupId, sticker, replyToId) => {
      const style = getSavedOutgoingBubbleStyle();
      const stickerBody = style === "default" ? "" : attachBubbleStyleToOutgoing("", style);
      await ensureGroupEpochReadyForSend(groupId);
      const enc = await prepareOutgoingGroupEncrypted({
        groupId,
        wireBody: stickerBody,
        sticker,
        uploadFile: upload,
      });
      if (enc) {
        await sendGroupMessageMut({
          groupId: groupId,
          body: enc.wireBody,
          ...(enc.attachmentId
            ? {
                attachmentId: enc.attachmentId,
                attachmentName: enc.attachmentName,
                attachmentType: enc.attachmentType,
              }
            : {}),
          ...(replyToId ? { replyToId: replyToId } : {}),
        });
        return;
      }
      await sendGroupMessageMut({
        groupId: groupId,
        body: "",
        ...(replyToId ? { replyToId: replyToId } : {}),
        ...(sticker.source === "klipy" ? { stickerUrl: sticker.url } : {}),
        ...(sticker.storageId ? { stickerStorageId: sticker.storageId } : {}),
        stickerName: sticker.name,
        stickerKey: sticker.key,
      });
    },
    [ensureGroupEpochReadyForSend, sendGroupMessageMut, upload],
  );
  const setGroupTyping = useCallback<JaTextStore["setGroupTyping"]>(
    async (groupId, isTyping) => {
      await setGroupTypingMut({ groupId: groupId, isTyping });
    },
    [setGroupTypingMut],
  );
  const toggleGroupReaction = useCallback<JaTextStore["toggleGroupReaction"]>(
    async (messageId, emoji) => {
      const cleanEmoji = emoji.trim();
      if (!cleanEmoji || !me) return;
      const targetMsg = groupFold.messages.find((m) => m.id === messageId);
      const targetGroupId = activeGroupId;
      const currentMyEmojis = Array.from(
        new Set(
          (targetMsg?.reactions ?? [])
            .filter((r) => r.userId === me.id)
            .map((r) => r.emoji),
        ),
      );
      const shouldRemove = currentMyEmojis.includes(cleanEmoji);
      const nextMyEmojis = shouldRemove
        ? currentMyEmojis.filter((e) => e !== cleanEmoji)
        : [...currentMyEmojis, cleanEmoji];
      const key = `${messageId}:${me.id}`;
      const existingSignal = groupFold.signalsByTargetUser.get(key);
      const nativeEmojis = groupFold.nativeReactionsByTargetUser.get(key) ?? [];

      setOptimisticReactions((prev) => ({
        ...prev,
        [messageId]: { userId: me.id, emojis: nextMyEmojis },
      }));

      const writeSignal = async (op: ReactionSignalOp, sigEmojis: string[]) => {
        const plainSignal = serializeReactionSignal({
          kind: "reaction",
          targetId: messageId,
          emoji: sigEmojis[0] ?? "",
          emojis: sigEmojis,
          op,
          ts: Date.now(),
        });
        let wireSignal = plainSignal;
        if (targetGroupId) {
          await ensureGroupEpochReadyForSend(targetGroupId);
          const enc = await prepareOutgoingGroupEncrypted({
            groupId: targetGroupId,
            wireBody: plainSignal,
            uploadFile: upload,
          });
          if (enc) wireSignal = enc.wireBody;
        }
        if (existingSignal) {
          try {
            await editGroupMut({
              messageId: existingSignal.rowId,
              body: wireSignal,
            });
            return;
          } catch {
            // Fall through to inserting a fresh signal row if prior row is no longer editable.
          }
        }
        if (targetGroupId) {
          await sendGroupMessageMut({
            groupId: targetGroupId,
            body: wireSignal,
          });
        }
      };

      try {
        if (
          nextMyEmojis.length <= 1 &&
          (nextMyEmojis.length === 0 || LEGACY_SERVER_REACTION_EMOJIS.has(nextMyEmojis[0])) &&
          !existingSignal
        ) {
          const single = nextMyEmojis[0] ?? null;
          if (single === null) {
            if (nativeEmojis.includes(cleanEmoji)) {
              await toggleGroupReactionMut({
                messageId: messageId,
                emoji: cleanEmoji,
              });
            }
          } else if (!nativeEmojis.includes(single)) {
            await toggleGroupReactionMut({
              messageId: messageId,
              emoji: single,
            });
          }
          return;
        }

        if (nextMyEmojis.length === 0 && nativeEmojis.length === 1) {
          await toggleGroupReactionMut({
            messageId: messageId,
            emoji: nativeEmojis[0],
          }).catch(() => undefined);
        }

        if (nextMyEmojis.length === 0) {
          await writeSignal("clear", []);
        } else {
          await writeSignal("set", nextMyEmojis);
        }
      } catch (err) {
        setOptimisticReactions((prev) => {
          const copy = { ...prev };
          delete copy[messageId];
          return copy;
        });
        throw err;
      } finally {
        clearOptimisticReactionLater(messageId);
      }
    },
    [
      activeGroupId,
      clearOptimisticReactionLater,
      editGroupMut,
      ensureGroupEpochReadyForSend,
      groupFold,
      me,
      sendGroupMessageMut,
      toggleGroupReactionMut,
      upload,
    ],
  );
  const deleteGroupMessageForMe = useCallback<JaTextStore["deleteGroupMessageForMe"]>(
    async (messageId) => {
      await deleteGroupForMeMut({ messageId: messageId });
    },
    [deleteGroupForMeMut],
  );
  const unsendGroupMessage = useCallback<JaTextStore["unsendGroupMessage"]>(
    async (messageId) => (await unsendGroupMut({ messageId: messageId })) as boolean,
    [unsendGroupMut],
  );
  const editGroupMessage = useCallback<JaTextStore["editGroupMessage"]>(
    async (messageId, body) => {
      const existing = groupMessages.find((m) => m.id === messageId);
      const preserved = attachBubbleStyleToOutgoing(
        body.trim(),
        existing?.bubbleStyle ?? "default",
      );
      if (activeGroupId) {
        await ensureGroupEpochReadyForSend(activeGroupId);
        const enc = await prepareOutgoingGroupEncrypted({
          groupId: activeGroupId,
          wireBody: preserved,
          uploadFile: upload,
        });
        if (enc) {
          await editGroupMut({
            messageId: messageId,
            body: enc.wireBody,
          });
          return;
        }
      }
      await editGroupMut({ messageId: messageId, body: preserved });
    },
    [activeGroupId, editGroupMut, ensureGroupEpochReadyForSend, groupMessages, upload],
  );
  const forwardGroupMessage: JaTextStore["forwardGroupMessage"] = useCallback(
    async (messageId, target) => {
      const src = groupMessages.find((m) => m.id === messageId);
      if (!src) {
        if (target.groupId) {
          await forwardGroupMut({ messageId: messageId, targetGroupId: target.groupId });
        } else if (target.userId) {
          await forwardGroupMut({ messageId: messageId, targetUserId: target.userId });
        }
        return;
      }

      // Re-encrypt decrypted content cleanly for the target recipient/group!
      const mediaUrl = src.attachmentUrl ?? src.stickerUrl;
      let fwdFile: File | undefined;
      let klipySticker: StickerMedia | undefined;
      if (mediaUrl) {
        if (src.stickerKey?.startsWith("klipy:")) {
          klipySticker = {
            key: src.stickerKey,
            url: mediaUrl,
            name: src.stickerName || "GIF",
            mediaType: "gif",
            source: "klipy",
            isFavorite: false,
            useCount: 0,
          };
        } else {
          try {
            const resp = await fetch(mediaUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              fwdFile = new File(
                [blob],
                src.attachmentName || src.stickerName || "forwarded",
                { type: src.attachmentType || blob.type || "application/octet-stream" },
              );
            }
          } catch {
            // Ignore fetch failure
          }
        }
      }

      const currentGroupName =
        groupDetails?.name ??
        groups.find((g) => g.id === activeGroupId)?.name ??
        "Group chat";
      const fwdCtx: ForwardedMessageContext = src.forwardedContext ?? {
        v: 1,
        sourceKind: "group",
        originalMessageId: src.id,
        originalCreatedAt: src.createdAt,
        originalSenderId: src.senderId,
        originalSenderName: src.senderName || "Unknown user",
        originalSenderUsername: src.senderUsername,
        originalSenderAvatarUrl: src.senderAvatarUrl,
        originalSenderAvatarColor: src.senderAvatarColor,
        groupId: activeGroupId ?? undefined,
        groupName: currentGroupName,
      };
      const fwdBody = encodeForwardedBody(src.body, fwdCtx);

      if (target.community) {
        await sendCommunityTextMut({
          body: fwdBody,
          ...(fwdFile ? { attachmentId: await upload(fwdFile), attachmentName: fwdFile.name, attachmentType: fwdFile.type } : {}),
        });
        return;
      }

      if (target.userId) {
        const enc = await prepareOutgoingDmEncrypted({
          receiverId: target.userId,
          wireBody: fwdBody,
          file: fwdFile,
          sticker: klipySticker,
          uploadFile: upload,
        });
        if (enc) {
          await sendMessageMut({
            receiverId: target.userId,
            body: enc.wireBody,
            ...(enc.attachmentId
              ? {
                  attachmentId: enc.attachmentId,
                  attachmentName: enc.attachmentName,
                  attachmentType: enc.attachmentType,
                }
              : {}),
          });
          return;
        }
        await forwardGroupMut({ messageId: messageId, targetUserId: target.userId });
      } else if (target.groupId) {
        await ensureGroupEpochReadyForSend(target.groupId);
        const enc = await prepareOutgoingGroupEncrypted({
          groupId: target.groupId,
          wireBody: fwdBody,
          file: fwdFile,
          sticker: klipySticker,
          uploadFile: upload,
        });
        if (enc) {
          await sendGroupMessageMut({
            groupId: target.groupId,
            body: enc.wireBody,
            ...(enc.attachmentId
              ? {
                  attachmentId: enc.attachmentId,
                  attachmentName: enc.attachmentName,
                  attachmentType: enc.attachmentType,
                }
              : {}),
          });
          return;
        }
        await forwardGroupMut({ messageId: messageId, targetGroupId: target.groupId });
      }
    },
    [
      activeGroupId,
      ensureGroupEpochReadyForSend,
      forwardGroupMut,
      groupDetails?.name,
      groupMessages,
      groups,
      sendCommunityTextMut,
      sendGroupMessageMut,
      sendMessageMut,
      upload,
    ],
  );
  const favoriteGroupStickerFromMessage: JaTextStore["favoriteGroupStickerFromMessage"] = useCallback(
    async (messageId) => {
      const msg = groupMessages.find((m) => m.id === messageId);
      if (msg?.e2ee?.encrypted) {
        const url = msg.stickerUrl ?? msg.attachmentUrl;
        if (url && msg.stickerKey?.startsWith("klipy:")) {
          await setStickerFavoriteMut({
            mediaKey: msg.stickerKey,
            url,
            previewUrl: url,
            name: msg.stickerName || msg.attachmentName || "GIF",
            mediaType: "gif",
            source: "klipy",
            isFavorite: !msg.isStickerFavorite,
          });
          return;
        }
        if (url) {
          const resp = await fetch(url);
          if (resp.ok) {
            const blob = await resp.blob();
            const file = new File(
              [blob],
              msg.stickerName || msg.attachmentName || "favourite.png",
              { type: msg.attachmentType || blob.type || "image/png" },
            );
            const storageId = await upload(file);
            await saveStickerMut({
              storageId,
              name: file.name,
              mediaType: file.type === "image/gif" ? "gif" : "sticker",
            });
            return;
          }
        }
      }
      await favoriteGroupStickerFromMessageMut({ messageId: messageId });
    },
    [
      favoriteGroupStickerFromMessageMut,
      groupMessages,
      saveStickerMut,
      setStickerFavoriteMut,
      upload,
    ],
  );
  const renameGroup = useCallback<JaTextStore["renameGroup"]>(
    async (groupId, name) => {
      await renameGroupMut({ groupId: groupId, name });
    },
    [renameGroupMut],
  );
  const setGroupAvatar = useCallback<JaTextStore["setGroupAvatar"]>(
    async (groupId, file) => {
      const normalized = file ? await normalizeImageFileForUpload(file, 512) : null;
      const avatarId = normalized ? await upload(normalized) : null;
      await setGroupAvatarMut({ groupId: groupId, avatarId });
    },
    [setGroupAvatarMut, upload],
  );
  const setGroupMemberRole = useCallback<JaTextStore["setGroupMemberRole"]>(
    async (groupId, userId, role) => {
      await setGroupMemberRoleMut({
        groupId: groupId,
        userId: userId,
        role,
      });
    },
    [setGroupMemberRoleMut],
  );
  const setGroupMuted = useCallback<JaTextStore["setGroupMuted"]>(
    async (groupId, userId, muted) => {
      await setGroupMutedMut({
        groupId: groupId,
        userId: userId,
        muted,
      });
    },
    [setGroupMutedMut],
  );
  const removeGroupMember = useCallback<JaTextStore["removeGroupMember"]>(
    async (groupId, userId) => {
      await removeGroupMemberMut({
        groupId: groupId,
        userId: userId,
      });
      // Real E2EE forward-exclusion: rotate to epoch + 1 wrapped ONLY for remaining members!
      const nextEpoch = await rotateGroupEpoch(groupId);
      if (nextEpoch) {
        const remainingIds = (groupDetails?.members ?? [])
          .filter((m) => m.id !== userId)
          .map((m) => m.id);
        await distributeGroupEpochToMembers(
          groupId,
          nextEpoch.epoch,
          nextEpoch.secretB64,
          remainingIds.length > 0 ? remainingIds : undefined,
        ).catch(() => undefined);
      }
    },
    [distributeGroupEpochToMembers, groupDetails?.members, removeGroupMemberMut],
  );
  const leaveGroup = useCallback<JaTextStore["leaveGroup"]>(
    async (groupId) => {
      await leaveGroupMut({ groupId: groupId });
      setCachedGroupConversation(slotId, groupId, {
        details: null,
        messages: [],
        rawRows: [],
      });
    },
    [leaveGroupMut, slotId],
  );
  const deleteGroup = useCallback<JaTextStore["deleteGroup"]>(
    async (groupId) => {
      await deleteGroupMut({ groupId: groupId });
      setCachedGroupConversation(slotId, groupId, {
        details: null,
        messages: [],
        rawRows: [],
      });
    },
    [deleteGroupMut, slotId],
  );
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const groupsQueryRef = useRef(groupsQuery);
  groupsQueryRef.current = groupsQuery;
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  const rawPreviewsRef = useRef(rawPreviews);
  rawPreviewsRef.current = rawPreviews;
  const communityMessagesRef = useRef(communityMessages);
  communityMessagesRef.current = communityMessages;

  const clearGroupChatForMe = useCallback<JaTextStore["clearGroupChatForMe"]>(
    async (groupId) => {
      const latestGrpTs = groupsRef.current.find((g) => g.id === groupId)?.lastMessageAt ?? 0;
      const cutoff = Math.max(Date.now(), latestGrpTs);
      if (me?.id) {
        clearLocalGroupHistory(me.id, groupId, cutoff);
      }
      setCachedGroupConversation(slotId, groupId, {
        messages: [],
      });
      await clearGroupHistoryServerMut({ groupId }).catch(() => undefined);
    },
    [clearGroupHistoryServerMut, me?.id, slotId],
  );

  const setGroupSilenced = useCallback<JaTextStore["setGroupSilenced"]>(
    async (groupId, silenced) => {
      if (me?.id) {
        updateLocalGroupSettings(me.id, groupId, { isSilenced: silenced });
      }
      await setGroupPrefsServerMut({ groupId, isSilenced: silenced });
    },
    [me?.id, setGroupPrefsServerMut],
  );
  const setGroupArchived = useCallback<JaTextStore["setGroupArchived"]>(
    async (groupId, archived) => {
      if (me?.id) {
        updateLocalGroupSettings(me.id, groupId, { isArchived: archived });
      }
      await setGroupPrefsServerMut({ groupId, isArchived: archived });
    },
    [me?.id, setGroupPrefsServerMut],
  );
  const markGroupRead = useCallback<JaTextStore["markGroupRead"]>(
    async (groupId) => {
      if (me?.id) {
        const hydratedTs = groupsRef.current.find((g) => g.id === groupId)?.lastMessageAt ?? 0;
        const rawTs = groupsQueryRef.current?.find((g) => g.id === groupId)?.lastMessageAt ?? 0;
        const cachedTs =
          getCachedGroupConversation(slotId, groupId)?.messages.at(-1)?.createdAt ?? 0;
        const maxTs = Math.max(hydratedTs, rawTs, cachedTs);
        markLocalGroupRead(me.id, groupId, maxTs > 0 ? maxTs : undefined);
      }
      markCachedBootstrapGroupRead(slotId, groupId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(CONVERSATION_MARKED_READ_EVENT, { detail: { groupId } }),
        );
      }
      void setGroupPrefsServerMut({ groupId, markRead: true });
    },
    [me?.id, setGroupPrefsServerMut, slotId],
  );
  const setCommunityMuted = useCallback<JaTextStore["setCommunityMuted"]>(
    async (muted) => {
      if (me?.id) {
        setLocalCommunityMuted(me.id, muted);
      }
      await setCommunityPrefsServerMut({ isMuted: muted });
    },
    [me?.id, setCommunityPrefsServerMut],
  );
  const markCommunityRead = useCallback<JaTextStore["markCommunityRead"]>(
    async () => {
      if (me?.id) {
        const list = communityMessagesRef.current;
        const latestCommunityTs = list[list.length - 1]?.createdAt;
        markLocalCommunityRead(me.id, latestCommunityTs);
      }
      void setCommunityPrefsServerMut({ markRead: true });
    },
    [me?.id, setCommunityPrefsServerMut],
  );

  const signInEmail = useCallback<JaTextStore["signInEmail"]>(
    async (email, password) => {
      await authSignInEmail(email, password);
    },
    [authSignInEmail],
  );

  const signUpEmail = useCallback<JaTextStore["signUpEmail"]>(
    async (email, password) => {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters long.");
      }
      await authSignUpEmail(email, password);
    },
    [authSignUpEmail],
  );

  const signInGoogle = useCallback<JaTextStore["signInGoogle"]>(
    async () => {
      await authSignInGoogle();
    },
    [authSignInGoogle],
  );

  const signOut = useCallback(async () => {
    const signingOutSlotId = getActiveAccountSlotId();
    setActiveChatIdForStore(null);
    setActiveGroupId(null);
    clearDecryptedSessionCaches();
    clearActiveE2EESession();
    try {
      const pushToken = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
      if (isAuthenticated && pushToken) {
        await unregisterPushDeviceMut({ token: pushToken });
        localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
      }
      if (isAuthenticated) await disconnectMut();
    } catch (error) {
      console.error("Could not clean up this device before signing out.", error);
    } finally {
      await authSignOut();
      await finalizeSignOutCurrentSlot(signingOutSlotId, PUBLIC_TURSO_API_ORIGIN);
    }
  }, [authSignOut, disconnectMut, isAuthenticated, setActiveChatIdForStore, setActiveGroupId, unregisterPushDeviceMut]);

  const checkUsername = useCallback<JaTextStore["checkUsername"]>(
    async (username) => queryCheckUsername(username.trim().toLowerCase()),
    [queryCheckUsername],
  );

  const meRefForSave = useRef(me);
  meRefForSave.current = me;

  const saveProfile = useCallback<JaTextStore["saveProfile"]>(
    async (input: ProfileInput) => {
      const avatarUrl =
        input.avatarFile === null
          ? null
          : input.avatarFile
            ? await upload(await normalizeImageFileForUpload(input.avatarFile, 512))
            : undefined;
      const bannerUrl =
        input.bannerFile === null
          ? null
          : input.bannerFile
            ? await upload(await normalizeImageFileForUpload(input.bannerFile, 1280))
            : undefined;
      const curMe = meRefForSave.current;
      await saveProfileMut({
        displayName: input.displayName.trim(),
        username: input.username.trim().toLowerCase(),
        bio: input.bio.trim(),
        pronouns: input.pronouns.trim(),
        avatarColor: input.avatarColor,
        socials: input.socials !== undefined ? input.socials : curMe?.socials,
        website: input.website !== undefined ? input.website : curMe?.website,
        syncedTheme: input.syncedTheme !== undefined ? input.syncedTheme : curMe?.syncedTheme,
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(bannerUrl !== undefined ? { bannerUrl } : {}),
      });
    },
    [saveProfileMut, upload],
  );

  const pendingThemeSyncPayloadRef = useRef<SyncedThemePayload | null>(null);
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  useEffect(() => {
    registerThemeRemoteSyncHandler(async (payload) => {
      const cur = meRefForSave.current;
      if (!isAuthenticatedRef.current || !cur?.id || !cur.username) {
        pendingThemeSyncPayloadRef.current = payload;
        return;
      }
      pendingThemeSyncPayloadRef.current = null;
      await saveProfile({
        displayName: cur.displayName,
        username: cur.username,
        bio: cur.bio,
        pronouns: cur.pronouns,
        avatarColor: cur.avatarColor,
        syncedTheme: payload,
      });
    });
    return () => registerThemeRemoteSyncHandler(null);
  }, [saveProfile]);

  useEffect(() => {
    if (!isAuthenticated || !meQuery?.id || !pendingThemeSyncPayloadRef.current) return;
    const queued = pendingThemeSyncPayloadRef.current;
    pendingThemeSyncPayloadRef.current = null;
    const cur = meRefForSave.current;
    if (!cur?.username) return;
    void saveProfile({
      displayName: cur.displayName,
      username: cur.username,
      bio: cur.bio,
      pronouns: cur.pronouns,
      avatarColor: cur.avatarColor,
      syncedTheme: queued,
    }).catch(() => undefined);
  }, [isAuthenticated, meQuery?.id, saveProfile]);

  const sendFriendRequest = useCallback<JaTextStore["sendFriendRequest"]>(
    async (username) => {
      const clean = username.trim().toLowerCase().replace(/^@/, "");
      const matched = rawFriends.find((u) => u.username.toLowerCase() === clean);
      if (matched) {
        setLocalUnfriendedIds((prev) => {
          const next = prev.filter((id) => id !== matched.id);
          try {
            localStorage.setItem(getScopedStorageKey("jatext:unfriended:v1"), JSON.stringify(next));
          } catch {
            // Ignore.
          }
          return next;
        });
        await sendMessageMut({
          receiverId: matched.id,
          body: "__JATEXT_CALL_SIG__:{\"kind\":\"refriend\"}",
        }).catch(() => undefined);
        return;
      }
      await sendRequestMut({ username: clean });
    },
    [rawFriends, sendMessageMut, sendRequestMut],
  );

  const respondRequest = useCallback<JaTextStore["respondRequest"]>(
    async (requestId, accept) => {
      await respondMut({
        requestId: requestId,
        accept,
      });
    },
    [respondMut],
  );

  const removeFriend = useCallback<JaTextStore["removeFriend"]>(
    async (friendId) => {
      // Optimistically remove immediately + persist local fallback
      setLocalUnfriendedIds((prev) => {
        if (prev.includes(friendId)) return prev;
        const next = [...prev, friendId];
        try {
          localStorage.setItem(getScopedStorageKey("jatext:unfriended:v1"), JSON.stringify(next));
        } catch {
          // Ignore.
        }
        return next;
      });
      if (activeChatId === friendId) {
        setActiveChatIdForStore(null);
      }

      // Try native server mutation first; fall back to symmetric control signal if server hasn't redeployed yet
      try {
        await removeFriendMut({ friendId });
      } catch {
        await sendMessageMut({
          receiverId: friendId,
          body: "__JATEXT_CALL_SIG__:{\"kind\":\"unfriend\"}",
        }).catch(() => undefined);
      }
    },
    [activeChatId, removeFriendMut, sendMessageMut, setActiveChatIdForStore],
  );

  const sendMessage = useCallback<JaTextStore["sendMessage"]>(
    async (receiverId, body, file, replyToId) => {
      const trimmed = body.trim();
      const style = isControlPayload(trimmed) ? "default" : getSavedOutgoingBubbleStyle();
      const wireBody = style === "default" ? trimmed : attachBubbleStyleToOutgoing(trimmed, style);
      const wireFile = file && style !== "default" ? attachBubbleStyleToFile(file, style) : file;

      // Do not encrypt raw E2EE bootstrap/friendship control packets
      const isBootstrapControl =
        trimmed.includes('"kind":"e2ee_ik"') ||
        trimmed.includes('"kind":"unfriend"') ||
        trimmed.includes('"kind":"refriend"');

      if (!isBootstrapControl) {
        const enc = await prepareOutgoingDmEncrypted({
          receiverId,
          wireBody,
          file: wireFile,
          uploadFile: upload,
        });
        if (enc) {
          await sendMessageMut({
            receiverId: receiverId,
            body: enc.wireBody,
            ...(enc.attachmentId
              ? {
                  attachmentId: enc.attachmentId,
                  attachmentName: enc.attachmentName,
                  attachmentType: enc.attachmentType,
                }
              : {}),
            ...(replyToId ? { replyToId: replyToId } : {}),
          });
          return;
        }
      }

      const attachmentId = wireFile ? await upload(wireFile) : undefined;
      await sendMessageMut({
        receiverId: receiverId,
        body: wireBody,
        ...(attachmentId
          ? { attachmentId, attachmentName: wireFile!.name, attachmentType: wireFile!.type }
          : {}),
        ...(replyToId ? { replyToId: replyToId } : {}),
      });
    },
    [sendMessageMut, upload],
  );

  const searchKlipy = useCallback<JaTextStore["searchKlipy"]>(
    async (query) => {
      const results = await klipySearchAction({ query });
      return results.map((item) => ({
        ...item,
        isFavorite: false,
        useCount: 0,
      })) as StickerMedia[];
    },
    [klipySearchAction],
  );

  const saveSticker = useCallback<JaTextStore["saveSticker"]>(
    async (file) => {
      const storageId = await upload(file);
      return (await saveStickerMut({
        storageId,
        name: file.name,
        mediaType: file.type === "image/gif" ? "gif" : "sticker",
      })) as StickerMedia;
    },
    [saveStickerMut, upload],
  );

  const setStickerFavorite = useCallback<JaTextStore["setStickerFavorite"]>(
    async (sticker, isFavorite) => {
      await setStickerFavoriteMut({
        mediaKey: sticker.key,
        ...(sticker.source === "klipy"
          ? { url: sticker.url, previewUrl: sticker.previewUrl }
          : {}),
        name: sticker.name,
        mediaType: sticker.mediaType,
        source: sticker.source,
        isFavorite,
      });
    },
    [setStickerFavoriteMut],
  );

  const favoriteStickerFromMessage = useCallback<
    JaTextStore["favoriteStickerFromMessage"]
  >(
    async (messageId) => {
      const msg = activeMessages.find((m) => m.id === messageId);
      if (msg?.e2ee?.encrypted && msg.attachmentUrl) {
        if (msg.stickerKey?.startsWith("klipy:")) {
          await setStickerFavoriteMut({
            mediaKey: msg.stickerKey,
            url: msg.attachmentUrl,
            previewUrl: msg.attachmentUrl,
            name: msg.attachmentName || "GIF",
            mediaType: "gif",
            source: "klipy",
            isFavorite: !msg.isStickerFavorite,
          });
          return;
        }
        const resp = await fetch(msg.attachmentUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const file = new File([blob], msg.attachmentName || "favourite.png", {
            type: msg.attachmentType || blob.type || "image/png",
          });
          const storageId = await upload(file);
          await saveStickerMut({
            storageId,
            name: file.name,
            mediaType: file.type === "image/gif" ? "gif" : "sticker",
          });
          return;
        }
      }
      await favoriteStickerFromMessageMut({ messageId: messageId });
    },
    [activeMessages, favoriteStickerFromMessageMut, saveStickerMut, setStickerFavoriteMut, upload],
  );

  const sendSticker = useCallback<JaTextStore["sendSticker"]>(
    async (receiverId, sticker) => {
      const style = getSavedOutgoingBubbleStyle();
      const stickerBody = style === "default" ? "" : attachBubbleStyleToOutgoing("", style);
      const enc = await prepareOutgoingDmEncrypted({
        receiverId,
        wireBody: stickerBody,
        sticker,
        uploadFile: upload,
      });
      if (enc) {
        await sendMessageMut({
          receiverId: receiverId,
          body: enc.wireBody,
          ...(enc.attachmentId
            ? {
                attachmentId: enc.attachmentId,
                attachmentName: enc.attachmentName,
                attachmentType: enc.attachmentType,
              }
            : {}),
        });
        return;
      }
      await sendStickerMut({
        receiverId: receiverId,
        mediaKey: sticker.key,
        ...(sticker.source === "klipy" ? { url: sticker.url } : {}),
        ...(sticker.previewUrl ? { previewUrl: sticker.previewUrl } : {}),
        ...(sticker.storageId
          ? { storageId: sticker.storageId }
          : {}),
        name: sticker.name,
        mediaType: sticker.mediaType,
        source: sticker.source,
      });
    },
    [sendMessageMut, sendStickerMut, upload],
  );

  const forwardDmToTarget = useCallback<NonNullable<JaTextStore["forwardDmToTarget"]>>(
    async (messageId, target) => {
      const src = activeMessages.find((m) => m.id === messageId);
      if (src) {
        let fwdFile: File | undefined;
        let klipySticker: StickerMedia | undefined;
        if (src.attachmentUrl) {
          if (src.stickerKey?.startsWith("klipy:")) {
            klipySticker = {
              key: src.stickerKey,
              url: src.attachmentUrl,
              name: src.attachmentName || "GIF",
              mediaType: "gif",
              source: "klipy",
              isFavorite: false,
              useCount: 0,
            };
          } else {
            try {
              const resp = await fetch(src.attachmentUrl);
              if (resp.ok) {
                const blob = await resp.blob();
                fwdFile = new File([blob], src.attachmentName || "forwarded", {
                  type: src.attachmentType || blob.type || "application/octet-stream",
                });
              }
            } catch {
              // Ignore fetch failure
            }
          }
        }
        const senderUser =
          src.senderId === me?.id
            ? me
            : friends.find((f) => f.id === src.senderId);
        const fwdCtx: ForwardedMessageContext = src.forwardedContext ?? {
          v: 1,
          sourceKind: "dm",
          originalMessageId: src.id,
          originalCreatedAt: src.createdAt,
          originalSenderId: src.senderId,
          originalSenderName: senderUser?.displayName || "JaText user",
          originalSenderUsername: senderUser?.username,
          originalSenderAvatarUrl: senderUser?.avatarUrl,
          originalSenderAvatarColor: senderUser?.avatarColor,
          dmUserIds: [src.senderId, src.receiverId],
        };
        const wireText = encodeForwardedBody(src.body, fwdCtx);

        if (target.userId) {
          const enc = await prepareOutgoingDmEncrypted({
            receiverId: target.userId,
            wireBody: wireText,
            file: fwdFile,
            sticker: klipySticker,
            uploadFile: upload,
          });
          if (enc) {
            await sendMessageMut({
              receiverId: target.userId,
              body: enc.wireBody,
              ...(enc.attachmentId
                ? {
                    attachmentId: enc.attachmentId,
                    attachmentName: enc.attachmentName,
                    attachmentType: enc.attachmentType,
                  }
                : {}),
            });
            return;
          }
        } else if (target.groupId) {
          await ensureGroupEpochReadyForSend(target.groupId);
          const enc = await prepareOutgoingGroupEncrypted({
            groupId: target.groupId,
            wireBody: wireText,
            file: fwdFile,
            sticker: klipySticker,
            uploadFile: upload,
          });
          if (enc) {
            await sendGroupMessageMut({
              groupId: target.groupId,
              body: enc.wireBody,
              ...(enc.attachmentId
                ? {
                    attachmentId: enc.attachmentId,
                    attachmentName: enc.attachmentName,
                    attachmentType: enc.attachmentType,
                  }
                : {}),
            });
            return;
          }
        }
      }
      if (target.userId) {
        await forwardMessageMut({
          messageId: messageId,
          receiverId: target.userId,
        });
      }
    },
    [
      activeMessages,
      ensureGroupEpochReadyForSend,
      forwardMessageMut,
      friends,
      me,
      sendGroupMessageMut,
      sendMessageMut,
      upload,
    ],
  );

  const forwardMessage = useCallback<JaTextStore["forwardMessage"]>(
    async (messageId, receiverId) => {
      await forwardDmToTarget(messageId, { userId: receiverId });
    },
    [forwardDmToTarget],
  );

  const toggleMessageReaction = useCallback<JaTextStore["toggleMessageReaction"]>(
    async (messageId, emoji) => {
      const cleanEmoji = emoji.trim();
      if (!cleanEmoji || !me) return;
      const targetMsg = dmFold.messages.find((m) => m.id === messageId);
      const otherUserId = targetMsg
        ? targetMsg.senderId === me.id
          ? targetMsg.receiverId
          : targetMsg.senderId
        : activeChatId;
      const currentMyEmojis = Array.from(
        new Set(
          (targetMsg?.reactions ?? [])
            .filter((r) => r.userId === me.id)
            .map((r) => r.emoji),
        ),
      );
      const shouldRemove = currentMyEmojis.includes(cleanEmoji);
      const nextMyEmojis = shouldRemove
        ? currentMyEmojis.filter((e) => e !== cleanEmoji)
        : [...currentMyEmojis, cleanEmoji];
      const key = `${messageId}:${me.id}`;
      const existingSignal = dmFold.signalsByTargetUser.get(key);
      const nativeEmojis = dmFold.nativeReactionsByTargetUser.get(key) ?? [];

      setOptimisticReactions((prev) => ({
        ...prev,
        [messageId]: { userId: me.id, emojis: nextMyEmojis },
      }));

      const writeSignal = async (op: ReactionSignalOp, sigEmojis: string[]) => {
        const plainSignal = serializeReactionSignal({
          kind: "reaction",
          targetId: messageId,
          emoji: sigEmojis[0] ?? "",
          emojis: sigEmojis,
          op,
          ts: Date.now(),
        });
        let wireSignal = plainSignal;
        if (otherUserId && otherUserId !== OFFICIAL_COMMUNITY_ID) {
          const enc = await prepareOutgoingDmEncrypted({
            receiverId: otherUserId,
            wireBody: plainSignal,
            uploadFile: upload,
          });
          if (enc) wireSignal = enc.wireBody;
        }
        if (existingSignal) {
          try {
            await editMessageMut({
              messageId: existingSignal.rowId,
              body: wireSignal,
            });
            return;
          } catch {
            // Fall through to inserting a fresh signal row if prior row is no longer editable.
          }
        }
        if (otherUserId && otherUserId !== OFFICIAL_COMMUNITY_ID) {
          await sendMessageMut({
            receiverId: otherUserId,
            body: wireSignal,
          });
        }
      };

      try {
        if (
          nextMyEmojis.length <= 1 &&
          (nextMyEmojis.length === 0 || LEGACY_SERVER_REACTION_EMOJIS.has(nextMyEmojis[0])) &&
          !existingSignal
        ) {
          const single = nextMyEmojis[0] ?? null;
          if (single === null) {
            if (nativeEmojis.includes(cleanEmoji)) {
              await toggleReactionMut({
                messageId: messageId,
                emoji: cleanEmoji,
              });
            }
          } else if (!nativeEmojis.includes(single)) {
            await toggleReactionMut({
              messageId: messageId,
              emoji: single,
            });
          }
          return;
        }

        if (nextMyEmojis.length === 0 && nativeEmojis.length === 1) {
          await toggleReactionMut({
            messageId: messageId,
            emoji: nativeEmojis[0],
          }).catch(() => undefined);
        }

        if (nextMyEmojis.length === 0) {
          await writeSignal("clear", []);
        } else {
          await writeSignal("set", nextMyEmojis);
        }
      } catch (err) {
        setOptimisticReactions((prev) => {
          const copy = { ...prev };
          delete copy[messageId];
          return copy;
        });
        throw err;
      } finally {
        clearOptimisticReactionLater(messageId);
      }
    },
    [
      activeChatId,
      clearOptimisticReactionLater,
      dmFold,
      editMessageMut,
      me,
      sendMessageMut,
      toggleReactionMut,
      upload,
    ],
  );

  const deleteMessageForMe = useCallback<JaTextStore["deleteMessageForMe"]>(
    async (messageId) => {
      await deleteForMeMut({ messageId: messageId });
    },
    [deleteForMeMut],
  );

  const unsendMessage = useCallback<JaTextStore["unsendMessage"]>(
    async (messageId) =>
      (await unsendMut({ messageId: messageId })) as boolean,
    [unsendMut],
  );
  const editMessage = useCallback<JaTextStore["editMessage"]>(
    async (messageId, body) => {
      const existing = activeMessages.find((m) => m.id === messageId);
      const preserved = attachBubbleStyleToOutgoing(
        body.trim(),
        existing?.bubbleStyle ?? "default",
      );
      const peerId =
        existing && me
          ? existing.senderId === me.id
            ? existing.receiverId
            : existing.senderId
          : activeChatId;
      if (peerId && peerId !== OFFICIAL_COMMUNITY_ID) {
        const enc = await prepareOutgoingDmEncrypted({
          receiverId: peerId,
          wireBody: preserved,
          uploadFile: upload,
        });
        if (enc) {
          await editMessageMut({
            messageId: messageId,
            body: enc.wireBody,
          });
          return;
        }
      }
      await editMessageMut({ messageId: messageId, body: preserved });
    },
    [activeChatId, activeMessages, editMessageMut, me, upload],
  );

  const setConversationArchived = useCallback<JaTextStore["setConversationArchived"]>(
    async (friendId, archived) => {
      await updateConversationMut({
        friendId: friendId,
        archived,
      });
    },
    [updateConversationMut],
  );

  const setConversationMuted = useCallback<JaTextStore["setConversationMuted"]>(
    async (friendId, muted) => {
      await updateConversationMut({
        friendId: friendId,
        muted,
      });
    },
    [updateConversationMut],
  );

  const deleteConversationForMe = useCallback<JaTextStore["deleteConversationForMe"]>(
    async (friendId) => {
      await updateConversationMut({
        friendId: friendId,
        deleteHistory: true,
      });
      setCachedDmConversation(slotId, friendId, [], []);
    },
    [slotId, updateConversationMut],
  );

  const setUserBlocked = useCallback<JaTextStore["setUserBlocked"]>(
    async (friendId, blocked) => {
      await setBlockMut({ userId: friendId, blocked });
    },
    [setBlockMut],
  );

  const markMessagesRead = useCallback<JaTextStore["markMessagesRead"]>(
    async (friendId) => {
      if (me?.id) {
        const hydratedTs =
          previewsRef.current.find((p) => p.friendId === friendId)?.createdAt ?? 0;
        const rawTs =
          rawPreviewsRef.current.find((p) => p.friendId === friendId)?.createdAt ?? 0;
        const cachedTs =
          getCachedDmConversation(slotId, friendId)?.messages.at(-1)?.createdAt ?? 0;
        const maxTs = Math.max(hydratedTs, rawTs, cachedTs);
        markLocalDmRead(me.id, friendId, maxTs > 0 ? maxTs : undefined);
      }
      markCachedDmMessagesRead(slotId, friendId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(CONVERSATION_MARKED_READ_EVENT, { detail: { friendId } }),
        );
      }
      await markReadMut({ otherId: friendId });
    },
    [markReadMut, me?.id, slotId],
  );

  const setActivity = useCallback<JaTextStore["setActivity"]>(
    async (status: StatusPreference, customStatus: string) => {
      await setActivityMut({ status, customStatus });
    },
    [setActivityMut],
  );

  const setTyping = useCallback<JaTextStore["setTyping"]>(
    async (receiverId, isTyping) => {
      if (!isAuthenticated) return;
      await setTypingMut({
        receiverId: receiverId,
        isTyping,
      });
    },
    [isAuthenticated, setTypingMut],
  );

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setNotificationPreferences(() => {
      const next = { ...loadNotificationPreferences(), notificationsEnabled: enabled };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const setSoundsEnabled = useCallback((enabled: boolean) => {
    setNotificationPreferences(() => {
      const next = { ...loadNotificationPreferences(), soundsEnabled: enabled };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const fetchMessagesWithUser = useCallback<JaTextStore["fetchMessagesWithUser"]>(
    async (otherId) => {
      if (!otherId || otherId === OFFICIAL_COMMUNITY_ID) return [];
      if (!isAuthenticated) {
        return getCachedDmConversation(slotId, otherId)?.messages ?? [];
      }
      const rows = await queryDmMessages(otherId);
      await scanDmRowsForE2EESignalsAsync(rows);
      const decryptedRows = await Promise.all(
        rows.map((r) => hydrateDecryptedDmMessageAsync(r, otherId, triggerE2EERerender)),
      );
      const hydrated = decryptedRows.map((r) => normalizeDirectMessage(r));
      const folded = foldReactionSignals(hydrated).messages;
      const merged = mergeLiveWithCachedMessages(
        folded,
        getCachedDmConversation(slotId, otherId)?.messages,
      );
      setCachedDmConversation(slotId, otherId, merged, rows);
      return merged;
    },
    [isAuthenticated, queryDmMessages, slotId, triggerE2EERerender],
  );

  const fetchGroupMessages = useCallback<JaTextStore["fetchGroupMessages"]>(
    async (groupId) => {
      if (!groupId) return [];
      if (!isAuthenticated) {
        return getCachedGroupConversation(slotId, groupId)?.messages ?? [];
      }
      const rows = await queryGroupMessages(groupId);
      await scanGroupRowsForE2EESignalsAsync(rows);
      const existingCached = getCachedGroupConversation(slotId, groupId);
      const details =
        activeGroupId === groupId ? groupDetails : (existingCached?.details ?? null);
      const decryptedRows = await Promise.all(
        rows.map((r) => hydrateDecryptedGroupMessageAsync(r, groupId, details, triggerE2EERerender)),
      );
      const hydrated = decryptedRows.map((r) => normalizeGroupMessage(r));
      const folded = foldReactionSignals(hydrated).messages;
      const merged = mergeLiveWithCachedMessages(folded, existingCached?.messages);
      setCachedGroupConversation(slotId, groupId, {
        messages: merged,
        rawRows: rows,
      });
      return merged;
    },
    [activeGroupId, groupDetails, isAuthenticated, queryGroupMessages, slotId, triggerE2EERerender],
  );

  const fetchGroupDetails = useCallback<JaTextStore["fetchGroupDetails"]>(
    async (groupId) => {
      if (!groupId) return null;
      if (!isAuthenticated) {
        return getCachedGroupConversation(slotId, groupId)?.details ?? null;
      }
      const details = await queryGroupDetails(groupId);
      setCachedGroupConversation(slotId, groupId, { details });
      return details;
    },
    [isAuthenticated, queryGroupDetails, slotId],
  );

  /* ------------------------------------------------------------------ */
  /* Real E2EE Identity Init, Key Handshake, Vault & Live Device Sync   */
  /* ------------------------------------------------------------------ */

  const [autoSyncSettled, setAutoSyncSettled] = useState(false);
  const autoSyncPushInFlightRef = useRef(false);
  const lastPushedAutoSyncSigRef = useRef<string>("");

  useEffect(() => {
    if (!canUseCachedSession || !me?.id) {
      setAutoSyncSettled(false);
      lastPushedAutoSyncSigRef.current = "";
      return;
    }
    let cancelled = false;
    // Offline/timeout fallback: once authenticated, if stickerLibrary doesn't settle within 1.5s, proceed
    const timer = isAuthenticated
      ? window.setTimeout(() => {
          if (!cancelled) setAutoSyncSettled(true);
        }, 1500)
      : null;
    void ensureUserE2EEInitialized(me.id).then(async (state) => {
      if (cancelled || !isAuthenticated) return;
      if (e2eeServerSupportedRef.current !== false) {
        try {
          await publishE2EEIdentity({
            keyId: state.primaryIdentity.keyId,
            dhPubB64: state.primaryIdentity.dhPubB64,
            sigPubB64: state.primaryIdentity.sigPubB64,
            selfSigB64: state.primaryIdentity.selfSigB64,
          });
          e2eeServerSupportedRef.current = true;
        } catch {
          e2eeServerSupportedRef.current = false;
        }
      }
    });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [canUseCachedSession, isAuthenticated, me?.id, publishE2EEIdentity]);

  // Zero-password automatic account keyring sync across all devices logged into the same account
  const pushAutoSyncedKeyring = useCallback(async () => {
    if (!isAuthenticated || !me?.id || autoSyncPushInFlightRef.current) return;
    const contents = exportCurrentVaultContents();
    if (!contents) return;
    const sig = [
      contents.primaryIdentity.keyId,
      ...contents.previousIdentities.map((i) => i.keyId).sort(),
      ...contents.groupEpochs.map((g) => `${g.groupId}:${g.epoch}`).sort(),
    ].join("|");
    if (lastPushedAutoSyncSigRef.current === sig) return;

    autoSyncPushInFlightRef.current = true;
    try {
      const sealed = await sealAutoSyncKeyring(contents);
      const bytes = new TextEncoder().encode(JSON.stringify(sealed));
      const keyringFile = new File([bytes], "e2ee-autosync.json", {
        type: "application/json",
      });
      const storageId = await upload(keyringFile);
      const oldItems = (stickerFavoritesRef.current ?? []).filter(
        (s) => s.name === E2EE_AUTOSYNC_STICKER_NAME,
      );
      await saveStickerMut({
        storageId,
        name: E2EE_AUTOSYNC_STICKER_NAME,
        mediaType: "sticker",
      });
      lastPushedAutoSyncSigRef.current = sig;
      await Promise.all(
        oldItems.map((old) =>
          setStickerFavoriteMut({
            mediaKey: old.key,
            name: old.name,
            mediaType: old.mediaType,
            source: old.source,
            isFavorite: false,
          }).catch(() => undefined),
        ),
      );
    } catch {
      // Ignore transient upload errors
    } finally {
      autoSyncPushInFlightRef.current = false;
    }
  }, [isAuthenticated, me?.id, saveStickerMut, setStickerFavoriteMut, upload]);

  useEffect(() => {
    if (!isAuthenticated || !me?.id || !e2eeSnapshot.ready || !stickerLibrary) return;
    let cancelled = false;
    const runAutoSync = async () => {
      const allItems = [...stickerLibrary.favorites, ...stickerLibrary.recent];
      const syncItems = allItems.filter(
        (item) => item.name === E2EE_AUTOSYNC_STICKER_NAME && item.url,
      );
      if (syncItems.length === 0) {
        if (!cancelled) {
          setAutoSyncSettled(true);
          void pushAutoSyncedKeyring();
        }
        return;
      }

      let anyNeedsPush = false;
      for (const item of syncItems.slice(0, 3)) {
        try {
          const resp = await fetch(item.url);
          if (!resp.ok) continue;
          const env = (await resp.json()) as SealedAutoSyncKeyring;
          const remoteContents = await openAutoSyncKeyring(env, me.id);
          if (!remoteContents || cancelled) continue;
          const { needsRemotePush } = await mergeAutoSyncedKeyring(remoteContents);
          if (needsRemotePush) anyNeedsPush = true;
        } catch {
          // Ignore malformed entry
        }
      }

      if (!cancelled) {
        setAutoSyncSettled(true);
        if (anyNeedsPush) {
          void pushAutoSyncedKeyring();
        } else {
          const contents = exportCurrentVaultContents();
          if (contents) {
            lastPushedAutoSyncSigRef.current = [
              contents.primaryIdentity.keyId,
              ...contents.previousIdentities.map((i) => i.keyId).sort(),
              ...contents.groupEpochs.map((g) => `${g.groupId}:${g.epoch}`).sort(),
            ].join("|");
          }
        }
      }
    };
    void runAutoSync();
    return () => {
      cancelled = true;
    };
  }, [e2eeSnapshot.ready, isAuthenticated, me?.id, pushAutoSyncedKeyring, stickerLibrary]);

  // Also push updated keyring whenever new group epochs are created locally
  useEffect(() => {
    if (!autoSyncSettled || !e2eeSnapshot.ready || !stickerLibrary) return;
    void pushAutoSyncedKeyring();
  }, [autoSyncSettled, e2eeSnapshot.ready, e2eeSnapshot.version, pushAutoSyncedKeyring, stickerLibrary]);

  // Background E2EE signed key exchange across accepted friends & private groups
  useEffect(() => {
    if (!isAuthenticated || !me?.id || !e2eeSnapshot.ready || !e2eeSnapshot.myKeyId || !autoSyncSettled) return;
    const state = getActiveE2EEState();
    if (!state || state.userId !== me.id) return;
    let cancelled = false;

    const syncKeys = async () => {
      // Brief settle so the currently open chat gets immediate priority
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 200);
      });
      if (cancelled) return;

      // Opportunistic server directory lookup if Convex e2ee module is deployed
      if (e2eeServerSupportedRef.current !== false) {
        try {
          // Ensure our converged canonical identity is also published in e2eeUserKeys!
          await publishE2EEIdentity({
            keyId: state.primaryIdentity.keyId,
            dhPubB64: state.primaryIdentity.dhPubB64,
            sigPubB64: state.primaryIdentity.sigPubB64,
            selfSigB64: state.primaryIdentity.selfSigB64,
          });
          if (friends.length > 0) {
            const bundles = (await getUserE2EEIdentities(
              friends.map((f) => f.id),
            )) as PublicIdentityBundle[];
            for (const b of bundles) {
              await ingestPeerIdentityBundle(b);
            }
          }
          e2eeServerSupportedRef.current = true;
        } catch {
          e2eeServerSupportedRef.current = false;
        }
      }

      // Sort friends by most-recent preview activity first so active chats cache immediately
      const previewTsByFriend = new Map<string, number>();
      for (const p of getSlotBootstrapCache(slotId)?.previews ?? []) {
        previewTsByFriend.set(p.friendId, p.createdAt ?? 0);
      }
      const prioritizedFriends = [...friends].sort(
        (a, b) => (previewTsByFriend.get(b.id) ?? 0) - (previewTsByFriend.get(a.id) ?? 0),
      );

      // Announce our signed E2EE identity key in each friend pair + pre-warm local DM cache!
      const mySigPacket = serializeIdentitySignal(state.primaryIdentity);
      for (const friend of prioritizedFriends) {
        if (cancelled) return;
        const syncTag = `${me.id}:${friend.id}:${state.primaryIdentity.keyId}`;
        if (announcedDmKeysRef.current.has(syncTag)) continue;
        announcedDmKeysRef.current.add(syncTag);

        try {
          const rows = await queryDmMessages(friend.id);
          await scanDmRowsForE2EESignalsAsync(rows);

          if (!cancelled) {
            const recentRows = rows.length > 250 ? rows.slice(-250) : rows;
            const decryptedRows = await Promise.all(
              recentRows.map((r) =>
                hydrateDecryptedDmMessageAsync(r, friend.id, triggerE2EERerender, {
                  skipRemoteAttachments: true,
                }),
              ),
            );
            const normalized = decryptedRows.map((r) => normalizeDirectMessage(r));
            const folded = foldReactionSignals(normalized).messages;
            const existingCached = getCachedDmConversation(slotId, friend.id);
            setCachedDmConversation(
              slotId,
              friend.id,
              mergeLiveWithCachedMessages(folded, existingCached?.messages),
              recentRows,
            );
          }

          const myExistingRows = rows.filter(
            (r) => r.senderId === me.id && parseIdentitySignal(r.body, me.id) !== null,
          );
          const alreadyAnnounced = myExistingRows.some(
            (r) => parseIdentitySignal(r.body, me.id)?.keyId === state.primaryIdentity.keyId,
          );
          if (!alreadyAnnounced) {
            if (myExistingRows.length >= 4) {
              // Recycle oldest slot only if 4+ historical keys exist
              await editMessageMut({
                messageId: myExistingRows[0].id,
                body: mySigPacket,
              }).catch(async () => {
                await sendMessageMut({
                  receiverId: friend.id,
                  body: mySigPacket,
                });
              });
            } else {
              await sendMessageMut({
                receiverId: friend.id,
                body: mySigPacket,
              });
            }
          }
        } catch {
          announcedDmKeysRef.current.delete(syncTag);
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 40);
        });
      }

      // Sync group identity announcements, group epoch envelopes, & pre-warm local Group cache!
      const prioritizedGroups = [...(groupsQuery ?? [])].sort(
        (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0),
      );
      for (const grp of prioritizedGroups) {
        if (cancelled) return;
        const grpSyncTag = `${me.id}:${grp.id}:${state.primaryIdentity.keyId}`;
        if (announcedGroupKeysRef.current.has(grpSyncTag)) continue;
        announcedGroupKeysRef.current.add(grpSyncTag);

        try {
          const existingGrp = getCachedGroupConversation(slotId, grp.id);
          const needsDetailsFetch =
            !existingGrp?.details ||
            existingGrp.details.members.length !== grp.memberCount ||
            existingGrp.details.name !== grp.name ||
            existingGrp.details.avatarUrl !== grp.avatarUrl;
          const [rawRowsResult, rawDetailsResult] = await Promise.all([
            queryGroupMessages(grp.id),
            needsDetailsFetch
              ? queryGroupDetails(grp.id)
              : Promise.resolve(existingGrp?.details ?? null),
          ]);
          const rows = (rawRowsResult ?? []) as GroupMessage[];
          const resolvedDetails = ((rawDetailsResult ?? existingGrp?.details) ?? null) as GroupDetails | null;
          await scanGroupRowsForE2EESignalsAsync(rows);

          if (!cancelled) {
            const recentRows = rows.length > 250 ? rows.slice(-250) : rows;
            const decryptedRows = await Promise.all(
              recentRows.map((r) =>
                hydrateDecryptedGroupMessageAsync(
                  r,
                  grp.id,
                  resolvedDetails,
                  triggerE2EERerender,
                  { skipRemoteAttachments: true },
                ),
              ),
            );
            const normalized = decryptedRows.map((r) => normalizeGroupMessage(r));
            const folded = foldReactionSignals(normalized).messages;
            setCachedGroupConversation(slotId, grp.id, {
              ...(resolvedDetails ? { details: resolvedDetails } : {}),
              messages: mergeLiveWithCachedMessages(folded, existingGrp?.messages),
              rawRows: recentRows,
            });
          }

          const myOwnIkRows = rows.filter(
            (r) => r.senderId === me.id && parseIdentitySignal(r.body, me.id) !== null,
          );
          const alreadyAnnouncedIk = myOwnIkRows.some(
            (r) => parseIdentitySignal(r.body, me.id)?.keyId === state.primaryIdentity.keyId,
          );
          if (!alreadyAnnouncedIk) {
            if (myOwnIkRows.length >= 4) {
              await editGroupMut({
                messageId: myOwnIkRows[0].id,
                body: mySigPacket,
              }).catch(async () => {
                await sendGroupMessageMut({
                  groupId: grp.id,
                  body: mySigPacket,
                });
              });
            } else {
              await sendGroupMessageMut({
                groupId: grp.id,
                body: mySigPacket,
              });
            }
          }

          // If owner and group has no epoch key yet, initialize Epoch #1
          const hasAnyGkRow = rows.some((r) => parseGroupKeySignal(r.body) !== null);
          if (!hasAnyGkRow && grp.role === "owner" && !getLatestGroupEpoch(grp.id)) {
            const ep = await ensureInitialGroupEpoch(grp.id);
            if (ep) {
              await distributeGroupEpochToMembers(grp.id, ep.epoch, ep.secretB64).catch(
                () => undefined,
              );
            }
          }
        } catch {
          announcedGroupKeysRef.current.delete(grpSyncTag);
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 40);
        });
      }
    };

    void syncKeys();
    return () => {
      cancelled = true;
    };
  }, [
    autoSyncSettled,
    distributeGroupEpochToMembers,
    e2eeSnapshot.myKeyId,
    e2eeSnapshot.ready,
    editGroupMut,
    editMessageMut,
    friends,
    groupsQuery,
    isAuthenticated,
    me?.id,
    sendGroupMessageMut,
    sendMessageMut,
    slotId,
    triggerE2EERerender,
  ]);

  // Auto-reconcile active group's identity announcement + wrap all held epoch secrets across all member devices
  const wrappedGroupMembersCacheRef = useRef(new Set<string>());
  useEffect(() => {
    if (!activeGroupId || !liveOrCachedGroupDetails || !groupMessagesQuery || !me?.id || !e2eeSnapshot.ready) {
      return;
    }
    let cancelled = false;
    const rows = groupMessagesQuery as GroupMessage[];

    const reconcileActiveGroupKeys = async () => {
      await scanGroupRowsForE2EESignalsAsync(rows);
      if (cancelled) return;
      const state = getActiveE2EEState();
      if (!state || state.userId !== me.id) return;

      // Ensure our own active identity key is announced in this group immediately
      const grpIkGuard = `active:${me.id}:${activeGroupId}:${state.primaryIdentity.keyId}`;
      if (!announcedGroupKeysRef.current.has(grpIkGuard)) {
        const alreadyAnnounced = rows.some(
          (r) =>
            r.senderId === me.id &&
            parseIdentitySignal(r.body, me.id)?.keyId === state.primaryIdentity.keyId,
        );
        announcedGroupKeysRef.current.add(grpIkGuard);
        if (!alreadyAnnounced) {
          await sendGroupMessageMut({
            groupId: activeGroupId,
            body: serializeIdentitySignal(state.primaryIdentity),
          }).catch(() => {
            announcedGroupKeysRef.current.delete(grpIkGuard);
          });
        }
      }

      const groupEpochsMap = state.groupEpochs[activeGroupId];
      if (!groupEpochsMap) return;

      for (const epochEntry of Object.values(groupEpochsMap)) {
        if (cancelled) return;
        for (const secretB64 of getGroupEpochAllSecrets(epochEntry)) {
          if (cancelled) return;
          const secretTag = secretB64.slice(0, 12);
          const wrappedKeysForSecret = new Set<string>();

          for (const row of rows) {
            const pkt = parseGroupKeySignal(row.body);
            if (!pkt || pkt.ep !== epochEntry.epoch) continue;
            const pktSecret = getKnownPacketSecretB64(pkt.epk);
            if (pktSecret !== secretB64) continue;

            for (const [uid, wrap] of Object.entries(pkt.wraps)) {
              wrappedKeysForSecret.add(`${uid}:${wrap.kid}`);
              wrappedKeysForSecret.add(`*:${wrap.kid}`);
            }
            if (pkt.kwraps) {
              for (const [kid, wrap] of Object.entries(pkt.kwraps)) {
                wrappedKeysForSecret.add(`*:${kid}`);
                wrappedKeysForSecret.add(`*:${wrap.kid}`);
              }
            }
          }

          const missingGuards: string[] = [];
          for (const m of liveOrCachedGroupDetails.members) {
            if (m.id === me.id) continue;
            const peer = state.peerKeys[m.id];
            if (!peer) continue;
            for (const bundle of getPeerKnownBundles(peer)) {
              const covered =
                wrappedKeysForSecret.has(`${m.id}:${bundle.keyId}`) ||
                wrappedKeysForSecret.has(`*:${bundle.keyId}`);
              const guard = `${activeGroupId}:${epochEntry.epoch}:${secretTag}:${m.id}:${bundle.keyId}`;
              if (!covered && !wrappedGroupMembersCacheRef.current.has(guard)) {
                missingGuards.push(guard);
              }
            }
          }

          if (missingGuards.length > 0) {
            for (const g of missingGuards) {
              wrappedGroupMembersCacheRef.current.add(g);
            }
            await distributeGroupEpochToMembers(
              activeGroupId,
              epochEntry.epoch,
              secretB64,
            ).catch(() => {
              for (const g of missingGuards) {
                wrappedGroupMembersCacheRef.current.delete(g);
              }
            });
          }
        }
      }
    };

    void reconcileActiveGroupKeys();
    return () => {
      cancelled = true;
    };
  }, [
    activeGroupId,
    distributeGroupEpochToMembers,
    e2eeSnapshot.ready,
    e2eeSnapshot.version,
    groupMessagesQuery,
    liveOrCachedGroupDetails,
    me?.id,
    sendGroupMessageMut,
  ]);

  // Monitor private stickerLibrary for remote E2EE Vault & Live Device Sync packets
  useEffect(() => {
    if (!isAuthenticated || !me?.id || !stickerLibrary) return;
    let cancelled = false;
    const allItems = [...stickerLibrary.favorites, ...stickerLibrary.recent];

    // 1. Discover latest sealed PBKDF2 Vault
    const vaultItems = allItems.filter((item) => item.name === E2EE_VAULT_STICKER_NAME && item.url);
    if (vaultItems.length > 0) {
      const latestVaultItem = vaultItems[0];
      void fetch(latestVaultItem.url)
        .then((r) => (r.ok ? (r.json() as Promise<SealedE2EEVault>) : null))
        .then(async (sealed) => {
          if (cancelled || !sealed || sealed.v !== 1 || sealed.userId !== me.id) return;
          setRemoteVaultSealed(sealed);
          const cur = getActiveE2EEState();
          if (cur && cur.primaryIdentity.keyId === sealed.keyId && cur.backedUpKeyId !== sealed.keyId) {
            await markCurrentIdentityBackedUp(sealed.keyId);
          }
        })
        .catch(() => undefined);
    } else {
      setRemoteVaultSealed(null);
    }

    // 2. Discover incoming Live Device Sync requests from another logged-in device
    const reqItems = stickerLibrary.favorites.filter(
      (item) => item.name.startsWith(E2EE_DEVSYNC_REQ_PREFIX) && item.url,
    );
    if (reqItems.length > 0) {
      void Promise.all(
        reqItems.map(async (item) => {
          try {
            const resp = await fetch(item.url);
            if (!resp.ok) return null;
            const parsed = (await resp.json()) as DeviceSyncRequest;
            if (
              parsed?.v === 1 &&
              parsed.userId === me.id &&
              parsed.deviceId !== localDeviceSyncRef.current?.request.deviceId &&
              Date.now() - parsed.createdAt < 15 * 60_000
            ) {
              return parsed;
            }
          } catch {
            // Ignore malformed sync request
          }
          return null;
        }),
      ).then((reqs) => {
        if (!cancelled) {
          setPendingDeviceSyncRequests(reqs.filter((r): r is DeviceSyncRequest => r !== null));
        }
      });
    } else {
      setPendingDeviceSyncRequests([]);
    }

    // 3. Check if our own active Live Device Sync request received an encrypted response!
    const myPendingSync = localDeviceSyncRef.current;
    if (myPendingSync) {
      const expectedName = `${E2EE_DEVSYNC_RES_PREFIX}${myPendingSync.request.deviceId}`;
      const resItem = allItems.find((item) => item.name === expectedName && item.url);
      if (resItem) {
        void fetch(resItem.url)
          .then((r) => (r.ok ? (r.json() as Promise<DeviceSyncResponse>) : null))
          .then(async (syncResp) => {
            if (cancelled || !syncResp) return;
            const contents = await unwrapDeviceSyncResponse({
              response: syncResp,
              localSync: myPendingSync,
            });
            await importRestoredVaultContents(contents);
            localDeviceSyncRef.current = null;
            setActiveDeviceSyncCode(null);
            announcedDmKeysRef.current.clear();
            announcedGroupKeysRef.current.clear();
            await setStickerFavoriteMut({
              mediaKey: resItem.key,
              name: resItem.name,
              mediaType: resItem.mediaType,
              source: resItem.source,
              isFavorite: false,
            }).catch(() => undefined);
          })
          .catch(() => undefined);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, me?.id, setStickerFavoriteMut, stickerLibrary]);

  // Sync outgoing custom chat bubble style across Mobile <-> Web/PC via private stickerLibrary
  const pushBubbleStyleToRemote = useCallback(
    async (styleId: BubbleStyleId) => {
      if (!isAuthenticated || !me?.id) return;
      const prefKey = `${E2EE_BUBBLE_PREF_PREFIX}${styleId}`;
      lastAppliedRemoteBubbleRef.current = styleId;
      await setStickerFavoriteMut({
        mediaKey: prefKey,
        url: "https://klipy.com/pref/bubble",
        name: prefKey,
        mediaType: "sticker",
        source: "klipy",
        isFavorite: true,
      }).catch(() => undefined);

      const stalePrefs = stickerFavoritesRef.current.filter(
        (item) => item.name.startsWith(E2EE_BUBBLE_PREF_PREFIX) && item.name !== prefKey,
      );
      for (const oldItem of stalePrefs) {
        await setStickerFavoriteMut({
          mediaKey: oldItem.key,
          url: oldItem.url || "https://klipy.com/pref/bubble",
          name: oldItem.name,
          mediaType: oldItem.mediaType === "gif" ? "gif" : "sticker",
          source: oldItem.source,
          isFavorite: false,
        }).catch(() => undefined);
      }
    },
    [isAuthenticated, me?.id, setStickerFavoriteMut],
  );

  useEffect(() => {
    if (!stickerLibrary) return;
    stickerFavoritesRef.current = stickerLibrary.favorites;
    if (!isAuthenticated || !me?.id) return;

    const prefItem = stickerLibrary.favorites.find((item) =>
      item.name.startsWith(E2EE_BUBBLE_PREF_PREFIX),
    );
    if (prefItem) {
      seededInitialBubbleSyncRef.current = true;
      const rawStyle = prefItem.name.slice(E2EE_BUBBLE_PREF_PREFIX.length);
      if (isValidBubbleStyleId(rawStyle) && lastAppliedRemoteBubbleRef.current !== rawStyle) {
        lastAppliedRemoteBubbleRef.current = rawStyle;
        if (getSavedOutgoingBubbleStyle() !== rawStyle) {
          saveOutgoingBubbleStyle(rawStyle, { fromRemote: true });
        }
      }
    } else if (!seededInitialBubbleSyncRef.current) {
      seededInitialBubbleSyncRef.current = true;
      const existingLocal = getSavedOutgoingBubbleStyle();
      if (existingLocal !== "default") {
        void pushBubbleStyleToRemote(existingLocal);
      }
    }
  }, [isAuthenticated, me?.id, pushBubbleStyleToRemote, stickerLibrary]);

  useEffect(() => {
    if (!isAuthenticated || !me?.id) return;
    const onLocalBubbleChange = (event: Event) => {
      const detail = (event as CustomEvent<BubbleStyleId>).detail;
      const nextStyle = detail && isValidBubbleStyleId(detail) ? detail : getSavedOutgoingBubbleStyle();
      void pushBubbleStyleToRemote(nextStyle);
    };
    window.addEventListener(BUBBLE_STYLE_REMOTE_SYNC_EVENT, onLocalBubbleChange);
    return () => {
      window.removeEventListener(BUBBLE_STYLE_REMOTE_SYNC_EVENT, onLocalBubbleChange);
    };
  }, [isAuthenticated, me?.id, pushBubbleStyleToRemote]);

  const saveE2EEVaultBackup = useCallback<NonNullable<JaTextStore["saveE2EEVaultBackup"]>>(
    async (passphrase) => {
      const contents = exportCurrentVaultContents();
      if (!contents) throw new Error("Local E2EE keystore is not ready yet.");
      const { sealed, recoveryKey } = await sealE2EEVault({ contents, passphrase });
      const jsonBytes = new TextEncoder().encode(JSON.stringify(sealed));
      const vaultFile = new File([jsonBytes], "e2ee-vault.json", {
        type: "application/octet-stream",
      });
      const storageId = await upload(vaultFile);

      // Remove older vault favorites from private stickerLibrary
      const oldVaults = (stickerLibrary?.favorites ?? []).filter(
        (s) => s.name === E2EE_VAULT_STICKER_NAME,
      );
      await saveStickerMut({
        storageId,
        name: E2EE_VAULT_STICKER_NAME,
        mediaType: "sticker",
      });
      await Promise.all(
        oldVaults.map((oldItem) =>
          setStickerFavoriteMut({
            mediaKey: oldItem.key,
            name: oldItem.name,
            mediaType: oldItem.mediaType,
            source: oldItem.source,
            isFavorite: false,
          }).catch(() => undefined),
        ),
      );
      if (e2eeServerSupportedRef.current !== false) {
        try {
          await saveE2EEVault({
            keyId: sealed.keyId,
            sealedJson: JSON.stringify(sealed),
          });
        } catch {
          e2eeServerSupportedRef.current = false;
        }
      }

      setRemoteVaultSealed(sealed);
      await markCurrentIdentityBackedUp(sealed.keyId);
      return { recoveryKey };
    },
    [saveE2EEVault, saveStickerMut, setStickerFavoriteMut, stickerLibrary?.favorites, upload],
  );

  const restoreE2EEVaultBackup = useCallback<NonNullable<JaTextStore["restoreE2EEVaultBackup"]>>(
    async (secretInput, mode) => {
      let sealed = remoteVaultSealed;
      if (!sealed && e2eeServerSupportedRef.current !== false) {
        try {
          const res = await getMyE2EEVault();
          if (res?.sealedJson) sealed = JSON.parse(res.sealedJson) as SealedE2EEVault;
        } catch {
          e2eeServerSupportedRef.current = false;
        }
      }
      if (!sealed) {
        throw new Error("No E2EE key backup found on this account yet.");
      }
      const contents = await openSealedE2EEVault({ sealed, secretInput, mode });
      await importRestoredVaultContents(contents);
      announcedDmKeysRef.current.clear();
      announcedGroupKeysRef.current.clear();
    },
    [getMyE2EEVault, remoteVaultSealed],
  );

  const requestLiveDeviceSync = useCallback<NonNullable<JaTextStore["requestLiveDeviceSync"]>>(
    async () => {
      if (!me?.id) throw new Error("Sign in first.");
      const deviceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const label = Capacitor.isNativePlatform() ? "JaText Android App" : "JaText Web Browser";
      const syncPair = await generateDeviceSyncKeypair(me.id, deviceId, label);
      localDeviceSyncRef.current = syncPair;
      setActiveDeviceSyncCode(syncPair.request.sasCode);

      const bytes = new TextEncoder().encode(JSON.stringify(syncPair.request));
      const reqFile = new File([bytes], "e2ee-devsync-req.json", {
        type: "application/octet-stream",
      });
      const storageId = await upload(reqFile);
      await saveStickerMut({
        storageId,
        name: `${E2EE_DEVSYNC_REQ_PREFIX}${deviceId}`,
        mediaType: "sticker",
      });
      return syncPair.request.sasCode;
    },
    [me?.id, saveStickerMut, upload],
  );

  const approveDeviceSyncRequest = useCallback<
    NonNullable<JaTextStore["approveDeviceSyncRequest"]>
  >(
    async (request) => {
      const contents = exportCurrentVaultContents();
      if (!contents) throw new Error("Local E2EE keystore is not ready.");
      const syncResp = await wrapVaultForDeviceSync({ request, contents });
      const bytes = new TextEncoder().encode(JSON.stringify(syncResp));
      const resFile = new File([bytes], "e2ee-devsync-res.json", {
        type: "application/octet-stream",
      });
      const storageId = await upload(resFile);
      await saveStickerMut({
        storageId,
        name: `${E2EE_DEVSYNC_RES_PREFIX}${request.deviceId}`,
        mediaType: "sticker",
      });

      // Clean up the fulfilled request item from favorites
      const reqName = `${E2EE_DEVSYNC_REQ_PREFIX}${request.deviceId}`;
      const matchingReq = (stickerLibrary?.favorites ?? []).find((s) => s.name === reqName);
      if (matchingReq) {
        await setStickerFavoriteMut({
          mediaKey: matchingReq.key,
          name: matchingReq.name,
          mediaType: matchingReq.mediaType,
          source: matchingReq.source,
          isFavorite: false,
        }).catch(() => undefined);
      }
      setPendingDeviceSyncRequests((prev) =>
        prev.filter((r) => r.deviceId !== request.deviceId),
      );
    },
    [saveStickerMut, setStickerFavoriteMut, stickerLibrary?.favorites, upload],
  );

  const visibleStickerFavorites = useMemo(
    () => (stickerLibrary?.favorites ?? []).filter((s) => !isInternalE2EEStickerName(s.name)),
    [stickerLibrary?.favorites],
  );
  const visibleRecentStickers = useMemo(
    () => (stickerLibrary?.recent ?? []).filter((s) => !isInternalE2EEStickerName(s.name)),
    [stickerLibrary?.recent],
  );

  const verifyFriendSecurityCode = useCallback<
    NonNullable<JaTextStore["verifyFriendSecurityCode"]>
  >(
    async (friendId: string, verified = true) => {
      const state = getActiveE2EEState();
      const peerEntry = state?.peerKeys[friendId];
      if (!state || !peerEntry) return false;
      const nowVerified = await setPeerVerifiedState(friendId, verified);
      if (nowVerified) {
        try {
          const sigBody = serializeVerifySignal(
            state.primaryIdentity.keyId,
            peerEntry.bundle.keyId,
          );
          const enc = await prepareOutgoingDmEncrypted({
            receiverId: friendId,
            wireBody: sigBody,
            uploadFile: upload,
          });
          await sendMessageMut({
            receiverId: friendId,
            body: enc ? enc.wireBody : sigBody,
          });
        } catch {
          // Local verification already succeeded
        }
      }
      return nowVerified;
    },
    [sendMessageMut, upload],
  );

  const loadingStore =
    (authLoading && !cachedSlotMe) || (isAuthenticated && me === undefined);
  const resolvedMe = canUseCachedSession ? (me ?? null) : null;
  const previewsReady = canUseCachedSession
    ? Boolean(isAuthenticated && previewsQuery !== undefined && groupsQuery !== undefined)
    : true;
  const activeMessagesReady =
    !canUseCachedSession ||
    !activeChatId ||
    activeChatId === OFFICIAL_COMMUNITY_ID ||
    activeMessagesQuery !== undefined ||
    Boolean(cachedDm && cachedDm.messages.length > 0);
  const communityMessagesReady =
    !canUseCachedSession ||
    communityMessagesQuery !== undefined ||
    Boolean(bootstrapCache?.communityMessages?.length);
  const groupMessagesReady =
    !canUseCachedSession ||
    !activeGroupId ||
    groupMessagesQuery !== undefined ||
    Boolean(cachedGroup && cachedGroup.messages.length > 0);
  const hasRemoteE2EEVault = Boolean(remoteVaultSealed) || serverHasRemoteVault;
  const remoteVaultKeyId = remoteVaultSealed?.keyId ?? serverRemoteVaultKeyId;

  const value = useMemo<JaTextStore>(
    () => ({
      mode: "turso",
      loading: loadingStore,
      me: resolvedMe,
      friends,
      incoming,
      outgoing,
      previews,
      previewsReady,
      friendActivities,
      notificationsEnabled: notificationPreferences.notificationsEnabled,
      pushRegistrationStatus,
      soundsEnabled: notificationPreferences.soundsEnabled,
      activeChatId,
      setActiveChatId: setActiveChatIdForStore,
      activeMessages,
      activeMessagesReady,
      hasMoreOlderMessages,
      loadingOlderMessages,
      loadOlderMessages,
      communityMessages,
      communityMessagesReady,
      hasMoreOlderCommunityMessages,
      loadingOlderCommunityMessages,
      loadOlderCommunityMessages,
      communityMuted,
      communityUnreadCount,
      setCommunityMuted,
      markCommunityRead,
      communityPermissions,
      communityDirectory,
      groups,
      activeGroupId,
      setActiveGroupId,
      groupDetails,
      groupMessages,
      groupMessagesReady,
      hasMoreOlderGroupMessages,
      loadingOlderGroupMessages,
      loadOlderGroupMessages,
      groupTypingUsers,
      communityTypingUsers,
      blockedUserIds,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      checkUsername,
      saveProfile,
      getUserById: queryUserById,
      getCommunityPollVoters: queryPollVoters,
      sendFriendRequest,
      respondRequest,
      removeFriend,
      sendMessage,
      fetchMessagesWithUser,
      forwardMessage,
      forwardDmToTarget,
      toggleMessageReaction,
      deleteMessageForMe,
      unsendMessage,
      editMessage,
      setConversationArchived,
      setConversationMuted,
      deleteConversationForMe,
      setUserBlocked,
      markMessagesRead,
      stickerFavorites: visibleStickerFavorites,
      recentStickers: visibleRecentStickers,
      searchKlipy,
      saveSticker,
      setStickerFavorite,
      favoriteStickerFromMessage,
      sendSticker,
      setActivity,
      setTyping,
      setCommunityModerators,
      sendCommunityText,
      sendCommunitySticker,
      setCommunityTyping,
      createCommunityPoll,
      voteCommunityPoll,
      endCommunityPoll,
      editCommunityMessage,
      deleteCommunityMessage,
      toggleCommunityReaction,
      deleteCommunityMessageForMe,
      unsendCommunityMessage,
      forwardCommunityMessage,
      favoriteCommunityStickerFromMessage,
      createGroup,
      addGroupMembers,
      sendGroupMessage,
      fetchGroupMessages,
      fetchGroupDetails,
      sendGroupSticker,
      setGroupTyping,
      toggleGroupReaction,
      deleteGroupMessageForMe,
      unsendGroupMessage,
      editGroupMessage,
      forwardGroupMessage,
      favoriteGroupStickerFromMessage,
      renameGroup,
      setGroupAvatar,
      setGroupMemberRole,
      setGroupMuted,
      removeGroupMember,
      leaveGroup,
      deleteGroup,
      clearGroupChatForMe,
      setGroupSilenced,
      setGroupArchived,
      markGroupRead,
      refreshPushRegistration,
      setNotificationsEnabled,
      setSoundsEnabled,
      hasRemoteE2EEVault,
      remoteVaultKeyId,
      pendingDeviceSyncRequests,
      activeDeviceSyncCode,
      saveE2EEVaultBackup,
      restoreE2EEVaultBackup,
      requestLiveDeviceSync,
      approveDeviceSyncRequest,
      verifyFriendSecurityCode,
    }),
    [
      activeChatId,
      activeDeviceSyncCode,
      activeGroupId,
      activeMessages,
      activeMessagesReady,
      addGroupMembers,
      approveDeviceSyncRequest,
      blockedUserIds,
      checkUsername,
      clearGroupChatForMe,
      communityDirectory,
      communityMessages,
      communityMessagesReady,
      communityMuted,
      communityPermissions,
      communityTypingUsers,
      communityUnreadCount,
      createCommunityPoll,
      createGroup,
      deleteCommunityMessage,
      deleteCommunityMessageForMe,
      deleteConversationForMe,
      deleteGroup,
      deleteGroupMessageForMe,
      deleteMessageForMe,
      editCommunityMessage,
      editGroupMessage,
      editMessage,
      endCommunityPoll,
      favoriteCommunityStickerFromMessage,
      favoriteGroupStickerFromMessage,
      favoriteStickerFromMessage,
      fetchGroupDetails,
      fetchGroupMessages,
      fetchMessagesWithUser,
      forwardCommunityMessage,
      forwardDmToTarget,
      forwardGroupMessage,
      forwardMessage,
      friendActivities,
      friends,
      groupDetails,
      groupMessages,
      groupMessagesReady,
      groupTypingUsers,
      groups,
      hasMoreOlderCommunityMessages,
      hasMoreOlderGroupMessages,
      hasMoreOlderMessages,
      hasRemoteE2EEVault,
      incoming,
      leaveGroup,
      loadOlderCommunityMessages,
      loadOlderGroupMessages,
      loadOlderMessages,
      loadingOlderCommunityMessages,
      loadingOlderGroupMessages,
      loadingOlderMessages,
      loadingStore,
      markCommunityRead,
      markGroupRead,
      markMessagesRead,
      notificationPreferences.notificationsEnabled,
      notificationPreferences.soundsEnabled,
      outgoing,
      pendingDeviceSyncRequests,
      previews,
      previewsReady,
      pushRegistrationStatus,
      queryPollVoters,
      queryUserById,
      refreshPushRegistration,
      remoteVaultKeyId,
      removeFriend,
      removeGroupMember,
      renameGroup,
      requestLiveDeviceSync,
       resolvedMe,
      respondRequest,
      restoreE2EEVaultBackup,
      saveE2EEVaultBackup,
      saveProfile,
      saveSticker,
      searchKlipy,
      sendCommunitySticker,
      sendCommunityText,
      sendFriendRequest,
      sendGroupMessage,
      sendGroupSticker,
      sendMessage,
      sendSticker,
      setActiveChatIdForStore,
      setActiveGroupId,
      setActivity,
      setCommunityModerators,
      setCommunityMuted,
      setCommunityTyping,
      setConversationArchived,
      setConversationMuted,
      setGroupArchived,
      setGroupAvatar,
      setGroupMemberRole,
      setGroupMuted,
      setGroupSilenced,
      setGroupTyping,
      setNotificationsEnabled,
      setSoundsEnabled,
      setStickerFavorite,
      setTyping,
      setUserBlocked,
      signInEmail,
      signInGoogle,
      signOut,
      signUpEmail,
      toggleCommunityReaction,
      toggleGroupReaction,
      toggleMessageReaction,
      unsendCommunityMessage,
      unsendGroupMessage,
      unsendMessage,
      verifyFriendSecurityCode,
      visibleRecentStickers,
      visibleStickerFavorites,
      voteCommunityPoll,
    ],
  );

  return <JaTextContext.Provider value={value}>{children}</JaTextContext.Provider>;
}