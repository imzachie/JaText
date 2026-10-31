import { Capacitor } from "@capacitor/core";

export type IosBrowserKind = "safari" | "chrome" | "firefox" | "edge" | "opera" | "other";

/**
 * Returns true strictly on genuine Apple iOS / iPadOS devices (iPhone, iPod, iPad,
 * including iPadOS 13+ desktop-class Safari where UA reports Macintosh with multi-touch).
 * Strictly returns false on Native Capacitor Android, Android browsers, Windows, Linux,
 * ChromeOS, and macOS desktop computers.
 */
export function isGenuineIosDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (Capacitor.isNativePlatform()) {
    return false;
  }

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";

  // Explicitly reject Android, Windows, ChromeOS, and Linux user agents
  if (/Android|Windows NT|CrOS|Linux/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) {
    return false;
  }

  if (/iPhone|iPad|iPod/i.test(ua) || /iPhone|iPad|iPod/i.test(platform)) {
    return true;
  }

  // iOS third-party browsers always embed Apple WebKit iOS tokens even in desktop-site mode
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) {
    return true;
  }

  // iPadOS 13+ Safari reports "Macintosh" in User-Agent; real Macs have maxTouchPoints === 0
  if (/Macintosh|MacIntel/i.test(ua) || /MacIntel/i.test(platform)) {
    return (navigator.maxTouchPoints ?? 0) > 1;
  }

  return false;
}

export function detectIosBrowserKind(): IosBrowserKind {
  if (typeof navigator === "undefined") return "safari";
  const ua = navigator.userAgent || "";
  if (/CriOS/i.test(ua)) return "chrome";
  if (/FxiOS/i.test(ua)) return "firefox";
  if (/EdgiOS/i.test(ua)) return "edge";
  if (/OPiOS/i.test(ua)) return "opera";
  if (/Safari/i.test(ua) || /AppleWebKit/i.test(ua)) return "safari";
  return "other";
}

/**
 * Human-readable browser badge shown on the iOS gate, e.g. "Safari | iOS" or "Chrome | iOS".
 */
export function detectIosBrowserLabel(): string {
  const kind = detectIosBrowserKind();
  switch (kind) {
    case "chrome":
      return "Chrome | iOS";
    case "firefox":
      return "Firefox | iOS";
    case "edge":
      return "Edge | iOS";
    case "opera":
      return "Opera | iOS";
    case "safari":
      return "Safari | iOS";
    default:
      return "Safari | iOS";
  }
}

export function isRunningAsStandalonePwa(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mediaStandalone = Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.matchMedia?.("(display-mode: fullscreen)")?.matches,
  );
  return navStandalone || mediaStandalone;
}

export function isIosChatsPathname(pathname?: string): boolean {
  if (typeof window === "undefined" && pathname === undefined) return false;
  const p = pathname ?? window.location.pathname ?? "/";
  return p === "/ios/chats" || p.startsWith("/ios/chats/");
}

export function isAuthorizedIosChatsRuntime(): boolean {
  return isIosChatsPathname() && isGenuineIosDevice();
}

/**
 * True when running as a primary mobile JaText app:
 * - Native Android APK (Capacitor)
 * - Authorized iOS Web / PWA at /ios/chats
 */
export function isPrimaryMobileAppRuntime(): boolean {
  return Capacitor.isNativePlatform() || isAuthorizedIosChatsRuntime();
}
