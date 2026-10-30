import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";

export type JaTextWebRoute = "landing" | "chats";

const listeners = new Set<() => void>();
let popstateBound = false;

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
  window.addEventListener("popstate", emitRouteChange);
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

  // If Google OAuth returns to `/?code=...`, seamlessly promote URL to `/chats?code=...`
  // so ConvexAuthProvider exchanges the code and opens Chats directly.
  const params = new URLSearchParams(window.location.search);
  if (params.has("code")) {
    try {
      window.history.replaceState(
        null,
        "",
        `/chats${window.location.search}${window.location.hash}`,
      );
    } catch {
      // ignore history errors
    }
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
  if (window.location.pathname !== "/") {
    window.history.pushState(null, "", "/");
  }
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  emitRouteChange();
}
