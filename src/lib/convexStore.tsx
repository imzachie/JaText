import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAction, useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
// Works with both the checked-in stub and the real generated API
// (run `npx convex dev` once to generate convex/_generated for real).
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { JaTextContext } from "./store";
import { loadNotificationPreferences, saveNotificationPreferences } from "./alerts";
import { OFFICIAL_COMMUNITY_ID } from "./types";
import type {
  ChatMessage,
  ChatPreview,
  CommunityMessage,
  CommunityUser,
  FriendActivity,
  FriendRequest,
  GroupDetails,
  GroupMessage,
  GroupSummary,
  JaTextStore,
  JaUser,
  ProfileInput,
  StickerMedia,
  StatusPreference,
} from "./types";

const PUSH_TOKEN_STORAGE_KEY = "jatext-push-token-v1";
const ANDROID_AUTH_CALLBACK = "com.ahad00010.jatext://auth";

/* ------------------------------------------------------------------ */
/* Real Convex store — active when VITE_CONVEX_URL is set.             */
/* All data (users, friend requests, messages, file uploads) goes     */
/* through the Convex functions in /convex. Auth = Convex Auth with    */
/* Google OAuth + email/password providers.                            */
/* ------------------------------------------------------------------ */

export function ConvexStoreProvider({ children }: { children: ReactNode }) {
  const convex = useConvex();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut: convexSignOut } = useAuthActions();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState(loadNotificationPreferences);
  const [pushRegistrationStatus, setPushRegistrationStatus] =
    useState<JaTextStore["pushRegistrationStatus"]>("idle");
  const handledOAuthCodes = useRef(new Set<string>());
  const previewsQuery = useQuery(
    api.messages.previews,
    isAuthenticated ? {} : "skip",
  ) as ChatPreview[] | undefined;

  const me = useQuery(api.users.current, isAuthenticated ? {} : "skip") as
    | JaUser
    | null
    | undefined;
  const friends = (useQuery(
    api.friends.listFriends,
    isAuthenticated ? {} : "skip",
  ) ?? []) as JaUser[];
  const incoming = (useQuery(
    api.friends.listIncoming,
    isAuthenticated ? {} : "skip",
  ) ?? []) as FriendRequest[];
  const outgoing = (useQuery(
    api.friends.listOutgoing,
    isAuthenticated ? {} : "skip",
  ) ?? []) as FriendRequest[];
  const previews = previewsQuery ?? [];
  const friendActivities = (useQuery(
    api.friends.activity,
    isAuthenticated ? {} : "skip",
  ) ?? []) as FriendActivity[];
  const activeMessagesQuery = useQuery(
    api.messages.list,
    isAuthenticated && activeChatId && activeChatId !== OFFICIAL_COMMUNITY_ID
      ? { otherId: activeChatId as Id<"users"> }
      : "skip",
  );
  const activeMessages = (activeMessagesQuery ?? []) as ChatMessage[];
  const communityMessages = (useQuery(
    api.community.list,
    isAuthenticated ? {} : "skip",
  ) ?? []) as CommunityMessage[];
  const communityPermissions = (useQuery(
    api.community.permissions,
    isAuthenticated ? {} : "skip",
  ) ?? { isOwner: false, canModerate: false }) as {
    isOwner: boolean;
    canModerate: boolean;
    moderatorIds: string[];
  };
  const communityDirectory = (useQuery(
    api.users.ownerDirectory,
    isAuthenticated &&
      me?.username.toLowerCase() === "imzachie" &&
      me.email?.toLowerCase() === "aidilzafri2013@gmail.com"
      ? {}
      : "skip",
  ) ?? []) as CommunityUser[];
  const groups = (useQuery(
    api.groups.listMine,
    isAuthenticated ? {} : "skip",
  ) ?? []) as GroupSummary[];
  const groupDetailsQuery = useQuery(
    api.groups.get,
    isAuthenticated && activeGroupId
      ? { groupId: activeGroupId as Id<"groups"> }
      : "skip",
  );
  const groupDetails = (groupDetailsQuery ?? null) as GroupDetails | null;
  const groupMessages = (useQuery(
    api.groups.listMessages,
    isAuthenticated && activeGroupId
      ? { groupId: activeGroupId as Id<"groups"> }
      : "skip",
  ) ?? []) as GroupMessage[];
  const stickerLibrary = useQuery(
    api.stickers.library,
    isAuthenticated ? {} : "skip",
  ) as { favorites: StickerMedia[]; recent: StickerMedia[] } | undefined;
  const blockedUserIds = (useQuery(
    api.blocks.listMine,
    isAuthenticated ? {} : "skip",
  ) ?? []) as string[];

  const saveProfileMut = useMutation(api.users.saveProfile);
  const sendRequestMut = useMutation(api.friends.sendRequest);
  const respondMut = useMutation(api.friends.respond);
  const sendMessageMut = useMutation(api.messages.send);
  const forwardMessageMut = useMutation(api.messages.forward);
  const toggleReactionMut = useMutation(api.messages.toggleReaction);
  const deleteForMeMut = useMutation(api.messages.deleteForMe);
  const unsendMut = useMutation(api.messages.unsend);
  const editMessageMut = useMutation(api.messages.edit);
  const updateConversationMut = useMutation(api.messages.updateConversation);
  const setTypingMut = useMutation(api.messages.setTyping);
  const markReadMut = useMutation(api.messages.markRead);
  const setBlockMut = useMutation(api.blocks.set);
  const setActivityMut = useMutation(api.users.setActivity);
  const heartbeatMut = useMutation(api.users.heartbeat);
  const disconnectMut = useMutation(api.users.disconnect);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const klipySearchAction = useAction(api.klipy.search);
  const saveStickerMut = useMutation(api.stickers.saveUpload);
  const setStickerFavoriteMut = useMutation(api.stickers.setFavorite);
  const favoriteStickerFromMessageMut = useMutation(api.stickers.favoriteFromMessage);
  const sendStickerMut = useMutation(api.stickers.send);
  const registerPushDeviceMut = useMutation(api.push.registerDevice);
  const unregisterPushDeviceMut = useMutation(api.push.unregisterDevice);
  const setCommunityModeratorsMut = useMutation(api.community.setModerators);
  const sendCommunityTextMut = useMutation(api.community.sendText);
  const createCommunityPollMut = useMutation(api.community.createPoll);
  const voteCommunityPollMut = useMutation(api.community.vote);
  const endCommunityPollMut = useMutation(api.community.endPoll);
  const editCommunityMessageMut = useMutation(api.community.editMessage);
  const deleteCommunityMessageMut = useMutation(api.community.deleteMessage);
  const createGroupMut = useMutation(api.groups.create);
  const sendGroupMessageMut = useMutation(api.groups.send);
  const renameGroupMut = useMutation(api.groups.rename);
  const setGroupAvatarMut = useMutation(api.groups.setAvatar);
  const setGroupMemberRoleMut = useMutation(api.groups.setMemberRole);
  const setGroupMutedMut = useMutation(api.groups.setMuted);
  const removeGroupMemberMut = useMutation(api.groups.removeMember);
  const leaveGroupMut = useMutation(api.groups.leave);
  const deleteGroupMut = useMutation(api.groups.deleteGroup);

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
        throw new Error("Allow JaText notifications in Android settings, then try again.");
      }
      await PushNotifications.createChannel({
        id: "messages",
        name: "Messages",
        description: "New JaText messages",
        importance: 5,
        sound: "default",
      });
      if (!disposed) {
        setPushRegistrationStatus("registering");
        await PushNotifications.register();
      }
    };
    const registerForPush = async () => {
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
        await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
          const senderId = notification.data?.senderId;
          if (typeof senderId === "string") setActiveChatIdForStore(senderId);
        }),
      );
      listeners.push(
        await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            void requestRegistration().catch((error: unknown) => {
              setPushRegistrationStatus("error");
              console.error("Could not refresh Android push registration.", error);
            });
          }
        }),
      );
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
      });
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "mousemove"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
    heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, markActive));
    };
  }, [heartbeatMut, isAuthenticated]);

  /** Upload a file to Convex storage, returns its storage id. */
  const upload = useCallback(
    async (file: File): Promise<Id<"_storage">> => {
      const url = (await generateUploadUrl()) as string;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const { storageId } = await res.json();
      return storageId as Id<"_storage">;
    },
    [generateUploadUrl],
  );

  const setCommunityModerators = useCallback<JaTextStore["setCommunityModerators"]>(
    async (userIds) => {
      await setCommunityModeratorsMut({ userIds: userIds as Id<"users">[] });
    },
    [setCommunityModeratorsMut],
  );
  const sendCommunityText = useCallback<JaTextStore["sendCommunityText"]>(
    async (body) => {
      await sendCommunityTextMut({ body });
    },
    [sendCommunityTextMut],
  );
  const createCommunityPoll = useCallback<JaTextStore["createCommunityPoll"]>(
    async (question, options) => {
      await createCommunityPollMut({ question, options });
    },
    [createCommunityPollMut],
  );
  const voteCommunityPoll = useCallback<JaTextStore["voteCommunityPoll"]>(
    async (pollId, optionIndex) => {
      await voteCommunityPollMut({ pollId: pollId as Id<"communityMessages">, optionIndex });
    },
    [voteCommunityPollMut],
  );
  const endCommunityPoll = useCallback<JaTextStore["endCommunityPoll"]>(
    async (pollId) => {
      await endCommunityPollMut({ pollId: pollId as Id<"communityMessages"> });
    },
    [endCommunityPollMut],
  );
  const editCommunityMessage = useCallback<JaTextStore["editCommunityMessage"]>(
    async (messageId, body) => {
      await editCommunityMessageMut({
        messageId: messageId as Id<"communityMessages">,
        body,
      });
    },
    [editCommunityMessageMut],
  );
  const deleteCommunityMessage = useCallback<JaTextStore["deleteCommunityMessage"]>(
    async (messageId) => {
      await deleteCommunityMessageMut({ messageId: messageId as Id<"communityMessages"> });
    },
    [deleteCommunityMessageMut],
  );
  const createGroup = useCallback<JaTextStore["createGroup"]>(
    async (name, memberIds) =>
      (await createGroupMut({
        name,
        memberIds: memberIds as Id<"users">[],
      })) as string,
    [createGroupMut],
  );
  const sendGroupMessage = useCallback<JaTextStore["sendGroupMessage"]>(
    async (groupId, body) => {
      await sendGroupMessageMut({ groupId: groupId as Id<"groups">, body });
    },
    [sendGroupMessageMut],
  );
  const renameGroup = useCallback<JaTextStore["renameGroup"]>(
    async (groupId, name) => {
      await renameGroupMut({ groupId: groupId as Id<"groups">, name });
    },
    [renameGroupMut],
  );
  const setGroupAvatar = useCallback<JaTextStore["setGroupAvatar"]>(
    async (groupId, file) => {
      const avatarId = file ? await upload(file) : null;
      await setGroupAvatarMut({ groupId: groupId as Id<"groups">, avatarId });
    },
    [setGroupAvatarMut, upload],
  );
  const setGroupMemberRole = useCallback<JaTextStore["setGroupMemberRole"]>(
    async (groupId, userId, role) => {
      await setGroupMemberRoleMut({
        groupId: groupId as Id<"groups">,
        userId: userId as Id<"users">,
        role,
      });
    },
    [setGroupMemberRoleMut],
  );
  const setGroupMuted = useCallback<JaTextStore["setGroupMuted"]>(
    async (groupId, userId, muted) => {
      await setGroupMutedMut({
        groupId: groupId as Id<"groups">,
        userId: userId as Id<"users">,
        muted,
      });
    },
    [setGroupMutedMut],
  );
  const removeGroupMember = useCallback<JaTextStore["removeGroupMember"]>(
    async (groupId, userId) => {
      await removeGroupMemberMut({
        groupId: groupId as Id<"groups">,
        userId: userId as Id<"users">,
      });
    },
    [removeGroupMemberMut],
  );
  const leaveGroup = useCallback<JaTextStore["leaveGroup"]>(
    async (groupId) => {
      await leaveGroupMut({ groupId: groupId as Id<"groups"> });
    },
    [leaveGroupMut],
  );
  const deleteGroup = useCallback<JaTextStore["deleteGroup"]>(
    async (groupId) => {
      await deleteGroupMut({ groupId: groupId as Id<"groups"> });
    },
    [deleteGroupMut],
  );

  const signInEmail = useCallback<JaTextStore["signInEmail"]>(
    async (email, password) => {
      await signIn("password", { email: email.trim(), password, flow: "signIn" });
    },
    [signIn],
  );

  const signUpEmail = useCallback<JaTextStore["signUpEmail"]>(
    async (email, password) => {
      await signIn("password", { email: email.trim(), password, flow: "signUp" });
    },
    [signIn],
  );

  const signInGoogle = useCallback<JaTextStore["signInGoogle"]>(
    async () => {
      if (!Capacitor.isNativePlatform()) {
        await signIn("google");
        return;
      }

      Object.defineProperty(navigator, "product", {
        configurable: true,
        value: "ReactNative",
      });
      const result = await signIn("google", { redirectTo: ANDROID_AUTH_CALLBACK });
      if (!result.redirect) throw new Error("Google sign-in did not return an authorization URL.");
      await Browser.open({ url: result.redirect.toString() });
    },
    [signIn],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handleAuthUrl = async (url: string) => {
      const callback = new URL(url);
      if (
        callback.protocol !== "com.ahad00010.jatext:" ||
        callback.hostname !== "auth"
      ) {
        return;
      }
      const code = callback.searchParams.get("code");
      if (!code || handledOAuthCodes.current.has(code)) return;
      handledOAuthCodes.current.add(code);
      try {
        await Browser.close();
        await signIn("google", { code });
      } catch (error) {
        handledOAuthCodes.current.delete(code);
        console.error("Could not complete Google sign-in in the Android app.", error);
      }
    };

    let listener: PluginListenerHandle | undefined;
    void App.addListener("appUrlOpen", ({ url }) => {
      void handleAuthUrl(url);
    })
      .then((registeredListener) => {
        listener = registeredListener;
        return App.getLaunchUrl();
      })
      .then((launch) => {
        if (launch?.url) void handleAuthUrl(launch.url);
      })
      .catch((error: unknown) => {
        console.error("Could not register the Android OAuth callback handler.", error);
      });
    return () => {
      if (listener) void listener.remove();
    };
  }, [signIn]);

  const signOut = useCallback(async () => {
    setActiveChatIdForStore(null);
    setActiveGroupId(null);
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
      await convexSignOut();
    }
  }, [convexSignOut, disconnectMut, isAuthenticated, setActiveChatIdForStore, setActiveGroupId, unregisterPushDeviceMut]);

  const checkUsername = useCallback<JaTextStore["checkUsername"]>(
    async (username) =>
      (await convex.query(api.users.checkUsername, {
        username: username.trim().toLowerCase(),
      })) as { available: boolean; message?: string },
    [convex],
  );

  const saveProfile = useCallback<JaTextStore["saveProfile"]>(
    async (input: ProfileInput) => {
      const avatarId =
        input.avatarFile === null
          ? null
          : input.avatarFile
            ? await upload(input.avatarFile)
            : undefined;
      const bannerId =
        input.bannerFile === null
          ? null
          : input.bannerFile
            ? await upload(input.bannerFile)
            : undefined;
      await saveProfileMut({
        displayName: input.displayName.trim(),
        username: input.username.trim().toLowerCase(),
        bio: input.bio.trim(),
        pronouns: input.pronouns.trim(),
        avatarColor: input.avatarColor,
        ...(avatarId !== undefined ? { avatarId } : {}),
        ...(bannerId !== undefined ? { bannerId } : {}),
      });
    },
    [saveProfileMut, upload],
  );

  const sendFriendRequest = useCallback<JaTextStore["sendFriendRequest"]>(
    async (username) => {
      await sendRequestMut({ username: username.trim().toLowerCase().replace(/^@/, "") });
    },
    [sendRequestMut],
  );

  const respondRequest = useCallback<JaTextStore["respondRequest"]>(
    async (requestId, accept) => {
      await respondMut({
        requestId: requestId as Id<"friendRequests">,
        accept,
      });
    },
    [respondMut],
  );

  const sendMessage = useCallback<JaTextStore["sendMessage"]>(
    async (receiverId, body, file, replyToId) => {
      const attachmentId = file ? await upload(file) : undefined;
      await sendMessageMut({
        receiverId: receiverId as Id<"users">,
        body: body.trim(),
        ...(attachmentId
          ? { attachmentId, attachmentName: file!.name, attachmentType: file!.type }
          : {}),
        ...(replyToId ? { replyToId: replyToId as Id<"messages"> } : {}),
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
      await favoriteStickerFromMessageMut({ messageId: messageId as Id<"messages"> });
    },
    [favoriteStickerFromMessageMut],
  );

  const sendSticker = useCallback<JaTextStore["sendSticker"]>(
    async (receiverId, sticker) => {
      await sendStickerMut({
        receiverId: receiverId as Id<"users">,
        mediaKey: sticker.key,
        ...(sticker.source === "klipy" ? { url: sticker.url } : {}),
        ...(sticker.previewUrl ? { previewUrl: sticker.previewUrl } : {}),
        ...(sticker.storageId
          ? { storageId: sticker.storageId as Id<"_storage"> }
          : {}),
        name: sticker.name,
        mediaType: sticker.mediaType,
        source: sticker.source,
      });
    },
    [sendStickerMut],
  );

  const forwardMessage = useCallback<JaTextStore["forwardMessage"]>(
    async (messageId, receiverId) => {
      await forwardMessageMut({
        messageId: messageId as Id<"messages">,
        receiverId: receiverId as Id<"users">,
      });
    },
    [forwardMessageMut],
  );

  const toggleMessageReaction = useCallback<JaTextStore["toggleMessageReaction"]>(
    async (messageId, emoji) => {
      await toggleReactionMut({ messageId: messageId as Id<"messages">, emoji });
    },
    [toggleReactionMut],
  );

  const deleteMessageForMe = useCallback<JaTextStore["deleteMessageForMe"]>(
    async (messageId) => {
      await deleteForMeMut({ messageId: messageId as Id<"messages"> });
    },
    [deleteForMeMut],
  );

  const unsendMessage = useCallback<JaTextStore["unsendMessage"]>(
    async (messageId) =>
      (await unsendMut({ messageId: messageId as Id<"messages"> })) as boolean,
    [unsendMut],
  );
  const editMessage = useCallback<JaTextStore["editMessage"]>(
    async (messageId, body) => {
      await editMessageMut({ messageId: messageId as Id<"messages">, body });
    },
    [editMessageMut],
  );

  const setConversationArchived = useCallback<JaTextStore["setConversationArchived"]>(
    async (friendId, archived) => {
      await updateConversationMut({
        friendId: friendId as Id<"users">,
        archived,
      });
    },
    [updateConversationMut],
  );

  const setConversationMuted = useCallback<JaTextStore["setConversationMuted"]>(
    async (friendId, muted) => {
      await updateConversationMut({
        friendId: friendId as Id<"users">,
        muted,
      });
    },
    [updateConversationMut],
  );

  const deleteConversationForMe = useCallback<JaTextStore["deleteConversationForMe"]>(
    async (friendId) => {
      await updateConversationMut({
        friendId: friendId as Id<"users">,
        deleteHistory: true,
      });
    },
    [updateConversationMut],
  );

  const setUserBlocked = useCallback<JaTextStore["setUserBlocked"]>(
    async (friendId, blocked) => {
      await setBlockMut({ userId: friendId as Id<"users">, blocked });
    },
    [setBlockMut],
  );

  const markMessagesRead = useCallback<JaTextStore["markMessagesRead"]>(
    async (friendId) => {
      await markReadMut({ otherId: friendId as Id<"users"> });
    },
    [markReadMut],
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
        receiverId: receiverId as Id<"users">,
        isTyping,
      });
    },
    [isAuthenticated, setTypingMut],
  );

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setNotificationPreferences((current) => {
      const next = { ...current, notificationsEnabled: enabled };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const setSoundsEnabled = useCallback((enabled: boolean) => {
    setNotificationPreferences((current) => {
      const next = { ...current, soundsEnabled: enabled };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const value: JaTextStore = {
    mode: "convex",
    loading: authLoading || (isAuthenticated && me === undefined),
    me: isAuthenticated ? (me ?? null) : null,
    friends,
    incoming,
    outgoing,
    previews,
    previewsReady: !isAuthenticated || previewsQuery !== undefined,
    friendActivities,
    notificationsEnabled: notificationPreferences.notificationsEnabled,
    pushRegistrationStatus,
    soundsEnabled: notificationPreferences.soundsEnabled,
    activeChatId,
    setActiveChatId: setActiveChatIdForStore,
    activeMessages,
    activeMessagesReady:
      !isAuthenticated ||
      !activeChatId ||
      activeChatId === OFFICIAL_COMMUNITY_ID ||
      activeMessagesQuery !== undefined,
    communityMessages,
    communityPermissions,
    communityDirectory,
    groups,
    activeGroupId,
    setActiveGroupId,
    groupDetails,
    groupMessages,
    blockedUserIds,
    signInEmail,
    signUpEmail,
    signInGoogle,
    signOut,
    checkUsername,
    saveProfile,
    sendFriendRequest,
    respondRequest,
    sendMessage,
    forwardMessage,
    toggleMessageReaction,
    deleteMessageForMe,
    unsendMessage,
    editMessage,
    setConversationArchived,
    setConversationMuted,
    deleteConversationForMe,
    setUserBlocked,
    markMessagesRead,
    stickerFavorites: stickerLibrary?.favorites ?? [],
    recentStickers: stickerLibrary?.recent ?? [],
    searchKlipy,
    saveSticker,
    setStickerFavorite,
    favoriteStickerFromMessage,
    sendSticker,
    setActivity,
    setTyping,
    setCommunityModerators,
    sendCommunityText,
    createCommunityPoll,
    voteCommunityPoll,
    endCommunityPoll,
    editCommunityMessage,
    deleteCommunityMessage,
    createGroup,
    sendGroupMessage,
    renameGroup,
    setGroupAvatar,
    setGroupMemberRole,
    setGroupMuted,
    removeGroupMember,
    leaveGroup,
    deleteGroup,
    refreshPushRegistration,
    setNotificationsEnabled,
    setSoundsEnabled,
  };

  return <JaTextContext.Provider value={value}>{children}</JaTextContext.Provider>;
}