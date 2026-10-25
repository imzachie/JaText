import { useJaText } from "../lib/store";
import { ProfileForm } from "./ProfileForm";

export function Onboarding() {
  const { me, signOut } = useJaText();
  if (!me) return null;
  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <h1>Welcome to JaText! 🎉</h1>
        <p className="onboarding-sub">
          Who wouldn't want a beautiful profile picture?
        </p>
        <p className="muted center">
          Set your profile picture, banner, name and avatar color below.
          You can change all of this later in Settings (except your username —
          that one's every 14 days).
        </p>
        <ProfileForm initial={me} submitLabel="Start texting →" />
        <button className="ghost-btn" onClick={() => void signOut()}>
          sign out
        </button>
      </div>
    </div>
  );
}
