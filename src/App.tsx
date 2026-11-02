import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ChatView } from "./components/ChatView";
import { CallOverlay } from "./components/CallOverlay";
import { GroupCallOverlay } from "./components/GroupCallOverlay";
import { CommunityChatView } from "./components/CommunityChatView";
import { GroupChatView } from "./components/GroupChatView";
import { IosMobileLoginPage } from "./components/IosMobileLoginPage";
import { LoginPage } from "./components/LoginPage";
import { MobileUpdateGate } from "./components/MobileUpdateGate";
import { StartupPermissionsModal } from "./components/StartupPermissionsModal";
import { Onboarding } from "./components/Onboarding";
import { NotificationWelcome } from "./components/NotificationWelcome";
import { ProfileModal } from "./components/ProfileCard";
import { SettingsModal, type SettingsCategory } from "./components/Settings";
import { CustomThemeDrawer } from "./components/CustomThemeDrawer";
import { AccountSwitcherModal } from "./components/AccountSwitcherModal";
import { closeTopmostAnimatedModal } from "./components/AnimatedModal";
import { LockIcon } from "./components/E2EEModals";
import { Sidebar } from "./components/Sidebar";
import { BellIcon, CloseIcon, MessageCircleIcon } from "./components/UiIcons";
import {
  CallProvider,
  formatPreviewMessageText,
  isHiddenCallSignal,
  parseCallInvite,
  useCall,
} from "./lib/calling";
import { flushPendingDrafts } from "./lib/drafts";
import {
  applyRemoteSyncedThemeIfChanged,
  setThemeUserScope,
} from "./lib/themeEngine";
import {
  getActiveE2EEState,
  getAllMyIdentities,
  getGroupEpochAllSecrets,
  getPeerKnownBundles,
  useE2EESnapshot,
} from "./lib/e2ee/keystore";
import { GroupCallProvider, useGroupCall } from "./lib/groupCalling";
import { getActiveAccountSlotId, getTursoTokenForSlotSync } from "./lib/accountManager";
import { PUBLIC_TURSO_API_ORIGIN } from "./lib/tursoClient";
import { isAuthorizedIosChatsRuntime, isPrimaryMobileAppRuntime } from "./lib/iosDetection";
import { JaTextNative } from "./lib/nativeBridge";
import { useJaText } from "./lib/store";
import {
  loadNotificationPreferences,
  playMessageSound,
  saveNotificationPreferences,
  syncSoundPreferencesToNative,
} from "./lib/alerts";
import { OFFICIAL_COMMUNITY_ID, type JaUser } from "./lib/types";

const NOTIFICATION_WELCOME_KEY = "jatext-notification-welcome-seen-v1";
const MOBILE_SLIDE_MS = 235;

function isPlaceholderNotificationText(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  if (t.includes("__JATEXT_E2EE_V1__:")) return true;
  const lower = t.toLowerCase();
  return (
    lower === "encrypted message" ||
    lower === "🔒 encrypted message" ||
    lower === "new message" ||
    lower.includes("sent an encrypted message") ||
    lower.includes("mentioned you in an encrypted message") ||
    lower.startsWith("decrypting") ||
    lower.startsWith("🔒 decrypting") ||
    lower.startsWith("waiting for this message")
  );
}

export default function App() {
  return (
    <CallProvider>
      <GroupCallProvider>
        <AppContent />
        <MobileUpdateHost />
      </GroupCallProvider>
    </CallProvider>
  );
}

function MobileUpdateHost() {
  const store = useJaText();
  if (!Capacitor.isNativePlatform()) return null;
  const readyForWelcome = !store.loading && Boolean(store.me?.onboardingComplete);
  return (
    <>
      <StartupPermissionsModal
        ready={readyForWelcome}
        onPermissionsUpdated={() => void store.refreshPushRegistration()}
      />
      <MobileUpdateGate readyForWelcome={readyForWelcome} />
    </>
  );
}

function AppContent() {
  const store = useJaText();
  const { session: callSession, minimized: callMinimized, setMinimized: setCallMinimized } =
    useCall();
  const {
    groupSession: groupCallSession,
    minimized: groupCallMinimized,
    setMinimized: setGroupCallMinimized,
  } = useGroupCall();
  const {
    activeChatId,
    activeGroupId,
    friends,
    groups,
    me,
    notificationsEnabled,
    previews,
    previewsReady,
    setActiveChatId,
    setActiveGroupId,
    soundsEnabled,
  } = store;
  const [profileUser, setProfileUser] = useState<JaUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialCategory, setSettingsInitialCategory] =
    useState<SettingsCategory>("profile");
  const [settingsDirectMobile, setSettingsDirectMobile] = useState(false);
  const [customThemeDrawerOpen, setCustomThemeDrawerOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);

  useLayoutEffect(() => {
    setThemeUserScope(me?.id);
  }, [me?.id]);

  useEffect(() => {
    if (me?.id && me.syncedTheme) {
      applyRemoteSyncedThemeIfChanged(me.id, me.syncedTheme, false);
    }
  }, [me?.id, me?.syncedTheme]);
  const [isMobileClosing, setIsMobileClosing] = useState(false);
  const mobileCloseTimerRef = useRef<number | null>(null);
  const closingTargetKeyRef = useRef<string>("");
  const firebasePushActiveRef = useRef(false);
  const e2eeSnapshot = useE2EESnapshot();
  const [notificationWelcomeSeen, setNotificationWelcomeSeen] = useState(
    () => localStorage.getItem(NOTIFICATION_WELCOME_KEY) === "true",
  );
  const [webNotifPromptVisible, setWebNotifPromptVisible] = useState<boolean>(() => {
    if (Capacitor.isNativePlatform() || typeof window === "undefined") return false;
    if (!("Notification" in window)) return false;
    if (sessionStorage.getItem("jatext_web_notif_banner_dismissed") === "1") return false;
    return Notification.permission === "default";
  });

  const enableDesktopBrowserNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setWebNotifPromptVisible(false);
      if (result === "granted") {
        const cur = loadNotificationPreferences();
        saveNotificationPreferences({
          ...cur,
          notificationsEnabled: true,
          soundsEnabled: true,
        });
        store.setNotificationsEnabled(true);
        playMessageSound("received");
      }
    } catch {
      setWebNotifPromptVisible(false);
    }
  }, [store]);
  const isNativeActiveRef = useRef(true);
  const previousPreviews = useRef<Map<string, string> | null>(null);
  const previousGroups = useRef<Map<string, string> | null>(null);
  const previousAnnouncementId = useRef<string | null | undefined>(undefined);
  const [inAppToastNotif, setInAppToastNotif] = useState<{
    id: string;
    title: string;
    body: string;
    onOpen: () => void;
  } | null>(null);
  const inAppToastTimerRef = useRef<number | null>(null);

  const showInAppToast = useCallback(
    (title: string, body: string, onOpen: () => void) => {
      if (inAppToastTimerRef.current !== null) {
        window.clearTimeout(inAppToastTimerRef.current);
      }
      setInAppToastNotif({
        id: `${Date.now()}-${Math.random()}`,
        title,
        body,
        onOpen,
      });
      inAppToastTimerRef.current = window.setTimeout(() => {
        inAppToastTimerRef.current = null;
        setInAppToastNotif(null);
      }, 4600);
    },
    [],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    syncSoundPreferencesToNative(loadNotificationPreferences());
    void JaTextNative.checkPushSupport()
      .then((res) => {
        firebasePushActiveRef.current = Boolean(res.firebaseConfigured);
      })
      .catch(() => undefined);

    const stateListener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      isNativeActiveRef.current = isActive;
    });
    const openListener = JaTextNative.addListener(
      "notificationOpen",
      ({ senderId, groupId, chatId, incomingCallWake }) => {
        if (incomingCallWake) {
          // Do NOT switch activeChatId / activeGroupId on automatic incomingCallWake!
          // CallOverlay / GroupCallOverlay render globally; opening the chat behind a locked
          // screen would falsely mark unread messages as Read before the user opens the chat.
          setCallMinimized(false);
          setGroupCallMinimized(false);
          return;
        }
        if (chatId === OFFICIAL_COMMUNITY_ID) {
          setActiveChatId(OFFICIAL_COMMUNITY_ID);
        } else if (groupId) {
          setActiveGroupId(groupId);
        } else if (senderId) {
          setActiveChatId(senderId);
        }
      },
    );
    return () => {
      void stateListener.then((handle) => handle.remove());
      void openListener.then((handle) => handle.remove());
    };
  }, [setActiveChatId, setActiveGroupId, setCallMinimized, setGroupCallMinimized]);

  const activeFriend = useMemo(() => {
    if (!store.activeChatId || store.activeChatId === OFFICIAL_COMMUNITY_ID) return null;
    if (store.me && store.activeChatId === store.me.id) return store.me;
    return store.friends.find((f) => f.id === store.activeChatId) ?? null;
  }, [store.activeChatId, store.friends, store.me]);
  const activeCommunity = activeChatId === OFFICIAL_COMMUNITY_ID;
  const activeGroup = !!store.activeGroupId;
  const hasActivePane = Boolean(activeFriend || activeCommunity || activeGroup);

  const activePaneKey = activeGroupId
    ? `grp:${activeGroupId}`
    : activeChatId
      ? `chat:${activeChatId}`
      : "";

  // If user taps a different chat in Sidebar while a back slide-out was mid-flight, cancel close timer
  useEffect(() => {
    if (isMobileClosing && activePaneKey && activePaneKey !== closingTargetKeyRef.current) {
      if (mobileCloseTimerRef.current !== null) {
        window.clearTimeout(mobileCloseTimerRef.current);
        mobileCloseTimerRef.current = null;
      }
      closingTargetKeyRef.current = "";
      setIsMobileClosing(false);
    }
  }, [activePaneKey, isMobileClosing]);

  useEffect(() => {
    return () => {
      if (mobileCloseTimerRef.current !== null) {
        window.clearTimeout(mobileCloseTimerRef.current);
      }
    };
  }, []);

  const handleMobileAnimatedBack = useCallback(() => {
    flushPendingDrafts();
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth <= 820;
    if (!isMobileViewport || (!activeGroupId && !activeChatId)) {
      if (activeGroupId) setActiveGroupId(null);
      if (activeChatId) setActiveChatId(null);
      return;
    }

    if (isMobileClosing) return;
    closingTargetKeyRef.current = activeGroupId ? `grp:${activeGroupId}` : `chat:${activeChatId}`;
    setIsMobileClosing(true);

    if (mobileCloseTimerRef.current !== null) {
      window.clearTimeout(mobileCloseTimerRef.current);
    }
    mobileCloseTimerRef.current = window.setTimeout(() => {
      mobileCloseTimerRef.current = null;
      closingTargetKeyRef.current = "";
      setActiveGroupId(null);
      setActiveChatId(null);
      setIsMobileClosing(false);
    }, MOBILE_SLIDE_MS);
  }, [activeChatId, activeGroupId, isMobileClosing, setActiveChatId, setActiveGroupId]);

  const navigationStateRef = useRef({
    activeChatId,
    activeGroupId,
    hasProfile: Boolean(profileUser),
    settingsOpen,
    customThemeDrawerOpen,
    accountSwitcherOpen,
    callFullScreen: false,
    groupCallFullScreen: false,
  });

  // keep the open profile card fresh if that user's data changes
  const freshProfileUser = useMemo(() => {
    if (!profileUser) return null;
    if (store.me?.id === profileUser.id) return store.me;
    return (
      store.friends.find((f) => f.id === profileUser.id) ??
      store.groupDetails?.members.find((m) => m.id === profileUser.id) ??
      store.incoming.find((r) => r.from.id === profileUser.id)?.from ??
      store.outgoing.find((r) => r.to.id === profileUser.id)?.to ??
      profileUser
    );
  }, [profileUser, store.friends, store.groupDetails, store.incoming, store.me, store.outgoing]);

  const profileStatus = useMemo(() => {
    if (!freshProfileUser) return undefined;
    const activity = store.friendActivities.find(
      (entry) => entry.userId === freshProfileUser.id,
    );
    if (activity) return activity.status;
    if (freshProfileUser.id !== store.me?.id) return undefined;
    return freshProfileUser.statusPreference === "offline" ||
      freshProfileUser.statusPreference === "dnd"
      ? freshProfileUser.statusPreference
      : "online";
  }, [freshProfileUser, store.friendActivities, store.me?.id]);

  // Sync E2EE decryption keys & notification settings to Android MODE_PRIVATE keystore
  // so background/closed FCM push notifications decrypt on-device like WhatsApp!
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !me?.id) return;
    const state = getActiveE2EEState();
    if (!state || state.userId !== me.id) return;

    const identities = getAllMyIdentities(state).map((id) => ({
      keyId: id.keyId,
      dhPrivPkcs8B64: id.dhPrivPkcs8B64,
      dhPubB64: id.dhPubB64,
    }));
    const peers: Record<string, { keyId: string; dhPubB64: string }[]> = {};
    for (const [peerId, entry] of Object.entries(state.peerKeys)) {
      peers[peerId] = getPeerKnownBundles(entry).map((b) => ({
        keyId: b.keyId,
        dhPubB64: b.dhPubB64,
      }));
    }
    const groupEpochs: Record<string, string | string[]> = {};
    for (const [gid, epMap] of Object.entries(state.groupEpochs)) {
      for (const [ep, epEntry] of Object.entries(epMap)) {
        const allSecrets = getGroupEpochAllSecrets(epEntry);
        if (allSecrets.length > 0) {
          groupEpochs[`${gid}:${ep}`] = allSecrets.length === 1 ? allSecrets[0] : allSecrets;
        }
      }
    }

    let authJwt: string | undefined;
    try {
      authJwt = getTursoTokenForSlotSync(getActiveAccountSlotId()) ?? undefined;
    } catch {
      // Ignore storage read failure
    }

    void JaTextNative.syncE2EENotificationState({
      convexUrl: PUBLIC_TURSO_API_ORIGIN,
      userId: me.id,
      notificationsEnabled,
      isDnd: me.statusPreference === "dnd",
      identitiesJson: JSON.stringify(identities),
      peersJson: JSON.stringify(peers),
      groupsJson: JSON.stringify(groupEpochs),
      authJwt,
      authRefreshToken: undefined,
    }).catch(() => undefined);
  }, [e2eeSnapshot.version, me?.id, me?.statusPreference, notificationsEnabled]);

  useEffect(() => {
    if (!me || !previewsReady) {
      previousPreviews.current = null;
      return;
    }

    const previous = previousPreviews.current;
    const current = new Map<string, string>();
    for (const preview of previews) {
      current.set(preview.friendId, `${preview.createdAt}:${preview.senderId}`);
    }
    previousPreviews.current = current;
    if (!previous) return;

    for (const preview of previews) {
      const sig = `${preview.createdAt}:${preview.senderId}`;
      if (previous.get(preview.friendId) === sig) {
        continue;
      }
      if (
        preview.createdAt === 0 ||
        preview.friendId === me.id ||
        preview.senderId === me.id ||
        preview.isMuted ||
        preview.isArchived ||
        me.statusPreference === "dnd" ||
        isHiddenCallSignal(preview.body) ||
        Boolean(parseCallInvite(preview.body))
      ) {
        continue;
      }

      const friend = friends.find((user) => user.id === preview.friendId);
      if (!friend) continue;

      const isNative = Capacitor.isNativePlatform();
      const appInForeground = isNative
        ? isNativeActiveRef.current && document.visibilityState === "visible"
        : document.visibilityState === "visible" && document.hasFocus();
      const viewingThisExactChat = appInForeground && activeChatId === friend.id && !activeGroupId;

      if (soundsEnabled && (!viewingThisExactChat || !isNative)) {
        playMessageSound("received");
      }

      const readableText = formatPreviewMessageText(preview.body);
      const shouldDispatchAlert =
        notificationsEnabled &&
        !viewingThisExactChat &&
        (!isNative || !firebasePushActiveRef.current);

      if (shouldDispatchAlert) {
        const dispatchDmNotification = (finalText: string) => {
          const cleanBody = isPlaceholderNotificationText(finalText)
            ? "Sent you a message"
            : finalText;
          const openChat = () => {
            setActiveGroupId(null);
            setActiveChatId(friend.id);
          };
          if (isNative) {
            void JaTextNative.showDecryptedNotification({
              tag: `dm:${friend.id}`,
              title: `New message from ${friend.displayName}`,
              body: cleanBody,
              senderId: friend.id,
            }).catch(() => undefined);
          } else {
            let shownOsNotif = false;
            if (
              !appInForeground &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                const notification = new Notification(`Message from ${friend.displayName}`, {
                  body: cleanBody,
                  icon: "/jatext-logo-icon.png",
                  badge: "/jatext-logo-icon.png",
                  tag: `jatext-dm-${friend.id}-${preview.createdAt}`,
                  silent: true,
                });
                notification.onclick = () => {
                  window.focus();
                  openChat();
                  notification.close();
                };
                shownOsNotif = true;
              } catch {
                // Browser disallowed direct Notification construction; fall back to in-app toast
              }
            }
            if (appInForeground || !shownOsNotif) {
              showInAppToast(friend.displayName || `@${friend.username}`, cleanBody, openChat);
            }
          }
        };

        if (isPlaceholderNotificationText(readableText)) {
          void store
            .fetchMessagesWithUser(friend.id)
            .then((rows) => {
              const latest = [...rows]
                .reverse()
                .find((m) => m.senderId === friend.id && !m.unsentAt && !isHiddenCallSignal(m.body));
              const resolved = latest
                ? formatPreviewMessageText(latest.body) ||
                  (latest.attachmentType?.startsWith("audio/")
                    ? "Voice note"
                    : latest.attachmentName || "Sent you an attachment")
                : "Sent you a message";
              dispatchDmNotification(resolved);
            })
            .catch(() => dispatchDmNotification("Sent you a message"));
        } else {
          dispatchDmNotification(readableText || "Sent you an attachment");
        }
      }
    }
  }, [
    activeChatId,
    activeGroupId,
    friends,
    me,
    notificationsEnabled,
    previews,
    previewsReady,
    setActiveChatId,
    setActiveGroupId,
    showInAppToast,
    soundsEnabled,
    store,
  ]);

  useEffect(() => {
    if (!me || !previewsReady) {
      previousGroups.current = null;
      return;
    }

    const previous = previousGroups.current;
    const current = new Map<string, string>();
    for (const group of groups) {
      current.set(group.id, `${group.lastMessageAt}:${group.lastSenderId ?? ""}`);
    }
    previousGroups.current = current;
    if (!previous) return;

    for (const group of groups) {
      const signature = `${group.lastMessageAt}:${group.lastSenderId ?? ""}`;
      if (previous.get(group.id) === signature) continue;
      if (
        group.lastMessageAt === 0 ||
        group.isArchived ||
        (group.isSilenced && !group.lastMentionedMe) ||
        !group.lastSenderId ||
        group.lastSenderId === me.id ||
        me.statusPreference === "dnd" ||
        isHiddenCallSignal(group.lastMessage)
      ) {
        continue;
      }

      const isNative = Capacitor.isNativePlatform();
      const appInForeground = isNative
        ? isNativeActiveRef.current && document.visibilityState === "visible"
        : document.visibilityState === "visible" && document.hasFocus();
      const viewingThisExactGroup = appInForeground && activeGroupId === group.id;

      if (soundsEnabled && (!viewingThisExactGroup || !isNative)) {
        playMessageSound("received");
      }

      const senderLabel = group.lastSenderName || "Someone";
      const title = group.lastMentionedMe
        ? `${senderLabel} mentioned you in ${group.name}`
        : `${group.name} · ${senderLabel}`;
      const readableGroupBody = formatPreviewMessageText(group.lastMessage);

      if (
        notificationsEnabled &&
        !viewingThisExactGroup &&
        (!isNative || !firebasePushActiveRef.current)
      ) {
        const dispatchGroupNotification = (finalGroupBody: string) => {
          const cleanBody = isPlaceholderNotificationText(finalGroupBody)
            ? "New message in group"
            : finalGroupBody;
          const openGroup = () => {
            setActiveChatId(null);
            setActiveGroupId(group.id);
          };
          if (isNative) {
            void JaTextNative.showDecryptedNotification({
              tag: `group:${group.id}`,
              title,
              body: cleanBody,
              groupId: group.id,
            }).catch(() => undefined);
          } else {
            let shownOsNotif = false;
            if (
              !appInForeground &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                const notification = new Notification(title, {
                  body: cleanBody,
                  icon: "/jatext-logo-icon.png",
                  badge: "/jatext-logo-icon.png",
                  tag: `jatext-group-${group.id}-${group.lastMessageAt}`,
                  silent: true,
                });
                notification.onclick = () => {
                  window.focus();
                  openGroup();
                  notification.close();
                };
                shownOsNotif = true;
              } catch {
                // Fall back to in-app toast
              }
            }
            if (appInForeground || !shownOsNotif) {
              showInAppToast(title, cleanBody, openGroup);
            }
          }
        };

        if (isPlaceholderNotificationText(readableGroupBody)) {
          void store
            .fetchGroupMessages(group.id)
            .then((rows) => {
              const latest = [...rows]
                .reverse()
                .find((m) => m.senderId !== me.id && !m.unsentAt && !isHiddenCallSignal(m.body));
              const resolved = latest
                ? formatPreviewMessageText(latest.body) ||
                  latest.stickerName ||
                  latest.attachmentName ||
                  "New message in group"
                : "New message in group";
              dispatchGroupNotification(resolved);
            })
            .catch(() => dispatchGroupNotification("New message in group"));
        } else {
          dispatchGroupNotification(readableGroupBody || "Open group chat");
        }
      }
    }
  }, [
    activeGroupId,
    groups,
    me,
    notificationsEnabled,
    previewsReady,
    setActiveChatId,
    setActiveGroupId,
    showInAppToast,
    soundsEnabled,
    store,
  ]);

  // JaText Announcements watcher: notify everyone whenever a new announcement is posted!
  useEffect(() => {
    if (!me || !store.communityMessagesReady) {
      previousAnnouncementId.current = undefined;
      return;
    }

    const visibleAnnouncements = store.communityMessages.filter((m) => !m.unsentAt);
    const latest = visibleAnnouncements.at(-1) ?? null;
    const latestId = latest?.id ?? null;

    if (previousAnnouncementId.current === undefined) {
      previousAnnouncementId.current = latestId;
      return;
    }

    if (!latest || latestId === previousAnnouncementId.current) {
      return;
    }
    previousAnnouncementId.current = latestId;

    if (
      latest.senderId === me.id ||
      store.communityMuted ||
      me.statusPreference === "dnd"
    ) {
      return;
    }

    const appInForeground = Capacitor.isNativePlatform()
      ? isNativeActiveRef.current && document.visibilityState === "visible"
      : document.visibilityState === "visible";

    if (soundsEnabled && appInForeground) {
      playMessageSound("received");
    }

    const announcementBody =
      latest.type === "poll"
        ? `Poll: ${latest.body}`
        : latest.type === "sticker"
          ? latest.stickerName
            ? `Sticker: ${latest.stickerName}`
            : "Posted a sticker"
          : formatPreviewMessageText(latest.body) ||
            (latest.attachmentName ? `Shared ${latest.attachmentName}` : "New announcement");

    if (
      notificationsEnabled &&
      !appInForeground &&
      (!Capacitor.isNativePlatform() || !firebasePushActiveRef.current)
    ) {
      if (Capacitor.isNativePlatform()) {
        void JaTextNative.showDecryptedNotification({
          tag: "community:announcements",
          title: "JaText Announcements",
          body: announcementBody,
          chatId: OFFICIAL_COMMUNITY_ID,
        }).catch(() => undefined);
      } else if ("Notification" in window && Notification.permission === "granted") {
        try {
          const notification = new Notification("JaText Announcements", {
            body: announcementBody,
            tag: "jatext-announcements",
          });
          notification.onclick = () => {
            window.focus();
            setActiveChatId(OFFICIAL_COMMUNITY_ID);
            notification.close();
          };
        } catch {
          // Mobile browsers / WebViews disallow direct Notification construction.
        }
      }
    }
  }, [
    me,
    notificationsEnabled,
    setActiveChatId,
    soundsEnabled,
    store.communityMessages,
    store.communityMessagesReady,
    store.communityMuted,
  ]);

  useLayoutEffect(() => {
    navigationStateRef.current = {
      activeChatId,
      activeGroupId,
      hasProfile: Boolean(profileUser),
      settingsOpen,
      customThemeDrawerOpen,
      accountSwitcherOpen,
      callFullScreen: Boolean(
        callSession &&
          !callMinimized &&
          callSession.phase !== "incoming" &&
          callSession.phase !== "dismissed",
      ),
      groupCallFullScreen: Boolean(
        groupCallSession &&
          !groupCallMinimized &&
          groupCallSession.phase !== "incoming" &&
          groupCallSession.phase !== "dismissed",
      ),
    };
  }, [
    accountSwitcherOpen,
    activeChatId,
    activeGroupId,
    callMinimized,
    callSession,
    customThemeDrawerOpen,
    groupCallMinimized,
    groupCallSession,
    profileUser,
    settingsOpen,
  ]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      const navigation = navigationStateRef.current;
      if (navigation.groupCallFullScreen) {
        setGroupCallMinimized(true);
      } else if (navigation.callFullScreen) {
        setCallMinimized(true);
      } else if (navigation.customThemeDrawerOpen) {
        setCustomThemeDrawerOpen(false);
        setSettingsInitialCategory("appearance");
        setSettingsDirectMobile(true);
        setSettingsOpen(true);
      } else if (closeTopmostAnimatedModal()) {
        return;
      } else if (navigation.accountSwitcherOpen) {
        setAccountSwitcherOpen(false);
      } else if (navigation.settingsOpen) {
        setSettingsOpen(false);
      } else if (navigation.hasProfile) {
        setProfileUser(null);
      } else if (navigation.activeGroupId || navigation.activeChatId) {
        handleMobileAnimatedBack();
      } else if (canGoBack) {
        window.history.back();
      } else {
        void CapacitorApp.minimizeApp().catch(() => CapacitorApp.exitApp());
      }
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [handleMobileAnimatedBack, setCallMinimized, setGroupCallMinimized]);

  useEffect(() => {
    const preventNativeContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", preventNativeContextMenu);
    return () => document.removeEventListener("contextmenu", preventNativeContextMenu);
  }, []);

  if (store.loading) {
    return (
      <div className="splash">
        <img className="logo-icon splash-logo" src="/jatext-logo-icon.png" alt="" />
        <p className="splash-loading-text">Loading JaText…</p>
        <div className="splash-e2ee" role="status" aria-label="End-to-End Encrypted">
          <LockIcon size={14} className="splash-e2ee-icon" />
          <span>End-to-End Encrypted</span>
        </div>
      </div>
    );
  }

  if (!store.me && Capacitor.isNativePlatform() && !notificationWelcomeSeen) {
    return (
      <NotificationWelcome
        onContinue={() => {
          localStorage.setItem(NOTIFICATION_WELCOME_KEY, "true");
          setNotificationWelcomeSeen(true);
        }}
      />
    );
  }

  const isIosChats = isAuthorizedIosChatsRuntime();
  const isPrimaryMobile = isPrimaryMobileAppRuntime();

  if (!store.me) {
    return isIosChats ? <IosMobileLoginPage /> : <LoginPage />;
  }

  if (!store.me.onboardingComplete) return <Onboarding />;

  const renderMainPaneContent = () => {
    if (activeCommunity) {
      return (
        <CommunityChatView
          onOpenProfile={setProfileUser}
          onBack={handleMobileAnimatedBack}
        />
      );
    }
    if (activeGroup) {
      return (
        <GroupChatView
          key={store.activeGroupId}
          onOpenProfile={setProfileUser}
          onBack={handleMobileAnimatedBack}
        />
      );
    }
    if (activeFriend) {
      return (
        <ChatView
          key={activeFriend.id}
          friend={activeFriend}
          onOpenProfile={setProfileUser}
          onBack={handleMobileAnimatedBack}
        />
      );
    }
    return (
      <div className="no-chat">
        <img className="logo-icon no-chat-logo" src="/jatext-logo-icon.png" alt="" />
        <h2>
          Pick a chat <MessageCircleIcon size={22} style={{ color: "var(--accent)" }} />
        </h2>
        <p className="muted">
          Choose a friend on the left to start texting, or add someone new
          by their username.
        </p>
        <p className="muted small">
          Tip: click anyone&apos;s profile picture to see their profile card,
          banner, bio, pronouns, and avatar color.
        </p>
      </div>
    );
  };

  return (
    <div
      className={`app-shell ${hasActivePane && !isMobileClosing ? "chat-open" : ""} ${
        hasActivePane && isMobileClosing ? "chat-closing" : ""
      }`}
    >
      <Sidebar
        onOpenProfile={setProfileUser}
        onOpenSettings={() => {
          setSettingsInitialCategory("profile");
          setSettingsDirectMobile(false);
          setSettingsOpen(true);
        }}
        onOpenAccountSwitcher={
          isPrimaryMobile ? () => setAccountSwitcherOpen(true) : undefined
        }
      />
      <main className="main-pane">{renderMainPaneContent()}</main>

      {freshProfileUser && (
        <ProfileModal
          user={freshProfileUser}
          status={profileStatus}
          onClose={() => setProfileUser(null)}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          initialCategory={settingsInitialCategory}
          openCategoryDirectlyOnMobile={settingsDirectMobile}
          onClose={() => setSettingsOpen(false)}
          onOpenAccountSwitcher={
            isPrimaryMobile
              ? () => {
                  setSettingsOpen(false);
                  setAccountSwitcherOpen(true);
                }
              : undefined
          }
          onOpenCustomThemeDrawer={() => {
            setSettingsOpen(false);
            setCustomThemeDrawerOpen(true);
          }}
        />
      )}
      {customThemeDrawerOpen && (
        <CustomThemeDrawer
          onClose={() => setCustomThemeDrawerOpen(false)}
          onBackToSettings={() => {
            setCustomThemeDrawerOpen(false);
            setSettingsInitialCategory("appearance");
            setSettingsDirectMobile(true);
            setSettingsOpen(true);
          }}
        />
      )}
      {isPrimaryMobile && accountSwitcherOpen && (
        <AccountSwitcherModal onClose={() => setAccountSwitcherOpen(false)} />
      )}
      {inAppToastNotif && (
        <div
          key={inAppToastNotif.id}
          className="jatext-live-toast-pill"
          role="status"
          onClick={() => {
            inAppToastNotif.onOpen();
            setInAppToastNotif(null);
          }}
        >
          <span className="jatext-live-toast-icon" aria-hidden="true">
            <MessageCircleIcon size={16} />
          </span>
          <div className="jatext-live-toast-copy">
            <strong>{inAppToastNotif.title}</strong>
            <span>{inAppToastNotif.body}</span>
          </div>
          <button
            type="button"
            className="icon-btn jatext-live-toast-close"
            aria-label="Dismiss notification"
            onClick={(e) => {
              e.stopPropagation();
              setInAppToastNotif(null);
            }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      )}
      {webNotifPromptVisible && !isIosChats && (
        <div className="desktop-notif-banner" role="region" aria-label="Enable desktop notifications">
          <span className="desktop-notif-banner-icon" aria-hidden="true">
            <BellIcon size={16} />
          </span>
          <span className="desktop-notif-banner-text">
            Turn on desktop notifications &amp; JaText alert sound for new messages
          </span>
          <button
            type="button"
            className="primary-btn desktop-notif-enable-btn"
            onClick={() => void enableDesktopBrowserNotifications()}
          >
            <span>Enable</span>
          </button>
          <button
            type="button"
            className="icon-btn desktop-notif-close-btn"
            aria-label="Dismiss notification prompt"
            onClick={() => {
              sessionStorage.setItem("jatext_web_notif_banner_dismissed", "1");
              setWebNotifPromptVisible(false);
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
      <CallOverlay />
      <GroupCallOverlay />
    </div>
  );
}
