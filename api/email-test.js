import { emailSenderDiagnostics, probeEmailSender } from "../server/emailSender.js";
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
  if (allSilent) {
    return `The function could not hold a session with ${diagnostics.smtpHost} on any port it knows (${ports.join(", ")}). That is a network path question - the runtime has to be able to make an outbound connection to those ports - and not something a setting in Brevo can change.`;
  }
  if (/handshake|closed the connection|could not open a connection|did not answer/i.test(note)) {
    return "The function could not hold a session with the relay at all. That is a network path question - the runtime must be able to make an outbound connection to this host and port - and it is worth checking that BREVO_SMTP_PORT and BREVO_SMTP_SSL agree with each other before anything else.";
  }
  return "The SMTP relay refused the login or the sender. Check BREVO_SMTP_USER and BREVO_SMTP_PASS against Brevo's SMTP page, and the sender address against its Senders list; after any secret changes, redeploy this function, because a secret is only read when the function is published.";
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
  if (enforceHttpRateLimit(req, res, { scope: "email_test", limit: 20, windowMs: 60_000 })) {
    return;
  }

  let wantProbe = true;
  let forceProbe = false;
  try {
    const url = new URL(req.url || "/", "http://localhost");
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
            : "Brevo refused the stored API key - or the address it is called from. This runtime has no fixed egress IP for Brevo's allow-list, so set the BREVO_SMTP_* variables and use the relay, which is not IP restricted. Then redeploy this function: a secret is only read when the function is published."
          : probe.ok === true
            ? "Mail is configured and the provider accepts it" +
              (probe.port ? ` on port ${probe.port}/${probe.mode || "submission"}` : "") +
              ". A code that never arrives is then the recipient's spam folder, not this server."
            : "Mail is configured, but nothing was asked of it. Drop probe=0 to ask.",
  });
}
