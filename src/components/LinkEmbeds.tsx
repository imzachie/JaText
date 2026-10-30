import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";

export interface LinkPreviewResult {
  url: string;
  hasEmbed: boolean;
  siteName?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
}

const LS_CACHE_KEY = "jatext:link-preview-cache:v2";
const PUBLIC_PREVIEW_ENDPOINT = "https://jatext.vercel.app/api/link-preview";
const MAX_LOCAL_CACHE_ENTRIES = 160;
const POSITIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 60 * 1000;

interface CachedEntry extends LinkPreviewResult {
  cachedAt: number;
}

const memoryPreviewCache = new Map<string, CachedEntry>();
const inflightPreviewPromises = new Map<string, Promise<LinkPreviewResult>>();
let hydratedFromStorage = false;

function hydratePreviewCacheOnce() {
  if (hydratedFromStorage || typeof window === "undefined") return;
  hydratedFromStorage = true;
  try {
    const raw = window.localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CachedEntry>;
    if (!parsed || typeof parsed !== "object") return;
    for (const [key, val] of Object.entries(parsed)) {
      if (val && typeof val.url === "string" && typeof val.cachedAt === "number") {
        memoryPreviewCache.set(key, val);
      }
    }
  } catch {
    // ignore storage errors
  }
}

function persistPreviewCache() {
  if (typeof window === "undefined") return;
  try {
    const entries = Array.from(memoryPreviewCache.entries())
      .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      .slice(0, MAX_LOCAL_CACHE_ENTRIES);
    const obj: Record<string, CachedEntry> = {};
    for (const [k, v] of entries) obj[k] = v;
    window.localStorage.setItem(LS_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // ignore quota errors
  }
}

function getFreshCachedPreview(url: string): CachedEntry | null {
  hydratePreviewCacheOnce();
  const entry = memoryPreviewCache.get(url);
  if (!entry) return null;
  const ttl = entry.hasEmbed ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  if (Date.now() - entry.cachedAt > ttl) {
    memoryPreviewCache.delete(url);
    return null;
  }
  return entry;
}

function getPreviewApiEndpoint(targetUrl: string): string {
  const qs = `?url=${encodeURIComponent(targetUrl)}`;
  if (typeof window === "undefined") return `${PUBLIC_PREVIEW_ENDPOINT}${qs}`;
  if (Capacitor.isNativePlatform()) {
    return `${PUBLIC_PREVIEW_ENDPOINT}${qs}`;
  }
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `${PUBLIC_PREVIEW_ENDPOINT}${qs}`;
  }
  return `/api/link-preview${qs}`;
}

async function requestLinkPreview(url: string): Promise<LinkPreviewResult> {
  const endpoint = getPreviewApiEndpoint(url);
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return { url, hasEmbed: false };
  const data = (await res.json()) as Partial<LinkPreviewResult>;
  if (!data || typeof data !== "object" || !data.hasEmbed) {
    return { url, hasEmbed: false };
  }
  return {
    url: typeof data.url === "string" ? data.url : url,
    hasEmbed: true,
    siteName: typeof data.siteName === "string" ? data.siteName : undefined,
    title: typeof data.title === "string" ? data.title : undefined,
    description: typeof data.description === "string" ? data.description : undefined,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
    themeColor: typeof data.themeColor === "string" ? data.themeColor : undefined,
  };
}

const DIRECT_MEDIA_EXT_RE =
  /\.(png|jpe?g|gif|webp|avif|bmp|svg|mp4|webm|mov|mp3|wav|ogg|m4a)(\?|#|$)/i;

export function extractEmbeddableUrls(text?: string | null): string[] {
  if (!text) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  const regex = /\bhttps?:\/\/[^\s<>()]+/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    let candidate = match[0];
    while (/[.,!?;:'"\]}]$/.test(candidate)) {
      candidate = candidate.slice(0, -1);
    }
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (parsed.hostname.endsWith(".convex.cloud") && parsed.pathname.includes("/api/storage/")) {
        continue;
      }
      if (DIRECT_MEDIA_EXT_RE.test(parsed.pathname)) continue;
      parsed.hash = "";
      const normalized = parsed.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
        if (urls.length >= 2) break;
      }
    } catch {
      // ignore invalid URL
    }
  }
  return urls;
}

function SingleLinkEmbed({ url }: { url: string }) {
  const [preview, setPreview] = useState<LinkPreviewResult | null>(() =>
    getFreshCachedPreview(url),
  );
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
    const cached = getFreshCachedPreview(url);
    if (cached) {
      setPreview(cached);
      return;
    }

    let cancelled = false;
    let pending = inflightPreviewPromises.get(url);
    if (!pending) {
      pending = requestLinkPreview(url)
        .then((res) => {
          const entry: CachedEntry = { ...res, cachedAt: Date.now() };
          memoryPreviewCache.set(url, entry);
          persistPreviewCache();
          return res;
        })
        .catch(() => ({ url, hasEmbed: false }))
        .finally(() => {
          inflightPreviewPromises.delete(url);
        });
      inflightPreviewPromises.set(url, pending);
    }

    void pending.then((res) => {
      if (!cancelled) {
        setPreview(res);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview || !preview.hasEmbed || (!preview.title && (!preview.imageUrl || imageBroken))) {
    return null;
  }

  const accentColor = preview.themeColor || "#5865F2";
  const showSiteName =
    preview.siteName &&
    preview.siteName.trim().toLowerCase() !== (preview.title ?? "").trim().toLowerCase();

  return (
    <div
      className="link-embed-card"
      style={{ borderLeftColor: accentColor }}
      onClick={(e) => e.stopPropagation()}
    >
      {showSiteName ? <span className="link-embed-site">{preview.siteName}</span> : null}
      {preview.title ? (
        <a
          className="link-embed-title"
          href={preview.url || url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {preview.title}
        </a>
      ) : null}
      {preview.description ? (
        <p className="link-embed-description">{preview.description}</p>
      ) : null}
      {preview.imageUrl && !imageBroken ? (
        <a
          className="link-embed-image-link"
          href={preview.url || url}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            className="link-embed-image"
            src={preview.imageUrl}
            alt={preview.title || ""}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
          />
        </a>
      ) : null}
    </div>
  );
}

export function MessageLinkEmbeds({ text }: { text?: string | null }) {
  const urls = useMemo(() => extractEmbeddableUrls(text), [text]);
  if (urls.length === 0) return null;
  return (
    <div className="link-embeds-list">
      {urls.map((u) => (
        <SingleLinkEmbed key={u} url={u} />
      ))}
    </div>
  );
}
