import { useCallback, useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { JaTextNative } from "../lib/nativeBridge";
import {
  AnimatedModal,
  getActiveAnimatedModalCount,
  subscribeAnimatedModalStack,
} from "./AnimatedModal";
import { BellIcon, CheckCircleIcon, ShieldCheckIcon } from "./UiIcons";

const SESSION_DISMISSED_KEY = "jatext:startup-perms-dismissed-session:v3.2.1";

interface PermStatus {
  notificationsGranted: boolean;
  canDrawOverlays: boolean;
  canUseFullScreenIntent: boolean;
}

export function StartupPermissionsModal({
  ready,
  onPermissionsUpdated,
}: {
  ready: boolean;
  onPermissionsUpdated?: () => void;
}) {
  const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const [status, setStatus] = useState<PermStatus | null>(null);
  const [pendingReady, setPendingReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const checkAllPermissions = useCallback(
    async (autoPromptNotifications: boolean): Promise<PermStatus | null> => {
      if (!isAndroid) return null;
      try {
        let notifPerm = await PushNotifications.checkPermissions();
        if (autoPromptNotifications && notifPerm.receive === "prompt") {
          try {
            notifPerm = await PushNotifications.requestPermissions();
            if (notifPerm.receive === "granted") {
              await PushNotifications.register();
              onPermissionsUpdated?.();
            }
          } catch {
            // ignore runtime dialog cancellation
          }
        }
        const notificationsGranted = notifPerm.receive === "granted";

        let canDrawOverlays = true;
        let canUseFullScreenIntent = true;
        try {
          const callPerms = await JaTextNative.checkCallWakePermissions();
          canDrawOverlays = callPerms.canDrawOverlays !== false;
          canUseFullScreenIntent = callPerms.canFullScreenIntent !== false;
        } catch {
          // keep defaults if bridge unavailable
        }

        const next: PermStatus = {
          notificationsGranted,
          canDrawOverlays,
          canUseFullScreenIntent,
        };
        setStatus(next);
        return next;
      } catch {
        return null;
      }
    },
    [isAndroid, onPermissionsUpdated],
  );

  // Initial startup check once authenticated & booted on Android
  useEffect(() => {
    if (!isAndroid || !ready) return;
    let cancelled = false;
    const dismissedThisSession =
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === "1";

    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await checkAllPermissions(true);
        if (cancelled || !res) return;
        const missingAny =
          !res.canDrawOverlays || !res.canUseFullScreenIntent || !res.notificationsGranted;
        if (missingAny && !dismissedThisSession) {
          setPendingReady(true);
        }
      })();
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkAllPermissions, isAndroid, ready]);

  // Wait cleanly if another modal (like Welcome / Update) is currently visible so modals never stack
  useEffect(() => {
    if (!pendingReady || open) return;
    let timer: number | null = null;

    const tryPresent = () => {
      if (getActiveAnimatedModalCount() === 0) {
        timer = window.setTimeout(() => {
          if (getActiveAnimatedModalCount() === 0) {
            setOpen(true);
            setPendingReady(false);
          }
        }, 220);
      }
    };

    tryPresent();
    const unsub = subscribeAnimatedModalStack(() => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      tryPresent();
    });

    return () => {
      unsub();
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [open, pendingReady]);

  // Re-check automatically when returning from Android Settings screen
  useEffect(() => {
    if (!isAndroid || !open) return;
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void (async () => {
          const res = await checkAllPermissions(false);
          if (
            res &&
            res.canDrawOverlays &&
            res.canUseFullScreenIntent &&
            res.notificationsGranted
          ) {
            setOpen(false);
          }
        })();
      }
    }).then((h) => {
      listenerHandle = h;
    });
    return () => {
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, [checkAllPermissions, isAndroid, open]);

  if (!isAndroid || !open || !status) return null;

  const allGranted =
    status.canDrawOverlays && status.canUseFullScreenIntent && status.notificationsGranted;

  const dismissForSession = (requestClose: () => void) => {
    try {
      window.sessionStorage.setItem(SESSION_DISMISSED_KEY, "1");
    } catch {
      // ignore storage errors
    }
    requestClose();
  };

  const handleEnableOverlay = async () => {
    setBusyKey("overlay");
    try {
      await JaTextNative.openCallWakeSettings({ kind: "overlay" });
    } finally {
      setBusyKey(null);
    }
  };

  const handleEnableFullScreen = async () => {
    setBusyKey("fullscreen");
    try {
      await JaTextNative.openCallWakeSettings({ kind: "fullscreen" });
    } finally {
      setBusyKey(null);
    }
  };

  const handleEnableNotifications = async () => {
    setBusyKey("notifications");
    try {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive === "granted") {
        await PushNotifications.register();
        onPermissionsUpdated?.();
      } else {
        await JaTextNative.openCallWakeSettings({ kind: "notifications" });
      }
      await checkAllPermissions(false);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <AnimatedModal
      open={open}
      onClose={() => setOpen(false)}
      cardClassName="modal-card startup-perms-card"
      closeLabel="Dismiss permission setup"
      zIndex={9950}
    >
      {(requestClose) => (
        <div className="startup-perms-body">
          <div className="startup-perms-icon-wrap" aria-hidden="true">
            <ShieldCheckIcon size={26} />
          </div>
          <h3 className="startup-perms-title">Enable Call &amp; Alert Permissions</h3>
          <p className="startup-perms-desc muted">
            Allow JaText to pop up incoming voice &amp; video calls instantly when your phone is
            minimized or locked, and deliver real-time message alerts.
          </p>

          <div className="startup-perms-list">
            <div className="startup-perm-item">
              <div className="startup-perm-info">
                <strong>Display over other apps</strong>
                <span className="muted tiny">
                  Required to open incoming calls automatically while minimized or locked.
                </span>
              </div>
              {status.canDrawOverlays ? (
                <span className="verified-badge">
                  <CheckCircleIcon size={14} /> Enabled
                </span>
              ) : (
                <button
                  type="button"
                  className="primary-btn startup-perm-btn"
                  disabled={busyKey === "overlay"}
                  onClick={() => void handleEnableOverlay()}
                >
                  Enable
                </button>
              )}
            </div>

            {!status.canUseFullScreenIntent && (
              <div className="startup-perm-item">
                <div className="startup-perm-info">
                  <strong>Lock-screen full-screen calls</strong>
                  <span className="muted tiny">
                    Wakes your screen immediately when a voice or video call rings.
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-btn startup-perm-btn"
                  disabled={busyKey === "fullscreen"}
                  onClick={() => void handleEnableFullScreen()}
                >
                  Enable
                </button>
              </div>
            )}

            {!status.notificationsGranted && (
              <div className="startup-perm-item">
                <div className="startup-perm-info">
                  <strong>Push notifications</strong>
                  <span className="muted tiny">
                    Alerts you to DMs, group mentions, and JaText Announcements.
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-btn startup-perm-btn"
                  disabled={busyKey === "notifications"}
                  onClick={() => void handleEnableNotifications()}
                >
                  <BellIcon size={14} /> Allow
                </button>
              </div>
            )}
          </div>

          <div className="startup-perms-footer">
            {allGranted ? (
              <button
                type="button"
                className="primary-btn"
                style={{ width: "100%" }}
                onClick={requestClose}
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => dismissForSession(requestClose)}
              >
                Later
              </button>
            )}
          </div>
        </div>
      )}
    </AnimatedModal>
  );
}
