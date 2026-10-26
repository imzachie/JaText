import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useJaText } from "../lib/store";
import { ProfileForm } from "./ProfileForm";

export function SettingsModal({ onClose }: { onClose: () => void }) {
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
  const [saved, setSaved] = useState(false);
  const [activityStatus, setActivityStatus] = useState(me?.statusPreference ?? "online");
  const [customStatus, setCustomStatus] = useState(me?.customStatus ?? "");
  const [activityError, setActivityError] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
        <h2 className="settings-title">⚙️ Settings</h2>
        <p className="muted">
          Signed in as <strong>{me.email ?? `@${me.username}`}</strong>
          {mode === "demo" ? " · Demo mode (browser storage)" : ""}
        </p>
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
                Push registration: {pushRegistrationStatus}
              </p>
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
            </>
          )}
        </section>

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
