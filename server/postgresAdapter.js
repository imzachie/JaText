import pg from "pg";

const { Pool, types } = pg;

// Parse PostgreSQL INT8 / BIGINT (OID 20) into JS Number so timestamps, flags (0/1),
// and COUNT(*) behave identically to SQLite / LibSQL numbers across the backend.
types.setTypeParser(20, (val) => (val === null ? null : Number(val)));

/**
 * Translate SQLite / LibSQL DDL & DML statements used by JaText into standard PostgreSQL 14+.
 * - Converts `INTEGER` -> `BIGINT` and `BLOB` -> `BYTEA` in CREATE/ALTER TABLE
 * - Adds `IF NOT EXISTS` to `ALTER TABLE ... ADD COLUMN`
 * - Rewrites `INSERT OR IGNORE INTO ...` -> `INSERT INTO ... ON CONFLICT DO NOTHING`
 * - Rewrites `INSERT OR REPLACE INTO media_chunks ...` -> `ON CONFLICT (media_id, chunk_index) DO UPDATE ...`
 * - Converts positional `?` placeholders outside string literals/comments into `$1, $2, ...`
 */
export function translateSqlToPostgres(rawSql) {
  let sql = String(rawSql || "").trim();
  if (!sql) return "";

  // Strip optional trailing semicolon so appended clauses remain valid
  if (sql.endsWith(";")) {
    sql = sql.slice(0, -1).trim();
  }

  // 1. DDL translations (CREATE TABLE / ALTER TABLE)
  if (/^(CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(sql)) {
    sql = sql
      .replace(/\bINTEGER\b/gi, "BIGINT")
      .replace(/\bBLOB\b/gi, "BYTEA");
    if (/^ALTER\s+TABLE\b/i.test(sql)) {
      sql = sql.replace(
        /^(ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN)(?!\s+IF\s+NOT\s+EXISTS)\b/i,
        "$1 IF NOT EXISTS",
      );
    }
  }

  // 2. SQLite `INSERT OR IGNORE INTO ...` -> PostgreSQL `INSERT INTO ... ON CONFLICT DO NOTHING`
  if (/^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql)) {
    sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
    if (!/\bON\s+CONFLICT\b/i.test(sql)) {
      sql = `${sql} ON CONFLICT DO NOTHING`;
    }
  }

  // 3. SQLite `INSERT OR REPLACE INTO media_chunks ...` -> PostgreSQL upsert
  if (/^INSERT\s+OR\s+REPLACE\s+INTO\s+media_chunks\b/i.test(sql)) {
    sql = sql.replace(/^INSERT\s+OR\s+REPLACE\s+INTO\b/i, "INSERT INTO");
    if (!/\bON\s+CONFLICT\b/i.test(sql)) {
      sql = `${sql} ON CONFLICT (media_id, chunk_index) DO UPDATE SET data = EXCLUDED.data`;
    }
  }

  // 4. Convert positional `?` parameters outside string literals / identifiers / comments to `$1, $2, ...`
  let out = "";
  let paramIndex = 0;
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    // Single-quoted string literal ('...' with '' escape)
    if (ch === "'") {
      out += ch;
      i += 1;
      while (i < len) {
        const c = sql[i];
        out += c;
        i += 1;
        if (c === "'") {
          if (i < len && sql[i] === "'") {
            out += sql[i];
            i += 1;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // Double-quoted identifier ("..." with "" escape)
    if (ch === '"') {
      out += ch;
      i += 1;
      while (i < len) {
        const c = sql[i];
        out += c;
        i += 1;
        if (c === '"') {
          if (i < len && sql[i] === '"') {
            out += sql[i];
            i += 1;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // Single-line comment (-- ...)
    if (ch === "-" && i + 1 < len && sql[i + 1] === "-") {
      while (i < len && sql[i] !== "\n") {
        out += sql[i];
        i += 1;
      }
      continue;
    }

    // Block comment (/* ... */)
    if (ch === "/" && i + 1 < len && sql[i + 1] === "*") {
      out += "/*";
      i += 2;
      while (i < len) {
        if (sql[i] === "*" && i + 1 < len && sql[i + 1] === "/") {
          out += "*/";
          i += 2;
          break;
        }
        out += sql[i];
        i += 1;
      }
      continue;
    }

    if (ch === "?") {
      paramIndex += 1;
      out += `$${paramIndex}`;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

export function normalizePgArg(arg) {
  if (arg === undefined || arg === null) return null;
  if (typeof arg === "boolean") return arg ? 1 : 0;
  if (Buffer.isBuffer(arg)) return arg;
  if (arg instanceof Uint8Array) {
    return Buffer.from(arg.buffer, arg.byteOffset, arg.byteLength);
  }
  if (arg instanceof ArrayBuffer) {
    return Buffer.from(arg);
  }
  if (typeof arg === "object" && typeof arg.__jt_b64 === "string") {
    return Buffer.from(arg.__jt_b64, "base64");
  }
  return arg;
}

export function serializeArgForBridge(arg) {
  if (arg === undefined || arg === null) return null;
  if (typeof arg === "boolean") return arg ? 1 : 0;
  if (Buffer.isBuffer(arg)) {
    return { __jt_b64: arg.toString("base64") };
  }
  if (arg instanceof Uint8Array) {
    return {
      __jt_b64: Buffer.from(arg.buffer, arg.byteOffset, arg.byteLength).toString("base64"),
    };
  }
  if (arg instanceof ArrayBuffer) {
    return { __jt_b64: Buffer.from(arg).toString("base64") };
  }
  return arg;
}

export function serializeRowForBridge(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (Buffer.isBuffer(v)) {
      out[k] = { __jt_b64: v.toString("base64") };
    } else if (v instanceof Uint8Array) {
      out[k] = {
        __jt_b64: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64"),
      };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function deserializeRowFromBridge(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === "object" && typeof v.__jt_b64 === "string") {
      out[k] = Buffer.from(v.__jt_b64, "base64");
    } else {
      out[k] = v;
    }
  }
  return out;
}

function normalizeStatementInput(stmtOrSql) {
  if (typeof stmtOrSql === "string") {
    return { sql: stmtOrSql, args: [] };
  }
  return {
    sql: String(stmtOrSql?.sql || ""),
    args: Array.isArray(stmtOrSql?.args) ? stmtOrSql.args : [],
  };
}

function buildPoolConfig(rawUrl) {
  let connectionString = String(rawUrl || "").trim();
  let ssl = false;

  try {
    const parsed = new URL(connectionString);
    const host = (parsed.hostname || "").toLowerCase();
    const sslMode = (
      parsed.searchParams.get("sslmode") ||
      process.env.PGSSLMODE ||
      ""
    ).toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]";

    if (sslMode === "disable") {
      ssl = false;
    } else if (
      sslMode === "require" ||
      sslMode === "prefer" ||
      sslMode === "no-verify" ||
      (!isLocalHost && sslMode !== "allow")
    ) {
      // Allow self-signed TLS certificates commonly used on self-hosted Ubuntu laptops
      parsed.searchParams.delete("sslmode");
      connectionString = parsed.toString();
      ssl = { rejectUnauthorized: sslMode === "verify-full" };
    }
  } catch {
    // Keep raw connectionString if non-URL DSN format is supplied
  }

  return {
    connectionString,
    ssl,
    max: Math.max(2, Number(process.env.PG_POOL_MAX || 20)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  };
}

/**
 * Direct `node-postgres` (`pg.Pool`) client implementing JaText's `execute` + `batch` interface.
 */
export function createPostgresPoolClient(connectionString) {
  const pool = new Pool(buildPoolConfig(connectionString));

  pool.on("error", (err) => {
    console.error("[JaText PostgreSQL Pool] Idle client error:", err?.message || err);
  });

  return {
    engine: "postgresql",
    pool,
    async execute(stmtOrSql) {
      const { sql, args } = normalizeStatementInput(stmtOrSql);
      const pgSql = translateSqlToPostgres(sql);
      const pgArgs = args.map(normalizePgArg);
      const res = await pool.query(pgSql, pgArgs);
      return {
        rows: res.rows || [],
        rowsAffected: Number(res.rowCount || 0),
      };
    },
    async batch(stmts, mode = "write") {
      const list = Array.isArray(stmts) ? stmts : [];
      if (list.length === 0) return [];
      const client = await pool.connect();
      try {
        await client.query(mode === "read" ? "BEGIN READ ONLY" : "BEGIN");
        const results = [];
        for (const item of list) {
          const { sql, args } = normalizeStatementInput(item);
          const pgSql = translateSqlToPostgres(sql);
          const pgArgs = args.map(normalizePgArg);
          const res = await client.query(pgSql, pgArgs);
          results.push({
            rows: res.rows || [],
            rowsAffected: Number(res.rowCount || 0),
          });
        }
        await client.query("COMMIT");
        return results;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * HTTPS PostgreSQL Bridge client so Vercel Serverless functions can securely reach a
 * 24/7 Ubuntu laptop's local PostgreSQL (`127.0.0.1:5432`) over Tailscale Funnel or
 * Cloudflare Tunnel without router port-forwarding or ISP CGNAT issues.
 */
export function createPostgresBridgeClient({ bridgeUrl, bridgeSecret }) {
  const endpoint = `${String(bridgeUrl || "").replace(/\/+$/, "")}/sql`;
  const secret = String(bridgeSecret || "").trim();

  async function callBridge(payload) {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.ok) {
      const msg =
        json?.error ||
        `PostgreSQL bridge returned HTTP ${resp.status} (${endpoint})`;
      const err = new Error(msg);
      err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      throw err;
    }
    return json.data;
  }

  return {
    engine: "postgresql-bridge",
    async execute(stmtOrSql) {
      const { sql, args } = normalizeStatementInput(stmtOrSql);
      const data = await callBridge({
        mode: "execute",
        stmt: {
          sql,
          args: args.map(serializeArgForBridge),
        },
      });
      return {
        rows: Array.isArray(data?.rows) ? data.rows.map(deserializeRowFromBridge) : [],
        rowsAffected: Number(data?.rowsAffected || 0),
      };
    },
    async batch(stmts, txMode = "write") {
      const list = (Array.isArray(stmts) ? stmts : []).map((item) => {
        const { sql, args } = normalizeStatementInput(item);
        return {
          sql,
          args: args.map(serializeArgForBridge),
        };
      });
      if (list.length === 0) return [];
      const data = await callBridge({
        mode: "batch",
        txMode,
        stmts: list,
      });
      return (Array.isArray(data) ? data : []).map((res) => ({
        rows: Array.isArray(res?.rows) ? res.rows.map(deserializeRowFromBridge) : [],
        rowsAffected: Number(res?.rowsAffected || 0),
      }));
    },
  };
}
