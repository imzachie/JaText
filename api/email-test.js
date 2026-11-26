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
  try {
    const url = new URL(req.url || "/", "http://localhost");
    wantProbe = url.searchParams.get("probe") !== "0";
  } catch {
    wantProbe = true;
  }

  const diagnostics = emailSenderDiagnostics();
  const probe = wantProbe ? await probeEmailSender() : { skipped: true };

  return res.status(200).json({
    ok: diagnostics.configured && (probe.skipped || probe.ok !== false),
    verificationRequired: isEmailVerificationRequired(),
    ...diagnostics,
    probe,
    // Which of the two failures this is, said out loud, because the app can only report
    // the one sentence it got back from a send.
    hint: !diagnostics.configured
      ? diagnostics.reason
      : diagnostics.warning
        ? diagnostics.warning
        : probe.ok === false
          ? "Brevo refused the stored key. Replace it with the value shown on Brevo's own API page, then redeploy this function: a secret is only read when the function is published."
          : "Mail is configured and Brevo accepts the key. A code that never arrives is then the recipient's spam folder, not this server.",
  });
}
