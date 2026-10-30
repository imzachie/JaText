import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./lib";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const NEGATIVE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HTML_BYTES = 180_000;

export interface LinkPreviewResult {
  url: string;
  hasEmbed: boolean;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  themeColor?: string;
}

function isBlockedPrivateHost(hostnameRaw: string): boolean {
  const host = hostnameRaw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "::"
  ) {
    return true;
  }

  // IPv4 literal check
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }

  // IPv6 private/link-local literal check
  if (host.includes(":")) {
    if (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb") ||
      host.startsWith("::ffff:127.") ||
      host.startsWith("::ffff:10.") ||
      host.startsWith("::ffff:192.168.")
    ) {
      return true;
    }
  }

  return false;
}

function normalizeLookupUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (isBlockedPrivateHost(parsed.hostname)) return null;
    // Never fetch Convex internal blob storage URLs as website link embeds
    if (parsed.hostname.endsWith(".convex.cloud") && parsed.pathname.includes("/api/storage/")) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function resolveMaybeRelativeUrl(candidate: string | undefined, baseUrl: string): string | undefined {
  if (!candidate) return undefined;
  const cleaned = decodeHtmlEntities(candidate);
  if (!cleaned) return undefined;
  try {
    const resolved = new URL(cleaned, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
    if (isBlockedPrivateHost(resolved.hostname)) return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function normalizeHexThemeColor(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = decodeHtmlEntities(raw).trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

function defaultBrandAccentForHost(hostname: string): string | undefined {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host === "discord.com" || host === "discord.gg" || host.endsWith(".discord.com")) return "#5865F2";
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "#FF0033";
  if (host === "x.com" || host === "twitter.com") return "#1D9BF0";
  if (host === "github.com" || host.endsWith(".github.com")) return "#8B949E";
  if (host === "spotify.com" || host === "open.spotify.com") return "#1DB954";
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) return "#9146FF";
  if (host === "reddit.com" || host.endsWith(".reddit.com")) return "#FF4500";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "#E1306C";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "#FE2C55";
  return undefined;
}

function extractMetaMap(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  const metaRegex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaRegex.exec(html)) !== null) {
    const tag = match[0];
    const keyMatch =
      tag.match(/\b(?:property|name|itemprop)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/i);
    const valMatch =
      tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i);
    const key = (keyMatch?.[1] ?? keyMatch?.[2] ?? keyMatch?.[3] ?? "").trim().toLowerCase();
    const val = (valMatch?.[1] ?? valMatch?.[2] ?? valMatch?.[3] ?? "").trim();
    if (key && val && !map[key]) {
      map[key] = decodeHtmlEntities(val);
    }
  }
  return map;
}

function parseOpenGraphFromHtml(html: string, finalUrl: string): Omit<LinkPreviewResult, "url"> {
  const meta = extractMetaMap(html);
  const titleTagMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitleTag = titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]) : "";

  const ogTitle = meta["og:title"] || meta["twitter:title"];
  const description =
    meta["og:description"] ||
    meta["twitter:description"] ||
    meta["description"] ||
    undefined;
  const rawImage =
    meta["og:image"] ||
    meta["og:image:url"] ||
    meta["og:image:secure_url"] ||
    meta["twitter:image"] ||
    meta["twitter:image:src"];
  const imageUrl = resolveMaybeRelativeUrl(rawImage, finalUrl);
  const siteName = meta["og:site_name"] || meta["application-name"] || undefined;

  let hostBrandColor: string | undefined;
  try {
    hostBrandColor = defaultBrandAccentForHost(new URL(finalUrl).hostname);
  } catch {
    hostBrandColor = undefined;
  }
  const themeColor = normalizeHexThemeColor(meta["theme-color"]) || hostBrandColor;

  const title = ogTitle || (description || imageUrl ? rawTitleTag : "");
  const cleanTitle = title ? title.slice(0, 180) : undefined;
  const cleanDescription = description ? description.slice(0, 340) : undefined;
  const cleanSiteName = siteName ? siteName.slice(0, 80) : undefined;

  const hasEmbed = Boolean(cleanTitle || imageUrl);
  return {
    hasEmbed,
    title: cleanTitle,
    description: cleanDescription,
    imageUrl,
    siteName: cleanSiteName,
    themeColor,
  };
}

export const getCached = query({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<LinkPreviewResult | null> => {
    await requireUser(ctx);
    const normalized = normalizeLookupUrl(url);
    if (!normalized) return null;
    const cached = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", normalized))
      .unique();
    if (!cached) return null;
    const ttl = cached.hasEmbed ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
    if (Date.now() - cached.fetchedAt > ttl) return null;
    return {
      url: cached.url,
      hasEmbed: cached.hasEmbed,
      title: cached.title,
      description: cached.description,
      imageUrl: cached.imageUrl,
      siteName: cached.siteName,
      themeColor: cached.themeColor,
    };
  },
});

export const readCacheInternal = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    return ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();
  },
});

export const writeCacheInternal = internalMutation({
  args: {
    url: v.string(),
    hasEmbed: v.boolean(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    siteName: v.optional(v.string()),
    themeColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .unique();
    const doc = {
      url: args.url,
      hasEmbed: args.hasEmbed,
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      siteName: args.siteName,
      themeColor: args.themeColor,
      fetchedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("linkPreviews", doc);
    }
  },
});

export const fetchPreview = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<LinkPreviewResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { url, hasEmbed: false };
    }
    const normalized = normalizeLookupUrl(url);
    if (!normalized) {
      return { url, hasEmbed: false };
    }

    const cached = await ctx.runQuery(internal.linkPreview.readCacheInternal, {
      url: normalized,
    });
    if (cached) {
      const ttl = cached.hasEmbed ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
      if (Date.now() - cached.fetchedAt <= ttl) {
        return {
          url: cached.url,
          hasEmbed: cached.hasEmbed,
          title: cached.title,
          description: cached.description,
          imageUrl: cached.imageUrl,
          siteName: cached.siteName,
          themeColor: cached.themeColor,
        };
      }
    }

    let parsedResult: Omit<LinkPreviewResult, "url"> = { hasEmbed: false };

    try {
      const parsedTarget = new URL(normalized);
      const host = parsedTarget.hostname.toLowerCase().replace(/^www\./, "");

      // Rich YouTube oEmbed fast-path fallback if YouTube consent wall blocks raw HTML OG tags
      if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalized)}&format=json`;
        const ytResp = await fetch(oembedUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (ytResp && ytResp.ok) {
          const data = (await ytResp.json().catch(() => null)) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          } | null;
          if (data?.title) {
            parsedResult = {
              hasEmbed: true,
              title: data.title.slice(0, 180),
              description: data.author_name ? `Video by ${data.author_name}` : undefined,
              imageUrl: resolveMaybeRelativeUrl(data.thumbnail_url, normalized),
              siteName: "YouTube",
              themeColor: "#FF0033",
            };
          }
        }
      }

      if (!parsedResult.hasEmbed) {
        // For X/Twitter links, fxtwitter returns full OpenGraph tags cleanly
        const fetchUrl =
          (host === "x.com" || host === "twitter.com") && parsedTarget.pathname.includes("/status/")
            ? `https://api.fxtwitter.com${parsedTarget.pathname}`
            : normalized;

        if (fetchUrl.startsWith("https://api.fxtwitter.com/")) {
          const fxResp = await fetch(fetchUrl, {
            headers: { Accept: "application/json", "User-Agent": "JaTextLinkBot/1.0" },
            signal: AbortSignal.timeout(5500),
          }).catch(() => null);
          if (fxResp && fxResp.ok) {
            const fxJson = (await fxResp.json().catch(() => null)) as {
              tweet?: {
                text?: string;
                author?: { name?: string; screen_name?: string; avatar_url?: string };
                media?: { photos?: Array<{ url?: string }>; videos?: Array<{ thumbnail_url?: string }> };
              };
            } | null;
            const tweet = fxJson?.tweet;
            if (tweet) {
              const authorLabel = tweet.author?.name
                ? `${tweet.author.name} (@${tweet.author.screen_name ?? "x"})`
                : "Post on X";
              const mediaImg =
                tweet.media?.photos?.[0]?.url ||
                tweet.media?.videos?.[0]?.thumbnail_url ||
                undefined;
              parsedResult = {
                hasEmbed: true,
                title: authorLabel.slice(0, 180),
                description: tweet.text ? tweet.text.slice(0, 340) : undefined,
                imageUrl: resolveMaybeRelativeUrl(mediaImg, normalized),
                siteName: "X",
                themeColor: "#1D9BF0",
              };
            }
          }
        }
      }

      if (!parsedResult.hasEmbed) {
        const resp = await fetch(normalized, {
          method: "GET",
          redirect: "follow",
          headers: {
            // Discordbot-compatible UA so sites like Discord, GitHub, Reddit, Spotify serve full OG meta tags
            "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://jatext.vercel.app)",
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(6500),
        });

        const finalUrl = resp.url || normalized;
        const finalCheck = normalizeLookupUrl(finalUrl);
        if (resp.ok && finalCheck) {
          const contentType = (resp.headers.get("content-type") || "").toLowerCase();
          if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
            const reader = resp.body?.getReader();
            if (reader) {
              const chunks: Uint8Array[] = [];
              let total = 0;
              while (total < MAX_HTML_BYTES) {
                const { done, value } = await reader.read();
                if (done || !value) break;
                chunks.push(value);
                total += value.byteLength;
                // Stop early once </head> is reached to keep fetches super fast
                const partial = new TextDecoder("utf-8", { fatal: false }).decode(value);
                if (partial.toLowerCase().includes("</head>")) break;
              }
              await reader.cancel().catch(() => undefined);
              const merged = new Uint8Array(total);
              let offset = 0;
              for (const c of chunks) {
                merged.set(c, offset);
                offset += c.byteLength;
              }
              const html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
              parsedResult = parseOpenGraphFromHtml(html, finalCheck);
            }
          }
        }
      }
    } catch {
      parsedResult = { hasEmbed: false };
    }

    await ctx.runMutation(internal.linkPreview.writeCacheInternal, {
      url: normalized,
      hasEmbed: parsedResult.hasEmbed,
      title: parsedResult.title,
      description: parsedResult.description,
      imageUrl: parsedResult.imageUrl,
      siteName: parsedResult.siteName,
      themeColor: parsedResult.themeColor,
    });

    return {
      url: normalized,
      ...parsedResult,
    };
  },
});
