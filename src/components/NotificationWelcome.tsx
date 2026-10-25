import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useJaText } from "../lib/store";

export function NotificationWelcome({ onContinue }: { onContinue: () => void }) {
  const { setNotificationsEnabled } = useJaText();
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  async function enableNotifications() {
    setRequesting(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== "granted") {
          setError("Notifications are still off. You can enable them in Android settings.");
          return;
        }
      } else if ("Notification" in window) {
        const permission =
          Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permission !== "granted") {
          setError("Notifications are still off. You can enable them in your browser settings.");
          return;
        }
      } else {
        setError("Notifications aren't supported on this device.");
        return;
      }

      setNotificationsEnabled(true);
      onContinue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not turn on notifications.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <main className="notification-welcome">
      <section className="notification-welcome-card">
        <img className="logo-icon notification-welcome-logo" src="/jatext-logo-icon.png" alt="" />
        <h1>JaText is better with notifications turned on!</h1>
        <p className="muted">Turn on notifications for a better experience.</p>
        {error && <p className="error-box" role="alert">{error}</p>}
        <button
          type="button"
          className="primary-btn big"
          onClick={() => void enableNotifications()}
          disabled={requesting}
        >
          {requesting ? "Turning on notifications…" : "Turn on notifications"}
        </button>
        <button type="button" className="ghost-btn notification-skip" onClick={onContinue}>
          Not now
        </button>
      </section>
    </main>
  );
}
