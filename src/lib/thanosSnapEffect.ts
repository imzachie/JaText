/**
 * 1:1 Port of Aghajari/ThanosEffect (Telegram Message Disintegration Effect) for Web
 * Reference:
 *  - ThanosEffect-Core/EffectUtils.kt & ParticleLifeTime.kt
 *  - ThanosEffect-Canvas/Particle.kt & CanvasViewRenderer.kt
 *  - ThanosEffect-OpenGL/res/raw/dust_vertex.glsl & dust_fragment.glsl
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const ALPHAS = [0.35, 0.68, 1.0] as const;
const MIN_DURATION_MS = 850;
const MAX_DURATION_MS = 1650;
const LINE_SENSITIVE_MS = 360;
const SWEEP_DURATION_MS = 360;

interface SnapParticle {
  initialX: number;
  initialY: number;
  initialR: number;
  r: number;
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
  initialAlpha: number;
  alpha: number;
  lifeTime: number;
  velocityY: number;
  translationY: number;
  translationX: number;
  time: number;
}

interface ActiveSnapRenderer {
  messageId: string;
  targetEl: HTMLElement;
  offscreen: HTMLCanvasElement;
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  centerX: number;
  centerY: number;
  perPx: number;
  maxLine: number;
  line: number;
  animatedLineWidth: number;
  time: number;
  nextLineTime: number;
  endRenderingTime: number;
  particles: SnapParticle[];
  firstFrameCallback?: () => void;
  firstFrameFired: boolean;
  sweepCompleteFired: boolean;
  onSweepComplete?: () => void;
  fallbackTimerId: number | null;
}

let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let activeRenderers: ActiveSnapRenderer[] = [];
let rafId: number | null = null;
let lastFrameTs = 0;

const recentlySnappedAtById = new Map<string, number>();
const activeSweepListenersById = new Map<string, Set<() => void>>();
const hiddenTargetElById = new Map<string, HTMLElement>();

function restoreTargetVisibility(el: HTMLElement) {
  el.style.opacity = "";
  el.style.pointerEvents = "";
}

export function restoreSnapTargetVisibilityById(messageId: string) {
  const el = hiddenTargetElById.get(messageId);
  if (el) {
    hiddenTargetElById.delete(messageId);
    restoreTargetVisibility(el);
  }
}

function finalizeRendererSweep(r: ActiveSnapRenderer) {
  if (r.sweepCompleteFired) return;
  r.sweepCompleteFired = true;
  if (r.fallbackTimerId !== null && typeof window !== "undefined") {
    window.clearTimeout(r.fallbackTimerId);
    r.fallbackTimerId = null;
  }
  r.onSweepComplete?.();
  const listeners = activeSweepListenersById.get(r.messageId);
  activeSweepListenersById.delete(r.messageId);
  if (listeners) {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore listener error
      }
    });
  }
  // Only restore inline opacity if the node has already morphed into an unsent placeholder
  // (prevents the original bubble from flashing back for a split second while RPC finishes!)
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!r.targetEl.isConnected || r.targetEl.classList.contains("unsent") || r.targetEl.querySelector(".unsent")) {
          hiddenTargetElById.delete(r.messageId);
          restoreTargetVisibility(r.targetEl);
        }
      });
    });
  }
}

function markMessageRecentlySnapped(messageId: string) {
  const now = Date.now();
  recentlySnappedAtById.set(messageId, now);
  if (recentlySnappedAtById.size > 400) {
    for (const [k, ts] of recentlySnappedAtById) {
      if (now - ts > 30_000) recentlySnappedAtById.delete(k);
    }
  }
}

export function hasMessageRecentlySnapped(messageId: string): boolean {
  const ts = recentlySnappedAtById.get(messageId);
  if (!ts) return false;
  if (Date.now() - ts > 30_000) {
    recentlySnappedAtById.delete(messageId);
    return false;
  }
  return true;
}

export function isMessageSweepActive(messageId: string): boolean {
  return activeSweepListenersById.has(messageId);
}

export function subscribeMessageSweepComplete(
  messageId: string,
  onComplete: () => void,
): () => void {
  const existing = activeSweepListenersById.get(messageId);
  if (!existing) {
    onComplete();
    return () => undefined;
  }
  existing.add(onComplete);
  return () => {
    existing.delete(onComplete);
  };
}

function randInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  return Math.floor(Math.random() * maxExclusive);
}

function randomVelocity(dpScale: number): number {
  const base = Math.max(2, Math.round(4 * dpScale));
  return base + randInt(base);
}

function randomTranslation(initialMinDp: number, dpScale: number): number {
  let t = initialMinDp * dpScale + randInt(Math.max(2, Math.round(56 * dpScale)));
  if (randInt(10) === 0) {
    t = -t / 4;
  }
  return Math.trunc(t);
}

function randomInitialAlpha(pixelAlpha255: number): number {
  const picked = ALPHAS[randInt(ALPHAS.length)];
  return Math.min(pixelAlpha255 / 255, picked);
}

function calculateLifeTime(lineIndex: number, maxLine: number): number {
  const safeMax = Math.max(1, maxLine);
  const minus = Math.trunc(((safeMax - lineIndex) / safeMax) * LINE_SENSITIVE_MS);
  const span = Math.max(1, MAX_DURATION_MS - MIN_DURATION_MS - minus + 1);
  return MIN_DURATION_MS + minus + randInt(span);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Rasterizes a live DOM message bubble (background, borders, images, avatars, and text)
 * into a clean untainted offscreen canvas at exact screen coordinates.
 */
function rasterizeElementToCanvas(rootEl: HTMLElement): {
  canvas: HTMLCanvasElement;
  rect: DOMRect;
} | null {
  const rect = rootEl.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;

  const w = Math.min(960, Math.ceil(rect.width));
  const h = Math.min(960, Math.ceil(rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const elements: HTMLElement[] = [rootEl];
  rootEl.querySelectorAll<HTMLElement>("*").forEach((el) => elements.push(el));

  // 1. Paint visible box backgrounds, borders, and images
  for (const el of elements) {
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity || "1") <= 0.02) {
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const x = r.left - rect.left;
    const y = r.top - rect.top;
    const radius = parseFloat(cs.borderTopLeftRadius || "0") || 0;

    const bgColor = cs.backgroundColor;
    const bgImg = cs.backgroundImage;
    const hasSolidBg =
      bgColor &&
      bgColor !== "rgba(0, 0, 0, 0)" &&
      bgColor !== "transparent";

    if (hasSolidBg) {
      ctx.save();
      roundedRectPath(ctx, x, y, r.width, r.height, radius);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.restore();
    } else if (bgImg && bgImg.includes("gradient")) {
      // Extract color stops from CSS gradient for mascot/accent bubbles
      const colorMatches = bgImg.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
      if (colorMatches && colorMatches.length > 0) {
        ctx.save();
        roundedRectPath(ctx, x, y, r.width, r.height, radius);
        const grad = ctx.createLinearGradient(x, y, x + r.width, y + r.height);
        grad.addColorStop(0, colorMatches[0]);
        grad.addColorStop(1, colorMatches[colorMatches.length - 1]);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }
    }

    const borderW = parseFloat(cs.borderTopWidth || "0") || 0;
    const borderCol = cs.borderTopColor;
    if (
      borderW > 0 &&
      borderCol &&
      borderCol !== "rgba(0, 0, 0, 0)" &&
      borderCol !== "transparent"
    ) {
      ctx.save();
      roundedRectPath(ctx, x + borderW / 2, y + borderW / 2, r.width - borderW, r.height - borderW, radius);
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = borderW;
      ctx.stroke();
      ctx.restore();
    }

    if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
      try {
        const testCanvas = document.createElement("canvas");
        testCanvas.width = 2;
        testCanvas.height = 2;
        const tCtx = testCanvas.getContext("2d");
        if (tCtx) {
          tCtx.drawImage(el, 0, 0, 2, 2);
          tCtx.getImageData(0, 0, 1, 1); // throws if cross-origin tainted
          ctx.save();
          roundedRectPath(ctx, x, y, r.width, r.height, radius);
          ctx.clip();
          ctx.drawImage(el, x, y, r.width, r.height);
          ctx.restore();
        }
      } catch {
        // Cross-origin image without CORS: paint soft accent placeholder so particles still spawn
        ctx.save();
        roundedRectPath(ctx, x, y, r.width, r.height, radius);
        ctx.fillStyle = "rgba(155, 108, 255, 0.55)";
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 2. Paint all visible text nodes at exact Range client rects
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const raw = node.nodeValue || "";
    const parent = node.parentElement;
    if (raw.trim() && parent) {
      const cs = window.getComputedStyle(parent);
      if (cs.display !== "none" && cs.visibility !== "hidden") {
        const range = document.createRange();
        range.selectNodeContents(node);
        const lineRects = range.getClientRects();
        if (lineRects.length > 0) {
          ctx.save();
          ctx.fillStyle = cs.color || "#f2f2f7";
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          ctx.textBaseline = "middle";
          if (lineRects.length === 1) {
            const lr = lineRects[0];
            ctx.fillText(raw.trim(), lr.left - rect.left, lr.top - rect.top + lr.height / 2, lr.width + 8);
          } else {
            const words = raw.trim().split(/\s+/);
            const perLine = Math.max(1, Math.ceil(words.length / lineRects.length));
            for (let i = 0; i < lineRects.length; i++) {
              const lr = lineRects[i];
              const chunk = words.slice(i * perLine, (i + 1) * perLine).join(" ");
              if (chunk) {
                ctx.fillText(chunk, lr.left - rect.left, lr.top - rect.top + lr.height / 2, lr.width + 8);
              }
            }
          }
          ctx.restore();
        }
      }
    }
    node = walker.nextNode();
  }

  return { canvas, rect };
}

function ensureOverlayCanvas(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!overlayCanvas) {
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.className = "thanos-snap-overlay-canvas";
    overlayCanvas.style.position = "fixed";
    overlayCanvas.style.inset = "0";
    overlayCanvas.style.width = "100vw";
    overlayCanvas.style.height = "100vh";
    overlayCanvas.style.pointerEvents = "none";
    overlayCanvas.style.zIndex = "99999";
    document.body.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext("2d");
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const targetW = Math.floor(window.innerWidth * dpr);
  const targetH = Math.floor(window.innerHeight * dpr);
  if (overlayCanvas.width !== targetW || overlayCanvas.height !== targetH) {
    overlayCanvas.width = targetW;
    overlayCanvas.height = targetH;
  }
  if (overlayCtx) {
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return overlayCtx;
}

function teardownOverlayIfIdle() {
  if (activeRenderers.length > 0) return;
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (overlayCanvas && overlayCanvas.parentNode) {
    overlayCanvas.parentNode.removeChild(overlayCanvas);
  }
  overlayCanvas = null;
  overlayCtx = null;
}

function spawnNextLinesIfReady(r: ActiveSnapRenderer, deltaMs: number) {
  if (r.line >= r.maxLine) {
    if (r.endRenderingTime === 0) {
      r.endRenderingTime = r.time;
    }
    r.animatedLineWidth = r.width;
    finalizeRendererSweep(r);
    return;
  }

  r.nextLineTime += deltaMs;
  const targetLine = Math.min(
    r.maxLine,
    Math.max(r.line + 1, Math.round(Math.min(1, r.nextLineTime / SWEEP_DURATION_MS) * r.maxLine)),
  );

  while (r.line < targetLine) {
    const x = Math.min(r.width - 1, r.line * r.perPx);
    for (let y = 0; y < r.height; y += r.perPx) {
      const idx = (y * r.width + x) * 4;
      const a = r.imageData[idx + 3];
      if (a <= 10) continue;

      const minRad = Math.max(1, Math.floor(r.perPx / 4));
      const initialR = minRad + Math.random() * Math.max(1, r.perPx - minRad);
      const initialAlpha = randomInitialAlpha(a);

      r.particles.push({
        initialX: x,
        initialY: y,
        initialR,
        r: initialR,
        x: r.offsetX + x,
        y: r.offsetY + y,
        red: r.imageData[idx],
        green: r.imageData[idx + 1],
        blue: r.imageData[idx + 2],
        initialAlpha,
        alpha: initialAlpha,
        lifeTime: calculateLifeTime(r.line, r.maxLine),
        velocityY: randomVelocity(1),
        translationY: randomTranslation(32, 1),
        translationX: randomTranslation(96, 1),
        time: 0,
      });
    }

    r.line += 1;
  }

  if (r.line >= r.maxLine) {
    if (r.endRenderingTime === 0) {
      r.endRenderingTime = r.time;
    }
    r.animatedLineWidth = r.width;
    finalizeRendererSweep(r);
  } else {
    r.animatedLineWidth = Math.min(r.width, r.line * r.perPx);
  }
}

function drawRenderer(ctx: CanvasRenderingContext2D, r: ActiveSnapRenderer, deltaMs: number): boolean {
  r.time += deltaMs;

  // Draw remaining intact slice of the message bubble (right of the sweep line)
  if (r.animatedLineWidth < r.width) {
    const remW = r.width - r.animatedLineWidth;
    ctx.drawImage(
      r.offscreen,
      r.animatedLineWidth,
      0,
      remW,
      r.height,
      r.offsetX + r.animatedLineWidth,
      r.offsetY,
      remW,
      r.height,
    );
  }

  const renderingLine = Math.min(1, r.line / Math.max(1, r.maxLine));
  const renderingEffect = Math.sqrt(renderingLine);
  const sqrtRenderingEffect = Math.sqrt(renderingEffect);

  for (let i = 0; i < r.particles.length; i++) {
    const p = r.particles[i];
    p.time += deltaMs;
    const fraction = p.time / p.lifeTime;
    if (fraction >= 1) continue;

    // Exact Aghajari/ThanosEffect Particle.kt trajectory
    let py =
      r.offsetY +
      p.initialY +
      ((p.initialY - r.centerY) / Math.max(1, r.centerY)) *
        p.translationY *
        fraction *
        renderingEffect;
    py -= Math.pow(fraction * p.velocityY, 2) * sqrtRenderingEffect;

    const px =
      r.offsetX +
      p.initialX +
      ((p.initialX - r.centerX) / Math.max(1, r.centerX)) *
        p.translationX *
        fraction *
        renderingEffect;

    const firstRenderingFraction = p.time / 130;
    let rad = p.initialR * 1.2;
    if (firstRenderingFraction > 1) {
      const rTimeFraction = (p.time - 130) / Math.max(1, p.lifeTime - 130);
      rad = Math.min(15, rad * (1 - rTimeFraction));
    } else {
      const originalSize = Math.max(rad, p.initialR);
      rad = originalSize - (originalSize - rad) * firstRenderingFraction;
    }

    const alpha = Math.max(0, p.initialAlpha * Math.min(1.2 - fraction, 1));
    if (rad <= 0.15 || alpha <= 0.01) continue;

    ctx.fillStyle = `rgba(${p.red},${p.green},${p.blue},${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!r.firstFrameFired) {
    r.firstFrameFired = true;
    r.firstFrameCallback?.();
  }

  if (r.endRenderingTime === 0) return true;
  const stillAnimating = r.time <= r.endRenderingTime + MAX_DURATION_MS;
  if (!stillAnimating) {
    finalizeRendererSweep(r);
  }
  return stillAnimating;
}

function stepAnimation(nowTs: number) {
  const ctx = ensureOverlayCanvas();
  if (!ctx || !overlayCanvas) {
    for (const r of activeRenderers) {
      finalizeRendererSweep(r);
    }
    activeRenderers = [];
    teardownOverlayIfIdle();
    return;
  }

  const rawDelta = lastFrameTs > 0 ? nowTs - lastFrameTs : 16.67;
  lastFrameTs = nowTs;
  const deltaMs = Math.min(64, Math.max(4, rawDelta));

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const remaining: ActiveSnapRenderer[] = [];
  for (const r of activeRenderers) {
    spawnNextLinesIfReady(r, deltaMs);
    if (drawRenderer(ctx, r, deltaMs)) {
      remaining.push(r);
    } else {
      finalizeRendererSweep(r);
    }
  }
  activeRenderers = remaining;

  if (activeRenderers.length > 0) {
    rafId = window.requestAnimationFrame(stepAnimation);
  } else {
    lastFrameTs = 0;
    teardownOverlayIfIdle();
  }
}

/**
 * Triggers the 1:1 Telegram Thanos Snap disintegration effect on a message DOM node by ID.
 * Invokes `onFirstFrameRendered` as soon as the particle canvas takes over visual rendering,
 * and `onSweepComplete` right when the disintegration sweep crosses the right edge of the bubble
 * (restoring element inline visibility so the unsent placeholder renders visibly).
 */
export function triggerMessageThanosSnapById(
  messageId: string,
  onFirstFrameRendered?: () => void,
  onSweepComplete?: () => void,
): boolean {
  if (typeof document === "undefined") {
    onFirstFrameRendered?.();
    onSweepComplete?.();
    return false;
  }
  if (activeSweepListenersById.has(messageId)) {
    if (onSweepComplete) {
      subscribeMessageSweepComplete(messageId, onSweepComplete);
    }
    onFirstFrameRendered?.();
    return true;
  }

  markMessageRecentlySnapped(messageId);

  const rowEl =
    document.getElementById(`message-${messageId}`) ||
    document.getElementById(`group-message-${messageId}`) ||
    document.getElementById(`community-message-${messageId}`) ||
    document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!rowEl) {
    onFirstFrameRendered?.();
    onSweepComplete?.();
    return false;
  }

  const targetEl =
    rowEl.querySelector<HTMLElement>(
      ".msg-bubble-wrap, .bubble, .sticker-bubble, .sticker-only-wrap",
    ) ||
    (rowEl.classList.contains("community-post") ? rowEl : rowEl);

  const snap = rasterizeElementToCanvas(targetEl);
  if (!snap) {
    onFirstFrameRendered?.();
    onSweepComplete?.();
    return false;
  }

  const ctxOff = snap.canvas.getContext("2d", { willReadFrequently: true });
  if (!ctxOff) {
    onFirstFrameRendered?.();
    onSweepComplete?.();
    return false;
  }

  let imgData: Uint8ClampedArray;
  try {
    imgData = ctxOff.getImageData(0, 0, snap.canvas.width, snap.canvas.height).data;
  } catch {
    onFirstFrameRendered?.();
    onSweepComplete?.();
    return false;
  }

  const pendingWeight = activeRenderers.length;
  const perPx = Math.min(10, 5 + pendingWeight * 2);
  const maxLine = Math.max(1, Math.floor(snap.canvas.width / perPx));

  activeSweepListenersById.set(messageId, new Set());

  const renderer: ActiveSnapRenderer = {
    messageId,
    targetEl,
    offscreen: snap.canvas,
    imageData: imgData,
    width: snap.canvas.width,
    height: snap.canvas.height,
    offsetX: snap.rect.left,
    offsetY: snap.rect.top,
    centerX: snap.canvas.width / 2,
    centerY: snap.canvas.height / 2,
    perPx,
    maxLine,
    line: 0,
    animatedLineWidth: 0,
    time: 0,
    nextLineTime: 0,
    endRenderingTime: 0,
    particles: [],
    firstFrameCallback: () => {
      if (!renderer.sweepCompleteFired) {
        hiddenTargetElById.set(messageId, targetEl);
        targetEl.style.opacity = "0";
        targetEl.style.pointerEvents = "none";
      }
      onFirstFrameRendered?.();
    },
    firstFrameFired: false,
    sweepCompleteFired: false,
    onSweepComplete,
    fallbackTimerId:
      typeof window !== "undefined"
        ? window.setTimeout(() => {
            finalizeRendererSweep(renderer);
          }, 850)
        : null,
  };

  activeRenderers.push(renderer);
  if (rafId === null) {
    lastFrameTs = performance.now();
    rafId = window.requestAnimationFrame(stepAnimation);
  }
  return true;
}

/**
 * Watches a conversation's message list for live -> unsent transitions on BOTH sender
 * and recipient sides:
 *  - When the peer unsends a message, holds the live message in DOM for one layout pass,
 *    triggers the Thanos Snap disintegration sweep on the live bubble, and reveals
 *    "This message was unsent" right as the sweep completes.
 *  - When the local sender clicks Unsend (which already started a sweep), holds the live
 *    DOM node until the sweep finishes so "This message was unsent" mounts cleanly with
 *    full opacity right after the bubble disintegrates.
 */
export function useUnsendThanosWatcher<T extends { id: string; unsentAt?: number }>(
  messages: T[],
  conversationKey: string,
): T[] {
  const [holdingById, setHoldingById] = useState<Record<string, T>>({});
  const stateRef = useRef<{
    key: string;
    liveById: Map<string, T>;
    pendingAutoSnap: Map<string, T>;
    pendingHoldSweep: Map<string, T>;
  }>({
    key: conversationKey,
    liveById: new Map(),
    pendingAutoSnap: new Map(),
    pendingHoldSweep: new Map(),
  });

  if (stateRef.current.key !== conversationKey) {
    stateRef.current = {
      key: conversationKey,
      liveById: new Map(),
      pendingAutoSnap: new Map(),
      pendingHoldSweep: new Map(),
    };
  }

  useEffect(() => {
    setHoldingById({});
  }, [conversationKey]);

  const effectiveMessages = messages.map((msg) => {
    if (!msg.unsentAt) {
      stateRef.current.liveById.set(msg.id, msg);
      return msg;
    }

    const held = holdingById[msg.id];
    if (held) {
      return held;
    }

    const prevLive = stateRef.current.liveById.get(msg.id);
    if (!prevLive) {
      return msg;
    }

    stateRef.current.liveById.delete(msg.id);

    if (isMessageSweepActive(msg.id)) {
      stateRef.current.pendingHoldSweep.set(msg.id, prevLive);
      return prevLive;
    }

    if (!hasMessageRecentlySnapped(msg.id)) {
      stateRef.current.pendingAutoSnap.set(msg.id, prevLive);
      return prevLive;
    }

    return msg;
  });

  useLayoutEffect(() => {
    const autoSnapEntries = Array.from(stateRef.current.pendingAutoSnap.entries());
    const holdSweepEntries = Array.from(stateRef.current.pendingHoldSweep.entries());
    stateRef.current.pendingAutoSnap.clear();
    stateRef.current.pendingHoldSweep.clear();

    if (autoSnapEntries.length === 0 && holdSweepEntries.length === 0) return;

    const releaseId = (id: string) => {
      setHoldingById((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    const nextHolds: Record<string, T> = {};

    for (const [msgId, liveMsg] of holdSweepEntries) {
      if (isMessageSweepActive(msgId)) {
        nextHolds[msgId] = liveMsg;
        subscribeMessageSweepComplete(msgId, () => releaseId(msgId));
      }
    }

    for (const [msgId, liveMsg] of autoSnapEntries) {
      const started = triggerMessageThanosSnapById(msgId, undefined, () => releaseId(msgId));
      if (started && isMessageSweepActive(msgId)) {
        nextHolds[msgId] = liveMsg;
      }
    }

    if (Object.keys(nextHolds).length > 0) {
      setHoldingById((prev) => ({ ...prev, ...nextHolds }));
    }
  });

  return effectiveMessages;
}
