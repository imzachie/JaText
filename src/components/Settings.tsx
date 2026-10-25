import { useState } from "react";
import { useJaText } from "../lib/store";
import { ProfileForm } from "./ProfileForm";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { me, signOut, mode } = useJaText();
  const [saved, setSaved] = useState(false);
  if (!me) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
        <h2 className="settings-title">⚙️ Settings</h2>
        <p className="muted">
          Signed in as <strong>{me.email ?? `@${me.username}`}</strong> ·{" "}
          {mode === "convex" ? "Convex backend ⚡" : "Demo mode (browser storage)"}
        </p>
        <p className="muted small">
          Profile picture, banner, display name, bio, pronouns and avatar color
          can be changed any time. Username changes are limited to once every
          14 days.
        </p>

        {saved && <div className="success-box">✅ Profile saved!</div>}

        <ProfileForm
          initial={me}
          submitLabel="Save changes"
          onDone={() => {
            setSaved(true);
            setTimeout(onClose, 700);
          }}
        />

        <hr className="settings-hr" />
        <button
          className="danger-btn"
          onClick={() => {
            onClose();
            void signOut();
          }}
        >
          sign out
        </button>
      </div>
    </div>
  );
}
