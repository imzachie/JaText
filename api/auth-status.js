import { getDb, getTursoConfig } from "../server/tursoBackend.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
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
    dbError = "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in Vercel Environment Variables.";
  }

  let tursoHost = null;
  if (cfg.url) {
    try {
      tursoHost = cfg.url.startsWith("file:")
        ? "local-sqlite-file"
        : new URL(cfg.url.replace(/^libsql:\/\//, "https://")).host;
    } catch {
      tursoHost = "configured";
    }
  }

  return res.status(200).json({
    ok: cfg.configured && dbConnected,
    backend: "turso",
    tursoConfigured: cfg.configured,
    tursoHost,
    dbConnected,
    userCount,
    googleConfigured,
    fcmConfigured,
    klipyConfigured,
    ...(dbError ? { error: dbError } : {}),
  });
}
