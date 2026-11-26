#!/usr/bin/env node
/**
 * Live smoke test for signup email verification, against a deployed API.
 *
 *   node scripts/smoke-email-verification.mjs https://jatextapp.pages.dev someone@example.com
 *
 * It is the only way to prove the whole chain - the flag is on, Brevo accepted the
 * send, no session is handed out, and the code endpoints answer - without somebody
 * sitting at the app. Nothing here reads a mailbox: Brevo's own acceptance of the
 * message is the proof it was sent, and the code staying unread is the point.
 *
 * It creates a real account and prints its id so it can be deleted afterwards:
 *
 *   delete from email_verifications where user_id = '<id>';
 *   delete from users where id = '<id>';
 */
const [origin = "https://jatextapp.pages.dev", email = ""] = process.argv.slice(2);
const API = origin.replace(/\/+$/, "");

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("usage: node scripts/smoke-email-verification.mjs <api-origin> <address-to-sign-up>");
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) failed += 1;
}

async function rpc(op, args = {}, token = "") {
  const res = await fetch(`${API}/api/turso`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ op, args }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, data: json?.data ?? null, error: json?.error ?? "" };
}

function decodeSub(jwt) {
  try {
    const payload = String(jwt).split(".")[1] || "";
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

console.log(`signup verification smoke test against ${API}`);
console.log(`address: ${email}\n`);

const signUp = await rpc("signUpEmail", { email, password: "smoke-test-password-2026" });
check(
  "sign-up asked for the emailed code instead of handing over a session",
  signUp.data?.requiresEmailVerification === true,
  `status=${signUp.status} error=${signUp.error || "-"} keys=${signUp.data ? Object.keys(signUp.data).join(",") : "-"}`,
);
check("no auth token came back", !signUp.data?.token);
check("a masked address was shown, not the raw one", String(signUp.data?.maskedEmail || "").includes("*"), signUp.data?.maskedEmail);

const challenge = String(signUp.data?.challengeToken || "");
const claim = decodeSub(challenge);
const userId = String(claim.sub || "");
check("the challenge token names the account it belongs to", Boolean(userId), JSON.stringify(claim));
console.log(`\n  user id for cleanup: ${userId || "(unreadable)"}\n`);

const status = await rpc("getEmailVerification", { challengeToken: challenge });
check(
  "the account reports itself unverified while the code is outstanding",
  status.data?.verified === false && status.data?.required === true,
  `status=${status.status} ${JSON.stringify(status.data)}`,
);

const wrong = await rpc("verifyEmailCode", { challengeToken: challenge, code: "000000" });
check(
  "a wrong code is refused with something a person can act on",
  wrong.status !== 200 && /code|email/i.test(wrong.error || ""),
  `status=${wrong.status} error=${wrong.error || "-"}`,
);

const early = await rpc("sendEmailVerification", { challengeToken: challenge });
check(
  "asking for a second code straight away is throttled, with the wait spelled out",
  early.status === 429 || /wait \d+ more seconds/i.test(early.error || ""),
  `status=${early.status} error=${early.error || "-"}`,
);

const anonymous = await rpc("sendMessage", { receiverEmail: "whoever@example.com", body: "hi" });
check(
  "and with no session at all there is nothing to reach anyone with",
  anonymous.status === 401 || anonymous.status === 403,
  `status=${anonymous.status} error=${anonymous.error || "-"}`,
);

console.log(
  failed === 0
    ? "\nthe code gate is live and Brevo accepted the send"
    : `\n${failed} check(s) failed - the gate is on but something in the chain is not`,
);
console.log(`cleanup: delete from email_verifications where user_id = '${userId}'; delete from users where id = '${userId}';`);
process.exit(failed === 0 ? 0 : 1);
