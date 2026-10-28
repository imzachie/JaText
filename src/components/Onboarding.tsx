import { useState } from "react";
import { useJaText } from "../lib/store";
import { LegalModal, type LegalTab } from "./LegalModal";
import { ProfileForm } from "./ProfileForm";
import { ArrowRightIcon, SparklesIcon } from "./UiIcons";

export function Onboarding() {
  const { me, signOut } = useJaText();
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);
  if (!me) return null;
  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <h1>
          Welcome to JaText! <SparklesIcon size={24} style={{ color: "var(--accent)" }} />
        </h1>
        <p className="onboarding-sub">
          Who wouldn&apos;t want a beautiful profile picture?
        </p>
        <p className="muted center">
          Set your profile picture, banner, name and avatar color below.
          You can change all of this later in Settings (except your username —
          that one&apos;s every 14 days).
        </p>
        <ProfileForm
          initial={me}
          submitLabel={
            <>
              Start texting <ArrowRightIcon size={16} />
            </>
          }
        />
        <div className="login-legal-footer">
          <div className="legal-inline-btns">
            <button type="button" className="inline-link-btn" onClick={() => setLegalTab("terms")}>
              Terms of Service
            </button>
            <span className="muted small">·</span>
            <button type="button" className="inline-link-btn" onClick={() => setLegalTab("privacy")}>
              Privacy Policy
            </button>
          </div>
        </div>
        <button className="ghost-btn" onClick={() => void signOut()}>
          sign out
        </button>
      </div>
      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
}
