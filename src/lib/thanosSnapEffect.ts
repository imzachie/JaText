/**
 * 1:1 Port of Aghajari/ThanosEffect (Telegram Message Disintegration Effect) for Web
 * Reference:
 *  - ThanosEffect-Core/EffectUtils.kt & ParticleLifeTime.kt
 *  - ThanosEffect-Canvas/Particle.kt & CanvasViewRenderer.kt
 *  - ThanosEffect-OpenGL/res/raw/dust_vertex.glsl & dust_fragment.glsl
 */

const ALPHAS = [0.3, 0.6, 1.0] as const;
const MIN_DURATION_MS = 1400;
const MAX_DURATION_MS = 2800;
const LINE_SENSITIVE_MS = 600;
const LINE_STEP_DELAY_MS = 16;

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
}

let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let activeRenderers: ActiveSnapRenderer[] = [];
let rafId: number | null = null;
let lastFrameTs = 0;

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

function spawnNextLinesIfReady(r: ActiveSnapRenderer, nowMs: number) {
  if (nowMs < r.nextLineTime) return;
  if (r.line >= r.maxLine) {
    if (r.endRenderingTime === 0) {
      r.endRenderingTime = r.time;
    }
    r.animatedLineWidth = r.width;
    return;
  }

  const renderCount = r.width > 300 ? 2 : 1;
  let emittedCols = 0;

  while (emittedCols < renderCount && r.line < r.maxLine) {
    const x = r.line * r.perPx;
    r.animatedLineWidth = x;

    let onThisLine = 0;
    for (let y = 0; y < r.height; y += r.perPx) {
      const idx = (y * r.width + x) * 4;
      const a = r.imageData[idx + 3];
      if (a <= 10) continue;

      onThisLine += 1;
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
    if (onThisLine > 0) {
      emittedCols += 1;
    }
  }

  r.nextLineTime = nowMs + LINE_STEP_DELAY_MS;
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

    const firstRenderingFraction = p.time / 200;
    let rad = p.initialR * 1.2;
    if (firstRenderingFraction > 1) {
      const rTimeFraction = (p.time - 200) / Math.max(1, p.lifeTime - 200);
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
  return r.time <= r.endRenderingTime + MAX_DURATION_MS;
}

function stepAnimation(nowTs: number) {
  const ctx = ensureOverlayCanvas();
  if (!ctx || !overlayCanvas) {
    activeRenderers = [];
    teardownOverlayIfIdle();
    return;
  }

  const rawDelta = lastFrameTs > 0 ? nowTs - lastFrameTs : 16.67;
  lastFrameTs = nowTs;
  const deltaMs = Math.min(64, Math.max(4, rawDelta));

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const nowWall = performance.now();
  const remaining: ActiveSnapRenderer[] = [];
  for (const r of activeRenderers) {
    spawnNextLinesIfReady(r, nowWall);
    if (drawRenderer(ctx, r, deltaMs)) {
      remaining.push(r);
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
 * Invokes `onFirstFrameRendered` as soon as the particle canvas takes over visual rendering.
 */
export function triggerMessageThanosSnapById(
  messageId: string,
  onFirstFrameRendered?: () => void,
): boolean {
  if (typeof document === "undefined") {
    onFirstFrameRendered?.();
    return false;
  }

  const rowEl =
    document.getElementById(`message-${messageId}`) ||
    document.getElementById(`group-message-${messageId}`) ||
    document.getElementById(`community-message-${messageId}`) ||
    document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!rowEl) {
    onFirstFrameRendered?.();
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
    return false;
  }

  const ctxOff = snap.canvas.getContext("2d", { willReadFrequently: true });
  if (!ctxOff) {
    onFirstFrameRendered?.();
    return false;
  }

  let imgData: Uint8ClampedArray;
  try {
    imgData = ctxOff.getImageData(0, 0, snap.canvas.width, snap.canvas.height).data;
  } catch {
    onFirstFrameRendered?.();
    return false;
  }

  const pendingWeight = activeRenderers.length;
  const perPx = Math.min(10, 5 + pendingWeight * 2);
  const maxLine = Math.max(1, Math.floor(snap.canvas.width / perPx));

  const renderer: ActiveSnapRenderer = {
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
      targetEl.style.opacity = "0";
      targetEl.style.pointerEvents = "none";
      onFirstFrameRendered?.();
    },
    firstFrameFired: false,
  };

  activeRenderers.push(renderer);
  if (rafId === null) {
    lastFrameTs = performance.now();
    rafId = window.requestAnimationFrame(stepAnimation);
  }
  return true;
}
