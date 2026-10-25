import { useMemo, useState } from "react";
import { ChatView } from "./components/ChatView";
import { LoginPage } from "./components/LoginPage";
import { Onboarding } from "./components/Onboarding";
import { ProfileModal } from "./components/ProfileCard";
import { SettingsModal } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { useJaText } from "./lib/store";
import type { JaUser } from "./lib/types";

export default function App() {
  const store = useJaText();
  const [profileUser, setProfileUser] = useState<JaUser | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  if (store.loading) {
    return (
      <div className="splash">
        <div className="logo-badge pulse">J</div>
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
            friend={activeFriend}
            onOpenProfile={setProfileUser}
            onBack={() => store.setActiveChatId(null)}
          />
        ) : (
          <div className="no-chat">
            <div className="logo-badge">J</div>
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
        <ProfileModal user={freshProfileUser} onClose={() => setProfileUser(null)} />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
