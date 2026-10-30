import crypto from "node:crypto";
import { promisify } from "node:util";
import { createClient as createWebClient } from "@libsql/client/web";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const scryptAsync = promisify(crypto.scrypt);

export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
export const UNSEND_WINDOW_MS = 60 * 60 * 1000;
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const TOKEN_RENEW_THRESHOLD_MS = 20 * 24 * 60 * 60 * 1000;
export const USERNAME_REGEX = /^[a-z0-9._]{3,20}$/;
export const OWNER_EMAIL = "aidilzafri2013@gmail.com";

export class TursoAppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "TursoAppError";
    this.status = status;
  }
}

let cachedClient = null;
let cachedClientKey = "";
let schemaReadyForKey = "";
let schemaInitPromise = null;

export function getTursoConfig() {
  const url = (
    process.env.TURSO_DATABASE_URL ||
    process.env.LIBSQL_URL ||
    process.env.VITE_TURSO_DATABASE_URL ||
    ""
  ).trim();
  const authToken = (
    process.env.TURSO_AUTH_TOKEN ||
    process.env.LIBSQL_AUTH_TOKEN ||
    ""
  ).trim();
  return {
    configured: Boolean(url && (authToken || url.startsWith("file:"))),
    url,
    authToken,
  };
}

function getJwtSecret() {
  const explicit = (process.env.AUTH_SECRET || process.env.JWT_SECRET || "").trim();
  if (explicit) return explicit;
  const { authToken, url } = getTursoConfig();
  return crypto
    .createHash("sha256")
    .update(`jatext-turso-jwt-v1:${authToken}:${url}`)
    .digest("hex");
}

export async function getDb() {
  const { configured, url, authToken } = getTursoConfig();
  if (!configured) {
    throw new TursoAppError(
      "Turso database is not configured yet. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel Environment Variables.",
      503,
    );
  }
  const key = `${url}|${authToken.slice(0, 12)}`;
  if (!cachedClient || cachedClientKey !== key) {
    if (url.startsWith("file:")) {
      const mod = await import("@libsql/client");
      cachedClient = mod.createClient({ url });
    } else {
      cachedClient = createWebClient({ url, authToken });
    }
    cachedClientKey = key;
  }
  if (schemaReadyForKey !== key) {
    if (!schemaInitPromise) {
      schemaInitPromise = initSchema(cachedClient)
        .then(() => {
          schemaReadyForKey = key;
        })
        .finally(() => {
          schemaInitPromise = null;
        });
    }
    await schemaInitPromise;
  }
  return cachedClient;
}

async function initSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      google_sub TEXT UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      username TEXT UNIQUE,
      bio TEXT NOT NULL DEFAULT '',
      pronouns TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT 'black',
      avatar_url TEXT,
      banner_url TEXT,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      username_changed_at INTEGER,
      status_preference TEXT NOT NULL DEFAULT 'online',
      custom_status TEXT NOT NULL DEFAULT '',
      socials_json TEXT NOT NULL DEFAULT '[]',
      website_json TEXT,
      synced_theme_json TEXT,
      unsend_warning_shown_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_users_updated ON users(updated_at)`,

    `CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(from_id, to_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests(to_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_fr_from ON friend_requests(from_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_fr_updated ON friend_requests(updated_at)`,

    `CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id)`,

    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      pair_key TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_type TEXT,
      sticker_key TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'sent',
      edited_at INTEGER,
      reply_to_id TEXT,
      forwarded_from_id TEXT,
      unsent_at INTEGER,
      hidden_for_json TEXT NOT NULL DEFAULT '[]',
      reactions_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_msg_pair_created ON messages(pair_key, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_msg_pair_updated ON messages(pair_key, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_msg_recv_updated ON messages(receiver_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_msg_send_updated ON messages(sender_id, updated_at)`,

    `CREATE TABLE IF NOT EXISTS conversation_settings (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_muted INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, friend_id)
    )`,

    `CREATE TABLE IF NOT EXISTS sticker_library (
      user_id TEXT NOT NULL,
      media_key TEXT NOT NULL,
      url TEXT NOT NULL,
      preview_url TEXT,
      name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      source TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, media_key)
    )`,

    `CREATE TABLE IF NOT EXISTS presence (
      user_id TEXT PRIMARY KEY,
      last_seen_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      typing_to_id TEXT,
      typing_at INTEGER
    )`,

    `CREATE TABLE IF NOT EXISTS chat_typing (
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      typing_at INTEGER NOT NULL,
      PRIMARY KEY (channel_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_typing_channel ON chat_typing(channel_id, typing_at)`,

    `CREATE TABLE IF NOT EXISTS push_devices (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_push_user ON push_devices(user_id)`,

    `CREATE TABLE IF NOT EXISTS community_moderators (
      user_id TEXT PRIMARY KEY,
      elected_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS community_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text',
      poll_options_json TEXT NOT NULL DEFAULT '[]',
      poll_ended_at INTEGER,
      edited_at INTEGER,
      sticker_url TEXT,
      sticker_name TEXT,
      sticker_key TEXT,
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_type TEXT,
      reply_to_id TEXT,
      forwarded_from_name TEXT,
      forwarded_from_id TEXT,
      unsent_at INTEGER,
      hidden_for_json TEXT NOT NULL DEFAULT '[]',
      reactions_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_comm_created ON community_messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_comm_updated ON community_messages(updated_at)`,

    `CREATE TABLE IF NOT EXISTS community_poll_votes (
      poll_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (poll_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS community_user_settings (
      user_id TEXT PRIMARY KEY,
      is_muted INTEGER NOT NULL DEFAULT 0,
      last_read_at INTEGER,
      updated_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      muted INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gm_group ON group_members(group_id)`,

    `CREATE TABLE IF NOT EXISTS group_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      reply_to_id TEXT,
      forwarded_from_name TEXT,
      forwarded_from_id TEXT,
      sticker_url TEXT,
      sticker_name TEXT,
      sticker_key TEXT,
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_type TEXT,
      mentions_everyone INTEGER NOT NULL DEFAULT 0,
      mentioned_user_ids_json TEXT NOT NULL DEFAULT '[]',
      unsent_at INTEGER,
      edited_at INTEGER,
      hidden_for_json TEXT NOT NULL DEFAULT '[]',
      reactions_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_gmsg_group_created ON group_messages(group_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_gmsg_group_updated ON group_messages(group_id, updated_at)`,

    `CREATE TABLE IF NOT EXISTS group_user_settings (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      is_silenced INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      last_read_at INTEGER,
      cleared_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, group_id)
    )`,

    `CREATE TABLE IF NOT EXISTS e2ee_user_keys (
      user_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      dh_pub_b64 TEXT NOT NULL,
      sig_pub_b64 TEXT NOT NULL,
      self_sig_b64 TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, key_id)
    )`,

    `CREATE TABLE IF NOT EXISTS e2ee_key_backups (
      user_id TEXT PRIMARY KEY,
      key_id TEXT NOT NULL,
      sealed_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS e2ee_group_keys (
      group_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      sender_id TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, epoch, sender_id)
    )`,

    `CREATE TABLE IF NOT EXISTS media_blobs (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  ];

  await db.batch(statements, "write");
}

/* ==================== Auth & Crypto Helpers ==================== */

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(b64 + pad, "base64");
}

export function createAuthToken(userId, email) {
  const now = Date.now();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      email: email || "",
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + TOKEN_TTL_MS) / 1000),
    }),
  );
  const sig = base64UrlEncode(
    crypto.createHmac("sha256", getJwtSecret()).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

export function verifyAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = base64UrlEncode(
    crypto.createHmac("sha256", getJwtSecret()).update(`${header}.${payload}`).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(payload).toString("utf8"));
    if (!parsed?.sub || !parsed?.exp || parsed.exp * 1000 < Date.now()) {
      return null;
    }
    return {
      userId: String(parsed.sub),
      email: parsed.email ? String(parsed.email) : "",
      expMs: Number(parsed.exp) * 1000,
    };
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, hexHash] = storedHash.split(":");
  const derived = Buffer.from(await scryptAsync(password, salt, 64));
  const target = Buffer.from(hexHash, "hex");
  if (derived.length !== target.length) return false;
  return crypto.timingSafeEqual(derived, target);
}

export function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function safeJsonParse(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

export function pairKey(a, b) {
  return [String(a), String(b)].sort().join("|");
}

function isValidReactionEmoji(raw) {
  const clean = String(raw || "").trim();
  if (!clean || clean.length > 32) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3|[\u2600-\u27BF]/u.test(
    clean,
  );
}

export function mapUserRow(row, includePrivate = false) {
  if (!row) return null;
  const socials = safeJsonParse(row.socials_json, []);
  const website = safeJsonParse(row.website_json, undefined);
  const syncedTheme = includePrivate
    ? safeJsonParse(row.synced_theme_json, undefined)
    : undefined;
  return {
    id: String(row.id),
    ...(includePrivate && row.email ? { email: String(row.email) } : {}),
    displayName: String(row.display_name || ""),
    username: String(row.username || ""),
    bio: String(row.bio || ""),
    pronouns: String(row.pronouns || ""),
    avatarColor: String(row.avatar_color || "black"),
    ...(row.avatar_url ? { avatarUrl: String(row.avatar_url) } : {}),
    ...(row.banner_url ? { bannerUrl: String(row.banner_url) } : {}),
    onboardingComplete: Boolean(Number(row.onboarding_complete)),
    ...(row.username_changed_at != null
      ? { usernameChangedAt: Number(row.username_changed_at) }
      : {}),
    statusPreference: String(row.status_preference || "online"),
    customStatus: String(row.custom_status || ""),
    socials: Array.isArray(socials) ? socials : [],
    ...(website ? { website } : {}),
    ...(syncedTheme ? { syncedTheme } : {}),
  };
}

function isJaTextOwnerRow(row) {
  if (!row) return false;
  const email = String(row.email || "").trim().toLowerCase();
  const username = String(row.username || "").trim().toLowerCase();
  return email === OWNER_EMAIL || (email === OWNER_EMAIL && username === "imzachie");
}

function computeActivityStatus(pref, presenceRow) {
  const preference = pref || "online";
  if (preference === "offline") return "offline";
  const now = Date.now();
  const lastSeen = presenceRow ? Number(presenceRow.last_seen_at || 0) : 0;
  const lastActive = presenceRow ? Number(presenceRow.last_active_at || 0) : 0;
  if (!lastSeen || now - lastSeen > 120_000) return "offline";
  if (preference === "dnd") return "dnd";
  if (now - lastActive > 5 * 60_000) return "away";
  return "online";
}

/* ==================== Optional Background FCM Push ==================== */

function getFirebaseMessagingIfConfigured() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const creds = JSON.parse(raw);
    if (!creds?.project_id || !creds?.client_email || !creds?.private_key) return null;
    const appName = "jatext-turso-fcm";
    const app =
      getApps().find((a) => a.name === appName) ||
      initializeApp(
        {
          credential: cert({
            projectId: creds.project_id,
            clientEmail: creds.client_email,
            privateKey: creds.private_key,
          }),
        },
        appName,
      );
    return getMessaging(app);
  } catch {
    return null;
  }
}

function detectCallInfo(body) {
  const s = String(body || "");
  if (s.includes("(__JATEXT_CALL_DM_RINGING__:video)") || s.includes("(__JATEXT_CALL_GRP_ACTIVE__:video)")) {
    return { isCall: true, isVideo: true };
  }
  if (
    s.includes("(__JATEXT_CALL_DM_RINGING__:voice)") ||
    s.includes("(__JATEXT_CALL_GRP_ACTIVE__:voice)") ||
    s.includes("(__JATEXT_CALL_GRP_ACTIVE__)")
  ) {
    return { isCall: true, isVideo: false };
  }
  if (s.includes("__JATEXT_CALL__:") && s.includes('"state":"ringing"')) {
    return { isCall: true, isVideo: s.includes('"mode":"video"') };
  }
  if (s.includes("__JATEXT_CALL_GRP__:") && s.includes('"state":"active"')) {
    return { isCall: true, isVideo: s.includes('"mode":"video"') };
  }
  return { isCall: false, isVideo: false };
}

function summarizeReadablePushBody(body, fallback) {
  const s = String(body || "");
  const callInfo = detectCallInfo(s);
  if (callInfo.isCall) {
    if (s.includes("__JATEXT_CALL_GRP__:") || s.includes("__JATEXT_CALL_GRP_ACTIVE__")) {
      return callInfo.isVideo ? "Incoming group video call" : "Incoming group voice call";
    }
    return callInfo.isVideo ? "Incoming video call" : "Incoming voice call";
  }
  const stripped = s
    .replace(/__JATEXT_BUBBLE__:[^\n]*\n?/g, "")
    .replace(/__JATEXT_FWD_V1__:[^\n]*\n?/g, "")
    .replace(/__JATEXT_E2EE_V1__:[\s\S]*$/m, "")
    .replace(/[\u200B\u200C\u2063]/g, "")
    .trim()
    .slice(0, 200);
  return stripped || fallback;
}

async function dispatchPushToUsers(db, targetUserIds, payload) {
  if (!targetUserIds?.length) return;
  const messaging = getFirebaseMessagingIfConfigured();
  if (!messaging) return;
  const placeholders = targetUserIds.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT token FROM push_devices WHERE user_id IN (${placeholders})`,
    args: targetUserIds,
  });
  const tokens = res.rows.map((r) => String(r.token)).filter(Boolean);
  if (!tokens.length) return;

  const body = String(payload.body || "");
  if (body.startsWith("__JATEXT_SIG__:") || body.startsWith("__JATEXT_REACT__:")) {
    return;
  }
  const isCallCancel = body === "__JATEXT_CALL_CANCEL__";
  const callInfo = isCallCancel ? { isCall: false, isVideo: false } : detectCallInfo(body);
  const isEncrypted = body.includes("__JATEXT_E2EE_V1__:");
  const cleanBody = isCallCancel
    ? ""
    : summarizeReadablePushBody(body, isEncrypted ? "New message" : "Sent you an attachment");
  const includeRawWire = !isCallCancel && (isEncrypted || callInfo.isCall) && body.length <= 3500;
  const resolvedTitle =
    payload.title || (callInfo.isCall ? payload.senderName : `New message from ${payload.senderName}`);
  const resolvedType = isCallCancel
    ? "call_cancel"
    : callInfo.isCall
      ? "call"
      : payload.groupId
        ? "group_mention"
        : "message";

  try {
    const out = await messaging.sendEachForMulticast({
      tokens,
      data: {
        title: String(resolvedTitle),
        body: String(cleanBody),
        senderId: String(payload.senderId || ""),
        isEncrypted: isEncrypted ? "1" : "0",
        type: resolvedType,
        ...(callInfo.isCall ? { callMode: callInfo.isVideo ? "video" : "voice" } : {}),
        ...(includeRawWire ? { rawWire: body } : {}),
        ...(payload.groupId ? { groupId: String(payload.groupId) } : {}),
      },
      android: {
        priority: "high",
        ttl: callInfo.isCall || isCallCancel ? 60_000 : 86_400_000,
      },
    });
    const stale = [];
    out.responses.forEach((r, idx) => {
      if (
        !r.success &&
        (r.error?.code === "messaging/registration-token-not-registered" ||
          r.error?.code === "messaging/invalid-registration-token")
      ) {
        stale.push(tokens[idx]);
      }
    });
    if (stale.length) {
      const ph = stale.map(() => "?").join(",");
      await db.execute({ sql: `DELETE FROM push_devices WHERE token IN (${ph})`, args: stale });
    }
  } catch (err) {
    console.warn("FCM push error:", err?.message || err);
  }
}

/* ==================== Core Query Hydrators ==================== */

async function getUsersMap(db, userIds) {
  const unique = [...new Set(userIds.filter(Boolean).map(String))];
  const map = new Map();
  if (!unique.length) return map;
  const ph = unique.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT * FROM users WHERE id IN (${ph})`,
    args: unique,
  });
  for (const r of res.rows) {
    map.set(String(r.id), r);
  }
  return map;
}

async function getUserFavoriteMediaKeys(db, userId) {
  const res = await db.execute({
    sql: `SELECT media_key FROM sticker_library WHERE user_id = ? AND is_favorite = 1`,
    args: [userId],
  });
  return new Set(res.rows.map((r) => String(r.media_key)));
}

function hydrateDmMessages(rows, meId, replyLookupMap, favKeys) {
  const result = [];
  for (const r of rows) {
    const hiddenFor = safeJsonParse(r.hidden_for_json, []);
    if (Array.isArray(hiddenFor) && hiddenFor.includes(meId)) continue;
    const unsentAt = r.unsent_at != null ? Number(r.unsent_at) : undefined;
    const replyRow = r.reply_to_id ? replyLookupMap.get(String(r.reply_to_id)) : null;
    const mediaKey = r.sticker_key
      ? String(r.sticker_key)
      : r.attachment_url
        ? `klipy:${r.attachment_url}`
        : undefined;
    result.push({
      id: String(r.id),
      senderId: String(r.sender_id),
      receiverId: String(r.receiver_id),
      body: unsentAt ? "" : String(r.body || ""),
      ...(unsentAt || !r.attachment_url ? {} : { attachmentUrl: String(r.attachment_url) }),
      ...(unsentAt || !r.attachment_name ? {} : { attachmentName: String(r.attachment_name) }),
      ...(unsentAt || !r.attachment_type ? {} : { attachmentType: String(r.attachment_type) }),
      ...(mediaKey ? { stickerKey: mediaKey, isStickerFavorite: favKeys.has(mediaKey) } : {}),
      deliveryStatus: String(r.delivery_status || "sent"),
      ...(r.edited_at != null ? { editedAt: Number(r.edited_at) } : {}),
      createdAt: Number(r.created_at),
      ...(replyRow
        ? {
            replyTo: {
              id: String(replyRow.id),
              senderId: String(replyRow.sender_id),
              body: replyRow.unsent_at ? "Unsent message" : String(replyRow.body || "Attachment"),
            },
          }
        : {}),
      ...(r.forwarded_from_id ? { forwardedFrom: String(r.forwarded_from_id) } : {}),
      ...(unsentAt ? { unsentAt } : {}),
      reactions: unsentAt ? [] : safeJsonParse(r.reactions_json, []),
    });
  }
  return result;
}

async function hydrateGroupMessages(db, rows, meId, clearedAt = 0) {
  const visibleRows = rows.filter((r) => {
    const bodyStr = String(r.body || "");
    const isE2eeKeySignal =
      bodyStr.startsWith("__JATEXT_SIG__:") ||
      bodyStr.startsWith("__JATEXT_IK_V1__:") ||
      bodyStr.startsWith("__JATEXT_GK_V1__:") ||
      bodyStr.startsWith("__JATEXT_E2EE_IK__:") ||
      bodyStr.startsWith("__JATEXT_E2EE_GK__:");
    if (clearedAt && Number(r.created_at) <= clearedAt && !isE2eeKeySignal) return false;
    const hiddenFor = safeJsonParse(r.hidden_for_json, []);
    return !(Array.isArray(hiddenFor) && hiddenFor.includes(meId));
  });
  if (!visibleRows.length) return [];

  const replyIds = [
    ...new Set(visibleRows.map((r) => (r.reply_to_id ? String(r.reply_to_id) : null)).filter(Boolean)),
  ];
  const replyMap = new Map();
  for (const r of rows) replyMap.set(String(r.id), r);
  const missingReplyIds = replyIds.filter((id) => !replyMap.has(id));
  if (missingReplyIds.length) {
    const ph = missingReplyIds.map(() => "?").join(",");
    const repRes = await db.execute({
      sql: `SELECT * FROM group_messages WHERE id IN (${ph})`,
      args: missingReplyIds,
    });
    for (const r of repRes.rows) replyMap.set(String(r.id), r);
  }

  const userIds = new Set();
  for (const r of visibleRows) {
    userIds.add(String(r.sender_id));
    if (r.forwarded_from_id) userIds.add(String(r.forwarded_from_id));
    const rep = r.reply_to_id ? replyMap.get(String(r.reply_to_id)) : null;
    if (rep) userIds.add(String(rep.sender_id));
  }
  const [usersMap, favKeys] = await Promise.all([
    getUsersMap(db, [...userIds]),
    getUserFavoriteMediaKeys(db, meId),
  ]);

  return visibleRows.map((r) => {
    const sender = mapUserRow(usersMap.get(String(r.sender_id)));
    const unsentAt = r.unsent_at != null ? Number(r.unsent_at) : undefined;
    const rep = r.reply_to_id ? replyMap.get(String(r.reply_to_id)) : null;
    const repSender = rep ? mapUserRow(usersMap.get(String(rep.sender_id))) : null;
    const fwdSender = r.forwarded_from_id
      ? mapUserRow(usersMap.get(String(r.forwarded_from_id)))
      : null;
    const mediaKey = r.sticker_key
      ? String(r.sticker_key)
      : r.sticker_url
        ? `klipy:${r.sticker_url}`
        : r.attachment_url
          ? `klipy:${r.attachment_url}`
          : undefined;
    return {
      id: String(r.id),
      senderId: String(r.sender_id),
      senderName: sender?.displayName || sender?.username || "JaText user",
      senderUsername: sender?.username || "user",
      ...(sender?.avatarUrl ? { senderAvatarUrl: sender.avatarUrl } : {}),
      senderAvatarColor: sender?.avatarColor || "black",
      body: unsentAt ? "" : String(r.body || ""),
      ...(unsentAt || !r.attachment_url ? {} : { attachmentUrl: String(r.attachment_url) }),
      ...(unsentAt || !r.attachment_name ? {} : { attachmentName: String(r.attachment_name) }),
      ...(unsentAt || !r.attachment_type ? {} : { attachmentType: String(r.attachment_type) }),
      ...(unsentAt || !r.sticker_url ? {} : { stickerUrl: String(r.sticker_url) }),
      ...(unsentAt || !r.sticker_name ? {} : { stickerName: String(r.sticker_name) }),
      ...(mediaKey ? { stickerKey: mediaKey, isStickerFavorite: favKeys.has(mediaKey) } : {}),
      ...(r.forwarded_from_name || fwdSender
        ? {
            forwardedFromName: String(
              r.forwarded_from_name || fwdSender?.displayName || fwdSender?.username || "JaText user",
            ),
          }
        : {}),
      ...(rep
        ? {
            replyTo: {
              id: String(rep.id),
              senderId: String(rep.sender_id),
              senderName: repSender?.displayName || repSender?.username || "JaText user",
              body: rep.unsent_at ? "Unsent message" : String(rep.body || "Attachment"),
            },
          }
        : {}),
      createdAt: Number(r.created_at),
      ...(r.edited_at != null ? { editedAt: Number(r.edited_at) } : {}),
      ...(unsentAt ? { unsentAt } : {}),
      mentionsEveryone: Boolean(Number(r.mentions_everyone || 0)),
      mentionedUserIds: safeJsonParse(r.mentioned_user_ids_json, []),
      reactions: unsentAt ? [] : safeJsonParse(r.reactions_json, []),
    };
  });
}

async function getCommunityRole(db, meRow) {
  const modRes = await db.execute(`SELECT user_id FROM community_moderators`);
  const moderatorIds = modRes.rows.map((r) => String(r.user_id));
  const isOwner = isJaTextOwnerRow(meRow);
  const canModerate = isOwner || moderatorIds.includes(String(meRow.id));
  return { isOwner, canModerate, moderatorIds };
}

async function hydrateCommunityMessages(db, rows, meRow, role) {
  const meId = String(meRow.id);
  const visible = rows.filter((r) => {
    const hiddenFor = safeJsonParse(r.hidden_for_json, []);
    return !(Array.isArray(hiddenFor) && hiddenFor.includes(meId));
  });
  if (!visible.length) return [];

  const pollIds = visible.filter((r) => r.type === "poll").map((r) => String(r.id));
  const votesByPoll = new Map();
  if (pollIds.length) {
    const ph = pollIds.map(() => "?").join(",");
    const voteRes = await db.execute({
      sql: `SELECT poll_id, user_id, option_index FROM community_poll_votes WHERE poll_id IN (${ph})`,
      args: pollIds,
    });
    for (const v of voteRes.rows) {
      const pid = String(v.poll_id);
      if (!votesByPoll.has(pid)) votesByPoll.set(pid, []);
      votesByPoll.get(pid).push({
        userId: String(v.user_id),
        optionIndex: Number(v.option_index),
      });
    }
  }

  const replyMap = new Map();
  for (const r of rows) replyMap.set(String(r.id), r);
  const userIds = new Set();
  for (const r of visible) {
    userIds.add(String(r.sender_id));
    if (r.forwarded_from_id) userIds.add(String(r.forwarded_from_id));
    const rep = r.reply_to_id ? replyMap.get(String(r.reply_to_id)) : null;
    if (rep) userIds.add(String(rep.sender_id));
  }
  const [usersMap, favKeys] = await Promise.all([
    getUsersMap(db, [...userIds]),
    getUserFavoriteMediaKeys(db, meId),
  ]);

  return visible.map((r) => {
    const sender = mapUserRow(usersMap.get(String(r.sender_id)));
    const unsentAt = r.unsent_at != null ? Number(r.unsent_at) : undefined;
    const votes = votesByPoll.get(String(r.id)) || [];
    const myVoteObj = votes.find((v) => v.userId === meId);
    const rep = r.reply_to_id ? replyMap.get(String(r.reply_to_id)) : null;
    const repSender = rep ? mapUserRow(usersMap.get(String(rep.sender_id))) : null;
    const mediaKey = r.sticker_key
      ? String(r.sticker_key)
      : r.sticker_url
        ? `klipy:${r.sticker_url}`
        : r.attachment_url
          ? `klipy:${r.attachment_url}`
          : undefined;
    return {
      id: String(r.id),
      senderId: String(r.sender_id),
      senderName: sender?.displayName || sender?.username || "JaText Official",
      senderUsername: sender?.username || "jatext",
      ...(sender?.avatarUrl ? { senderAvatarUrl: sender.avatarUrl } : {}),
      senderAvatarColor: sender?.avatarColor || "black",
      body: unsentAt ? "" : String(r.body || ""),
      type: String(r.type || "text"),
      pollOptions: safeJsonParse(r.poll_options_json, []),
      ...(r.poll_ended_at != null ? { pollEndedAt: Number(r.poll_ended_at) } : {}),
      votes,
      ...(myVoteObj ? { myVote: myVoteObj.optionIndex } : {}),
      createdAt: Number(r.created_at),
      ...(r.edited_at != null ? { editedAt: Number(r.edited_at) } : {}),
      ...(unsentAt ? { unsentAt } : {}),
      ...(unsentAt || !r.attachment_url ? {} : { attachmentUrl: String(r.attachment_url) }),
      ...(unsentAt || !r.attachment_name ? {} : { attachmentName: String(r.attachment_name) }),
      ...(unsentAt || !r.attachment_type ? {} : { attachmentType: String(r.attachment_type) }),
      ...(unsentAt || !r.sticker_url ? {} : { stickerUrl: String(r.sticker_url) }),
      ...(unsentAt || !r.sticker_name ? {} : { stickerName: String(r.sticker_name) }),
      ...(mediaKey ? { stickerKey: mediaKey, isStickerFavorite: favKeys.has(mediaKey) } : {}),
      ...(r.forwarded_from_name ? { forwardedFromName: String(r.forwarded_from_name) } : {}),
      ...(rep
        ? {
            replyTo: {
              id: String(rep.id),
              senderId: String(rep.sender_id),
              senderName: repSender?.displayName || repSender?.username || "JaText Official",
              body: rep.unsent_at ? "Unsent message" : String(rep.body || "Attachment"),
            },
          }
        : {}),
      reactions: unsentAt ? [] : safeJsonParse(r.reactions_json, []),
      canModerate: role.canModerate,
      isOwner: role.isOwner,
    };
  });
}

async function listMyGroupsHydrated(db, meId) {
  const memRes = await db.execute({
    sql: `SELECT gm.group_id, gm.role, gm.muted, g.name, g.owner_id, g.avatar_url, g.created_at,
                 gus.is_silenced, gus.is_archived, gus.last_read_at, gus.cleared_at
          FROM group_members gm
          JOIN groups g ON g.id = gm.group_id
          LEFT JOIN group_user_settings gus ON gus.group_id = gm.group_id AND gus.user_id = ?
          WHERE gm.user_id = ?`,
    args: [meId, meId],
  });
  if (!memRes.rows.length) return [];

  const groupIds = memRes.rows.map((r) => String(r.group_id));
  const ph = groupIds.map(() => "?").join(",");

  const [countsRes, latestMsgsRes] = await Promise.all([
    db.execute({
      sql: `SELECT group_id, COUNT(*) AS cnt FROM group_members WHERE group_id IN (${ph}) GROUP BY group_id`,
      args: groupIds,
    }),
    db.execute({
      sql: `SELECT gm1.*
            FROM group_messages gm1
            INNER JOIN (
              SELECT group_id, MAX(created_at) AS max_created
              FROM group_messages
              WHERE group_id IN (${ph})
                AND body NOT LIKE '__JATEXT_SIG__:%'
                AND body NOT LIKE '__JATEXT_REACT__:%'
              GROUP BY group_id
            ) gm2 ON gm1.group_id = gm2.group_id AND gm1.created_at = gm2.max_created`,
      args: groupIds,
    }),
  ]);

  const countMap = new Map();
  for (const c of countsRes.rows) countMap.set(String(c.group_id), Number(c.cnt));

  const latestMap = new Map();
  const senderIds = [];
  for (const m of latestMsgsRes.rows) {
    latestMap.set(String(m.group_id), m);
    senderIds.push(String(m.sender_id));
  }
  const sendersMap = await getUsersMap(db, senderIds);

  const summaries = memRes.rows.map((r) => {
    const gid = String(r.group_id);
    const clearedAt = r.cleared_at != null ? Number(r.cleared_at) : 0;
    const latest = latestMap.get(gid);
    const showLatest = latest && (!clearedAt || Number(latest.created_at) > clearedAt);
    const sender = showLatest ? mapUserRow(sendersMap.get(String(latest.sender_id))) : null;
    const mentionedIds = showLatest ? safeJsonParse(latest.mentioned_user_ids_json, []) : [];
    const lastMentionedMe = showLatest
      ? Boolean(Number(latest.mentions_everyone || 0)) ||
        (Array.isArray(mentionedIds) && mentionedIds.includes(meId))
      : false;
    const lastMessage = !showLatest
      ? ""
      : latest.unsent_at
        ? "Message unsent"
        : String(
            latest.body ||
              (latest.sticker_url ? `Sticker: ${latest.sticker_name || "Sticker"}` : "") ||
              (latest.attachment_name ? `Attachment: ${latest.attachment_name}` : ""),
          );
    return {
      id: gid,
      name: String(r.name),
      ...(r.avatar_url ? { avatarUrl: String(r.avatar_url) } : {}),
      ownerId: String(r.owner_id),
      role: String(r.role),
      memberCount: countMap.get(gid) || 1,
      lastMessage,
      lastMessageAt: showLatest ? Number(latest.created_at) : Number(r.created_at),
      ...(showLatest ? { lastSenderId: String(latest.sender_id) } : {}),
      ...(sender ? { lastSenderName: sender.displayName || sender.username } : {}),
      lastMentionedMe,
      isSilenced: Boolean(Number(r.is_silenced || 0)),
      isArchived: Boolean(Number(r.is_archived || 0)),
    };
  });

  summaries.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return summaries;
}

async function buildSocialAndPreviews(db, meId) {
  const [frRes, blockRes, settingsRes] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM friend_requests WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC`,
      args: [meId, meId],
    }),
    db.execute({
      sql: `SELECT blocked_id FROM user_blocks WHERE blocker_id = ?`,
      args: [meId],
    }),
    db.execute({
      sql: `SELECT * FROM conversation_settings WHERE user_id = ?`,
      args: [meId],
    }),
  ]);

  const blockedUserIds = blockRes.rows.map((r) => String(r.blocked_id));
  const settingsByFriend = new Map();
  for (const s of settingsRes.rows) {
    settingsByFriend.set(String(s.friend_id), s);
  }

  const relatedUserIds = new Set();
  for (const r of frRes.rows) {
    relatedUserIds.add(String(r.from_id));
    relatedUserIds.add(String(r.to_id));
  }
  const usersMap = await getUsersMap(db, [...relatedUserIds]);

  const friendIdsSet = new Set();
  const incoming = [];
  const outgoing = [];

  for (const r of frRes.rows) {
    const status = String(r.status);
    const fromId = String(r.from_id);
    const toId = String(r.to_id);
    if (status === "accepted") {
      const otherId = fromId === meId ? toId : fromId;
      if (otherId !== meId) friendIdsSet.add(otherId);
    } else if (status === "pending") {
      const fromUser = mapUserRow(usersMap.get(fromId));
      const toUser = mapUserRow(usersMap.get(toId));
      if (!fromUser || !toUser) continue;
      const reqObj = {
        id: String(r.id),
        from: fromUser,
        to: toUser,
        status: "pending",
        createdAt: Number(r.created_at),
      };
      if (toId === meId) incoming.push(reqObj);
      else if (fromId === meId) outgoing.push(reqObj);
    }
  }

  const friendIds = [...friendIdsSet];
  const friends = friendIds
    .map((fid) => mapUserRow(usersMap.get(fid)))
    .filter(Boolean)
    .sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));

  // Presence & typing for friends
  let friendActivities = [];
  if (friendIds.length) {
    const ph = friendIds.map(() => "?").join(",");
    const presRes = await db.execute({
      sql: `SELECT * FROM presence WHERE user_id IN (${ph})`,
      args: friendIds,
    });
    const presMap = new Map();
    for (const p of presRes.rows) presMap.set(String(p.user_id), p);
    const now = Date.now();
    friendActivities = friends.map((f) => {
      const p = presMap.get(f.id);
      const isTyping =
        Boolean(p && String(p.typing_to_id || "") === meId && now - Number(p.typing_at || 0) < 6_000);
      return {
        userId: f.id,
        status: computeActivityStatus(f.statusPreference, p),
        customStatus: f.customStatus || "",
        isTyping,
      };
    });
  }

  // Previews per friend
  let previews = [];
  if (friendIds.length) {
    const pairKeys = friendIds.map((fid) => pairKey(meId, fid));
    const ph = pairKeys.map(() => "?").join(",");
    const latestRes = await db.execute({
      sql: `SELECT m1.*
            FROM messages m1
            INNER JOIN (
              SELECT pair_key, MAX(created_at) AS max_created
              FROM messages
              WHERE pair_key IN (${ph})
                AND body NOT LIKE '__JATEXT_SIG__:%'
                AND body NOT LIKE '__JATEXT_REACT__:%'
              GROUP BY pair_key
            ) m2 ON m1.pair_key = m2.pair_key AND m1.created_at = m2.max_created`,
      args: pairKeys,
    });
    const latestByPair = new Map();
    for (const m of latestRes.rows) {
      latestByPair.set(String(m.pair_key), m);
    }

    previews = friendIds.map((fid) => {
      const pk = pairKey(meId, fid);
      const s = settingsByFriend.get(fid);
      const deletedAt = s?.deleted_at != null ? Number(s.deleted_at) : 0;
      const m = latestByPair.get(pk);
      const hiddenFor = m ? safeJsonParse(m.hidden_for_json, []) : [];
      const visible =
        m &&
        (!deletedAt || Number(m.created_at) > deletedAt) &&
        !(Array.isArray(hiddenFor) && hiddenFor.includes(meId));
      const bodyText = !visible
        ? ""
        : m.unsent_at
          ? "Message unsent"
          : String(
              m.body ||
                (m.attachment_type?.startsWith("audio/")
                  ? "Voice note"
                  : m.attachment_name
                    ? `Attachment: ${m.attachment_name}`
                    : ""),
            );
      return {
        friendId: fid,
        body: bodyText,
        createdAt: visible ? Number(m.created_at) : 0,
        senderId: visible ? String(m.sender_id) : "",
        isArchived: Boolean(Number(s?.is_archived || 0)),
        isMuted: Boolean(Number(s?.is_muted || 0)),
      };
    });
    previews.sort((a, b) => b.createdAt - a.createdAt);
  }

  return { friends, incoming, outgoing, blockedUserIds, previews, friendActivities };
}

async function getStickersForUser(db, userId) {
  const res = await db.execute({
    sql: `SELECT * FROM sticker_library WHERE user_id = ? ORDER BY COALESCE(last_used_at, updated_at) DESC LIMIT 80`,
    args: [userId],
  });
  const mapRow = (r) => ({
    key: String(r.media_key),
    url: String(r.url),
    ...(r.preview_url ? { previewUrl: String(r.preview_url) } : {}),
    name: String(r.name),
    mediaType: String(r.media_type),
    source: String(r.source),
    isFavorite: Boolean(Number(r.is_favorite || 0)),
    useCount: Number(r.use_count || 0),
    ...(r.last_used_at != null ? { lastUsedAt: Number(r.last_used_at) } : {}),
  });
  const all = res.rows.map(mapRow);
  return {
    stickerFavorites: all.filter((s) => s.isFavorite),
    recentStickers: all.filter((s) => (s.lastUsedAt || 0) > 0).slice(0, 32),
  };
}

async function areFriendsInDb(db, a, b) {
  const res = await db.execute({
    sql: `SELECT status FROM friend_requests WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND status = 'accepted' LIMIT 1`,
    args: [a, b, b, a],
  });
  return res.rows.length > 0;
}

async function isBlockedEitherWay(db, a, b) {
  const res = await db.execute({
    sql: `SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`,
    args: [a, b, b, a],
  });
  return res.rows.length > 0;
}

async function requireMeRow(db, auth) {
  if (!auth?.userId) throw new TursoAppError("Please sign in first.", 401);
  const res = await db.execute({
    sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
    args: [auth.userId],
  });
  if (!res.rows.length) {
    throw new TursoAppError("Session account was not found. Please sign in again.", 401);
  }
  return res.rows[0];
}

/* ==================== Google OAuth Upsert ==================== */

export async function upsertGoogleOAuthAccount({ googleSub, email, name, picture }) {
  const db = await getDb();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !googleSub) {
    throw new TursoAppError("Google did not return an email address.", 400);
  }
  const now = Date.now();
  const existing = await db.execute({
    sql: `SELECT * FROM users WHERE google_sub = ? OR email = ? LIMIT 1`,
    args: [googleSub, cleanEmail],
  });

  if (existing.rows.length) {
    const user = existing.rows[0];
    const uid = String(user.id);
    const nextAvatar = user.avatar_url || picture || null;
    const nextName = user.display_name || name || cleanEmail.split("@")[0];
    await db.execute({
      sql: `UPDATE users SET google_sub = ?, email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?`,
      args: [googleSub, cleanEmail, nextName, nextAvatar, now, uid],
    });
    const updated = await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [uid] });
    return {
      token: createAuthToken(uid, cleanEmail),
      me: mapUserRow(updated.rows[0], true),
    };
  }

  const uid = newId();
  const displayName = String(name || cleanEmail.split("@")[0]).slice(0, 50);
  await db.execute({
    sql: `INSERT INTO users (id, email, google_sub, display_name, avatar_url, avatar_color, onboarding_complete, status_preference, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'black', 0, 'online', ?, ?)`,
    args: [uid, cleanEmail, googleSub, displayName, picture || null, now, now],
  });
  const created = await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [uid] });
  return {
    token: createAuthToken(uid, cleanEmail),
    me: mapUserRow(created.rows[0], true),
  };
}

/* ==================== Main RPC Dispatcher ==================== */

export async function handleTursoRpc(op, args = {}, authHeader = "") {
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const auth = rawToken ? verifyAuthToken(rawToken) : null;
  const db = await getDb();
  const now = Date.now();

  switch (op) {
    /* ---------- Public / Auth ---------- */
    case "signUpEmail": {
      const email = String(args.email || "").trim().toLowerCase();
      const password = String(args.password || "");
      if (!email || !email.includes("@")) {
        throw new TursoAppError("Enter a valid email address.");
      }
      if (password.length < 8) {
        throw new TursoAppError("Password must be at least 8 characters long.");
      }
      const existing = await db.execute({
        sql: `SELECT * FROM users WHERE email = ? LIMIT 1`,
        args: [email],
      });
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (!row.password_hash) {
          // Account was created via Google OAuth; let them attach a password seamlessly or guide them!
          throw new TursoAppError(
            "This email is already registered with Google. Tap 'Continue with Google' above.",
          );
        }
        throw new TursoAppError("An account with this email already exists. Switch to 'Sign in'.");
      }
      const uid = newId();
      const pwHash = await hashPassword(password);
      const defaultDisplay = email.split("@")[0].slice(0, 40);
      await db.execute({
        sql: `INSERT INTO users (id, email, password_hash, display_name, avatar_color, onboarding_complete, status_preference, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'black', 0, 'online', ?, ?)`,
        args: [uid, email, pwHash, defaultDisplay, now, now],
      });
      const created = await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [uid] });
      return {
        token: createAuthToken(uid, email),
        me: mapUserRow(created.rows[0], true),
      };
    }

    case "signInEmail": {
      const email = String(args.email || "").trim().toLowerCase();
      const password = String(args.password || "");
      const res = await db.execute({
        sql: `SELECT * FROM users WHERE email = ? LIMIT 1`,
        args: [email],
      });
      if (!res.rows.length) {
        throw new TursoAppError("No account found for that email. Switch to 'Sign up' to create one.");
      }
      const user = res.rows[0];
      if (!user.password_hash) {
        throw new TursoAppError(
          "This account signs in with Google. Tap 'Continue with Google' above.",
        );
      }
      const valid = await verifyPassword(password, String(user.password_hash));
      if (!valid) {
        throw new TursoAppError("Incorrect email or password.");
      }
      const uid = String(user.id);
      return {
        token: createAuthToken(uid, email),
        me: mapUserRow(user, true),
      };
    }

    case "checkUsername": {
      const username = String(args.username || "").trim().toLowerCase();
      if (!USERNAME_REGEX.test(username)) {
        return {
          available: false,
          message: "3 to 20 characters: lowercase letters, numbers, . or _",
        };
      }
      const res = await db.execute({
        sql: `SELECT id FROM users WHERE username = ? LIMIT 1`,
        args: [username],
      });
      if (res.rows.length && String(res.rows[0].id) !== String(auth?.userId || "")) {
        return { available: false, message: `@${username} is already taken` };
      }
      return { available: true };
    }

    /* ---------- Bootstrap & Delta Sync ---------- */
    case "bootstrap": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);

      // Update presence on bootstrap
      await db.execute({
        sql: `INSERT INTO presence (user_id, last_seen_at, last_active_at)
              VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, last_active_at = excluded.last_active_at`,
        args: [meId, now, now],
      });

      const [
        social,
        stickers,
        commRole,
        commSettingsRes,
        commMsgsRes,
        groups,
        vaultRes,
        commDirRes,
      ] = await Promise.all([
        buildSocialAndPreviews(db, meId),
        getStickersForUser(db, meId),
        getCommunityRole(db, meRow),
        db.execute({
          sql: `SELECT * FROM community_user_settings WHERE user_id = ? LIMIT 1`,
          args: [meId],
        }),
        db.execute(`SELECT * FROM community_messages ORDER BY created_at DESC LIMIT 120`),
        listMyGroupsHydrated(db, meId),
        db.execute({
          sql: `SELECT key_id FROM e2ee_key_backups WHERE user_id = ? LIMIT 1`,
          args: [meId],
        }),
        isJaTextOwnerRow(meRow)
          ? db.execute(
              `SELECT id, username, display_name, avatar_color, avatar_url, created_at FROM users WHERE onboarding_complete = 1 AND username IS NOT NULL ORDER BY created_at DESC LIMIT 200`,
            )
          : Promise.resolve({ rows: [] }),
      ]);

      const communityMessages = await hydrateCommunityMessages(
        db,
        [...commMsgsRes.rows].reverse(),
        meRow,
        commRole,
      );

      const communityDirectory = commDirRes.rows.map((u) => ({
        id: String(u.id),
        username: String(u.username || ""),
        displayName: String(u.display_name || ""),
        avatarColor: String(u.avatar_color || "black"),
        ...(u.avatar_url ? { avatarUrl: String(u.avatar_url) } : {}),
        createdAt: Number(u.created_at || 0),
      }));

      const refreshedToken =
        auth.expMs - now < TOKEN_RENEW_THRESHOLD_MS
          ? createAuthToken(meId, String(meRow.email || ""))
          : undefined;

      return {
        serverTime: now,
        me: mapUserRow(meRow, true),
        ...social,
        ...stickers,
        communityPermissions: commRole,
        communityDirectory,
        communityMuted: Boolean(Number(commSettingsRes.rows[0]?.is_muted || 0)),
        communityMessages,
        groups,
        hasRemoteE2EEVault: vaultRes.rows.length > 0,
        remoteVaultKeyId: vaultRes.rows[0] ? String(vaultRes.rows[0].key_id) : null,
        ...(refreshedToken ? { refreshedToken } : {}),
      };
    }

    case "sync": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const sinceTs = Math.max(0, Number(args.sinceTs || 0) - 1200);
      const activeFriendId = args.activeFriendId ? String(args.activeFriendId) : null;
      const activeGroupId = args.activeGroupId ? String(args.activeGroupId) : null;

      if (args.touchPresence) {
        await db.execute({
          sql: `INSERT INTO presence (user_id, last_seen_at, last_active_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, last_active_at = excluded.last_active_at`,
          args: [meId, now, now],
        });
      }

      // Check deltas in parallel
      const activePairKey = activeFriendId ? pairKey(meId, activeFriendId) : null;
      const [
        dmDeltaRes,
        activeDmDeltaRes,
        frDeltaRes,
        commDeltaRes,
        grpMsgDeltaRes,
        grpTypingRes,
        commTypingRes,
      ] = await Promise.all([
        db.execute({
          sql: `SELECT id FROM messages WHERE (receiver_id = ? OR sender_id = ?) AND updated_at > ? LIMIT 1`,
          args: [meId, meId, sinceTs],
        }),
        activePairKey
          ? db.execute({
              sql: `SELECT * FROM messages WHERE pair_key = ? AND updated_at > ? ORDER BY created_at ASC LIMIT 120`,
              args: [activePairKey, sinceTs],
            })
          : Promise.resolve({ rows: [] }),
        db.execute({
          sql: `SELECT id FROM friend_requests WHERE (from_id = ? OR to_id = ?) AND updated_at > ? LIMIT 1`,
          args: [meId, meId, sinceTs],
        }),
        db.execute({
          sql: `SELECT * FROM community_messages WHERE updated_at > ? ORDER BY created_at ASC LIMIT 80`,
          args: [sinceTs],
        }),
        activeGroupId
          ? db.execute({
              sql: `SELECT * FROM group_messages WHERE group_id = ? AND updated_at > ? ORDER BY created_at ASC LIMIT 120`,
              args: [activeGroupId, sinceTs],
            })
          : Promise.resolve({ rows: [] }),
        activeGroupId
          ? db.execute({
              sql: `SELECT user_id FROM chat_typing WHERE channel_id = ? AND typing_at > ? AND user_id != ?`,
              args: [`group:${activeGroupId}`, now - 6_000, meId],
            })
          : Promise.resolve({ rows: [] }),
        args.includeCommunity
          ? db.execute({
              sql: `SELECT user_id FROM chat_typing WHERE channel_id = 'community' AND typing_at > ? AND user_id != ?`,
              args: [now - 6_000, meId],
            })
          : Promise.resolve({ rows: [] }),
      ]);

      // Check if any group summary changed
      const myGroupsCheck = await db.execute({
        sql: `SELECT 1 FROM group_members gm
              LEFT JOIN groups g ON g.id = gm.group_id
              LEFT JOIN group_messages m ON m.group_id = gm.group_id AND m.updated_at > ?
              WHERE gm.user_id = ? AND (gm.updated_at > ? OR g.updated_at > ? OR m.id IS NOT NULL)
              LIMIT 1`,
        args: [sinceTs, meId, sinceTs, sinceTs],
      });

      const needSocialRefresh =
        dmDeltaRes.rows.length > 0 ||
        frDeltaRes.rows.length > 0 ||
        Boolean(args.includePresence);

      const social = needSocialRefresh ? await buildSocialAndPreviews(db, meId) : null;

      let changedDmMessages = [];
      if (activeDmDeltaRes.rows.length > 0) {
        const replyIds = activeDmDeltaRes.rows
          .map((r) => (r.reply_to_id ? String(r.reply_to_id) : null))
          .filter(Boolean);
        const replyMap = new Map();
        for (const r of activeDmDeltaRes.rows) replyMap.set(String(r.id), r);
        if (replyIds.length) {
          const ph = replyIds.map(() => "?").join(",");
          const repRes = await db.execute({
            sql: `SELECT * FROM messages WHERE id IN (${ph})`,
            args: replyIds,
          });
          for (const r of repRes.rows) replyMap.set(String(r.id), r);
        }
        const favKeys = await getUserFavoriteMediaKeys(db, meId);
        changedDmMessages = hydrateDmMessages(activeDmDeltaRes.rows, meId, replyMap, favKeys);
      }

      let changedGroupMessages = [];
      if (activeGroupId && grpMsgDeltaRes.rows.length > 0) {
        const gus = await db.execute({
          sql: `SELECT cleared_at FROM group_user_settings WHERE user_id = ? AND group_id = ? LIMIT 1`,
          args: [meId, activeGroupId],
        });
        const clearedAt = gus.rows[0]?.cleared_at != null ? Number(gus.rows[0].cleared_at) : 0;
        changedGroupMessages = await hydrateGroupMessages(
          db,
          grpMsgDeltaRes.rows,
          meId,
          clearedAt,
        );
      }

      let changedCommunityMessages = [];
      if (commDeltaRes.rows.length > 0) {
        const role = await getCommunityRole(db, meRow);
        changedCommunityMessages = await hydrateCommunityMessages(
          db,
          commDeltaRes.rows,
          meRow,
          role,
        );
      }

      const groups =
        myGroupsCheck.rows.length > 0 || args.forceGroups
          ? await listMyGroupsHydrated(db, meId)
          : undefined;

      // Resolve typing users
      const mapTypingUsers = async (rows) => {
        if (!rows.length) return [];
        const umap = await getUsersMap(
          db,
          rows.map((r) => String(r.user_id)),
        );
        return rows
          .map((r) => mapUserRow(umap.get(String(r.user_id))))
          .filter(Boolean)
          .map((u) => ({ id: u.id, displayName: u.displayName, username: u.username }));
      };

      const [groupTypingUsers, communityTypingUsers] = await Promise.all([
        mapTypingUsers(grpTypingRes.rows),
        mapTypingUsers(commTypingRes.rows),
      ]);

      return {
        serverTime: now,
        ...(Number(meRow.updated_at) > sinceTs ? { me: mapUserRow(meRow, true) } : {}),
        ...(social ? { social } : {}),
        ...(changedDmMessages.length ? { changedDmMessages } : {}),
        ...(changedGroupMessages.length ? { changedGroupMessages } : {}),
        ...(changedCommunityMessages.length ? { changedCommunityMessages } : {}),
        ...(groups ? { groups } : {}),
        groupTypingUsers,
        communityTypingUsers,
      };
    }

    /* ---------- Profile & Presence ---------- */
    case "saveProfile": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const displayName = String(args.displayName || "").trim().slice(0, 50);
      const username = String(args.username || "").trim().toLowerCase();
      const bio = String(args.bio || "").slice(0, 300);
      const pronouns = String(args.pronouns || "").trim().slice(0, 40);
      const avatarColor = String(args.avatarColor || "black");

      if (!displayName) throw new TursoAppError("Display name is required.");
      if (!USERNAME_REGEX.test(username)) {
        throw new TursoAppError("Username must be 3 to 20 chars (lowercase letters, numbers, . or _).");
      }

      const conflict = await db.execute({
        sql: `SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1`,
        args: [username, meId],
      });
      if (conflict.rows.length) {
        throw new TursoAppError(`@${username} is already taken.`);
      }

      const prevUsername = String(meRow.username || "");
      const wasOnboarded = Boolean(Number(meRow.onboarding_complete || 0));
      let usernameChangedAt =
        meRow.username_changed_at != null ? Number(meRow.username_changed_at) : null;
      if (wasOnboarded && prevUsername && prevUsername !== username) {
        if (usernameChangedAt && now - usernameChangedAt < FOURTEEN_DAYS_MS) {
          const daysLeft = Math.ceil((FOURTEEN_DAYS_MS - (now - usernameChangedAt)) / 86_400_000);
          throw new TursoAppError(
            `You can change your username again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
          );
        }
        usernameChangedAt = now;
      }

      const avatarUrl =
        args.avatarUrl === null
          ? null
          : args.avatarUrl !== undefined
            ? String(args.avatarUrl)
            : meRow.avatar_url;
      const bannerUrl =
        args.bannerUrl === null
          ? null
          : args.bannerUrl !== undefined
            ? String(args.bannerUrl)
            : meRow.banner_url;
      const socialsJson =
        args.socials !== undefined
          ? JSON.stringify(args.socials || [])
          : String(meRow.socials_json || "[]");
      const websiteJson =
        args.website === null
          ? null
          : args.website !== undefined
            ? JSON.stringify(args.website)
            : meRow.website_json;
      const syncedThemeJson =
        args.syncedTheme === null
          ? null
          : args.syncedTheme !== undefined
            ? JSON.stringify(args.syncedTheme)
            : meRow.synced_theme_json;

      await db.execute({
        sql: `UPDATE users
              SET display_name = ?, username = ?, bio = ?, pronouns = ?, avatar_color = ?,
                  avatar_url = ?, banner_url = ?, onboarding_complete = 1,
                  username_changed_at = ?, socials_json = ?, website_json = ?,
                  synced_theme_json = ?, updated_at = ?
              WHERE id = ?`,
        args: [
          displayName,
          username,
          bio,
          pronouns,
          avatarColor,
          avatarUrl,
          bannerUrl,
          usernameChangedAt,
          socialsJson,
          websiteJson,
          syncedThemeJson,
          now,
          meId,
        ],
      });
      const updated = await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [meId] });
      return { me: mapUserRow(updated.rows[0], true) };
    }

    case "getUserById": {
      await requireMeRow(db, auth);
      const uid = String(args.userId || "");
      const res = await db.execute({ sql: `SELECT * FROM users WHERE id = ? LIMIT 1`, args: [uid] });
      return { user: res.rows[0] ? mapUserRow(res.rows[0], false) : null };
    }

    case "setActivity": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const status = ["online", "dnd", "offline"].includes(args.status) ? args.status : "online";
      const customStatus = String(args.customStatus || "").slice(0, 80);
      await db.execute({
        sql: `UPDATE users SET status_preference = ?, custom_status = ?, updated_at = ? WHERE id = ?`,
        args: [status, customStatus, now, meId],
      });
      await db.execute({
        sql: `INSERT INTO presence (user_id, last_seen_at, last_active_at)
              VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, last_active_at = excluded.last_active_at`,
        args: [meId, now, now],
      });
      return { ok: true };
    }

    case "disconnectPresence": {
      if (auth?.userId) {
        await db.execute({
          sql: `UPDATE presence SET last_seen_at = 0, typing_to_id = NULL WHERE user_id = ?`,
          args: [auth.userId],
        });
      }
      return { ok: true };
    }

    case "setTyping": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const receiverId = args.isTyping ? String(args.receiverId || "") : null;
      await db.execute({
        sql: `INSERT INTO presence (user_id, last_seen_at, last_active_at, typing_to_id, typing_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                last_active_at = excluded.last_active_at,
                typing_to_id = excluded.typing_to_id,
                typing_at = excluded.typing_at`,
        args: [meId, now, now, receiverId, args.isTyping ? now : 0],
      });
      return { ok: true };
    }

    case "setChannelTyping": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const channelId = String(args.channelId || "");
      if (!channelId) return { ok: true };
      if (args.isTyping) {
        await db.execute({
          sql: `INSERT INTO chat_typing (channel_id, user_id, typing_at)
                VALUES (?, ?, ?)
                ON CONFLICT(channel_id, user_id) DO UPDATE SET typing_at = excluded.typing_at`,
          args: [channelId, meId, now],
        });
      } else {
        await db.execute({
          sql: `DELETE FROM chat_typing WHERE channel_id = ? AND user_id = ?`,
          args: [channelId, meId],
        });
      }
      return { ok: true };
    }

    /* ---------- Friends & Blocks ---------- */
    case "sendFriendRequest": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const rawUsername = String(args.username || "").trim().replace(/^@/, "").toLowerCase();
      if (!rawUsername) throw new TursoAppError("Enter a username.");
      const targetRes = await db.execute({
        sql: `SELECT * FROM users WHERE username = ? LIMIT 1`,
        args: [rawUsername],
      });
      if (!targetRes.rows.length) {
        throw new TursoAppError(`No user found with username @${rawUsername}.`);
      }
      const targetId = String(targetRes.rows[0].id);
      if (targetId === meId) throw new TursoAppError("You cannot add yourself.");
      if (await isBlockedEitherWay(db, meId, targetId)) {
        throw new TursoAppError("Cannot send a friend request to this user.");
      }

      const existing = await db.execute({
        sql: `SELECT * FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`,
        args: [meId, targetId, targetId, meId],
      });
      for (const r of existing.rows) {
        if (String(r.status) === "accepted") {
          throw new TursoAppError(`You are already friends with @${rawUsername}.`);
        }
        if (String(r.from_id) === targetId && String(r.status) === "pending") {
          await db.execute({
            sql: `UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?`,
            args: [now, String(r.id)],
          });
          return { acceptedImmediately: true };
        }
        if (String(r.from_id) === meId && String(r.status) === "pending") {
          throw new TursoAppError(`Friend request to @${rawUsername} is already pending.`);
        }
      }

      await db.execute({
        sql: `INSERT INTO friend_requests (id, from_id, to_id, status, created_at, updated_at)
              VALUES (?, ?, ?, 'pending', ?, ?)
              ON CONFLICT(from_id, to_id) DO UPDATE SET status = 'pending', updated_at = excluded.updated_at`,
        args: [newId(), meId, targetId, now, now],
      });
      return { ok: true };
    }

    case "respondFriendRequest": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const reqId = String(args.requestId || "");
      const accept = Boolean(args.accept);
      const reqRes = await db.execute({
        sql: `SELECT * FROM friend_requests WHERE id = ? LIMIT 1`,
        args: [reqId],
      });
      if (!reqRes.rows.length) throw new TursoAppError("Friend request not found.");
      const reqRow = reqRes.rows[0];
      if (String(reqRow.to_id) !== meId && String(reqRow.from_id) !== meId) {
        throw new TursoAppError("Not authorized.", 403);
      }
      await db.execute({
        sql: `UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?`,
        args: [accept ? "accepted" : "declined", now, reqId],
      });
      return { ok: true };
    }

    case "removeFriend": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const friendId = String(args.friendId || "");
      await db.execute({
        sql: `DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`,
        args: [meId, friendId, friendId, meId],
      });
      return { ok: true };
    }

    case "setUserBlocked": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const targetId = String(args.friendId || "");
      if (args.blocked) {
        await db.batch(
          [
            {
              sql: `INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`,
              args: [meId, targetId, now],
            },
            {
              sql: `DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`,
              args: [meId, targetId, targetId, meId],
            },
          ],
          "write",
        );
      } else {
        await db.execute({
          sql: `DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`,
          args: [meId, targetId],
        });
      }
      return { ok: true };
    }

    /* ---------- 1:1 Direct Messages ---------- */
    case "listMessages": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const otherId = String(args.otherId || "");
      const pk = pairKey(meId, otherId);
      const [settingsRes, msgsRes, favKeys] = await Promise.all([
        db.execute({
          sql: `SELECT deleted_at FROM conversation_settings WHERE user_id = ? AND friend_id = ? LIMIT 1`,
          args: [meId, otherId],
        }),
        db.execute({
          sql: `SELECT * FROM messages WHERE pair_key = ? ORDER BY created_at DESC LIMIT 220`,
          args: [pk],
        }),
        getUserFavoriteMediaKeys(db, meId),
      ]);
      const deletedAt =
        settingsRes.rows[0]?.deleted_at != null ? Number(settingsRes.rows[0].deleted_at) : 0;
      const ordered = [...msgsRes.rows]
        .reverse()
        .filter((r) => !deletedAt || Number(r.created_at) > deletedAt);
      const replyMap = new Map();
      for (const r of ordered) replyMap.set(String(r.id), r);
      return { messages: hydrateDmMessages(ordered, meId, replyMap, favKeys) };
    }

    case "sendMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const receiverId = String(args.receiverId || "");
      const body = String(args.body || "");
      if (!receiverId) throw new TursoAppError("Recipient is required.");
      if (!body.trim() && !args.attachmentUrl) {
        throw new TursoAppError("Cannot send an empty message.");
      }
      if (await isBlockedEitherWay(db, meId, receiverId)) {
        throw new TursoAppError("Cannot message this user.");
      }
      if (!(await areFriendsInDb(db, meId, receiverId))) {
        throw new TursoAppError("You can only message accepted friends.");
      }

      // Check recipient online presence for initial delivered vs sent
      const [recvPresRes, recvUserRes, recvSettingsRes] = await Promise.all([
        db.execute({ sql: `SELECT * FROM presence WHERE user_id = ? LIMIT 1`, args: [receiverId] }),
        db.execute({ sql: `SELECT * FROM users WHERE id = ? LIMIT 1`, args: [receiverId] }),
        db.execute({
          sql: `SELECT * FROM conversation_settings WHERE user_id = ? AND friend_id = ? LIMIT 1`,
          args: [receiverId, meId],
        }),
      ]);
      const recvOnline =
        recvPresRes.rows[0] && now - Number(recvPresRes.rows[0].last_seen_at || 0) < 90_000;
      const deliveryStatus = recvOnline ? "delivered" : "sent";

      const msgId = newId();
      const pk = pairKey(meId, receiverId);
      await db.execute({
        sql: `INSERT INTO messages (
                id, sender_id, receiver_id, pair_key, body, attachment_url, attachment_name,
                attachment_type, sticker_key, delivery_status, reply_to_id, forwarded_from_id,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          msgId,
          meId,
          receiverId,
          pk,
          body,
          args.attachmentUrl ? String(args.attachmentUrl) : null,
          args.attachmentName ? String(args.attachmentName) : null,
          args.attachmentType ? String(args.attachmentType) : null,
          args.stickerKey ? String(args.stickerKey) : null,
          deliveryStatus,
          args.replyToId ? String(args.replyToId) : null,
          args.forwardedFromId ? String(args.forwardedFromId) : null,
          now,
          now,
        ],
      });

      // Quiet archive / mute / DND check before push
      const recvUser = recvUserRes.rows[0];
      const recvSettings = recvSettingsRes.rows[0];
      const shouldPush =
        recvUser &&
        String(recvUser.status_preference || "online") !== "dnd" &&
        !Number(recvSettings?.is_muted || 0) &&
        !Number(recvSettings?.is_archived || 0);

      if (shouldPush) {
        void dispatchPushToUsers(db, [receiverId], {
          senderId: meId,
          senderName: String(meRow.display_name || meRow.username || "JaText"),
          body,
        });
      }

      const [rowRes, favKeys] = await Promise.all([
        db.execute({ sql: `SELECT * FROM messages WHERE id = ?`, args: [msgId] }),
        getUserFavoriteMediaKeys(db, meId),
      ]);
      const replyMap = new Map();
      if (args.replyToId) {
        const rep = await db.execute({
          sql: `SELECT * FROM messages WHERE id = ?`,
          args: [String(args.replyToId)],
        });
        if (rep.rows[0]) replyMap.set(String(rep.rows[0].id), rep.rows[0]);
      }
      return {
        message: hydrateDmMessages(rowRes.rows, meId, replyMap, favKeys)[0],
      };
    }

    case "markMessagesRead": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const friendId = String(args.friendId || "");
      const pk = pairKey(meId, friendId);
      await db.execute({
        sql: `UPDATE messages
              SET delivery_status = 'read', updated_at = ?
              WHERE pair_key = ? AND receiver_id = ? AND delivery_status != 'read'`,
        args: [now, pk, meId],
      });
      return { ok: true };
    }

    case "toggleMessageReaction": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const messageId = String(args.messageId || "");
      const emoji = String(args.emoji || "").trim();
      if (!isValidReactionEmoji(emoji)) throw new TursoAppError("Invalid reaction emoji.");
      const res = await db.execute({ sql: `SELECT * FROM messages WHERE id = ?`, args: [messageId] });
      if (!res.rows.length) throw new TursoAppError("Message not found.");
      const m = res.rows[0];
      if (String(m.sender_id) !== meId && String(m.receiver_id) !== meId) {
        throw new TursoAppError("Not authorized.", 403);
      }
      const list = safeJsonParse(m.reactions_json, []);
      const idx = list.findIndex((x) => x.userId === meId && x.emoji === emoji);
      if (idx >= 0) list.splice(idx, 1);
      else list.push({ userId: meId, emoji });
      await db.execute({
        sql: `UPDATE messages SET reactions_json = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(list), now, messageId],
      });
      return { reactions: list };
    }

    case "editMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const messageId = String(args.messageId || "");
      const body = String(args.body || "");
      const res = await db.execute({ sql: `SELECT * FROM messages WHERE id = ?`, args: [messageId] });
      if (!res.rows.length) throw new TursoAppError("Message not found.");
      const m = res.rows[0];
      if (String(m.sender_id) !== meId) throw new TursoAppError("You can only edit your own messages.", 403);
      if (m.unsent_at) throw new TursoAppError("Cannot edit an unsent message.");
      await db.execute({
        sql: `UPDATE messages SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?`,
        args: [body, now, now, messageId],
      });
      return { ok: true };
    }

    case "unsendMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const messageId = String(args.messageId || "");
      const res = await db.execute({ sql: `SELECT * FROM messages WHERE id = ?`, args: [messageId] });
      if (!res.rows.length) throw new TursoAppError("Message not found.");
      const m = res.rows[0];
      if (String(m.sender_id) !== meId) throw new TursoAppError("You can only unsend your own messages.", 403);
      if (now - Number(m.created_at) > UNSEND_WINDOW_MS) {
        throw new TursoAppError("Messages can only be unsent within 1 hour of sending.");
      }
      const firstWarning = !meRow.unsend_warning_shown_at;
      await db.batch(
        [
          {
            sql: `UPDATE messages SET body = '', attachment_url = NULL, attachment_name = NULL, attachment_type = NULL, reactions_json = '[]', unsent_at = ?, updated_at = ? WHERE id = ?`,
            args: [now, now, messageId],
          },
          ...(firstWarning
            ? [
                {
                  sql: `UPDATE users SET unsend_warning_shown_at = ?, updated_at = ? WHERE id = ?`,
                  args: [now, now, meId],
                },
              ]
            : []),
        ],
        "write",
      );
      return { showUnsendNotice: firstWarning };
    }

    case "deleteMessageForMe": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const messageId = String(args.messageId || "");
      const res = await db.execute({ sql: `SELECT * FROM messages WHERE id = ?`, args: [messageId] });
      if (!res.rows.length) return { ok: true };
      const hidden = safeJsonParse(res.rows[0].hidden_for_json, []);
      if (!hidden.includes(meId)) hidden.push(meId);
      await db.execute({
        sql: `UPDATE messages SET hidden_for_json = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(hidden), now, messageId],
      });
      return { ok: true };
    }

    case "setConversationPrefs": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const friendId = String(args.friendId || "");
      const cur = await db.execute({
        sql: `SELECT * FROM conversation_settings WHERE user_id = ? AND friend_id = ? LIMIT 1`,
        args: [meId, friendId],
      });
      const prev = cur.rows[0];
      const isArchived =
        args.isArchived !== undefined ? (args.isArchived ? 1 : 0) : Number(prev?.is_archived || 0);
      const isMuted =
        args.isMuted !== undefined ? (args.isMuted ? 1 : 0) : Number(prev?.is_muted || 0);
      const deletedAt =
        args.deleteHistory ? now : prev?.deleted_at != null ? Number(prev.deleted_at) : null;
      await db.execute({
        sql: `INSERT INTO conversation_settings (user_id, friend_id, is_archived, is_muted, deleted_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, friend_id) DO UPDATE SET
                is_archived = excluded.is_archived,
                is_muted = excluded.is_muted,
                deleted_at = excluded.deleted_at,
                updated_at = excluded.updated_at`,
        args: [meId, friendId, isArchived, isMuted, deletedAt, now],
      });
      return { ok: true };
    }

    /* ---------- Stickers & Klipy ---------- */
    case "searchKlipy": {
      await requireMeRow(db, auth);
      const apiKey = (process.env.KLIPY_API_KEY || "").trim();
      if (!apiKey) {
        return { results: [] };
      }
      const query = String(args.query || "").trim();
      const params = new URLSearchParams({
        key: apiKey,
        client_key: "jatext",
        limit: "24",
        media_filter: "gif,tinygif,mediumgif",
        locale: "en_US",
        contentfilter: "high",
      });
      if (query) params.set("q", query.slice(0, 100));
      const endpoint = query ? "search" : "featured";
      const response = await fetch(`https://api.klipy.com/v2/${endpoint}?${params}`);
      if (!response.ok) return { results: [] };
      const payload = await response.json();
      const items = Array.isArray(payload?.results) ? payload.results : [];
      const results = items.flatMap((item) => {
        const formats = item?.media_formats;
        const url = formats?.mediumgif?.url || formats?.gif?.url;
        const previewUrl = formats?.tinygif?.url || formats?.gif?.url;
        if (!url || !previewUrl) return [];
        return [
          {
            key: item.id !== undefined ? `klipy:${item.id}` : `klipy:${url}`,
            url,
            previewUrl,
            name: String(item.title || item.content_description || item.slug || "GIF").trim(),
            mediaType: "gif",
            source: "klipy",
            isFavorite: false,
            useCount: 0,
          },
        ];
      });
      return { results };
    }

    case "upsertSticker": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const s = args.sticker || {};
      const key = String(s.key || "");
      if (!key || !s.url) throw new TursoAppError("Invalid sticker.");
      const cur = await db.execute({
        sql: `SELECT * FROM sticker_library WHERE user_id = ? AND media_key = ? LIMIT 1`,
        args: [meId, key],
      });
      const prev = cur.rows[0];
      const isFav =
        args.isFavorite !== undefined
          ? args.isFavorite
            ? 1
            : 0
          : Number(prev?.is_favorite ?? 1);
      const useCount = Number(prev?.use_count || 0) + (args.incrementUse ? 1 : 0);
      const lastUsedAt = args.incrementUse
        ? now
        : prev?.last_used_at != null
          ? Number(prev.last_used_at)
          : null;
      await db.execute({
        sql: `INSERT INTO sticker_library (
                user_id, media_key, url, preview_url, name, media_type, source,
                is_favorite, use_count, last_used_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, media_key) DO UPDATE SET
                url = excluded.url,
                preview_url = COALESCE(excluded.preview_url, sticker_library.preview_url),
                is_favorite = excluded.is_favorite,
                use_count = excluded.use_count,
                last_used_at = excluded.last_used_at,
                updated_at = excluded.updated_at`,
        args: [
          meId,
          key,
          String(s.url),
          s.previewUrl ? String(s.previewUrl) : null,
          String(s.name || "Sticker"),
          String(s.mediaType || "sticker"),
          String(s.source || "upload"),
          isFav,
          useCount,
          lastUsedAt,
          now,
        ],
      });
      return await getStickersForUser(db, meId);
    }

    /* ---------- Community ---------- */
    case "setCommunityModerators": {
      const meRow = await requireMeRow(db, auth);
      if (!isJaTextOwnerRow(meRow)) {
        throw new TursoAppError("Only the JaText owner can manage moderators.", 403);
      }
      const ids = Array.isArray(args.userIds) ? args.userIds.map(String) : [];
      const stmts = [{ sql: `DELETE FROM community_moderators`, args: [] }];
      for (const uid of ids) {
        stmts.push({
          sql: `INSERT OR IGNORE INTO community_moderators (user_id, elected_by, created_at) VALUES (?, ?, ?)`,
          args: [uid, String(meRow.id), now],
        });
      }
      await db.batch(stmts, "write");
      return { moderatorIds: ids };
    }

    case "sendCommunityMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const role = await getCommunityRole(db, meRow);
      if (!role.canModerate) {
        throw new TursoAppError("Only JaText Official moderators can post announcements.", 403);
      }
      const msgId = newId();
      const type = ["text", "poll", "sticker"].includes(args.type) ? args.type : "text";
      const body = String(args.body || "");
      const pollOptions = Array.isArray(args.pollOptions) ? args.pollOptions.map(String) : [];

      await db.execute({
        sql: `INSERT INTO community_messages (
                id, sender_id, body, type, poll_options_json, sticker_url, sticker_name,
                sticker_key, attachment_url, attachment_name, attachment_type, reply_to_id,
                forwarded_from_name, forwarded_from_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          msgId,
          meId,
          body,
          type,
          JSON.stringify(pollOptions),
          args.stickerUrl ? String(args.stickerUrl) : null,
          args.stickerName ? String(args.stickerName) : null,
          args.stickerKey ? String(args.stickerKey) : null,
          args.attachmentUrl ? String(args.attachmentUrl) : null,
          args.attachmentName ? String(args.attachmentName) : null,
          args.attachmentType ? String(args.attachmentType) : null,
          args.replyToId ? String(args.replyToId) : null,
          args.forwardedFromName ? String(args.forwardedFromName) : null,
          args.forwardedFromId ? String(args.forwardedFromId) : null,
          now,
          now,
        ],
      });

      // Notify all non-muted users in background
      const recipientsRes = await db.execute({
        sql: `SELECT u.id FROM users u
              LEFT JOIN community_user_settings cs ON cs.user_id = u.id
              WHERE u.id != ? AND u.status_preference != 'dnd' AND COALESCE(cs.is_muted, 0) = 0`,
        args: [meId],
      });
      const recipientIds = recipientsRes.rows.map((r) => String(r.id));
      if (recipientIds.length) {
        void dispatchPushToUsers(db, recipientIds, {
          senderId: meId,
          senderName: "JaText Announcements",
          title: "JaText Announcements",
          body: type === "poll" ? `Poll: ${body}` : body || "New announcement",
        });
      }

      const rowRes = await db.execute({
        sql: `SELECT * FROM community_messages WHERE id = ?`,
        args: [msgId],
      });
      const hydrated = await hydrateCommunityMessages(db, rowRes.rows, meRow, role);
      return { message: hydrated[0] };
    }

    case "voteCommunityPoll": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const pollId = String(args.pollId || "");
      const optionIndex = Number(args.optionIndex);
      const pollRes = await db.execute({
        sql: `SELECT * FROM community_messages WHERE id = ? LIMIT 1`,
        args: [pollId],
      });
      if (!pollRes.rows.length) throw new TursoAppError("Poll not found.");
      if (pollRes.rows[0].poll_ended_at) throw new TursoAppError("This poll has ended.");
      await db.batch(
        [
          {
            sql: `INSERT INTO community_poll_votes (poll_id, user_id, option_index, updated_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index, updated_at = excluded.updated_at`,
            args: [pollId, meId, optionIndex, now],
          },
          {
            sql: `UPDATE community_messages SET updated_at = ? WHERE id = ?`,
            args: [now, pollId],
          },
        ],
        "write",
      );
      return { ok: true };
    }

    case "endCommunityPoll": {
      const meRow = await requireMeRow(db, auth);
      const role = await getCommunityRole(db, meRow);
      if (!role.canModerate) throw new TursoAppError("Not authorized.", 403);
      const pollId = String(args.pollId || "");
      await db.execute({
        sql: `UPDATE community_messages SET poll_ended_at = ?, updated_at = ? WHERE id = ?`,
        args: [now, now, pollId],
      });
      return { ok: true };
    }

    case "getCommunityPollVoters": {
      await requireMeRow(db, auth);
      const pollId = String(args.pollId || "");
      const res = await db.execute({
        sql: `SELECT v.user_id, v.option_index, u.display_name, u.username, u.avatar_color, u.avatar_url
              FROM community_poll_votes v
              JOIN users u ON u.id = v.user_id
              WHERE v.poll_id = ?`,
        args: [pollId],
      });
      return {
        voters: res.rows.map((r) => ({
          userId: String(r.user_id),
          optionIndex: Number(r.option_index),
          displayName: String(r.display_name || ""),
          username: String(r.username || ""),
          avatarColor: String(r.avatar_color || "black"),
          ...(r.avatar_url ? { avatarUrl: String(r.avatar_url) } : {}),
        })),
      };
    }

    case "mutateCommunityMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const role = await getCommunityRole(db, meRow);
      const messageId = String(args.messageId || "");
      const action = String(args.action || "");
      const res = await db.execute({
        sql: `SELECT * FROM community_messages WHERE id = ? LIMIT 1`,
        args: [messageId],
      });
      if (!res.rows.length) throw new TursoAppError("Announcement not found.");
      const m = res.rows[0];

      if (action === "react") {
        const emoji = String(args.emoji || "").trim();
        if (!isValidReactionEmoji(emoji)) throw new TursoAppError("Invalid reaction emoji.");
        const list = safeJsonParse(m.reactions_json, []);
        const idx = list.findIndex((x) => x.userId === meId && x.emoji === emoji);
        if (idx >= 0) list.splice(idx, 1);
        else list.push({ userId: meId, emoji });
        await db.execute({
          sql: `UPDATE community_messages SET reactions_json = ?, updated_at = ? WHERE id = ?`,
          args: [JSON.stringify(list), now, messageId],
        });
        return { reactions: list };
      }

      if (action === "hideForMe") {
        const hidden = safeJsonParse(m.hidden_for_json, []);
        if (!hidden.includes(meId)) hidden.push(meId);
        await db.execute({
          sql: `UPDATE community_messages SET hidden_for_json = ?, updated_at = ? WHERE id = ?`,
          args: [JSON.stringify(hidden), now, messageId],
        });
        return { ok: true };
      }

      if (!role.canModerate && String(m.sender_id) !== meId) {
        throw new TursoAppError("Not authorized.", 403);
      }

      if (action === "edit") {
        await db.execute({
          sql: `UPDATE community_messages SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?`,
          args: [String(args.body || ""), now, now, messageId],
        });
        return { ok: true };
      }

      if (action === "unsend" || action === "delete") {
        await db.execute({
          sql: `UPDATE community_messages SET body = '', attachment_url = NULL, sticker_url = NULL, reactions_json = '[]', unsent_at = ?, updated_at = ? WHERE id = ?`,
          args: [now, now, messageId],
        });
        return { showUnsendNotice: false };
      }
      return { ok: true };
    }

    case "setCommunityPrefs": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const cur = await db.execute({
        sql: `SELECT * FROM community_user_settings WHERE user_id = ? LIMIT 1`,
        args: [meId],
      });
      const prev = cur.rows[0];
      const isMuted =
        args.isMuted !== undefined ? (args.isMuted ? 1 : 0) : Number(prev?.is_muted || 0);
      const lastReadAt =
        args.markRead ? now : prev?.last_read_at != null ? Number(prev.last_read_at) : null;
      await db.execute({
        sql: `INSERT INTO community_user_settings (user_id, is_muted, last_read_at, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                is_muted = excluded.is_muted,
                last_read_at = excluded.last_read_at,
                updated_at = excluded.updated_at`,
        args: [meId, isMuted, lastReadAt, now],
      });
      return { ok: true };
    }

    /* ---------- Groups ---------- */
    case "createGroup": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const name = String(args.name || "").trim().slice(0, 60);
      if (!name) throw new TursoAppError("Group name is required.");
      const rawMembers = Array.isArray(args.memberIds) ? args.memberIds.map(String) : [];
      const uniqueMembers = [...new Set([meId, ...rawMembers])];
      const gid = newId();
      const stmts = [
        {
          sql: `INSERT INTO groups (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          args: [gid, name, meId, now, now],
        },
        ...uniqueMembers.map((uid) => ({
          sql: `INSERT INTO group_members (group_id, user_id, role, muted, joined_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?)`,
          args: [gid, uid, uid === meId ? "owner" : "member", now, now],
        })),
      ];
      await db.batch(stmts, "write");
      return { groupId: gid };
    }

    case "getGroupDetails": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const groupId = String(args.groupId || "");
      const [grpRes, memRes] = await Promise.all([
        db.execute({ sql: `SELECT * FROM groups WHERE id = ? LIMIT 1`, args: [groupId] }),
        db.execute({ sql: `SELECT * FROM group_members WHERE group_id = ?`, args: [groupId] }),
      ]);
      if (!grpRes.rows.length) return { details: null };
      const myMem = memRes.rows.find((m) => String(m.user_id) === meId);
      if (!myMem) return { details: null };

      const umap = await getUsersMap(
        db,
        memRes.rows.map((m) => String(m.user_id)),
      );
      const members = memRes.rows
        .map((m) => {
          const u = mapUserRow(umap.get(String(m.user_id)));
          if (!u) return null;
          return {
            ...u,
            role: String(m.role),
            muted: Boolean(Number(m.muted || 0)),
          };
        })
        .filter(Boolean);

      const g = grpRes.rows[0];
      return {
        details: {
          id: String(g.id),
          name: String(g.name),
          ...(g.avatar_url ? { avatarUrl: String(g.avatar_url) } : {}),
          ownerId: String(g.owner_id),
          role: String(myMem.role),
          members,
        },
      };
    }

    case "listGroupMessages": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const groupId = String(args.groupId || "");
      const [memRes, gusRes, msgsRes] = await Promise.all([
        db.execute({
          sql: `SELECT role FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
          args: [groupId, meId],
        }),
        db.execute({
          sql: `SELECT cleared_at FROM group_user_settings WHERE user_id = ? AND group_id = ? LIMIT 1`,
          args: [meId, groupId],
        }),
        db.execute({
          sql: `SELECT * FROM group_messages WHERE group_id = ? ORDER BY created_at DESC LIMIT 220`,
          args: [groupId],
        }),
      ]);
      if (!memRes.rows.length) return { messages: [] };
      const clearedAt = gusRes.rows[0]?.cleared_at != null ? Number(gusRes.rows[0].cleared_at) : 0;
      const messages = await hydrateGroupMessages(
        db,
        [...msgsRes.rows].reverse(),
        meId,
        clearedAt,
      );
      return { messages };
    }

    case "sendGroupMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const groupId = String(args.groupId || "");
      const body = String(args.body || "");

      const [grpRes, memRes] = await Promise.all([
        db.execute({ sql: `SELECT * FROM groups WHERE id = ? LIMIT 1`, args: [groupId] }),
        db.execute({ sql: `SELECT * FROM group_members WHERE group_id = ?`, args: [groupId] }),
      ]);
      if (!grpRes.rows.length) throw new TursoAppError("Group no longer exists.");
      const myMem = memRes.rows.find((m) => String(m.user_id) === meId);
      if (!myMem) throw new TursoAppError("You are not a member of this group.", 403);
      if (Number(myMem.muted || 0) && String(myMem.role) === "member") {
        throw new TursoAppError("You are muted in this group.");
      }

      const canTriggerEveryone =
        String(myMem.role) === "owner" || String(myMem.role) === "moderator";
      const mentionsEveryone = canTriggerEveryone && /@everyone\b/i.test(body);

      const umap = await getUsersMap(
        db,
        memRes.rows.map((m) => String(m.user_id)),
      );
      const mentionedUserIds = [];
      const mentionMatches = body.match(/@([a-z0-9._]{3,20})/gi) || [];
      const mentionedHandles = new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()));
      for (const [uid, urow] of umap.entries()) {
        if (uid !== meId && mentionedHandles.has(String(urow.username || "").toLowerCase())) {
          mentionedUserIds.push(uid);
        }
      }

      const msgId = newId();
      await db.batch(
        [
          {
            sql: `INSERT INTO group_messages (
                    id, group_id, sender_id, body, reply_to_id, forwarded_from_name,
                    forwarded_from_id, sticker_url, sticker_name, sticker_key,
                    attachment_url, attachment_name, attachment_type,
                    mentions_everyone, mentioned_user_ids_json, created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              msgId,
              groupId,
              meId,
              body,
              args.replyToId ? String(args.replyToId) : null,
              args.forwardedFromName ? String(args.forwardedFromName) : null,
              args.forwardedFromId ? String(args.forwardedFromId) : null,
              args.stickerUrl ? String(args.stickerUrl) : null,
              args.stickerName ? String(args.stickerName) : null,
              args.stickerKey ? String(args.stickerKey) : null,
              args.attachmentUrl ? String(args.attachmentUrl) : null,
              args.attachmentName ? String(args.attachmentName) : null,
              args.attachmentType ? String(args.attachmentType) : null,
              mentionsEveryone ? 1 : 0,
              JSON.stringify(mentionedUserIds),
              now,
              now,
            ],
          },
          {
            sql: `UPDATE groups SET updated_at = ? WHERE id = ?`,
            args: [now, groupId],
          },
        ],
        "write",
      );

      // Push notifications for group calls / mentions / @everyone
      const callInfo = detectCallInfo(body);
      const candidateTargets =
        mentionsEveryone || callInfo.isCall
          ? memRes.rows.map((m) => String(m.user_id)).filter((uid) => uid !== meId)
          : mentionedUserIds;

      if (candidateTargets.length) {
        const ph = candidateTargets.map(() => "?").join(",");
        const gusRes = await db.execute({
          sql: `SELECT user_id, is_silenced, is_archived FROM group_user_settings WHERE group_id = ? AND user_id IN (${ph})`,
          args: [groupId, ...candidateTargets],
        });
        const gusMap = new Map();
        for (const g of gusRes.rows) gusMap.set(String(g.user_id), g);
        const finalPushTargets = candidateTargets.filter((uid) => {
          const u = umap.get(uid);
          const gs = gusMap.get(uid);
          if (!u || String(u.status_preference || "online") === "dnd") return false;
          if (Number(gs?.is_silenced || 0) || Number(gs?.is_archived || 0)) return false;
          return true;
        });
        if (finalPushTargets.length) {
          const groupName = String(grpRes.rows[0].name);
          const senderName = String(meRow.display_name || meRow.username || "Member");
          void dispatchPushToUsers(db, finalPushTargets, {
            senderId: meId,
            senderName,
            title: callInfo.isCall ? groupName : `${senderName} in ${groupName}`,
            body,
            groupId,
          });
        }
      }

      const rowRes = await db.execute({
        sql: `SELECT * FROM group_messages WHERE id = ?`,
        args: [msgId],
      });
      const hydrated = await hydrateGroupMessages(db, rowRes.rows, meId, 0);
      return { message: hydrated[0] };
    }

    case "mutateGroupMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const messageId = String(args.messageId || "");
      const action = String(args.action || "");
      const msgRes = await db.execute({
        sql: `SELECT * FROM group_messages WHERE id = ? LIMIT 1`,
        args: [messageId],
      });
      if (!msgRes.rows.length) throw new TursoAppError("Group message not found.");
      const m = msgRes.rows[0];
      const groupId = String(m.group_id);

      const memRes = await db.execute({
        sql: `SELECT role FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
        args: [groupId, meId],
      });
      if (!memRes.rows.length) throw new TursoAppError("Not a member of this group.", 403);
      const myRole = String(memRes.rows[0].role);

      if (action === "react") {
        const emoji = String(args.emoji || "").trim();
        if (!isValidReactionEmoji(emoji)) throw new TursoAppError("Invalid reaction emoji.");
        const list = safeJsonParse(m.reactions_json, []);
        const idx = list.findIndex((x) => x.userId === meId && x.emoji === emoji);
        if (idx >= 0) list.splice(idx, 1);
        else list.push({ userId: meId, emoji });
        await db.execute({
          sql: `UPDATE group_messages SET reactions_json = ?, updated_at = ? WHERE id = ?`,
          args: [JSON.stringify(list), now, messageId],
        });
        return { reactions: list };
      }

      if (action === "hideForMe") {
        const hidden = safeJsonParse(m.hidden_for_json, []);
        if (!hidden.includes(meId)) hidden.push(meId);
        await db.execute({
          sql: `UPDATE group_messages SET hidden_for_json = ?, updated_at = ? WHERE id = ?`,
          args: [JSON.stringify(hidden), now, messageId],
        });
        return { ok: true };
      }

      if (action === "edit") {
        if (String(m.sender_id) !== meId) {
          throw new TursoAppError("You can only edit your own messages.", 403);
        }
        await db.execute({
          sql: `UPDATE group_messages SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?`,
          args: [String(args.body || ""), now, now, messageId],
        });
        return { ok: true };
      }

      if (action === "unsend") {
        const canModUnsend = myRole === "owner" || myRole === "moderator";
        if (String(m.sender_id) !== meId && !canModUnsend) {
          throw new TursoAppError("Not authorized to unsend this message.", 403);
        }
        await db.batch(
          [
            {
              sql: `UPDATE group_messages SET body = '', attachment_url = NULL, sticker_url = NULL, reactions_json = '[]', unsent_at = ?, updated_at = ? WHERE id = ?`,
              args: [now, now, messageId],
            },
            {
              sql: `UPDATE groups SET updated_at = ? WHERE id = ?`,
              args: [now, groupId],
            },
          ],
          "write",
        );
        return { showUnsendNotice: false };
      }
      return { ok: true };
    }

    case "manageGroup": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const groupId = String(args.groupId || "");
      const subOp = String(args.subOp || "");

      const [grpRes, myMemRes] = await Promise.all([
        db.execute({ sql: `SELECT * FROM groups WHERE id = ? LIMIT 1`, args: [groupId] }),
        db.execute({
          sql: `SELECT * FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
          args: [groupId, meId],
        }),
      ]);
      if (!grpRes.rows.length) throw new TursoAppError("Group not found.");
      const grp = grpRes.rows[0];
      const myMem = myMemRes.rows[0];
      if (!myMem) throw new TursoAppError("You are not a member of this group.", 403);
      const myRole = String(myMem.role);
      const isOwner = String(grp.owner_id) === meId;
      const isMod = isOwner || myRole === "moderator";

      switch (subOp) {
        case "deleteGroup": {
          // STRICT USER CONSTRAINT: Only the group owner can delete the group permanently!
          if (!isOwner) {
            throw new TursoAppError("Only the group owner can permanently delete this group.", 403);
          }
          await db.batch(
            [
              { sql: `DELETE FROM group_messages WHERE group_id = ?`, args: [groupId] },
              { sql: `DELETE FROM group_members WHERE group_id = ?`, args: [groupId] },
              { sql: `DELETE FROM group_user_settings WHERE group_id = ?`, args: [groupId] },
              { sql: `DELETE FROM e2ee_group_keys WHERE group_id = ?`, args: [groupId] },
              { sql: `DELETE FROM groups WHERE id = ?`, args: [groupId] },
            ],
            "write",
          );
          return { ok: true };
        }

        case "clearHistoryForMe": {
          // STRICT USER CONSTRAINT: Clears group chat history for this user WITHOUT leaving!
          await db.execute({
            sql: `INSERT INTO group_user_settings (user_id, group_id, is_silenced, is_archived, last_read_at, cleared_at, updated_at)
                  VALUES (?, ?, 0, 0, ?, ?, ?)
                  ON CONFLICT(user_id, group_id) DO UPDATE SET
                    cleared_at = excluded.cleared_at,
                    last_read_at = excluded.last_read_at,
                    updated_at = excluded.updated_at`,
            args: [meId, groupId, now, now, now],
          });
          return { ok: true };
        }

        case "leave": {
          if (isOwner) {
            const others = await db.execute({
              sql: `SELECT user_id, role FROM group_members WHERE group_id = ? AND user_id != ? ORDER BY CASE WHEN role = 'moderator' THEN 0 ELSE 1 END, joined_at ASC LIMIT 1`,
              args: [groupId, meId],
            });
            if (!others.rows.length) {
              await db.batch(
                [
                  { sql: `DELETE FROM group_messages WHERE group_id = ?`, args: [groupId] },
                  { sql: `DELETE FROM group_members WHERE group_id = ?`, args: [groupId] },
                  { sql: `DELETE FROM group_user_settings WHERE group_id = ?`, args: [groupId] },
                  { sql: `DELETE FROM e2ee_group_keys WHERE group_id = ?`, args: [groupId] },
                  { sql: `DELETE FROM groups WHERE id = ?`, args: [groupId] },
                ],
                "write",
              );
              return { ok: true };
            }
            const nextOwnerId = String(others.rows[0].user_id);
            await db.batch(
              [
                {
                  sql: `UPDATE groups SET owner_id = ?, updated_at = ? WHERE id = ?`,
                  args: [nextOwnerId, now, groupId],
                },
                {
                  sql: `UPDATE group_members SET role = 'owner', updated_at = ? WHERE group_id = ? AND user_id = ?`,
                  args: [now, groupId, nextOwnerId],
                },
                {
                  sql: `DELETE FROM group_members WHERE group_id = ? AND user_id = ?`,
                  args: [groupId, meId],
                },
              ],
              "write",
            );
            return { ok: true };
          }
          await db.execute({
            sql: `DELETE FROM group_members WHERE group_id = ? AND user_id = ?`,
            args: [groupId, meId],
          });
          return { ok: true };
        }

        case "addMembers": {
          if (!isMod) throw new TursoAppError("Only owners or moderators can add members.", 403);
          const ids = Array.isArray(args.memberIds) ? args.memberIds.map(String) : [];
          const stmts = ids.map((uid) => ({
            sql: `INSERT OR IGNORE INTO group_members (group_id, user_id, role, muted, joined_at, updated_at)
                  VALUES (?, ?, 'member', 0, ?, ?)`,
            args: [groupId, uid, now, now],
          }));
          stmts.push({ sql: `UPDATE groups SET updated_at = ? WHERE id = ?`, args: [now, groupId] });
          await db.batch(stmts, "write");
          return { ok: true };
        }

        case "rename": {
          if (!isMod) throw new TursoAppError("Only owners or moderators can rename the group.", 403);
          const name = String(args.name || "").trim().slice(0, 60);
          if (!name) throw new TursoAppError("Group name is required.");
          await db.execute({
            sql: `UPDATE groups SET name = ?, updated_at = ? WHERE id = ?`,
            args: [name, now, groupId],
          });
          return { ok: true };
        }

        case "setAvatar": {
          if (!isMod) throw new TursoAppError("Only owners or moderators can change the group photo.", 403);
          await db.execute({
            sql: `UPDATE groups SET avatar_url = ?, updated_at = ? WHERE id = ?`,
            args: [args.avatarUrl ? String(args.avatarUrl) : null, now, groupId],
          });
          return { ok: true };
        }

        case "setRole": {
          if (!isOwner) throw new TursoAppError("Only the group owner can manage moderator roles.", 403);
          const targetId = String(args.userId || "");
          const role = args.role === "moderator" ? "moderator" : "member";
          await db.execute({
            sql: `UPDATE group_members SET role = ?, updated_at = ? WHERE group_id = ? AND user_id = ? AND role != 'owner'`,
            args: [role, now, groupId, targetId],
          });
          return { ok: true };
        }

        case "setMuted": {
          if (!isMod) throw new TursoAppError("Not authorized.", 403);
          const targetId = String(args.userId || "");
          await db.execute({
            sql: `UPDATE group_members SET muted = ?, updated_at = ? WHERE group_id = ? AND user_id = ? AND role != 'owner'`,
            args: [args.muted ? 1 : 0, now, groupId, targetId],
          });
          return { ok: true };
        }

        case "removeMember": {
          if (!isMod) throw new TursoAppError("Not authorized.", 403);
          const targetId = String(args.userId || "");
          if (targetId === String(grp.owner_id)) {
            throw new TursoAppError("Cannot remove the group owner.");
          }
          await db.batch(
            [
              {
                sql: `DELETE FROM group_members WHERE group_id = ? AND user_id = ?`,
                args: [groupId, targetId],
              },
              { sql: `UPDATE groups SET updated_at = ? WHERE id = ?`, args: [now, groupId] },
            ],
            "write",
          );
          return { ok: true };
        }

        case "setUserPrefs": {
          const cur = await db.execute({
            sql: `SELECT * FROM group_user_settings WHERE user_id = ? AND group_id = ? LIMIT 1`,
            args: [meId, groupId],
          });
          const prev = cur.rows[0];
          const isSilenced =
            args.isSilenced !== undefined
              ? args.isSilenced
                ? 1
                : 0
              : Number(prev?.is_silenced || 0);
          const isArchived =
            args.isArchived !== undefined
              ? args.isArchived
                ? 1
                : 0
              : Number(prev?.is_archived || 0);
          const lastReadAt =
            args.markRead ? now : prev?.last_read_at != null ? Number(prev.last_read_at) : null;
          const clearedAt = prev?.cleared_at != null ? Number(prev.cleared_at) : null;
          await db.execute({
            sql: `INSERT INTO group_user_settings (user_id, group_id, is_silenced, is_archived, last_read_at, cleared_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(user_id, group_id) DO UPDATE SET
                    is_silenced = excluded.is_silenced,
                    is_archived = excluded.is_archived,
                    last_read_at = excluded.last_read_at,
                    updated_at = excluded.updated_at`,
            args: [meId, groupId, isSilenced, isArchived, lastReadAt, clearedAt, now],
          });
          return { ok: true };
        }

        default:
          throw new TursoAppError(`Unknown group operation: ${subOp}`);
      }
    }

    /* ---------- Push Devices ---------- */
    case "registerPushDevice": {
      const meRow = await requireMeRow(db, auth);
      const token = String(args.token || "").trim();
      if (!token) return { ok: true };
      await db.execute({
        sql: `INSERT INTO push_devices (token, user_id, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at`,
        args: [token, String(meRow.id), now],
      });
      return { ok: true };
    }

    case "unregisterPushDevice": {
      const token = String(args.token || "").trim();
      if (token) {
        await db.execute({ sql: `DELETE FROM push_devices WHERE token = ?`, args: [token] });
      }
      return { ok: true };
    }

    /* ---------- Zero-Knowledge E2EE ---------- */
    case "publishE2EEIdentity": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const keyId = String(args.keyId || "");
      const dhPubB64 = String(args.dhPubB64 || "");
      const sigPubB64 = String(args.sigPubB64 || "");
      const selfSigB64 = String(args.selfSigB64 || "");
      if (!keyId || !dhPubB64 || !sigPubB64) throw new TursoAppError("Invalid E2EE bundle.");
      await db.execute({
        sql: `INSERT INTO e2ee_user_keys (user_id, key_id, dh_pub_b64, sig_pub_b64, self_sig_b64, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, key_id) DO UPDATE SET
                dh_pub_b64 = excluded.dh_pub_b64,
                sig_pub_b64 = excluded.sig_pub_b64,
                self_sig_b64 = excluded.self_sig_b64,
                updated_at = excluded.updated_at`,
        args: [meId, keyId, dhPubB64, sigPubB64, selfSigB64, now],
      });
      return { ok: true };
    }

    case "getUserE2EEIdentities": {
      await requireMeRow(db, auth);
      const ids = Array.isArray(args.userIds) ? args.userIds.map(String).filter(Boolean) : [];
      if (!ids.length) return { bundles: [] };
      const ph = ids.map(() => "?").join(",");
      const res = await db.execute({
        sql: `SELECT * FROM e2ee_user_keys WHERE user_id IN (${ph}) ORDER BY updated_at DESC`,
        args: ids,
      });
      return {
        bundles: res.rows.map((r) => ({
          userId: String(r.user_id),
          keyId: String(r.key_id),
          dhPubB64: String(r.dh_pub_b64),
          sigPubB64: String(r.sig_pub_b64),
          selfSigB64: String(r.self_sig_b64),
          ts: Number(r.updated_at),
          updatedAt: Number(r.updated_at),
        })),
      };
    }

    case "saveE2EEVault": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const keyId = String(args.keyId || "");
      const sealedJson = String(args.sealedJson || "");
      await db.execute({
        sql: `INSERT INTO e2ee_key_backups (user_id, key_id, sealed_json, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                key_id = excluded.key_id,
                sealed_json = excluded.sealed_json,
                updated_at = excluded.updated_at`,
        args: [meId, keyId, sealedJson, now],
      });
      return { ok: true };
    }

    case "getMyE2EEVault": {
      const meRow = await requireMeRow(db, auth);
      const res = await db.execute({
        sql: `SELECT * FROM e2ee_key_backups WHERE user_id = ? LIMIT 1`,
        args: [String(meRow.id)],
      });
      if (!res.rows.length) return { vault: null };
      return {
        vault: {
          keyId: String(res.rows[0].key_id),
          sealedJson: String(res.rows[0].sealed_json),
          updatedAt: Number(res.rows[0].updated_at),
        },
      };
    }

    case "publishGroupEpochKey": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const groupId = String(args.groupId || "");
      const epoch = Number(args.epoch || 1);
      const packetJson = String(args.packetJson || "");
      await db.execute({
        sql: `INSERT INTO e2ee_group_keys (group_id, epoch, sender_id, packet_json, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(group_id, epoch, sender_id) DO UPDATE SET
                packet_json = excluded.packet_json,
                created_at = excluded.created_at`,
        args: [groupId, epoch, meId, packetJson, now],
      });
      return { ok: true };
    }

    case "getGroupEpochKeys": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const groupId = String(args.groupId || "");
      const mem = await db.execute({
        sql: `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
        args: [groupId, meId],
      });
      if (!mem.rows.length) return { packets: [] };
      const res = await db.execute({
        sql: `SELECT * FROM e2ee_group_keys WHERE group_id = ? ORDER BY epoch ASC`,
        args: [groupId],
      });
      return {
        packets: res.rows.map((r) => ({
          groupId: String(r.group_id),
          epoch: Number(r.epoch),
          senderId: String(r.sender_id),
          packetJson: String(r.packet_json),
          createdAt: Number(r.created_at),
        })),
      };
    }

    case "getPublicPeerKeys": {
      const userId = String(args.userId || "").trim();
      if (!userId) return { bundles: [] };
      const res = await db.execute({
        sql: `SELECT user_id, key_id, dh_pub_b64, sig_pub_b64, self_sig_b64, updated_at FROM e2ee_user_keys WHERE user_id = ? ORDER BY updated_at DESC LIMIT 8`,
        args: [userId],
      });
      return {
        bundles: res.rows.map((r) => ({
          userId: String(r.user_id),
          keyId: String(r.key_id),
          dhPubB64: String(r.dh_pub_b64),
          sigPubB64: String(r.sig_pub_b64),
          selfSigB64: String(r.self_sig_b64),
          ts: Number(r.updated_at),
          updatedAt: Number(r.updated_at),
        })),
      };
    }

    default:
      throw new TursoAppError(`Unknown operation: ${op}`);
  }
}
