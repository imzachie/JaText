import { useEffect, useState } from "react";
import {
  IosCheckCircleIcon,
  IosCloseIcon,
  IosDownloadIcon,
  IosPlusSquareIcon,
  IosRefreshIcon,
  IosShareIcon,
  IosSparklesIcon,
} from "./IosVectorIcons";
import {
  detectIosBrowserKind,
  detectIosBrowserLabel,
  isAuthorizedIosChatsRuntime,
  isRunningAsStandalonePwa,
} from "../lib/iosDetection";
import {
  applyIosPwaUpdateAndReload,
  closeIosPwaInstallSheet,
  openIosPwaInstallSheet,
  startIosPwaLifecycleIfNeeded,
  useIosPwaState,
} from "../lib/iosPwaUpdater";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_INSTALL_SESSION_KEY = "jatext:ios_pwa_install_banner_dismissed";

export function IosPwaBanners() {
  const isIosRuntime = isAuthorizedIosChatsRuntime();
  const pwaState = useIosPwaState();
  const [standalone, setStandalone] = useState<boolean>(() => isRunningAsStandalonePwa());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBannerDismissed, setInstallBannerDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(DISMISS_INSTALL_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!isIosRuntime) return;
    startIosPwaLifecycleIfNeeded();

    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayChange = () => setStandalone(isRunningAsStandalonePwa());
    mql?.addEventListener?.("change", onDisplayChange);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onDisplayChange);

    return () => {
      mql?.removeEventListener?.("change", onDisplayChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onDisplayChange);
    };
  }, [isIosRuntime]);

  if (!isIosRuntime) return null;

  const browserKind = detectIosBrowserKind();
  const browserLabel = detectIosBrowserLabel();

  const handleDismissInstallBanner = () => {
    setInstallBannerDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_INSTALL_SESSION_KEY, "1");
    } catch {
      // ignore
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
          setStandalone(true);
          return;
        }
      } catch {
        // fall through to guided iOS sheet
      }
    }
    openIosPwaInstallSheet();
  };

  const showUpdateBanner = pwaState.updateAvailable;
  const showInstallBanner = !standalone && !installBannerDismissed && !showUpdateBanner;

  return (
    <>
      {showUpdateBanner && (
        <div className="jt-ios-pwa-float-wrap" role="status" aria-live="polite">
          <div className="jt-ios-pwa-banner jt-ios-pwa-banner-update">
            <div className="jt-ios-pwa-banner-icon is-update" aria-hidden="true">
              <IosSparklesIcon size={19} />
            </div>
            <div className="jt-ios-pwa-banner-copy">
              <strong>
                {pwaState.latestVersion
                  ? `JaText v${pwaState.latestVersion} is ready!`
                  : "New JaText update available!"}
              </strong>
              <span>New changes were deployed. Tap Refresh to update your PWA now.</span>
            </div>
            <button
              type="button"
              className="jt-ios-pwa-banner-cta is-update"
              disabled={pwaState.refreshing}
              onClick={() => void applyIosPwaUpdateAndReload()}
            >
              <IosRefreshIcon
                size={14}
                className={pwaState.refreshing ? "jt-spin-icon" : undefined}
              />
              <span>{pwaState.refreshing ? "Updating..." : "Refresh"}</span>
            </button>
          </div>
        </div>
      )}

      {showInstallBanner && (
        <div className="jt-ios-pwa-float-wrap" role="region" aria-label="Install JaText PWA">
          <div className="jt-ios-pwa-banner">
            <img
              src="/jatext-logo-icon.png"
              alt=""
              width={38}
              height={38}
              className="jt-ios-pwa-banner-logo"
            />
            <div className="jt-ios-pwa-banner-copy">
              <strong>Install JaText iOS as a PWA!</strong>
              <span>Full-screen Liquid Glass app on your Home Screen.</span>
            </div>
            <button
              type="button"
              className="jt-ios-pwa-banner-cta"
              onClick={() => void handleInstallClick()}
            >
              <IosDownloadIcon size={14} strokeWidth={2.4} />
              <span>Install</span>
            </button>
            <button
              type="button"
              className="jt-ios-pwa-banner-close"
              onClick={handleDismissInstallBanner}
              aria-label="Dismiss PWA install prompt"
            >
              <IosCloseIcon size={15} />
            </button>
          </div>
        </div>
      )}

      {pwaState.installSheetOpen && (
        <div
          className="jt-ios-sheet-backdrop"
          onClick={() => closeIosPwaInstallSheet()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="jt-ios-install-sheet-title"
        >
          <div
            className="jt-ios-install-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="jt-ios-sheet-grabber" aria-hidden="true" />
            <div className="jt-ios-install-sheet-head">
              <div className="jt-ios-install-app-badge">
                <img src="/jatext-logo-icon.png" alt="JaText" width={48} height={48} />
                <div>
                  <span className="jt-ios-install-pill">{browserLabel}</span>
                  <h3 id="jt-ios-install-sheet-title">Install JaText iOS as a PWA!</h3>
                </div>
              </div>
              <button
                type="button"
                className="jt-ios-sheet-close"
                onClick={() => closeIosPwaInstallSheet()}
                aria-label="Close"
              >
                <IosCloseIcon size={18} />
              </button>
            </div>

            <p className="jt-ios-install-lead">
              Install JaText directly onto your iOS Home Screen for instant 0ms launch, edge-to-edge
              Liquid Glass animations, notifications, and automatic live updates.
            </p>

            <div className="jt-ios-install-steps">
              <div className="jt-ios-install-step">
                <div className="jt-ios-step-icon">
                  <IosShareIcon size={18} />
                </div>
                <div>
                  <strong>
                    1. Tap the Share button{" "}
                    {browserKind === "chrome"
                      ? "(top-right of the Chrome address bar)"
                      : "(bottom centre of Safari)"}
                  </strong>
                  <span>Look for the square icon with an upward arrow in {browserLabel}.</span>
                </div>
              </div>

              <div className="jt-ios-install-step">
                <div className="jt-ios-step-icon">
                  <IosPlusSquareIcon size={18} />
                </div>
                <div>
                  <strong>2. Tap &ldquo;Add to Home Screen&rdquo;</strong>
                  <span>Scroll slightly down in the iOS share sheet and select Add to Home Screen.</span>
                </div>
              </div>

              <div className="jt-ios-install-step">
                <div className="jt-ios-step-icon">
                  <IosCheckCircleIcon size={18} />
                </div>
                <div>
                  <strong>3. Tap &ldquo;Add&rdquo; in the top-right corner</strong>
                  <span>
                    Open <strong>JaText</strong> from your Home Screen anytime just like a native app!
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="jt-ios-install-done-btn"
              onClick={() => closeIosPwaInstallSheet()}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
