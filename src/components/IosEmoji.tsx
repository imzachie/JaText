import { Fragment, memo, type CSSProperties, type ReactNode } from "react";
import {
  IOS_EMOJI_CELL_COORDS,
  IOS_EMOJI_SEQ_MAP,
  IOS_EMOJI_SPRITE_URL,
} from "../lib/iosEmojiData";

const TRANSPARENT_1PX_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

interface EmojiTrieNode {
  cellIdx?: number;
  next?: Map<number, EmojiTrieNode>;
}

let cachedTrieRoot: EmojiTrieNode | null = null;

function getEmojiTrieRoot(): EmojiTrieNode {
  if (cachedTrieRoot) return cachedTrieRoot;
  const root: EmojiTrieNode = {};
  for (const [seq, cellIdx] of Object.entries(IOS_EMOJI_SEQ_MAP)) {
    let node = root;
    for (let i = 0; i < seq.length; i += 1) {
      const code = seq.charCodeAt(i);
      if (!node.next) node.next = new Map();
      let child = node.next.get(code);
      if (!child) {
        child = {};
        node.next.set(code, child);
      }
      node = child;
    }
    node.cellIdx = cellIdx;
  }
  cachedTrieRoot = root;
  return root;
}

export function getIosEmojiCoords(emoji: string): [number, number] | null {
  const direct = IOS_EMOJI_SEQ_MAP[emoji];
  if (direct !== undefined) {
    return [IOS_EMOJI_CELL_COORDS[direct * 2], IOS_EMOJI_CELL_COORDS[direct * 2 + 1]];
  }
  const stripped = emoji.replace(/\uFE0F/g, "");
  const fallback = IOS_EMOJI_SEQ_MAP[stripped];
  if (fallback !== undefined) {
    return [IOS_EMOJI_CELL_COORDS[fallback * 2], IOS_EMOJI_CELL_COORDS[fallback * 2 + 1]];
  }
  return null;
}

function matchEmojiAt(
  root: EmojiTrieNode,
  text: string,
  startIdx: number,
): { endIdx: number; cellIdx: number } | null {
  const c0 = text.charCodeAt(startIdx);
  // Fast bailout for plain ASCII unless keycap candidate ('0'-'9', '#', '*') followed by FE0F or 20E3
  if (c0 < 0x80) {
    if (
      (c0 >= 0x30 && c0 <= 0x39) ||
      c0 === 0x23 ||
      c0 === 0x2a
    ) {
      const c1 = text.charCodeAt(startIdx + 1);
      if (c1 !== 0xfe0f && c1 !== 0x20e3) return null;
    } else {
      return null;
    }
  }

  let node: EmojiTrieNode | undefined = root;
  let bestEnd = -1;
  let bestCell = -1;
  const len = text.length;

  for (let i = startIdx; i < len; i += 1) {
    node = node.next?.get(text.charCodeAt(i));
    if (!node) break;
    if (node.cellIdx !== undefined) {
      bestEnd = i + 1;
      bestCell = node.cellIdx;
    }
  }

  if (bestCell === -1) return null;
  // Consume trailing U+FE0F if present right after a single-char match
  if (bestEnd < len && text.charCodeAt(bestEnd) === 0xfe0f) {
    bestEnd += 1;
  }
  return { endIdx: bestEnd, cellIdx: bestCell };
}

function buildSpritePositionStyle(
  sx: number,
  sy: number,
  sizePx?: number,
): CSSProperties {
  const posX = `${((sx * 100) / 62).toFixed(4)}%`;
  const posY = `${((sy * 100) / 62).toFixed(4)}%`;
  if (sizePx !== undefined) {
    return {
      width: `${sizePx}px`,
      height: `${sizePx}px`,
      backgroundPosition: `${posX} ${posY}`,
    };
  }
  return {
    backgroundPosition: `${posX} ${posY}`,
  };
}

export function renderTextWithIosEmojis(
  text: string | null | undefined,
  keyPrefix = "em",
): ReactNode {
  if (!text) return text ?? "";

  // Ultra-fast pre-scan: if all chars are plain non-keycap ASCII (< 0x80), return raw string immediately
  let mayContainEmoji = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0x80) {
      mayContainEmoji = true;
      break;
    }
  }
  if (!mayContainEmoji) return text;

  const root = getEmojiTrieRoot();
  let parts: ReactNode[] | null = null;
  let lastPlainIdx = 0;
  let i = 0;
  let tokenCounter = 0;

  while (i < text.length) {
    const matched = matchEmojiAt(root, text, i);
    if (matched) {
      if (!parts) parts = [];
      if (i > lastPlainIdx) {
        parts.push(text.slice(lastPlainIdx, i));
      }
      const rawEmoji = text.slice(i, matched.endIdx);
      const sx = IOS_EMOJI_CELL_COORDS[matched.cellIdx * 2];
      const sy = IOS_EMOJI_CELL_COORDS[matched.cellIdx * 2 + 1];
      parts.push(
        <img
          key={`${keyPrefix}-${tokenCounter++}`}
          src={TRANSPARENT_1PX_GIF}
          alt={rawEmoji}
          draggable={false}
          decoding="async"
          className="ios-emoji-glyph"
          style={buildSpritePositionStyle(sx, sy)}
        />,
      );
      i = matched.endIdx;
      lastPlainIdx = i;
    } else {
      i += 1;
    }
  }

  if (!parts) return text;
  if (lastPlainIdx < text.length) {
    parts.push(text.slice(lastPlainIdx));
  }
  return parts;
}

export const IosEmojiText = memo(function IosEmojiText({
  text,
}: {
  text: string | null | undefined;
}) {
  if (!text) return null;
  return <Fragment>{renderTextWithIosEmojis(text)}</Fragment>;
});

export const IosEmojiGlyph = memo(function IosEmojiGlyph({
  emoji,
  size,
  className = "",
}: {
  emoji: string;
  size?: number;
  className?: string;
}) {
  const coords = getIosEmojiCoords(emoji);
  if (!coords) {
    return <span className={className || undefined}>{emoji}</span>;
  }
  return (
    <img
      src={TRANSPARENT_1PX_GIF}
      alt={emoji}
      draggable={false}
      decoding="async"
      className={`ios-emoji-glyph ${className}`.trim()}
      style={buildSpritePositionStyle(coords[0], coords[1], size)}
    />
  );
});

let emojiWebFontInstalled = false;

/**
 * Installs the CBDT+CBLC+GSUB OpenType color font (`jatext-ios-emoji.woff2`) on
 * Blink & Gecko engines (Windows, Linux, ChromeOS, Android) so even native `<input>`
 * and `<textarea>` controls render Apple iOS 26.4 Unicode 17.0 emojis while typing.
 * Skipped on WebKit/Safari where CBDT-only fonts without sbix render blank spaces.
 */
export function installIosEmojiWebFont(): void {
  if (emojiWebFontInstalled || typeof document === "undefined" || typeof navigator === "undefined") {
    return;
  }
  emojiWebFontInstalled = true;

  // Warm the WebP sprite sheet in browser image cache early
  const preloadLink = document.createElement("link");
  preloadLink.rel = "preload";
  preloadLink.as = "image";
  preloadLink.href = IOS_EMOJI_SPRITE_URL;
  preloadLink.type = "image/webp";
  document.head.appendChild(preloadLink);

  const ua = navigator.userAgent || "";
  const isAppleWebKitOnly =
    (/iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
      (/^((?!chrome|chromium|android|crios|fxios|edgios|opr).)*safari/i.test(ua)));

  if (isAppleWebKitOnly) {
    return;
  }

  const styleEl = document.createElement("style");
  styleEl.id = "jatext-ios-emoji-webfont";
  styleEl.textContent = `
@font-face {
  font-family: "JaTextIosEmoji";
  src: url("/fonts/jatext-ios-emoji.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
html.jt-has-ios-emoji-webfont,
html.jt-has-ios-emoji-webfont body,
html.jt-has-ios-emoji-webfont button,
html.jt-has-ios-emoji-webfont input,
html.jt-has-ios-emoji-webfont textarea {
  font-family: "JaTextIosEmoji", "Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif;
}
`;
  document.head.appendChild(styleEl);
  document.documentElement.classList.add("jt-has-ios-emoji-webfont");
}
