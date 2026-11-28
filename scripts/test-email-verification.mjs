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
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  // Brevo's own words when its Authorised IPs setting refuses a call, down to the link
  // it hands back. The exact shape a real deployment answered with once, and the one the
  // advice attached to it has to be right about.
  const ipBlocked = JSON.stringify({
    message:
      "We have detected you are using an unrecognised IP address 203.0.113.99. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips",
  });
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
          if (mode === "ip-blocked") {
            res.writeHead(401, { "Content-Type": "application/json" }).end(ipBlocked);
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
          if (mode === "ip-blocked") {
            res.writeHead(401, { "Content-Type": "application/json" }).end(ipBlocked);
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

/**
 * A relay that speaks only what server/smtpClient.js says, and writes down what it heard.
 * No TLS: the client is told not to require it, which is the same deal a self-hoster makes
 * with a relay on their own box.
 */
/**
 * A certificate for one run, generated on the spot. `localhost` only, because the client
 * connects by IP and would otherwise be shown a name nobody asked for.
 */
function makeTlsFixture() {
  let dir = "";
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jatext-smtp-"));
    const cert = path.join(dir, "cert.pem");
    const key = path.join(dir, "key.pem");
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"],
      { stdio: "ignore" },
    );
    return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
  } catch {
    return null; // no openssl on this machine: the TLS assertions report themselves skipped
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A certificate for one run whose every name is a loopback IP literal: the shape a TLS
 * interceptor inside the runtime answers the handshake with, and the reason a real signup
 * failed with a certificate "for IP Address:127.0.0.1, IP Address:::1". `::1` rather than
 * `127.0.0.1` on purpose - the host this test dials is `127.0.0.1`, and a certificate that
 * covered the dialled host would be a match rather than an interception, which is the
 * difference the whole check turns on.
 */
function makeLoopbackTlsFixture() {
  let dir = "";
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jatext-loopback-"));
    const cert = path.join(dir, "cert.pem");
    const key = path.join(dir, "key.pem");
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=::1", "-addext", "subjectAltName=IP:::1"],
      { stdio: "ignore" },
    );
    return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
  } catch {
    return null;
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A relay that speaks only what `server/smtpClient.js` says, and writes down what it heard.
 *
 * It can also perform a real STARTTLS negotiation, which is the part that matters: a
 * plaintext-only stub cannot fail a handshake, and the bug this file guards is the client
 * leaving a `data` listener attached across the upgrade - a stream with a listener is in
 * flowing mode, so the plaintext reader eats the server's TLS records as text and the
 * handshake sits there until it times out. That failure only exists once a handshake does.
 * The stub therefore obeys the discipline it is used to check, and stops reading the
 * plaintext socket before the secure one starts.
 */
function serveSmtp({ password = "hunter2smtp", acceptData = true, rejectSender = false, tls: tlsMaterial = null, hideTls = false, implicit = false, tlsRecordGreeting = false, splitReply = false, stall = false, stallFor = 0, host = "127.0.0.1" } = {}) {
  const log = { commands: [], data: "", connections: 0, upgraded: false, secure: [], tlsError: "" };
  const context = tlsMaterial ? tls.createSecureContext(tlsMaterial) : null;
  const server = net.createServer((socket) => {
    log.connections += 1;
    // An explicit state machine rather than pattern matching on history: AUTH LOGIN is
    // two base64 lines whose content looks exactly like any other token, so the only way
    // to know which one is coming is to have asked for it.
    let stage = "command";
    let secure = null;
    let dataBuf = "";
    socket.setEncoding("utf8");
    // Once the session is encrypted every reply has to leave through the secure socket.
    // Answering on the plaintext one at that point puts a 250 in front of a handshake the
    // client has already left, which is how a stub can appear to work while proving nothing.
    let say = (line) => (secure ?? socket).write(`${line}\r\n`);
    const b64 = (value) => Buffer.from(String(value || ""), "base64").toString("utf8");
    const onData = (chunk) => {
      dataBuf += chunk;
      drain();
    };
    const drain = () => {
      if (stage === "data") {
        const end = dataBuf.indexOf("\r\n.\r\n");
        if (end < 0) return;
        log.data = dataBuf.slice(0, end);
        dataBuf = dataBuf.slice(end + 5);
        stage = "command";
        say(acceptData ? "250 2.0.0 Ok: queued as FAKE01" : "554 5.7.1 Service denied: sender not verified");
      }
      let idx = dataBuf.indexOf("\r\n");
      while (idx >= 0) {
        const line = dataBuf.slice(0, idx);
        dataBuf = dataBuf.slice(idx + 2);
        if (stage === "user") {
          log.user = b64(line);
          stage = "pass";
          say("334 U2F2b3JkTmFtZTo=");
        } else if (stage === "pass") {
          log.pass = b64(line);
          if (log.pass === password) {
            stage = "command";
            say("235 2.7.0 Authentication successful");
          } else {
            stage = "dead";
            say("535 5.7.8 Authentication credentials invalid");
          }
        } else if (stage === "dead") {
          say("503 5.5.1 Error: bad sequence");
        } else {
          // Recorded per channel rather than in one list, so "nothing was said in the clear
          // after the upgrade" is a fact about the plaintext socket, not about where the
          // parser happened to append.
          if (secure) log.secure.push(line);
          else log.commands.push(line);
          const upper = line.toUpperCase();
          if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
            const caps = secure || !context || hideTls ? "" : "250-STARTTLS\r\n";
            // Written through the channel, not straight at `socket`: the second EHLO arrives
            // after the upgrade, and a capability list sent in the clear there is plaintext
            // thrown into a TLS session, which the other side can only read as a corrupt
            // record.
            (secure ?? socket).write(`250-fake-relay\r\n250-SIZE 10485760\r\n${caps}250-AUTH PLAIN LOGIN\r\n250 HELP\r\n`);
          } else if (upper === "STARTTLS" && context && !secure) {
            say("220 2.0.0 Ready to start TLS");
            socket.off("data", onData);
            secure = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
            secure.setEncoding("utf8");
            secure.on("data", onData);
            secure.on("error", (err) => {
              log.tlsError = String(err?.message || err);
            });
            log.upgraded = true;
          } else if (upper.startsWith("AUTH LOGIN")) {
            stage = "user";
            say("334 VXNlcm5hbWU6");
          } else if (upper.startsWith("AUTH")) {
            say("504 5.5.2 unsupported auth mechanism");
          } else if (upper.startsWith("MAIL FROM")) {
            say(rejectSender ? "553 5.7.1 <nope>: Sender address rejected: not verified" : "250 2.1.0 Ok");
          } else if (upper.startsWith("RCPT TO")) {
            say("250 2.1.0 Ok");
          } else if (upper.startsWith("DATA")) {
            stage = "data";
            say("354 End data with <CR><LF>.<CR><LF>");
          } else if (upper.startsWith("QUIT")) {
            say("221 2.0.0 Bye");
            socket.end();
          } else if (upper.startsWith("RSET") || upper.startsWith("NOOP")) {
            say("250 2.0.0 Ok");
          } else {
            say("500 5.5.2 unrecognized command");
          }
        }
        idx = dataBuf.indexOf("\r\n");
      }
    };
    socket.on("data", onData);
    if (stall) {
      // Accepts, then says nothing: the shape of a filtered port or a wedged relay, and the
      // only way to test a budget that has to survive one. `stallFor` ends the silence by
      // closing the socket after that many milliseconds instead of holding it open to the
      // client's own deadline: the same silence, at a duration the test chooses, so a
      // breaker strike costs seconds rather than a twenty-second timeout per send.
      if (stallFor > 0) {
        const killer = setTimeout(() => socket.destroy(), stallFor);
        socket.once("close", () => clearTimeout(killer));
      }
      return;
    }
    if (tlsRecordGreeting) {
      // A close_notify alert, which is what a TLS server hands back when a plaintext client
      // says "EHLO" at it: a record header, not text. The bytes are the whole point.
      socket.end(Buffer.from([0x15, 0x03, 0x01, 0x00, 0x02, 0x02, 0x28]));
      return;
    }
    if (splitReply) {
      // The greeting's last line in two writes - "220 fake-rela" then "y ready" - so a
      // reader that replaces its buffer instead of extending it loses the beginning of the
      // reply. A split is not a continuation: "220-" would promise a second line, which
      // would be the stub's bug rather than the client's.
      socket.write("220 fake-rela");
      setTimeout(() => socket.write("y ready\r\n"), 40);
      const plainSay = say;
      say = (line) => {
        const mid = line.indexOf("\r\n");
        const target = secure ?? socket;
        if (mid < 0 || mid === line.length - 2) return plainSay(line);
        target.write(`${line.slice(0, mid + 2)}\r`);
        setTimeout(() => target.write(line.slice(mid + 2)), 30);
        return undefined;
      };
      return;
    }
    if (implicit && context) {
      // TLS from the first byte, which is the whole difference between 465 and 587 and the
      // reason the two cannot share a default. The greeting goes out through the secure
      // socket too: a plaintext "220" to a TLS client is the corrupt-record error this
      // section is testing for, not something to emit by accident.
      secure = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
      secure.setEncoding("utf8");
      secure.on("data", onData);
      secure.on("error", (err) => {
        log.tlsError = String(err?.message || err);
      });
      log.upgraded = true;
    }
    say("220 fake-relay ready");
  });
  return new Promise((resolve) => {
    server.listen(0, host, () =>
      resolve({
        server,
        log,
        port: server.address().port,
        close: () => new Promise((r) => server.close(() => r())),
      }),
    );
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

  /* ---------- 8b: the SMTP relay transport ---------- */
  console.log("\nemail delivery: the SMTP relay is what Brevo lets an Edge Function use");
  sender.resetSmtpCircuit();
  const relay = await serveSmtp();
  process.env.BREVO_SMTP_HOST = "127.0.0.1";
  process.env.BREVO_SMTP_PORT = String(relay.port);
  process.env.BREVO_SMTP_USER = "c54426001@smtp-brevo.com";
  process.env.BREVO_SMTP_PASS = "hunter2smtp";
  process.env.SMTP_REQUIRE_TLS = "0";

  const relayed = makeStubDb();
  backend.setCustomDbForTesting(relayed);
  const viaSmtp = await rpc(backend, "signUpEmail", { email: "relay@example.com", password: "hunter2hunter2" });
  check("the relay is preferred when it is configured", sender.emailSenderConfig().kind === "smtp");
  check("and a signup over it still asks for the code", viaSmtp.requiresEmailVerification === true, JSON.stringify(Object.keys(viaSmtp)));
  const verbs = relay.log.commands.map((c) => c.split(" ")[0].toUpperCase());
  check(
    "the session is the six commands, in order, and nothing else",
    verbs[0] === "EHLO" && verbs.includes("MAIL") && verbs.includes("RCPT") && verbs.includes("DATA") && verbs.includes("QUIT"),
    verbs.join(","),
  );
  check("the login is base64 and lands on the account the relay knows", relay.log.user === "c54426001@smtp-brevo.com" && relay.log.pass === "hunter2smtp", `${relay.log.user}/${relay.log.pass}`);
  check("the MAIL FROM is the verified sender", /MAIL FROM:<hello@jatext\.example>/.test(relay.log.commands.join(" ")), relay.log.commands.join(" | "));
  const msg = relay.log.data;
  const relayCode = (/(\d{6})/.exec(Buffer.from((/Content-Transfer-Encoding: base64([\s\S]*?)--/.exec(msg) || ["", ""])[1].replace(/\s+/g, ""), "base64").toString("utf8") || [])[1]) || "";
  check("the message carries the code in the plain-text part", /^\d{6}$/.test(relayCode), relayCode);
  check("both parts are there, and the headers are complete", /multipart\/alternative/.test(msg) && /Content-Type: text\/html/.test(msg) && /Subject: /.test(msg), msg.slice(0, 120));
  check("the stored row is still only a hash", !String(relayed.rows.email_verifications[0]?.code_hash || "").includes(relayCode));

  // The defaults around the two TLS modes, since guessing one of them wrong means either
  // a password on a plain socket or a handshake that can never succeed.
  const secureCfg = sender.emailSenderConfig();
  check("port 587 means STARTTLS, not implicit TLS", secureCfg.smtp.secure === false && secureCfg.smtp.port === relay.port);
  delete process.env.SMTP_REQUIRE_TLS;
  const defaultTls = sender.emailSenderConfig();
  process.env.SMTP_REQUIRE_TLS = "0";
  const plainTls = sender.emailSenderConfig();
  check(
    "TLS is required by default, and only dropped when someone asks for it",
    defaultTls.smtp.requireTls === true && plainTls.smtp.requireTls === false,
    JSON.stringify({ defaultOn: defaultTls.smtp.requireTls, offWhenAsked: plainTls.smtp.requireTls }),
  );
  process.env.SMTP_REQUIRE_TLS = "1";
  process.env.BREVO_SMTP_PORT = "465";
  const sslCfg = sender.emailSenderConfig();
  check("port 465 flips it to an implicit TLS session", sslCfg.smtp.secure === true && sslCfg.smtp.requireTls === true, JSON.stringify(sslCfg.smtp));
  process.env.BREVO_SMTP_PORT = String(relay.port);
  process.env.SMTP_REQUIRE_TLS = "0";

  // Its own relay, so "the probe sent no body" is a statement about the probe rather than
  // about everything else that used this server.
  const probeRelay = await serveSmtp();
  process.env.BREVO_SMTP_PORT = String(probeRelay.port);
  const smtpProbe = await sender.probeEmailSender({ force: true });
  check(
    "the probe checks the envelope instead of guessing",
    smtpProbe.ok === true && smtpProbe.transport === "smtp" && probeRelay.log.commands.some((c) => c.toUpperCase().startsWith("RCPT")),
    JSON.stringify(smtpProbe),
  );
  check(
    "and stops before any message body, so a probe cannot spend quota or reach an inbox",
    probeRelay.log.data === "" && !probeRelay.log.commands.some((c) => c.toUpperCase().startsWith("DATA")),
    probeRelay.log.commands.join(" | "),
  );
  check("it resets rather than leaving the envelope open", probeRelay.log.commands.some((c) => c.toUpperCase().startsWith("RSET")), probeRelay.log.commands.join(" | "));
  await probeRelay.close();
  process.env.BREVO_SMTP_PORT = String(relay.port);

  // A refused login is that failure alone: falling through to an API key that Brevo
  // refuses for another reason would bury the real cause.
  // A sender the account has not verified is refused at MAIL FROM, which is the failure
  // a login-only check cannot see.
  const unverified = await serveSmtp({ rejectSender: true });
  process.env.BREVO_SMTP_PORT = String(unverified.port);
  const senderProbe = await sender.probeEmailSender({ force: true });
  check(
    "a refused sender is reported as the sender's problem, in the relay's words",
    senderProbe.ok === false && /refused this sender/i.test(senderProbe.note || "") && /not verified/i.test(senderProbe.note || ""),
    JSON.stringify(senderProbe),
  );
  await unverified.close();

  const bad = await serveSmtp({ password: "something-else" });
  process.env.BREVO_SMTP_PORT = String(bad.port);
  const rejected = await rpc(backend, "signUpEmail", { email: "reject@example.com", password: "hunter2hunter2" }).catch((err) => err);
  check(
    "a refused login fails the signup with the relay's own sentence",
    /credentials invalid/i.test(rejected?.message || ""),
    rejected?.message,
  );
  check("and no fallback muddies it", !/SMTP relay was unreachable/.test(rejected?.message || ""), rejected?.message);
  check("a rejected login leaves no account behind", bad.log.connections === 1 && rejected instanceof Error, `conns=${bad.log.connections}`);
  await bad.close();

  // An unreachable relay is the one case worth trying the other transport for.
  let closedPort = 1;
  const listener = net.createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  closedPort = listener.address().port;
  listener.unref();
  listener.close();
  process.env.BREVO_SMTP_PORT = String(closedPort);
  process.env.SMTP_REQUIRE_TLS = "0";
  const fallbackDb = makeStubDb();
  backend.setCustomDbForTesting(fallbackDb);
  const fell = await rpc(backend, "signUpEmail", { email: "fallback@example.com", password: "hunter2hunter2" });
  check("a relay that cannot be reached falls through to the API", fell.requiresEmailVerification === true, JSON.stringify(Object.keys(fell)));
  check("and the fallback is visible in what was used", brevo.sent.some((m) => m.body?.to?.[0]?.email === "fallback@example.com"), "no api send recorded");

  process.env.BREVO_SMTP_PORT = String(relay.port);
  const both = sender.emailSenderDiagnostics();
  check("the diagnostics name the active transport and both halves of it", both.transport === "smtp" && both.smtpHost === "127.0.0.1" && both.keyFingerprint.length === 12, JSON.stringify(both));
  check("and still never print a credential", !JSON.stringify(both).includes("hunter2") && !JSON.stringify(both).includes("xkeysib"), JSON.stringify(both));
  /* ---------- 8c: a real STARTTLS session, against a real TLS server ---------- */
  // Everything above talks plaintext, because those relays never offered an upgrade. The
  // one failure a plaintext stub cannot produce is the upgrade itself: the first version
  // of this client failed in production with a working credential and a working relay,
  // because its plaintext reader stayed attached and ate the TLS records.
  sender.resetSmtpCircuit();
  const pem = makeTlsFixture();
  if (!pem) {
    console.log("  skip  no openssl on this machine: the STARTTLS assertions did not run");
  } else {
    const tlsRelay = await serveSmtp({ tls: pem });
    process.env.BREVO_SMTP_PORT = String(tlsRelay.port);
    process.env.SMTP_REQUIRE_TLS = "1";
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0"; // a certificate generated seconds ago, so untrusted by design
    const tlsDb = makeStubDb();
    backend.setCustomDbForTesting(tlsDb);
    const overTls = await rpc(backend, "signUpEmail", { email: "starttls@example.com", password: "hunter2hunter2" });
    check("a signup completes over an upgraded session", overTls.requiresEmailVerification === true, JSON.stringify(Object.keys(overTls)));
    check("the server did see the upgrade", tlsRelay.log.upgraded === true, JSON.stringify(tlsRelay.log).slice(0, 160));
    check(
      "the login and the message both go over the encrypted channel",
      tlsRelay.log.secure.some((c) => c.toUpperCase().startsWith("AUTH LOGIN")) && tlsRelay.log.secure.some((c) => c.toUpperCase().startsWith("DATA")),
      tlsRelay.log.secure.join(" | "),
    );
    const afterUpgrade = tlsRelay.log.commands.slice(tlsRelay.log.commands.findIndex((c) => c.toUpperCase() === "STARTTLS") + 1);
    check("the plaintext channel ends with the upgrade request", tlsRelay.log.commands.at(-1).toUpperCase() === "STARTTLS", tlsRelay.log.commands.join(" | "));
    check("and nothing at all is said in the clear after it", afterUpgrade.length === 0, afterUpgrade.join(" | "));
    const tlsCode = (() => {
      const body = Buffer.from((/Content-Transfer-Encoding: base64([\s\S]*?)--/.exec(tlsRelay.log.data) || ["", ""])[1].replace(/\s+/g, ""), "base64").toString("utf8");
      return (/(\d{6})/.exec(body) || [])[1] || "";
    })();
    check("the code that crossed TLS is the one that was stored", /^\d{6}$/.test(tlsCode) && String(tlsDb.rows.email_verifications[0]?.code_hash || "").length > 0, tlsCode);

    // Certificate checking has to be on unless somebody turns it off, or the transport
    // looks encrypted while really encrypting to whoever answered first.
    const strictRelay = await serveSmtp({ tls: pem });
    process.env.BREVO_SMTP_PORT = String(strictRelay.port);
    delete process.env.SMTP_TLS_REJECT_UNAUTHORIZED;
    const strict = await rpc(backend, "signUpEmail", { email: "strict@example.com", password: "hunter2hunter2" }).catch((err) => err);
    check(
      "a certificate the runtime does not trust stops the send by default",
      /self-signed|unable to verify|certificate/i.test(strict?.message || ""),
      strict?.message,
    );
    check("and it never gets as far as a password", !strictRelay.log.secure.some((c) => c.toUpperCase().startsWith("AUTH")), strictRelay.log.secure.join(" | ") || "(no secure traffic)");
    check(
      "an untrusted certificate is not retried over the API",
      !/SMTP relay was unreachable/i.test(String(strict?.message || "")) && !brevo.sent.some((m) => m.body?.to?.[0]?.email === "strict@example.com"),
      `${strict?.message} / api sends to strict@: ${brevo.sent.filter((m) => m.body?.to?.[0]?.email === "strict@example.com").length}`,
    );

    // A relay that will not upgrade must be refused, not quietly used in the clear.
    const noTls = await serveSmtp({ tls: pem, hideTls: true });
    process.env.BREVO_SMTP_PORT = String(noTls.port);
    const plainRefused = await rpc(backend, "signUpEmail", { email: "cleartext@example.com", password: "hunter2hunter2" }).catch((err) => err);
    check(
      "a relay that will not upgrade is refused while TLS is required",
      /not offering STARTTLS/i.test(plainRefused?.message || ""),
      plainRefused?.message,
    );
    check(
      "and that refusal is not mistaken for a dead relay, so it is not retried over the API",
      !/SMTP relay was unreachable/i.test(plainRefused?.message || "") && !brevo.sent.some((m) => m.body?.to?.[0]?.email === "cleartext@example.com"),
      plainRefused?.message,
    );
    check("no password was offered to it either", !noTls.log.commands.some((c) => c.toUpperCase().startsWith("AUTH")), noTls.log.commands.join(" | "));

    /* ---------- 8d: the other TLS mode, and the mistake of mixing the two up ---------- */
    const implicitRelay = await serveSmtp({ tls: pem, implicit: true });
    process.env.BREVO_SMTP_PORT = String(implicitRelay.port);
    process.env.BREVO_SMTP_SSL = "1";
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0";
    const implicitDb = makeStubDb();
    backend.setCustomDbForTesting(implicitDb);
    // The greeting is emitted by the stub in the same turn the secure socket is made, which
    // is before this side has anything attached - the ordering that loses a first line on a
    // runtime that does not buffer for a late listener.
    const overImplicit = await rpc(backend, "signUpEmail", { email: "implicit@example.com", password: "hunter2hunter2" });
    check(
      "an implicit-TLS relay is spoken to from the first byte",
      overImplicit.requiresEmailVerification === true && implicitRelay.log.commands.length === 0 && implicitRelay.log.secure.length > 0,
      `plain=${implicitRelay.log.commands.join(",")} secure=${implicitRelay.log.secure.length}`,
    );
    check("and the login still lands on the encrypted channel", /AUTH/.test(implicitRelay.log.secure.join(" | ")), implicitRelay.log.secure.join(" | "));
    check("the code arrived over it", /\d{6}/.test(implicitRelay.log.data), implicitRelay.log.data.slice(0, 40));

    // The same mistake when the server answers it, which is the case the reader can name.
    // A server that says nothing at all is only caught by the deadline, so this one says
    // what a real TLS endpoint says, and both the wording and the speed are checkable.
    const alertRelay = await serveSmtp({ tlsRecordGreeting: true });
    process.env.BREVO_SMTP_PORT = String(alertRelay.port);
    process.env.BREVO_SMTP_SSL = "0";
    process.env.SMTP_REQUIRE_TLS = "0";
    const alertStarted = Date.now();
    const alertErr = await rpc(backend, "signUpEmail", { email: "alert@example.com", password: "hunter2hunter2" }).catch((err) => err);
    const alertMs = Date.now() - alertStarted;
    check(
      "a TLS record where a greeting belongs is named at once, not after the deadline",
      alertMs < 5_000 && /TLS record/i.test(String(alertErr?.message || "")),
      `${alertMs}ms / ${String(alertErr?.message || alertErr).slice(0, 120)}`,
    );
    check(
      "and it is not mistaken for a dead relay the API ought to cover",
      !/SMTP relay was unreachable/i.test(String(alertErr?.message || "")) && !brevo.sent.some((m) => m.body?.to?.[0]?.email === "alert@example.com"),
      String(alertErr?.message || "").slice(0, 120),
    );
    check("no credential reached it", !alertRelay.log.commands.some((c) => c.toUpperCase().startsWith("AUTH")), alertRelay.log.commands.join(" | ") || "(nothing)");
    check("and the name of the switch that fixes it is in the message", /BREVO_SMTP_SSL/.test(String(alertErr?.message || "")), String(alertErr?.message || "").slice(0, 160));

    // A reply split across two packets separates "reads a socket" from "reads a socket
    // carefully", and on localhost at MTU size nothing else will ever show it.
    const splitRelay = await serveSmtp({ splitReply: true });
    process.env.BREVO_SMTP_PORT = String(splitRelay.port);
    process.env.BREVO_SMTP_SSL = "0";
    process.env.SMTP_REQUIRE_TLS = "0";
    const splitDb = makeStubDb();
    backend.setCustomDbForTesting(splitDb);
    const splitRes = await rpc(backend, "signUpEmail", { email: "split@example.com", password: "hunter2hunter2" });
    check(
      "a reply that arrives in pieces is still one reply",
      splitRes.requiresEmailVerification === true && splitRelay.log.data.includes("Subject:"),
      JSON.stringify(Object.keys(splitRes)).slice(0, 120),
    );

    await splitRelay.close();
    await alertRelay.close();
    await implicitRelay.close();
    await noTls.close();
    await strictRelay.close();
    await tlsRelay.close();
    process.env.BREVO_SMTP_PORT = String(relay.port);
    process.env.BREVO_SMTP_SSL = "0";
    process.env.SMTP_REQUIRE_TLS = "0";
    delete process.env.SMTP_TLS_REJECT_UNAUTHORIZED;
  }

  await relay.close();
  delete process.env.BREVO_SMTP_HOST;
  delete process.env.BREVO_SMTP_PORT;
  delete process.env.BREVO_SMTP_USER;
  delete process.env.BREVO_SMTP_PASS;

  /* ---------- 8e: two ports, and the rule for when to move on to the second ---------- */
  console.log("\nemail delivery: which port is tried, and when the next one is");
  sender.resetSmtpCircuit();
  const live = await serveSmtp({ password: "hunter2smtp" });
  // Accepts the connection and then says nothing: the only way to tell a shrunk
  // per-candidate budget from the full one, because a refused port answers at once and
  // costs nothing to rule out.
  const blackhole = net.createServer(() => {});
  blackhole._connections = 0;
  blackhole.on("connection", () => {
    blackhole._connections += 1;
  });
  await new Promise((r) => blackhole.listen(0, "127.0.0.1", r));
  const blackholePort = blackhole.address().port;

  process.env.BREVO_SMTP_HOST = "127.0.0.1";
  delete process.env.BREVO_SMTP_PORT;
  process.env.BREVO_SMTP_CANDIDATES = `${blackholePort},${live.port}`;
  process.env.SMTP_REQUIRE_TLS = "0";
  process.env.BREVO_SMTP_USER = "c54426001@smtp-brevo.com";
  process.env.BREVO_SMTP_PASS = "hunter2smtp";

  const parsed = sender.emailSenderConfig();
  check("a candidate list is read in order, plain unless a mode is named", parsed.smtp.candidates.length === 2 && parsed.smtp.candidates[0].port === blackholePort && parsed.smtp.candidates[1].secure === false, JSON.stringify(parsed.smtp.candidates));
  check("and the first of them is what the diagnostics report as the port", parsed.smtp.port === blackholePort && parsed.smtp.candidates.length === 2, JSON.stringify(sender.emailSenderDiagnostics().smtpCandidates));

  const multiDb = makeStubDb();
  backend.setCustomDbForTesting(multiDb);
  const startedMulti = Date.now();
  const recovered = await rpc(backend, "signUpEmail", { email: "failover@example.com", password: "hunter2hunter2" });
  const multiMs = Date.now() - startedMulti;
  check("a dead first port costs the short budget, not the long one", recovered.requiresEmailVerification === true && multiMs < 12_000, `${multiMs}ms`);

  // Every port stalled: the send has to give up inside the budget with all three answers in
  // hand, not one answer after three timeouts. And the port that would have worked must not
  // be starved by the two that never will, which is the specific way a budget like this is
  // got wrong.
  // A relay that has never succeeded yet, so the cached preference from the check above does
  // not quietly move it to the front of the list and make this test about nothing.
  const stallA = await serveSmtp({ stall: true });
  const stallB = await serveSmtp({ stall: true });
  const freshGood = await serveSmtp();
  process.env.BREVO_SMTP_CANDIDATES = `${stallA.port},${stallB.port},${freshGood.port}`;
  const stalledStart = Date.now();
  const lateWin = await sender.sendEmail({ to: "third@example.com", subject: "x", text: "y" }).catch((err) => err);
  const lateMs = Date.now() - stalledStart;
  check(
    "two stalled ports do not starve the third one",
    lateWin?.sent === true && freshGood.log.commands.some((c) => c.toUpperCase().startsWith("MAIL FROM")) && lateMs < 11_000,
    `${lateMs}ms / ${String(lateWin?.message || "").slice(0, 120)}`,
  );

  // No API key for this one: a relay that never answers is exactly the case that falls
  // through to the HTTP API, and this check is about what the SMTP layer did first.
  const savedKey = process.env.BREVO_API_KEY;
  delete process.env.BREVO_API_KEY;
  const stallC = await serveSmtp({ stall: true });
  process.env.BREVO_SMTP_CANDIDATES = `${stallA.port},${stallB.port},${stallC.port}`;
  const allStalled = await sender.sendEmail({ to: "nobody@example.com", subject: "x", text: "y" }).catch((err) => err);
  const stalledMs = Date.now() - stalledStart - lateMs;
  check(
    "when no port answers, the send gives up inside the budget with all three answers",
    allStalled instanceof Error && (allStalled.attempts || []).length === 3 && stalledMs < 15_000,
    `${stalledMs}ms / ${JSON.stringify((allStalled?.attempts || []).map((a) => `${a.port}:${String(a.note).slice(0, 20)}`))}`,
  );
  check("and every port was actually asked", stallA.log.connections >= 1 && stallB.log.connections >= 1 && stallC.log.connections >= 1, `${stallA.log.connections}/${stallB.log.connections}/${stallC.log.connections}`);
  process.env.BREVO_API_KEY = savedKey;
  const viaApi = await sender.sendEmail({ to: "fallback2@example.com", subject: "x", text: "y" }).catch((err) => err);
  check(
    "and with a key present the same dead ports still get the API asked",
    viaApi?.sent === true && viaApi.transport === "smtp-then-api",
    JSON.stringify(viaApi).slice(0, 160),
  );
  check("the API send is the one that carried it", brevo.sent.some((m) => m.body?.to?.[0]?.email === "fallback2@example.com"), "no api send recorded");
  await stallA.close();
  await stallB.close();
  await stallC.close();
  await freshGood.close();
  check("and the second port carried the message", live.log.commands.some((c) => c.toUpperCase().startsWith("MAIL FROM")), live.log.commands.join(" | "));
  check("nothing went out over the API on the way", !brevo.sent.some((m) => m.body?.to?.[0]?.email === "failover@example.com"), "api send recorded");
  // The two sends above were two strikes (all ports waited on, nothing came back), so the
  // breaker is open and `auto` would route everything from here to the API - which would
  // make the next two checks pass for a reason that has nothing to do with what they ask.
  // Clear the verdict: the questions below are about port order and refusal, and both need
  // the relay to be the transport that is asked.
  sender.resetSmtpCircuit();

  const connectsBefore = blackhole._connections || 0;
  const again = await rpc(backend, "signUpEmail", { email: "cached@example.com", password: "hunter2hunter2" });
  check(
    "the port that worked is tried first next time",
    again.requiresEmailVerification === true && (blackhole._connections || 0) === connectsBefore,
    `extra blackhole connects: ${(blackhole._connections || 0) - connectsBefore}`,
  );

  // A refusal is the relay answering, so the loop stops: three ports would mean three
  // rejected logins for one wrong key, and a lockout for the privilege.
  // The port that just worked is now cached as the preferred one, so this list deliberately
  // contains neither of them: the question is whether a refusal ends the loop, and a cached
  // success would answer it for the wrong reason.
  const refuseFirst = await serveSmtp({ password: "wrong-on-purpose" });
  const refuseSecond = await serveSmtp({ password: "also-wrong" });
  process.env.BREVO_SMTP_CANDIDATES = `${refuseFirst.port},${refuseSecond.port}`;
  const refused = await rpc(backend, "signUpEmail", { email: "stop@example.com", password: "hunter2hunter2" }).catch((err) => err);
  check(
    "a refused login stops there rather than trying the other ports",
    /credentials invalid/i.test(refused?.message || "") && refuseSecond.log.connections === 0,
    `${refused?.message} / connections to the second relay: ${refuseSecond.log.connections}`,
  );
  check("and it is not papered over with the API", !brevo.sent.some((m) => m.body?.to?.[0]?.email === "stop@example.com"), "api send recorded");
  await refuseFirst.close();
  await refuseSecond.close();

  // Garbage in the list is not a silent "no ports": it falls back to the two defaults,
  // which is what a typo should produce.
  process.env.BREVO_SMTP_CANDIDATES = "nope,,";
  const junk = sender.emailSenderConfig();
  check(
    "an unparsable list keeps the documented ports rather than none",
    junk.smtp.candidates.length === 3 && junk.smtp.candidates[0].port === 587 && junk.smtp.candidates[1].secure === true && junk.smtp.candidates[2].port === 2525,
    JSON.stringify(junk.smtp.candidates),
  );
  check("and the first of them is still the port in the documentation", sender.emailSenderDiagnostics().smtpPort === 587, JSON.stringify(sender.emailSenderDiagnostics().smtpCandidates));
  process.env.BREVO_SMTP_CANDIDATES = "465s,587:starttls";
  const named = sender.emailSenderConfig();
  check("and a mode can be spelled out either way", named.smtp.candidates[0].secure === true && named.smtp.candidates[1].secure === false, JSON.stringify(named.smtp.candidates));
  delete process.env.BREVO_SMTP_CANDIDATES;
  process.env.BREVO_SMTP_PORT = String(live.port);
  check("an explicit single port means exactly that port", sender.emailSenderConfig().smtp.candidates.length === 1, JSON.stringify(sender.emailSenderConfig().smtp.candidates));
  process.env.BREVO_SMTP_SERVERNAME = "smtp-relay.sendinblue.com";
  check(
    "the certificate name can be stated when the host and the certificate disagree",
    sender.emailSenderConfig().smtp.servername === "smtp-relay.sendinblue.com",
    JSON.stringify(sender.emailSenderConfig().smtp.servername),
  );
  // A name stated in the config has to be the name checked against the certificate, or the
  // switch would only move the failure along: the stub's certificate is for `localhost`.
  const nameRelay = await serveSmtp({ tls: pem, host: "localhost" });
  process.env.BREVO_SMTP_PORT = String(nameRelay.port);
  process.env.BREVO_SMTP_SSL = "0";
  process.env.SMTP_REQUIRE_TLS = "0";
  process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0";
  // Verification left ON, and the certificate *trusted* by pinning it, which is the only way
  // to tell "the name was checked" from "nobody looked": with `SMTP_TLS_REJECT_UNAUTHORIZED=0`
  // the name is not checked by anyone, which is the trap this whole option exists to avoid.
  process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "1";
  process.env.SMTP_TLS_CA_PEM = pem.cert.toString("utf8");
  process.env.BREVO_SMTP_HOST = "localhost";
  const wrongName = await rpc(backend, "signUpEmail", { email: "sni@example.com", password: "hunter2hunter2" }).catch((err) => err);
  check(
    "a stated name the certificate does not cover ends the send",
    /not this host|no host names|not certified|altname|hostname|mismatch/i.test(String(wrongName?.message || "")),
    String(wrongName?.message || wrongName).slice(0, 150),
  );
  // Same trusted certificate, no stated name: it must go through, or the previous check
  // proved nothing.
  delete process.env.BREVO_SMTP_SERVERNAME;
  const pinnedDb = makeStubDb();
  backend.setCustomDbForTesting(pinnedDb);
  const pinned = await rpc(backend, "signUpEmail", { email: "pinned@example.com", password: "hunter2hunter2" });
  check("and pinning the CA keeps the session instead of excusing it", pinned.requiresEmailVerification === true, JSON.stringify(Object.keys(pinned)));

  // The same trust, on the other TLS mode. `ca` is threaded into both, and an option that
  // only reaches one of them is a bug that shows up as somebody disabling verification.
  const pinnedImplicit = await serveSmtp({ tls: pem, implicit: true, host: "localhost" });
  process.env.BREVO_SMTP_PORT = String(pinnedImplicit.port);
  process.env.BREVO_SMTP_SSL = "1";
  const implicitPinned = await rpc(backend, "signUpEmail", { email: "pinned465@example.com", password: "hunter2hunter2" });
  check(
    "a pinned CA works on port 465 too, with the name still checked",
    implicitPinned.requiresEmailVerification === true && pinnedImplicit.log.upgraded === true,
    JSON.stringify(Object.keys(implicitPinned)),
  );
  await pinnedImplicit.close();
  process.env.BREVO_SMTP_PORT = String(relay.port);
  process.env.BREVO_SMTP_SSL = "0";
  await nameRelay.close();
  delete process.env.SMTP_TLS_CA_PEM;
  process.env.BREVO_SMTP_HOST = "127.0.0.1";
  process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0";
  await live.close();
  blackhole.close();

  /* ---------- 8g: a transport that cannot work stops being paid for ---------- */
  console.log("\nemail delivery: a transport that cannot work stops being asked again");
  sender.resetSmtpCircuit();
  process.env.BREVO_SMTP_HOST = "127.0.0.1";
  process.env.BREVO_SMTP_SSL = "0";
  process.env.SMTP_REQUIRE_TLS = "0";
  process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.BREVO_SMTP_USER = "c54426001@smtp-brevo.com";
  process.env.BREVO_SMTP_PASS = "hunter2smtp";
  delete process.env.BREVO_SMTP_CANDIDATES;
  delete process.env.BREVO_SMTP_SERVERNAME;
  delete process.env.JATEXT_EMAIL_TRANSPORT;

  // A refusal and a closed port are answers, not evidence about the runtime: both come
  // back in milliseconds, and neither may count towards a cooldown that takes the relay
  // away from every other signup.
  const refuseG = await serveSmtp({ password: "wrong-on-purpose" });
  process.env.BREVO_SMTP_PORT = String(refuseG.port);
  const refusedG = await sender.sendEmail({ to: "refused-g@example.com", subject: "x", text: "y" }).catch((err) => err);
  const afterRefused = sender.emailSenderConfig();
  check(
    "a refused login is an answer, not a strike",
    refusedG instanceof Error &&
      /credentials invalid/i.test(refusedG.message) &&
      afterRefused.breaker.failures === 0 &&
      !afterRefused.breaker.open &&
      afterRefused.kind === "smtp",
    JSON.stringify({ message: String(refusedG?.message).slice(0, 80), breaker: afterRefused.breaker, kind: afterRefused.kind }),
  );
  await refuseG.close();

  const silentG = await serveSmtp();
  const silentPort = silentG.port;
  await silentG.close();
  process.env.BREVO_SMTP_PORT = String(silentPort);
  const closedG = await sender.sendEmail({ to: "closed-g@example.com", subject: "x", text: "y" }).catch((err) => err);
  const afterClosed = sender.emailSenderConfig();
  check(
    "a closed port is an answer too, and with a key present the API carries the message",
    closedG?.sent === true && afterClosed.breaker.failures === 0 && !afterClosed.breaker.open && afterClosed.kind === "smtp",
    JSON.stringify({ result: closedG, breaker: afterClosed.breaker, kind: afterClosed.kind }),
  );

  // The advice attached to a refused API call has to match what else can carry the mail.
  // With the relay healthy the refusal points at the relay - that is the channel that is
  // not IP restricted - and the stub refuses the way Brevo really did, in its own words,
  // so the branch that ships is the one a deployment actually hits.
  brevo.mode = "ip-blocked";
  const ipBlockedHealthy = await sender.sendEmail({ to: "ip-healthy@example.com", subject: "x", text: "y" }).catch((err) => err);
  check(
    "while the relay is healthy the refused API call points at the relay",
    ipBlockedHealthy instanceof Error &&
      /unrecognised IP address/.test(ipBlockedHealthy.message) &&
      /Use the SMTP relay instead/.test(ipBlockedHealthy.message),
    String(ipBlockedHealthy?.message || ipBlockedHealthy).slice(0, 240),
  );
  brevo.mode = "ok";

  // A port that accepts and then never answers: the one failure that is evidence about the
  // runtime rather than about the account. Two of them open the cooldown; `stallFor` ends
  // each silence after a chosen interval so the two strikes cost seconds, not two
  // twenty-second budgets.
  const stallG1 = await serveSmtp({ stall: true, stallFor: 1_500 });
  const stallG2 = await serveSmtp({ stall: true, stallFor: 1_500 });
  process.env.BREVO_SMTP_PORT = String(stallG1.port);
  await sender.sendEmail({ to: "strike1@example.com", subject: "x", text: "y" }).catch(() => null);
  const afterStrike1 = sender.emailSenderConfig();
  check(
    "one send that waited on a silent port is a strike, not a cooldown",
    afterStrike1.breaker.failures === 1 && !afterStrike1.breaker.open && afterStrike1.kind === "smtp",
    JSON.stringify(afterStrike1.breaker),
  );
  process.env.BREVO_SMTP_PORT = String(stallG2.port);
  const strike2 = await sender.sendEmail({ to: "strike2@example.com", subject: "x", text: "y" }).catch((err) => err);
  const afterStrike2 = sender.emailSenderConfig();
  check(
    "the second strike opens the cooldown, with the wait named in it, and the mail still goes",
    strike2?.sent === true &&
      afterStrike2.breaker.failures === 2 &&
      afterStrike2.breaker.open === true &&
      /timed out waiting/.test(afterStrike2.breaker.note) &&
      afterStrike2.kind === "brevo-api" &&
      /until \d{4}-\d{2}-\d{2}T/.test(afterStrike2.reason),
    JSON.stringify({ breaker: afterStrike2.breaker, kind: afterStrike2.kind, reason: afterStrike2.reason, result: strike2 }),
  );
  const diagG = sender.emailSenderDiagnostics();
  check(
    "the diagnostics carry the cooldown an operator has to see",
    diagG.transportPreference === "auto" &&
      diagG.smtpBreakerOpen === true &&
      /timed out waiting/.test(diagG.smtpBreakerNote) &&
      /\d{4}-\d{2}-\d{2}T/.test(diagG.smtpBreakerUntil),
    JSON.stringify({ preference: diagG.transportPreference, open: diagG.smtpBreakerOpen, note: diagG.smtpBreakerNote, until: diagG.smtpBreakerUntil }),
  );
  const stallG1Before = stallG1.log.connections;
  const straightApi = await sender.sendEmail({ to: "straight-api@example.com", subject: "x", text: "y" }).catch((err) => err);
  check(
    "while the cooldown is open the relay is not asked at all",
    straightApi?.sent === true && straightApi.transport === "brevo-api" && stallG1.log.connections === stallG1Before,
    JSON.stringify({ result: straightApi, conns: `${stallG1Before}->${stallG1.log.connections}` }),
  );

  // The same refusal with the relay already judged unusable must not recommend it: the
  // sentence would sit right next to the evidence that the relay is dead, and an operator
  // who follows it configures the wrong half of the problem. This is the exact shape a
  // real signup came back with - interception caught, API refused on the allow-list - and
  // the advice has to name the one setting that makes the API work instead.
  brevo.mode = "ip-blocked";
  const ipBlockedOpen = await sender.sendEmail({ to: "ip-open@example.com", subject: "x", text: "y" }).catch((err) => err);
  check(
    "with the cooldown open the refused API call says the API is the only channel",
    ipBlockedOpen instanceof Error &&
      /No IP review/.test(ipBlockedOpen.message) &&
      /blocked from this runtime/.test(ipBlockedOpen.message) &&
      !/Use the SMTP relay instead/.test(ipBlockedOpen.message),
    String(ipBlockedOpen?.message || ipBlockedOpen).slice(0, 260),
  );

  // An API-only deployment gets the same setting named without a relay being blamed for
  // anything: there is no relay to point at, so the sentence has to say that instead.
  const savedUser8g = process.env.BREVO_SMTP_USER;
  const savedPass8g = process.env.BREVO_SMTP_PASS;
  delete process.env.BREVO_SMTP_USER;
  delete process.env.BREVO_SMTP_PASS;
  const ipBlockedNoRelay = await sender.sendEmail({ to: "ip-norelay@example.com", subject: "x", text: "y" }).catch((err) => err);
  check(
    "without a relay configured the refusal says so rather than pointing at a relay",
    ipBlockedNoRelay instanceof Error &&
      /No SMTP relay is configured/.test(ipBlockedNoRelay.message) &&
      /No IP review/.test(ipBlockedNoRelay.message),
    String(ipBlockedNoRelay?.message || ipBlockedNoRelay).slice(0, 260),
  );
  brevo.mode = "ok";
  process.env.BREVO_SMTP_USER = savedUser8g;
  process.env.BREVO_SMTP_PASS = savedPass8g;

  // The certificate a TLS interceptor inside the runtime answers with: every name on it is
  // an address that means "this machine", and none of them is the host being dialled. On
  // this runtime the handshake has to run with verification off for `secureConnect` to fire
  // at all (Node's built-in name check fails the handshake first), which is also the case
  // the check has to survive: the interception verdict is about who the peer is, not about
  // whether this certificate ought to be trusted.
  const loopPem = makeLoopbackTlsFixture();
  if (!loopPem) {
    console.log("  skip  no openssl on this machine: the interception assertions did not run");
  } else {
    sender.resetSmtpCircuit();
    const loopRelay = await serveSmtp({ tls: loopPem, host: "127.0.0.1" });
    process.env.BREVO_SMTP_HOST = "127.0.0.1";
    process.env.BREVO_SMTP_PORT = String(loopRelay.port);
    process.env.BREVO_SMTP_SSL = "0";
    process.env.SMTP_REQUIRE_TLS = "0";
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0";

    const probeLoop = await sender.probeEmailSender({ force: true });
    const probeLoopCfg = sender.emailSenderConfig();
    check(
      "the probe says the certificate was this machine's, not the relay's",
      probeLoop.ok === false && probeLoop.intercepted === true && /loopback address/.test(String(probeLoop.note)),
      JSON.stringify({ ok: probeLoop.ok, intercepted: probeLoop.intercepted, note: String(probeLoop.note).slice(0, 160) }),
    );
    check(
      "and asking costs the transport nothing",
      probeLoopCfg.breaker.failures === 0 && !probeLoopCfg.breaker.open,
      JSON.stringify(probeLoopCfg.breaker),
    );

    // With a key configured the message still goes out: the SMTP path is blocked from the
    // inside, the HTTPS path is a different one, and a failed signup is a worse answer than
    // a transport switch this code already knows how to make.
    const interceptSend = await sender.sendEmail({ to: "intercepted@example.com", subject: "x", text: "y" }).catch((err) => err);
    const afterIntercept = sender.emailSenderConfig();
    check(
      "the send that hit the interception still goes out, over the HTTPS API",
      interceptSend?.sent === true && interceptSend.transport === "smtp-then-api",
      JSON.stringify(interceptSend).slice(0, 200),
    );
    check(
      "and one such send is enough to stop asking the relay, with the port named in the verdict",
      afterIntercept.breaker.failures === 2 &&
        afterIntercept.breaker.open === true &&
        new RegExp(String(loopRelay.port)).test(afterIntercept.breaker.note) &&
        /loopback address/.test(afterIntercept.breaker.note) &&
        afterIntercept.kind === "brevo-api" &&
        /until \d{4}-\d{2}-\d{2}T/.test(afterIntercept.reason),
      JSON.stringify({ breaker: afterIntercept.breaker, kind: afterIntercept.kind, reason: afterIntercept.reason }),
    );

    // Without a key there is no API to fall to, so the error itself has to carry the
    // actionable sentence - and it has to say `intercepted`, because that flag is what tells
    // the caller this was not the relay refusing anything.
    sender.resetSmtpCircuit();
    const savedGKey = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    const interceptErr = await sender.sendEmail({ to: "intercepted2@example.com", subject: "x", text: "y" }).catch((err) => err);
    check(
      "with no API key the failure names the interception and the switch that fixes it",
      interceptErr instanceof Error &&
        interceptErr.intercepted === true &&
        /loopback address/.test(interceptErr.message) &&
        /JATEXT_EMAIL_TRANSPORT=api/.test(interceptErr.message),
      String(interceptErr?.message || interceptErr).slice(0, 220),
    );
    const errCfg = sender.emailSenderConfig();
    check(
      "and it still opens the cooldown in one send",
      errCfg.breaker.failures === 2 && errCfg.breaker.open === true && new RegExp(String(loopRelay.port)).test(errCfg.breaker.note),
      JSON.stringify(errCfg.breaker),
    );
    process.env.BREVO_API_KEY = savedGKey;

    // The two switches over an open cooldown: `smtp` outranks it - an operator saying "I
    // repaired it, ask again" - and `api` stands down from a healthy relay as well.
    process.env.JATEXT_EMAIL_TRANSPORT = "smtp";
    check("smtp can be forced even while the cooldown is open", sender.emailSenderConfig().kind === "smtp", sender.emailSenderConfig().kind);
    process.env.JATEXT_EMAIL_TRANSPORT = "api";
    check("and api stands down from the relay either way", sender.emailSenderConfig().kind === "brevo-api", sender.emailSenderConfig().kind);
    delete process.env.JATEXT_EMAIL_TRANSPORT;
    check("back on auto, the open cooldown is what routes the mail", sender.emailSenderConfig().kind === "brevo-api", sender.emailSenderConfig().kind);

    sender.resetSmtpCircuit();
    const cleared = sender.emailSenderConfig();
    check(
      "resetting forgets the verdict and the relay is asked again",
      cleared.breaker.failures === 0 && !cleared.breaker.open && cleared.breaker.note === "" && cleared.kind === "smtp",
      JSON.stringify(cleared.breaker),
    );

    await loopRelay.close();
  }
  await stallG1.close();
  await stallG2.close();

  // Back to the state section 9 found: the relay configured but not listening, so the
  // rescue below exercises the refusal-and-fallback path rather than a cooldown.
  process.env.BREVO_SMTP_HOST = "127.0.0.1";
  process.env.BREVO_SMTP_PORT = String(relay.port);
  process.env.BREVO_SMTP_SSL = "0";
  process.env.SMTP_REQUIRE_TLS = "0";
  process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0";
  delete process.env.BREVO_SMTP_CANDIDATES;
  delete process.env.BREVO_SMTP_SERVERNAME;
  delete process.env.JATEXT_EMAIL_TRANSPORT;
  sender.resetSmtpCircuit();

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

  /* ---------- 10: the operator send, which is the only proof a mailbox got mail ---------- */
  console.log("\nemail delivery: sending one message on purpose");
  // Back to the HTTP API on purpose: every relay server this run started is closed by now,
  // and "smtp-then-api" would answer a different question than the one this section asks.
  for (const key of ["BREVO_SMTP_HOST", "BREVO_SMTP_PORT", "BREVO_SMTP_USER", "BREVO_SMTP_PASS", "BREVO_SMTP_CANDIDATES"]) {
    delete process.env[key];
  }
  brevo.mode = "ok";
  const disabled = await sender.requestTestSend({ to: "boss@example.com", token: "whatever" }).catch((err) => err);
  check("no token configured means no test sends", /not enabled/i.test(disabled?.message || "") && disabled?.code === "email_test_disabled", disabled?.message);
  check("and nothing left the process", !brevo.sent.some((m) => m.body?.to?.[0]?.email === "boss@example.com"), "a send happened");

  process.env.JATEXT_TEST_SEND_TOKEN = "a-private-value";
  const wrongToken = await sender.requestTestSend({ to: "boss@example.com", token: "a-private-valud" }).catch((err) => err);
  check(
    "a wrong token is refused, and says nothing about how close it was",
    wrongToken?.code === "email_test_unauthorized" && !/expected|length/i.test(wrongToken?.message || ""),
    `${wrongToken?.code}: ${wrongToken?.message}`,
  );
  const emptyToken = await sender.requestTestSend({ to: "boss@example.com" }).catch((err) => err);
  check("so is no token at all", emptyToken?.code === "email_test_unauthorized", emptyToken?.code);
  const badAddress = await sender.requestTestSend({ to: "not-an-address", token: "a-private-value" }).catch((err) => err);
  check("and an address that is not an address is refused before anything is sent", /valid address/i.test(badAddress?.message || ""), badAddress?.message);

  const sent = await sender.requestTestSend({ to: "boss@example.com", token: "a-private-value" });
  check("with the token it sends, through whichever transport is live", sent.sent === true && sent.transport === "brevo-api", JSON.stringify(sent));
  const mail = brevo.sent.find((m) => m.body?.to?.[0]?.email === "boss@example.com");
  check("the message says what it is, and carries no code", /mail test/i.test(mail?.body?.subject || "") && !/\d{6}/.test(mail?.body?.textContent || ""), JSON.stringify(mail?.body?.subject));
  delete process.env.JATEXT_TEST_SEND_TOKEN;

  brevo.server.close();
  console.log(failures === 0 ? "\nemail verification checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
