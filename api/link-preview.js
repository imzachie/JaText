const MAX_HTML_BYTES = 262_144;
const FETCH_TIMEOUT_MS = 5_500;

function isPrivateOrBlockedHostname(hostname) {
  const h = (hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
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
  if (h.includes(":")) {
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
      return true;
    }
  }
  return false;
}

function decodeHtmlEntities(input) {
  if (!input) return "";
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = Number.parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeColor(raw) {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed;
  return undefined;
}

function resolveMaybeRelativeUrl(candidate, baseUrl) {
  if (!candidate) return undefined;
  try {
    const resolved = new URL(candidate.trim(), baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
    if (isPrivateOrBlockedHostname(resolved.hostname)) return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function parseMetaTags(html) {
  const map = new Map();
  const tagRegex = /<meta\b[^>]*>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[0];
    const propMatch = /\b(?:property|name|itemprop)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const contentMatch = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const key = (propMatch?.[1] ?? propMatch?.[2] ?? propMatch?.[3] ?? "").trim().toLowerCase();
    const val = contentMatch?.[1] ?? contentMatch?.[2] ?? contentMatch?.[3] ?? "";
    if (key && val && !map.has(key)) {
      map.set(key, decodeHtmlEntities(val));
    }
  }
  const titleMatch = /<title[^>]*>([\s\S]{1,400}?)<\/title>/i.exec(html);
  const docTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : "";
  return { map, docTitle };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function trySpecialOEmbed(parsedUrl) {
  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const fullUrl = parsedUrl.toString();

  // Official JaText Web & Chat routes
  if (host === "jatext.vercel.app") {
    const isChats = parsedUrl.pathname.startsWith("/chats");
    return {
      url: fullUrl,
      hasEmbed: true,
      siteName: "JaText · Web & Android",
      title: isChats
        ? "Open JaText Chats — End-to-End Encrypted Messaging & HD Calls"
        : "JaText — Private End-to-End Encrypted Chat & HD Calls",
      description:
        "Zero-knowledge E2EE messaging (ECDH P-256 + AES-256-GCM) with 1:1 & mesh group voice/video calls, screen sharing with audio, custom illustrated chat bubbles, voice-note transcription, and instant multi-account switching.",
      imageUrl: "https://jatext.vercel.app/jatext-og-banner.jpg",
      themeColor: "#16A34A",
    };
  }

  // X / Twitter via fxtwitter JSON API
  if (host === "x.com" || host === "twitter.com") {
    const m = /^\/([^/]+)\/status\/(\d+)/.exec(parsedUrl.pathname);
    if (m) {
      try {
        const res = await fetchWithTimeout(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, {
          headers: { Accept: "application/json", "User-Agent": "JaTextLinkBot/1.0" },
        });
        if (res.ok) {
          const data = await res.json();
          const t = data?.tweet;
          if (t) {
            const author = t.author?.name
              ? `${t.author.name} (@${t.author.screen_name || m[1]})`
              : `@${m[1]}`;
            const photo = t.media?.photos?.[0]?.url || t.media?.videos?.[0]?.thumbnail_url || t.author?.avatar_url;
            return {
              url: fullUrl,
              hasEmbed: true,
              siteName: "X (Twitter)",
              title: author,
              description: typeof t.text === "string" ? t.text.slice(0, 320) : undefined,
              imageUrl: typeof photo === "string" ? photo : undefined,
              themeColor: "#1DA1F2",
            };
          }
        }
      } catch {
        // fall through
      }
    }
  }

  // YouTube oEmbed
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    try {
      const res = await fetchWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(fullUrl)}&format=json`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.title) {
          return {
            url: fullUrl,
            hasEmbed: true,
            siteName: data.author_name ? `YouTube · ${data.author_name}` : "YouTube",
            title: String(data.title).slice(0, 200),
            imageUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined,
            themeColor: "#FF0000",
          };
        }
      }
    } catch {
      // fall through
    }
  }

  // Spotify oEmbed
  if (host === "open.spotify.com") {
    try {
      const res = await fetchWithTimeout(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(fullUrl)}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.title) {
          return {
            url: fullUrl,
            hasEmbed: true,
            siteName: "Spotify",
            title: String(data.title).slice(0, 200),
            imageUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined,
            themeColor: "#1DB954",
          };
        }
      }
    } catch {
      // fall through
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const rawUrl = typeof req.query?.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl || rawUrl.length > 2048) {
    return res.status(200).json({ url: rawUrl, hasEmbed: false });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(200).json({ url: rawUrl, hasEmbed: false });
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    isPrivateOrBlockedHostname(parsed.hostname)
  ) {
    return res.status(200).json({ url: rawUrl, hasEmbed: false });
  }

  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");

  const special = await trySpecialOEmbed(parsed);
  if (special) {
    return res.status(200).json(special);
  }

  try {
    const response = await fetchWithTimeout(parsed.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Discordbot/2.0; +https://jatext.vercel.app)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return res.status(200).json({ url: rawUrl, hasEmbed: false });
    }

    const finalUrl = response.url || parsed.toString();
    try {
      const finalParsed = new URL(finalUrl);
      if (isPrivateOrBlockedHostname(finalParsed.hostname)) {
        return res.status(200).json({ url: rawUrl, hasEmbed: false });
      }
    } catch {
      return res.status(200).json({ url: rawUrl, hasEmbed: false });
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return res.status(200).json({ url: rawUrl, hasEmbed: false });
    }

    const reader = response.body?.getReader?.();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let received = 0;
      while (received < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (html.toLowerCase().includes("</head>")) break;
      }
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    } else {
      html = (await response.text()).slice(0, MAX_HTML_BYTES);
    }

    const { map, docTitle } = parseMetaTags(html);
    const title = (
      map.get("og:title") ||
      map.get("twitter:title") ||
      docTitle ||
      ""
    ).slice(0, 220);
    const description = (
      map.get("og:description") ||
      map.get("twitter:description") ||
      map.get("description") ||
      ""
    ).slice(0, 340);
    const rawImage =
      map.get("og:image") ||
      map.get("og:image:url") ||
      map.get("twitter:image") ||
      map.get("twitter:image:src");
    const imageUrl = resolveMaybeRelativeUrl(rawImage, finalUrl);
    const siteName = (map.get("og:site_name") || "").slice(0, 80) || undefined;
    const themeColor = sanitizeColor(map.get("theme-color"));

    if (!title && !imageUrl) {
      return res.status(200).json({ url: rawUrl, hasEmbed: false });
    }

    return res.status(200).json({
      url: finalUrl,
      hasEmbed: true,
      siteName,
      title: title || undefined,
      description: description || undefined,
      imageUrl,
      themeColor,
    });
  } catch {
    return res.status(200).json({ url: rawUrl, hasEmbed: false });
  }
}
