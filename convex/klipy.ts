import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action, env } from "./_generated/server";

interface KlipyResult {
  id?: string | number;
  slug?: string;
  title?: string;
  content_description?: string;
  media_formats?: {
    tinygif?: { url?: string };
    mediumgif?: { url?: string };
    gif?: { url?: string };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mediaUrl(
  formats: KlipyResult["media_formats"],
  preferred: "tinygif" | "mediumgif",
): string | undefined {
  return formats?.[preferred]?.url ?? formats?.gif?.url;
}

export const search = action({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    if (!(await getAuthUserId(ctx))) throw new Error("Please sign in to search GIFs.");
    const apiKey = env.KLIPY_API_KEY;
    if (!apiKey) throw new Error("Klipy search is not set up yet.");

    const params = new URLSearchParams({
      key: apiKey,
      limit: "24",
      media_filter: "tinygif,mediumgif",
      locale: "en_US",
      contentfilter: "high",
    });
    if (query.trim()) params.set("q", query.trim().slice(0, 100));

    const endpoint = query.trim() ? "search" : "featured";
    const response = await fetch(`https://api.klipy.com/v2/${endpoint}?${params}`);
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      const encodedApiKey = encodeURIComponent(apiKey);
      const safeBody = body
        .replaceAll(apiKey, "[redacted]")
        .replaceAll(encodedApiKey, "[redacted]");
      console.error(
        "Klipy search failed:",
        endpoint,
        response.status,
        response.statusText,
        safeBody,
      );
      if (/provided API key is invalid/i.test(safeBody)) {
        throw new ConvexError("Klipy rejected the API key. Replace KLIPY_API_KEY in Convex.");
      }
      throw new Error("GIF search is temporarily unavailable. Please try again.");
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.results)) {
      throw new Error("GIF search returned an unexpected response.");
    }

    return (payload.results as unknown[])
      .flatMap((item) => {
        if (!isRecord(item)) return [];
        const formats = item.media_formats as KlipyResult["media_formats"];
        const result = item as KlipyResult;
        const url = mediaUrl(formats, "mediumgif");
        const previewUrl = mediaUrl(formats, "tinygif");
        if (!url || !previewUrl) return [];
        const key = result.id !== undefined ? `klipy:${result.id}` : `klipy:${url}`;
        return [{
          key,
          url,
          previewUrl,
          name:
            result.title?.trim() ||
            result.content_description?.trim() ||
            result.slug?.trim() ||
            "Klipy GIF",
          mediaType: "gif" as const,
          source: "klipy" as const,
        }];
      });
  },
});
