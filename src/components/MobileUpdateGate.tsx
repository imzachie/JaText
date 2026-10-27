import { useEffect, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { JaTextNative, type AppVersionInfo } from "../lib/nativeBridge";
import { AnimatedModal } from "./AnimatedModal";

const WELCOMED_VERSION_KEY = "jatext:welcomed-mobile-build:v1";
const GITHUB_RELEASE_API = "https://api.github.com/repos/Ahad00010/JaText/releases/tags/apk-latest";
const FALLBACK_APK_URL =
  "https://github.com/Ahad00010/JaText/releases/download/apk-latest/JaText-release.apk";

interface RemoteReleaseInfo {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
}

function formatBuildLabel(versionName: string, versionCode: number): string {
  const cleanName = versionName.replace(/^v/i, "");
  return `v${cleanName} (build ${versionCode})`;
}

export function MobileUpdateGate({ readyForWelcome }: { readyForWelcome: boolean }) {
  const isNative = Capacitor.isNativePlatform();
  const [localInfo, setLocalInfo] = useState<AppVersionInfo | null>(null);
  const [remoteUpdate, setRemoteUpdate] = useState<RemoteReleaseInfo | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [needsUnknownSources, setNeedsUnknownSources] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    let progressHandle: PluginListenerHandle | null = null;

    void JaTextNative.addListener("apkDownloadProgress", (ev) => {
      if (!cancelled) {
        setDownloadPercent(ev.percent >= 0 ? ev.percent : null);
      }
    }).then((h) => {
      progressHandle = h;
    });

    void (async () => {
      const info = await JaTextNative.getAppVersionInfo().catch(() => ({
        versionName: "2.1",
        versionCode: 12,
        canInstallPackages: true,
      }));
      if (cancelled) return;
      setLocalInfo(info);

      const currentBuildTag = formatBuildLabel(info.versionName, info.versionCode);
      const lastWelcomed = window.localStorage.getItem(WELCOMED_VERSION_KEY);
      if (lastWelcomed !== currentBuildTag) {
        setShowWelcome(true);
      }

      try {
        const res = await fetch(GITHUB_RELEASE_API, {
          headers: { Accept: "application/vnd.github+json" },
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          name?: string;
          body?: string;
          assets?: Array<{ name?: string; browser_download_url?: string }>;
        };
        const textToScan = `${json.body ?? ""}\n${json.name ?? ""}`;
        const codeMatch =
          /VersionCode:\s*(\d+)/i.exec(textToScan) ??
          /\(build\s+(\d+)\)/i.exec(textToScan);
        const nameMatch =
          /VersionName:\s*([0-9]+(?:\.[0-9]+)*)/i.exec(textToScan) ??
          /JaText\s+v([0-9]+(?:\.[0-9]+)*)/i.exec(textToScan);

        if (!codeMatch) return;
        const remoteCode = Number.parseInt(codeMatch[1], 10);
        const remoteName = nameMatch ? nameMatch[1] : `${remoteCode}`;
        const apkAsset = json.assets?.find((a) => a.name?.endsWith(".apk"));
        const downloadUrl = apkAsset?.browser_download_url || FALLBACK_APK_URL;

        if (!cancelled && Number.isFinite(remoteCode) && remoteCode > info.versionCode) {
          setRemoteUpdate({
            versionName: remoteName,
            versionCode: remoteCode,
            downloadUrl,
          });
        }
      } catch {
        // Offline or GitHub API unreachable — skip update check silently.
      }
    })();

    return () => {
      cancelled = true;
      if (progressHandle) {
        void progressHandle.remove();
      }
    };
  }, [isNative]);

  // Strictly mobile-only: never render on desktop/web!
  if (!isNative || !localInfo) return null;

  const currentLabel = formatBuildLabel(localInfo.versionName, localInfo.versionCode);

  const handleStartUpdate = async () => {
    if (!remoteUpdate) return;
    setDownloading(true);
    setUpdateError(null);
    setNeedsUnknownSources(false);
    setDownloadPercent(0);
    try {
      const result = await JaTextNative.downloadAndInstallApk({
        url: remoteUpdate.downloadUrl,
      });
      if (result.needsUnknownSourcesPermission && !result.launchedInstaller) {
        setNeedsUnknownSources(true);
      }
    } catch (err) {
      setUpdateError(
        err instanceof Error && err.message
          ? err.message
          : "Could not download the update from GitHub. Please check your connection and try again.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleEnableUnknownSources = async () => {
    setUpdateError(null);
    try {
      const res = await JaTextNative.openUnknownSourcesSettings();
      if (res.canInstallPackages) {
        setNeedsUnknownSources(false);
      }
    } catch {
      // Ignore.
    }
  };

  // Priority 1: Newer APK available on GitHub -> Show Update Prompt
  if (remoteUpdate && !dismissedUpdate) {
    const latestLabel = formatBuildLabel(remoteUpdate.versionName, remoteUpdate.versionCode);
    return (
      <AnimatedModal
        onClose={() => {
          if (!downloading) setDismissedUpdate(true);
        }}
        cardClassName="modal-card mobile-update-card"
        showCloseButton={!downloading}
        closeLabel="Remind me later"
      >
        {(requestClose) => (
          <div className="mobile-update-body">
            <div className="mobile-update-icon" aria-hidden="true">
              🚀
            </div>
            <h2>Update your JaText version!</h2>
            <p className="mobile-update-copy">
              Your current version is <strong>{currentLabel}</strong>. The current version of JaText
              is <strong>{latestLabel}</strong>!
            </p>
            <p className="muted small">
              Tap <strong>Update now</strong> to download the latest APK directly from GitHub. If
              prompted by Android, enable <em>Allow from this source</em> to install the update.
            </p>

            {downloading && (
              <div className="mobile-update-progress-wrap" role="status">
                <div className="mobile-update-progress-bar">
                  <div
                    className="mobile-update-progress-fill"
                    style={{
                      width: `${downloadPercent !== null ? Math.max(6, downloadPercent) : 35}%`,
                    }}
                  />
                </div>
                <span className="muted small">
                  {downloadPercent !== null
                    ? `Downloading from GitHub… ${downloadPercent}%`
                    : "Downloading update from GitHub…"}
                </span>
              </div>
            )}

            {needsUnknownSources && (
              <div className="hint-box">
                Enable <strong>Allow unknown apps</strong> for JaText in Android settings, then tap
                below to launch the installer.
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ marginTop: 8, width: "100%" }}
                  onClick={() => void handleEnableUnknownSources()}
                >
                  Enable Allow Unknown Sources
                </button>
              </div>
            )}

            {updateError && <div className="error-box">{updateError}</div>}

            <div className="mobile-update-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={downloading}
                onClick={() => void handleStartUpdate()}
              >
                {downloading ? "Updating…" : "Update now"}
              </button>
              {!downloading && (
                <button type="button" className="ghost-btn" onClick={requestClose}>
                  Later
                </button>
              )}
            </div>
          </div>
        )}
      </AnimatedModal>
    );
  }

  // Priority 2: Welcome introduction right after installing/updating on Mobile
  if (showWelcome && readyForWelcome) {
    return (
      <AnimatedModal
        onClose={() => {
          window.localStorage.setItem(WELCOMED_VERSION_KEY, currentLabel);
          setShowWelcome(false);
        }}
        cardClassName="modal-card mobile-welcome-card"
        showCloseButton={false}
      >
        {(requestClose) => (
          <div className="mobile-update-body">
            <div className="mobile-update-icon welcome" aria-hidden="true">
              ✨
            </div>
            <h2>Welcome to {currentLabel} of JaText!</h2>
            <p className="mobile-update-subtitle">Explore what&apos;s new.</p>
            <ul className="mobile-welcome-highlights">
              <li>🔊 Screen Sharing WITH Audio on Mobile &amp; Desktop calls</li>
              <li>📞 Polished Group Call cards, live GC VC Ended status &amp; Call history</li>
              <li>🎙️ Lag-free background Voice Note Transcription + Volume controls</li>
              <li>✨ Fixed mobile reply bubbles, 60 FPS animations &amp; Soundboard w/ Bruh</li>
            </ul>
            <button
              type="button"
              className="primary-btn"
              style={{ width: "100%", marginTop: 6 }}
              onClick={requestClose}
            >
              Okay
            </button>
          </div>
        )}
      </AnimatedModal>
    );
  }

  return null;
}
