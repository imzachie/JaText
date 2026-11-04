/**
 * Status replies are sent as ordinary messages with a machine readable prefix.
 *
 * The prefix used to be shown to people as raw text ("[Replied to Status: ...]"),
 * which looks broken in a chat. It is still stored in the body so replies survive
 * a reload and sync to every device, but the UI now parses it back out and
 * renders a proper "Replying to Status" chip instead.
 */

export interface StatusReplyParts {
  /** null when this message is not a status reply. Empty string means a reply with no caption. */
  quote: string | null;
  /** The message body with the prefix removed. */
  body: string;
}

// The web app writes one prefix, the native Android app writes another. Both
// have to parse, otherwise a reply sent from a phone renders as raw markup on
// desktop and the other way round.
const PREFIXES: RegExp[] = [
  /^\[Replied to Status: "([\s\S]*?)"\]\r?\n?/,
  /^\[Status reply: "([\s\S]*?)"\]\r?\n?/,
];
const BARE_PREFIXES: RegExp[] = [
  /^\[Replied to your Status\]\r?\n?/,
  /^\[Status reply\]\r?\n?/,
];

export function parseStatusReply(body: unknown): StatusReplyParts {
  const raw = typeof body === "string" ? body : "";
  for (const pattern of PREFIXES) {
    const match = pattern.exec(raw);
    if (match) return { quote: match[1], body: raw.slice(match[0].length) };
  }
  for (const pattern of BARE_PREFIXES) {
    const match = pattern.exec(raw);
    if (match) return { quote: "", body: raw.slice(match[0].length) };
  }
  return { quote: null, body: raw };
}

export function isStatusReply(body: unknown): boolean {
  return parseStatusReply(body).quote !== null;
}

/** What the chats list shows: "Replying to Status" plus the actual reply text. */
export function formatStatusReplyPreview(body: unknown): string {
  const { quote, body: rest } = parseStatusReply(body);
  if (quote === null) return typeof body === "string" ? body : "";
  const label = quote ? `Replying to "${quote}"` : "Replying to Status";
  const text = rest.trim();
  return text ? `${label}: ${text}` : label;
}
