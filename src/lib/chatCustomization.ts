import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

export type BubbleStyleId =
  | "default"
  | "whee-sketch"
  | "ghost-limited"
  | "pumpkin-limited"
  | "spider-limited"
  | "bubbly-otter"
  | "glam-diva"
  | "chill-croc"
  | "olivia-rodrigo"
  | "frog-duck"
  | "flexing-cat"
  | "capybara"
  | "frog"
  | "cat-dog"
  | "facepalm"
  | "heart-pepe"
  | "pig-shark"
  | "tongue-bear"
  | "doge"
  | "frog-chick"
  | "hungry-dog"
  | "dino"
  | "dachshund"
  | "hungry-frog";

export interface BubbleStyleMeta {
  id: BubbleStyleId;
  label: string;
  limited?: boolean;
  lockedBadge?: boolean;
  /** Whether text inside this bubble should use dark ink (#16161d) vs light ink (#ffffff) */
  tone: "light-bg" | "dark-bg";
}

export const BUBBLE_STYLES: readonly BubbleStyleMeta[] = [
  { id: "default", label: "Default", tone: "dark-bg" },
  { id: "whee-sketch", label: "Whee sketch", tone: "light-bg" },
  { id: "ghost-limited", label: "👻", limited: true, tone: "light-bg" },
  { id: "pumpkin-limited", label: "🎃", limited: true, tone: "light-bg" },
  { id: "spider-limited", label: "🕷️", limited: true, tone: "dark-bg" },
  { id: "bubbly-otter", label: "Bubbly otter", tone: "light-bg" },
  { id: "glam-diva", label: "Glam diva", tone: "light-bg" },
  { id: "chill-croc", label: "Chill croc", tone: "light-bg" },
  { id: "olivia-rodrigo", label: "Olivia Rodrigo", tone: "light-bg" },
  { id: "frog-duck", label: "Frog duck", tone: "light-bg" },
  { id: "flexing-cat", label: "Flexing cat", tone: "light-bg" },
  { id: "capybara", label: "Capybara", tone: "light-bg" },
  { id: "frog", label: "Frog", tone: "light-bg" },
  { id: "cat-dog", label: "Cat dog", tone: "light-bg" },
  { id: "facepalm", label: "Facepalm", tone: "light-bg" },
  { id: "heart-pepe", label: "Heart Pepe", tone: "light-bg" },
  { id: "pig-shark", label: "Pig shark", tone: "light-bg" },
  { id: "tongue-bear", label: "Tongue bear", tone: "light-bg" },
  { id: "doge", label: "Doge", tone: "light-bg" },
  { id: "frog-chick", label: "Frog chick", tone: "light-bg" },
  { id: "hungry-dog", label: "Hungry dog", tone: "light-bg" },
  { id: "dino", label: "Dino", tone: "light-bg" },
  { id: "dachshund", label: "Dachshund", tone: "dark-bg" },
  { id: "hungry-frog", label: "Hungry frog", tone: "light-bg" },
] as const;

const BUBBLE_STYLE_STORAGE_KEY = "jatext-outgoing-bubble-style-v1";
const BUBBLE_STYLE_EVENT = "jatext-bubble-style-updated";
export const BUBBLE_STYLE_REMOTE_SYNC_EVENT = "jatext-bubble-style-sync-push";
const ZW_BOOKEND = "\u2063";
const ZW_ZERO = "\u200B";
const ZW_ONE = "\u200C";

export function isValidBubbleStyleId(value: string): value is BubbleStyleId {
  return BUBBLE_STYLES.some((item) => item.id === value);
}

export function getBubbleStyleMeta(id: BubbleStyleId): BubbleStyleMeta {
  return BUBBLE_STYLES.find((item) => item.id === id) ?? BUBBLE_STYLES[0];
}

export function getSavedOutgoingBubbleStyle(): BubbleStyleId {
  try {
    const raw = localStorage.getItem(BUBBLE_STYLE_STORAGE_KEY);
    if (raw && isValidBubbleStyleId(raw)) return raw;
  } catch {
    // Ignore storage access errors.
  }
  return "default";
}

export function saveOutgoingBubbleStyle(
  styleId: BubbleStyleId,
  options?: { fromRemote?: boolean },
): void {
  try {
    const prev = localStorage.getItem(BUBBLE_STYLE_STORAGE_KEY);
    localStorage.setItem(BUBBLE_STYLE_STORAGE_KEY, styleId);
    window.dispatchEvent(new CustomEvent(BUBBLE_STYLE_EVENT, { detail: styleId }));
    if (!options?.fromRemote && prev !== styleId) {
      window.dispatchEvent(new CustomEvent(BUBBLE_STYLE_REMOTE_SYNC_EVENT, { detail: styleId }));
    }
  } catch {
    // Ignore storage access errors.
  }
}

export function useOutgoingBubbleStyle(): [BubbleStyleId, (next: BubbleStyleId) => void] {
  const [styleId, setStyleId] = useState<BubbleStyleId>(() => getSavedOutgoingBubbleStyle());

  useEffect(() => {
    const handler = () => setStyleId(getSavedOutgoingBubbleStyle());
    window.addEventListener(BUBBLE_STYLE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(BUBBLE_STYLE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (next: BubbleStyleId) => {
    saveOutgoingBubbleStyle(next);
    setStyleId(next);
  };

  return [styleId, update];
}

/**
 * Encodes a non-default BubbleStyleId as an invisible 7-char zero-width suffix
 * so push notifications, legacy views, and Convex's 4000-char validator stay 100% clean.
 */
export function encodeBubbleStyleMarker(styleId: BubbleStyleId): string {
  const idx = BUBBLE_STYLES.findIndex((item) => item.id === styleId);
  if (idx <= 0) return "";
  let bits = "";
  for (let b = 4; b >= 0; b--) {
    bits += (idx >> b) & 1 ? ZW_ONE : ZW_ZERO;
  }
  return `${ZW_BOOKEND}${bits}${ZW_BOOKEND}`;
}

export function attachBubbleStyleToOutgoing(
  body: string,
  styleId: BubbleStyleId,
): string {
  const cleaned = stripBubbleStyleFromText(body);
  if (styleId === "default") return cleaned;
  return `${cleaned}${encodeBubbleStyleMarker(styleId)}`;
}

export function attachBubbleStyleToFile(file: File, styleId: BubbleStyleId): File {
  if (styleId === "default") return file;
  const existingType = file.type || "application/octet-stream";
  if (existingType.includes(";jbs=")) return file;
  return new File([file], file.name, {
    type: `${existingType};jbs=${styleId}`,
    lastModified: file.lastModified,
  });
}

const TRAILING_MARKER_RE = /\u2063([\u200B\u200C]{5})\u2063$/;

export function stripBubbleStyleFromText(body?: string | null): string {
  if (!body) return "";
  return body.replace(TRAILING_MARKER_RE, "");
}

export function extractMessageBubbleStyle(
  body?: string | null,
  attachmentType?: string | null,
): { cleanBody: string; bubbleStyle: BubbleStyleId } {
  const rawBody = body ?? "";
  const match = TRAILING_MARKER_RE.exec(rawBody);
  if (match) {
    let idx = 0;
    for (const ch of match[1]) {
      idx = (idx << 1) | (ch === ZW_ONE ? 1 : 0);
    }
    const found = BUBBLE_STYLES[idx]?.id ?? "default";
    return {
      cleanBody: rawBody.slice(0, match.index),
      bubbleStyle: found,
    };
  }

  if (attachmentType) {
    const mimeMatch = /;jbs=([a-z0-9-]+)/i.exec(attachmentType);
    if (mimeMatch && isValidBubbleStyleId(mimeMatch[1])) {
      return { cleanBody: rawBody, bubbleStyle: mimeMatch[1] };
    }
  }

  return { cleanBody: rawBody, bubbleStyle: "default" };
}

/* ================================================================== */
/* Mobile Shared Chat Wallpapers (6 Presets + Custom Image = 7 total) */
/* ================================================================== */

export const WALLPAPER_PREFIX = "__JATEXT_WP__:";
const WALLPAPER_CACHE_KEY = "jatext-chat-wallpapers-v1";

export interface WallpaperPreset {
  id: string;
  label: string;
  url: string;
}

export const WALLPAPER_PRESETS: readonly WallpaperPreset[] = [
  {
    id: "wp-1",
    label: "Wallpaper 1",
    url: "https://i.pinimg.com/236x/74/da/f3/74daf3ae818919526e814777c181bfc1.jpg",
  },
  {
    id: "wp-2",
    label: "Wallpaper 2",
    url: "https://cdn.wallpapersafari.com/95/23/Nbysph.jpg",
  },
  {
    id: "wp-3",
    label: "Wallpaper 3",
    url: "https://i.pinimg.com/236x/64/3a/b3/643ab3286afd2991f261061ff251dc10.jpg",
  },
  {
    id: "wp-4",
    label: "Wallpaper 4",
    url: "https://wallpapers.com/images/hd/whatsapp-chat-background-mn1uthhgygqpr7r2.jpg",
  },
  {
    id: "wp-5",
    label: "Wallpaper 5",
    url: "https://wallpapers.com/images/hd/whatsapp-chat-stars-and-clouds-73osu5fosbnwrd3z.jpg",
  },
  {
    id: "wp-6",
    label: "Wallpaper 6",
    url: "https://wallpaperaccess.com/full/1288076.jpg",
  },
] as const;

export interface WallpaperSignalPayload {
  v: 1;
  kind: "preset" | "custom" | "none";
  presetId?: string;
  url?: string;
  actorName?: string;
}

export function serializeWallpaperSignal(payload: WallpaperSignalPayload): string {
  return `${WALLPAPER_PREFIX}${JSON.stringify(payload)}`;
}

export function parseWallpaperSignal(
  body?: string | null,
  attachmentUrl?: string | null,
): { kind: "preset" | "custom" | "none"; url: string | null; presetId?: string; actorName?: string } | null {
  const clean = stripBubbleStyleFromText(body);
  if (!clean.startsWith(WALLPAPER_PREFIX)) return null;
  try {
    const parsed = JSON.parse(clean.slice(WALLPAPER_PREFIX.length)) as Partial<WallpaperSignalPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.kind === "none") {
      return { kind: "none", url: null, actorName: parsed.actorName };
    }
    if (parsed.kind === "custom") {
      const resolvedUrl = attachmentUrl || parsed.url || null;
      return { kind: "custom", url: resolvedUrl, actorName: parsed.actorName };
    }
    if (parsed.kind === "preset" && typeof parsed.url === "string") {
      return {
        kind: "preset",
        url: parsed.url,
        presetId: parsed.presetId,
        actorName: parsed.actorName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function readWallpaperCache(): Record<string, string | null> {
  try {
    const raw = localStorage.getItem(WALLPAPER_CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string | null>;
  } catch {
    return {};
  }
}

export function getCachedWallpaper(scopeKey: string): string | null | undefined {
  const map = readWallpaperCache();
  return Object.prototype.hasOwnProperty.call(map, scopeKey) ? map[scopeKey] : undefined;
}

export function saveCachedWallpaper(scopeKey: string, url: string | null): void {
  try {
    const map = readWallpaperCache();
    map[scopeKey] = url;
    localStorage.setItem(WALLPAPER_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors.
  }
}

export function useIsMobileWallpaperSupported(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (Capacitor.isNativePlatform()) return true;
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 820px)").matches;
  });

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const mq = window.matchMedia("(max-width: 820px)");
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}
