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

function readReady(reader) {
  return reader();
}

/**
 * Line-buffered view of a socket. Replies in SMTP are one or more lines where the
 * third character is `-` until the last one, so "read a reply" has to be the unit
 * rather than "read a line".
 */
function createReplyReader(socket) {
  let buffer = "";
  const queued = [];
  const waiting = [];
  let failure = null;

  const push = (line) => {
    const resolve = waiting.shift();
    if (resolve) resolve(line);
    else queued.push(line);
  };

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += String(chunk);
    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      push(line);
      idx = buffer.indexOf("\n");
    }
  });
  socket.on("error", (err) => {
    failure = err instanceof Error ? err : new Error(String(err));
    while (waiting.length) waiting.shift()(null);
  });
  socket.on("close", () => {
    if (!failure) failure = new Error("the mail server closed the connection");
    while (waiting.length) waiting.shift()(null);
  });

  return async function nextReply() {
    const lines = [];
    for (;;) {
      let line = queued.shift() ?? null;
      if (!line) {
        if (failure) throw new SmtpError(`Could not talk to the mail server: ${failure.message}`);
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
  };
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

function upgradeToTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host, ALPNProtocols: [] });
    const timer = setTimeout(() => {
      secure.destroy();
      reject(new SmtpError("The mail server did not finish the TLS handshake in time."));
    }, 15_000);
    secure.once("error", (err) => {
      clearTimeout(timer);
      reject(new SmtpError(`The TLS upgrade failed: ${err?.message || err}`));
    });
    secure.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(secure);
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
 *           html?:string, timeoutMs?:number, requireTls?:boolean}} options
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

  if (!host) throw new SmtpError("No SMTP host is configured.");
  if (!from) throw new SmtpError("No sender address is configured.");

  let socket = await connectSocket({ host, port, timeoutMs });
  const deadline = setTimeout(() => {
    try {
      socket.destroy();
    } catch {
      // already gone
    }
  }, timeoutMs);
  const clear = () => clearTimeout(deadline);

  try {
    let reader = createReplyReader(socket);
    let caps = "";

    expect(await reader(), [220], "greeting");
    socket.write(`EHLO jatext${EOL}`);
    const hello = expect(await reader(), [250], "ehlo");
    caps = hello.text.toUpperCase();

    if (!secure) {
      if (caps.includes("STARTTLS")) {
        socket.write(`STARTTLS${EOL}`);
        expect(await reader(), [220], "starttls");
        const upgraded = await upgradeToTls(socket, host);
        socket = upgraded;
        reader = createReplyReader(socket);
        socket.write(`EHLO jatext${EOL}`);
        const afterTls = expect(await reader(), [250], "ehlo-after-tls");
        caps = afterTls.text.toUpperCase();
      } else if (requireTls) {
        throw new SmtpError(
          `${host}:${port} is not offering STARTTLS, and sending a password over a plain connection is not on.`,
          { phase: "starttls" },
        );
      }
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
      await readReady(reader).catch(() => null);
      socket.write(`QUIT${EOL}`);
      await readReady(reader).catch(() => null);
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
    await readReady(reader).catch(() => null);
    return { sent: true, transport: "smtp", response: accepted.text || "accepted" };
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
export async function probeSmtpLogin({ host, port = 587, user = "", pass = "", from = "", requireTls = true, timeoutMs = 15_000 }) {
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
      timeoutMs,
      probeMode: "envelope",
    });
    return { ok: true, note: result.response || "smtp login accepted", sender: from || user };
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
