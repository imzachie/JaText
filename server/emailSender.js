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

/**
 * Stop asking a transport that has already proved it cannot work here.
 *
 * Two things are being confused by a mailer with no memory, and they cost the same twelve
 * seconds each time: a relay having a bad minute, and a runtime that cannot hold an SMTP
 * session at all. The second one was measured, not guessed - on 587, 465 and 2525 the TCP
 * connection opens, the plaintext greeting arrives, and the encrypted half of the session
 * never carries a byte. So two sends in which a port was waited on and nothing came back put
 * the transport on a cooldown, and one send where the certificate turns out to name the
 * function's own loopback address opens it immediately, because nothing about that is a
 * transient condition.
 *
 * It is per isolate, it is a cooldown rather than a verdict forever, and only a transport that
 * failed to carry a conversation counts: a refused login or a refused sender is an account
 * problem, and taking mail away from everybody for that would be a clever way to cause the
 * outage it is trying to avoid.
 */
const SMTP_CIRCUIT_FAILURES = 2;
const SMTP_CIRCUIT_COOLDOWN_MS = 10 * 60_000;
const smtpCircuit = { failures: 0, openedAt: 0, note: "" };

/** An env switch with a default that has to be spelled out, because both of the two
 * places using it want the opposite one and neither is the safe guess. */
function flag(name, fallback) {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  return !/^(0|false|no|off)$/.test(raw);
}

function shortHash(value) {
  return hashHex(value).slice(0, 12);
}

/** The whole digest, for comparing two values without letting the comparison leak anything. */
function hashHex(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
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
  // Which transport to use when both are configured. `auto` (the default) prefers the relay,
  // because the HTTP API is gated behind an IP allow-list that a function with a rotating
  // address pool cannot satisfy, and stands down from the relay once it has proved it cannot
  // carry a session here; `api` is the answer for a deployment whose Brevo account does not
  // review source addresses, where the API is far the faster of the two; `smtp` is for the
  // opposite case, and for tests that must not be able to hide behind the fallback.
  const preference = (env("JATEXT_EMAIL_TRANSPORT") || "auto").toLowerCase();
  const breakerOpen = smtpCircuit.openedAt > 0 && Date.now() - smtpCircuit.openedAt < SMTP_CIRCUIT_COOLDOWN_MS;
  // `smtp` outranks an open circuit - it is how an operator says "I repaired it, ask again"
  // without waiting out the cooldown - while `api` stands down from a perfectly healthy
  // relay. `auto` (the default) is the only state the breaker itself controls.
  const wantSmtp = preference === "smtp" || (preference !== "api" && smtpReady && !breakerOpen);
  const kind = wantSmtp && smtpReady ? "smtp" : apiKey ? "brevo-api" : "none";
  const cooldownUntil = breakerOpen ? new Date(smtpCircuit.openedAt + SMTP_CIRCUIT_COOLDOWN_MS).toISOString() : "";

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
    preference,
    breaker: {
      failures: smtpCircuit.failures,
      open: breakerOpen,
      note: smtpCircuit.note,
      until: cooldownUntil,
    },
    smtp,
    apiKey,
    fromEmail,
    base,
    fromName: env("BREVO_SENDER_NAME") || "JaText",
    warning,
    reason: fromEmail
      ? !smtpReady && !apiKey
        ? "Neither the SMTP relay nor an API key is configured, so nothing can be sent"
        : kind !== "smtp" && smtpReady && preference !== "api" && breakerOpen
          ? `The SMTP relay is on cooldown${smtpCircuit.note ? ` (${smtpCircuit.note})` : ""}, so mail goes over the HTTP API until ${cooldownUntil}`
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
  // The per-port record travels with the error, because "one send failed" and "three ports
  // were asked and here is what each said" are different amounts of information, and the
  // second one is what a log line or a signup response has to carry for anybody to act on it.
  wrapped.attempts = err?.attempts;
  // And this one travels with it because it changes what the failure means: an intercepted
  // TLS session is not the relay refusing anything, and the caller has to be able to tell
  // that apart without parsing the sentence.
  wrapped.intercepted = err?.intercepted === true;
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
 * A send has to answer in seconds because a signup is waiting on it, so the ports share one
 * budget rather than each getting its own: three ports at eight seconds each is half a
 * minute of a dead-looking button on a phone, which is worse than the failure it is trying
 * to work around. The first port gets up to eight seconds; whatever is left of twelve goes to
 * the rest, in order; a port that cannot answer inside its share is not "down", it is
 * reported as not tried. One candidate is not a race against anything, so it keeps the full
 * window.
 */
const CANDIDATE_TIMEOUT_MS = 8_000;
const SEND_BUDGET_MS = 12_000;

/**
 * How long one port may take, given how many there are.
 *
 * Split evenly rather than first-come-first-served, because the failure this protects against
 * is the specific one where the two dead ports eat the whole budget and the working port at
 * the end of the list is never asked. A submission relay that is well answers in under a
 * second, so a few seconds each is enough for all of them and the total stays bounded.
 */
function candidateShare(count) {
  if (count <= 1) return CANDIDATE_TIMEOUT_MS * 2;
  return Math.max(2_000, Math.floor(SEND_BUDGET_MS / count));
}

/**
 * Try the relay on each configured port until a session is held.
 *
 * @returns the result of whichever send went through, tagged with the port that did it
 */
async function sendOverSmtpRelay(cfg, message) {
  const attempts = [];
  const share = candidateShare(cfg.smtp.candidates.length);
  const until = Date.now() + share * cfg.smtp.candidates.length;
  for (const candidate of orderedCandidates(cfg.smtp.candidates)) {
    const left = until - Date.now();
    if (left <= 500) {
      attempts.push({
        port: candidate.port,
        secure: candidate.secure,
        transportLevel: true,
        notTried: true,
        note: "not tried: the budget for one send was already spent, and this port would not have had time to answer",
      });
      continue;
    }
    const startedAt = Date.now();
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
        timeoutMs: cfg.smtp.candidates.length > 1 ? Math.min(share, left) : undefined,
      });
      preferredCandidate = candidate;
      return { ...result, port: candidate.port, mode: candidate.secure ? "implicit-tls" : "starttls" };
    } catch (err) {
      const transportLevel = isTransportLevel(err);
      // `ms` and `phase` are what separate "nothing is listening here" from "something is
      // listening and the conversation never happens", and only the second one costs a user
      // twelve seconds every time. A refused port answers in milliseconds and is free to
      // ignore; a port that hangs is the one a conclusion can be drawn from.
      attempts.push({
        port: candidate.port,
        secure: candidate.secure,
        transportLevel,
        intercepted: err?.intercepted === true,
        ms: Date.now() - startedAt,
        phase: err?.phase || "",
        note: String(err?.message || err),
      });
      if (err?.intercepted === true) {
        // One send is enough for this, and it has to happen here rather than after the
        // loop: an intercepted error is not transport-level, so the throw below ends the
        // loop and anything parked after it would never run. The certificate is not the
        // relay's, so no amount of retrying and no setting on the mail side will change
        // the answer - the transport is judged in one question instead of two timeouts.
        smtpCircuit.failures = SMTP_CIRCUIT_FAILURES;
        smtpCircuit.openedAt = Date.now();
        smtpCircuit.note = `the mail server's certificate named a loopback address, so something between this runtime and port ${candidate.port} is terminating TLS`;
        console.warn(
          `[email] the SMTP transport is on cooldown for ${Math.round(SMTP_CIRCUIT_COOLDOWN_MS / 60_000)} minutes (${smtpCircuit.note}); mail goes over the HTTP API until then.`,
        );
      }
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
 * Was this send slow because nothing answered?
 *
 * The rule is deliberately narrow, because the failures worth reporting are quick ones: a
 * refused connection, a refused sender and a refused login all answer in milliseconds and each
 * deserves its own error in full. Only a send that spent real time waiting on silence is
 * evidence about the runtime rather than about the account.
 */
function isStuckTransport(err) {
  const attempts = err?.attempts || [];
  if (!attempts.length || !attempts.every((a) => a.transportLevel)) return false;
  return Math.max(...attempts.map((a) => Number(a.ms) || 0)) >= 1_000;
}

/**
 * The sentence a strike is remembered by: which port was waited on, and for how long.
 *
 * The breaker's note is what `/api/email-test` later prints as the reason mail is going
 * over the API, so an empty note would report a cooldown with no cause attached - the one
 * thing an operator needs in order to decide whether to wait it out or intervene.
 */
function stuckNote(err) {
  const attempts = err?.attempts || [];
  const slowest = attempts.reduce((a, b) => (Number(b.ms || 0) > Number(a.ms || 0) ? b : a), attempts[0] || {});
  if (!slowest.port) return "the relay did not answer inside the send budget";
  return `${describeCandidate(slowest)} timed out waiting ${Math.round(Number(slowest.ms) || 0)}ms for the relay to answer`;
}

function recordSmtpFailure(note) {
  smtpCircuit.failures += 1;
  smtpCircuit.note = String(note || smtpCircuit.note || "");
  if (smtpCircuit.failures >= SMTP_CIRCUIT_FAILURES) {
    smtpCircuit.openedAt = Date.now();
    console.warn(
      `[email] the SMTP transport is on cooldown for ${Math.round(SMTP_CIRCUIT_COOLDOWN_MS / 60_000)} minutes` +
        `${smtpCircuit.note ? ` (${smtpCircuit.note})` : ""}; mail goes over the HTTP API until then.`,
    );
  }
}

/**
 * Forget the verdict.
 *
 * The circuit is a judgement about a configuration, so changing the configuration is what
 * should clear it - an operator who points the relay at another host, or a test that runs its
 * next case against another port, must not inherit a ten-minute sentence about the last one.
 * Nothing calls this on a *successful API* send: that is not evidence the relay got better, and
 * clearing it there would make every other signup pay the twelve seconds again.
 */
export function resetSmtpCircuit() {
  smtpCircuit.failures = 0;
  smtpCircuit.openedAt = 0;
  smtpCircuit.note = "";
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
      const sent = await sendOverSmtpRelay(cfg, message);
      if (smtpCircuit.failures) resetSmtpCircuit();
      return sent;
    } catch (err) {
      if (isStuckTransport(err)) recordSmtpFailure(stuckNote(err));
      // Only a relay that never answered at all is worth asking the HTTP API about - not
      // because it is likely to work, but because its answer names a different cause (an IP
      // allow-list, say) than "nothing answered". An ordinary certificate this runtime will
      // not accept is not that, and neither is a relay that refused to upgrade. Interception
      // is the exception: there the mail server was never reached at all, the SMTP path is
      // known to be blocked from inside this runtime, and the HTTPS API is a different path
      // to the same provider, so the message still goes out instead of failing the signup
      // over a port nobody is allowed to use here.
      if (cfg.apiKey && (isUnreachable(err) || err?.intercepted === true)) {
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
    transportPreference: cfg.preference,
    smtpBreakerOpen: cfg.breaker.open,
    smtpBreakerNote: cfg.breaker.note,
    smtpBreakerUntil: cfg.breaker.until,
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

/**
 * Send one real message, on purpose, to an address the operator names.
 *
 * `GET /api/email-test` proves the credentials are accepted; this proves a message reaches
 * an inbox, which is the question underneath it. It is the only route in the API that
 * *sends* to an arbitrary address, so it is guarded by a secret rather than by obscurity:
 * with `JATEXT_TEST_SEND_TOKEN` unset it refuses, and with it set the caller has to know the
 * value. Without that, this endpoint would be an open relay against somebody's daily quota.
 *
 * @returns {{sent: true, to: string, transport: string, port?: number, mode?: string}}
 */
export async function requestTestSend({ to, token } = {}) {
  const expected = env("JATEXT_TEST_SEND_TOKEN");
  if (!expected) {
    const err = new Error(
      "Test sends are not enabled. Set JATEXT_TEST_SEND_TOKEN to any private value and pass it as ?token= when a real message should be sent.",
    );
    err.code = "email_test_disabled";
    throw err;
  }
  const given = String(token || "");
  // Compared by hash, so a timing difference cannot say how close a guess was. This is a
  // public endpoint and the value is a credential.
  const same = (a, b) => crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (!given || !same(hashHex(given), hashHex(expected))) {
    const err = new Error("The token for a test send is not the one this deployment has.");
    err.code = "email_test_unauthorized";
    throw err;
  }
  const address = String(to || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    const err = new Error("Pass a valid address as ?send=you@example.com.");
    err.code = "email_test_bad_address";
    throw err;
  }
  const result = await sendEmail({
    to: address,
    subject: "JaText mail test",
    text:
      "This is the mail test from the JaText deployment.\n\nIf it arrived, the verification codes for signup will arrive too.\nNothing about your account changed, and no code is in this message.\n",
    html:
      "<p>This is the mail test from the <strong>JaText</strong> deployment.</p><p>If it arrived, the verification codes for signup will arrive too. Nothing about your account changed, and no code is in this message.</p>",
  });
  return { sent: true, to: address, ...result };
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
    // Every port at the same time. A probe sends nothing, so two successes cost nothing and
    // the alternative is a diagnostic that takes as long as the sum of every failure - which
    // is the reason nobody reads diagnostics like these.
    const candidates = orderedCandidates(cfg.smtp.candidates);
    const settled = await Promise.all(
      candidates.map(async (candidate) => {
        const startedAt = Date.now();
        const attempt = await probeSmtpLogin({
          ...cfg.smtp,
          port: candidate.port,
          secure: candidate.secure,
          from: cfg.fromEmail,
          timeoutMs: CANDIDATE_TIMEOUT_MS,
        }).catch((err) => ({
          ok: false,
          note: String(err?.message || err),
          phase: err?.phase || "",
          intercepted: err?.intercepted === true,
        }));
        return {
          port: candidate.port,
          secure: candidate.secure,
          ok: attempt.ok === true,
          // Each port timed on its own clock: with every candidate asked at once, a shared
          // start would report "whoever finished first" as if it were "whoever was fastest".
          ms: Date.now() - startedAt,
          phase: attempt.phase || "",
          intercepted: attempt.intercepted === true,
          // The session's own report where there was one, and the server's words where there
          // was not: enough to tell "the port is filtered" from "the handshake completed and
          // the relay closed the session" from "the certificate says a different name".
          tls: attempt.tls,
          note: attempt.note || attempt.error || "",
          attempt,
        };
      }),
    );
    const attempts = settled.map((a) => ({
      port: a.port,
      secure: a.secure,
      ok: a.ok,
      ms: a.ms,
      phase: a.phase,
      intercepted: a.intercepted,
      tls: a.tls,
      note: a.note,
    }));
    const winner = settled.find((a) => a.ok);
    if (winner) {
      preferredCandidate = candidates.find((c) => c.port === winner.port && c.secure === winner.secure) || null;
      result = {
        ...winner.attempt,
        port: winner.port,
        mode: winner.secure ? "implicit-tls" : "starttls",
        ms: winner.ms,
      };
    } else {
      // The failure result is built before the interception flag rather than around it:
      // flagging first made the object truthy and skipped this default, so an intercepted
      // probe came back with no `ok: false` at all and the route read it as a pass.
      result = {
        ok: false,
        status: 0,
        sender: cfg.fromEmail,
        note: attempts.map((a) => `${describeCandidate(a)}: ${a.note}`).join(" | "),
      };
      if (attempts.some((a) => a.intercepted)) {
        // The probe is read-only, so it changes nothing about the transport; this only says out
        // loud what the last send already concluded, because "a proxy is terminating your TLS"
        // is the one sentence that makes a three-port timeout list legible.
        result.intercepted = true;
      }
    }
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
