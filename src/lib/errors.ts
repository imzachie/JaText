export function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message
    .replace(/\[CONVEX [^\]]+\]\s*/gi, "")
    .replace(/\[Request ID:[^\]]+\]\s*/gi, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .trim();

  if (
    !message ||
    /^(server error|internal server error|unknown error)\b/i.test(message) ||
    /\[CONVEX |request id:/i.test(message)
  ) {
    return fallback;
  }
  return message;
}
