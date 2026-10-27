import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ChatView } from "./components/ChatView";
import { CallOverlay } from "./components/CallOverlay";
import { GroupCallOverlay } from "./components/GroupCallOverlay";
import { CommunityChatView } from "./components/CommunityChatView";
import { GroupChatView } from "./components/GroupChatView";
import { LoginPage } from "./components/LoginPage";
import { MobileUpdateGate } from "./components/MobileUpdateGate";
import { Onboarding } from "./components/Onboarding";
import { NotificationWelcome } from "./components/NotificationWelcome";
import { ProfileModal } from "./components/ProfileCard";
import { SettingsModal } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import {
  CallProvider,
  formatPreviewMessageText,
  isHiddenCallSignal,
  parseCallInvite,
  useCall,
} from "./lib/calling";
import { GroupCallProvider, useGroupCall } from "./lib/groupCalling";
import { useJaText } from "./lib/store";
import { playMessageSound } from "./lib/alerts";
import { OFFICIAL_COMMUNITY_ID, type JaUser } from "./lib/types";

const NOTIFICATION_WELCOME_KEY = "jatext-notification-welcome-seen-v1";

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
  return <MobileUpdateGate readyForWelcome={readyForWelcome} />;
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
  const [notificationWelcomeSeen, setNotificationWelcomeSeen] = useState(
    () => localStorage.getItem(NOTIFICATION_WELCOME_KEY) === "true",
  );
  const isNativeActiveRef = useRef(true);
  const previousPreviews = useRef<Map<string, string> | null>(null);
  const previousGroups = useRef<Map<string, string> | null>(null);
  const navigationStateRef = useRef({
    activeChatId,
    activeGroupId,
    hasProfile: Boolean(profileUser),
    settingsOpen,
    callFullScreen: false,
    groupCallFullScreen: false,
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      isNativeActiveRef.current = isActive;
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  const activeFriend = useMemo(
    () => store.friends.find((f) => f.id === store.activeChatId) ?? null,
    [store.activeChatId, store.friends],
  );
  const activeCommunity = activeChatId === OFFICIAL_COMMUNITY_ID;
  const activeGroup = !!store.activeGroupId;

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

  useEffect(() => {
    if (!me || !previewsReady) {
      previousPreviews.current = null;
      return;
    }

    const current = new Map(
      previews.map((preview) => [
        preview.friendId,
        `${preview.createdAt}:${preview.senderId}`,
      ]),
    );
    const previous = previousPreviews.current;
    previousPreviews.current = current;
    if (!previous) return;

    for (const preview of previews) {
      if (previous.get(preview.friendId) === `${preview.createdAt}:${preview.senderId}`) {
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

      // Only show system notifications when the app/tab is minimized or hidden — NEVER while in the app!
      if (
        !Capacitor.isNativePlatform() &&
        notificationsEnabled &&
        !appInForeground &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const notification = new Notification(`Message from ${friend.displayName}`, {
            body: formatPreviewMessageText(preview.body) || "Sent you an attachment",
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
    }
  }, [
    friends,
    me,
    notificationsEnabled,
    previews,
    previewsReady,
    setActiveChatId,
    soundsEnabled,
  ]);

  useEffect(() => {
    if (!me || !previewsReady) {
      previousGroups.current = null;
      return;
    }

    const current = new Map(
      groups.map((group) => [
        group.id,
        `${group.lastMessageAt}:${group.lastSenderId ?? ""}`,
      ]),
    );
    const previous = previousGroups.current;
    previousGroups.current = current;
    if (!previous) return;

    for (const group of groups) {
      const signature = `${group.lastMessageAt}:${group.lastSenderId ?? ""}`;
      if (previous.get(group.id) === signature) continue;
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

      if (
        !Capacitor.isNativePlatform() &&
        notificationsEnabled &&
        !appInForeground &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const notification = new Notification(title, {
            body: formatPreviewMessageText(group.lastMessage) || "Open group chat",
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
    }
  }, [
    groups,
    me,
    notificationsEnabled,
    previewsReady,
    setActiveGroupId,
    soundsEnabled,
  ]);

  useLayoutEffect(() => {
    navigationStateRef.current = {
      activeChatId,
      activeGroupId,
      hasProfile: Boolean(profileUser),
      settingsOpen,
      callFullScreen: Boolean(
        callSession && !callMinimized && callSession.phase !== "incoming",
      ),
      groupCallFullScreen: Boolean(groupCallSession && !groupCallMinimized),
    };
  }, [
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
      } else if (navigation.settingsOpen) {
        setSettingsOpen(false);
      } else if (navigation.hasProfile) {
        setProfileUser(null);
      } else if (navigation.activeGroupId) {
        setActiveGroupId(null);
      } else if (navigation.activeChatId) {
        setActiveChatId(null);
      } else if (canGoBack) {
        window.history.back();
      } else {
        void CapacitorApp.exitApp();
      }
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [setActiveChatId, setActiveGroupId, setCallMinimized, setGroupCallMinimized]);

  useEffect(() => {
    const preventNativeContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", preventNativeContextMenu);
    return () => document.removeEventListener("contextmenu", preventNativeContextMenu);
  }, []);

  if (store.loading) {
    return (
      <div className="splash">
        <img className="logo-icon splash-logo" src="/jatext-logo-icon.png" alt="" />
        <p>Loading JaText…</p>
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

  return (
    <div className={`app-shell ${activeFriend || activeCommunity || activeGroup ? "chat-open" : ""}`}>
      <Sidebar onOpenProfile={setProfileUser} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="main-pane">
        {activeCommunity ? (
          <CommunityChatView onOpenProfile={setProfileUser} onBack={() => setActiveChatId(null)} />
        ) : activeGroup ? (
          <GroupChatView
            key={store.activeGroupId}
            onOpenProfile={setProfileUser}
            onBack={() => setActiveGroupId(null)}
          />
        ) : activeFriend ? (
          <ChatView
            key={activeFriend.id}
            friend={activeFriend}
            onOpenProfile={setProfileUser}
            onBack={() => store.setActiveChatId(null)}
          />
        ) : (
          <div className="no-chat">
            <img className="logo-icon no-chat-logo" src="/jatext-logo-icon.png" alt="" />
            <h2>Pick a chat 💬</h2>
            <p className="muted">
              Choose a friend on the left to start texting, or add someone new
              by their username.
            </p>
            <p className="muted small">
              Tip: click anyone's profile picture to see their profile card —
              banner, bio, pronouns and avatar color included.
            </p>
          </div>
        )}
      </main>

      {freshProfileUser && (
        <ProfileModal
          user={freshProfileUser}
          status={profileStatus}
          onClose={() => setProfileUser(null)}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <CallOverlay />
      <GroupCallOverlay />
    </div>
  );
}
