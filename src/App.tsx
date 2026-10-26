import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ChatView } from "./components/ChatView";
import { CommunityChatView } from "./components/CommunityChatView";
import { GroupChatView } from "./components/GroupChatView";
import { LoginPage } from "./components/LoginPage";
import { Onboarding } from "./components/Onboarding";
import { NotificationWelcome } from "./components/NotificationWelcome";
import { ProfileModal } from "./components/ProfileCard";
import { SettingsModal } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { useJaText } from "./lib/store";
import { playMessageSound } from "./lib/alerts";
import { OFFICIAL_COMMUNITY_ID, type JaUser } from "./lib/types";

interface MessageToast {
  friendId?: string;
  groupId?: string;
  title: string;
  body: string;
}

const NOTIFICATION_WELCOME_KEY = "jatext-notification-welcome-seen-v1";

export default function App() {
  const store = useJaText();
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
  const [messageToast, setMessageToast] = useState<MessageToast | null>(null);
  const [toastClosing, setToastClosing] = useState(false);
  const [notificationWelcomeSeen, setNotificationWelcomeSeen] = useState(
    () => localStorage.getItem(NOTIFICATION_WELCOME_KEY) === "true",
  );
  const previousPreviews = useRef<Map<string, string> | null>(null);
  const previousGroups = useRef<Map<string, string> | null>(null);
  const toastTimer = useRef<number | null>(null);
  const navigationStateRef = useRef({
    activeChatId,
    activeGroupId,
    hasProfile: Boolean(profileUser),
    settingsOpen,
  });

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
        me.statusPreference === "dnd"
      ) {
        continue;
      }

      const friend = friends.find((user) => user.id === preview.friendId);
      if (!friend) continue;
      if (soundsEnabled) playMessageSound("received");

      const focusedOnThisChat =
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        activeChatId === friend.id;
      if (focusedOnThisChat) continue;

      setToastClosing(false);
      setMessageToast({
        friendId: friend.id,
        title: `New message from ${friend.displayName}`,
        body: preview.body,
      });
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => {
        setToastClosing(true);
        toastTimer.current = window.setTimeout(() => {
          setMessageToast(null);
          setToastClosing(false);
        }, 180);
      }, 4_500);

      if (
        !Capacitor.isNativePlatform() &&
        notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        (document.visibilityState !== "visible" || !document.hasFocus())
      ) {
        try {
          const notification = new Notification(`Message from ${friend.displayName}`, {
            body: preview.body,
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
    activeChatId,
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

      if (soundsEnabled) playMessageSound("received");

      const focusedOnThisGroup =
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        activeGroupId === group.id;
      if (focusedOnThisGroup) continue;

      const senderLabel = group.lastSenderName || "Someone";
      const title = `${senderLabel} mentioned you in ${group.name}`;
      window.setTimeout(() => {
        setToastClosing(false);
        setMessageToast({
          groupId: group.id,
          title,
          body: group.lastMessage || "Tap to open group chat",
        });
      }, 0);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => {
        setToastClosing(true);
        toastTimer.current = window.setTimeout(() => {
          setMessageToast(null);
          setToastClosing(false);
        }, 180);
      }, 5_000);

      if (
        !Capacitor.isNativePlatform() &&
        notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        (document.visibilityState !== "visible" || !document.hasFocus())
      ) {
        try {
          const notification = new Notification(title, {
            body: group.lastMessage || "Open group chat",
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
    activeGroupId,
    groups,
    me,
    notificationsEnabled,
    previewsReady,
    setActiveGroupId,
    soundsEnabled,
  ]);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    navigationStateRef.current = {
      activeChatId,
      activeGroupId,
      hasProfile: Boolean(profileUser),
      settingsOpen,
    };
  }, [activeChatId, activeGroupId, profileUser, settingsOpen]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      const navigation = navigationStateRef.current;
      if (navigation.settingsOpen) {
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
  }, [setActiveChatId, setActiveGroupId]);

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
      {messageToast && (
        <button
          className={`message-toast ${toastClosing ? "closing" : ""}`}
          type="button"
          aria-live="polite"
          onClick={() => {
            if (messageToast.groupId) store.setActiveGroupId(messageToast.groupId);
            else if (messageToast.friendId) store.setActiveChatId(messageToast.friendId);
            setToastClosing(true);
            if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
            toastTimer.current = window.setTimeout(() => {
              setMessageToast(null);
              setToastClosing(false);
            }, 180);
          }}
        >
          <strong>{messageToast.title}</strong>
          <span>{messageToast.body}</span>
        </button>
      )}
    </div>
  );
}
