/**
 * JaText 24/7 self-hosted server (Ubuntu laptop edition).
 *
 * Serves the built web app (dist/) AND every /api/* endpoint on one Node process,
 * so the whole app runs on your own machine with no Vercel, no serverless platform
 * and no third-party database. Put Cloudflare Tunnel (or Tailscale Funnel) in front
 * of the port to get a public HTTPS URL.
 *
 * Usage:
 *   DATABASE_URL=postgresql://jatext:PASS@127.0.0.1:5432/jatext node server/standaloneServer.js
 *
 * Environment:
 *   DATABASE_URL              Local PostgreSQL connection string (required)
 *   PUBLIC_APP_ORIGIN         Public origin, e.g. https://jatext.us.ci (defaults to window host)
 *   PORT                      HTTP port to listen on (default 8787)
 *   HOST                      Bind address (default 127.0.0.1)
 *   AUTH_SECRET               JWT signing secret (required for logins to survive restarts)
 *   TRUST_PROXY               "1" to trust x-forwarded-* headers from Cloudflare Tunnel
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authStatusHandler from "../api/auth-status.js";
import ios404Handler from "../api/ios-404.js";
import linkPreviewHandler from "../api/link-preview.js";
import mediaHandler from "../api/media.js";
import oauthGoogleHandler from "../api/oauth-google.js";
import klipyTestHandler from "../api/klipy-test.js";
import pushTestHandler from "../api/push-test.js";
import tursoHandler from "../api/turso.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const DEFAULT_ORIGIN = (process.env.PUBLIC_APP_ORIGIN || "").trim().replace(/\/+$/, "") ||
  "https://jatext.us.ci";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".apk": "application/vnd.android.package-archive",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const CSP_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: mediastream: https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  [
    "connect-src 'self' blob: data:",
    DEFAULT_ORIGIN,
    "https://cdn.jsdelivr.net",
    "https://huggingface.co",
    "https://*.huggingface.co",
    "https://*.hf.co",
    "https://*.klipy.com",
    "https://*.klipy.co",
    "https://*.tenor.com",
    "https://storage.googleapis.com",
    "https://*.googleusercontent.com",
    "https://accounts.google.com",
    "https://api.github.com",
    "https://github.com",
    "https://*.githubusercontent.com",
    "https://i.pinimg.com",
    "https://cdn.wallpapersafari.com",
    "https://wallpapers.com",
    "https://wallpaperaccess.com",
  ].join(" "),
  "frame-src 'self' https://accounts.google.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP_VALUE,
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function applySecurityHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!res.getHeader(key)) res.setHeader(key, value);
  }
}

function decorateResponse(res) {
  if (typeof res.status !== "function") {
    res.status = function status(code) {
      this.statusCode = Number(code) || 200;
      return this;
    };
  }
  if (typeof res.json !== "function") {
    res.json = function json(payload) {
      if (!this.getHeader("Content-Type")) {
        this.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      this.end(JSON.stringify(payload));
      return this;
    };
  }
  if (typeof res.send !== "function") {
    res.send = function send(payload) {
      if (payload === undefined || payload === null) return this.end();
      if (Buffer.isBuffer(payload) || typeof payload === "string") return this.end(payload);
      if (!this.getHeader("Content-Type")) {
        this.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      return this.end(JSON.stringify(payload));
    };
  }
  return res;
}

async function readRequestBody(req, { maxBytes }) {
  if (req.method === "GET" || req.method === "HEAD") return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw Object.assign(new Error(`Request body exceeds ${maxBytes} bytes.`), {
        statusCode: 413,
      });
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function makeQueryObject(urlObj) {
  const query = {};
  for (const key of urlObj.searchParams.keys()) {
    query[key] = urlObj.searchParams.get(key);
  }
  return query;
}

function parseJsonBody(buf) {
  const text = buf.toString("utf8").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : parsed;
  } catch {
    return text;
  }
}

function isFormEncoded(req) {
  return String(req.headers["content-type"] || "").includes("application/x-www-form-urlencoded");
}

const IOS_GATE_UA = /.*(Android|Windows NT|CrOS|X11;|Linux x86|Linux aarch64|curl\/).*/;

async function runApiHandler(handler, req, res, { maxBodyBytes, rawBody = false }) {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  decorateResponse(res);
  req.query = makeQueryObject(urlObj);
  applySecurityHeaders(res);

  try {
    const buf = await readRequestBody(req, { maxBytes: maxBodyBytes });
    if (rawBody) {
      req.body = buf;
    } else if (isFormEncoded(req)) {
      const out = {};
      for (const [key, value] of new URLSearchParams(buf.toString("utf8")).entries()) {
        out[key] = value;
      }
      req.body = out;
    } else {
      req.body = parseJsonBody(buf);
    }
    await handler(req, res);
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    if (!res.headersSent) {
      res.status(status).json({ ok: false, error: message });
    } else {
      res.end();
    }
    console.error(`[JaText] /api error: ${message}`);
  }
}

async function resolveStaticFile(pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0].split("#")[0]);
  if (clean.includes("..")) return null;

  const candidates = [];
  const rel = clean.replace(/^\/+/, "");
  if (rel) {
    candidates.push(path.join(DIST_DIR, rel));
    candidates.push(path.join(PUBLIC_DIR, rel));
  }

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return { filePath: candidate, size: info.size };
    } catch {
      // keep looking
    }
  }
  return null;
}

/**
 * Byte range support. Without it, audio cannot be seeked and some players
 * refuse to start a stream at all, which is what made the status music look
 * broken. A request without a Range header behaves exactly as before.
 */
function parseRangeHeader(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || "").trim());
  if (!match) return null;

  const rawStart = match[1];
  const rawEnd = match[2];

  let start;
  let end;
  if (rawStart === "") {
    // Suffix range: the last N bytes.
    if (rawEnd === "") return null;
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function serveStaticFile(req, res, filePath, size) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || "application/octet-stream";
  const range = req.headers.range ? parseRangeHeader(req.headers.range, size) : null;

  if (req.headers.range && !range) {
    res.writeHead(416, {
      "Content-Type": type,
      "Content-Range": `bytes */${size}`,
      "Accept-Ranges": "bytes",
    });
    return res.end();
  }

  if (range) {
    const length = range.end - range.start + 1;
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": length,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
    });
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(filePath, { start: range.start, end: range.end });
    stream.on("error", () => {
      res.end();
    });
    stream.pipe(res);
    return;
  }

  if (req.method === "HEAD") {
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": size,
      "Accept-Ranges": "bytes",
    });
    return res.end();
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": size,
    "Accept-Ranges": "bytes",
  });
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    res.end();
  });
  stream.pipe(res);
}

function applyRouteHeaderRules(pathname, res) {
  if (pathname === "/web-version.json") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return;
  }
  if (pathname === "/sw.js") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Service-Worker-Allowed", "/");
    return;
  }
  if (pathname === "/manifest.webmanifest") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return;
  }
  if (pathname === "/apk-version.json") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return;
  }
  if (pathname.startsWith("/downloads/")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Content-Disposition", 'attachment; filename="JaText-release.apk"');
    return;
  }
  if (pathname === "/.well-known/assetlinks.json") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=300");
  }
}

async function serveSpaFallback(req, res) {
  const indexFile = path.join(DIST_DIR, "index.html");
  try {
    const info = await stat(indexFile);
    return serveStaticFile(req, res, indexFile, info.size);
  } catch {
    res.status(500).json({
      ok: false,
      error: "Web build missing. Run `npm install && npm run build` on the server.",
    });
  }
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;
  const userAgent = String(req.headers["user-agent"] || "");

  applySecurityHeaders(res);
  decorateResponse(res);

  if (pathname === "/healthz" || pathname === "/api/health") {
    return res.status(200).json({
      ok: true,
      service: "jatext-standalone",
      origin: DEFAULT_ORIGIN,
      timestamp: Date.now(),
    });
  }

  if (pathname === "/api/turso") {
    return runApiHandler(tursoHandler, req, res, { maxBodyBytes: 8 * 1024 * 1024 });
  }
  if (pathname === "/api/auth-status") {
    return runApiHandler(authStatusHandler, req, res, { maxBodyBytes: 64 * 1024 });
  }
  if (pathname === "/api/link-preview") {
    return runApiHandler(linkPreviewHandler, req, res, { maxBodyBytes: 64 * 1024 });
  }
  if (pathname === "/api/oauth-google") {
    return runApiHandler(oauthGoogleHandler, req, res, { maxBodyBytes: 2 * 1024 * 1024 });
  }
  if (pathname === "/api/push-test") {
    return runApiHandler(pushTestHandler, req, res, { maxBodyBytes: 64 * 1024 });
  }
  if (pathname === "/api/klipy-test") {
    return runApiHandler(klipyTestHandler, req, res, { maxBodyBytes: 64 * 1024 });
  }
  if (pathname === "/api/media") {
    return runApiHandler(mediaHandler, req, res, {
      maxBodyBytes: 96 * 1024 * 1024,
      rawBody: true,
    });
  }

  if (pathname === "/ios/chats" || pathname.startsWith("/ios/chats/")) {
    if (IOS_GATE_UA.test(userAgent)) {
      decorateResponse(res);
      return ios404Handler(req, res);
    }
    applyRouteHeaderRules(pathname, res);
    return serveSpaFallback(req, res);
  }

  applyRouteHeaderRules(pathname, res);

  const found = await resolveStaticFile(pathname);
  if (found) {
    return serveStaticFile(req, res, found.filePath, found.size);
  }

  if (path.extname(pathname)) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  return serveSpaFallback(req, res);
});

const PORT = Number(process.env.PORT || process.env.JATEXT_PORT || 8787);
const HOST = process.env.HOST || process.env.JATEXT_HOST || "127.0.0.1";

server.requestTimeout = 0;
server.headersTimeout = 120000;
server.keepAliveTimeout = 65000;
server.maxRequestsPerSocket = 0;

server.listen(PORT, HOST, () => {
  console.log(`[JaText] Self-hosted server listening on http://${HOST}:${PORT}`);
  console.log(`[JaText] Serving web build: ${DIST_DIR}`);
  console.log(`[JaText] Public origin: ${DEFAULT_ORIGIN}`);
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[JaText] WARNING: DATABASE_URL is not set. Run scripts/setup-ubuntu-selfhost.sh first.",
    );
  }
});

export { server };
