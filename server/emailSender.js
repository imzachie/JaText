/**
 * Transactional email through Brevo, over its HTTP API.
 *
 * Brevo hands out two credentials: an SMTP key for `smtp-relay.brevo.com:587` and an
 * API key that starts with `xkeysib-`. Only the second one is usable here, because a
 * Supabase Edge Function cannot open a raw TCP socket, which is what SMTP needs. The
 * API is a single authenticated POST, so there is no SMTP client, no STARTTLS
 * handshake and no dependency to bundle.
 *
 * The sender address must be a sender Brevo has verified (Settings, Senders & IPs),
 * otherwise every send comes back as `sender not verified` and looks like a bug in this
 * file rather than a missing click in their dashboard.
 */

import crypto from "node:crypto";

const DEFAULT_API_BASE = "https://api.brevo.com";

function env(name) {
  return String(process.env[name] || "").trim();
}

/**
 * What a Brevo API key looks like: a fixed prefix, 64 hex characters, and a 16 character
 * suffix. Checked so that a key which was pasted short, or picked up a stray `->` from a
 * chat window, is named here instead of showing up later as Brevo answering 401 to
 * somebody's signup. Only the shape is judged - the key is never printed anywhere.
 */
const BREVO_KEY_SHAPE = /^xkeysib-[0-9a-f]{64}-[A-Za-z0-9]{16}$/;

function shortHash(value) {
  const hex = crypto.createHash("sha256").update(String(value || "")).digest("hex");
  return hex.slice(0, 12);
}

export function emailSenderConfig() {
  const apiKey = env("BREVO_API_KEY");
  const fromEmail = env("BREVO_SENDER_EMAIL") || env("BREVO_FROM_EMAIL");
  // Overridable so a Brevo-compatible endpoint, a proxy or a test double can be pointed
  // at without touching the key.
  const base = (env("BREVO_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  let warning = "";
  if (apiKey && !BREVO_KEY_SHAPE.test(apiKey)) {
    warning =
      `BREVO_API_KEY does not look like a Brevo API key (expected "xkeysib-" plus 64 hex characters ` +
      `plus a 16 character suffix, 89 in all; this one is ${apiKey.length}). A key copied short is ` +
      `the usual reason, and Brevo answers it with 401.`;
  }
  return {
    enabled: Boolean(apiKey && fromEmail && base),
    apiKey,
    fromEmail,
    base,
    fromName: env("BREVO_SENDER_NAME") || "JaText",
    warning,
    reason: !apiKey
      ? "No BREVO_API_KEY is set"
      : !fromEmail
        ? "No BREVO_SENDER_EMAIL is set, which has to be an address Brevo has verified"
        : "",
  };
}

export function isEmailSenderConfigured() {
  return emailSenderConfig().enabled;
}

/**
 * @param {{to: string, subject: string, text: string, html?: string}} message
 * @returns {Promise<{sent: true, messageId: string}>}
 * @throws if the send fails, with the provider's own words so the reason is readable
 *         from the app instead of only from Supabase's function logs
 */
export async function sendEmail({ to, subject, text, html }) {
  const cfg = emailSenderConfig();
  if (!cfg.enabled) {
    const err = new Error(`Email is not configured: ${cfg.reason}.`);
    err.code = "email_unconfigured";
    throw err;
  }
  const body = {
    sender: { name: cfg.fromName, email: cfg.fromEmail },
    to: [{ email: String(to) }],
    subject: String(subject),
    textContent: String(text),
    ...(html ? { htmlContent: String(html) } : {}),
  };
  let response;
  try {
    response = await fetch(`${cfg.base}/v3/smtp/email`, {
      method: "POST",
      headers: {
        "api-key": cfg.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      // An email provider that hangs must not hang the request that called it: the
      // signup would look like a dead button rather than an unverified account.
      signal: AbortSignal.timeout ? AbortSignal.timeout(12_000) : undefined,
    });
  } catch (err) {
    const wrapped = new Error(`Could not reach Brevo: ${err?.message || err}`);
    wrapped.code = "email_unreachable";
    throw wrapped;
  }
  const raw = await response.text().catch(() => "");
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const detail = String(parsed?.message || raw || "").slice(0, 200);
    const err = new Error(
      response.status === 401
        ? "Brevo rejected the API key."
        : `Brevo refused the email (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
    );
    err.code = "email_rejected";
    err.status = response.status;
    throw err;
  }
  return { sent: true, messageId: String(parsed?.messageId || "") };
}

/**
 * A readable answer to "is the mail half of this deployment configured", with no key
 * material in it: the length, and twelve hex of a hash so the value can be recognised
 * against a known-good one without being reproduced.
 */
export function emailSenderDiagnostics() {
  const cfg = emailSenderConfig();
  return {
    configured: cfg.enabled,
    reason: cfg.reason || "",
    warning: cfg.warning || "",
    keyLength: cfg.apiKey.length,
    keyFingerprint: cfg.apiKey ? shortHash(cfg.apiKey) : "",
    senderEmail: cfg.fromEmail,
    senderName: cfg.fromName,
    apiBase: cfg.base,
  };
}

// A public route that talks to a third party on this account's behalf has to be its own
// throttle, or it becomes a way to spend somebody's daily quota from the street.
const PROBE_COOLDOWN_MS = 5 * 60_000;
let lastProbeAt = 0;
let lastProbeResult = null;

/**
 * Ask Brevo one read-only question with the stored key - "does this credential work" -
 * and report the answer without any of the credential. Used by `GET /api/email-test`,
 * which is how a signup rejected with 401 is told apart from a sender that was never
 * verified: both come back as a failed send otherwise.
 */
export async function probeEmailSender({ force = false } = {}) {
  const cfg = emailSenderConfig();
  const now = Date.now();
  if (!force && now - lastProbeAt < PROBE_COOLDOWN_MS && lastProbeResult) {
    return { ...lastProbeResult, cached: true, retryAfterSec: Math.ceil((PROBE_COOLDOWN_MS - (now - lastProbeAt)) / 1000) };
  }
  if (!cfg.apiKey) {
    return { ok: false, skipped: true, error: "No BREVO_API_KEY is set." };
  }
  let result;
  try {
    const response = await fetch(`${cfg.base}/v3/contacts/lists?page=0&limit=1`, {
      method: "GET",
      headers: { "api-key": cfg.apiKey, accept: "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(12_000) : undefined,
    });
    const raw = await response.text().catch(() => "");
    result = {
      ok: response.ok,
      status: response.status,
      // The count on a good day, Brevo's own sentence on a bad one, and nothing else:
      // the body of this endpoint is written by a third party and is not trusted text.
      note: response.ok ? "credential accepted" : raw.slice(0, 160),
    };
  } catch (err) {
    result = { ok: false, status: 0, error: `Could not reach ${cfg.base}: ${err?.message || err}` };
  }
  lastProbeAt = Date.now();
  lastProbeResult = result;
  return { ...result, cached: false };
}
