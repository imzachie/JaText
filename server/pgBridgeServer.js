import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPostgresPoolClient,
  serializeRowForBridge,
} from "./postgresAdapter.js";
import { initSchemaOnDb } from "./tursoBackend.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function loadDotEnvIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadDotEnvIfPresent(path.join(REPO_ROOT, ".env.postgres"));
loadDotEnvIfPresent(path.join(REPO_ROOT, ".env.local"));
loadDotEnvIfPresent(path.join(REPO_ROOT, ".env"));

const PORT = Number(process.env.PG_BRIDGE_PORT || process.env.PORT || 8787);
const HOST = process.env.PG_BRIDGE_HOST || "127.0.0.1";
const DATABASE_URL = (
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  ""
).trim();
const BRIDGE_SECRET = (process.env.POSTGRES_BRIDGE_SECRET || "").trim();

if (!DATABASE_URL) {
  console.error(
    "[JaText PG Bridge] Missing DATABASE_URL (e.g. postgresql://jatext:PASSWORD@127.0.0.1:5432/jatext).",
  );
  process.exit(1);
}

if (!BRIDGE_SECRET || BRIDGE_SECRET.length < 24) {
  console.error(
    "[JaText PG Bridge] Missing or weak POSTGRES_BRIDGE_SECRET (must be at least 24 characters).",
  );
  process.exit(1);
}

const pgClient = createPostgresPoolClient(DATABASE_URL);

function verifyBearerSecret(authHeader) {
  const prefix = "Bearer ";
  const raw = String(authHeader || "");
  if (!raw.startsWith(prefix)) return false;
  const provided = Buffer.from(raw.slice(prefix.length).trim(), "utf8");
  const expected = Buffer.from(BRIDGE_SECRET, "utf8");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

function readBody(req, maxBytes = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error("Payload exceeds 16 MB limit."));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && (urlObj.pathname === "/" || urlObj.pathname === "/health")) {
    try {
      const ping = await pgClient.execute("SELECT COUNT(*) AS cnt FROM users");
      return sendJson(res, 200, {
        ok: true,
        service: "jatext-pg-bridge",
        engine: "postgresql",
        dbConnected: true,
        userCount: Number(ping.rows[0]?.cnt ?? 0),
        timestamp: Date.now(),
      });
    } catch (err) {
      return sendJson(res, 503, {
        ok: false,
        service: "jatext-pg-bridge",
        engine: "postgresql",
        dbConnected: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (req.method === "POST" && urlObj.pathname === "/sql") {
    if (!verifyBearerSecret(req.headers.authorization)) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized bridge request." });
    }

    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw || "{}");

      if (parsed.mode === "execute") {
        const result = await pgClient.execute(parsed.stmt);
        return sendJson(res, 200, {
          ok: true,
          data: {
            rows: (result.rows || []).map(serializeRowForBridge),
            rowsAffected: result.rowsAffected,
          },
        });
      }

      if (parsed.mode === "batch") {
        const results = await pgClient.batch(parsed.stmts || [], parsed.txMode || "write");
        return sendJson(res, 200, {
          ok: true,
          data: results.map((r) => ({
            rows: (r.rows || []).map(serializeRowForBridge),
            rowsAffected: r.rowsAffected,
          })),
        });
      }

      return sendJson(res, 400, { ok: false, error: "Invalid SQL bridge mode." });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : "PostgreSQL query failed.",
      });
    }
  }

  return sendJson(res, 404, { ok: false, error: "Not found." });
});

async function start() {
  console.log("[JaText PG Bridge] Initializing PostgreSQL schema...");
  await initSchemaOnDb(pgClient);
  console.log("[JaText PG Bridge] PostgreSQL schema ready.");

  server.listen(PORT, HOST, () => {
    console.log(`[JaText PG Bridge] Listening 24/7 on http://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[JaText PG Bridge] Startup failed:", err);
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`[JaText PG Bridge] Received ${sig}, shutting down cleanly...`);
    server.close();
    await pgClient.close().catch(() => undefined);
    process.exit(0);
  });
}
