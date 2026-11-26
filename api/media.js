import { getDb, newId, TursoAppError, verifyAuthToken } from "../server/tursoBackend.js";
import { enforceHttpRateLimit } from "../server/rateLimiter.js";
import {
  fetchObjectSlice,
  isSupabaseStorageEnabled,
  publicObjectUrl,
  uploadObject,
} from "../server/supabaseStorage.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export const MEDIA_CHUNK_BYTES = 768 * 1024; // 768 KB per DB chunk
const DEFAULT_PUBLIC_HOST = (process.env.PUBLIC_APP_ORIGIN || "https://jatextapp.pages.dev")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const MAX_SINGLE_SHOT_BYTES = 768 * 1024; // > 768 KB splits into media_chunks
const MAX_SERVE_BYTES = 3 * 1024 * 1024; // 3 MB max per HTTP Range slice (< Vercel 4.5 MB cap)
const MAX_INLINE_IMAGE_SERVE_BYTES = 4 * 1024 * 1024; // 4 MB max full 200 OK image (< Vercel 4.5 MB cap)
// Attachments arrive in 768 KB chunks and are written a chunk at a time, so
// the ceiling is about willingness rather than memory. It is still one file
// per upload, and every chunk is a separate request, so a very large file
// takes a while rather than taking the server down.
const MAX_TOTAL_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB max attachment
// How much of one file the API is willing to hold in memory at once to hand to
// Supabase Storage. An object this size moves out of the database and is then
// served by Storage directly; anything larger keeps flowing through media_chunks
// one 768 KB request at a time, because buffering a whole video here to save the
// row is how an edge function runs out of memory. A request that assembles 16 MB
// twice over (the slice, then the upload body) still leaves the isolate headroom
// for a second concurrent upload.
const MEDIA_STORAGE_MAX_BYTES = 16 * 1024 * 1024;

function mediaObjectPath(ownerId, mediaId) {
  return `${String(ownerId || "anon").replace(/[^\w-]/g, "_")}/${mediaId}`;
}

const NETSCAPE_INFINITE_LOOP_EXT = Buffer.from([
  0x21, 0xff, 0x0b,
  0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
  0x03, 0x01, 0x00, 0x00, 0x00,
]);

function ensureInfiniteLoopGifBuffer(buf) {
  if (!buf || buf.length < 14) return buf;
  if (
    buf[0] !== 0x47 ||
    buf[1] !== 0x49 ||
    buf[2] !== 0x46 ||
    buf[3] !== 0x38 ||
    (buf[4] !== 0x37 && buf[4] !== 0x39) ||
    buf[5] !== 0x61
  ) {
    return buf;
  }

  // Scan for existing NETSCAPE2.0 / ANIMEXTS1.0 loop block and force loopCount = 0 (infinite)
  const limit = Math.min(buf.length - 19, 65536);
  for (let i = 13; i <= limit; i++) {
    if (
      buf[i] === 0x21 &&
      buf[i + 1] === 0xff &&
      buf[i + 2] === 0x0b &&
      buf[i + 14] === 0x03 &&
      buf[i + 15] === 0x01
    ) {
      const sig = buf.subarray(i + 3, i + 14).toString("ascii");
      if (sig === "NETSCAPE2.0" || sig === "ANIMEXTS1.0") {
        if (buf[i + 16] === 0x00 && buf[i + 17] === 0x00) {
          return buf;
        }
        const copy = Buffer.from(buf);
        copy[4] = 0x39; // Ensure GIF89a header
        copy[i + 16] = 0x00;
        copy[i + 17] = 0x00;
        return copy;
      }
    }
  }

  // Insert NETSCAPE2.0 infinite loop block right after Logical Screen Descriptor + Global Color Table
  const packed = buf[10];
  const hasGct = (packed & 0x80) !== 0;
  const gctSize = hasGct ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  const insertOffset = 13 + gctSize;
  if (insertOffset > buf.length) return buf;

  const out = Buffer.concat([
    buf.subarray(0, insertOffset),
    NETSCAPE_INFINITE_LOOP_EXT,
    buf.subarray(insertOffset),
  ]);
  out[4] = 0x39; // Ensure GIF89a
  return out;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Range, X-JaText-Filename, X-JaText-Name, X-JaText-Mime, X-JaText-Chunk-Index",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Range, Content-Length, X-JaText-Total-Size",
  );
}

function readRawBuffer(req, maxBytes = 4_300_000) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > maxBytes) {
        reject(new TursoAppError("Payload exceeds chunk size limit.", 413));
        return;
      }
      resolve(req.body);
      return;
    }
    if (req.body && typeof req.body === "object") {
      resolve(Buffer.from(JSON.stringify(req.body), "utf8"));
      return;
    }
    if (typeof req.body === "string") {
      resolve(Buffer.from(req.body, "utf8"));
      return;
    }
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        reject(new TursoAppError("Payload exceeds chunk size limit.", 413));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function toBuffer(rawData) {
  if (!rawData) return Buffer.alloc(0);
  if (Buffer.isBuffer(rawData)) return rawData;
  if (rawData instanceof ArrayBuffer) return Buffer.from(rawData);
  if (ArrayBuffer.isView(rawData)) {
    return Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength);
  }
  return Buffer.from(String(rawData || ""), "base64");
}

function resolvePublicOrigin(req) {
  const explicit = (process.env.PUBLIC_APP_ORIGIN || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || DEFAULT_PUBLIC_HOST)
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

function parseHttpRange(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== "string" || totalSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  let start = 0;
  let end = totalSize - 1;
  if (startStr === "" && endStr !== "") {
    const suffixLen = Number(endStr);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return null;
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else if (startStr !== "") {
    start = Number(startStr);
    if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
      return { unsatisfiable: true };
    }
    if (endStr !== "") {
      const parsedEnd = Number(endStr);
      if (!Number.isFinite(parsedEnd) || parsedEnd < start) return null;
      end = Math.min(totalSize - 1, parsedEnd);
    }
  } else {
    return null;
  }
  if (end - start + 1 > MAX_SERVE_BYTES) {
    end = start + MAX_SERVE_BYTES - 1;
  }
  return { start, end };
}

async function readChunkedSlice(db, mediaId, start, end, chunkSize = MEDIA_CHUNK_BYTES) {
  const firstChunk = Math.floor(start / chunkSize);
  const lastChunk = Math.floor(end / chunkSize);
  const res = await db.execute({
    sql: `SELECT chunk_index, data
          FROM media_chunks
          WHERE media_id = ? AND chunk_index >= ? AND chunk_index <= ?
          ORDER BY chunk_index ASC`,
    args: [mediaId, firstChunk, lastChunk],
  });
  if (!res.rows || res.rows.length === 0) {
    return null;
  }
  const buffers = new Map();
  for (const r of res.rows) {
    buffers.set(Number(r.chunk_index), toBuffer(r.data));
  }
  const outLen = end - start + 1;
  const out = Buffer.allocUnsafe(outLen);
  let written = 0;
  for (let idx = firstChunk; idx <= lastChunk; idx++) {
    const cBuf = buffers.get(idx);
    if (!cBuf) {
      throw new TursoAppError(`Incomplete media upload (missing chunk ${idx}).`, 404);
    }
    const chunkByteStart = idx * chunkSize;
    const sliceStart = Math.max(0, start - chunkByteStart);
    const sliceEnd = Math.min(cBuf.length, end - chunkByteStart + 1);
    if (sliceEnd > sliceStart) {
      cBuf.copy(out, written, sliceStart, sliceEnd);
      written += sliceEnd - sliceStart;
    }
  }
  return written === outLen ? out : out.subarray(0, written);
}

/**
 * Assemble a finished chunked upload, hand it to Storage, then throw the chunks
 * away. Only files up to MEDIA_STORAGE_MAX_BYTES are promoted, and failures leave
 * media_chunks exactly as they were, so the attachment still works.
 */
async function promoteChunksToStorage(db, mediaId, ownerId) {
  const metaRes = await db.execute({
    sql: `SELECT byte_size, mime_type, chunk_count, storage_key FROM media_blobs WHERE id = ? LIMIT 1`,
    args: [mediaId],
  });
  const meta = metaRes.rows[0];
  if (!meta || String(meta.storage_key || "").trim()) return false;
  const totalSize = Number(meta.byte_size || 0);
  if (!totalSize || totalSize > MEDIA_STORAGE_MAX_BYTES) return false;

  const assembled = await readChunkedSlice(db, mediaId, 0, totalSize - 1, MEDIA_CHUNK_BYTES);
  if (!assembled || assembled.length !== totalSize) return false;

  let bytes = assembled;
  const mime = String(meta.mime_type || "application/octet-stream");
  if (mime === "image/gif") {
    bytes = Buffer.from(ensureInfiniteLoopGifBuffer(assembled));
  }

  const key = mediaObjectPath(ownerId, mediaId);
  await uploadObject(key, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), mime);
  await db.batch(
    [
      {
        sql: `UPDATE media_blobs SET storage_key = ?, chunk_count = 0, data = ? WHERE id = ?`,
        args: [key, new Uint8Array(0), mediaId],
      },
      { sql: `DELETE FROM media_chunks WHERE media_id = ?`, args: [mediaId] },
    ],
    "write",
  );
  return true;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const isReadMethod = req.method === "GET" || req.method === "HEAD";
  if (
    enforceHttpRateLimit(req, res, {
      scope: isReadMethod ? "media_read" : "media_upload",
      limit: isReadMethod ? 600 : 160,
      windowMs: 60_000,
    })
  ) {
    return;
  }

  try {
    const db = await getDb();
    const urlObj = new URL(req.url || "/api/media", "http://localhost");

    if (req.method === "GET" || req.method === "HEAD") {
      const id = String(req.query?.id || urlObj.searchParams.get("id") || "").trim();
      if (!id) {
        return res.status(400).json({ ok: false, error: "Missing media id." });
      }
      const rowRes = await db.execute({
        sql: `SELECT mime_type, file_name, byte_size, chunk_count, storage_key,
                     CASE WHEN COALESCE(chunk_count, 0) = 0 THEN data ELSE NULL END AS inline_data
              FROM media_blobs
              WHERE id = ?
              LIMIT 1`,
        args: [id],
      });
      if (!rowRes.rows.length) {
        return res.status(404).json({ ok: false, error: "Media not found." });
      }
      const row = rowRes.rows[0];
      const mime = String(row.mime_type || "application/octet-stream");
      const safeName = String(row.file_name || "file").replace(/[^\w.\- ()]/g, "_");
      const totalSize = Number(row.byte_size || 0);
      const chunkCount = Number(row.chunk_count || 0);

      // The row is the only thing the database has to answer for: the bytes live in
      // Supabase Storage, which serves them (including Range requests for seeking in
      // video) far better than this function can. Clients keep using the same
      // /api/media?id= URL they always stored, so nothing on a phone or in a browser
      // needs to change.
      const storedKey = String(row.storage_key || "").trim();
      const storagePublicUrl = storedKey ? publicObjectUrl(storedKey) : "";
      if (storedKey && !storagePublicUrl) {
        // The bytes are known to be in the bucket but this server cannot name the
        // project they live in. An empty 200 would look like a broken thumbnail for
        // ever in a cached view; this says what to fix.
        return res.status(503).json({
          ok: false,
          error: "This attachment is in Supabase Storage, but the API has no storage credentials. Set SUPABASE_SERVICE_ROLE_KEY.",
        });
      }
      if (storagePublicUrl) {
        res.setHeader("Content-Type", mime);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("X-JaText-Total-Size", String(totalSize));
        res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
        if (req.method === "HEAD") {
          // Metadata only, answered from the row: the app's video previewer probes
          // HEAD for X-JaText-Total-Size and a redirect would hide that header.
          res.setHeader("Content-Length", String(totalSize));
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return res.status(200).end();
        }
        const storedRange = parseHttpRange(req.headers.range || req.headers.Range, totalSize);
        if (storedRange?.unsatisfiable) {
          res.setHeader("Content-Range", `bytes */${totalSize}`);
          return res.status(416).end();
        }
        if (storedRange) {
          const slice = await fetchObjectSlice(storedKey, storedRange.start, storedRange.end);
          res.setHeader("Content-Range", `bytes ${storedRange.start}-${storedRange.start + slice.length - 1}/${totalSize}`);
          res.setHeader("Content-Length", String(slice.length));
          return res.status(206).send(slice);
        }
        // No explicit range: send the browser or phone straight to Storage so the
        // file never passes through this function at all.
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("Location", storagePublicUrl);
        return res.status(302).end();
      }

      res.setHeader("Content-Type", mime);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("X-JaText-Total-Size", String(totalSize));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);

      if (req.method === "HEAD") {
        res.setHeader("Content-Length", String(totalSize));
        return res.status(200).end();
      }

      const rangeHeader = req.headers.range || req.headers.Range;
      const parsedRange = parseHttpRange(rangeHeader, totalSize);
      if (parsedRange?.unsatisfiable) {
        res.setHeader("Content-Range", `bytes */${totalSize}`);
        return res.status(416).end();
      }

      const isImageMedia = mime.startsWith("image/");
      const maxFullServe = isImageMedia ? MAX_INLINE_IMAGE_SERVE_BYTES : MAX_SERVE_BYTES;

      if (parsedRange || totalSize > maxFullServe) {
        const start = parsedRange ? parsedRange.start : 0;
        const end = parsedRange
          ? parsedRange.end
          : Math.min(totalSize - 1, MAX_SERVE_BYTES - 1);

        let sliceBuf;
        if (chunkCount > 0) {
          sliceBuf = await readChunkedSlice(db, id, start, end, MEDIA_CHUNK_BYTES);
          if (!sliceBuf) {
            return res.status(404).json({ ok: false, error: "Media chunks not found." });
          }
        } else {
          const fullBuf = toBuffer(row.inline_data);
          sliceBuf = fullBuf.subarray(start, Math.min(fullBuf.length, end + 1));
        }

        res.setHeader("Content-Range", `bytes ${start}-${start + sliceBuf.length - 1}/${totalSize}`);
        res.setHeader("Content-Length", String(sliceBuf.length));
        return res.status(206).send(sliceBuf);
      }

      let buf;
      if (chunkCount > 0) {
        buf =
          totalSize > 0
            ? await readChunkedSlice(db, id, 0, totalSize - 1, MEDIA_CHUNK_BYTES)
            : Buffer.alloc(0);
        if (!buf) {
          return res.status(404).json({ ok: false, error: "Media chunks not found." });
        }
      } else {
        buf = toBuffer(row.inline_data);
      }

      if (mime === "image/gif" || (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)) {
        buf = ensureInfiniteLoopGifBuffer(buf);
        res.setHeader("Content-Type", "image/gif");
      }

      res.setHeader("Content-Length", String(buf.length));
      return res.status(200).send(buf);
    }

    if (req.method === "POST") {
      const authHeader = String(req.headers.authorization || "");
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const auth = verifyAuthToken(token);
      if (!auth?.userId) {
        return res.status(401).json({ ok: false, error: "Please sign in before uploading files." });
      }
      if (auth.linkedDeviceId) {
        const devCheck = await db.execute({
          sql: `SELECT id FROM linked_devices WHERE id = ? AND user_id = ? LIMIT 1`,
          args: [auth.linkedDeviceId, auth.userId],
        });
        if (!devCheck.rows.length) {
          return res.status(401).json({ ok: false, error: "This linked device was disconnected." });
        }
      }

      const action = String(req.query?.action || urlObj.searchParams.get("action") || "").trim();
      const origin = resolvePublicOrigin(req);

      // 1. Initialize multi-chunk upload for video / audio / large files (up to 5 GB)
      if (action === "init") {
        const raw = await readRawBuffer(req, 64 * 1024);
        const parsed = JSON.parse(raw.toString("utf8") || "{}");
        const byteSize = Number(parsed.byteSize || 0);
        if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_TOTAL_UPLOAD_BYTES) {
          return res.status(413).json({
            ok: false,
            error: "Attachment exceeds the 5 GB maximum upload size.",
          });
        }
        const mimeType = String(parsed.mimeType || "application/octet-stream")
          .split(";")[0]
          .trim()
          .slice(0, 120);
        const fileName = String(parsed.fileName || "attachment").slice(0, 160);
        const expectedChunks = Math.max(1, Math.ceil(byteSize / MEDIA_CHUNK_BYTES));
        const chunkCount = Number(parsed.chunkCount || expectedChunks);
        if (chunkCount < 1 || chunkCount > Math.ceil(MAX_TOTAL_UPLOAD_BYTES / MEDIA_CHUNK_BYTES) + 2) {
          return res.status(400).json({ ok: false, error: "Invalid chunk count." });
        }

        const id = newId();
        await db.execute({
          sql: `INSERT INTO media_blobs (
                  id, owner_id, mime_type, file_name, byte_size, chunk_count, data, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            auth.userId,
            mimeType,
            fileName,
            byteSize,
            chunkCount,
            new Uint8Array(0),
            Date.now(),
          ],
        });

        return res.status(200).json({
          ok: true,
          id,
          storageId: id,
          url: `${origin}/api/media?id=${id}&sz=${byteSize}`,
          size: byteSize,
          chunkSize: MEDIA_CHUNK_BYTES,
          chunkCount,
        });
      }

      // 2. Upload an individual 768 KB binary chunk
      if (action === "chunk") {
        const mediaId = String(req.query?.id || urlObj.searchParams.get("id") || "").trim();
        const chunkIndex = Number(
          req.query?.index ??
            urlObj.searchParams.get("index") ??
            req.headers["x-jatext-chunk-index"] ??
            -1,
        );
        if (!mediaId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
          return res.status(400).json({ ok: false, error: "Invalid chunk parameters." });
        }

        const ownerRes = await db.execute({
          sql: `SELECT owner_id, chunk_count FROM media_blobs WHERE id = ? LIMIT 1`,
          args: [mediaId],
        });
        const meta = ownerRes.rows[0];
        if (!meta) {
          return res.status(404).json({ ok: false, error: "Upload session not found." });
        }
        if (String(meta.owner_id) !== String(auth.userId)) {
          return res.status(403).json({ ok: false, error: "Forbidden." });
        }
        if (chunkIndex >= Number(meta.chunk_count || 0)) {
          return res.status(400).json({ ok: false, error: "Chunk index out of bounds." });
        }

        const buf = await readRawBuffer(req, MEDIA_CHUNK_BYTES + 64 * 1024);
        if (!buf.length) {
          return res.status(400).json({ ok: false, error: "Uploaded chunk is empty." });
        }

        await db.execute({
          sql: `INSERT OR REPLACE INTO media_chunks (media_id, chunk_index, data)
                VALUES (?, ?, ?)`,
          args: [
            mediaId,
            chunkIndex,
            new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
          ],
        });

        // The upload is complete, so give the finished file to Storage and drop the
        // rows it was assembled from. Without this, a video would sit in
        // media_chunks forever and every seek would cost three queries.
        let promoted = false;
        if (
          isSupabaseStorageEnabled() &&
          Number(meta.chunk_count || 0) > 0 &&
          chunkIndex === Number(meta.chunk_count || 0) - 1
        ) {
          promoted = await promoteChunksToStorage(db, mediaId, auth.userId).catch((err) => {
            console.error("[JaText] could not move the finished upload to Storage:", err?.message || err);
            return false;
          });
        }

        return res.status(200).json({
          ok: true,
          id: mediaId,
          index: chunkIndex,
          bytes: buf.length,
          ...(promoted ? { storage: "supabase" } : {}),
        });
      }

      // 3. Single-shot upload for compact attachments (<= 4.2 MB)
      const contentType = String(req.headers["content-type"] || "application/octet-stream");
      let buf = await readRawBuffer(req, 4_300_000);
      let mimeType = String(
        req.headers["x-jatext-mime"] || contentType || "application/octet-stream",
      )
        .split(";")[0]
        .trim()
        .slice(0, 120);
      const rawFilename = String(
        req.headers["x-jatext-filename"] || req.headers["x-jatext-name"] || "attachment",
      );
      let fileName = "attachment";
      try {
        fileName = decodeURIComponent(rawFilename).slice(0, 160);
      } catch {
        fileName = rawFilename.slice(0, 160);
      }

      if (contentType.includes("application/json")) {
        const parsed = JSON.parse(buf.toString("utf8"));
        if (!parsed?.base64) {
          return res.status(400).json({ ok: false, error: "Missing base64 media data." });
        }
        buf = Buffer.from(String(parsed.base64), "base64");
        mimeType = String(parsed.mimeType || mimeType || "application/octet-stream")
          .split(";")[0]
          .trim()
          .slice(0, 120);
        fileName = String(parsed.fileName || fileName || "attachment").slice(0, 160);
      }

      if (!buf.length) {
        return res.status(400).json({ ok: false, error: "Uploaded file is empty." });
      }

      const id = newId();
      const now = Date.now();

      if (buf.length <= MEDIA_STORAGE_MAX_BYTES && isSupabaseStorageEnabled()) {
        // Same GIF repair as the served-by-database path, applied before upload so
        // a looping sticker stays looping when Storage answers the request itself.
        if (mimeType === "image/gif") buf = ensureInfiniteLoopGifBuffer(buf);
        const key = mediaObjectPath(auth.userId, id);
        try {
          await uploadObject(key, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), mimeType);
          await db.execute({
            sql: `INSERT INTO media_blobs (
                    id, owner_id, mime_type, file_name, byte_size, chunk_count, data, storage_key, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              auth.userId,
              mimeType,
              fileName,
              buf.length,
              0,
              new Uint8Array(0),
              key,
              now,
            ],
          });
          return res.status(200).json({
            ok: true,
            id,
            storageId: id,
            url: `${origin}/api/media?id=${id}&sz=${buf.length}`,
            storage: "supabase",
          });
        } catch (err) {
          // Never lose a file over the storage hop: fall through to the database.
          console.error("[JaText] Supabase Storage upload failed, storing in the database:", err?.message || err);
        }
      }

      if (buf.length > MAX_SINGLE_SHOT_BYTES) {
        const chunkCount = Math.ceil(buf.length / MEDIA_CHUNK_BYTES);
        const stmts = [
          {
            sql: `INSERT INTO media_blobs (
                    id, owner_id, mime_type, file_name, byte_size, chunk_count, data, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              auth.userId,
              mimeType,
              fileName,
              buf.length,
              chunkCount,
              new Uint8Array(0),
              now,
            ],
          },
        ];
        for (let idx = 0; idx < chunkCount; idx++) {
          const slice = buf.subarray(idx * MEDIA_CHUNK_BYTES, (idx + 1) * MEDIA_CHUNK_BYTES);
          stmts.push({
            sql: `INSERT INTO media_chunks (media_id, chunk_index, data) VALUES (?, ?, ?)`,
            args: [id, idx, new Uint8Array(slice.buffer, slice.byteOffset, slice.byteLength)],
          });
        }
        await db.batch(stmts, "write");
      } else {
        await db.execute({
          sql: `INSERT INTO media_blobs (
                  id, owner_id, mime_type, file_name, byte_size, chunk_count, data, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            auth.userId,
            mimeType,
            fileName,
            buf.length,
            0,
            new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
            now,
          ],
        });
      }

      return res.status(200).json({
        ok: true,
        id,
        storageId: id,
        url: `${origin}/api/media?id=${id}&sz=${buf.length}`,
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
