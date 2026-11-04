import { Capacitor } from "@capacitor/core";

/**
 * Single source of truth for the public JaText origin used by the web app.
 *
 * Resolution order:
 *   1. VITE_API_ORIGIN build variable (self-hosting on a custom domain)
 *   2. The current browser origin (the self-hosted server serves web + API together)
 *   3. Hardcoded public fallback origin
 */
function browserOrigin(): string {
  if (typeof window === "undefined") return "";
  try {
    if (Capacitor.isNativePlatform()) return "";
  } catch {
    return "";
  }
  const origin = String(window.location?.origin || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(origin)) return "";
  const host = String(window.location?.hostname || "").toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return "";
  }
  return origin;
}

const DEFAULT_PUBLIC_APP_ORIGIN = "https://jatext.us.ci";

export const PUBLIC_APP_ORIGIN = (
  (import.meta.env?.VITE_API_ORIGIN as string | undefined)?.trim().replace(/\/+$/, "") ||
  browserOrigin() ||
  DEFAULT_PUBLIC_APP_ORIGIN
).replace(/\/+$/, "");

export const PUBLIC_APP_HOST = PUBLIC_APP_ORIGIN.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
