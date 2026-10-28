import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useMultiAccountState } from "../lib/accountManager";
import { useE2EESnapshot } from "../lib/e2ee/keystore";
import { useJaText } from "../lib/store";
import { AnimatedModal } from "./AnimatedModal";
import { LockIcon } from "./E2EEModals";
import { LegalModal, type LegalTab } from "./LegalModal";
import { ProfileForm } from "./ProfileForm";
import {
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  SettingsIcon,
  SwitchAccountIcon,
} from "./UiIcons";

export function SettingsModal({
  onClose,
  onOpenAccountSwitcher,
}: {
  onClose: () => void;
  onOpenAccountSwitcher?: () => void;
}) {
  const {
    me,
    signOut,
    mode,
    notificationsEnabled,
    pushRegistrationStatus,
    soundsEnabled,
    setActivity,
    setNotificationsEnabled,
    refreshPushRegistration,
    setSoundsEnabled,
  } = useJaText();
  const { accounts } = useMultiAccountState();
  const e2ee = useE2EESnapshot();
  const [copiedFp, setCopiedFp] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activityStatus, setActivityStatus] = useState(me?.statusPreference ?? "online");
  const [customStatus, setCustomStatus] = useState(me?.customStatus ?? "");
  const [activityError, setActivityError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  if (!me) return null;

  async function updateActivity(status: typeof activityStatus, message = customStatus) {
    setActivityError(null);
    try {
      await setActivity(status, message);
      setActivityStatus(status);
      setCustomStatus(message);
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : "Could not update activity.");
    }
  }

  async function toggleNotifications(enabled: boolean) {
    setNotificationError(null);
    if (!enabled) {
      setNotificationsEnabled(false);
      return;
    }
    if (Capacitor.isNativePlatform()) {
      if (mode !== "convex") {
        setNotificationError("Push notifications need the live Convex backend. Configure VITE_CONVEX_URL and rebuild the APK.");
        return;
      }
      try {
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive === "granted") {
          setNotificationsEnabled(true);
        } else {
          setNotificationError("Allow notifications in Android settings to enable push notifications.");
        }
      } catch (error) {
        setNotificationError(
          error instanceof Error ? error.message : "Could not request Android notification permission.",
        );
      }
      return;
    }
    if (!("Notification" in window)) {
      setNotificationError("This browser does not support desktop notifications.");
      return;
    }
    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission === "granted") {
        setNotificationsEnabled(true);
      } else {
        setNotificationError("Allow notifications in your browser settings to enable them.");
      }
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Could not request notification permission.",
      );
    }
  }

  return (
    <>
      <AnimatedModal
        onClose={onClose}
        cardClassName="modal-card wide"
        closeLabel="Close settings"
      >
        {(requestClose) => (
          <>
            <h2 className="settings-title">
              <SettingsIcon size={20} style={{ color: "var(--accent)" }} /> Settings
            </h2>
        <p className="muted">
          Signed in as <strong>{me.email ?? `@${me.username}`}</strong>
          {mode === "demo" ? " · Demo mode (browser storage)" : ""}
        </p>
        {onOpenAccountSwitcher && (
          <div className="settings-accounts-bar">
            <div className="settings-accounts-info">
              <strong>
                {accounts.length > 1
                  ? `${accounts.length} saved accounts on this device`
                  : "Quick account switching"}
              </strong>
              <span className="muted small">
                {accounts.length > 1
                  ? "Switch directly between your accounts without signing out."
                  : "Add a second account to jump between them in 1 tap."}
              </span>
            </div>
            <button
              type="button"
              className="ghost-btn settings-switch-btn"
              onClick={onOpenAccountSwitcher}
            >
              <SwitchAccountIcon size={15} />
              <span>{accounts.length > 1 ? "Switch / Manage" : "Add account"}</span>
            </button>
          </div>
        )}
        <p className="muted small">
          Profile picture, banner, display name, bio, pronouns and avatar color
          can be changed any time. Username changes are limited to once every
          14 days.
        </p>

        <section className="activity-settings">
          <h3>Activity &amp; notifications</h3>
          <label>
            Activity status
            <select
              value={activityStatus}
              onChange={(event) => void updateActivity(event.target.value as typeof activityStatus)}
            >
              <option value="online">Online — away after 5 minutes idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="offline">Offline until I change it</option>
            </select>
          </label>
          <p className="muted small">
            Do Not Disturb still shows you as available, but silences JaText message alerts.
            Offline stays enabled across sign-outs.
          </p>
          <label>
            Custom status
            <input
              value={customStatus}
              maxLength={60}
              placeholder="What are you up to?"
              onChange={(event) => setCustomStatus(event.target.value)}
            />
          </label>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => void updateActivity(activityStatus, customStatus)}
          >
            Save custom status
          </button>
          {activityError && <div className="error-box">{activityError}</div>}
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(event) => void toggleNotifications(event.target.checked)}
            />
            {Capacitor.isNativePlatform()
              ? "Push notifications when JaText is closed"
              : "Desktop notifications for incoming messages"}
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={soundsEnabled}
              onChange={(event) => setSoundsEnabled(event.target.checked)}
            />
            Message sounds (sent and received)
          </label>
          {notificationError && <div className="error-box">{notificationError}</div>}
          {Capacitor.isNativePlatform() && mode === "convex" && notificationsEnabled && (
            <>
              <p className="muted small" role="status">
                {pushRegistrationStatus === "unavailable"
                  ? "In-app alerts active · background FCM not configured in this build"
                  : `Push registration: ${pushRegistrationStatus}`}
              </p>
              {pushRegistrationStatus !== "unavailable" && (
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => {
                    setNotificationError(null);
                    void refreshPushRegistration().catch((error: unknown) => {
                      setNotificationError(
                        error instanceof Error
                          ? error.message
                          : "Could not refresh push registration.",
                      );
                    });
                  }}
                >
                  Repair push registration
                </button>
              )}
            </>
          )}
        </section>

        {saved && (
          <div className="success-box">
            <CheckCircleIcon size={16} /> Profile saved!
          </div>
        )}

            <ProfileForm
              initial={me}
              submitLabel="Save changes"
              onDone={() => {
                setSaved(true);
                setTimeout(requestClose, 650);
              }}
            />

            <hr className="settings-hr" />
            <section className="e2ee-settings-section">
              <div className="profile-e2ee-header">
                <span className="profile-e2ee-title">
                  <LockIcon size={15} />
                  <strong>End-to-End Encryption</strong>
                </span>
                <span
                  className={`e2ee-pill ${
                    e2ee.ready ? "active" : "pending"
                  }`}
                >
                  {e2ee.ready ? "Active · Synced" : "Initializing…"}
                </span>
              </div>
              <p className="muted small">
                Private chats, group chats, voice notes, and attachments are end-to-end encrypted on
                your device and sync automatically across your logged-in devices. Open any friend&apos;s
                profile to verify your security code.
              </p>
              {e2ee.myFingerprint && (
                <>
                  <div className="profile-e2ee-sub">
                    Key ID: <code>{e2ee.myKeyId}</code>
                  </div>
                  <code className="e2ee-fingerprint-code">{e2ee.myFingerprint}</code>
                </>
              )}
              <div className="profile-e2ee-btn-row">
                {e2ee.myFingerprint && (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `JaText E2EE Key (@${me.username} · ${e2ee.myKeyId})\nFingerprint: ${e2ee.myFingerprint}\nECDH-P256: ${e2ee.myDhPubB64 ?? ""}`,
                      );
                      setCopiedFp(true);
                      window.setTimeout(() => setCopiedFp(false), 1800);
                    }}
                  >
                    {copiedFp ? (
                      <>
                        <CheckIcon size={13} /> Copied
                      </>
                    ) : (
                      <>
                        <CopyIcon size={13} /> Copy security key
                      </>
                    )}
                  </button>
                )}
              </div>
            </section>

            <hr className="settings-hr" />
            <section className="legal-settings-section">
              <h3>
                <FileTextIcon size={16} style={{ color: "var(--accent)" }} /> Legal &amp; Policies
              </h3>
              <div className="legal-links-row">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setLegalTab("terms")}
                >
                  Terms of Service
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setLegalTab("privacy")}
                >
                  Privacy Policy
                </button>
              </div>
            </section>

            <hr className="settings-hr" />
            <button
              className="danger-btn"
              onClick={() => {
                requestClose();
                void signOut();
              }}
            >
              {accounts.length > 1 ? `sign out of @${me.username}` : "sign out"}
            </button>
          </>
        )}
      </AnimatedModal>
      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </>
  );
}
