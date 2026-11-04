import { getFcmStatus, sendDiagnosticPush, verifyAuthToken } from "../server/tursoBackend.js";
import { enforceHttpRateLimit } from "../server/rateLimiter.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/**
 * GET  -> reports whether the server can send push (no auth needed, no secrets leaked)
 * POST -> sends one test push to every Android device signed in as the caller
 *
 * Self-hosters use this to prove the Firebase credential is correct without
 * waiting for a real message:
 *   curl -X POST -H "Authorization: Bearer <token>" https://<domain>/api/push-test
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  res.setHeader("Cache-Control", "no-store");
  if (enforceHttpRateLimit(req, res, { scope: "push_test", limit: 20, windowMs: 60_000 })) {
    return;
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      ...getFcmStatus(),
      usage: "POST with an Authorization: Bearer <JaText token> header to send a test push.",
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
  const userId = String(session?.userId || "");
  if (!userId) {
    return res.status(401).json({ ok: false, error: "Invalid or expired token" });
  }

  let options = {};
  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body && typeof req.body === "object"
          ? req.body
          : {};
    options = body && typeof body === "object" ? body : {};
  } catch {
    options = {};
  }

  const result = await sendDiagnosticPush(userId, {
    title: options.title ? String(options.title).slice(0, 120) : undefined,
    body: options.body ? String(options.body).slice(0, 300) : undefined,
  });
  return res.status(result.ok ? 200 : 400).json(result);
}
