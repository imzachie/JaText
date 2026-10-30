import { getDb, newId, TursoAppError, verifyAuthToken } from "../server/tursoBackend.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BYTES = 4_300_000; // ~4.3 MB within Vercel Hobby 4.5 MB payload cap

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-JaText-Filename, X-JaText-Mime",
  );
}

function readRawBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_BYTES) {
        reject(new TursoAppError("File exceeds 4.2 MB upload limit.", 413));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function resolvePublicOrigin(req) {
  const explicit = (process.env.PUBLIC_APP_ORIGIN || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "jatext.vercel.app")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const db = await getDb();

    if (req.method === "GET") {
      const id = String(req.query?.id || "").trim();
      if (!id) {
        return res.status(400).json({ ok: false, error: "Missing media id." });
      }
      const rowRes = await db.execute({
        sql: `SELECT mime_type, file_name, byte_size, data FROM media_blobs WHERE id = ? LIMIT 1`,
        args: [id],
      });
      if (!rowRes.rows.length) {
        return res.status(404).json({ ok: false, error: "Media not found." });
      }
      const row = rowRes.rows[0];
      const rawData = row.data;
      const buf = Buffer.isBuffer(rawData)
        ? rawData
        : rawData instanceof ArrayBuffer
          ? Buffer.from(rawData)
          : ArrayBuffer.isView(rawData)
            ? Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength)
            : Buffer.from(String(rawData || ""), "base64");

      const mime = String(row.mime_type || "application/octet-stream");
      const safeName = String(row.file_name || "file").replace(/[^\w.\- ()]/g, "_");
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Length", String(buf.length));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      return res.status(200).send(buf);
    }

    if (req.method === "POST") {
      const authHeader = String(req.headers.authorization || "");
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const auth = verifyAuthToken(token);
      if (!auth?.userId) {
        return res.status(401).json({ ok: false, error: "Please sign in before uploading files." });
      }

      const buf = await readRawBuffer(req);
      if (!buf.length) {
        return res.status(400).json({ ok: false, error: "Uploaded file is empty." });
      }

      const mimeType = String(
        req.headers["x-jatext-mime"] || req.headers["content-type"] || "application/octet-stream",
      )
        .split(";")[0]
        .trim()
        .slice(0, 120);
      const rawFilename = String(req.headers["x-jatext-filename"] || "attachment");
      let fileName = "attachment";
      try {
        fileName = decodeURIComponent(rawFilename).slice(0, 160);
      } catch {
        fileName = rawFilename.slice(0, 160);
      }

      const id = newId();
      await db.execute({
        sql: `INSERT INTO media_blobs (id, owner_id, mime_type, file_name, byte_size, data, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [id, auth.userId, mimeType, fileName, buf.length, buf, Date.now()],
      });

      const origin = resolvePublicOrigin(req);
      return res.status(200).json({
        ok: true,
        id,
        url: `${origin}/api/media?id=${id}`,
      });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    const status = err instanceof TursoAppError ? err.status : 500;
    return res.status(status).json({
      ok: false,
      error: err instanceof Error ? err.message : "Media request failed.",
    });
  }
}
