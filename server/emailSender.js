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

const DEFAULT_API_BASE = "https://api.brevo.com";

function env(name) {
  return String(process.env[name] || "").trim();
}

export function emailSenderConfig() {
  const apiKey = env("BREVO_API_KEY");
  const fromEmail = env("BREVO_SENDER_EMAIL") || env("BREVO_FROM_EMAIL");
  // Overridable so a Brevo-compatible endpoint, a proxy or a test double can be pointed
  // at without touching the key.
  const base = (env("BREVO_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
  return {
    enabled: Boolean(apiKey && fromEmail && base),
    apiKey,
    fromEmail,
    base,
    fromName: env("BREVO_SENDER_NAME") || "JaText",
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
