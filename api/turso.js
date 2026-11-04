import { getTursoConfig, handleTursoRpc, TursoAppError } from "../server/tursoBackend.js";
import { enforceHttpRateLimit, resolveRpcRateTier } from "../server/rateLimiter.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-JaText-Filename, X-JaText-Mime",
  );
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    if (enforceHttpRateLimit(req, res, { scope: "turso_health", limit: 60 })) {
      return;
    }
    const cfg = getTursoConfig();
    const googleConfigured = Boolean(
      (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
        (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET),
    );
    return res.status(200).json({
      ok: true,
      backend: "turso",
      engine: cfg.engine || "postgresql",
      mode: cfg.mode || "postgres",
      tursoConfigured: cfg.configured,
      googleConfigured,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body && typeof req.body === "object"
          ? req.body
          : {};
    const op = String(body.op || "");
    const args = body.args && typeof body.args === "object" ? body.args : {};
    const authHeader = String(req.headers.authorization || "");
    const { tier, limit, windowMs } = resolveRpcRateTier(op);
    const tokenSubject = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7, 39)
      : "";
    if (
      enforceHttpRateLimit(req, res, {
        scope: `rpc:${tier}`,
        limit,
        windowMs,
        subject: tokenSubject,
      })
    ) {
      return;
    }
    const data = await handleTursoRpc(op, args, authHeader);
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    const status = err instanceof TursoAppError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Unexpected Turso server error.";
    return res.status(status).json({ ok: false, error: message });
  }
}
