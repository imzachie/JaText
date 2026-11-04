/**
 * Klipy GIF search client.
 *
 * Klipy is the Tenor/GIPHY replacement used by the sticker and GIF picker.
 * It needs a single env var: KLIPY_API_KEY (free from https://partner.klipy.com).
 *
 * Without a key the picker used to render an empty grid with no explanation,
 * so every response carries `configured` and `error` all the way to the UI.
 */
const KLIPY_BASE = "https://api.klipy.com/v2";
const REQUEST_TIMEOUT_MS = 8000;

export function getKlipyStatus() {
  const key = (process.env.KLIPY_API_KEY || "").trim();
  return { configured: Boolean(key) };
}

export async function searchKlipyGifs(query, options = {}) {
  const apiKey = (process.env.KLIPY_API_KEY || "").trim();
  if (!apiKey) {
    return {
      results: [],
      configured: false,
      error: "The GIF picker is not set up on this server yet (KLIPY_API_KEY is missing).",
    };
  }

  const limit = Math.max(1, Math.min(48, Number(options.limit) || 24));
  const params = new URLSearchParams({
    key: apiKey,
    client_key: "jatext",
    limit: String(limit),
    media_filter: "gif,tinygif,mediumgif",
    locale: "en_US",
    contentfilter: "high",
  });
  const trimmed = String(query || "").trim();
  if (trimmed) params.set("q", trimmed.slice(0, 100));
  const endpoint = trimmed ? "search" : "featured";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${KLIPY_BASE}/${endpoint}?${params}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      results: [],
      configured: true,
      error: timedOut
        ? `Klipy did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach Klipy: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 160);
    } catch {
      detail = "";
    }
    return {
      results: [],
      configured: true,
      error: `Klipy returned HTTP ${response.status}${detail ? ` - ${detail}` : ""}. The API key may be wrong, inactive, or not approved for production.`,
    };
  }

  const payload = await response.json().catch(() => null);
  const items = Array.isArray(payload?.results) ? payload.results : [];
  const results = items.flatMap((item) => {
    const formats = item?.media_formats;
    const url = formats?.mediumgif?.url || formats?.gif?.url;
    const previewUrl = formats?.tinygif?.url || formats?.gif?.url;
    if (!url || !previewUrl) return [];
    return [
      {
        key: item.id !== undefined ? `klipy:${item.id}` : `klipy:${url}`,
        url,
        previewUrl,
        name: String(item.title || item.content_description || item.slug || "GIF").trim(),
        mediaType: "gif",
        source: "klipy",
        isFavorite: false,
        useCount: 0,
      },
    ];
  });

  return {
    results,
    configured: true,
    error: results.length ? null : "Klipy returned no GIFs for this search.",
  };
}
