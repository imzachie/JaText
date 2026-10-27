import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { JaTextNative, type AppVersionInfo } from "../lib/nativeBridge";
import { AnimatedModal } from "./AnimatedModal";

const WELCOMED_VERSION_KEY = "jatext:welcomed-mobile-build:v1";
const PUBLIC_UPDATE_MANIFEST_URL = "https://jatext.vercel.app/apk-version.json";
const PUBLIC_APK_DOWNLOAD_URL = "https://jatext.vercel.app/downloads/JaText-release.apk";
const GITHUB_RELEASE_API = "https://api.github.com/repos/Ahad00010/JaText/releases/tags/apk-latest";
const FALLBACK_GITHUB_APK_URL =
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

async function fetchPublicManifestJson(): Promise<RemoteReleaseInfo | null> {
  const bustUrl = `${PUBLIC_UPDATE_MANIFEST_URL}?t=${Date.now()}`;

  // 1. Native Android HTTP (zero CORS / zero WebView cache, works while GitHub repo is Private!)
  try {
    const nativeRes = await JaTextNative.fetchUpdateManifest({ url: bustUrl });
    if (nativeRes.ok && nativeRes.body) {
      const parsed = JSON.parse(nativeRes.body) as {
        versionName?: string;
        versionCode?: number | string;
        downloadUrl?: string;
      };
      const code =
        typeof parsed.versionCode === "number"
          ? parsed.versionCode
          : Number.parseInt(String(parsed.versionCode ?? ""), 10);
      if (Number.isFinite(code) && code > 0) {
        return {
          versionName: String(parsed.versionName ?? code),
          versionCode: code,
          downloadUrl: parsed.downloadUrl || PUBLIC_APK_DOWNLOAD_URL,
        };
      }
    }
  } catch {
    // Fall through to standard fetch
  }

  // 2. Standard fetch against public jatext.vercel.app CDN
  try {
    const webRes = await fetch(bustUrl, { cache: "no-store" });
    if (webRes.ok) {
      const parsed = (await webRes.json()) as {
        versionName?: string;
        versionCode?: number | string;
        downloadUrl?: string;
      };
      const code =
        typeof parsed.versionCode === "number"
          ? parsed.versionCode
          : Number.parseInt(String(parsed.versionCode ?? ""), 10);
      if (Number.isFinite(code) && code > 0) {
        return {
          versionName: String(parsed.versionName ?? code),
          versionCode: code,
          downloadUrl: parsed.downloadUrl || PUBLIC_APK_DOWNLOAD_URL,
        };
      }
    }
  } catch {
    // Fall through to GitHub Releases fallback
  }

  // 3. Optional fallback to GitHub Releases API (if repository is public)
  try {
    const res = await fetch(GITHUB_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      name?: string;
      body?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const textToScan = `${json.body ?? ""}\n${json.name ?? ""}`;
    const codeMatch =
      /VersionCode:\s*(\d+)/i.exec(textToScan) ?? /\(build\s+(\d+)\)/i.exec(textToScan);
    const nameMatch =
      /VersionName:\s*([0-9]+(?:\.[0-9]+)*)/i.exec(textToScan) ??
      /JaText\s+v([0-9]+(?:\.[0-9]+)*)/i.exec(textToScan);
    if (!codeMatch) return null;
    const remoteCode = Number.parseInt(codeMatch[1], 10);
    const remoteName = nameMatch ? nameMatch[1] : `${remoteCode}`;
    const apkAsset = json.assets?.find((a) => a.name?.endsWith(".apk"));
    return {
      versionName: remoteName,
      versionCode: remoteCode,
      downloadUrl: apkAsset?.browser_download_url || FALLBACK_GITHUB_APK_URL,
    };
  } catch {
    return null;
  }
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
    let appStateHandle: PluginListenerHandle | null = null;

    void JaTextNative.addListener("apkDownloadProgress", (ev) => {
      if (!cancelled) {
        setDownloadPercent(ev.percent >= 0 ? ev.percent : null);
      }
    }).then((h) => {
      progressHandle = h;
    });

    const runUpdateCheck = async () => {
      const info = await JaTextNative.getAppVersionInfo().catch(() => ({
        versionName: "2.2",
        versionCode: 13,
        canInstallPackages: true,
      }));
      if (cancelled) return;
      setLocalInfo(info);

      const currentBuildTag = formatBuildLabel(info.versionName, info.versionCode);
      const lastWelcomed = window.localStorage.getItem(WELCOMED_VERSION_KEY);
      if (lastWelcomed !== currentBuildTag) {
        setShowWelcome(true);
      }

      const remote = await fetchPublicManifestJson();
      if (!cancelled && remote && remote.versionCode > info.versionCode) {
        setDismissedUpdate(false);
        setRemoteUpdate(remote);
      }
    };

    void runUpdateCheck();

    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !cancelled) {
        void runUpdateCheck();
      }
    }).then((h) => {
      appStateHandle = h;
    });

    return () => {
      cancelled = true;
      if (progressHandle) {
        void progressHandle.remove();
      }
      if (appStateHandle) {
        void appStateHandle.remove();
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
          : "Could not download the update. Please check your connection and try again.",
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

  // Priority 1: Newer APK available on public release CDN -> Show Update Prompt
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
              Tap <strong>Update now</strong> to download and install the latest signed JaText APK.
              If prompted by Android, enable <em>Allow from this source</em> to install the update.
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
                    ? `Downloading update… ${downloadPercent}%`
                    : "Downloading update…"}
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
              <li>🚀 Instant One-Tap Self-Updater via public CDN (while source stays Private)</li>
              <li>🔊 Screen Sharing WITH Audio on Mobile &amp; Desktop calls</li>
              <li>📞 Polished Group Call cards, live GC VC Ended status &amp; Call history</li>
              <li>🎙️ Lag-free background Voice Note Transcription + Volume controls</li>
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
