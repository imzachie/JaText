import { useEffect, useMemo, useRef, useState } from "react";
import { ChatView } from "./components/ChatView";
import { LoginPage } from "./components/LoginPage";
import { Onboarding } from "./components/Onboarding";
import { ProfileModal } from "./components/ProfileCard";
import { SettingsModal } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { useJaText } from "./lib/store";
import { playMessageSound } from "./lib/alerts";
import type { JaUser } from "./lib/types";

interface MessageToast {
  friendId: string;
  name: string;
  body: string;
}

export default function App() {
  const store = useJaText();
  const {
    activeChatId,
    friends,
    me,
    notificationsEnabled,
    previews,
    previewsReady,
    setActiveChatId,
    soundsEnabled,
  } = store;
  const [profileUser, setProfileUser] = useState<JaUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messageToast, setMessageToast] = useState<MessageToast | null>(null);
  const [toastClosing, setToastClosing] = useState(false);
  const previousPreviews = useRef<Map<string, string> | null>(null);
  const toastTimer = useRef<number | null>(null);

  const activeFriend = useMemo(
    () => store.friends.find((f) => f.id === store.activeChatId) ?? null,
    [store.activeChatId, store.friends],
  );

  // keep the open profile card fresh if that user's data changes
  const freshProfileUser = useMemo(() => {
    if (!profileUser) return null;
    if (store.me?.id === profileUser.id) return store.me;
    return (
      store.friends.find((f) => f.id === profileUser.id) ??
      store.incoming.find((r) => r.from.id === profileUser.id)?.from ??
      store.outgoing.find((r) => r.to.id === profileUser.id)?.to ??
      profileUser
    );
  }, [profileUser, store.friends, store.incoming, store.me, store.outgoing]);

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
      setMessageToast({ friendId: friend.id, name: friend.displayName, body: preview.body });
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => {
        setToastClosing(true);
        toastTimer.current = window.setTimeout(() => {
          setMessageToast(null);
          setToastClosing(false);
        }, 180);
      }, 4_500);

      if (
        notificationsEnabled &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        (document.visibilityState !== "visible" || !document.hasFocus())
      ) {
        const notification = new Notification(`Message from ${friend.displayName}`, {
          body: preview.body,
          tag: `jatext-${friend.id}`,
        });
        notification.onclick = () => {
          window.focus();
          setActiveChatId(friend.id);
          notification.close();
        };
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

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

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

  if (!store.me) return <LoginPage />;

  if (!store.me.onboardingComplete) return <Onboarding />;

  return (
    <div className={`app-shell ${activeFriend ? "chat-open" : ""}`}>
      <Sidebar onOpenProfile={setProfileUser} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="main-pane">
        {activeFriend ? (
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
            store.setActiveChatId(messageToast.friendId);
            setToastClosing(true);
            if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
            toastTimer.current = window.setTimeout(() => {
              setMessageToast(null);
              setToastClosing(false);
            }, 180);
          }}
        >
          <strong>New message from {messageToast.name}</strong>
          <span>{messageToast.body}</span>
        </button>
      )}
    </div>
  );
}
