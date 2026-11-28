import { emailSenderDiagnostics, probeEmailSender, requestTestSend } from "../server/emailSender.js";
import { isEmailVerificationRequired } from "../server/tursoBackend.js";
import { enforceHttpRateLimit } from "../server/rateLimiter.js";

/**
 * "Is the mail side of this deployment actually usable", in one command.
 *
 *   GET /api/email-test            -> what is configured, and one read-only question to Brevo
 *   GET /api/email-test?probe=0    -> the config only, Brevo is not contacted at all
 *
 * It exists because the two ways a signup code fails to arrive look identical from the
 * app: a credential Brevo refuses, and a sender address that was never verified in their
 * dashboard. Both arrive as a failed send, so the reason was only findable in Supabase's
 * function logs, which nobody reads. This puts the difference in the response.
 *
 * Nothing secret comes out of it. The key is reported as its length and twelve
 * hexadecimal characters of a hash, which is enough to tell "the stored value" apart from
 * "the value that was meant to be stored" and not enough to be worth stealing. The probe
 * against Brevo is read-only, returns no account data, and is throttled to one call per
 * five minutes per isolate, so this route cannot be used to spend the daily quota.
 */
/**
 * Which of the SMTP failures this is, in the words that match the fix.
 *
 * Three of them look alike from the outside - a wrong port, a blocked port and a refused
 * credential all arrive as "no session" - so the list of ports tried is what tells them
 * apart: two ports asked and both stayed silent is a network path, while an answer that
 * says "credentials" is something to change in Brevo.
 */
function smtpHint(probe, diagnostics) {
  const note = String(probe?.note || "");
  const attempts = Array.isArray(probe?.attempts) ? probe.attempts : [];
  const ports = attempts.map((a) => `${a.port}/${a.secure ? "implicit TLS" : "STARTTLS"}`);
  const allSilent =
    attempts.length > 1 &&
    attempts.every((a) => /handshake|TLS session|closed the connection|could not open a connection|did not answer|timed out/i.test(String(a.note || "")));
  if (/TLS record/i.test(note)) {
    return "The relay answered this connection with TLS from the first byte, which is port 465, while the function is configured for 587. Set BREVO_SMTP_PORT=465, or clear it and let both ports be tried.";
  }
  if (probe?.intercepted || attempts.some((a) => a.intercepted)) {
    return (
      `Something inside this runtime is terminating the TLS session itself - the certificate it presented names a loopback ` +
      `address, which a relay on the internet never does. Outbound submission is blocked here and no Brevo setting changes that. ` +
      `Send over the HTTPS API instead: set JATEXT_EMAIL_TRANSPORT=api (and, if Brevo answers 401, switch its ` +
      `Security > Authorised IPs to "No IP review"), then redeploy this function.`
    );
  }
  if (allSilent) {
    return `The function could not hold a session with ${diagnostics.smtpHost} on any port it knows (${ports.join(", ")}). That is a network path question - the runtime has to be able to make an outbound connection to those ports - and not something a setting in Brevo can change.`;
  }
  if (/handshake|closed the connection|could not open a connection|did not answer/i.test(note)) {
    return "The function could not hold a session with the relay at all. That is a network path question - the runtime must be able to make an outbound connection to this host and port - and it is worth checking that BREVO_SMTP_PORT and BREVO_SMTP_SSL agree with each other before anything else.";
  }
  return "The SMTP relay refused the login or the sender. Check BREVO_SMTP_USER and BREVO_SMTP_PASS against Brevo's SMTP page, and the sender address against its Senders list; after any secret changes, redeploy this function, because a secret is only read when the function is published.";
}

/**
 * The HTTP API refused, which is one of two things, and the words have to say which.
 *
 * A key that is not the key is fixable from the dashboard in a minute. A source address that is
 * not on the account's allow-list is not fixable from here at all - an Edge Function has no fixed
 * egress IP to add, only a pool of them - so the answer is to stop restricting by IP, which
 * Brevo itself recommends for exactly this shape of integration. The address it complained about
 * is quoted back because it is already in Brevo's message and because it is the thing that makes
 * the difference obvious.
 */
function apiHint(probe, diagnostics) {
  const note = String(probe?.note || "");
  if (/unrecogni[sz]ed ip|authoris|authorized ip|allow.?list|ip address/i.test(note)) {
    const ip = (note.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b|[0-9a-f:]{15,}:\w+/i) || [])[0] || "";
    return (
      `Brevo is refusing this deployment's source address${ip ? ` (${ip})` : ""}, and an Edge Function has no fixed one to add to that list.` +
      ` Set Brevo's Security > Authorised IPs to "No IP review" - app.brevo.com/security/authorised_ips - and mail starts within a minute.` +
      ` The key is not the problem${diagnostics.keyLength ? `, and its length (${diagnostics.keyLength}) is what a real one looks like` : ""}.`
    );
  }
  return (
    "Brevo refused the stored API key. Copy the value from Brevo's own SMTP & API page, set it as BREVO_API_KEY, and redeploy this " +
    "function, because a secret is only read when the function is published."
  );
}

/**
 * Nothing is wrong right now, and saying so is the whole point: a deployment that has given up
 * on a transport has to be able to see that it did, and when it will ask again.
 */
function breakerHint(diagnostics) {
  return (
    `Mail is going over the HTTP API, because the SMTP relay was judged unusable from this runtime${diagnostics.smtpBreakerNote ? `: ${diagnostics.smtpBreakerNote}` : ""}. ` +
    `It will be asked again after ${diagnostics.smtpBreakerUntil || "the cooldown ends"}, and ${diagnostics.smtpBreakerUntil ? "until then, " : ""}` +
    `set JATEXT_EMAIL_TRANSPORT=smtp to test a repair immediately, or =api to stop asking at all.`
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Only GET is supported." });
  }
  // Parsed once, for both of the optional modes below.
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    url = new URL("http://localhost/");
  }
  // `?send=<address>&token=<JATEXT_TEST_SEND_TOKEN>` puts one real message in an inbox, which
  // is the difference between "the relay accepts the credentials" and "mail arrives". It is
  // the only thing here that sends to an address chosen by the caller, so it is off until the
  // deployment sets a token, and it gets the tightest budget of the three.
  const sendTo = url.searchParams.get("send");
  if (sendTo) {
    if (enforceHttpRateLimit(req, res, { scope: "email_test_send", limit: 3, windowMs: 5 * 60_000 })) {
      return;
    }
    try {
      const result = await requestTestSend({ to: sendTo, token: url.searchParams.get("token") });
      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      return res.status(err?.code === "email_test_unauthorized" || err?.code === "email_test_disabled" ? 403 : 400).json({
        ok: false,
        error: String(err?.message || err),
        code: String(err?.code || "email_test_failed"),
      });
    }
  }
  if (enforceHttpRateLimit(req, res, { scope: "email_test", limit: 20, windowMs: 60_000 })) {
    return;
  }

  let wantProbe = true;
  let forceProbe = false;
  try {
    const mode = url.searchParams.get("probe");
    wantProbe = mode !== "0";
    // `?probe=force` answers the question now instead of from the last five minutes, which
    // is the difference between fixing a mail setting and waiting for an isolate to die.
    // It opens a real session per call, so it gets its own, much tighter, budget.
    forceProbe = mode === "force";
  } catch {
    wantProbe = true;
  }
  if (forceProbe && enforceHttpRateLimit(req, res, { scope: "email_test_force", limit: 3, windowMs: 60_000 })) {
    return;
  }

  const diagnostics = emailSenderDiagnostics();
  const probe = wantProbe ? await probeEmailSender({ force: forceProbe }) : { skipped: true };

  return res.status(200).json({
    ok: diagnostics.configured && (probe.skipped || probe.ok !== false),
    verificationRequired: isEmailVerificationRequired(),
    ...diagnostics,
    probe,
    // Which failure this is, said out loud, because a signup can only report the one
    // sentence it got back from a send.
    hint: !diagnostics.configured
      ? diagnostics.reason
      : diagnostics.warning
        ? diagnostics.warning
        : probe.ok === false
          ? diagnostics.transport === "smtp"
            ? smtpHint(probe, diagnostics)
            : apiHint(probe, diagnostics)
        : diagnostics.smtpBreakerOpen
          ? breakerHint(diagnostics)
          : probe.ok === true
            ? "Mail is configured and the provider accepts it" +
              (probe.port ? ` on port ${probe.port}/${probe.mode || "submission"}` : "") +
              ". A code that never arrives is then the recipient's spam folder, not this server."
            : "Mail is configured, but nothing was asked of it. Drop probe=0 to ask.",
  });
}
