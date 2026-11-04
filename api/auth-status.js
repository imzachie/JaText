import { getDb, getTursoConfig } from "../server/tursoBackend.js";
import { enforceHttpRateLimit } from "../server/rateLimiter.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (enforceHttpRateLimit(req, res, { scope: "auth_status", limit: 60, windowMs: 60_000 })) {
    return;
  }

  const cfg = getTursoConfig();
  const googleConfigured = Boolean(
    (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
      (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET),
  );
  const fcmConfigured = Boolean(process.env.FCM_SERVICE_ACCOUNT_JSON);
  const klipyConfigured = Boolean(process.env.KLIPY_API_KEY);

  let dbConnected = false;
  let userCount = null;
  let dbError = null;

  if (cfg.configured) {
    try {
      const db = await getDb();
      const countRes = await db.execute(`SELECT COUNT(*) AS cnt FROM users`);
      dbConnected = true;
      userCount = Number(countRes.rows[0]?.cnt ?? 0);
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  } else {
    dbError =
      "Missing DATABASE_URL (PostgreSQL) or POSTGRES_BRIDGE_URL + POSTGRES_BRIDGE_SECRET in Environment Variables.";
  }

  let dbHost = null;
  if (cfg.url) {
    try {
      dbHost = cfg.url.startsWith("file:")
        ? "local-sqlite-file"
        : new URL(cfg.url.replace(/^libsql:\/\//, "https://")).host;
    } catch {
      dbHost = "configured";
    }
  }

  return res.status(200).json({
    ok: cfg.configured && dbConnected,
    backend: "turso",
    engine: cfg.engine || "postgresql",
    mode: cfg.mode || "postgres",
    tursoConfigured: cfg.configured,
    tursoHost: dbHost,
    dbHost,
    dbConnected,
    userCount,
    googleConfigured,
    fcmConfigured,
    klipyConfigured,
    ...(dbError ? { error: dbError } : {}),
  });
}
