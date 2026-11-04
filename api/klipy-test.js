import { getKlipyStatus, searchKlipyGifs } from "../server/klipyClient.js";
import { verifyAuthToken } from "../server/tursoBackend.js";
import { enforceHttpRateLimit } from "../server/rateLimiter.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/**
 * GET  -> reports whether a Klipy API key exists (never touches Klipy, no quota used)
 * POST -> runs one real search against Klipy and reports what came back, so a
 *         self-hoster can tell "no key" apart from "key rejected" in one command
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  res.setHeader("Cache-Control", "no-store");
  if (enforceHttpRateLimit(req, res, { scope: "klipy_test", limit: 20, windowMs: 60_000 })) {
    return;
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      ...getKlipyStatus(),
      usage:
        "POST with an Authorization: Bearer <JaText token> header to run a real Klipy search.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Missing Authorization: Bearer <token>" });
  }
  const session = verifyAuthToken(authHeader.slice(7).trim());
  if (!String(session?.userId || "")) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }

  let query = "";
  try {
    const url = new URL(req.url || "/", "http://localhost");
    query = String(url.searchParams.get("q") || "").slice(0, 100);
  } catch {
    query = "";
  }

  const result = await searchKlipyGifs(query, { limit: 6 });
  return res.status(result.configured && !result.error ? 200 : 400).json({
    ok: Boolean(result.configured && !result.error),
    query: query || "(trending)",
    configured: result.configured,
    error: result.error,
    count: result.results.length,
    sample: result.results.slice(0, 3).map((item) => ({ name: item.name, url: item.url })),
  });
}
