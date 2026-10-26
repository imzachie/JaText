/**
 * Adjusts a message composer <textarea> height without causing full-page
 * synchronous flexbox reflows on every single keystroke on mobile devices.
 */
export function syncComposerTextareaHeight(
  el: HTMLTextAreaElement | null,
  prevLength: number,
  nextValue: string,
): void {
  if (!el) return;

  if (!nextValue) {
    if (el.style.height) el.style.height = "";
    if (el.style.overflowY !== "hidden") el.style.overflowY = "hidden";
    return;
  }

  const currentHeight = el.clientHeight;
  const grew = nextValue.length >= prevLength;

  if (grew) {
    // Short single-line text without newline cannot wrap — zero layout reads/writes.
    if (nextValue.length < 26 && !nextValue.includes("\n") && currentHeight <= 46) {
      return;
    }
    if (currentHeight >= 120) {
      if (el.style.overflowY !== "auto") el.style.overflowY = "auto";
      return;
    }
    // Text grew: never collapse height to "auto"; only expand if scrollHeight exceeds clientHeight.
    const sh = el.scrollHeight;
    if (sh > currentHeight) {
      const next = Math.min(sh, 120);
      el.style.height = `${next}px`;
      el.style.overflowY = sh > 120 ? "auto" : "hidden";
    }
    return;
  }

  // Text shrank: if already at single-line minimum height, nothing can shrink further.
  if (currentHeight <= 44) {
    return;
  }

  // Multi-line text shrank: lock parent height while measuring so sibling .messages list never reflows.
  const parent = el.parentElement;
  const prevMinHeight = parent?.style.minHeight ?? "";
  if (parent) {
    parent.style.minHeight = `${parent.offsetHeight}px`;
  }
  el.style.height = "auto";
  const sh = el.scrollHeight;
  const next = Math.min(sh, 120);
  el.style.height = `${next}px`;
  el.style.overflowY = sh > 120 ? "auto" : "hidden";
  if (parent) {
    parent.style.minHeight = prevMinHeight;
  }
}
