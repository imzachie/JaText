import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { isGenuineIosDevice, isIosChatsPathname } from "./iosDetection";

export type JaTextWebRoute =
  | "landing"
  | "chats"
  | "ios_chats"
  | "ios_unauthorized_404";

export const OAUTH_RETURN_CHATS_FLAG = "jatext:oauth-return-chats";
export const OAUTH_RETURN_IOS_CHATS_FLAG = "jatext:oauth-return-ios-chats";

const listeners = new Set<() => void>();
let popstateBound = false;
let oauthLatchedRoute: "chats" | "ios_chats" | null = null;

function promoteOAuthLandingUrlIfNeeded(): "chats" | "ios_chats" | null {
  if (typeof window === "undefined" || Capacitor.isNativePlatform()) return null;
  const params = new URLSearchParams(window.location.search);
  const hasCode =
    params.has("code") || params.has("tursoToken") || params.has("authError");
  let hasDesktopReturnFlag = false;
  let hasIosReturnFlag = false;
  try {
    hasDesktopReturnFlag = window.sessionStorage.getItem(OAUTH_RETURN_CHATS_FLAG) === "1";
    hasIosReturnFlag = window.sessionStorage.getItem(OAUTH_RETURN_IOS_CHATS_FLAG) === "1";
    if (hasDesktopReturnFlag) {
      window.sessionStorage.removeItem(OAUTH_RETURN_CHATS_FLAG);
    }
    if (hasIosReturnFlag) {
      window.sessionStorage.removeItem(OAUTH_RETURN_IOS_CHATS_FLAG);
    }
  } catch {
    // ignore storage errors
  }

  if (!hasCode && !hasDesktopReturnFlag && !hasIosReturnFlag) {
    return null;
  }

  const preferIos = hasIosReturnFlag || isGenuineIosDevice() || isIosChatsPathname();
  const targetRoute: "chats" | "ios_chats" = preferIos ? "ios_chats" : "chats";
  const targetPath = preferIos ? "/ios/chats" : "/chats";
  oauthLatchedRoute = targetRoute;

  const pathname = window.location.pathname || "/";
  if (pathname !== targetPath && !pathname.startsWith(`${targetPath}/`)) {
    try {
      window.history.replaceState(
        null,
        "",
        `${targetPath}${window.location.search}${window.location.hash}`,
      );
    } catch {
      // ignore history errors
    }
  }
  return targetRoute;
}

// Run immediately at module load before auth providers read window.location
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
    oauthLatchedRoute = null;
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

  // Strict authorization gate for /ios/chats: ONLY genuine iOS devices are permitted
  if (isIosChatsPathname(pathname)) {
    if (!isGenuineIosDevice()) {
      return "ios_unauthorized_404";
    }
    return "ios_chats";
  }

  // If an iOS device navigates to /chats, seamlessly upgrade it to /ios/chats
  if (pathname === "/chats" || pathname.startsWith("/chats/")) {
    if (isGenuineIosDevice()) {
      try {
        window.history.replaceState(
          null,
          "",
          `/ios/chats${window.location.search}${window.location.hash}`,
        );
      } catch {
        // ignore history errors
      }
      return "ios_chats";
    }
    return "chats";
  }

  const promoted = oauthLatchedRoute ?? promoteOAuthLandingUrlIfNeeded();
  if (promoted === "ios_chats") {
    return isGenuineIosDevice() ? "ios_chats" : "ios_unauthorized_404";
  }
  if (promoted === "chats") {
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

export function navigateToIosChats(): void {
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) {
    const pathname = window.location.pathname || "/";
    if (!isIosChatsPathname(pathname)) {
      window.history.pushState(null, "", "/ios/chats");
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }
  if (isGenuineIosDevice()) {
    oauthLatchedRoute = "ios_chats";
  }
  emitRouteChange();
}

export function navigateToChats(): void {
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform() && isGenuineIosDevice()) {
    navigateToIosChats();
    return;
  }
  oauthLatchedRoute = "chats";
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
  oauthLatchedRoute = null;
  if (window.location.pathname !== "/") {
    window.history.pushState(null, "", "/");
  }
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  emitRouteChange();
}
