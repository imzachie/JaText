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
export const MAX_LINKED_DEVICES = 5;
export const LINK_SESSION_TTL_MS = 2 * 60 * 1000;
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

    `CREATE TABLE IF NOT EXISTS oauth_mobile_handoffs (
      session_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      token TEXT,
      me_json TEXT,
      error TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_oauth_mobile_created ON oauth_mobile_handoffs(created_at)`,

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
      chunk_count INTEGER NOT NULL DEFAULT 0,
      data BLOB NOT NULL,
      created_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS media_chunks (
      media_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (media_id, chunk_index)
    )`,

    `CREATE TABLE IF NOT EXISTS linked_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      browser_name TEXT NOT NULL DEFAULT 'Chrome',
      os_name TEXT NOT NULL DEFAULT '',
      device_label TEXT NOT NULL DEFAULT 'Chrome JaText',
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_linked_devices_user ON linked_devices(user_id)`,

    `CREATE TABLE IF NOT EXISTS device_link_sessions (
      pairing_id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL,
      web_dh_pub_b64 TEXT NOT NULL,
      browser_name TEXT NOT NULL DEFAULT 'Chrome',
      os_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      user_id TEXT,
      linked_device_id TEXT,
      linked_jwt TEXT,
      sealed_bundle_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_device_link_expires ON device_link_sessions(expires_at)`,

    `CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      body TEXT NOT NULL,
      reply_to_id TEXT,
      scheduled_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      dispatched_at INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_messages(dispatched_at, scheduled_at)`,
    `CREATE INDEX IF NOT EXISTS idx_sched_sender ON scheduled_messages(sender_id, dispatched_at, scheduled_at)`,

    `CREATE TABLE IF NOT EXISTS view_once_opens (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_vo_user_opened ON view_once_opens(user_id, opened_at)`,

    `CREATE TABLE IF NOT EXISTS user_soundboards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      audio_url TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_soundboards_user ON user_soundboards(user_id, created_at)`,

    `CREATE TABLE IF NOT EXISTS user_passkeys (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key_spki_b64 TEXT NOT NULL,
      algorithm INTEGER NOT NULL DEFAULT -7,
      sign_count INTEGER NOT NULL DEFAULT 0,
      label TEXT NOT NULL DEFAULT 'Passkey',
      transports_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_passkeys_user ON user_passkeys(user_id)`,

    `CREATE TABLE IF NOT EXISTS webauthn_challenges (
      challenge_id TEXT PRIMARY KEY,
      challenge_b64 TEXT NOT NULL,
      user_id TEXT,
      kind TEXT NOT NULL,
      rp_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_webauthn_exp ON webauthn_challenges(expires_at)`,
  ];

  await db.batch(statements, "write");
  const safeAlters = [
    `ALTER TABLE media_blobs ADD COLUMN chunk_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN totp_secret TEXT`,
    `ALTER TABLE users ADD COLUMN totp_pending_secret TEXT`,
    `ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN totp_backup_codes_json TEXT`,
    `ALTER TABLE users ADD COLUMN chat_org_json TEXT`,
    `ALTER TABLE oauth_mobile_handoffs ADD COLUMN challenge_token TEXT`,
  ];
  for (const sql of safeAlters) {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists on initialized databases
    }
  }
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

export function createAuthToken(userId, email, extraClaims = null) {
  const now = Date.now();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      email: email || "",
      ...(extraClaims && extraClaims.linkedDeviceId
        ? {
            linkedDeviceId: String(extraClaims.linkedDeviceId),
            client: String(extraClaims.client || "web_linked"),
          }
        : {}),
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
      linkedDeviceId: parsed.linkedDeviceId ? String(parsed.linkedDeviceId) : null,
      client: parsed.client ? String(parsed.client) : null,
    };
  } catch {
    return null;
  }
}

function sha256Base64Url(inputStr) {
  return base64UrlEncode(crypto.createHash("sha256").update(String(inputStr || ""), "utf8").digest());
}

/* ==================== RFC 6238 TOTP & WebAuthn Passkey Helpers ==================== */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ANDROID_PASSKEY_ORIGIN = "android:apk-key-hash:gsPZhijdPT8VSRd7F7oaSYMZORIgJyNKpslsyAPfNGU";

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buf.length; i += 1) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(raw) {
  const clean = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i += 1) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpSecretBase32() {
  return base32Encode(crypto.randomBytes(20));
}

function computeHotpCode(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const counterBuf = Buffer.alloc(8);
  let rem = Math.floor(Math.max(0, Number(counter || 0)));
  for (let i = 7; i >= 0; i -= 1) {
    counterBuf[i] = rem & 0xff;
    rem = Math.floor(rem / 256);
  }
  const digest = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotpCode(secretBase32, rawCode, windowSteps = 2) {
  const code = String(rawCode || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code) || !secretBase32) return false;
  const stepNow = Math.floor(Date.now() / 30_000);
  for (let delta = -windowSteps; delta <= windowSteps; delta += 1) {
    const candidate = computeHotpCode(secretBase32, stepNow + delta);
    if (safeEqualStrings(candidate, code)) return true;
  }
  return false;
}

function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < 8; i += 1) {
    const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
  }
  return codes;
}

export function createTwoFactorChallengeToken(userId, email) {
  const now = Date.now();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JT2FA" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      typ: "2fa_challenge",
      sub: String(userId),
      email: String(email || ""),
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + 10 * 60_000) / 1000),
    }),
  );
  const sig = base64UrlEncode(
    crypto.createHmac("sha256", getJwtSecret()).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

export function verifyTwoFactorChallengeToken(token) {
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
    if (
      parsed?.typ !== "2fa_challenge" ||
      !parsed?.sub ||
      !parsed?.exp ||
      Number(parsed.exp) * 1000 < Date.now()
    ) {
      return null;
    }
    return {
      userId: String(parsed.sub),
      email: String(parsed.email || ""),
    };
  } catch {
    return null;
  }
}

/**
 * Minimal CBOR decoder sufficient for WebAuthn `attestationObject` & COSE EC2 P-256 keys.
 */
function decodeCborItem(buf, offset = 0) {
  if (offset >= buf.length) throw new Error("CBOR truncated");
  const initial = buf[offset];
  const major = initial >> 5;
  const info = initial & 0x1f;
  let pos = offset + 1;
  let length = 0;
  if (info < 24) {
    length = info;
  } else if (info === 24) {
    length = buf[pos];
    pos += 1;
  } else if (info === 25) {
    length = buf.readUInt16BE(pos);
    pos += 2;
  } else if (info === 26) {
    length = buf.readUInt32BE(pos);
    pos += 4;
  } else if (info === 27) {
    const hi = buf.readUInt32BE(pos);
    const lo = buf.readUInt32BE(pos + 4);
    length = hi * 4294967296 + lo;
    pos += 8;
  } else {
    throw new Error("Unsupported CBOR indefinite length");
  }

  switch (major) {
    case 0:
      return { value: length, next: pos };
    case 1:
      return { value: -1 - length, next: pos };
    case 2: {
      const slice = buf.subarray(pos, pos + length);
      return { value: Buffer.from(slice), next: pos + length };
    }
    case 3: {
      const str = buf.subarray(pos, pos + length).toString("utf8");
      return { value: str, next: pos + length };
    }
    case 4: {
      const arr = [];
      let cur = pos;
      for (let i = 0; i < length; i += 1) {
        const item = decodeCborItem(buf, cur);
        arr.push(item.value);
        cur = item.next;
      }
      return { value: arr, next: cur };
    }
    case 5: {
      const map = new Map();
      let cur = pos;
      for (let i = 0; i < length; i += 1) {
        const k = decodeCborItem(buf, cur);
        const v = decodeCborItem(buf, k.next);
        map.set(k.value, v.value);
        cur = v.next;
      }
      return { value: map, next: cur };
    }
    case 7:
      if (info === 20) return { value: false, next: pos };
      if (info === 21) return { value: true, next: pos };
      if (info === 22 || info === 23) return { value: null, next: pos };
      return { value: length, next: pos };
    default:
      throw new Error("Unsupported CBOR major type");
  }
}

function extractSpkiFromAttestationOrAuthData(attestationB64, authDataB64) {
  let authData = authDataB64 ? base64UrlDecode(authDataB64) : null;
  if (!authData && attestationB64) {
    const attMap = decodeCborItem(base64UrlDecode(attestationB64), 0).value;
    if (attMap instanceof Map && Buffer.isBuffer(attMap.get("authData"))) {
      authData = attMap.get("authData");
    }
  }
  if (!authData || authData.length < 55) {
    throw new TursoAppError("Invalid passkey authenticator data.");
  }
  const flags = authData[32];
  if ((flags & 0x40) === 0) {
    throw new TursoAppError("Passkey attestation did not include credential public key.");
  }
  const credIdLen = authData.readUInt16BE(53);
  const coseOffset = 55 + credIdLen;
  const coseMap = decodeCborItem(authData, coseOffset).value;
  if (!(coseMap instanceof Map)) {
    throw new TursoAppError("Could not decode passkey COSE public key.");
  }
  const kty = coseMap.get(1);
  const alg = Number(coseMap.get(3) || -7);
  if (kty === 2) {
    // EC2 P-256 -> ASN.1 SubjectPublicKeyInfo (91 bytes)
    const x = coseMap.get(-2);
    const y = coseMap.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) {
      throw new TursoAppError("Unsupported EC2 coordinate size for passkey.");
    }
    const p256Header = Buffer.from(
      "3059301306072a8648ce3d020106082a8648ce3d03010703420004",
      "hex",
    );
    const spki = Buffer.concat([p256Header, x, y]);
    return { spkiB64: base64UrlEncode(spki), alg, authData };
  }
  if (kty === 3) {
    // RSA -> Node JWK import -> SPKI DER export
    const n = coseMap.get(-1);
    const e = coseMap.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e)) {
      throw new TursoAppError("Invalid RSA passkey parameters.");
    }
    const pubKey = crypto.createPublicKey({
      key: {
        kty: "RSA",
        n: base64UrlEncode(n),
        e: base64UrlEncode(e),
      },
      format: "jwk",
    });
    const spki = pubKey.export({ type: "spki", format: "der" });
    return { spkiB64: base64UrlEncode(spki), alg: alg || -257, authData };
  }
  throw new TursoAppError("Unsupported passkey key type. Please use a standard device passkey.");
}

function isAllowedWebAuthnOrigin(origin, rpId) {
  const cleanOrigin = String(origin || "").trim();
  if (!cleanOrigin) return false;
  if (cleanOrigin === ANDROID_PASSKEY_ORIGIN || cleanOrigin.startsWith("android:apk-key-hash:")) {
    return cleanOrigin === ANDROID_PASSKEY_ORIGIN;
  }
  try {
    const parsed = new URL(cleanOrigin);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname === rpId || parsed.hostname.endsWith(`.${rpId}`);
  } catch {
    return false;
  }
}

function normalizeChatOrg(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const pinnedIds = Array.isArray(obj.pinnedIds)
    ? [...new Set(obj.pinnedIds.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 100)
    : [];
  const rawOrder = Array.isArray(obj.customOrder)
    ? [...new Set(obj.customOrder.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 300)
    : [];
  const customOrder = [
    "__jatext_community__",
    ...rawOrder.filter((id) => id !== "__jatext_community__"),
  ];
  const folders = Array.isArray(obj.folders)
    ? obj.folders
        .map((f) => {
          if (!f || typeof f !== "object") return null;
          const id = String(f.id || "").trim().slice(0, 48);
          const name = String(f.name || "").trim().slice(0, 32);
          if (!id || !name) return null;
          const threadIds = Array.isArray(f.threadIds)
            ? [...new Set(f.threadIds.map((t) => String(t || "").trim()).filter(Boolean))].slice(
                0,
                200,
              )
            : [];
          return { id, name, threadIds };
        })
        .filter(Boolean)
        .slice(0, 20)
    : [];
  return { pinnedIds, customOrder, folders };
}

async function listSoundboardsForUser(db, userId) {
  const res = await db.execute({
    sql: `SELECT * FROM user_soundboards WHERE user_id = ? ORDER BY created_at DESC LIMIT 60`,
    args: [userId],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name || "Sound"),
    audioUrl: String(r.audio_url || ""),
    durationMs: Number(r.duration_ms || 0),
    byteSize: Number(r.byte_size || 0),
    createdAt: Number(r.created_at || 0),
  }));
}

async function listOpenedViewOnceIdsForUser(db, userId) {
  const res = await db.execute({
    sql: `SELECT message_id FROM view_once_opens WHERE user_id = ? ORDER BY opened_at DESC LIMIT 2000`,
    args: [userId],
  });
  return res.rows.map((r) => String(r.message_id));
}

function safeEqualStrings(aStr, bStr) {
  const a = Buffer.from(String(aStr || ""), "utf8");
  const b = Buffer.from(String(bStr || ""), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function listLinkedDevicesForUser(db, userId) {
  const res = await db.execute({
    sql: `SELECT * FROM linked_devices WHERE user_id = ? ORDER BY last_active_at DESC, created_at DESC`,
    args: [userId],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    browserName: String(r.browser_name || "Chrome"),
    osName: String(r.os_name || ""),
    deviceLabel: String(r.device_label || `${r.browser_name || "Chrome"} JaText`),
    createdAt: Number(r.created_at || 0),
    lastActiveAt: Number(r.last_active_at || 0),
  }));
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
    ...(includePrivate ? { totpEnabled: Boolean(Number(row.totp_enabled || 0)) } : {}),
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

function isCallCancelWire(body) {
  const s = String(body || "");
  return (
    s === "__JATEXT_CALL_CANCEL__" ||
    s.includes("(__JATEXT_CALL_CANCEL__") ||
    s.includes("(__JATEXT_CALL_DM_ENDED__") ||
    s.includes("(__JATEXT_CALL_GRP_ENDED__") ||
    (s.startsWith("__JATEXT_CALL__:") &&
      (s.includes('"state":"missed"') ||
        s.includes('"state":"ended"') ||
        s.includes('"state":"declined"'))) ||
    (s.startsWith("__JATEXT_CALL_GRP__:") && s.includes('"state":"ended"')) ||
    (s.startsWith("__JATEXT_CALL_SIG__:") &&
      (s.includes('"type":"hangup"') || s.includes('"type":"decline"')))
  );
}

function isCallClaimWire(body) {
  const s = String(body || "");
  return (
    s.includes("(__JATEXT_CALL_CLAIM__") ||
    (s.startsWith("__JATEXT_CALL_SIG__:") &&
      (s.includes('"type":"claim"') ||
        s.includes('"type":"answer"') ||
        s.includes('"type":"claim-ring"') ||
        s.includes('"type":"decline-ring"')))
  );
}

async function dispatchPushToUsers(db, targetUserIds, payload) {
  if (!targetUserIds?.length) return;
  await Promise.race([
    dispatchPushToUsersImpl(db, targetUserIds, payload),
    new Promise((resolve) => setTimeout(resolve, 1800)),
  ]).catch(() => undefined);
}

async function dispatchPushToUsersImpl(db, targetUserIds, payload) {
  if (!targetUserIds?.length) return;
  const uniqueUserIds = [...new Set(targetUserIds.map((id) => String(id || "")).filter(Boolean))];
  if (!uniqueUserIds.length) return;
  const messaging = getFirebaseMessagingIfConfigured();
  if (!messaging) return;
  const placeholders = uniqueUserIds.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT token FROM push_devices WHERE user_id IN (${placeholders})`,
    args: uniqueUserIds,
  });
  const tokens = [...new Set(res.rows.map((r) => String(r.token)).filter(Boolean))];
  if (!tokens.length) return;

  if (payload.type === "sync_poke") {
    try {
      await messaging.sendEachForMulticast({
        tokens,
        data: {
          type: "sync_poke",
          senderId: String(payload.senderId || ""),
          ...(payload.groupId ? { groupId: String(payload.groupId) } : {}),
        },
        android: {
          priority: "high",
          ttl: 30_000,
        },
      });
    } catch {
      // Best-effort foreground wake poke
    }
    return;
  }

  const body = String(payload.body || "");
  if (
    body.startsWith("__JATEXT_SIG__:") ||
    body.startsWith("__JATEXT_REACT__:") ||
    body.startsWith("__JATEXT_SEEN__:") ||
    body.startsWith("__JATEXT_GRP_SEEN__:") ||
    body.startsWith("__JATEXT_GROUP_SEEN_V1__:")
  ) {
    return;
  }
  const isCallCancel = payload.type === "call_cancel" || isCallCancelWire(body);
  // Silent call/E2EE control packets that aren't call cancels should wake via sync_poke, never "New message"
  if (!isCallCancel && body.startsWith("__JATEXT_CALL_SIG__:")) {
    try {
      await messaging.sendEachForMulticast({
        tokens,
        data: {
          type: "sync_poke",
          senderId: String(payload.senderId || ""),
          ...(payload.groupId ? { groupId: String(payload.groupId) } : {}),
        },
        android: {
          priority: "high",
          ttl: 30_000,
        },
      });
    } catch {
      // Ignore transient poke failure
    }
    return;
  }
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
      ...(r.group_id ? { groupId: String(r.group_id) } : {}),
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

  const [countsRes, latestBatchRes] = await Promise.all([
    db.execute({
      sql: `SELECT group_id, COUNT(*) AS cnt FROM group_members WHERE group_id IN (${ph}) GROUP BY group_id`,
      args: groupIds,
    }),
    db.batch(
      groupIds.map((gid) => ({
        sql: `SELECT * FROM group_messages
              WHERE group_id = ?
                AND body NOT LIKE '__JATEXT_SIG__:%'
                AND body NOT LIKE '__JATEXT_CALL_SIG__:%'
                AND body NOT LIKE '__JATEXT_REACT__:%'
                AND body NOT LIKE '__JATEXT_SEEN__:%'
                AND body NOT LIKE '__JATEXT_GRP_SEEN__:%'
                AND body NOT LIKE '__JATEXT_GROUP_SEEN_V1__:%'
                AND body NOT LIKE '__JATEXT_IK_V1__:%'
                AND body NOT LIKE '__JATEXT_GK_V1__:%'
                AND body NOT LIKE '__JATEXT_E2EE_IK__:%'
                AND body NOT LIKE '__JATEXT_E2EE_GK__:%'
              ORDER BY created_at DESC
              LIMIT 1`,
        args: [gid],
      })),
    ),
  ]);

  const countMap = new Map();
  for (const c of countsRes.rows) countMap.set(String(c.group_id), Number(c.cnt));

  const latestMap = new Map();
  const senderIds = [];
  for (const subRes of latestBatchRes) {
    const m = subRes.rows[0];
    if (m) {
      latestMap.set(String(m.group_id), m);
      senderIds.push(String(m.sender_id));
    }
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
  const friendIdsSet = new Set();
  for (const r of frRes.rows) {
    const fromId = String(r.from_id);
    const toId = String(r.to_id);
    relatedUserIds.add(fromId);
    relatedUserIds.add(toId);
    if (String(r.status) === "accepted") {
      const otherId = fromId === meId ? toId : fromId;
      if (otherId !== meId) friendIdsSet.add(otherId);
    }
  }

  const friendIds = [...friendIdsSet];
  const pairKeys = friendIds.map((fid) => pairKey(meId, fid));
  const friendPh = friendIds.map(() => "?").join(",");
  const pairPh = pairKeys.map(() => "?").join(",");

  const [usersMap, presRes, latestBatchRes] = await Promise.all([
    getUsersMap(db, [...relatedUserIds]),
    friendIds.length
      ? db.execute({
          sql: `SELECT * FROM presence WHERE user_id IN (${friendPh})`,
          args: friendIds,
        })
      : Promise.resolve({ rows: [] }),
    pairKeys.length
      ? db.batch(
          pairKeys.map((pk) => ({
            sql: `SELECT * FROM messages
                  WHERE pair_key = ?
                    AND body NOT LIKE '__JATEXT_SIG__:%'
                    AND body NOT LIKE '__JATEXT_CALL_SIG__:%'
                    AND body NOT LIKE '__JATEXT_REACT__:%'
                    AND body NOT LIKE '__JATEXT_SEEN__:%'
                    AND body NOT LIKE '__JATEXT_IK_V1__:%'
                    AND body NOT LIKE '__JATEXT_GK_V1__:%'
                    AND body NOT LIKE '__JATEXT_E2EE_IK__:%'
                    AND body NOT LIKE '__JATEXT_E2EE_GK__:%'
                  ORDER BY created_at DESC
                  LIMIT 1`,
            args: [pk],
          })),
        )
      : Promise.resolve([]),
  ]);
  const latestRes = {
    rows: latestBatchRes.map((sub) => sub.rows[0]).filter(Boolean),
  };

  const incoming = [];
  const outgoing = [];

  for (const r of frRes.rows) {
    const status = String(r.status);
    const fromId = String(r.from_id);
    const toId = String(r.to_id);
    if (status === "pending") {
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

  const friends = friendIds
    .map((fid) => mapUserRow(usersMap.get(fid)))
    .filter(Boolean)
    .sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));

  // Presence & typing for friends
  let friendActivities = [];
  if (friendIds.length) {
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
  if (auth.linkedDeviceId) {
    const devRes = await db.execute({
      sql: `SELECT id, last_active_at FROM linked_devices WHERE id = ? AND user_id = ? LIMIT 1`,
      args: [auth.linkedDeviceId, auth.userId],
    });
    if (!devRes.rows.length) {
      throw new TursoAppError("This device was unlinked from your phone.", 401);
    }
    const nowTs = Date.now();
    const prevActive = Number(devRes.rows[0].last_active_at || 0);
    if (nowTs - prevActive > 60_000) {
      await db
        .execute({
          sql: `UPDATE linked_devices SET last_active_at = ? WHERE id = ? AND user_id = ?`,
          args: [nowTs, auth.linkedDeviceId, auth.userId],
        })
        .catch(() => {});
    }
  }
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
    const updatedRow = updated.rows[0];
    if (Number(updatedRow?.totp_enabled || 0) === 1 && updatedRow?.totp_secret) {
      return {
        requiresTwoFactor: true,
        challengeToken: createTwoFactorChallengeToken(uid, cleanEmail),
        email: cleanEmail,
        token: null,
        me: null,
      };
    }
    return {
      requiresTwoFactor: false,
      token: createAuthToken(uid, cleanEmail),
      me: mapUserRow(updatedRow, true),
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
    requiresTwoFactor: false,
    token: createAuthToken(uid, cleanEmail),
    me: mapUserRow(created.rows[0], true),
  };
}

export async function saveMobileOAuthHandoff({
  sessionId,
  status,
  token = null,
  me = null,
  error = null,
  challengeToken = null,
}) {
  const cleanId = String(sessionId || "").trim();
  if (!/^[a-f0-9]{24,96}$/i.test(cleanId)) return;
  const db = await getDb();
  const now = Date.now();
  await db
    .execute({
      sql: `DELETE FROM oauth_mobile_handoffs WHERE created_at < ?`,
      args: [now - 15 * 60_000],
    })
    .catch(() => undefined);
  await db.execute({
    sql: `INSERT INTO oauth_mobile_handoffs (session_id, status, token, me_json, error, challenge_token, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id) DO UPDATE SET
            status = excluded.status,
            token = excluded.token,
            me_json = excluded.me_json,
            error = excluded.error,
            challenge_token = excluded.challenge_token,
            created_at = excluded.created_at`,
    args: [
      cleanId,
      String(status || "pending"),
      token ? String(token) : null,
      me ? JSON.stringify(me) : null,
      error ? String(error) : null,
      challengeToken ? String(challengeToken) : null,
      now,
    ],
  });
}

export async function consumeMobileOAuthHandoff(sessionId) {
  const cleanId = String(sessionId || "").trim();
  if (!/^[a-f0-9]{24,96}$/i.test(cleanId)) {
    return { status: "missing" };
  }
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT * FROM oauth_mobile_handoffs WHERE session_id = ? LIMIT 1`,
    args: [cleanId],
  });
  if (!res.rows.length) {
    return { status: "pending" };
  }
  const row = res.rows[0];
  const ageMs = Date.now() - Number(row.created_at || 0);
  if (ageMs > 15 * 60_000) {
    await db
      .execute({ sql: `DELETE FROM oauth_mobile_handoffs WHERE session_id = ?`, args: [cleanId] })
      .catch(() => undefined);
    return { status: "expired" };
  }
  const status = String(row.status || "pending");
  if (status === "complete" || status === "error" || status === "two_factor_required") {
    await db
      .execute({ sql: `DELETE FROM oauth_mobile_handoffs WHERE session_id = ?`, args: [cleanId] })
      .catch(() => undefined);
  }
  return {
    status,
    token: row.token ? String(row.token) : null,
    challengeToken: row.challenge_token ? String(row.challenge_token) : null,
    me: row.me_json ? safeJsonParse(row.me_json, null) : null,
    error: row.error ? String(row.error) : null,
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
      if (Number(user.totp_enabled || 0) === 1 && user.totp_secret) {
        return {
          requiresTwoFactor: true,
          challengeToken: createTwoFactorChallengeToken(uid, email),
          email,
        };
      }
      return {
        requiresTwoFactor: false,
        token: createAuthToken(uid, email),
        me: mapUserRow(user, true),
      };
    }

    case "verifyTwoFactorLogin": {
      const challengeToken = String(args.challengeToken || "").trim();
      const rawCode = String(args.code || "").trim();
      const verified = verifyTwoFactorChallengeToken(challengeToken);
      if (!verified) {
        throw new TursoAppError("Your 2FA session expired. Please sign in again.", 401);
      }
      const res = await db.execute({
        sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
        args: [verified.userId],
      });
      if (!res.rows.length) {
        throw new TursoAppError("Account not found.", 404);
      }
      const user = res.rows[0];
      const secret = String(user.totp_secret || "");
      const totpOk = secret && verifyTotpCode(secret, rawCode, 2);
      let backupMatched = false;
      if (!totpOk) {
        const cleanBackup = rawCode.toUpperCase().replace(/\s+/g, "");
        const backups = safeJsonParse(user.totp_backup_codes_json, []);
        if (Array.isArray(backups) && backups.includes(cleanBackup)) {
          backupMatched = true;
          const remaining = backups.filter((c) => c !== cleanBackup);
          await db.execute({
            sql: `UPDATE users SET totp_backup_codes_json = ?, updated_at = ? WHERE id = ?`,
            args: [JSON.stringify(remaining), now, String(user.id)],
          });
        }
      }
      if (!totpOk && !backupMatched) {
        throw new TursoAppError("Invalid authentication code. Please try again.");
      }
      const uid = String(user.id);
      const email = String(user.email || verified.email || "");
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
        openedViewOnceIds,
        soundboards,
      ] = await Promise.all([
        buildSocialAndPreviews(db, meId),
        getStickersForUser(db, meId),
        getCommunityRole(db, meRow),
        db.execute({
          sql: `SELECT * FROM community_user_settings WHERE user_id = ? LIMIT 1`,
          args: [meId],
        }),
        db.execute(`SELECT * FROM community_messages ORDER BY created_at DESC LIMIT 121`),
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
        listOpenedViewOnceIdsForUser(db, meId),
        listSoundboardsForUser(db, meId),
      ]);

      const commHasMore = commMsgsRes.rows.length > 120;
      const commSlice = commHasMore ? commMsgsRes.rows.slice(0, 120) : commMsgsRes.rows;
      const communityMessages = await hydrateCommunityMessages(
        db,
        [...commSlice].reverse(),
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
          ? createAuthToken(
              meId,
              String(meRow.email || ""),
              auth.linkedDeviceId
                ? { linkedDeviceId: auth.linkedDeviceId, client: auth.client || "web_linked" }
                : null,
            )
          : undefined;

      return {
        serverTime: Date.now(),
        me: mapUserRow(meRow, true),
        ...social,
        ...stickers,
        communityPermissions: commRole,
        communityDirectory,
        communityMuted: Boolean(Number(commSettingsRes.rows[0]?.is_muted || 0)),
        communityMessages,
        communityHasMore: commHasMore,
        groups,
        hasRemoteE2EEVault: vaultRes.rows.length > 0,
        remoteVaultKeyId: vaultRes.rows[0] ? String(vaultRes.rows[0].key_id) : null,
        openedViewOnceIds,
        soundboards,
        chatOrganization: normalizeChatOrg(safeJsonParse(meRow.chat_org_json, {})),
        ...(refreshedToken ? { refreshedToken } : {}),
      };
    }

    case "sync": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const syncStartedAt = Date.now();
      void flushDueScheduledMessages(db, false).catch(() => undefined);
      const sinceTs = Math.max(0, Number(args.sinceTs || 0) - 8000);
      const activeFriendId = args.activeFriendId ? String(args.activeFriendId) : null;
      const activeGroupId = args.activeGroupId ? String(args.activeGroupId) : null;

      // Run presence touch + all delta checks in a single parallel round-trip
      const activePairKey = activeFriendId ? pairKey(meId, activeFriendId) : null;
      const recentCallWindowTs = syncStartedAt - 120_000;
      const [
        dmDeltaRes,
        activeDmDeltaRes,
        callDmDeltaRes,
        frDeltaRes,
        commDeltaRes,
        grpMsgDeltaRes,
        callGrpDeltaRes,
        allGrpTypingRes,
        commTypingRes,
        dmTypingRes,
        myGroupsCheck,
        stickerDeltaRes,
      ] = await Promise.all([
        db.execute({
          sql: `SELECT id FROM (
                  SELECT id FROM messages WHERE receiver_id = ? AND updated_at > ? LIMIT 1
                ) UNION ALL SELECT id FROM (
                  SELECT id FROM messages WHERE sender_id = ? AND updated_at > ? LIMIT 1
                ) LIMIT 1`,
          args: [meId, sinceTs, meId, sinceTs],
        }),
        activePairKey
          ? db.execute({
              sql: `SELECT * FROM messages WHERE pair_key = ? AND updated_at > ? ORDER BY created_at ASC LIMIT 120`,
              args: [activePairKey, sinceTs],
            })
          : Promise.resolve({ rows: [] }),
        db.execute({
          sql: `SELECT * FROM (
                  SELECT * FROM messages
                  WHERE receiver_id = ? AND updated_at > ? AND created_at > ?
                    AND (body LIKE '__JATEXT_CALL%' OR body LIKE '%(__JATEXT_CALL_%')
                  UNION
                  SELECT * FROM messages
                  WHERE sender_id = ? AND updated_at > ? AND created_at > ?
                    AND (body LIKE '__JATEXT_CALL%' OR body LIKE '%(__JATEXT_CALL_%')
                ) ORDER BY created_at ASC LIMIT 60`,
          args: [meId, sinceTs, recentCallWindowTs, meId, sinceTs, recentCallWindowTs],
        }),
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
        db.execute({
          sql: `SELECT m.* FROM group_messages m
                INNER JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?
                WHERE m.updated_at > ?
                  AND m.created_at > ?
                  AND (m.body LIKE '__JATEXT_CALL%' OR m.body LIKE '%(__JATEXT_CALL_%')
                ORDER BY m.created_at ASC
                LIMIT 60`,
          args: [meId, sinceTs, recentCallWindowTs],
        }),
        db.execute({
          sql: `SELECT ct.channel_id, ct.user_id FROM chat_typing ct
                INNER JOIN group_members gm ON ct.channel_id = ('group:' || gm.group_id)
                WHERE gm.user_id = ? AND ct.typing_at > ? AND ct.user_id != ?`,
          args: [meId, syncStartedAt - 6_000, meId],
        }),
        db.execute({
          sql: `SELECT user_id FROM chat_typing WHERE channel_id = 'community' AND typing_at > ? AND user_id != ?`,
          args: [syncStartedAt - 6_000, meId],
        }),
        db.execute({
          sql: `SELECT user_id FROM presence WHERE typing_to_id = ? AND typing_at > ?`,
          args: [meId, syncStartedAt - 6_000],
        }),
        db.execute({
          sql: `SELECT 1 FROM group_members gm
                LEFT JOIN groups g ON g.id = gm.group_id
                LEFT JOIN group_messages m ON m.group_id = gm.group_id AND m.updated_at > ?
                WHERE gm.user_id = ? AND (gm.updated_at > ? OR g.updated_at > ? OR m.id IS NOT NULL)
                LIMIT 1`,
          args: [sinceTs, meId, sinceTs, sinceTs],
        }),
        db.execute({
          sql: `SELECT 1 FROM sticker_library WHERE user_id = ? AND updated_at > ? LIMIT 1`,
          args: [meId, sinceTs],
        }),
        args.touchPresence
          ? db.execute({
              sql: `INSERT INTO presence (user_id, last_seen_at, last_active_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, last_active_at = excluded.last_active_at`,
              args: [meId, syncStartedAt, syncStartedAt],
            })
          : Promise.resolve(null),
      ]);

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

      let callDmMessages = [];
      if (callDmDeltaRes.rows.length > 0) {
        callDmMessages = hydrateDmMessages(callDmDeltaRes.rows, meId, new Map(), new Set());
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

      let callGroupMessages = [];
      if (callGrpDeltaRes.rows.length > 0) {
        callGroupMessages = await hydrateGroupMessages(db, callGrpDeltaRes.rows, meId, 0);
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

      // Resolve typing users across active group, all member groups, community, and 1:1 DMs
      const dmTypingUserIds = dmTypingRes.rows.map((r) => String(r.user_id)).filter(Boolean);
      const allTypingIds = Array.from(
        new Set([
          ...allGrpTypingRes.rows.map((r) => String(r.user_id)),
          ...commTypingRes.rows.map((r) => String(r.user_id)),
        ]),
      ).filter(Boolean);
      const [typingUsersMap, stickersDelta] = await Promise.all([
        allTypingIds.length > 0 ? getUsersMap(db, allTypingIds) : Promise.resolve(new Map()),
        stickerDeltaRes.rows.length > 0 ? getStickersForUser(db, meId) : Promise.resolve(null),
      ]);

      const typingByGroup = {};
      for (const r of allGrpTypingRes.rows) {
        const ch = String(r.channel_id || "");
        if (!ch.startsWith("group:")) continue;
        const gid = ch.slice("group:".length);
        const u = mapUserRow(typingUsersMap.get(String(r.user_id)));
        if (!gid || !u) continue;
        if (!typingByGroup[gid]) typingByGroup[gid] = [];
        typingByGroup[gid].push({ id: u.id, displayName: u.displayName, username: u.username });
      }
      const groupTypingUsers = activeGroupId ? typingByGroup[activeGroupId] || [] : [];
      const communityTypingUsers = commTypingRes.rows
        .map((r) => mapUserRow(typingUsersMap.get(String(r.user_id))))
        .filter(Boolean)
        .map((u) => ({ id: u.id, displayName: u.displayName, username: u.username }));

      return {
        serverTime: syncStartedAt,
        ...(Number(meRow.updated_at) > sinceTs ? { me: mapUserRow(meRow, true) } : {}),
        ...(social ? { social } : {}),
        ...(stickersDelta ? { stickers: stickersDelta } : {}),
        ...(changedDmMessages.length ? { changedDmMessages } : {}),
        ...(callDmMessages.length ? { callDmMessages } : {}),
        ...(changedGroupMessages.length ? { changedGroupMessages } : {}),
        ...(callGroupMessages.length ? { callGroupMessages } : {}),
        ...(changedCommunityMessages.length ? { changedCommunityMessages } : {}),
        ...(groups ? { groups } : {}),
        dmTypingUserIds,
        typingByGroup,
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
      const beforeTs = args.beforeTs != null ? Number(args.beforeTs) : 0;
      const pageLimit = Math.min(250, Math.max(20, Number(args.limit || 160)));

      const [settingsRes, msgsRes, recentSigsRes, favKeys] = await Promise.all([
        db.execute({
          sql: `SELECT deleted_at FROM conversation_settings WHERE user_id = ? AND friend_id = ? LIMIT 1`,
          args: [meId, otherId],
        }),
        beforeTs > 0
          ? db.execute({
              sql: `SELECT * FROM messages
                    WHERE pair_key = ? AND created_at < ? AND body NOT LIKE '__JATEXT_SIG__:%'
                    ORDER BY created_at DESC
                    LIMIT ?`,
              args: [pk, beforeTs, pageLimit + 1],
            })
          : db.execute({
              sql: `SELECT * FROM messages
                    WHERE pair_key = ? AND body NOT LIKE '__JATEXT_SIG__:%'
                    ORDER BY created_at DESC
                    LIMIT ?`,
              args: [pk, pageLimit + 1],
            }),
        beforeTs > 0
          ? Promise.resolve({ rows: [] })
          : db.execute({
              sql: `SELECT * FROM messages
                    WHERE pair_key = ? AND body LIKE '__JATEXT_SIG__:%' AND created_at > ?
                    ORDER BY created_at ASC
                    LIMIT 40`,
              args: [pk, Date.now() - 120_000],
            }),
        getUserFavoriteMediaKeys(db, meId),
      ]);

      const deletedAt =
        settingsRes.rows[0]?.deleted_at != null ? Number(settingsRes.rows[0].deleted_at) : 0;
      const rawHasMore = msgsRes.rows.length > pageLimit;
      const sliced = rawHasMore ? msgsRes.rows.slice(0, pageLimit) : msgsRes.rows;
      const oldestInSlice = sliced.length ? Number(sliced[sliced.length - 1].created_at) : 0;
      const hasMore = rawHasMore && (!deletedAt || oldestInSlice > deletedAt);

      const combinedMap = new Map();
      for (const r of [...sliced].reverse()) {
        if (!deletedAt || Number(r.created_at) > deletedAt) {
          combinedMap.set(String(r.id), r);
        }
      }
      for (const s of recentSigsRes.rows) {
        if (!deletedAt || Number(s.created_at) > deletedAt) {
          combinedMap.set(String(s.id), s);
        }
      }
      const ordered = [...combinedMap.values()].sort(
        (a, b) => Number(a.created_at) - Number(b.created_at),
      );

      const replyMap = new Map();
      for (const r of ordered) replyMap.set(String(r.id), r);
      const missingReplyIds = ordered
        .map((r) => (r.reply_to_id ? String(r.reply_to_id) : null))
        .filter((rid) => rid && !replyMap.has(rid));
      if (missingReplyIds.length) {
        const uniqueMissing = [...new Set(missingReplyIds)];
        const ph = uniqueMissing.map(() => "?").join(",");
        const repRes = await db.execute({
          sql: `SELECT * FROM messages WHERE id IN (${ph})`,
          args: uniqueMissing,
        });
        for (const r of repRes.rows) replyMap.set(String(r.id), r);
      }

      return { messages: hydrateDmMessages(ordered, meId, replyMap, favKeys), hasMore };
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

      const [blocked, friendsOk, recvPresRes, recvUserRes, recvSettingsRes] = await Promise.all([
        isBlockedEitherWay(db, meId, receiverId),
        areFriendsInDb(db, meId, receiverId),
        db.execute({ sql: `SELECT * FROM presence WHERE user_id = ? LIMIT 1`, args: [receiverId] }),
        db.execute({ sql: `SELECT * FROM users WHERE id = ? LIMIT 1`, args: [receiverId] }),
        db.execute({
          sql: `SELECT * FROM conversation_settings WHERE user_id = ? AND friend_id = ? LIMIT 1`,
          args: [receiverId, meId],
        }),
      ]);
      if (blocked) {
        throw new TursoAppError("Cannot message this user.");
      }
      if (!friendsOk) {
        throw new TursoAppError("You can only message accepted friends.");
      }

      const writeAt = Date.now();
      const recvOnline =
        recvPresRes.rows[0] && writeAt - Number(recvPresRes.rows[0].last_seen_at || 0) < 90_000;
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
          writeAt,
          writeAt,
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

      const callCancel = isCallCancelWire(body);
      const callClaim = isCallClaimWire(body);
      const dmPushTasks = [];

      if (callCancel) {
        // Cancel incoming call wakeup on BOTH recipient's devices AND our own sibling mobile devices!
        dmPushTasks.push(
          dispatchPushToUsers(db, [receiverId, meId], {
            type: "call_cancel",
            senderId: meId,
            body: "__JATEXT_CALL_CANCEL__",
          }),
        );
      } else if (callClaim) {
        // Answered/claimed on one of our devices -> immediately stop ringing on our own mobile phone(s),
        // and send a high-priority sync_poke to the caller so their WebRTC answer arrives instantaneously!
        dmPushTasks.push(
          dispatchPushToUsers(db, [meId], {
            type: "call_cancel",
            senderId: meId,
            body: "__JATEXT_CALL_CANCEL__",
          }),
          dispatchPushToUsers(db, [receiverId], {
            type: "sync_poke",
            senderId: meId,
          }),
        );
      } else if (shouldPush) {
        dmPushTasks.push(
          dispatchPushToUsers(db, [receiverId], {
            senderId: meId,
            senderName: String(meRow.display_name || meRow.username || "JaText"),
            body,
          }),
        );
      } else {
        dmPushTasks.push(
          dispatchPushToUsers(db, [receiverId], {
            type: "sync_poke",
            senderId: meId,
          }),
        );
      }

      const [rowRes, favKeys, repRes] = await Promise.all([
        db.execute({ sql: `SELECT * FROM messages WHERE id = ?`, args: [msgId] }),
        getUserFavoriteMediaKeys(db, meId),
        args.replyToId
          ? db.execute({
              sql: `SELECT * FROM messages WHERE id = ?`,
              args: [String(args.replyToId)],
            })
          : Promise.resolve({ rows: [] }),
        ...dmPushTasks,
      ]);
      const replyMap = new Map();
      if (repRes.rows[0]) replyMap.set(String(repRes.rows[0].id), repRes.rows[0]);
      return {
        message: hydrateDmMessages(rowRes.rows, meId, replyMap, favKeys)[0],
      };
    }

    case "markMessagesRead": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const friendId = String(args.friendId || "");
      const pk = pairKey(meId, friendId);
      const writeAt = Date.now();
      await db.execute({
        sql: `UPDATE messages
              SET delivery_status = 'read', updated_at = ?
              WHERE pair_key = ? AND receiver_id = ? AND delivery_status != 'read'`,
        args: [writeAt, pk, meId],
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
      const writeAt = Date.now();
      await db.execute({
        sql: `UPDATE messages SET reactions_json = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(list), writeAt, messageId],
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
      const writeAt = Date.now();
      const editTasks = [
        db.execute({
          sql: `UPDATE messages SET body = ?, edited_at = ?, updated_at = ? WHERE id = ?`,
          args: [body, writeAt, writeAt, messageId],
        }),
      ];
      if (isCallCancelWire(body)) {
        editTasks.push(
          dispatchPushToUsers(db, [String(m.receiver_id), meId], {
            type: "call_cancel",
            senderId: meId,
            body: "__JATEXT_CALL_CANCEL__",
          }),
        );
      }
      await Promise.all(editTasks);
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
      const writeAt = Date.now();
      if (writeAt - Number(m.created_at) > UNSEND_WINDOW_MS) {
        throw new TursoAppError("Messages can only be unsent within 1 hour of sending.");
      }
      const firstWarning = !meRow.unsend_warning_shown_at;
      await db.batch(
        [
          {
            sql: `UPDATE messages SET body = '', attachment_url = NULL, attachment_name = NULL, attachment_type = NULL, reactions_json = '[]', unsent_at = ?, updated_at = ? WHERE id = ?`,
            args: [writeAt, writeAt, messageId],
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

    case "restoreMessageForMe": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const messageId = String(args.messageId || "");
      const res = await db.execute({ sql: `SELECT * FROM messages WHERE id = ?`, args: [messageId] });
      if (!res.rows.length) return { ok: true };
      const hidden = safeJsonParse(res.rows[0].hidden_for_json, []).filter((uid) => uid !== meId);
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

    case "listCommunityMessages": {
      const meRow = await requireMeRow(db, auth);
      const role = await getCommunityRole(db, meRow);
      const beforeTs = args.beforeTs != null ? Number(args.beforeTs) : 0;
      const pageLimit = Math.min(200, Math.max(20, Number(args.limit || 120)));
      const msgsRes =
        beforeTs > 0
          ? await db.execute({
              sql: `SELECT * FROM community_messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?`,
              args: [beforeTs, pageLimit + 1],
            })
          : await db.execute({
              sql: `SELECT * FROM community_messages ORDER BY created_at DESC LIMIT ?`,
              args: [pageLimit + 1],
            });
      const hasMore = msgsRes.rows.length > pageLimit;
      const slice = hasMore ? msgsRes.rows.slice(0, pageLimit) : msgsRes.rows;
      const messages = await hydrateCommunityMessages(db, [...slice].reverse(), meRow, role);
      return { messages, hasMore };
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
      const writeAt = Date.now();

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
          writeAt,
          writeAt,
        ],
      });

      const [recipientsRes, rowRes] = await Promise.all([
        db.execute({
          sql: `SELECT u.id FROM users u
                LEFT JOIN community_user_settings cs ON cs.user_id = u.id
                WHERE u.id != ? AND u.status_preference != 'dnd' AND COALESCE(cs.is_muted, 0) = 0`,
          args: [meId],
        }),
        db.execute({
          sql: `SELECT * FROM community_messages WHERE id = ?`,
          args: [msgId],
        }),
      ]);
      const recipientIds = recipientsRes.rows.map((r) => String(r.id));
      const [hydrated] = await Promise.all([
        hydrateCommunityMessages(db, rowRes.rows, meRow, role),
        recipientIds.length
          ? dispatchPushToUsers(db, recipientIds, {
              senderId: meId,
              senderName: "JaText Announcements",
              title: "JaText Announcements",
              body: type === "poll" ? `Poll: ${body}` : body || "New announcement",
            })
          : Promise.resolve(),
      ]);
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

      if (action === "unhideForMe") {
        const hidden = safeJsonParse(m.hidden_for_json, []).filter((uid) => uid !== meId);
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
      const beforeTs = args.beforeTs != null ? Number(args.beforeTs) : 0;
      const pageLimit = Math.min(250, Math.max(20, Number(args.limit || 160)));

      const [memRes, gusRes, msgsRes, recentSigsRes] = await Promise.all([
        db.execute({
          sql: `SELECT role FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
          args: [groupId, meId],
        }),
        db.execute({
          sql: `SELECT cleared_at FROM group_user_settings WHERE user_id = ? AND group_id = ? LIMIT 1`,
          args: [meId, groupId],
        }),
        beforeTs > 0
          ? db.execute({
              sql: `SELECT * FROM group_messages
                    WHERE group_id = ? AND created_at < ? AND body NOT LIKE '__JATEXT_SIG__:%'
                    ORDER BY created_at DESC
                    LIMIT ?`,
              args: [groupId, beforeTs, pageLimit + 1],
            })
          : db.execute({
              sql: `SELECT * FROM group_messages
                    WHERE group_id = ? AND body NOT LIKE '__JATEXT_SIG__:%'
                    ORDER BY created_at DESC
                    LIMIT ?`,
              args: [groupId, pageLimit + 1],
            }),
        beforeTs > 0
          ? Promise.resolve({ rows: [] })
          : db.execute({
              sql: `SELECT * FROM group_messages
                    WHERE group_id = ? AND body LIKE '__JATEXT_SIG__:%' AND created_at > ?
                    ORDER BY created_at ASC
                    LIMIT 40`,
              args: [groupId, Date.now() - 120_000],
            }),
      ]);
      if (!memRes.rows.length) return { messages: [], hasMore: false };
      const clearedAt = gusRes.rows[0]?.cleared_at != null ? Number(gusRes.rows[0].cleared_at) : 0;
      const rawHasMore = msgsRes.rows.length > pageLimit;
      const sliced = rawHasMore ? msgsRes.rows.slice(0, pageLimit) : msgsRes.rows;
      const oldestInSlice = sliced.length ? Number(sliced[sliced.length - 1].created_at) : 0;
      const hasMore = rawHasMore && (!clearedAt || oldestInSlice > clearedAt);

      const combinedMap = new Map();
      for (const r of [...sliced].reverse()) {
        combinedMap.set(String(r.id), r);
      }
      for (const s of recentSigsRes.rows) {
        combinedMap.set(String(s.id), s);
      }
      const ordered = [...combinedMap.values()].sort(
        (a, b) => Number(a.created_at) - Number(b.created_at),
      );
      const messages = await hydrateGroupMessages(db, ordered, meId, clearedAt);
      return { messages, hasMore };
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
      const writeAt = Date.now();
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
              writeAt,
              writeAt,
            ],
          },
          {
            sql: `UPDATE groups SET updated_at = ? WHERE id = ?`,
            args: [writeAt, groupId],
          },
        ],
        "write",
      );

      // Push notifications for group calls / mentions / @everyone + silent sync_poke for active members
      const callInfo = detectCallInfo(body);
      const grpCallCancel = isCallCancelWire(body);
      const grpCallClaim = isCallClaimWire(body);
      const allOtherMemberIds = memRes.rows
        .map((m) => String(m.user_id))
        .filter((uid) => uid !== meId);
      const candidateTargets =
        mentionsEveryone || callInfo.isCall ? allOtherMemberIds : mentionedUserIds;

      const pushTasks = [];
      let notifiedSet = new Set();
      if (grpCallCancel) {
        notifiedSet = new Set(allOtherMemberIds);
        pushTasks.push(
          dispatchPushToUsers(db, [...allOtherMemberIds, meId], {
            type: "call_cancel",
            senderId: meId,
            body: "__JATEXT_CALL_CANCEL__",
            groupId,
          }),
        );
      } else if (grpCallClaim) {
        // User answered or declined a group call ring on one device -> stop ringing on their own mobile phone(s)!
        pushTasks.push(
          dispatchPushToUsers(db, [meId], {
            type: "call_cancel",
            senderId: meId,
            body: "__JATEXT_CALL_CANCEL__",
            groupId,
          }),
        );
      }
      if (!grpCallCancel && candidateTargets.length) {
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
          notifiedSet = new Set(finalPushTargets);
          const groupName = String(grpRes.rows[0].name);
          const senderName = String(meRow.display_name || meRow.username || "Member");
          pushTasks.push(
            dispatchPushToUsers(db, finalPushTargets, {
              senderId: meId,
              senderName,
              title: callInfo.isCall ? groupName : `${senderName} in ${groupName}`,
              body,
              groupId,
            }),
          );
        }
      }

      const pokeTargets = allOtherMemberIds.filter((uid) => !notifiedSet.has(uid));
      if (pokeTargets.length && !body.startsWith("__JATEXT_SIG__:")) {
        pushTasks.push(
          dispatchPushToUsers(db, pokeTargets, {
            type: "sync_poke",
            senderId: meId,
            groupId,
          }),
        );
      }

      const [rowRes] = await Promise.all([
        db.execute({
          sql: `SELECT * FROM group_messages WHERE id = ?`,
          args: [msgId],
        }),
        ...pushTasks,
      ]);
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

      if (action === "unhideForMe") {
        const hidden = safeJsonParse(m.hidden_for_json, []).filter((uid) => uid !== meId);
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
          if (!isMod) throw new TursoAppError("Only owners or moderators can mute members.", 403);
          const targetId = String(args.userId || "");
          if (targetId === String(grp.owner_id)) {
            throw new TursoAppError("Cannot mute the group owner.", 403);
          }
          if (!isOwner) {
            const targetRes = await db.execute({
              sql: `SELECT role FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
              args: [groupId, targetId],
            });
            if (String(targetRes.rows[0]?.role || "") === "moderator") {
              throw new TursoAppError("Only the group owner can mute a moderator.", 403);
            }
          }
          await db.execute({
            sql: `UPDATE group_members SET muted = ?, updated_at = ? WHERE group_id = ? AND user_id = ? AND role != 'owner'`,
            args: [args.muted ? 1 : 0, now, groupId, targetId],
          });
          return { ok: true };
        }

        case "removeMember": {
          if (!isOwner) {
            throw new TursoAppError("Only the group owner can remove members.", 403);
          }
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
      // Prune stale historical keys beyond the 14 newest so active device keys are never crowded out
      await db
        .execute({
          sql: `DELETE FROM e2ee_user_keys
                WHERE user_id = ?
                  AND key_id NOT IN (
                    SELECT key_id FROM e2ee_user_keys
                    WHERE user_id = ?
                    ORDER BY updated_at DESC
                    LIMIT 14
                  )`,
          args: [meId, meId],
        })
        .catch(() => undefined);
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

    /* ---------- QR Companion Device Linking (Max 5 Linked Web Devices) ---------- */
    case "createDeviceLinkSession": {
      const secretHash = String(args.secretHash || "").trim();
      const webDhPubB64 = String(args.webDhPubB64 || "").trim();
      const browserName = String(args.browserName || "Chrome").trim().slice(0, 40) || "Chrome";
      const osName = String(args.osName || "").trim().slice(0, 40);
      const previousPairingId = String(args.previousPairingId || "").trim();
      if (!secretHash || !webDhPubB64) {
        throw new TursoAppError("Invalid QR link session parameters.");
      }
      if (previousPairingId) {
        await db
          .execute({
            sql: `DELETE FROM device_link_sessions WHERE pairing_id = ? AND status = 'pending'`,
            args: [previousPairingId],
          })
          .catch(() => {});
      }
      await db
        .execute({
          sql: `DELETE FROM device_link_sessions WHERE expires_at < ?`,
          args: [now - 5 * 60_000],
        })
        .catch(() => {});

      const pairingId = newId();
      const expiresAt = now + LINK_SESSION_TTL_MS;
      await db.execute({
        sql: `INSERT INTO device_link_sessions (
                pairing_id, secret_hash, web_dh_pub_b64, browser_name, os_name, status, created_at, updated_at, expires_at
              ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        args: [pairingId, secretHash, webDhPubB64, browserName, osName, now, now, expiresAt],
      });
      return { pairingId, expiresAt };
    }

    case "cancelDeviceLinkSession": {
      const pairingId = String(args.pairingId || "").trim();
      const linkSecret = String(args.linkSecret || "").trim();
      if (pairingId && linkSecret) {
        const res = await db.execute({
          sql: `SELECT secret_hash, status FROM device_link_sessions WHERE pairing_id = ? LIMIT 1`,
          args: [pairingId],
        });
        const row = res.rows[0];
        if (
          row &&
          String(row.status) === "pending" &&
          safeEqualStrings(sha256Base64Url(linkSecret), String(row.secret_hash || ""))
        ) {
          await db.execute({
            sql: `DELETE FROM device_link_sessions WHERE pairing_id = ? AND status = 'pending'`,
            args: [pairingId],
          });
        }
      }
      return { ok: true };
    }

    case "pollDeviceLinkSession": {
      const pairingId = String(args.pairingId || "").trim();
      const linkSecret = String(args.linkSecret || "").trim();
      if (!pairingId || !linkSecret) return { status: "expired" };
      const res = await db.execute({
        sql: `SELECT * FROM device_link_sessions WHERE pairing_id = ? LIMIT 1`,
        args: [pairingId],
      });
      if (!res.rows.length) return { status: "expired" };
      const row = res.rows[0];
      if (!safeEqualStrings(sha256Base64Url(linkSecret), String(row.secret_hash || ""))) {
        return { status: "expired" };
      }
      const status = String(row.status || "pending");
      const expiresAt = Number(row.expires_at || 0);
      if (status === "pending" && now > expiresAt) {
        return { status: "expired" };
      }
      if (status === "approved") {
        return {
          status: "approved",
          token: String(row.linked_jwt || ""),
          sealedBundleJson: String(row.sealed_bundle_json || ""),
          linkedDeviceId: String(row.linked_device_id || ""),
        };
      }
      return { status, expiresAt };
    }

    case "completeDeviceLinkSession": {
      const pairingId = String(args.pairingId || "").trim();
      const linkSecret = String(args.linkSecret || "").trim();
      if (!pairingId || !linkSecret) {
        throw new TursoAppError("Invalid link session.");
      }
      const res = await db.execute({
        sql: `SELECT * FROM device_link_sessions WHERE pairing_id = ? LIMIT 1`,
        args: [pairingId],
      });
      if (!res.rows.length) {
        throw new TursoAppError("Link session expired.");
      }
      const row = res.rows[0];
      if (!safeEqualStrings(sha256Base64Url(linkSecret), String(row.secret_hash || ""))) {
        throw new TursoAppError("Invalid link secret.");
      }
      await db.execute({
        sql: `UPDATE device_link_sessions
              SET status = 'completed', linked_jwt = NULL, sealed_bundle_json = NULL, updated_at = ?
              WHERE pairing_id = ?`,
        args: [now, pairingId],
      });
      return { ok: true };
    }

    case "listLinkedDevices": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const devices = await listLinkedDevicesForUser(db, meId);
      return { devices, maxDevices: MAX_LINKED_DEVICES };
    }

    case "disconnectLinkedDevice": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const targetId = String(args.deviceId || auth?.linkedDeviceId || "").trim();
      if (!targetId) {
        throw new TursoAppError("Device ID is required.");
      }
      await db.execute({
        sql: `DELETE FROM linked_devices WHERE id = ? AND user_id = ?`,
        args: [targetId, meId],
      });
      const devices = await listLinkedDevicesForUser(db, meId);
      return { devices, maxDevices: MAX_LINKED_DEVICES };
    }

    case "claimDeviceLinkSession": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const existingDevices = await listLinkedDevicesForUser(db, meId);
      if (existingDevices.length >= MAX_LINKED_DEVICES) {
        throw new TursoAppError(
          `Maximum of ${MAX_LINKED_DEVICES} devices reached. Disconnect at least one device in order to link a new one.`,
          400,
        );
      }

      const pairingId = String(args.pairingId || "").trim();
      const linkSecret = String(args.linkSecret || "").trim();
      if (!pairingId || !linkSecret) {
        throw new TursoAppError("Invalid QR code. Point your camera at the QR code on jatext.vercel.app/chats.");
      }
      const res = await db.execute({
        sql: `SELECT * FROM device_link_sessions WHERE pairing_id = ? LIMIT 1`,
        args: [pairingId],
      });
      if (!res.rows.length) {
        throw new TursoAppError("This QR code has expired. Refresh or wait for a new QR code on your computer.");
      }
      const row = res.rows[0];
      if (!safeEqualStrings(sha256Base64Url(linkSecret), String(row.secret_hash || ""))) {
        throw new TursoAppError("Invalid QR code secret. Please scan the latest QR code on screen.");
      }
      if (Number(row.expires_at || 0) < now || String(row.status) !== "pending") {
        throw new TursoAppError("This QR code was already used or expired. Scan the new QR code on screen.");
      }

      await db.execute({
        sql: `UPDATE device_link_sessions
              SET status = 'syncing', user_id = ?, updated_at = ?, expires_at = ?
              WHERE pairing_id = ?`,
        args: [meId, now, now + 2 * 60_000, pairingId],
      });

      return {
        pairingId,
        browserName: String(row.browser_name || "Chrome"),
        osName: String(row.os_name || ""),
        webDhPubB64: String(row.web_dh_pub_b64 || ""),
      };
    }

    case "approveDeviceLinkSession": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const existingDevices = await listLinkedDevicesForUser(db, meId);
      if (existingDevices.length >= MAX_LINKED_DEVICES) {
        throw new TursoAppError(
          `Maximum of ${MAX_LINKED_DEVICES} devices reached. Disconnect at least one device in order to link a new one.`,
          400,
        );
      }

      const pairingId = String(args.pairingId || "").trim();
      const linkSecret = String(args.linkSecret || "").trim();
      const sealedBundleJson = String(args.sealedBundleJson || "").trim();
      if (!pairingId || !linkSecret || !sealedBundleJson) {
        throw new TursoAppError("Missing encrypted sync payload.");
      }

      const res = await db.execute({
        sql: `SELECT * FROM device_link_sessions WHERE pairing_id = ? LIMIT 1`,
        args: [pairingId],
      });
      if (!res.rows.length) {
        throw new TursoAppError("Link session expired.");
      }
      const row = res.rows[0];
      if (
        String(row.user_id || "") !== meId ||
        !safeEqualStrings(sha256Base64Url(linkSecret), String(row.secret_hash || ""))
      ) {
        throw new TursoAppError("Link session verification failed.");
      }

      const browserName = String(row.browser_name || "Chrome").trim() || "Chrome";
      const osName = String(row.os_name || "").trim();
      const deviceId = newId();
      const deviceLabel = `${browserName} JaText`;

      await db.execute({
        sql: `INSERT INTO linked_devices (id, user_id, browser_name, os_name, device_label, created_at, last_active_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [deviceId, meId, browserName, osName, deviceLabel, now, now],
      });

      const linkedJwt = createAuthToken(meId, String(meRow.email || ""), {
        linkedDeviceId: deviceId,
        client: "web_linked",
      });

      await db.execute({
        sql: `UPDATE device_link_sessions
              SET status = 'approved', linked_device_id = ?, linked_jwt = ?, sealed_bundle_json = ?, updated_at = ?, expires_at = ?
              WHERE pairing_id = ?`,
        args: [deviceId, linkedJwt, sealedBundleJson, now, now + 2 * 60_000, pairingId],
      });

      return {
        linkedDeviceId: deviceId,
        browserName,
        osName,
      };
    }

    case "getDeviceLinkStatus": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const pairingId = String(args.pairingId || "").trim();
      if (!pairingId) return { status: "expired" };
      const res = await db.execute({
        sql: `SELECT status, browser_name, os_name, linked_device_id FROM device_link_sessions WHERE pairing_id = ? AND user_id = ? LIMIT 1`,
        args: [pairingId, meId],
      });
      if (!res.rows.length) return { status: "expired" };
      const row = res.rows[0];
      return {
        status: String(row.status || "syncing"),
        browserName: String(row.browser_name || "Chrome"),
        osName: String(row.os_name || ""),
        linkedDeviceId: row.linked_device_id ? String(row.linked_device_id) : null,
      };
    }

    case "scheduleMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const targetKind = String(args.targetKind || "dm");
      const targetId = String(args.targetId || "").trim();
      const body = String(args.body || "");
      const replyToId = args.replyToId ? String(args.replyToId) : null;
      const scheduledAt = Math.floor(Number(args.scheduledAt || 0));

      if (!["dm", "group", "community"].includes(targetKind)) {
        throw new TursoAppError("Invalid scheduled message target.");
      }
      if (!targetId) {
        throw new TursoAppError("Target conversation is required.");
      }
      if (!body.trim()) {
        throw new TursoAppError("Please enter a message to schedule.");
      }
      if (!Number.isFinite(scheduledAt) || scheduledAt < now + 3_000) {
        throw new TursoAppError("Choose a future time at least a few seconds from now.");
      }
      if (scheduledAt > now + 366 * 24 * 60 * 60 * 1000) {
        throw new TursoAppError("Scheduled time must be within 1 year.");
      }

      if (targetKind === "dm") {
        const [blocked, friendsOk] = await Promise.all([
          isBlockedEitherWay(db, meId, targetId),
          areFriendsInDb(db, meId, targetId),
        ]);
        if (blocked) throw new TursoAppError("Cannot schedule messages to this user.");
        if (!friendsOk) throw new TursoAppError("You can only schedule messages to accepted friends.");
      } else if (targetKind === "group") {
        const memRes = await db.execute({
          sql: `SELECT muted FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`,
          args: [targetId, meId],
        });
        if (!memRes.rows.length) throw new TursoAppError("You are not a member of this group.");
        if (Number(memRes.rows[0].muted || 0)) {
          throw new TursoAppError("You are muted in this group.");
        }
      } else if (targetKind === "community") {
        const role = await getCommunityRole(db, meRow);
        if (!role.canModerate) {
          throw new TursoAppError("Only JaText Official moderators can schedule announcements.", 403);
        }
      }

      const countRes = await db.execute({
        sql: `SELECT COUNT(*) AS cnt FROM scheduled_messages WHERE sender_id = ? AND dispatched_at IS NULL`,
        args: [meId],
      });
      if (Number(countRes.rows[0]?.cnt || 0) >= 50) {
        throw new TursoAppError("You can have up to 50 pending scheduled messages at once.");
      }

      const schedId = newId();
      await db.execute({
        sql: `INSERT INTO scheduled_messages (
                id, sender_id, target_kind, target_id, body, reply_to_id, scheduled_at, created_at, dispatched_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        args: [schedId, meId, targetKind, targetId, body, replyToId, scheduledAt, now],
      });

      return {
        scheduled: {
          id: schedId,
          senderId: meId,
          targetKind,
          targetId,
          body,
          ...(replyToId ? { replyToId } : {}),
          scheduledAt,
          createdAt: now,
        },
      };
    }

    case "listScheduledMessages": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      await flushDueScheduledMessages(db, true);

      const targetKind = args.targetKind ? String(args.targetKind) : "";
      const targetId = args.targetId ? String(args.targetId) : "";
      const res =
        targetKind && targetId
          ? await db.execute({
              sql: `SELECT * FROM scheduled_messages
                    WHERE sender_id = ? AND dispatched_at IS NULL AND target_kind = ? AND target_id = ?
                    ORDER BY scheduled_at ASC
                    LIMIT 100`,
              args: [meId, targetKind, targetId],
            })
          : await db.execute({
              sql: `SELECT * FROM scheduled_messages
                    WHERE sender_id = ? AND dispatched_at IS NULL
                    ORDER BY scheduled_at ASC
                    LIMIT 100`,
              args: [meId],
            });

      return {
        scheduled: res.rows.map(mapScheduledMessageRow),
      };
    }

    case "deleteScheduledMessage": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const scheduledId = String(args.scheduledId || "").trim();
      if (!scheduledId) throw new TursoAppError("Scheduled message ID is required.");
      const res = await db.execute({
        sql: `DELETE FROM scheduled_messages WHERE id = ? AND sender_id = ? AND dispatched_at IS NULL`,
        args: [scheduledId, meId],
      });
      return { ok: true, removed: Number(res.rowsAffected || 0) > 0 };
    }

    case "flushScheduledMessages": {
      await requireMeRow(db, auth);
      const sentCount = await flushDueScheduledMessages(db, true);
      return { ok: true, sentCount };
    }

    /* ---------- View Once Permanent Burn ---------- */
    case "markViewOnceOpened": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const messageId = String(args.messageId || "").trim();
      if (!messageId) throw new TursoAppError("messageId is required.");
      await db.execute({
        sql: `INSERT OR IGNORE INTO view_once_opens (message_id, user_id, opened_at) VALUES (?, ?, ?)`,
        args: [messageId, meId, now],
      });
      return { ok: true, messageId };
    }

    case "getMyViewOnceOpenedIds": {
      const meRow = await requireMeRow(db, auth);
      const openedIds = await listOpenedViewOnceIdsForUser(db, String(meRow.id));
      return { openedIds };
    }

    /* ---------- Custom Soundboards (<=10MB, <=10s) ---------- */
    case "listMySoundboards": {
      const meRow = await requireMeRow(db, auth);
      const soundboards = await listSoundboardsForUser(db, String(meRow.id));
      return { soundboards };
    }

    case "createSoundboardClip": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const name = String(args.name || "").trim().slice(0, 40);
      const audioUrl = String(args.audioUrl || "").trim();
      const durationMs = Math.round(Number(args.durationMs || 0));
      const byteSize = Math.round(Number(args.byteSize || 0));
      if (!name) throw new TursoAppError("Enter a name for your soundboard clip.");
      if (!audioUrl) throw new TursoAppError("Upload an audio file first.");
      if (byteSize > 10 * 1024 * 1024) {
        throw new TursoAppError("Soundboard audio must be 10 MB or smaller.");
      }
      if (durationMs <= 0 || durationMs > 10_500) {
        throw new TursoAppError("Soundboard audio must be 10 seconds or shorter.");
      }
      const cntRes = await db.execute({
        sql: `SELECT COUNT(*) AS cnt FROM user_soundboards WHERE user_id = ?`,
        args: [meId],
      });
      if (Number(cntRes.rows[0]?.cnt || 0) >= 40) {
        throw new TursoAppError("You can store up to 40 custom soundboard clips.");
      }
      const id = newId();
      await db.execute({
        sql: `INSERT INTO user_soundboards (id, user_id, name, audio_url, duration_ms, byte_size, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [id, meId, name, audioUrl, durationMs, byteSize, now],
      });
      return {
        clip: {
          id,
          name,
          audioUrl,
          durationMs,
          byteSize,
          createdAt: now,
        },
      };
    }

    case "deleteSoundboardClip": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const clipId = String(args.clipId || "").trim();
      if (!clipId) throw new TursoAppError("clipId is required.");
      await db.execute({
        sql: `DELETE FROM user_soundboards WHERE id = ? AND user_id = ?`,
        args: [clipId, meId],
      });
      return { ok: true };
    }

    /* ---------- Blocked Users Hydrated Directory ---------- */
    case "getBlockedUsers": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const res = await db.execute({
        sql: `SELECT blocked_id, created_at FROM user_blocks WHERE blocker_id = ? ORDER BY created_at DESC`,
        args: [meId],
      });
      const ids = res.rows.map((r) => String(r.blocked_id));
      if (!ids.length) return { users: [] };
      const umap = await getUsersMap(db, ids);
      const users = res.rows
        .map((r) => {
          const u = mapUserRow(umap.get(String(r.blocked_id)));
          if (!u) return null;
          return { ...u, blockedAt: Number(r.created_at || 0) };
        })
        .filter(Boolean);
      return { users };
    }

    /* ---------- Synced Chat Pins, Custom Order & Folders ---------- */
    case "getChatOrganization": {
      const meRow = await requireMeRow(db, auth);
      return {
        chatOrganization: normalizeChatOrg(safeJsonParse(meRow.chat_org_json, {})),
      };
    }

    case "saveChatOrganization": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const normalized = normalizeChatOrg(args.chatOrganization || args);
      await db.execute({
        sql: `UPDATE users SET chat_org_json = ?, updated_at = ? WHERE id = ?`,
        args: [JSON.stringify(normalized), now, meId],
      });
      return { ok: true, chatOrganization: normalized };
    }

    /* ---------- Two-Factor Authentication (RFC 6238 TOTP) & Passkeys ---------- */
    case "getSecuritySettings": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const pkRes = await db.execute({
        sql: `SELECT credential_id, label, created_at, last_used_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC`,
        args: [meId],
      });
      const backups = safeJsonParse(meRow.totp_backup_codes_json, []);
      return {
        totpEnabled: Boolean(Number(meRow.totp_enabled || 0)),
        backupCodesRemaining: Array.isArray(backups) ? backups.length : 0,
        passkeys: pkRes.rows.map((r) => ({
          credentialId: String(r.credential_id),
          label: String(r.label || "Passkey"),
          createdAt: Number(r.created_at || 0),
          ...(r.last_used_at != null ? { lastUsedAt: Number(r.last_used_at) } : {}),
        })),
      };
    }

    case "beginTotpSetup": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const secret = generateTotpSecretBase32();
      await db.execute({
        sql: `UPDATE users SET totp_pending_secret = ?, updated_at = ? WHERE id = ?`,
        args: [secret, now, meId],
      });
      const label = encodeURIComponent(
        `JaText:${String(meRow.email || meRow.username || meId)}`,
      );
      const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=JaText&algorithm=SHA1&digits=6&period=30`;
      return { secret, otpauthUrl };
    }

    case "confirmTotpSetup": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const pending = String(meRow.totp_pending_secret || "");
      const code = String(args.code || "").trim();
      if (!pending) {
        throw new TursoAppError("Start 2FA setup first.");
      }
      if (!verifyTotpCode(pending, code, 2)) {
        throw new TursoAppError("Invalid 6-digit authentication code. Check your authenticator app and try again.");
      }
      const backupCodes = generateBackupCodes();
      await db.execute({
        sql: `UPDATE users
              SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = 1,
                  totp_backup_codes_json = ?, updated_at = ?
              WHERE id = ?`,
        args: [pending, JSON.stringify(backupCodes), now, meId],
      });
      return { ok: true, totpEnabled: true, backupCodes };
    }

    case "disableTotp": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const code = String(args.code || "").trim();
      const secret = String(meRow.totp_secret || "");
      const backups = safeJsonParse(meRow.totp_backup_codes_json, []);
      const okTotp = secret && verifyTotpCode(secret, code, 2);
      const okBackup =
        Array.isArray(backups) && backups.includes(code.toUpperCase().replace(/\s+/g, ""));
      if (Number(meRow.totp_enabled || 0) === 1 && secret && !okTotp && !okBackup) {
        throw new TursoAppError("Enter a valid authentication code or backup code to disable 2FA.");
      }
      await db.execute({
        sql: `UPDATE users
              SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = 0,
                  totp_backup_codes_json = NULL, updated_at = ?
              WHERE id = ?`,
        args: [now, meId],
      });
      return { ok: true, totpEnabled: false };
    }

    case "beginPasskeyRegistration": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const rpId = String(args.rpId || "jatext.vercel.app").trim().toLowerCase();
      const challengeId = newId();
      const challengeB64 = base64UrlEncode(crypto.randomBytes(32));
      await db
        .execute({ sql: `DELETE FROM webauthn_challenges WHERE expires_at < ?`, args: [now] })
        .catch(() => undefined);
      await db.execute({
        sql: `INSERT INTO webauthn_challenges (challenge_id, challenge_b64, user_id, kind, rp_id, expires_at, created_at)
              VALUES (?, ?, ?, 'register', ?, ?, ?)`,
        args: [challengeId, challengeB64, meId, rpId, now + 5 * 60_000, now],
      });
      const existingRes = await db.execute({
        sql: `SELECT credential_id FROM user_passkeys WHERE user_id = ?`,
        args: [meId],
      });
      return {
        challengeId,
        options: {
          rp: { name: "JaText", id: rpId },
          user: {
            id: base64UrlEncode(Buffer.from(meId, "utf8")),
            name: String(meRow.email || meRow.username || meId),
            displayName: String(meRow.display_name || meRow.username || "JaText User"),
          },
          challenge: challengeB64,
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          timeout: 60000,
          attestation: "none",
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "preferred",
          },
          excludeCredentials: existingRes.rows.map((r) => ({
            type: "public-key",
            id: String(r.credential_id),
          })),
        },
      };
    }

    case "finishPasskeyRegistration": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const challengeId = String(args.challengeId || "").trim();
      const credentialId = String(args.credentialId || "").trim();
      const clientDataJSONB64 = String(args.clientDataJSON || "").trim();
      const attestationObjectB64 = String(args.attestationObject || "").trim();
      const authenticatorDataB64 = String(args.authenticatorData || "").trim();
      const providedSpkiB64 = String(args.publicKeySpki || "").trim();
      const providedAlg = Number(args.publicKeyAlgorithm || -7);
      const label = String(args.label || "Passkey").trim().slice(0, 48) || "Passkey";
      const transports = Array.isArray(args.transports) ? args.transports.map(String) : [];

      if (!challengeId || !credentialId || !clientDataJSONB64) {
        throw new TursoAppError("Incomplete passkey registration response.");
      }

      const chRes = await db.execute({
        sql: `SELECT * FROM webauthn_challenges WHERE challenge_id = ? AND user_id = ? AND kind = 'register' LIMIT 1`,
        args: [challengeId, meId],
      });
      await db
        .execute({ sql: `DELETE FROM webauthn_challenges WHERE challenge_id = ?`, args: [challengeId] })
        .catch(() => undefined);

      if (!chRes.rows.length || Number(chRes.rows[0].expires_at) < now) {
        throw new TursoAppError("Passkey challenge expired. Please try again.");
      }
      const chRow = chRes.rows[0];
      const rpId = String(chRow.rp_id);

      const clientData = safeJsonParse(base64UrlDecode(clientDataJSONB64).toString("utf8"), null);
      if (
        !clientData ||
        clientData.type !== "webauthn.create" ||
        String(clientData.challenge || "") !== String(chRow.challenge_b64)
      ) {
        throw new TursoAppError("Passkey challenge verification failed.");
      }
      if (!isAllowedWebAuthnOrigin(clientData.origin, rpId)) {
        throw new TursoAppError("Passkey origin verification failed.");
      }

      let spkiB64 = providedSpkiB64;
      let alg = providedAlg;
      let authDataBuf = authenticatorDataB64 ? base64UrlDecode(authenticatorDataB64) : null;
      if (!spkiB64 || !authDataBuf) {
        const extracted = extractSpkiFromAttestationOrAuthData(
          attestationObjectB64,
          authenticatorDataB64,
        );
        if (!spkiB64) spkiB64 = extracted.spkiB64;
        if (!alg) alg = extracted.alg;
        if (!authDataBuf) authDataBuf = extracted.authData;
      }

      const expectedRpHash = crypto.createHash("sha256").update(rpId, "utf8").digest();
      if (
        !authDataBuf ||
        authDataBuf.length < 37 ||
        !crypto.timingSafeEqual(authDataBuf.subarray(0, 32), expectedRpHash)
      ) {
        throw new TursoAppError("Passkey RP ID verification failed.");
      }
      if ((authDataBuf[32] & 0x01) === 0) {
        throw new TursoAppError("User presence flag was not asserted by passkey.");
      }

      // Validate that Node crypto can import the SPKI public key cleanly
      crypto.createPublicKey({
        key: base64UrlDecode(spkiB64),
        format: "der",
        type: "spki",
      });

      const signCount = authDataBuf.readUInt32BE(33);
      await db.execute({
        sql: `INSERT INTO user_passkeys (
                credential_id, user_id, public_key_spki_b64, algorithm, sign_count, label, transports_json, created_at, last_used_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(credential_id) DO UPDATE SET
                public_key_spki_b64 = excluded.public_key_spki_b64,
                algorithm = excluded.algorithm,
                label = excluded.label,
                last_used_at = excluded.last_used_at`,
        args: [
          credentialId,
          meId,
          spkiB64,
          alg || -7,
          signCount,
          label,
          JSON.stringify(transports),
          now,
          now,
        ],
      });

      return {
        ok: true,
        passkey: {
          credentialId,
          label,
          createdAt: now,
          lastUsedAt: now,
        },
      };
    }

    case "deletePasskey": {
      const meRow = await requireMeRow(db, auth);
      const meId = String(meRow.id);
      const credentialId = String(args.credentialId || "").trim();
      if (!credentialId) throw new TursoAppError("credentialId is required.");
      await db.execute({
        sql: `DELETE FROM user_passkeys WHERE credential_id = ? AND user_id = ?`,
        args: [credentialId, meId],
      });
      return { ok: true };
    }

    case "beginPasskeyLogin": {
      const rpId = String(args.rpId || "jatext.vercel.app").trim().toLowerCase();
      const emailHint = String(args.email || "").trim().toLowerCase();
      const challengeId = newId();
      const challengeB64 = base64UrlEncode(crypto.randomBytes(32));
      await db
        .execute({ sql: `DELETE FROM webauthn_challenges WHERE expires_at < ?`, args: [now] })
        .catch(() => undefined);

      let allowCredentials = [];
      let hintUserId = null;
      if (emailHint) {
        const uRes = await db.execute({
          sql: `SELECT id FROM users WHERE email = ? LIMIT 1`,
          args: [emailHint],
        });
        if (uRes.rows.length) {
          hintUserId = String(uRes.rows[0].id);
          const pkRes = await db.execute({
            sql: `SELECT credential_id, transports_json FROM user_passkeys WHERE user_id = ?`,
            args: [hintUserId],
          });
          allowCredentials = pkRes.rows.map((r) => ({
            type: "public-key",
            id: String(r.credential_id),
            transports: safeJsonParse(r.transports_json, []),
          }));
        }
      }

      await db.execute({
        sql: `INSERT INTO webauthn_challenges (challenge_id, challenge_b64, user_id, kind, rp_id, expires_at, created_at)
              VALUES (?, ?, ?, 'login', ?, ?, ?)`,
        args: [challengeId, challengeB64, hintUserId, rpId, now + 5 * 60_000, now],
      });

      return {
        challengeId,
        options: {
          challenge: challengeB64,
          rpId,
          timeout: 60000,
          userVerification: "preferred",
          ...(allowCredentials.length ? { allowCredentials } : {}),
        },
      };
    }

    case "finishPasskeyLogin": {
      const challengeId = String(args.challengeId || "").trim();
      const credentialId = String(args.credentialId || "").trim();
      const clientDataJSONB64 = String(args.clientDataJSON || "").trim();
      const authenticatorDataB64 = String(args.authenticatorData || "").trim();
      const signatureB64 = String(args.signature || "").trim();

      if (
        !challengeId ||
        !credentialId ||
        !clientDataJSONB64 ||
        !authenticatorDataB64 ||
        !signatureB64
      ) {
        throw new TursoAppError("Incomplete passkey sign-in assertion.");
      }

      const chRes = await db.execute({
        sql: `SELECT * FROM webauthn_challenges WHERE challenge_id = ? AND kind = 'login' LIMIT 1`,
        args: [challengeId],
      });
      await db
        .execute({ sql: `DELETE FROM webauthn_challenges WHERE challenge_id = ?`, args: [challengeId] })
        .catch(() => undefined);

      if (!chRes.rows.length || Number(chRes.rows[0].expires_at) < now) {
        throw new TursoAppError("Passkey sign-in challenge expired. Please try again.");
      }
      const chRow = chRes.rows[0];
      const rpId = String(chRow.rp_id);

      const pkRes = await db.execute({
        sql: `SELECT * FROM user_passkeys WHERE credential_id = ? LIMIT 1`,
        args: [credentialId],
      });
      if (!pkRes.rows.length) {
        throw new TursoAppError("Passkey is not registered on JaText.");
      }
      const pkRow = pkRes.rows[0];
      const userId = String(pkRow.user_id);

      const clientDataBuf = base64UrlDecode(clientDataJSONB64);
      const clientData = safeJsonParse(clientDataBuf.toString("utf8"), null);
      if (
        !clientData ||
        clientData.type !== "webauthn.get" ||
        String(clientData.challenge || "") !== String(chRow.challenge_b64)
      ) {
        throw new TursoAppError("Passkey assertion challenge mismatch.");
      }
      if (!isAllowedWebAuthnOrigin(clientData.origin, rpId)) {
        throw new TursoAppError("Passkey origin mismatch.");
      }

      const authDataBuf = base64UrlDecode(authenticatorDataB64);
      const expectedRpHash = crypto.createHash("sha256").update(rpId, "utf8").digest();
      if (
        authDataBuf.length < 37 ||
        !crypto.timingSafeEqual(authDataBuf.subarray(0, 32), expectedRpHash)
      ) {
        throw new TursoAppError("Passkey RP ID mismatch.");
      }
      if ((authDataBuf[32] & 0x01) === 0) {
        throw new TursoAppError("Passkey user presence check failed.");
      }

      const clientDataHash = crypto.createHash("sha256").update(clientDataBuf).digest();
      const signedPayload = Buffer.concat([authDataBuf, clientDataHash]);
      const signatureBuf = base64UrlDecode(signatureB64);
      const pubKeyObj = crypto.createPublicKey({
        key: base64UrlDecode(String(pkRow.public_key_spki_b64)),
        format: "der",
        type: "spki",
      });

      let verifiedSig = crypto.verify("sha256", signedPayload, pubKeyObj, signatureBuf);
      if (!verifiedSig && signatureBuf.length === 64 && signatureBuf[0] !== 0x30) {
        verifiedSig = crypto.verify(
          "sha256",
          signedPayload,
          { key: pubKeyObj, dsaEncoding: "ieee-p1363" },
          signatureBuf,
        );
      }
      if (!verifiedSig) {
        throw new TursoAppError("Invalid passkey cryptographic signature.", 401);
      }

      const newSignCount = authDataBuf.readUInt32BE(33);
      await db.execute({
        sql: `UPDATE user_passkeys SET sign_count = ?, last_used_at = ? WHERE credential_id = ?`,
        args: [Math.max(Number(pkRow.sign_count || 0), newSignCount), now, credentialId],
      });

      const userRes = await db.execute({
        sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
        args: [userId],
      });
      if (!userRes.rows.length) {
        throw new TursoAppError("Account no longer exists.", 404);
      }
      const userRow = userRes.rows[0];
      return {
        requiresTwoFactor: false,
        token: createAuthToken(userId, String(userRow.email || "")),
        me: mapUserRow(userRow, true),
      };
    }

    default:
      throw new TursoAppError(`Unknown operation: ${op}`);
  }
}

let lastScheduledSweepAt = 0;

function mapScheduledMessageRow(r) {
  return {
    id: String(r.id),
    senderId: String(r.sender_id),
    targetKind: String(r.target_kind),
    targetId: String(r.target_id),
    body: String(r.body || ""),
    ...(r.reply_to_id ? { replyToId: String(r.reply_to_id) } : {}),
    scheduledAt: Number(r.scheduled_at),
    createdAt: Number(r.created_at),
  };
}

async function flushDueScheduledMessages(db, force = false) {
  const now = Date.now();
  if (!force && now - lastScheduledSweepAt < 2000) return 0;
  lastScheduledSweepAt = now;

  const dueRes = await db.execute({
    sql: `SELECT * FROM scheduled_messages WHERE dispatched_at IS NULL AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 25`,
    args: [now],
  });
  if (!dueRes.rows.length) return 0;

  let dispatchedCount = 0;
  for (const r of dueRes.rows) {
    const schedId = String(r.id);
    const writeAt = Date.now();
    const claimRes = await db.execute({
      sql: `UPDATE scheduled_messages SET dispatched_at = ? WHERE id = ? AND dispatched_at IS NULL`,
      args: [writeAt, schedId],
    });
    if (!Number(claimRes.rowsAffected || 0)) continue;

    const senderId = String(r.sender_id);
    const targetKind = String(r.target_kind);
    const targetId = String(r.target_id);
    const body = String(r.body || "");
    const replyToId = r.reply_to_id ? String(r.reply_to_id) : null;

    const senderUserRes = await db.execute({
      sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
      args: [senderId],
    });
    const senderRow = senderUserRes.rows[0];
    if (!senderRow) continue;
    const senderName = String(senderRow.display_name || senderRow.username || "JaText");

    if (targetKind === "dm") {
      const [blocked, friendsOk, recvPresRes, recvUserRes, recvSettingsRes] = await Promise.all([
        isBlockedEitherWay(db, senderId, targetId),
        areFriendsInDb(db, senderId, targetId),
        db.execute({ sql: `SELECT * FROM presence WHERE user_id = ? LIMIT 1`, args: [targetId] }),
        db.execute({ sql: `SELECT * FROM users WHERE id = ? LIMIT 1`, args: [targetId] }),
        db.execute({
          sql: `SELECT * FROM conversation_settings WHERE user_id = ? AND friend_id = ? LIMIT 1`,
          args: [targetId, senderId],
        }),
      ]);
      if (blocked || !friendsOk) continue;

      const recvOnline =
        recvPresRes.rows[0] && writeAt - Number(recvPresRes.rows[0].last_seen_at || 0) < 90_000;
      const deliveryStatus = recvOnline ? "delivered" : "sent";
      const msgId = newId();
      await db.execute({
        sql: `INSERT INTO messages (
                id, sender_id, receiver_id, pair_key, body, attachment_url, attachment_name,
                attachment_type, sticker_key, delivery_status, reply_to_id, forwarded_from_id,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, ?, ?)`,
        args: [
          msgId,
          senderId,
          targetId,
          pairKey(senderId, targetId),
          body,
          deliveryStatus,
          replyToId,
          writeAt,
          writeAt,
        ],
      });
      dispatchedCount += 1;

      const recvUser = recvUserRes.rows[0];
      const recvSettings = recvSettingsRes.rows[0];
      const shouldPush =
        recvUser &&
        String(recvUser.status_preference || "online") !== "dnd" &&
        !Number(recvSettings?.is_muted || 0) &&
        !Number(recvSettings?.is_archived || 0);

      await Promise.all([
        shouldPush
          ? dispatchPushToUsers(db, [targetId], { senderId, senderName, body })
          : dispatchPushToUsers(db, [targetId], { type: "sync_poke", senderId }),
        dispatchPushToUsers(db, [senderId], { type: "sync_poke", senderId }),
      ]);
    } else if (targetKind === "group") {
      const [grpRes, memRes] = await Promise.all([
        db.execute({ sql: `SELECT * FROM groups WHERE id = ? LIMIT 1`, args: [targetId] }),
        db.execute({ sql: `SELECT * FROM group_members WHERE group_id = ?`, args: [targetId] }),
      ]);
      if (!grpRes.rows.length) continue;
      const myMem = memRes.rows.find((m) => String(m.user_id) === senderId);
      if (!myMem || Number(myMem.muted || 0)) continue;

      const msgId = newId();
      await db.batch([
        {
          sql: `INSERT INTO group_messages (
                  id, group_id, sender_id, body, reply_to_id, forwarded_from_name,
                  forwarded_from_id, sticker_url, sticker_name, sticker_key,
                  attachment_url, attachment_name, attachment_type,
                  mentions_everyone, mentioned_user_ids_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, '[]', ?, ?)`,
          args: [msgId, targetId, senderId, body, replyToId, writeAt, writeAt],
        },
        {
          sql: `UPDATE groups SET updated_at = ? WHERE id = ?`,
          args: [writeAt, targetId],
        },
      ]);
      dispatchedCount += 1;

      const memberIds = memRes.rows.map((m) => String(m.user_id));
      await dispatchPushToUsers(db, memberIds, {
        type: "sync_poke",
        senderId,
        groupId: targetId,
      });
    } else if (targetKind === "community") {
      const role = await getCommunityRole(db, senderRow);
      if (!role.canModerate) continue;
      const msgId = newId();
      await db.execute({
        sql: `INSERT INTO community_messages (
                id, sender_id, body, type, poll_options_json, sticker_url, sticker_name,
                sticker_key, attachment_url, attachment_name, attachment_type, reply_to_id,
                forwarded_from_name, forwarded_from_id, created_at, updated_at
              ) VALUES (?, ?, ?, 'text', '[]', NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, ?)`,
        args: [msgId, senderId, body, replyToId, writeAt, writeAt],
      });
      dispatchedCount += 1;
    }
  }
  return dispatchedCount;
}
