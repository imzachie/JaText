import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

export type JaTextWebRoute = "landing" | "chats";

export const OAUTH_RETURN_CHATS_FLAG = "jatext:oauth-return-chats";

const listeners = new Set<() => void>();
let popstateBound = false;
let oauthLatchedToChats = false;

function promoteOAuthLandingUrlIfNeeded(): boolean {
  if (typeof window === "undefined" || Capacitor.isNativePlatform()) return false;
  const params = new URLSearchParams(window.location.search);
  const hasCode = params.has("code");
  let hasReturnFlag = false;
  try {
    hasReturnFlag = window.sessionStorage.getItem(OAUTH_RETURN_CHATS_FLAG) === "1";
    if (hasReturnFlag) {
      window.sessionStorage.removeItem(OAUTH_RETURN_CHATS_FLAG);
    }
  } catch {
    // ignore storage errors
  }

  if (!hasCode && !hasReturnFlag) {
    return false;
  }

  oauthLatchedToChats = true;
  const pathname = window.location.pathname || "/";
  if (pathname !== "/chats" && !pathname.startsWith("/chats/")) {
    try {
      window.history.replaceState(
        null,
        "",
        `/chats${window.location.search}${window.location.hash}`,
      );
    } catch {
      // ignore history errors
    }
  }
  return true;
}

// Run immediately at module load before ConvexAuthProvider reads window.location
promoteOAuthLandingUrlIfNeeded();

function emitRouteChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

function ensurePopstateListener() {
  if (popstateBound || typeof window === "undefined") return;
  popstateBound = true;
  window.addEventListener("popstate", () => {
    oauthLatchedToChats = false;
    emitRouteChange();
  });
}

export function resolveCurrentWebRoute(): JaTextWebRoute {
  // Native Android APK always launches straight into Chats
  if (Capacitor.isNativePlatform()) {
    return "chats";
  }
  if (typeof window === "undefined") {
    return "landing";
  }

  const pathname = window.location.pathname || "/";
  if (pathname === "/chats" || pathname.startsWith("/chats/")) {
    return "chats";
  }

  if (oauthLatchedToChats || promoteOAuthLandingUrlIfNeeded()) {
    return "chats";
  }

  return "landing";
}

function subscribeRoute(listener: () => void): () => void {
  ensurePopstateListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useJaTextWebRoute(): JaTextWebRoute {
  return useSyncExternalStore(
    subscribeRoute,
    resolveCurrentWebRoute,
    () => "landing",
  );
}

export function navigateToChats(): void {
  if (typeof window === "undefined") return;
  oauthLatchedToChats = true;
  if (!Capacitor.isNativePlatform()) {
    const pathname = window.location.pathname || "/";
    if (pathname !== "/chats" && !pathname.startsWith("/chats/")) {
      window.history.pushState(null, "", "/chats");
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }
  emitRouteChange();
}

export function navigateToLanding(): void {
  if (typeof window === "undefined" || Capacitor.isNativePlatform()) return;
  oauthLatchedToChats = false;
  if (window.location.pathname !== "/") {
    window.history.pushState(null, "", "/");
  }
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  emitRouteChange();
}
