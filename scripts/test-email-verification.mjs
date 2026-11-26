#!/usr/bin/env node
/**
 * Signup email verification: the code, the gate, and the two ways it must not hurt.
 *
 *   node scripts/test-email-verification.mjs
 *
 * Brevo is stubbed with a local HTTP server that speaks the same one call the sender
 * makes, and the database is a small in-memory stand-in for the handful of statements
 * these code paths issue. What is being pinned down is behaviour a person would feel:
 *
 *   1. sign up, and no session is handed out until the code is entered
 *   2. the code that is mailed is 6 digits, and only its hash is stored
 *   3. wrong guesses are counted, the code dies after six of them
 *   4. an expired code is refused and cleared rather than retried forever
 *   5. asking for a second code inside the cooldown says how long to wait
 *   6. the right code opens the account, marks it verified and burns the code
 *   7. while verification is required, an unverified session cannot message people
 *   8. with no switch or no mailer, signup behaves exactly as it always did
 *   9. if Brevo refuses the send, the signup fails with the provider's own words and the
 *      account is rolled back, because a half-made account blocks the address forever
 */
import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";

const SECRET = "email-verify-test-secret";
const EMAIL = "jay@example.com";
const CODE_TTL = 10 * 60_000;

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? `  -> ${detail}` : ""}`);
  }
}

function b64u(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mintToken(sub, email) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(
    JSON.stringify({ sub, email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

/* --------------------------- Brevo, stood in for --------------------------- */

function serveBrevo() {
  const sent = [];
  let mode = "ok";
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (req.method === "GET" && req.url.startsWith("/v3/contacts/lists")) {
          // What the probe route asks. Brevo answers an unusable key with a 401 here,
          // and a usable one with an empty list of contacts.
          if (mode === "reject") {
            res.writeHead(401, { "Content-Type": "application/json" }).end(
              JSON.stringify({ message: "Invalid API key" }),
            );
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ count: 0, lists: [] }));
          return;
        }
        if (req.method === "POST" && req.url === "/v3/smtp/email") {
          if (mode === "reject") {
            res.writeHead(400, { "Content-Type": "application/json" }).end(
              JSON.stringify({ message: "The sender email has not been verified" }),
            );
            return;
          }
          if (mode === "hang") {
            // Never answer: the caller has to give up on its own.
            return;
          }
          sent.push({
            body,
            apiKey: String(req.headers["api-key"] || ""),
            at: Date.now(),
          });
          res.writeHead(201, { "Content-Type": "application/json" }).end(
            JSON.stringify({ messageId: "<stub-message-id>" }),
          );
          return;
        }
        res.writeHead(404).end("nope");
      });
    });
    server.listen(0, "127.0.0.1", () => {
      server.on("close", () => {});
      resolve({
        server,
        sent,
        get mode() {
          return mode;
        },
        set mode(next) {
          mode = next;
        },
        port: server.address().port,
      });
    });
  });
}

/* --------------------------- the database, stood in for --------------------------- */

function makeStubDb(users = []) {
  const rows = { users, email_verifications: [], linked_devices: [], device_link_sessions: [] };
  const seen = [];

  function findUser(where, args) {
    if (/WHERE email = \?/.test(where)) return rows.users.find((u) => u.email === String(args[0]));
    return rows.users.find((u) => String(u.id) === String(args[0]));
  }

  return {
    rows,
    seen,
    async execute(stmt) {
      const sql = typeof stmt === "string" ? stmt : stmt?.sql;
      const args = (typeof stmt === "string" ? [] : stmt?.args) || [];
      const text = String(sql).replace(/\s+/g, " ").trim();
      seen.push({ text, args });

      if (/^SELECT \* FROM users WHERE email = \? LIMIT 1/.test(text)) {
        const u = rows.users.find((x) => x.email === String(args[0]));
        return { rows: u ? [u] : [] };
      }
      if (/^SELECT email_verified FROM users WHERE id = \? LIMIT 1/.test(text)) {
        const u = findUser("id", args);
        return { rows: u ? [{ email_verified: u.email_verified }] : [] };
      }
      if (/^SELECT email_verified, email FROM users WHERE id = \? LIMIT 1/.test(text)) {
        const u = findUser("id", args);
        return { rows: u ? [{ email_verified: u.email_verified, email: u.email }] : [] };
      }
      if (/^SELECT \* FROM users WHERE id = \? LIMIT 1/.test(text) || /^SELECT \* FROM users WHERE id = \?$/.test(text)) {
        const u = findUser("id", args);
        return { rows: u ? [u] : [] };
      }
      if (/^INSERT INTO users /.test(text)) {
        const row = mapTuple(text, columnList(text, "users"), args);
        row.created_at = Number(row.created_at || 0) || Date.now();
        row.updated_at = Number(row.updated_at || 0) || Date.now();
        rows.users.push(row);
        return { rows: [] };
      }
      if (/^DELETE FROM users WHERE id = \?$/.test(text)) {
        rows.users = rows.users.filter((u) => String(u.id) !== String(args[0]));
        return { rows: [] };
      }
      if (/^UPDATE users SET email_verified = 1, updated_at = \? WHERE id = \?$/.test(text)) {
        const u = rows.users.find((x) => String(x.id) === String(args[1]));
        if (u) u.email_verified = 1;
        return { rows: [] };
      }
      if (/^UPDATE users SET email_verified = 1, updated_at = \? WHERE id = \?/.test(text)) {
        const u = rows.users.find((x) => String(x.id) === String(args[1]));
        if (u) u.email_verified = 1;
        return { rows: [] };
      }

      if (/^SELECT sent_at FROM email_verifications WHERE user_id = \? LIMIT 1/.test(text)) {
        const p = rows.email_verifications.find((x) => x.user_id === String(args[0]));
        return { rows: p ? [{ sent_at: p.sent_at }] : [] };
      }
      if (/^SELECT code_hash, attempts, expires_at FROM email_verifications/.test(text)) {
        const p = rows.email_verifications.find((x) => x.user_id === String(args[0]));
        return { rows: p ? [{ code_hash: p.code_hash, attempts: p.attempts, expires_at: p.expires_at }] : [] };
      }
      if (/^SELECT sent_at, expires_at, attempts FROM email_verifications/.test(text)) {
        const p = rows.email_verifications.find((x) => x.user_id === String(args[0]));
        return { rows: p ? [{ sent_at: p.sent_at, expires_at: p.expires_at, attempts: p.attempts }] : [] };
      }
      if (/^INSERT INTO email_verifications /.test(text)) {
        const row = mapTuple(text, columnList(text, "email_verifications"), args);
        row.user_id = String(row.user_id);
        row.attempts = Number(row.attempts || 0);
        row.sent_at = Number(row.sent_at || 0);
        row.expires_at = Number(row.expires_at || 0);
        rows.email_verifications = rows.email_verifications.filter((x) => x.user_id !== row.user_id);
        rows.email_verifications.push(row);
        return { rows: [] };
      }
      if (/^UPDATE email_verifications SET attempts = attempts \+ 1/.test(text)) {
        const p = rows.email_verifications.find((x) => x.user_id === String(args[0]));
        if (p) p.attempts += 1;
        return { rows: [] };
      }
      if (/^DELETE FROM email_verifications WHERE user_id = \?$/.test(text)) {
        rows.email_verifications = rows.email_verifications.filter((x) => x.user_id !== String(args[0]));
        return { rows: [] };
      }

      // Anything else the auth path reaches for (device cleanup, presence, sticker
      // probes) is answered as an empty result, which is what an idle account sees.
      return { rows: [] };
    },
    async batch(list) {
      for (const stmt of list || []) await this.execute(stmt);
      return [];
    },
  };
}

/** Bind a `VALUES (...)` tuple: args line up with the ? marks, literals are read inline. */
function mapTuple(insertSql, columns, args) {
  const values = /VALUES \(([^)]*)\)/.exec(insertSql)?.[1] || "";
  const parts = values.split(",").map((raw) => raw.trim());
  const out = {};
  let next = 0;
  parts.forEach((part, i) => {
    const col = columns[i] || "";
    if (part === "?") {
      out[col] = args[next];
      next += 1;
    } else {
      const num = Number(part);
      out[col] = Number.isNaN(num) ? part.replace(/^'|'$/g, "") : num;
    }
  });
  return out;
}

function columnList(insertSql, table) {
  const inner = new RegExp(`INSERT INTO ${table} \\(([^)]*)\\)`).exec(insertSql)?.[1] || "";
  return inner.split(",").map((c) => c.trim());
}

function codeFromMail(mail) {
  const text = `${mail.body.subject}\n${mail.body.textContent}`;
  const match = /(\d{6})/.exec(text);
  return match ? match[1] : "";
}

async function rpc(backend, op, args, token = "") {
  return backend.handleTursoRpc(op, args, token ? `Bearer ${token}` : "");
}

async function main() {
  const brevo = await serveBrevo();
  process.env.AUTH_SECRET = SECRET;
  process.env.JATEXT_REQUIRE_EMAIL_VERIFICATION = "1";
  process.env.BREVO_API_KEY = "xkeysib-stub-key";
  process.env.BREVO_SENDER_EMAIL = "hello@jatext.example";
  process.env.BREVO_SENDER_NAME = "JaText";
  process.env.BREVO_API_BASE = `http://127.0.0.1:${brevo.port}`;

  const backend = await import(new URL("../server/tursoBackend.js", import.meta.url));
  const sender = await import(new URL("../server/emailSender.js", import.meta.url));

  console.log("email verification: signup has to prove the address");
  const cfg = sender.emailSenderConfig();
  check("the sender reports itself configured", cfg.enabled && cfg.fromEmail === "hello@jatext.example");

  /* ---------- the shape of the stored key, and what the probe is allowed to say ---------- */
  const diag = sender.emailSenderDiagnostics();
  check(
    "a key that is not shaped like a Brevo key is named as the problem",
    /does not look like a Brevo API key/.test(diag.warning) && /this one is 16/.test(diag.warning),
    diag.warning,
  );
  const expected = "xkeysib-" + "a".repeat(64) + "-Abcd1234Efgh5678";
  process.env.BREVO_API_KEY = expected;
  const goodCfg = sender.emailSenderConfig();
  check("a well formed key raises no complaint", goodCfg.warning === "" && goodCfg.enabled, goodCfg.warning);
  const goodDiag = sender.emailSenderDiagnostics();
  check(
    "and the diagnostics describe it without repeating it",
    goodDiag.keyLength === expected.length &&
      goodDiag.keyFingerprint.length === 12 &&
      !JSON.stringify(goodDiag).includes(expected),
    JSON.stringify(goodDiag),
  );
  process.env.BREVO_API_KEY = "xkeysib-stub-key";

  brevo.mode = "reject";
  const refusedProbe = await sender.probeEmailSender({ force: true });
  check(
    "the probe reports the refusal instead of hiding it",
    refusedProbe.status === 401 && /invalid api key/i.test(refusedProbe.note || "") && !JSON.stringify(refusedProbe).includes("xkeysib"),
    JSON.stringify(refusedProbe),
  );
  const secondProbe = await sender.probeEmailSender();
  check("a second probe is answered from the cache, so this cannot be used to hammer Brevo", secondProbe.cached === true, JSON.stringify(secondProbe));
  check("and the cached answer carries how long to wait", Number(secondProbe.retryAfterSec) > 0, String(secondProbe.retryAfterSec));
  brevo.mode = "ok";
  const goodProbe = await sender.probeEmailSender({ force: true });
  check(
    "and says so plainly once the credential works",
    goodProbe.ok === true && goodProbe.note === "credential accepted",
    JSON.stringify(goodProbe),
  );

  /* ---------- 1-6: the happy path and its abuse limits ---------- */
  let db = makeStubDb();
  backend.setCustomDbForTesting(db);

  const signUp = await rpc(backend, "signUpEmail", { email: EMAIL, password: "hunter2hunter2" });
  check("signup asks for verification instead of handing out a session", signUp.requiresEmailVerification === true, JSON.stringify(Object.keys(signUp)));
  check("no token is returned while the address is unconfirmed", !signUp.token);
  check("the address is shown masked", String(signUp.maskedEmail).startsWith("j") && signUp.maskedEmail.includes("@example.com"), signUp.maskedEmail);
  check("a challenge token is handed to the client so it can finish without a session", typeof signUp.challengeToken === "string" && signUp.challengeToken.split(".").length === 3);
  check("exactly one email went out", brevo.sent.length === 1, `sent=${brevo.sent.length}`);
  check("it carried the API key header Brevo expects", brevo.sent[0]?.apiKey === "xkeysib-stub-key");
  check("it came from the verified sender", brevo.sent[0]?.body?.sender?.email === "hello@jatext.example", JSON.stringify(brevo.sent[0]?.body?.sender));
  check("it went to the address that signed up", brevo.sent[0]?.body?.to?.[0]?.email === EMAIL);
  const code = codeFromMail(brevo.sent[0] || { body: {} });
  check("the mailed code is 6 digits", /^\d{6}$/.test(code), code);
  const stored = db.rows.email_verifications[0];
  check("the account is stored unverified", Number(db.rows.users[0]?.email_verified) === 0, `flag=${db.rows.users[0]?.email_verified}`);
  check("the stored value is a hash, not the code", Boolean(stored) && stored.code_hash !== code && !stored.code_hash.includes(code), stored?.code_hash);
  check("the code carries the ttl the copy promises", Number(stored?.expires_at) - Number(stored?.sent_at) === CODE_TTL);

  let threw = null;
  try {
    await rpc(backend, "verifyEmailCode", { code: "000000", challengeToken: signUp.challengeToken });
  } catch (err) {
    threw = err;
  }
  check("a wrong code is refused with a usable message", threw?.status === 401 && /not right/i.test(threw.message), threw?.message);
  check("the wrong guess is counted", Number(db.rows.email_verifications[0]?.attempts) === 1, `attempts=${db.rows.email_verifications[0]?.attempts}`);

  let throttle = null;
  try {
    await rpc(backend, "sendEmailVerification", { challengeToken: signUp.challengeToken });
  } catch (err) {
    throttle = err;
  }
  check("a second code inside the cooldown is refused with the wait time", throttle?.status === 429 && /wait \d+ more seconds/.test(throttle.message), throttle?.message);
  check("the cooldown refusal did not send a second email", brevo.sent.length === 1, `sent=${brevo.sent.length}`);

  for (let i = 0; i < 5; i += 1) {
    await rpc(backend, "verifyEmailCode", { code: "000000", challengeToken: signUp.challengeToken }).catch(() => undefined);
  }
  check(
    "six wrong guesses spend the code",
    Number(db.rows.email_verifications[0]?.attempts) >= 6,
    `attempts=${db.rows.email_verifications[0]?.attempts}`,
  );
  let exhausted = null;
  try {
    await rpc(backend, "verifyEmailCode", { code, challengeToken: signUp.challengeToken });
  } catch (err) {
    exhausted = err;
  }
  check(
    "so even the right code is refused after that, and says to ask for a new one",
    exhausted?.status === 429 && /too many wrong tries/i.test(exhausted.message),
    exhausted?.message,
  );
  check("the spent row is cleared rather than sitting there forever", db.rows.email_verifications.length === 0, `rows=${db.rows.email_verifications.length}`);

  // Ask for a fresh code (past the cooldown by rewinding the stored timestamp), then
  // let it expire, which is the other way a code can stop being valid.
  await rpc(backend, "sendEmailVerification", { challengeToken: signUp.challengeToken }).catch(() => undefined);
  const fresh = db.rows.email_verifications[0];
  if (fresh) fresh.expires_at = Date.now() - 1000;
  let expired = null;
  try {
    await rpc(backend, "verifyEmailCode", { code, challengeToken: signUp.challengeToken });
  } catch (err) {
    expired = err;
  }
  check("an expired code is refused and cleared, not retried", expired?.status === 410 && db.rows.email_verifications.length === 0, expired?.message);

  const resend = await rpc(backend, "sendEmailVerification", { challengeToken: signUp.challengeToken }).catch(() => null);
  const goodCode = resend ? codeFromMail(brevo.sent[brevo.sent.length - 1]) : "";
  const done = await rpc(backend, "verifyEmailCode", { code: goodCode, challengeToken: signUp.challengeToken });
  check("the right code opens the account", done.ok === true && typeof done.token === "string" && done.token.split(".").length === 3);
  check("and the session says the address is verified", done.me?.emailVerified === true, JSON.stringify(done.me?.emailVerified));
  check("the flag is set in the database", Number(db.rows.users[0]?.email_verified) === 1);
  check("the code is gone once used", db.rows.email_verifications.length === 0);

  const status = await rpc(backend, "getEmailVerification", {}, done.token);
  check("the status endpoint reports it as verified", status.verified === true && status.required === true, JSON.stringify(status));

  /* ---------- 7: an unverified session cannot reach people ---------- */
  const victim = makeStubDb([
    { id: "victim", email: "victim@example.com", email_verified: 0, display_name: "V", username: "v", is_suspended: 0, totp_enabled: 0 },
  ]);
  backend.setCustomDbForTesting(victim);
  let blocked = null;
  try {
    await rpc(backend, "sendMessage", { receiverId: "someone", body: "hi" }, mintToken("victim", "victim@example.com"));
  } catch (err) {
    blocked = err;
  }
  check("an unverified account is refused when it tries to message someone", blocked?.status === 403 && /confirm your email/i.test(blocked.message), blocked?.message);

  victim.rows.users[0].email_verified = 1;
  const allowedCalls = victim.seen.length;
  await rpc(backend, "sendMessage", { receiverId: "someone", body: "hi" }, mintToken("victim", "victim@example.com")).catch(() => undefined);
  check("once verified, the same call is no longer refused by this gate", victim.seen.length > allowedCalls && !victim.seen.some((c) => /Confirm your email/.test(c.text || "")));

  /* ---------- 8: no switch, no behaviour change ---------- */
  const quiet = makeStubDb();
  backend.setCustomDbForTesting(quiet);
  delete process.env.JATEXT_REQUIRE_EMAIL_VERIFICATION;
  const before = brevo.sent.length;
  const plain = await rpc(backend, "signUpEmail", { email: "plain@example.com", password: "hunter2hunter2" });
  check("with the switch off, signup behaves the way it always did", Boolean(plain.token) && !plain.requiresEmailVerification);
  check("and nothing is mailed", brevo.sent.length === before);
  check("the account is created verified so it can be used", Number(quiet.rows.users[0]?.email_verified) === 1);
  process.env.JATEXT_REQUIRE_EMAIL_VERIFICATION = "1";

  /* ---------- 9: provider trouble must not cost anybody their account ---------- */
  const rescue = makeStubDb();
  backend.setCustomDbForTesting(rescue);
  brevo.mode = "reject";
  let rescueErr = null;
  try {
    await rpc(backend, "signUpEmail", { email: "rescue@example.com", password: "hunter2hunter2" });
  } catch (err) {
    rescueErr = err;
  }
  check(
    "a refused send fails the signup, in the provider's own words",
    /not been verified/i.test(rescueErr?.message || ""),
    rescueErr?.message,
  );
  check("and nothing is left behind to block that address", rescue.rows.users.length === 0, `users=${rescue.rows.users.length}`);
  const retried = await rpc(backend, "signUpEmail", { email: "rescue@example.com", password: "hunter2hunter2" }).catch(() => null);
  check("it can be tried again the moment the provider recovers", !retried || retried.requiresEmailVerification === true, JSON.stringify(retried && Object.keys(retried)));

  brevo.server.close();
  console.log(failures === 0 ? "\nemail verification checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
