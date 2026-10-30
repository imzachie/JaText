import { getTursoConfig, handleTursoRpc, TursoAppError } from "../server/tursoBackend.js";

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
    const cfg = getTursoConfig();
    const googleConfigured = Boolean(
      (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
        (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET),
    );
    return res.status(200).json({
      ok: true,
      backend: "turso",
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
    const data = await handleTursoRpc(op, args, authHeader);
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    const status = err instanceof TursoAppError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Unexpected Turso server error.";
    return res.status(status).json({ ok: false, error: message });
  }
}
