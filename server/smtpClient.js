/**
 * The thirty-line SMTP client the edge runtime needs.
 *
 * Why this exists at all: Brevo restricts its HTTP API to whitelisted source addresses,
 * and a Supabase Edge Function has no fixed egress IP to whitelist, so `POST
 * /v3/smtp/email` answers 401 with "unrecognised IP address" no matter how correct the
 * key is. The SMTP relay is not IP-restricted. It needs a plain TCP socket and STARTTLS,
 * which this runtime does have - the Postgres connection in `pgDenoDriver.js` is the same
 * two primitives - and it does not need a dependency: a submission session is six
 * commands, a base64 login, and a message.
 *
 * Two TLS modes, because a relay offers one of them and mixing them up is the difference
 * between mail and a twenty second wait: 587 is plaintext until STARTTLS upgrades it, and
 * 465 is TLS from the first byte. The upgrade is the dangerous one, since the socket that
 * carried the plaintext protocol is the socket TLS is then layered on, so the reader has to
 * be lifted off it and put back afterwards rather than duplicated.
 *
 * Deliberately small: one recipient, no pipelining, no 8BITMIME negotiation, no
 * retries. Anything the relay rejects is reported as its own sentence, because
 * "535 authentication failed" and "554 sender not allowed" need different fixes and
 * only Brevo knows which one happened.
 */

import net from "node:net";
import tls from "node:tls";

const EOL = "\r\n";
const DEFAULT_TIMEOUT_MS = 20_000;

class SmtpError extends Error {
  constructor(message, { code = 0, phase = "" } = {}) {
    super(message);
    this.name = "SmtpError";
    this.code = Number(code || 0);
    this.phase = phase;
  }
}

function b64(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function encodeHeaderValue(value) {
  const text = String(value || "");
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const encoded = Buffer.from(text, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

/** A TLS record, visible in the first three bytes: change-cipher-spec, alert, handshake
 * and application-data are 0x14-0x17, and the version half after them is always 0x03. */
function looksLikeTlsRecord(buf) {
  return buf.length >= 3 && buf[0] >= 0x14 && buf[0] <= 0x17 && buf[1] === 0x03;
}

/**
 * A reply reader over a socket that may later be swapped for a TLS session.
 *
 * Replies in SMTP are one or more lines where the fourth character is `-` until the last
 * one, so "read a reply" has to be the unit rather than "read a line".
 *
 * Bytes rather than characters, deliberately. A server answered this connection with a TLS
 * handshake record when the client expected SMTP, and reading that as text is what made the
 * failure cost twenty seconds and then report itself as "the mail server closed the
 * connection" - which is a perfectly reasonable thing for a fallback to believe, and the
 * wrong conclusion. The record type is visible before any decoding, so it is checked before
 * decoding, and that case is now one line in the right words in under a second.
 */
function createReplyReader(socket, prelude) {
  // Bytes the socket had already delivered before this reader existed. A TLS server writes
  // its greeting the moment the handshake finishes, which is a step or two before the code
  // waiting for the handshake gets to attach a listener, so on any runtime that does not
  // hold those bytes for a listener that arrives late they would simply vanish - and the
  // session would die with "the mail server closed the connection" while the server was
  // merrily waiting for a command. Node buffers them; this makes the answer not depend on
  // which runtime it is.
  let buffer = prelude && prelude.length ? Buffer.from(prelude) : Buffer.alloc(0);
  const queued = [];
  const waiting = [];
  let failure = null;

  const push = (line) => {
    const resolve = waiting.shift();
    if (resolve) resolve(line);
    else queued.push(line);
  };

  const fail = (err) => {
    failure = err;
    while (waiting.length) waiting.shift()(null);
  };

  const onData = (chunk) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
    // Only at the start of a message: a chunk that continues a line is SMTP text by
    // definition, and its bytes are the tail of whatever the last chunk left over.
    if (buffer.length === 0 && looksLikeTlsRecord(buf)) {
      fail(
        new SmtpError(
          "The mail server answered with a TLS record on a connection opened in plaintext, which means that port speaks TLS from the first byte. Set BREVO_SMTP_SSL=1 for port 465, or BREVO_SMTP_PORT=587 for STARTTLS.",
          { phase: "greeting" },
        ),
      );
      return;
    }
    // Concatenate, never replace: a reply line can be split across packets, and a server is
    // free to send the last line of a multi-line answer whenever it likes. Overwriting the
    // tail of the previous chunk loses the half of a reply that was waiting to be completed
    // - a bug that only shows up on a real network, which is why the tests split one.
    buffer = buffer.length === 0 ? buf : Buffer.concat([buffer, buf]);
    let idx = buffer.indexOf(0x0a);
    while (idx >= 0) {
      const line = buffer.subarray(0, idx).toString("utf8").replace(/\r$/, "");
      buffer = buffer.subarray(idx + 1);
      push(line);
      idx = buffer.indexOf(0x0a);
    }
  };

  const onError = (err) => {
    fail(err instanceof Error ? err : new Error(String(err)));
  };

  const onClose = () => {
    fail(new Error("the mail server closed the connection"));
  };

  // No setEncoding on purpose: the raw bytes are what decide whether this is SMTP at all.
  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);

  /**
   * Hand the socket over to TLS.
   *
   * This is the part that has to be exact rather than nearly right: a `data` listener puts
   * a stream in flowing mode, so a reader still listening when STARTTLS completes consumes
   * the server's TLS records as text and the handshake then sits there until it times out.
   * Every listener therefore comes off first, and any bytes that had already arrived with
   * them, because those bytes belong to the TLS session and there is no way to feed them
   * back in. Whatever is returned is expected to be empty; the caller says so loudly if it
   * is not.
   */
  nextReply.detach = () => {
    socket.off("data", onData);
    socket.off("error", onError);
    socket.off("close", onClose);
    const leftover = buffer;
    buffer = Buffer.alloc(0);
    return leftover.length > 0;
  };

  /** Attach the same reader to the socket that TLS just produced. */
  nextReply.attach = (tlsSocket, prelude) => {
    if (prelude && prelude.length) buffer = Buffer.concat([prelude, buffer]);
    tlsSocket.on("data", onData);
    tlsSocket.on("error", onError);
    tlsSocket.on("close", onClose);
  };

  return nextReply;

  async function nextReply() {
    const lines = [];
    for (;;) {
      let line = queued.shift();
      if (line === undefined) {
        if (failure) throw new SmtpError(`Could not talk to the mail server: ${failure.message}`);
        // A parked resolver, not a subscription: a reply that arrived while nothing was
        // waiting for one is still in `queued`, and it must not be missed.
        line = await new Promise((resolve) => waiting.push(resolve));
        if (line == null) {
          throw new SmtpError(`Could not talk to the mail server: ${failure?.message || "connection lost"}`);
        }
      }
      const code = Number(line.slice(0, 3));
      lines.push(line.slice(3).replace(/^[-\s]/, "").trim());
      if (line[3] !== "-") {
        return { code, text: lines.join(" ") };
      }
    }
  }
}

function expect(reply, codes, phase) {
  if (!codes.includes(reply.code)) {
    throw new SmtpError(reply.text || `The mail server answered ${reply.code}`, { code: reply.code, phase });
  }
  return reply;
}

function connectSocket({ host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new SmtpError(`The mail server at ${host}:${port} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(new SmtpError(`Could not open a connection to ${host}:${port}: ${err?.message || err}`));
    });
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

/**
 * Open a TLS session on a socket that has not been used yet - port 465, where the
 * encryption is there before the protocol is.
 *
 * This is a separate function rather than one line in `upgradeToTls` because the two cases
 * genuinely differ. Wrapping an existing socket (`tls.connect({ socket })`) is what a
 * STARTTLS upgrade has to do, and it is the path that has been unreliable in the runtime
 * this function is deployed to: the handshake simply never completes, whatever the server
 * on the other end does. A fresh TLS connection goes through a different code path
 * altogether, so implicit TLS must not be implemented as "connect, then wrap" - it is the
 * fallback that has the best chance of working, and it is the one that is used whenever the
 * port says so.
 */
function openTlsSocket({ host, port, timeoutMs = DEFAULT_TIMEOUT_MS, rejectUnauthorized, servername: askedFor, ca }) {
  return new Promise((resolve, reject) => {
    // What to tell the server we are looking for, and what the certificate has to match.
    // Stated separately because Brevo's relay answers on `smtp-relay.brevo.com` while some
    // of its nodes serve a `sendinblue.com` certificate, and `BREVO_SMTP_SERVERNAME` is the
    // switch that reconciles the two without turning verification off.
    const servername = askedFor || (/^[0-9.]+$/.test(host) || host.includes(":") ? undefined : host);
    const secure = tls.connect({
      host,
      port,
      ...(servername ? { servername } : {}),
      rejectUnauthorized,
      // A private relay with a certificate from a CA the runtime does not carry should be
      // *trusted*, not excused: `rejectUnauthorized: false` throws away the name check with
      // the chain check, while a pinned CA keeps both.
      ...(ca ? { ca } : {}),
    });
    const fail = (err) => {
      clearTimeout(timer);
      secure.destroy();
      reject(err);
    };
    // Attached before the handshake is announced as finished, so that a greeting written in
    // the same tick as `secureConnect` is kept rather than missed. `collect` is handed to the
    // reader below and then dropped; nothing reads the socket twice.
    let collect = true;
    const prelude = [];
    secure.on("data", (chunk) => {
      if (collect) prelude.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });
    const timer = setTimeout(() => {
      fail(new SmtpError(`Could not open a TLS session with ${host}:${port} within ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    secure.once("error", (err) => {
      fail(new SmtpError(`Could not open a TLS session with ${host}:${port}: ${err?.message || err}`));
    });
    secure.once("secureConnect", () => {
      clearTimeout(timer);
      collect = false;
      const identity = checkPeerIdentity(secure, servername || host, rejectUnauthorized);
      if (identity) return fail(identity);
      resolve({ socket: secure, prelude: Buffer.concat(prelude), tls: describeSession(secure) });
    });
  });
}

/**
 * The runtime's certificate checks are not assumed to be complete.
 *
 * Brevo's relay answers on `smtp-relay.brevo.com` while some of its nodes present a
 * certificate for a `*.sendinblue.com` name, which is a mismatch a strict client reports and
 * a lax one accepts in silence. The fix is not to stop checking - `smtp-relay.sendinblue.com`
 * is the legacy hostname, still valid, and it is in the certificate - so `BREVO_SMTP_SERVERNAME`
 * lets the name be stated, and this says which of the two happened.
 */
function checkPeerIdentity(secure, host, rejectUnauthorized) {
  if (!rejectUnauthorized) return null;
  let cert = null;
  try {
    cert = secure.getPeerCertificate?.() || null;
  } catch {
    cert = null;
  }
  if (!cert || !Object.keys(cert).length) {
    return new SmtpError(`The mail server presented no certificate for ${host}, so the session is not trusted.`, { phase: "tls-verify" });
  }
  const subject = String(cert.subject?.CN || "");
  const names = [subject, ...(Array.isArray(cert.subjectaltname) ? cert.subjectaltname : String(cert.subjectaltname || "").split(/,\s*/))].filter(Boolean);
  const sanList = names.flatMap((n) => String(n).replace(/^(DNS:|IP:)/i, "").trim()).filter(Boolean);
  const matched = sanList.some((name) => (name.startsWith("*.") ? host.endsWith(name.slice(1)) : name === host));
  if (!matched && !sanList.length) {
    // No names to match against is unusual, and verifying is better than trusting blindly.
    return new SmtpError(`The certificate from ${host} lists no host names (it says "${subject}"), so it cannot be checked.`, { phase: "tls-verify" });
  }
  if (!matched) {
    const wild = sanList.find((name) => name.endsWith(".com") && name.includes("smtp-relay"));
    return new SmtpError(
      `The certificate from ${host} is for ${sanList.slice(0, 3).join(", ") || "another name"}, not this host.` +
        (wild ? ` Set BREVO_SMTP_SERVERNAME=${wild} to name it, rather than switching verification off.` : ""),
      { phase: "tls-verify" },
    );
  }
  return null;
}

function describeSession(secure) {
  try {
    return {
      protocol: String(secure.getProtocol?.() || ""),
      cipher: String(secure.getCipher?.()?.name || ""),
      authorized: secure.authorized === true,
      subject: String(secure.getPeerCertificate?.()?.subject?.CN || ""),
    };
  } catch {
    return {};
  }
}

function upgradeToTls(socket, host, { rejectUnauthorized = true, timeoutMs = DEFAULT_TIMEOUT_MS, servername: askedFor, ca } = {}) {
  return new Promise((resolve, reject) => {
    // `servername` only for a hostname: SNI with an IP address is against RFC 6066, Node
    // warns about it, and the certificate a relay serves is for a hostname anyway.
    // No ALPN list either - an empty one says "no protocol I understand", which some
    // servers answer by never finishing the handshake at all.
    const servername = askedFor || (/^[0-9.]+$/.test(host) || host.includes(":") ? undefined : host);
    const secure = tls.connect({ socket, ...(servername ? { servername } : {}), rejectUnauthorized, ...(ca ? { ca } : {}) });
    const timer = setTimeout(() => {
      secure.destroy();
      reject(new SmtpError("The mail server did not finish the TLS handshake in time."));
    }, Math.min(timeoutMs, 15_000));
    secure.once("error", (err) => {
      clearTimeout(timer);
      reject(new SmtpError(`The TLS upgrade failed: ${err?.message || err}`));
    });
    // Bytes are collected from the moment the wrapper exists, exactly as in `openTlsSocket`:
    // the server's first encrypted write can land before the caller has attached anything.
    let collect = true;
    const prelude = [];
    secure.on("data", (chunk) => {
      if (collect) prelude.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8"));
    });
    secure.once("secureConnect", () => {
      clearTimeout(timer);
      collect = false;
      const identity = checkPeerIdentity(secure, servername || host, rejectUnauthorized);
      if (identity) {
        secure.destroy();
        return reject(identity);
      }
      resolve({ socket: secure, prelude: Buffer.concat(prelude), tls: describeSession(secure) });
    });
  });
}

/**
 * Build the message. Base64 parts so nothing here has to worry about line length,
 * invisible characters or somebody putting a lone full stop in their subject; a
 * multipart body also means the plain-text version is there for the clients that
 * only ever show that one.
 */
export function buildMimeMessage({ from, fromName, to, subject, text, html, headers = {} }) {
  const boundary = `----=_ Jatext_${Date.now().toString(36)}`;
  const b64 = (value) => Buffer.from(String(value || ""), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const parts = [];
  parts.push(`--${boundary}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(text), "");
  if (html) {
    parts.push(
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64(html),
      "",
    );
  }
  parts.push(`--${boundary}--`, "");
  const fromLine = fromName ? `${encodeHeaderValue(fromName)} <${from}>` : `<${from}>`;
  const headerLines = [
    `From: ${fromLine}`,
    `To: <${to}>`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now().toString(36)}-${b64(from + to).replace(/[^a-z0-9]/gi, "").slice(0, 18).toLowerCase()}@jatext>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  for (const [name, value] of Object.entries(headers)) {
    headerLines.push(`${name}: ${encodeHeaderValue(value)}`);
  }
  return `${headerLines.join(EOL)}${EOL}${EOL}${parts.join(EOL)}`;
}

/**
 * @param {{host:string, port?:number, user?:string, pass?:string, secure?:boolean,
 *           from:string, fromName?:string, to:string, subject:string, text:string,
 *           html?:string, timeoutMs?:number, requireTls?:boolean,
 *           rejectUnauthorized?:boolean, probeMode?:"send"|"envelope"}} options
 * @returns {Promise<{sent:true, transport:"smtp", response:string}>}
 */
export async function smtpSendMail(options) {
  const {
    host,
    port = 587,
    user = "",
    pass = "",
    secure = false,
    from,
    fromName = "",
    to,
    subject,
    text,
    html = "",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requireTls = true,
    probeMode = "send",
  } = options;

  const handshakeMs = Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 15_000);

  if (!host) throw new SmtpError("No SMTP host is configured.");
  if (!from) throw new SmtpError("No sender address is configured.");

  const verifyTls = options.rejectUnauthorized !== false;
  // Port 465 is implicit TLS: the session is encrypted from the first byte, so a socket is
  // opened already encrypted. Connecting in plaintext and wrapping afterwards would mean
  // reading a TLS handshake as text, and relies on the one runtime path that STARTTLS
  // shows to be the fragile one.
  let session = null;
  let socket = secure
    ? ((session = await openTlsSocket({
        host,
        port,
        timeoutMs: handshakeMs,
        rejectUnauthorized: verifyTls,
        servername: options.servername,
        ca: options.ca,
      })),
      session.socket)
    : await connectSocket({ host, port, timeoutMs });
  const deadline = setTimeout(() => {
    try {
      socket.destroy();
    } catch {
      // already gone
    }
  }, timeoutMs);
  const clear = () => clearTimeout(deadline);

  try {
    // One reader for the whole session, rewired across the upgrade rather than replaced. A
    // second reader wired alongside the TLS session would look like it worked and quietly
    // parse everything twice, so the same object follows the bytes.
    const reader = createReplyReader(socket, session?.prelude);
    let caps = "";
    const tlsInfo = !secure;

    expect(await reader(), [220], "greeting");
    socket.write(`EHLO jatext${EOL}`);
    const hello = expect(await reader(), [250], "ehlo");
    caps = hello.text.toUpperCase();

    if (!secure && caps.includes("STARTTLS")) {
      socket.write(`STARTTLS${EOL}`);
      expect(await reader(), [220], "starttls");
      if (reader.detach()) {
        throw new SmtpError(
          "The mail server sent more than the STARTTLS acknowledgement, and those bytes belong to the TLS session.",
          { phase: "starttls" },
        );
      }
      const upgraded = await upgradeToTls(socket, host, {
        rejectUnauthorized: verifyTls,
        timeoutMs: handshakeMs,
        servername: options.servername,
        ca: options.ca,
      });
      socket = upgraded.socket;
      reader.attach(socket, upgraded.prelude);
      socket.write(`EHLO jatext${EOL}`);
      const afterTls = expect(await reader(), [250], "ehlo-after-tls");
      caps = afterTls.text.toUpperCase();
    } else if (requireTls && !secure) {
      throw new SmtpError(
        `${host}:${port} is not offering STARTTLS, and sending a password over a plain connection is not on.`,
        { phase: "starttls" },
      );
    }

    if (user || pass) {
      if (!caps.includes("AUTH")) {
        throw new SmtpError(`${host}:${port} did not offer AUTH, so there is no way to log in.`, { phase: "auth" });
      }
      socket.write(`AUTH LOGIN${EOL}`);
      expect(await reader(), [334], "auth-request-user");
      socket.write(`${b64(user)}${EOL}`);
      expect(await reader(), [334], "auth-request-pass");
      socket.write(`${b64(pass)}${EOL}`);
      expect(await reader(), [235], "auth-login");
    }

    socket.write(`MAIL FROM:<${from}>${EOL}`);
    expect(await reader(), [250], "mail-from");
    socket.write(`RCPT TO:<${to}>${EOL}`);
    expect(await reader(), [250, 251], "rcpt-to");

    if (probeMode === "envelope") {
      // The point of a probe is that no message is ever transmitted: asking the relay to
      // take the sender and the recipient and then resetting is how you find out that the
      // address is not a verified sender on the account, which is the other way a code can
      // fail to arrive, and it is invisible to a login-only check.
      socket.write(`RSET${EOL}`);
      await reader().catch(() => null);
      socket.write(`QUIT${EOL}`);
      await reader().catch(() => null);
      return { sent: false, transport: "smtp", response: "sender and recipient accepted", senderAccepted: true };
    }

    socket.write(`DATA${EOL}`);
    expect(await reader(), [354], "data");

    const message = buildMimeMessage({ from, fromName, to, subject, text, html });
    // Dot-stuffing, because the protocol ends the body with a line holding one full
    // stop and a base64 blob can in principle produce one.
    const stuffed = message.replace(/^\./g, "..");
    socket.write(`${stuffed}${EOL}.${EOL}`);
    const accepted = expect(await reader(), [250], "queue");

    socket.write(`QUIT${EOL}`);
    await reader().catch(() => null);
    return { sent: true, transport: "smtp", response: accepted.text || "accepted", tls: session?.tls || (tlsInfo ? describeSession(socket) : undefined) };
  } finally {
    clear();
    try {
      socket.destroy();
    } catch {
      // already closed
    }
  }
}

/**
 * Log in and hang up, without sending anything: the question `/api/email-test` asks of
 * an SMTP relay. Same credentials, same server, no message, so it cannot spend quota or
 * land in anybody's inbox.
 */
export async function probeSmtpLogin({ host, port = 587, user = "", pass = "", from = "", requireTls = true, rejectUnauthorized = true, timeoutMs = 15_000 }) {
  if (!host) return { ok: false, error: "No SMTP host is configured." };
  try {
    const result = await smtpSendMail({
      host,
      port,
      user,
      pass,
      from: from || user || "probe@localhost",
      to: from || user || "probe@localhost",
      subject: "probe",
      text: "probe",
      requireTls,
      // The same trust rules as a real send, or the probe fails on a relay the mailer would
      // happily use and reports a problem that is not there.
      rejectUnauthorized,
      timeoutMs,
      probeMode: "envelope",
    });
    return {
      ok: true,
      note: result.response || "smtp login accepted",
      sender: from || user,
      // Which TLS mode got a session, so the answer to "did the handshake work" does not
      // have to be inferred from whether mail arrived.
      tls: result.tls,
    };
  } catch (err) {
    const phase = String(err?.phase || "");
    if (err?.code === 535) {
      return { ok: false, status: 535, note: err.message, phase };
    }
    // A refused sender or recipient is the finding, not an accident: say which one, in
    // the relay's words, because the fix is a click in Brevo's sender list.
    if (phase === "mail-from" || phase === "rcpt-to") {
      return {
        ok: false,
        status: Number(err?.code || 0) || 0,
        phase,
        note:
          `${phase === "mail-from" ? "The relay refused this sender" : "The relay refused this recipient"}: ${err.message}. ` +
          `A "sender not verified" here means the address has to be confirmed in Brevo's Senders list first.`,
      };
    }
    return { ok: false, status: Number(err?.code || 0) || 0, note: err?.message || String(err), phase };
  }
}
