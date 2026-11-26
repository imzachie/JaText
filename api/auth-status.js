import {
  getDb,
  getFcmStatus,
  getTursoConfig,
  isEmailVerificationRequired,
} from "../server/tursoBackend.js";
import { emailSenderConfig } from "../server/emailSender.js";
import { supabaseStorageConfig } from "../server/supabaseStorage.js";
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
  // Google sign-in is switched off (see api/oauth-google.js), so the status page has
  // to say false even while the old credentials are still sitting in the secret
  // store. Otherwise a reader sees "configured" and hunts for a bug that is not there.
  // The switch is on unless someone explicitly sets JATEXT_GOOGLE_DISABLED=0, which
  // is the same default api/oauth-google.js refuses on. Reading it the other way
  // round here would advertise a sign-in method the API has already turned away.
  const googleSignInEnabled = process.env.JATEXT_GOOGLE_DISABLED === "0";
  const googleConfigured =
    googleSignInEnabled &&
    Boolean(
      (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
        (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET),
    );
  const fcm = getFcmStatus();
  const fcmConfigured = fcm.configured;
  const klipyConfigured = Boolean(process.env.KLIPY_API_KEY);
  // Which way the bytes of an attachment travel. "supabase" means the file goes to
  // the Storage bucket and the database keeps only a pointer; "database" means the
  // old path, where every byte counted against the Postgres size limit.
  const storage = supabaseStorageConfig();

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
    fcmProjectId: fcm.projectId,
    klipyConfigured,
    emailVerificationRequired: isEmailVerificationRequired(),
    // Both halves of the switch, printed separately on purpose. The gate needs the flag
    // AND a usable mailer, so a status page that only said "required: true" would be
    // lying the moment someone sets the flag before the sender address is verified:
    // sign-up would quietly skip the code and the page would still read as if it were on.
    emailSenderConfigured: emailSenderConfig().enabled,
    emailSenderReason: emailSenderConfig().enabled ? "" : emailSenderConfig().reason,
    mediaStorage: storage.enabled ? "supabase" : "database",
    mediaBucket: storage.enabled ? storage.bucket : null,
    ...(dbError ? { error: dbError } : {}),
  });
}
