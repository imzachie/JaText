#!/usr/bin/env node
/**
 * Attachment storage test: does a file really leave the database and come back?
 *
 *   node scripts/test-media-storage.mjs
 *
 * There is no Supabase here, so both sides the media handler talks to are stubbed:
 * a local HTTP server that speaks the same Storage REST calls (POST an object, GET a
 * public object including Range, DELETE), and an in-memory database that understands
 * only the handful of media statements the handler issues. The point is not to
 * exercise Storage, it is to pin down the routing decisions:
 *
 *   1. a small upload goes to the bucket and the row keeps a pointer, no bytes
 *   2. a whole-file read sends the client to Storage (302) and the bytes match
 *   3. HEAD still answers from the row, so X-JaText-Total-Size is never lost
 *   4. an explicit Range is served as a 206 slice of the object, same contract
 *   5. a GIF's loop block is repaired before upload, not on the way out
 *   6. a chunked upload is promoted to one object once the last chunk lands, and
 *      its media_chunks rows are gone
 *   7. with no Storage configured, everything still works the old way (a child
 *      process, because the config cache is keyed on the env that was set at boot)
 */
import crypto from "node:crypto";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SECRET = "media-storage-test-secret";
const BUCKET = "jatext-media";
const CHUNK = 768 * 1024;

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `  -> ${detail}` : ""}`);
  }
}

function b64u(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mintToken(userId) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(
    JSON.stringify({
      sub: userId,
      email: "media-test@example.com",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

/* ------------------------- the Storage stand-in ------------------------- */

const objects = new Map();
const authenticatedReads = [];

function serveStorage() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const incoming = [];
      req.on("data", (c) => incoming.push(c));
      req.on("end", () => {
        const body = Buffer.concat(incoming);
        const path = decodeURIComponent(req.url || "/");
        const at = path.indexOf("/storage/v1/object/");
        if (at === -1) {
          res.writeHead(404).end("not found");
          return;
        }
        const rest = path.slice(at + "/storage/v1/object/".length);
        const isPublicRead = rest.startsWith("public/");
        const withoutKind = isPublicRead ? rest.slice("public/".length) : rest;
        const key = withoutKind.startsWith(`${BUCKET}/`)
          ? withoutKind.slice(BUCKET.length + 1)
          : withoutKind;
        const bearer = String(req.headers.authorization || "");
        // The public URL needs no credentials; the write and range-read endpoints do,
        // and the stub refuses to answer either way without a bearer token.
        if (!isPublicRead && !bearer.startsWith("Bearer ")) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(
            JSON.stringify({ error: { message: "missing bearer token" } }),
          );
          return;
        }

        if (!isPublicRead && req.method === "POST") {
          objects.set(key, { body, contentType: String(req.headers["content-type"] || "") });
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ Key: key }));
          return;
        }
        if (!isPublicRead && req.method === "DELETE") {
          objects.delete(key);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify([]));
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405).end("method not allowed");
          return;
        }
        if (!isPublicRead) authenticatedReads.push({ key, range: String(req.headers.range || ""), bearer });

        const found = objects.get(key);
        if (!found) {
          res.writeHead(404).end("Object Not Found");
          return;
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        const match = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range || ""));
        if (match) {
          const startByte = Number(match[1]);
          const endByte = Math.min(found.body.length - 1, Number(match[2]));
          res.writeHead(206, {
            "Content-Type": found.contentType || "application/octet-stream",
            "Content-Range": `bytes ${startByte}-${endByte}/${found.body.length}`,
            "Content-Length": String(endByte - startByte + 1),
            "Accept-Ranges": "bytes",
          });
          res.end(found.body.subarray(startByte, endByte + 1));
          return;
        }
        res.writeHead(200, {
          "Content-Type": found.contentType || "application/octet-stream",
          "Content-Length": String(found.body.length),
          "Accept-Ranges": "bytes",
        });
        res.end(found.body);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/* --------------------------- the fake request --------------------------- */

function makeReq({ method, url, headers = {}, body }) {
  const parsed = new URL(url, "http://test.local");
  const query = Object.fromEntries(parsed.searchParams.entries());
  return { method, url, headers, body, query };
}

function makeRes() {
  const headers = {};
  const out = {
    statusCode: 0,
    body: null,
    done: null,
    headers,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = Array.isArray(value) ? value.join(",") : String(value);
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    removeHeader(name) {
      delete headers[String(name).toLowerCase()];
    },
    status(code) {
      out.statusCode = code;
      return out;
    },
    json(object) {
      out.body = Buffer.from(JSON.stringify(object || {}), "utf8");
      finish();
      return out;
    },
    send(buffer) {
      out.body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), "utf8");
      finish();
      return out;
    },
    end(chunk) {
      if (chunk) out.body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
      finish();
      return out;
    },
  };
  let settled = false;
  let settle = null;
  out.done = new Promise((resolve) => {
    settle = resolve;
  });
  out.finish = () => {
    if (settled) return;
    settled = true;
    settle(out);
  };
  const finish = out.finish;
  return out;
}

/* --------------------------- the fake database --------------------------- */

function makeStubDb() {
  const blobs = new Map();
  const chunks = new Map();
  const seen = [];

  function flat(sql) {
    return String(sql).replace(/\s+/g, " ").trim();
  }

  async function execute(stmt) {
    const sql = typeof stmt === "string" ? stmt : stmt?.sql;
    const args = (typeof stmt === "string" ? [] : stmt?.args) || [];
    const text = flat(sql);
    seen.push(text);

    if (/^INSERT INTO media_blobs/i.test(text)) {
      // Map by column name rather than position: the chunked session creates the row
      // without storage_key, and a positional stub would read created_at as the key.
      const columns = /INSERT INTO media_blobs \(([^)]*)\)/i.exec(text)[1]
        .split(",")
        .map((c) => c.trim());
      const row = {};
      columns.forEach((column, i) => {
        row[column] = args[i];
      });
      blobs.set(String(row.id), {
        id: String(row.id),
        owner_id: row.owner_id,
        mime_type: row.mime_type,
        file_name: row.file_name,
        byte_size: row.byte_size,
        chunk_count: row.chunk_count,
        data: Buffer.from(row.data || new Uint8Array(0)),
        storage_key: row.storage_key || "",
        created_at: row.created_at,
      });
      return { rows: [] };
    }

    if (/^UPDATE media_blobs SET storage_key/i.test(text)) {
      const [storage_key, data, id] = args;
      const row = blobs.get(String(id));
      if (row) {
        row.storage_key = storage_key;
        row.chunk_count = 0;
        row.data = Buffer.from(data || new Uint8Array(0));
      }
      return { rows: [] };
    }

    if (/^SELECT mime_type, file_name, byte_size, chunk_count, storage_key/i.test(text)) {
      const row = blobs.get(String(args[0]));
      if (!row) return { rows: [] };
      return {
        rows: [
          {
            mime_type: row.mime_type,
            file_name: row.file_name,
            byte_size: row.byte_size,
            chunk_count: row.chunk_count,
            storage_key: row.storage_key,
            inline_data: Number(row.chunk_count || 0) === 0 ? new Uint8Array(row.data) : null,
          },
        ],
      };
    }

    if (/^SELECT byte_size, mime_type, chunk_count, storage_key/i.test(text)) {
      const row = blobs.get(String(args[0]));
      return { rows: row ? [{ byte_size: row.byte_size, mime_type: row.mime_type, chunk_count: row.chunk_count, storage_key: row.storage_key }] : [] };
    }

    if (/^SELECT owner_id, chunk_count FROM media_blobs/i.test(text)) {
      const row = blobs.get(String(args[0]));
      return { rows: row ? [{ owner_id: row.owner_id, chunk_count: row.chunk_count }] : [] };
    }

    if (/^INSERT( OR REPLACE)? INTO media_chunks/i.test(text)) {
      const [media_id, chunk_index, data] = args;
      chunks.set(`${media_id}:${chunk_index}`, Buffer.from(data));
      return { rows: [] };
    }

    if (/^SELECT chunk_index, data FROM media_chunks/i.test(text)) {
      const [mediaId, from, to] = args;
      const rows = [];
      for (let i = Number(from); i <= Number(to); i += 1) {
        const buf = chunks.get(`${mediaId}:${i}`);
        if (buf) rows.push({ chunk_index: i, data: new Uint8Array(buf) });
      }
      return { rows };
    }

    if (/^DELETE FROM media_chunks/i.test(text)) {
      const mediaId = String(args[0]);
      for (const key of [...chunks.keys()]) {
        if (key.startsWith(`${mediaId}:`)) chunks.delete(key);
      }
      return { rows: [] };
    }

    throw new Error(`stub database received SQL it does not know: ${text.slice(0, 140)}`);
  }

  return {
    execute,
    async batch(list) {
      for (const stmt of list || []) await execute(stmt);
      return [];
    },
    blobs,
    chunks,
    seen,
  };
}

async function main() {
  const storageServer = await serveStorage();
  const port = storageServer.address().port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = `service-role-${SECRET}`;
  process.env.JATEXT_MEDIA_BUCKET = BUCKET;
  process.env.AUTH_SECRET = SECRET;
  process.env.PUBLIC_APP_ORIGIN = "http://127.0.0.1:1";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;

  const backend = await import(new URL("../server/tursoBackend.js", import.meta.url));
  const mediaModule = await import(new URL("../api/media.js", import.meta.url));
  const storage = await import(new URL("../server/supabaseStorage.js", import.meta.url));

  const db = makeStubDb();
  backend.setCustomDbForTesting(db);
  const handler = mediaModule.default;
  const token = mintToken("user-media-test");
  const auth = { authorization: `Bearer ${token}` };

  console.log("media storage: Supabase bucket as the home for attachments");

  /* 1. a small upload lands in the bucket, the row keeps only a pointer */
  const photo = crypto.randomBytes(120_000);
  const uploadRes = makeRes();
  await handler(
    makeReq({
      method: "POST",
      url: "/api/media",
      headers: { ...auth, "content-type": "image/jpeg", "x-jatext-mime": "image/jpeg", "x-jatext-filename": "sunset.jpg" },
      body: photo,
    }),
    uploadRes,
  );
  const uploaded = JSON.parse(uploadRes.body.toString("utf8"));
  check("upload replies with the same /api/media?id= url the client already stores", /\/api\/media\?id=/.test(uploaded.url || ""));
  check("upload reports that the bytes went to Storage", uploaded.storage === "supabase");
  const mediaId = uploaded.id;
  const key = `user-media-test/${mediaId}`;
  check("the object exists in the bucket", objects.has(key), [...objects.keys()].join(","));
  check("the stored bytes are the file, byte for byte", objects.get(key)?.body?.equals(photo));
  check("the object carries its own mime type", objects.get(key)?.contentType === "image/jpeg");
  const row = db.blobs.get(String(mediaId));
  check("the row points at the object", row?.storage_key === key);
  check("the row keeps no bytes", Number(row?.data?.length || 0) === 0, `data=${row?.data?.length}`);

  /* 2. whole-file reads are handed to Storage */
  const redirectRes = makeRes();
  await handler(makeReq({ method: "GET", url: `/api/media?id=${mediaId}&sz=${photo.length}` }), redirectRes);
  check("a plain GET is a redirect", redirectRes.statusCode === 302, `status=${redirectRes.statusCode}`);
  check("it points at the public object", redirectRes.headers.location === `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`, redirectRes.headers.location);
  const fetched = await fetch(redirectRes.headers.location);
  check("the redirected object returns the file", Buffer.from(await fetched.arrayBuffer()).equals(photo));

  /* 3. HEAD still answers from the row */
  const headRes = makeRes();
  await handler(makeReq({ method: "HEAD", url: `/api/media?id=${mediaId}` }), headRes);
  check("HEAD is a direct 200", headRes.statusCode === 200, `status=${headRes.statusCode}`);
  check("HEAD keeps X-JaText-Total-Size for the app's video probe", headRes.headers["x-jatext-total-size"] === String(photo.length), headRes.headers["x-jatext-total-size"]);
  check("HEAD does not redirect", !headRes.headers.location);

  /* 4. an explicit range is served as a slice of the object */
  const rangeRes = makeRes();
  await handler(
    makeReq({ method: "GET", url: `/api/media?id=${mediaId}`, headers: { range: `bytes=1000-${2000}` } }),
    rangeRes,
  );
  check("a Range request is a 206", rangeRes.statusCode === 206, `status=${rangeRes.statusCode}`);
  check("the slice is exactly the requested bytes", rangeRes.body?.equals(photo.subarray(1000, 2001)));
  check("Content-Range names the real total", rangeRes.headers["content-range"] === `bytes 1000-2000/${photo.length}`, rangeRes.headers["content-range"]);
  check(
    "the slice was read from the authenticated endpoint with the service key",
    authenticatedReads.some((r) => r.key === key && r.range === "bytes=1000-2000" && r.bearer.includes(SECRET)),
    JSON.stringify(authenticatedReads),
  );

  /* 5. GIF loop repair happens before the bytes leave */
  const gif = Buffer.concat([
    Buffer.from("GIF87a", "ascii"),
    Buffer.from([0x07, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x2c, 0x00, 0x00, 0x00, 0x00, 0x07, 0x00, 0x07, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b]),
  ]);
  const gifRes = makeRes();
  await handler(
    makeReq({
      method: "POST",
      url: "/api/media",
      headers: { ...auth, "content-type": "image/gif", "x-jatext-mime": "image/gif", "x-jatext-filename": "loop.gif" },
      body: gif,
    }),
    gifRes,
  );
  const gifJson = JSON.parse(gifRes.body.toString("utf8"));
  const storedGif = objects.get(`user-media-test/${gifJson.id}`)?.body;
  check("a GIF upload still goes to Storage", gifJson.storage === "supabase");
  check("the stored GIF was upgraded to 89a", String(storedGif?.subarray(0, 6)) === "GIF89a", String(storedGif?.subarray(0, 6)));
  check("the stored GIF loops forever", storedGif?.subarray(13, 27)?.toString("ascii").includes("NETSCAPE2.0"));

  /* 6. a chunked upload is promoted once the last chunk arrives */
  const big = crypto.randomBytes(CHUNK * 3 + 1000);
  const initRes = makeRes();
  await handler(
    makeReq({
      method: "POST",
      url: "/api/media?action=init",
      headers: { ...auth, "content-type": "application/json" },
      body: Buffer.from(JSON.stringify({ byteSize: big.length, mimeType: "video/mp4", fileName: "clip.mp4" })),
    }),
    initRes,
  );
  const initJson = JSON.parse(initRes.body.toString("utf8"));
  const chunkCount = Number(initJson.chunkCount || 0);
  check("init reserves a chunked session", chunkCount === 4, `chunkCount=${chunkCount}`);
  let lastChunkJson = null;
  for (let i = 0; i < chunkCount; i += 1) {
    const res = makeRes();
    await handler(
      makeReq({
        method: "POST",
        url: `/api/media?action=chunk&id=${initJson.id}&index=${i}`,
        headers: { ...auth, "content-type": "application/octet-stream" },
        body: big.subarray(i * CHUNK, (i + 1) * CHUNK),
      }),
      res,
    );
    lastChunkJson = JSON.parse(res.body.toString("utf8"));
  }
  check("the finished upload is promoted to one object", lastChunkJson?.storage === "supabase", JSON.stringify(lastChunkJson));
  check("the object holds the whole file", objects.get(`user-media-test/${initJson.id}`)?.body?.equals(big));
  check("the chunks are gone from the database", db.chunks.size === 0, `chunks=${db.chunks.size}`);
  check("the row keeps only the pointer", db.blobs.get(String(initJson.id))?.storage_key === `user-media-test/${initJson.id}`);
  const afterPromote = makeRes();
  await handler(makeReq({ method: "GET", url: `/api/media?id=${initJson.id}` }), afterPromote);
  check("the promoted file is served by redirect too", afterPromote.statusCode === 302, `status=${afterPromote.statusCode}`);

  /* the pieces the handler must not get wrong on its own */
  const cfg = storage.supabaseStorageConfig();
  check("config derives the project url from SUPABASE_URL", cfg.enabled && cfg.projectUrl === process.env.SUPABASE_URL);
  check(
    "the public url encodes each path segment",
    storage.publicObjectUrl("a b/c d") === `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/a%20b/c%20d`,
    storage.publicObjectUrl("a b/c d"),
  );

  // A server without Supabase credentials is a supported install, not a broken one:
  // the bucket is an optimization, and the database path has to keep working alone.
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--legacy"], {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  });
  check("the run without Storage configured passed its own checks", child.status === 0);

  storageServer.close();
  console.log(failures === 0 ? "\nall storage routing checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

async function mainLegacy() {
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.JATEXT_MEDIA_BUCKET = "";
  process.env.AUTH_SECRET = SECRET;
  process.env.DATABASE_URL = "";

  const backend = await import(new URL("../server/tursoBackend.js", import.meta.url));
  const mediaModule = await import(new URL("../api/media.js", import.meta.url));
  const storage = await import(new URL("../server/supabaseStorage.js", import.meta.url));

  console.log("\nmedia storage: with no Storage configured the database is still the home");
  check("config reports itself disabled", storage.supabaseStorageConfig().enabled === false);

  const db = makeStubDb();
  backend.setCustomDbForTesting(db);
  const handler = mediaModule.default;
  const token = mintToken("user-legacy-test");
  const auth = { authorization: `Bearer ${token}` };

  const photo = crypto.randomBytes(120_000);
  const uploadRes = makeRes();
  await handler(
    makeReq({
      method: "POST",
      url: "/api/media",
      headers: { ...auth, "content-type": "image/jpeg", "x-jatext-mime": "image/jpeg", "x-jatext-filename": "sunset.jpg" },
      body: photo,
    }),
    uploadRes,
  );
  const uploaded = JSON.parse(uploadRes.body.toString("utf8"));
  check("a small upload succeeds", uploaded.ok === true, uploadRes.body.toString("utf8"));
  check("it does not claim to be in Storage", !uploaded.storage);
  const row = db.blobs.get(String(uploaded.id));
  check("the bytes are kept in the row", Number(row?.data?.length || 0) === photo.length, `data=${row?.data?.length}`);
  check("no pointer was written", !row?.storage_key);

  const readRes = makeRes();
  await handler(makeReq({ method: "GET", url: `/api/media?id=${uploaded.id}` }), readRes);
  check("a read is served directly, not redirected", readRes.statusCode === 200, `status=${readRes.statusCode}`);
  check("the served bytes are the file", readRes.body?.equals(photo));

  // The chunked path with no bucket to move to: the row says chunk_count, the bytes
  // stay in media_chunks, and a range read still slices across chunk boundaries.
  const video = crypto.randomBytes(CHUNK + 4096);
  const bigRes = makeRes();
  await handler(
    makeReq({
      method: "POST",
      url: "/api/media",
      headers: { ...auth, "content-type": "video/mp4", "x-jatext-mime": "video/mp4", "x-jatext-filename": "clip.mp4" },
      body: video,
    }),
    bigRes,
  );
  const bigJson = JSON.parse(bigRes.body.toString("utf8"));
  check("an over-the-line upload still succeeds", bigJson.ok === true, bigRes.body.toString("utf8"));
  check("it wrote one chunk per row", db.chunks.size === 2, `chunks=${db.chunks.size}`);
  const sliceRes = makeRes();
  await handler(
    makeReq({
      method: "GET",
      url: `/api/media?id=${bigJson.id}`,
      headers: { range: `bytes=${CHUNK - 500}-${CHUNK + 500}` },
    }),
    sliceRes,
  );
  check("a slice spanning two chunks comes back whole", sliceRes.statusCode === 206 && sliceRes.body?.equals(video.subarray(CHUNK - 500, CHUNK + 501)), `status=${sliceRes.statusCode} len=${sliceRes.body?.length}`);

  // A row that points into a bucket this server cannot name has to say so. An empty
  // 200 would show up as a broken thumbnail and be cached as one.
  db.blobs.set("orphan-media", {
    id: "orphan-media",
    owner_id: "user-legacy-test",
    mime_type: "image/png",
    file_name: "x.png",
    byte_size: 10,
    chunk_count: 0,
    data: Buffer.alloc(0),
    storage_key: "user-legacy-test/orphan-media",
    created_at: Date.now(),
  });
  const orphanRes = makeRes();
  await handler(makeReq({ method: "GET", url: "/api/media?id=orphan-media" }), orphanRes);
  check(
    "a pointer with no storage credentials names the secret to set",
    orphanRes.statusCode === 503 && /SUPABASE_SERVICE_ROLE_KEY/.test(orphanRes.body?.toString("utf8") || ""),
    `status=${orphanRes.statusCode}`,
  );

  console.log(failures === 0 ? "  legacy checks passed" : `  ${failures} legacy check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

(process.argv.includes("--legacy") ? mainLegacy() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
