import { useSyncExternalStore } from "react";
import { isAuthorizedIosChatsRuntime } from "./iosDetection";

export interface IosPwaState {
  updateAvailable: boolean;
  latestVersion: string | null;
  latestBuildId: string | null;
  checking: boolean;
  refreshing: boolean;
  installSheetOpen: boolean;
}

interface WebVersionManifest {
  version?: string;
  buildId?: string;
  commitSha?: string;
  publishedAt?: string;
}

const STORAGE_BUILD_ID_KEY = "jatext:ios_pwa_active_build_id";

let state: IosPwaState = {
  updateAvailable: false,
  latestVersion: null,
  latestBuildId: null,
  checking: false,
  refreshing: false,
  installSheetOpen: false,
};

let baselineBuildId: string | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let started = false;
let pollTimer: number | null = null;
let notifiedBuildId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

function setState(patch: Partial<IosPwaState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySystemOfUpdate(versionLabel: string | null, buildId: string) {
  if (notifiedBuildId === buildId) return;
  notifiedBuildId = buildId;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = versionLabel
    ? `JaText ${versionLabel} Update Ready`
    : "JaText Update Ready";
  const body =
    "New changes were deployed to JaText. Tap Refresh Now inside the PWA to update.";

  if (swRegistration?.active) {
    swRegistration.active.postMessage({
      type: "SHOW_UPDATE_NOTIFICATION",
      title,
      body,
    });
    return;
  }

  try {
    new Notification(title, {
      body,
      icon: "/jatext-logo-icon.png",
      tag: "jatext-pwa-update",
    });
  } catch {
    // ignore Safari notification constructor restrictions
  }
}

export async function checkForIosPwaUpdatesNow(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (state.checking) return state.updateAvailable;
  setState({ checking: true });

  try {
    if (swRegistration) {
      await swRegistration.update().catch(() => undefined);
      if (swRegistration.waiting && navigator.serviceWorker?.controller) {
        setState({
          updateAvailable: true,
          checking: false,
        });
        notifySystemOfUpdate(state.latestVersion, state.latestBuildId || "sw-waiting");
        return true;
      }
    }

    const res = await fetch(`/web-version.json?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!res.ok) {
      setState({ checking: false });
      return state.updateAvailable;
    }

    const manifest = (await res.json()) as WebVersionManifest;
    const remoteBuildId = String(manifest.buildId || "").trim();
    const remoteVersion = String(manifest.version || "").trim() || null;

    if (!remoteBuildId || remoteBuildId === "dev-local") {
      setState({ checking: false, latestVersion: remoteVersion });
      return state.updateAvailable;
    }

    if (!baselineBuildId) {
      baselineBuildId = remoteBuildId;
      try {
        window.localStorage.setItem(STORAGE_BUILD_ID_KEY, remoteBuildId);
      } catch {
        // ignore storage errors
      }
      setState({
        checking: false,
        latestVersion: remoteVersion,
        latestBuildId: remoteBuildId,
      });
      return false;
    }

    if (remoteBuildId !== baselineBuildId) {
      setState({
        updateAvailable: true,
        latestVersion: remoteVersion,
        latestBuildId: remoteBuildId,
        checking: false,
      });
      notifySystemOfUpdate(remoteVersion, remoteBuildId);
      return true;
    }

    setState({ checking: false });
    return state.updateAvailable;
  } catch {
    setState({ checking: false });
    return state.updateAvailable;
  }
}

export async function applyIosPwaUpdateAndReload(): Promise<void> {
  if (typeof window === "undefined") return;
  setState({ refreshing: true });

  try {
    if (state.latestBuildId) {
      try {
        window.localStorage.setItem(STORAGE_BUILD_ID_KEY, state.latestBuildId);
      } catch {
        // ignore
      }
    }

    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    if (swRegistration?.active) {
      swRegistration.active.postMessage({ type: "CLEAR_CACHES" });
    }
    if ("caches" in window) {
      const keys = await window.caches.keys().catch(() => [] as string[]);
      await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore cleanup errors
  }

  window.setTimeout(() => {
    window.location.reload();
  }, 140);
}

export function openIosPwaInstallSheet(): void {
  setState({ installSheetOpen: true });
}

export function closeIosPwaInstallSheet(): void {
  setState({ installSheetOpen: false });
}

export function startIosPwaLifecycleIfNeeded(): void {
  if (started || typeof window === "undefined") return;
  if (!isAuthorizedIosChatsRuntime()) return;
  started = true;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        swRegistration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) {
          setState({ updateAvailable: true });
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              void checkForIosPwaUpdatesNow();
            }
          });
        });
      })
      .catch(() => {
        // ignore SW registration failure in restricted WebViews
      });
  }

  // Establish baseline build ID immediately, then check every 40s and on wake/focus
  void checkForIosPwaUpdatesNow();

  pollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void checkForIosPwaUpdatesNow();
    }
  }, 40_000);

  const onWake = () => {
    if (document.visibilityState === "visible") {
      void checkForIosPwaUpdatesNow();
    }
  };
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);
  window.addEventListener("pageshow", onWake);

  // Silence unused-variable warning on pollTimer if module lives for lifetime of SPA
  void pollTimer;
}

export function useIosPwaState(): IosPwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
