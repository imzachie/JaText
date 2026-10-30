import { useState } from "react";
import { switchToAccountSlot, useMultiAccountState } from "../lib/accountManager";
import { PUBLIC_TURSO_API_ORIGIN } from "../lib/tursoClient";
import { useJaText } from "../lib/store";
import { LegalModal, type LegalTab } from "./LegalModal";
import { ProfileForm } from "./ProfileForm";
import { ArrowRightIcon, SparklesIcon, SwitchAccountIcon } from "./UiIcons";

const CONVEX_URL = PUBLIC_TURSO_API_ORIGIN;

export function Onboarding() {
  const { me, signOut } = useJaText();
  const { activeSlotId, accounts } = useMultiAccountState();
  const otherAccounts = accounts.filter(
    (acct) => acct.slotId !== activeSlotId && (!me || acct.userId !== me.id),
  );
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);
  if (!me) return null;
  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        {otherAccounts.length > 0 && (
          <div className="onboarding-switch-bar">
            {otherAccounts.map((acct) => (
              <button
                key={acct.slotId}
                type="button"
                className="ghost-btn onboarding-switch-btn"
                onClick={() => switchToAccountSlot(acct.slotId, CONVEX_URL)}
              >
                <SwitchAccountIcon size={14} />
                <span>
                  Switch to {acct.username ? `@${acct.username}` : acct.displayName}
                </span>
              </button>
            ))}
          </div>
        )}
        <h1>
          Welcome to JaText! <SparklesIcon size={24} style={{ color: "var(--accent)" }} />
        </h1>
        <p className="onboarding-sub">
          Who wouldn&apos;t want a beautiful profile picture?
        </p>
        <p className="muted center">
          Set your profile picture, banner, name and avatar color below.
          You can change all of this later in Settings (except your username,
          which can be changed once every 14 days).
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
