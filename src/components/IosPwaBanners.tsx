import { useEffect, useRef, useState } from "react";
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

const DISMISS_INSTALL_SESSION_KEY = "jatext:ios_pwa_install_banner_dismissed";
const IOS_PWA_DEMO_LOCAL_SRC = "/ios-pwa-demo.mp4";
const IOS_PWA_DEMO_FALLBACK_SRC =
  "https://github.com/imzachie/JaText-Essential-Stuff/raw/refs/heads/main/iOS%20Demo%20on%20JaText.mp4";

export function IosPwaBanners() {
  const isIosRuntime = isAuthorizedIosChatsRuntime();
  const pwaState = useIosPwaState();
  const demoVideoRef = useRef<HTMLVideoElement | null>(null);
  const [standalone, setStandalone] = useState<boolean>(() => isRunningAsStandalonePwa());
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
    window.addEventListener("appinstalled", onDisplayChange);

    return () => {
      mql?.removeEventListener?.("change", onDisplayChange);
      window.removeEventListener("appinstalled", onDisplayChange);
    };
  }, [isIosRuntime]);

  // Ensure iOS WebKit starts and loops the demo video inline immediately when opened
  useEffect(() => {
    if (!pwaState.installSheetOpen) return;
    const vid = demoVideoRef.current;
    if (!vid) return;
    vid.defaultMuted = true;
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.setAttribute("webkit-playsinline", "true");
    vid.currentTime = 0;
    void vid.play().catch(() => undefined);
  }, [pwaState.installSheetOpen]);

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

  const handleInstallClick = () => {
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
              onClick={handleInstallClick}
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
                <img src="/jatext-logo-icon.png" alt="JaText" width={44} height={44} />
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

            <div className="jt-ios-demo-video-stage">
              <div className="jt-ios-demo-video-frame">
                <video
                  ref={demoVideoRef}
                  className="jt-ios-demo-video"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  onEnded={(e) => {
                    const el = e.currentTarget;
                    el.currentTime = 0;
                    void el.play().catch(() => undefined);
                  }}
                >
                  <source src={IOS_PWA_DEMO_LOCAL_SRC} type="video/mp4" />
                  <source src={IOS_PWA_DEMO_FALLBACK_SRC} type="video/mp4" />
                </video>
              </div>
            </div>

            <div className="jt-ios-install-steps">
              <div className="jt-ios-install-step">
                <div className="jt-ios-step-icon">
                  <IosShareIcon size={17} />
                </div>
                <div>
                  <strong>
                    1. Tap the Share button{" "}
                    {browserKind === "chrome"
                      ? "(top-right of Chrome)"
                      : "(bottom bar of Safari)"}
                  </strong>
                  <span>Tap the square icon with an upward arrow in {browserLabel}.</span>
                </div>
              </div>

              <div className="jt-ios-install-step">
                <div className="jt-ios-step-icon">
                  <IosPlusSquareIcon size={17} />
                </div>
                <div>
                  <strong>2. Tap &ldquo;Add to Home Screen&rdquo;</strong>
                  <span>Scroll down in the share menu and choose Add to Home Screen.</span>
                </div>
              </div>

              <div className="jt-ios-install-step">
                <div className="jt-ios-step-icon">
                  <IosCheckCircleIcon size={17} />
                </div>
                <div>
                  <strong>3. Tap &ldquo;Add&rdquo; in the top-right corner</strong>
                  <span>
                    Launch <strong>JaText</strong> right from your Home Screen anytime!
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
