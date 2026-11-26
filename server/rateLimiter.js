/**
 * JaText Anti-DDoS Sliding-Window Token Bucket Rate Limiter
 *
 * Designed to block volumetric HTTP floods, credential stuffing, and QR/SSRF abuse
 * BEFORE hitting Turso SQLite or external upstreams, while staying generous enough
 * that real users (fast chatting, 64 MB chunked video uploads, WebRTC ICE signaling,
 * and up to 5 linked desktop tabs) never hit false-positive throttling.
 */

const buckets = new Map();
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 45_000;
const MAX_TRACKED_KEYS = 25_000;

export function extractClientIp(req) {
  if (!req || !req.headers) return "local";
  const realIp = req.headers["x-real-ip"] || req.headers["cf-connecting-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim().slice(0, 64);
  }
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim().slice(0, 64);
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0] || "").split(",")[0].trim().slice(0, 64) || "unknown";
  }
  return String(req.socket?.remoteAddress || "unknown").slice(0, 64);
}

function sweepExpired(now) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS && buckets.size < MAX_TRACKED_KEYS) {
    return;
  }
  lastSweepAt = now;
  for (const [key, entry] of buckets) {
    if (now - entry.updatedAt > entry.windowMs * 2) {
      buckets.delete(key);
    }
  }
  if (buckets.size > MAX_TRACKED_KEYS) {
    const overflow = buckets.size - MAX_TRACKED_KEYS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
}

/**
 * Consumes 1 token from a sliding-refill token bucket.
 * Returns `{ allowed, remaining, retryAfterSec, limit }`.
 */
export function consumeRateLimit(bucketKey, maxPerWindow, windowMs = 60_000) {
  const now = Date.now();
  sweepExpired(now);

  const refillPerMs = maxPerWindow / windowMs;
  let entry = buckets.get(bucketKey);
  if (!entry) {
    entry = {
      tokens: maxPerWindow - 1,
      updatedAt: now,
      windowMs,
    };
    buckets.set(bucketKey, entry);
    return {
      allowed: true,
      remaining: Math.floor(entry.tokens),
      retryAfterSec: 0,
      limit: maxPerWindow,
    };
  }

  const elapsed = Math.max(0, now - entry.updatedAt);
  entry.tokens = Math.min(maxPerWindow, entry.tokens + elapsed * refillPerMs);
  entry.updatedAt = now;
  entry.windowMs = windowMs;

  if (entry.tokens < 1) {
    const deficit = 1 - entry.tokens;
    const retryAfterSec = Math.max(1, Math.ceil(deficit / refillPerMs / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
      limit: maxPerWindow,
    };
  }

  entry.tokens -= 1;
  return {
    allowed: true,
    remaining: Math.floor(entry.tokens),
    retryAfterSec: 0,
    limit: maxPerWindow,
  };
}

/**
 * Maps Turso RPC `op` names to balanced anti-DDoS rate limit tiers (per 60s window).
 */
export function resolveRpcRateTier(op) {
  switch (op) {
    case "signInPassword":
    case "signUpPassword":
    case "signInEmail":
    case "signUpEmail":
    case "verifyTwoFactorLogin":
    case "verifyEmailCode":
    case "sendEmailVerification":
    case "getEmailVerification":
    case "beginPasskeyLogin":
    case "finishPasskeyLogin":
      return { tier: "auth", limit: 25, windowMs: 60_000 };

    case "beginTotpSetup":
    case "confirmTotpSetup":
    case "disableTotp":
    case "beginPasskeyRegistration":
    case "finishPasskeyRegistration":
    case "deletePasskey":
      return { tier: "security_mutate", limit: 30, windowMs: 60_000 };

    case "createDeviceLinkSession":
    case "claimDeviceLinkSession":
    case "approveDeviceLinkSession":
    case "cancelDeviceLinkSession":
      return { tier: "qr_mutate", limit: 24, windowMs: 60_000 };

    case "pollDeviceLinkSession":
      return { tier: "qr_poll", limit: 120, windowMs: 60_000 };

    case "searchKlipy":
    case "searchUsers":
    case "sendFriendRequest":
      return { tier: "discovery", limit: 90, windowMs: 60_000 };

    case "sendMessage":
    case "sendGroupMessage":
    case "sendCommunityMessage":
    case "sendCommunityPost":
    case "sendCommunityReply":
    case "mutateMessage":
    case "mutateGroupMessage":
    case "mutateCommunityMessage":
    case "manageGroup":
    case "createGroup":
    case "deleteMessageForMe":
    case "restoreMessageForMe":
    case "unsendMessage":
    case "editMessage":
    case "scheduleMessage":
    case "deleteScheduledMessage":
      return { tier: "messaging", limit: 360, windowMs: 60_000 };

    default:
      // syncDelta, bootstrap, listMessages, listGroupMessages, setTyping, heartbeat, etc.
      return { tier: "sync_read", limit: 1200, windowMs: 60_000 };
  }
}

/**
 * Enforces both a global per-IP volumetric cap and a route/tier-specific limit.
 * Automatically writes standard RateLimit + Retry-After headers when `res` is provided.
 * Returns `true` if blocked (response already sent with HTTP 429), `false` if allowed.
 */
export function enforceHttpRateLimit(req, res, { scope, limit, windowMs = 60_000, subject = "" }) {
  const ip = extractClientIp(req);

  // 1. Global per-IP volumetric flood shield across all endpoints (2400 req/min)
  const globalRes = consumeRateLimit(`global_ip:${ip}`, 2400, 60_000);
  if (!globalRes.allowed) {
    if (res) {
      res.setHeader("Retry-After", String(globalRes.retryAfterSec));
      res.setHeader("X-RateLimit-Limit", String(globalRes.limit));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.status(429).json({
        ok: false,
        error: `Too many requests. Please wait ${globalRes.retryAfterSec}s and try again.`,
      });
    }
    return true;
  }

  // 2. Scoped tier bucket (keyed by IP + optional token/subject fingerprint)
  const scopedKey = subject ? `${scope}:${ip}:${subject}` : `${scope}:${ip}`;
  const tierRes = consumeRateLimit(scopedKey, limit, windowMs);
  if (res) {
    res.setHeader("X-RateLimit-Limit", String(tierRes.limit));
    res.setHeader("X-RateLimit-Remaining", String(tierRes.remaining));
  }
  if (!tierRes.allowed) {
    if (res) {
      res.setHeader("Retry-After", String(tierRes.retryAfterSec));
      res.status(429).json({
        ok: false,
        error: `Rate limit reached. Please try again in ${tierRes.retryAfterSec}s.`,
      });
    }
    return true;
  }
  return false;
}
