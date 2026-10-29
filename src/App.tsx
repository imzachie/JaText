import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ChatView } from "./components/ChatView";
import { CallOverlay } from "./components/CallOverlay";
import { GroupCallOverlay } from "./components/GroupCallOverlay";
import { CommunityChatView } from "./components/CommunityChatView";
import { GroupChatView } from "./components/GroupChatView";
import { LoginPage } from "./components/LoginPage";
import { MobileUpdateGate } from "./components/MobileUpdateGate";
import { StartupPermissionsModal } from "./components/StartupPermissionsModal";
import { Onboarding } from "./components/Onboarding";
import { NotificationWelcome } from "./components/NotificationWelcome";
import { ProfileModal } from "./components/ProfileCard";
import { SettingsModal } from "./components/Settings";
import { AccountSwitcherModal } from "./components/AccountSwitcherModal";
import { closeTopmostAnimatedModal } from "./components/AnimatedModal";
import { LockIcon } from "./components/E2EEModals";
import { Sidebar } from "./components/Sidebar";
import { MessageCircleIcon } from "./components/UiIcons";
import {
  CallProvider,
  formatPreviewMessageText,
  isHiddenCallSignal,
  parseCallInvite,
  useCall,
} from "./lib/calling";
import { flushPendingDrafts } from "./lib/drafts";
import {
  getActiveE2EEState,
  getAllMyIdentities,
  getGroupEpochAllSecrets,
  getPeerKnownBundles,
  useE2EESnapshot,
} from "./lib/e2ee/keystore";
import { GroupCallProvider, useGroupCall } from "./lib/groupCalling";
import { getActiveAccountSlotId, getConvexAuthKeysForSlot } from "./lib/accountManager";
import { JaTextNative } from "./lib/nativeBridge";
import { useJaText } from "./lib/store";
import {
  loadNotificationPreferences,
  playMessageSound,
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
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [isMobileClosing, setIsMobileClosing] = useState(false);
  const mobileCloseTimerRef = useRef<number | null>(null);
  const closingTargetKeyRef = useRef<string>("");
  const firebasePushActiveRef = useRef(false);
  const e2eeSnapshot = useE2EESnapshot();
  const [notificationWelcomeSeen, setNotificationWelcomeSeen] = useState(
    () => localStorage.getItem(NOTIFICATION_WELCOME_KEY) === "true",
  );
  const isNativeActiveRef = useRef(true);
  const previousPreviews = useRef<Map<string, string> | null>(null);
  const previousGroups = useRef<Map<string, string> | null>(null);
  const previousAnnouncementId = useRef<string | null | undefined>(undefined);

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
          setCallMinimized(false);
          setGroupCallMinimized(false);
          if (groupId) {
            setActiveGroupId(groupId);
          } else if (senderId) {
            setActiveChatId(senderId);
          }
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

  const activeFriend = useMemo(
    () => store.friends.find((f) => f.id === store.activeChatId) ?? null,
    [store.activeChatId, store.friends],
  );
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

    const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "";
    let authJwt: string | undefined;
    let authRefreshToken: string | undefined;
    if (convexUrl) {
      try {
        const keys = getConvexAuthKeysForSlot(convexUrl, getActiveAccountSlotId());
        authJwt = localStorage.getItem(keys.jwtKey) ?? undefined;
        authRefreshToken = localStorage.getItem(keys.refreshKey) ?? undefined;
      } catch {
        // Ignore storage read failure
      }
    }

    void JaTextNative.syncE2EENotificationState({
      convexUrl: convexUrl || undefined,
      userId: me.id,
      notificationsEnabled,
      isDnd: me.statusPreference === "dnd",
      identitiesJson: JSON.stringify(identities),
      peersJson: JSON.stringify(peers),
      groupsJson: JSON.stringify(groupEpochs),
      authJwt,
      authRefreshToken,
    }).catch(() => undefined);
  }, [e2eeSnapshot.version, me?.id, me?.statusPreference, notificationsEnabled]);

  useEffect(() => {
    if (!me || !previewsReady) {
      previousPreviews.current = null;
      return;
    }

    const previous = previousPreviews.current;
    const current = new Map<string, string>();
    const now = Date.now();
    let pendingHydration = false;

    for (const preview of previews) {
      const sig = `${preview.createdAt}:${preview.senderId}`;
      const isPendingE2EE =
        Boolean(previous) &&
        previous?.get(preview.friendId) !== sig &&
        isPlaceholderNotificationText(preview.body) &&
        now - preview.createdAt < 12_000;
      if (isPendingE2EE) {
        pendingHydration = true;
        const prevSig = previous?.get(preview.friendId);
        if (prevSig !== undefined) current.set(preview.friendId, prevSig);
      } else {
        current.set(preview.friendId, sig);
      }
    }

    previousPreviews.current = current;
    if (!previous) return;

    let fallbackTimer: number | null = null;
    if (pendingHydration) {
      fallbackTimer = window.setTimeout(() => {
        previousPreviews.current = new Map(current);
      }, 12_200);
    }

    for (const preview of previews) {
      const sig = `${preview.createdAt}:${preview.senderId}`;
      if (previous.get(preview.friendId) === sig || current.get(preview.friendId) !== sig) {
        continue;
      }
      if (
        preview.createdAt === 0 ||
        preview.senderId === me.id ||
        preview.isMuted ||
        me.statusPreference === "dnd" ||
        isHiddenCallSignal(preview.body) ||
        Boolean(parseCallInvite(preview.body))
      ) {
        continue;
      }

      const friend = friends.find((user) => user.id === preview.friendId);
      if (!friend) continue;

      const appInForeground = Capacitor.isNativePlatform()
        ? isNativeActiveRef.current && document.visibilityState === "visible"
        : document.visibilityState === "visible";

      if (soundsEnabled && appInForeground) {
        playMessageSound("received");
      }

      const readableText = formatPreviewMessageText(preview.body);

      // Only show system notifications when minimized/hidden — NEVER while in the app!
      // On Android with FCM active, native JaTextFirebaseMessagingService handles background pushes directly.
      if (
        notificationsEnabled &&
        !appInForeground &&
        (!Capacitor.isNativePlatform() || !firebasePushActiveRef.current)
      ) {
        const dispatchDmNotification = (finalText: string) => {
          if (isPlaceholderNotificationText(finalText)) return;
          if (Capacitor.isNativePlatform()) {
            void JaTextNative.showDecryptedNotification({
              tag: `dm:${friend.id}`,
              title: `New message from ${friend.displayName}`,
              body: finalText,
              senderId: friend.id,
            }).catch(() => undefined);
          } else if ("Notification" in window && Notification.permission === "granted") {
            try {
              const notification = new Notification(`Message from ${friend.displayName}`, {
                body: finalText,
                tag: `jatext-${friend.id}`,
              });
              notification.onclick = () => {
                window.focus();
                setActiveChatId(friend.id);
                notification.close();
              };
            } catch {
              // Mobile browsers / WebViews disallow direct Notification construction.
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
                : "";
              if (resolved && !isPlaceholderNotificationText(resolved)) {
                dispatchDmNotification(resolved);
              }
            })
            .catch(() => undefined);
        } else {
          dispatchDmNotification(readableText || "Sent you an attachment");
        }
      }
    }

    return () => {
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [
    friends,
    me,
    notificationsEnabled,
    previews,
    previewsReady,
    setActiveChatId,
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
    const now = Date.now();
    for (const group of groups) {
      const sig = `${group.lastMessageAt}:${group.lastSenderId ?? ""}`;
      const isPendingGroupE2EE =
        Boolean(previous) &&
        previous?.get(group.id) !== sig &&
        isPlaceholderNotificationText(group.lastMessage) &&
        now - group.lastMessageAt < 12_000;
      if (isPendingGroupE2EE) {
        const prevSig = previous?.get(group.id);
        if (prevSig !== undefined) current.set(group.id, prevSig);
      } else {
        current.set(group.id, sig);
      }
    }
    previousGroups.current = current;
    if (!previous) return;

    for (const group of groups) {
      const signature = `${group.lastMessageAt}:${group.lastSenderId ?? ""}`;
      if (previous.get(group.id) === signature || current.get(group.id) !== signature) continue;
      if (
        !group.lastMentionedMe ||
        group.lastSenderId === me.id ||
        me.statusPreference === "dnd"
      ) {
        continue;
      }

      const appInForeground = Capacitor.isNativePlatform()
        ? isNativeActiveRef.current && document.visibilityState === "visible"
        : document.visibilityState === "visible";

      if (soundsEnabled && appInForeground) {
        playMessageSound("received");
      }

      const senderLabel = group.lastSenderName || "Someone";
      const title = `${senderLabel} mentioned you in ${group.name}`;
      const readableGroupBody = formatPreviewMessageText(group.lastMessage);

      if (
        notificationsEnabled &&
        !appInForeground &&
        (!Capacitor.isNativePlatform() || !firebasePushActiveRef.current)
      ) {
        const dispatchGroupNotification = (finalGroupBody: string) => {
          if (isPlaceholderNotificationText(finalGroupBody)) return;
          if (Capacitor.isNativePlatform()) {
            void JaTextNative.showDecryptedNotification({
              tag: `group:${group.id}`,
              title,
              body: finalGroupBody,
              groupId: group.id,
            }).catch(() => undefined);
          } else if ("Notification" in window && Notification.permission === "granted") {
            try {
              const notification = new Notification(title, {
                body: finalGroupBody,
                tag: `jatext-group-${group.id}`,
              });
              notification.onclick = () => {
                window.focus();
                setActiveGroupId(group.id);
                notification.close();
              };
            } catch {
              // Mobile browsers / WebViews disallow direct Notification construction.
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
                  "Mentioned you in group"
                : "";
              if (resolved && !isPlaceholderNotificationText(resolved)) {
                dispatchGroupNotification(resolved);
              }
            })
            .catch(() => undefined);
        } else {
          dispatchGroupNotification(readableGroupBody || "Open group chat");
        }
      }
    }
  }, [
    groups,
    me,
    notificationsEnabled,
    previewsReady,
    setActiveGroupId,
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

    if (latest.senderId === me.id || me.statusPreference === "dnd") {
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
  ]);

  useLayoutEffect(() => {
    navigationStateRef.current = {
      activeChatId,
      activeGroupId,
      hasProfile: Boolean(profileUser),
      settingsOpen,
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

  if (!store.me && !notificationWelcomeSeen) {
    return (
      <NotificationWelcome
        onContinue={() => {
          localStorage.setItem(NOTIFICATION_WELCOME_KEY, "true");
          setNotificationWelcomeSeen(true);
        }}
      />
    );
  }

  if (!store.me) return <LoginPage />;

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
          Tip: click anyone's profile picture to see their profile card —
          banner, bio, pronouns and avatar color included.
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
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAccountSwitcher={() => setAccountSwitcherOpen(true)}
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
          onClose={() => setSettingsOpen(false)}
          onOpenAccountSwitcher={() => {
            setSettingsOpen(false);
            setAccountSwitcherOpen(true);
          }}
        />
      )}
      {accountSwitcherOpen && (
        <AccountSwitcherModal onClose={() => setAccountSwitcherOpen(false)} />
      )}
      <CallOverlay />
      <GroupCallOverlay />
    </div>
  );
}
