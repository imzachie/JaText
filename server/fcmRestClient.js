/**
 * Sends FCM pushes with a plain fetch instead of `firebase-admin`.
 *
 * The SDK is a Node package: it does not survive being bundled for a Deno or
 * Worker runtime, which is where the backend has to run to be hosted without a
 * machine of your own. The v1 FCM API is just an HTTPS call with an OAuth2
 * bearer token, and both halves of that are available everywhere.
 *
 * The object handed back keeps the shape `server/tursoBackend.js` already
 * expects from `getMessaging(app)`: `sendEachForMulticast({ tokens, data,
 * notification, android })` resolving to `{ responses: [{ success, error }] }`,
 * with the same `messaging/...` error codes, because stale token cleanup in the
 * database is keyed off those strings.
 */

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STALE_ERROR_CODES = {
  UNREGISTERED: "messaging/registration-token-not-registered",
  INVALID_ARGUMENT: "messaging/invalid-registration-token",
};

/** Cached per service account, an access token lasts about an hour. */
const tokenCache = new Map();

function b64url(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToDer(pem) {
  const body = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function signJwt(claims, privateKeyPem) {
  const der = pemToDer(privateKeyPem);
  const key = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["sign"],
  );
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );
  return `${header}.${payload}.${b64url(signature)}`;
}

export async function getAccessToken(creds) {
  const cacheKey = `${creds.clientEmail}|${creds.projectId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: creds.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    },
    creds.privateKey,
  );

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    )}&assertion=${encodeURIComponent(assertion)}`,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || `HTTP ${response.status}`;
    throw new Error(`FCM OAuth2 token request failed: ${detail}`);
  }
  tokenCache.set(cacheKey, {
    token: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
  });
  return json.access_token;
}

function toAndroidConfig(android) {
  if (!android) return undefined;
  const out = {};
  if (android.priority) out.priority = android.priority;
  if (android.ttl != null) {
    // The SDK takes milliseconds, the v1 API takes a protobuf duration string.
    const seconds = Math.max(0, Math.round(Number(android.ttl) / 1000));
    out.ttl = `${seconds}s`;
  }
  if (android.collapseKey) out.collapseKey = android.collapseKey;
  return Object.keys(out).length ? out : undefined;
}

function stringifyData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}

async function sendOne(creds, accessToken, message) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );
  if (response.ok) return { success: true };
  const payload = await response.json().catch(() => null);
  const status = String(payload?.error?.status || "").replace("HTTP_", "");
  const code =
    STALE_ERROR_CODES[status] ||
    (payload?.error?.message
      ? `messaging/${String(payload.error.message).toLowerCase().replace(/\s+/g, "-")}`
      : `messaging/internal-error`);
  return { success: false, error: { code, message: payload?.error?.message || status } };
}

/**
 * @param {{projectId: string, clientEmail: string, privateKey: string}} creds
 */
export function createFcmClient(creds) {
  return {
    async sendEachForMulticast({ tokens, data, notification, android, topic }) {
      const list = Array.isArray(tokens) && tokens.length ? tokens : topic ? [topic] : [];
      if (!list.length) return { successCount: 0, failureCount: 0, responses: [] };
      const accessToken = await getAccessToken(creds);
      const androidConfig = toAndroidConfig(android);
      const payloadData = stringifyData(data);
      const responses = await Promise.all(
        list.map(async (token) => {
          const message = {
            ...(topic ? { topic } : { token }),
            ...(payloadData ? { data: payloadData } : {}),
            ...(notification ? { notification } : {}),
            ...(androidConfig ? { android: androidConfig } : {}),
          };
          try {
            return await sendOne(creds, accessToken, message);
          } catch (err) {
            return {
              success: false,
              error: { code: "messaging/internal-error", message: String(err?.message || err) },
            };
          }
        }),
      );
      const successCount = responses.filter((r) => r.success).length;
      return {
        successCount,
        failureCount: responses.length - successCount,
        responses,
      };
    },
  };
}

/** Exposed for tests: the signed assertion Google has to accept. */
export const __test = { signJwt, pemToDer, toAndroidConfig, TOKEN_URL };
