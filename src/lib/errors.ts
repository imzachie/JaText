export function friendlyError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string" && data.trim()) return data.trim();
  }
  if (!(error instanceof Error)) return fallback;

  const raw = error.message || "";
  const cleaned = raw
    .replace(/\[CONVEX [^\]]+\]\s*/gi, "")
    .replace(/\[Request ID:[^\]]+\]\s*/gi, "")
    .replace(/^(?:Server Error|Internal Server Error)\s*\n+/i, "")
    .replace(/^Uncaught (?:ConvexError|Error):\s*/i, "")
    .split("\n")[0]
    .trim();

  if (
    !cleaned ||
    /^(server error|internal server error|unknown error|called by client)\b/i.test(cleaned) ||
    /\[CONVEX |request id:/i.test(cleaned)
  ) {
    return fallback;
  }
  return cleaned;
}
