import { createClient as createLibsqlClient } from "@libsql/client";
import { createPostgresPoolClient } from "../server/postgresAdapter.js";
import { initSchemaOnDb } from "../server/tursoBackend.js";

const TABLES_IN_ORDER = [
  "users",
  "oauth_mobile_handoffs",
  "friend_requests",
  "user_blocks",
  "messages",
  "conversation_settings",
  "sticker_library",
  "presence",
  "chat_typing",
  "push_devices",
  "community_moderators",
  "community_messages",
  "community_poll_votes",
  "community_user_settings",
  "groups",
  "group_members",
  "group_messages",
  "group_user_settings",
  "e2ee_user_keys",
  "e2ee_key_backups",
  "e2ee_group_keys",
  "media_blobs",
  "media_chunks",
  "linked_devices",
  "device_link_sessions",
  "scheduled_messages",
  "view_once_opens",
  "user_soundboards",
  "user_passkeys",
  "webauthn_challenges",
  "status_posts",
  "status_views",
  "status_privacy_defaults",
];

async function main() {
  const tursoUrl = (process.env.TURSO_DATABASE_URL || "").trim();
  const tursoToken = (process.env.TURSO_AUTH_TOKEN || "").trim();
  const pgUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();

  if (!tursoUrl || (!tursoToken && !tursoUrl.startsWith("file:"))) {
    console.error(
      "Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN for source database.",
    );
    process.exit(1);
  }
  if (!pgUrl) {
    console.error(
      "Missing DATABASE_URL (postgresql://...) for target PostgreSQL database.",
    );
    process.exit(1);
  }

  const src = createLibsqlClient(
    tursoUrl.startsWith("file:")
      ? { url: tursoUrl }
      : { url: tursoUrl, authToken: tursoToken },
  );
  const dst = createPostgresPoolClient(pgUrl);

  console.log("1. Initializing PostgreSQL schema...");
  await initSchemaOnDb(dst);

  for (const table of TABLES_IN_ORDER) {
    let rows = [];
    try {
      const res = await src.execute(`SELECT * FROM ${table}`);
      rows = res.rows || [];
    } catch {
      console.log(`   [skip] ${table} (not present in source)`);
      continue;
    }

    if (rows.length === 0) {
      console.log(`   [empty] ${table} (0 rows)`);
      continue;
    }

    const cols = Object.keys(rows[0]);
    const colList = cols.join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const insertSql = `INSERT OR IGNORE INTO ${table} (${colList}) VALUES (${placeholders})`;

    const batchSize = table === "media_blobs" || table === "media_chunks" ? 10 : 100;
    let copied = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const stmts = slice.map((r) => ({
        sql: insertSql,
        args: cols.map((c) => r[c]),
      }));
      await dst.batch(stmts, "write");
      copied += slice.length;
    }
    console.log(`   [ok] ${table}: migrated ${copied} rows`);
  }

  await dst.close();
  console.log("Migration to PostgreSQL complete!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
