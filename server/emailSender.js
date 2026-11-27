/**
 * Transactional email for JaText, with the two ways a Supabase Edge Function can send it.
 *
 * Brevo hands out two credentials, and only one of them works from here by default:
 *
 *   - the HTTP API key (`xkeysib-...`) is restricted to source addresses on an
 *     allow-list, and an Edge Function has no fixed egress IP to put on it, so
 *     `POST /v3/smtp/email` answers 401 with "unrecognised IP address" however correct
 *     the key is;
 *   - the SMTP relay (`smtp-relay.brevo.com`) is not IP-restricted, and has to be reached
 *     over one of two TLS shapes: port 587 upgrades a plain connection with STARTTLS,
 *     port 465 is TLS from the first byte. Those go through different code paths in the
 *     runtime, and they fail independently, so the mailer is configured with BOTH and uses
 *     whichever one answers - see `DEFAULT_SMTP_CANDIDATES`.
 *
 * Both transports are kept, because a self-hoster running `npm run selfhost` on a box with
 * a fixed address may prefer the API, and because the shape of the config is the
 * documentation: whichever of the two is present gets used, SMTP first when both are. The
 * sender address has to be one Brevo has verified either way, or every send comes back as
 * `sender not verified` and looks like a bug in this file rather than a missing click in
 * their dashboard.
 */

import crypto from "node:crypto";
import { probeSmtpLogin, smtpSendMail } from "./smtpClient.js";

const DEFAULT_API_BASE = "https://api.brevo.com";

/**
 * The ways to hold a session with the relay, in the order they are tried.
 *
 * Two rather than one because they fail for different reasons and only one of them failing
 * is survivable: the STARTTLS upgrade has to wrap a socket that is already open, which is
 * the path that has timed out in this runtime even with a healthy server on the other end,
 * while implicit TLS opens a fresh encrypted socket and never touches that code. Port 25
 * is deliberately absent - hosting providers block it, and waiting on it twice would only
 * make every signup slow.
 */
const DEFAULT_SMTP_CANDIDATES = [
  { port: 587, secure: false },
  { port: 465, secure: true },
  // Brevo documents this as the fallback "when 587 is blocked", which is the situation this
  // list exists for. It is STARTTLS like 587, so a runtime that cannot complete an upgrade
  // gains nothing here - but a network that filters ports 587 and 465 and leaves this one
  // open is a real hosting pattern, and 8 seconds is the whole cost of covering it.
  { port: 2525, secure: false },
];

/**
 * What a Brevo API key looks like: a fixed prefix, 64 hex characters, and a 16 character
 * suffix. Checked so that a key pasted short, or one that picked up a stray `->` from a
 * chat window, is named here instead of showing up later as Brevo answering 401 to
 * somebody's signup. Only the shape is judged - the key is never printed anywhere.
 */
const BREVO_KEY_SHAPE = /^xkeysib-[0-9a-f]{64}-[A-Za-z0-9]{16}$/;

function env(name) {
  return String(process.env[name] || "").trim();
}

/** An env switch with a default that has to be spelled out, because both of the two
 * places using it want the opposite one and neither is the safe guess. */
function flag(name, fallback) {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  return !/^(0|false|no|off)$/.test(raw);
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

/**
 * `587,465:implicit` or `465s` - the only two facts worth configuring about a submission
 * port are the number and whether it starts encrypted. Anything unparsable is dropped
 * rather than guessed at, because a candidate list that silently becomes empty means every
 * send fails with "no host", which is a dreadful way to find out about a typo.
 */
function parseCandidates(raw) {
  const list = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [portPart, modePart = ""] = item.split(/[:=]/);
      const port = Number(String(portPart).replace(/[^\d]/g, ""));
      if (!port || port > 65_535) return null;
      const secure = modePart
        ? /^(implicit|ssl|tls|secure|s)$/i.test(modePart.trim())
        : /[si]$/i.test(portPart) || port === 465;
      return { port, secure };
    })
    .filter(Boolean);
  return list;
}

export function emailSenderConfig() {
  const apiKey = env("BREVO_API_KEY");
  const fromEmail = env("BREVO_SENDER_EMAIL") || env("BREVO_FROM_EMAIL");
  // Overridable so a Brevo-compatible endpoint, a proxy or a test double can be pointed
  // at without touching the key.
  const base = (env("BREVO_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");

  const explicitPort = env("BREVO_SMTP_PORT") || env("SMTP_PORT");
  const listed = parseCandidates(env("BREVO_SMTP_CANDIDATES") || env("SMTP_PORTS"));
  // An explicit port means exactly that port: someone who has written it down is telling
  // us something, and second-guessing it with a second attempt would hide their mistake
  // behind a success on the other one.
  let candidates = listed.length
    ? listed
    : explicitPort
      ? [
          {
            port: Number(explicitPort.replace(/[^\d]/g, "")) || 587,
            secure: flag("BREVO_SMTP_SSL", false) || Number(explicitPort.replace(/[^\d]/g, "")) === 465,
          },
        ]
      : DEFAULT_SMTP_CANDIDATES.map((c) => ({ ...c }));
  if (!candidates.length) candidates = DEFAULT_SMTP_CANDIDATES.map((c) => ({ ...c }));

  const smtp = {
    host: env("BREVO_SMTP_HOST") || env("SMTP_HOST"),
    // The first of them, so that everything reading `smtp.port` sees a real candidate
    // rather than a separate notion of what the port is.
    port: candidates[0].port,
    secure: candidates[0].secure,
    candidates,
    user: env("BREVO_SMTP_USER") || env("SMTP_USER"),
    // The name to send for SNI and to require in the certificate, when the host we dial is
    // not the name the relay's certificate carries. See `server/smtpClient.js`.
    servername: env("BREVO_SMTP_SERVERNAME") || env("SMTP_SERVERNAME"),
    // A CA bundle, inline, because a file path is meaningless in an Edge Function. This is
    // the honest way to trust a relay with a private CA: `SMTP_TLS_REJECT_UNAUTHORIZED=0`
    // gives up on the name check as well, and that check is the one that matters when a
    // password is on the wire.
    ca: env("SMTP_TLS_CA_PEM") || undefined,
    pass: env("BREVO_SMTP_PASS") || env("SMTP_PASS"),
    // A local test relay can be plain; a real one may not be, with a password in it.
    requireTls: flag("SMTP_REQUIRE_TLS", true),
    // Off only for a relay whose certificate is not in the trust store - a private CA, or
    // the self-signed one the tests in this repo generate for exactly this purpose.
    rejectUnauthorized: flag("SMTP_TLS_REJECT_UNAUTHORIZED", true),
  };
  const smtpReady = Boolean(smtp.host && smtp.user && smtp.pass);
  const kind = smtpReady ? "smtp" : apiKey ? "brevo-api" : "none";

  let warning = "";
  if (kind === "brevo-api" && apiKey && !BREVO_KEY_SHAPE.test(apiKey)) {
    warning =
      `BREVO_API_KEY does not look like a Brevo API key (expected "xkeysib-" plus 64 hex characters ` +
      `plus a 16 character suffix, 89 in all; this one is ${apiKey.length}). A key copied short is ` +
      `the usual reason, and Brevo answers it with 401.`;
  }

  return {
    enabled: Boolean(fromEmail && (smtpReady || apiKey)),
    kind,
    smtpReady,
    smtp,
    apiKey,
    fromEmail,
    base,
    fromName: env("BREVO_SENDER_NAME") || "JaText",
    warning,
    reason: fromEmail
      ? !smtpReady && !apiKey
        ? "Neither the SMTP relay nor an API key is configured, so nothing can be sent"
        : ""
      : "No BREVO_SENDER_EMAIL is set, which has to be an address Brevo has verified",
  };
}

export function isEmailSenderConfigured() {
  return emailSenderConfig().enabled;
}

function describeCandidate(c) {
  return `${c.port}/${c.secure ? "implicit TLS" : "STARTTLS"}`;
}

/**
 * The failures worth trying another port for: the ones where the connection never carried
 * a decision. A refused login, a refused sender or a message the relay would not queue is
 * an answer, and asking the same question on a different port only spends another fifteen
 * seconds of somebody's signup and gets the same answer.
 */
const TRANSPORT_PHASES = new Set(["", "connect", "greeting", "starttls", "ehlo-after-tls", "tls-mode"]);

function isTransportLevel(err) {
  if (Number(err?.code)) return false;
  return TRANSPORT_PHASES.has(String(err?.phase ?? ""));
}

/**
 * A relay we cannot get a session with at all is the one failure worth trying the other
 * transport for.
 *
 * A failed TLS handshake is deliberately NOT in here. It looks like a transport problem and
 * is the one case where retrying would be actively wrong: if the certificate could not be
 * verified, the fallback sends the same message to the same destination over a channel this
 * code has no reason to consider safer.
 */
function isUnreachable(err) {
  if (err?.smtpPhase) return false;
  if (Number(err?.status)) return false;
  return /could not open a connection|closed the connection|econnrefused|econnreset|enotfound|eai_again|etimedout/i.test(
    String(err?.message || err || ""),
  );
}

function asSendError(err, fallback) {
  const wrapped = new Error(err?.message || fallback);
  wrapped.code = Number(err?.code) ? "email_rejected" : "email_unreachable";
  wrapped.smtpPhase = err?.phase || "";
  return wrapped;
}

/**
 * The candidate that worked last, tried first this time.
 *
 * An Edge Function isolate lives for minutes, not days, so this is a courtesy to the second
 * send in a burst rather than a fix - the real fix is that a working port answers on the
 * first try for most signups.
 */
let preferredCandidate = null;

function orderedCandidates(candidates) {
  if (!preferredCandidate) return candidates;
  const first = candidates.find((c) => c.port === preferredCandidate.port && c.secure === preferredCandidate.secure);
  return first ? [first, ...candidates.filter((c) => c !== first)] : candidates;
}

/**
 * A send has to answer in seconds because a signup is waiting on it, so when there is more
 * than one port to try the budget per port shrinks to match: two fifteen-second waits would
 * be a dead-looking button on a phone even when the second port was fine. One candidate is
 * not a race against anything, so it keeps the full window.
 */
const CANDIDATE_TIMEOUT_MS = 8_000;

/**
 * Try the relay on each configured port until a session is held.
 *
 * @returns the result of whichever send went through, tagged with the port that did it
 */
async function sendOverSmtpRelay(cfg, message) {
  const attempts = [];
  for (const candidate of orderedCandidates(cfg.smtp.candidates)) {
    try {
      const result = await smtpSendMail({
        ...cfg.smtp,
        port: candidate.port,
        secure: candidate.secure,
        from: cfg.fromEmail,
        fromName: cfg.fromName,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        timeoutMs: cfg.smtp.candidates.length > 1 ? CANDIDATE_TIMEOUT_MS : undefined,
      });
      preferredCandidate = candidate;
      return { ...result, port: candidate.port, mode: candidate.secure ? "implicit-tls" : "starttls" };
    } catch (err) {
      const transportLevel = isTransportLevel(err);
      attempts.push({ port: candidate.port, secure: candidate.secure, transportLevel, note: String(err?.message || err) });
      // A refusal is the relay answering, so it ends the session rather than moving on:
      // 587 saying "credentials invalid" means 465 will say the same, and the signup
      // deserves its error in under a second instead of after two timeouts.
      if (!transportLevel) {
        const wrapped = asSendError(err, "Could not send the email through the SMTP relay.");
        wrapped.attempts = attempts;
        throw wrapped;
      }
    }
  }
  const detail = attempts.map((a) => `${describeCandidate(a)}: ${a.note}`).join(" | ");
  const err = new Error(
    attempts.length > 1
      ? `No SMTP session could be held with ${cfg.smtp.host} (${detail})`
      : attempts[0]?.note || "Could not send the email through the SMTP relay.",
  );
  err.code = "email_unreachable";
  err.attempts = attempts;
  throw err;
}

/**
 * @param {{to: string, subject: string, text: string, html?: string}} message
 * @returns {Promise<{sent: true, transport: string, messageId?: string}>}
 * @throws if the send fails, with the provider's own words so the reason is readable
 *         from the app instead of only from Supabase's function logs
 */
export async function sendEmail(message) {
  const cfg = emailSenderConfig();
  if (!cfg.enabled) {
    const err = new Error(`Email is not configured: ${cfg.reason || "no sender address and no transport"}.`);
    err.code = "email_unconfigured";
    throw err;
  }

  if (cfg.kind === "smtp") {
    try {
      return await sendOverSmtpRelay(cfg, message);
    } catch (err) {
      // Only a relay that never answered at all is worth asking the HTTP API about - not
      // because it is likely to work, but because its answer names a different cause (an IP
      // allow-list, say) than "nothing answered". A certificate this runtime will not accept
      // is not that, and neither is a relay that refused to upgrade.
      if (cfg.apiKey && isUnreachable(err)) {
        // Fall through to the API and report that pairing, so the log says which two
        // things were tried rather than only the first one that gave up.
        const apiErr = await sendViaBrevoApi(cfg, message).catch((inner) => inner);
        if (apiErr instanceof Error && !apiErr.code) throw asSendError(apiErr, "Could not send the email.");
        if (!(apiErr instanceof Error)) return { sent: true, transport: "smtp-then-api" };
        apiErr.message = `${apiErr.message} (the SMTP relay was unreachable first: ${err.message})`;
        throw apiErr;
      }
      throw asSendError(err, "Could not send the email through the SMTP relay.");
    }
  }

  return await sendViaBrevoApi(cfg, message);
}

async function sendViaBrevoApi(cfg, { to, subject, text, html }) {
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
    const detail = String(parsed?.message || raw || "").slice(0, 240);
    // A 401 here is usually not a wrong key. Say which of the two it is, because the
    // fix is different and only one of them is fixable from this side.
    const ipRestricted = /unrecogni[sz]ed ip|whitelist|allow.?list|ip address/i.test(detail);
    const message = response.status !== 401
      ? `Brevo refused the email (HTTP ${response.status})${detail ? `: ${detail}` : ""}`
      : ipRestricted
        ? `Brevo only accepts API calls from addresses on its allow-list, and this function has no fixed one to add (${detail}). Use the SMTP relay instead - the relay is not IP restricted.`
        : `Brevo rejected the API key${detail ? `: ${detail}` : ""}`;
    const err = new Error(message);
    err.code = "email_rejected";
    err.status = response.status;
    throw err;
  }
  return { sent: true, transport: "brevo-api", messageId: String(parsed?.messageId || "") };
}

/**
 * A readable answer to "is the mail side of this deployment usable", with no key material
 * in it: the length, and twelve hexadecimal characters of a hash, which is enough to tell
 * "the stored value" apart from "the value that was meant to be stored" and not enough to be
 * worth stealing.
 */
export function emailSenderDiagnostics() {
  const cfg = emailSenderConfig();
  return {
    configured: cfg.enabled,
    transport: cfg.kind,
    reason: cfg.reason || "",
    warning: cfg.warning || "",
    keyLength: cfg.apiKey.length,
    keyFingerprint: cfg.apiKey ? shortHash(cfg.apiKey) : "",
    smtpHost: cfg.smtp.host || "",
    smtpPort: cfg.smtp.host ? cfg.smtp.port : 0,
    smtpCandidates: cfg.smtp.host ? cfg.smtp.candidates.map(describeCandidate) : [],
    smtpUser: cfg.smtp.user ? `${cfg.smtp.user.split("@")[0]}@${cfg.smtp.user.split("@")[1] || ""}` : "",
    smtpPassLength: cfg.smtp.pass.length,
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
 * Ask the configured transport one read-only question - "would these credentials send" -
 * and report the answer without any of the credential. Used by `GET /api/email-test`, which
 * is how a signup rejected with 401 is told apart from a sender that was never verified in
 * Brevo's dashboard: both otherwise arrive as the same failed send.
 */
export async function probeEmailSender({ force = false } = {}) {
  const cfg = emailSenderConfig();
  const now = Date.now();
  if (!force && now - lastProbeAt < PROBE_COOLDOWN_MS && lastProbeResult) {
    return {
      ...lastProbeResult,
      cached: true,
      retryAfterSec: Math.ceil((PROBE_COOLDOWN_MS - (now - lastProbeAt)) / 1000),
    };
  }

  let result;
  if (cfg.kind === "smtp") {
    const attempts = [];
    for (const candidate of orderedCandidates(cfg.smtp.candidates)) {
      const startedAt = Date.now();
      const attempt = await probeSmtpLogin({
        ...cfg.smtp,
        port: candidate.port,
        secure: candidate.secure,
        from: cfg.fromEmail,
        timeoutMs: cfg.smtp.candidates.length > 1 ? CANDIDATE_TIMEOUT_MS : 15_000,
      });
      attempts.push({
        port: candidate.port,
        secure: candidate.secure,
        ok: attempt.ok === true,
        ms: Date.now() - startedAt,
        // The session's own report where there was one, and the server's words where there
        // was not: enough to tell "the port is filtered" from "the handshake completed and
        // the relay closed the session" from "the certificate says a different name".
        tls: attempt.tls,
        note: attempt.note || attempt.error || "",
      });
      if (attempt.ok === true) {
        preferredCandidate = candidate;
        result = {
          ...attempt,
          port: candidate.port,
          mode: candidate.secure ? "implicit-tls" : "starttls",
        };
        break;
      }
    }
    result = result || {
      ok: false,
      status: 0,
      sender: cfg.fromEmail,
      note: attempts.map((a) => `${describeCandidate(a)}: ${a.note}`).join(" | "),
    };
    result.transport = "smtp";
    result.sender = cfg.fromEmail;
    result.attempts = attempts;
  } else if (cfg.apiKey) {
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
        transport: "brevo-api",
        // The status on a good day, Brevo's own sentence on a bad one, and nothing else:
        // this body is written by a third party and is not trusted text.
        note: response.ok ? "credential accepted" : raw.slice(0, 240),
      };
    } catch (err) {
      result = { ok: false, status: 0, transport: "brevo-api", error: `Could not reach ${cfg.base}: ${err?.message || err}` };
    }
  } else {
    return { ok: false, skipped: true, error: "No BREVO_API_KEY and no SMTP relay are set." };
  }

  lastProbeAt = Date.now();
  lastProbeResult = result;
  return { ...result, cached: false };
}
