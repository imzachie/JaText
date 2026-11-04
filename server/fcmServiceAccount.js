/**
 * Firebase Cloud Messaging (Android push) service-account loader.
 *
 * Push notifications stay optional: when no credential is present every caller
 * degrades to "no push" instead of failing the request.
 *
 * Three supported sources, checked in this order:
 *
 *   1. FCM_SERVICE_ACCOUNT_JSON  - the downloaded key as a single line
 *                                  (raw JSON, or the same JSON base64 encoded)
 *   2. FCM_SERVICE_ACCOUNT_FILE  - path to the downloaded key .json file
 *   3. <app dir>/fcm-service-account.json or .fcm-service-account.json
 *                                - just drop the downloaded file next to the app
 *
 * The file sources exist because pasting a private key through a shell prompt
 * or into a systemd EnvironmentFile mangles the PEM newlines, which is the
 * single most common reason push silently never sends.
 */
import fs from "node:fs";
import path from "node:path";

const AUTO_FILE_NAMES = ["fcm-service-account.json", ".fcm-service-account.json"];
const VALID_ACCOUNT_TYPES = new Set(["service_account"]);

let cache = { key: "", creds: null };

function normalizePrivateKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  // A key pasted into an .env file usually keeps the literal "\n" escapes from
  // the downloaded JSON. The PEM block needs real newlines.
  if (value.includes("\\n") && !value.includes("\n")) {
    return value.replace(/\\n/g, "\n");
  }
  return value;
}

function shapeCreds(parsed, source) {
  if (!parsed || typeof parsed !== "object") return null;
  const projectId = String(parsed.project_id || "").trim();
  const clientEmail = String(parsed.client_email || "").trim();
  const privateKey = normalizePrivateKey(parsed.private_key);
  if (!projectId || !clientEmail || !privateKey.startsWith("-----BEGIN")) return null;
  const type = String(parsed.type || "service_account").trim();
  if (!VALID_ACCOUNT_TYPES.has(type)) return null;
  return { projectId, clientEmail, privateKey, source };
}

function parseMaybeBase64(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to base64 */
  }
  try {
    return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function readFileCreds(filePath, label) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    // mtime in the key makes an edited file picked up without a restart
    return shapeCreds(parsed, `${label}:${stat.mtimeMs}`);
  } catch {
    return null;
  }
}

export function getFcmServiceAccount() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (raw && String(raw).trim()) {
    const key = `env:${String(raw).length}:${String(raw).slice(0, 64)}`;
    if (cache.key !== key) {
      cache = {
        key,
        creds: shapeCreds(parseMaybeBase64(raw), "FCM_SERVICE_ACCOUNT_JSON"),
      };
    }
    return cache.creds;
  }

  const explicit = String(process.env.FCM_SERVICE_ACCOUNT_FILE || "").trim();
  const candidates = explicit
    ? [path.resolve(explicit)]
    : AUTO_FILE_NAMES.map((name) => path.resolve(process.cwd(), name));

  for (const candidate of candidates) {
    const creds = readFileCreds(
      candidate,
      explicit ? "FCM_SERVICE_ACCOUNT_FILE" : "fcm-service-account.json",
    );
    if (creds) {
      cache = { key: creds.source, creds };
      return creds;
    }
  }

  cache = { key: "", creds: null };
  return null;
}

export function getFcmStatus() {
  const creds = getFcmServiceAccount();
  return {
    configured: Boolean(creds),
    projectId: creds?.projectId || null,
    clientEmail: creds?.clientEmail || null,
    source: creds?.source ? creds.source.split(":")[0] : null,
  };
}
