import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  computeBlendedGradientStops,
  computePreviewAccent,
  flushThemePersistence,
  getThemeConfig,
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  toSyncedThemePayload,
  updateThemeConfig,
} from "../lib/themeEngine";
import { useJaText } from "../lib/store";
import { CheckIcon, CloseIcon, PlusIcon } from "./UiIcons";

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperConstructor {
  new (): { open: () => Promise<EyeDropperResult> };
}

interface LiveDraftState {
  appearance: "dark" | "light";
  colors: string[];
  angle: number;
  intensity: number;
  selectedIdx: number;
  hue: number;
  sat: number;
  val: number;
}

interface FastGpuSliderHandle {
  setValue: (nextValue: number) => void;
  setAccentColor: (hex: string) => void;
}

interface FastGpuSliderProps {
  ariaLabel: string;
  min: number;
  max: number;
  initialValue: number;
  variant: "hue" | "accent";
  initialAccentColor?: string;
  onValueInput: (nextValue: number) => void;
}

const SLIDER_THUMB_RADIUS = 11;

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Zero-layout-thrash, GPU-composited touch slider built specifically for
 * 60/120 FPS response inside scrollable Android WebView sheets:
 * - Native passive:false touch guard eliminates scroll-arbitration touch-slop.
 * - Caches track geometry via ResizeObserver + once on pointerdown (zero getBoundingClientRect in move).
 * - Updates thumb via pure translate3d(x, 0, 0) and fill bar via pure scaleX(ratio).
 */
const FastGpuSlider = forwardRef<FastGpuSliderHandle, FastGpuSliderProps>(
  function FastGpuSlider(
    {
      ariaLabel,
      min,
      max,
      initialValue,
      variant,
      initialAccentColor = "#9b6cff",
      onValueInput,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const fillRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLSpanElement | null>(null);

    const widthRef = useRef(0);
    const dragRectRef = useRef<{ left: number; width: number } | null>(null);
    const draggingRef = useRef(false);
    const ratioRef = useRef(
      clamp01((initialValue - min) / Math.max(1, max - min)),
    );
    const valueRef = useRef(initialValue);
    const pendingClientXRef = useRef<number | null>(null);
    const sliderRafRef = useRef<number | null>(null);
    const onValueInputRef = useRef(onValueInput);
    useEffect(() => {
      onValueInputRef.current = onValueInput;
    }, [onValueInput]);

    function syncVisualFromRatio(ratio: number, discreteVal: number) {
      const clamped = clamp01(ratio);
      ratioRef.current = clamped;
      valueRef.current = discreteVal;

      const w = dragRectRef.current?.width ?? widthRef.current;
      if (thumbRef.current && w > 0) {
        const usable = Math.max(0, w - SLIDER_THUMB_RADIUS * 2);
        const x = SLIDER_THUMB_RADIUS + clamped * usable;
        thumbRef.current.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      }
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${clamped.toFixed(4)})`;
      }
      if (rootRef.current) {
        rootRef.current.setAttribute("aria-valuenow", String(discreteVal));
      }
    }

    useImperativeHandle(ref, () => ({
      setValue(nextValue: number) {
        const clampedVal = Math.max(min, Math.min(max, Math.round(nextValue)));
        const r = clamp01((clampedVal - min) / Math.max(1, max - min));
        syncVisualFromRatio(r, clampedVal);
      },
      setAccentColor(hex: string) {
        if (fillRef.current) {
          fillRef.current.style.backgroundColor = hex;
        }
      },
    }));

    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;

      const measure = (w: number) => {
        if (w <= 0) return;
        widthRef.current = w;
        syncVisualFromRatio(ratioRef.current, valueRef.current);
      };

      measure(el.clientWidth || el.getBoundingClientRect().width);

      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          measure(entry.contentRect.width);
        });
        ro.observe(el);
      }

      const preventScrollSteal = (ev: TouchEvent) => {
        if (ev.cancelable) ev.preventDefault();
      };
      el.addEventListener("touchstart", preventScrollSteal, { passive: false });
      el.addEventListener("touchmove", preventScrollSteal, { passive: false });

      return () => {
        if (sliderRafRef.current !== null) {
          window.cancelAnimationFrame(sliderRafRef.current);
          sliderRafRef.current = null;
        }
        ro?.disconnect();
        el.removeEventListener("touchstart", preventScrollSteal);
        el.removeEventListener("touchmove", preventScrollSteal);
      };
    }, [min, max]);

    function applyClientX(clientX: number) {
      const rect = dragRectRef.current;
      if (!rect || rect.width <= 0) return;
      const usable = Math.max(1, rect.width - SLIDER_THUMB_RADIUS * 2);
      const ratio = clamp01((clientX - rect.left - SLIDER_THUMB_RADIUS) / usable);
      const nextVal = Math.round(min + ratio * (max - min));
      const valChanged = nextVal !== valueRef.current;
      syncVisualFromRatio(ratio, nextVal);
      if (valChanged) {
        onValueInputRef.current(nextVal);
      }
    }

    function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      widthRef.current = rect.width;
      dragRectRef.current = { left: rect.left, width: rect.width };
      draggingRef.current = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore synthetic pointer capture errors
      }
      applyClientX(e.clientX);
    }

    function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
      if (!draggingRef.current) return;
      pendingClientXRef.current = e.clientX;
      if (sliderRafRef.current !== null) return;
      sliderRafRef.current = window.requestAnimationFrame(() => {
        sliderRafRef.current = null;
        const latestX = pendingClientXRef.current;
        if (latestX !== null) {
          pendingClientXRef.current = null;
          applyClientX(latestX);
        }
      });
    }

    function onPointerEnd() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (sliderRafRef.current !== null) {
        window.cancelAnimationFrame(sliderRafRef.current);
        sliderRafRef.current = null;
      }
      if (pendingClientXRef.current !== null) {
        const lastX = pendingClientXRef.current;
        pendingClientXRef.current = null;
        applyClientX(lastX);
      }
      dragRectRef.current = null;
    }

    function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
      let delta = 0;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
      else if (e.key === "PageDown") delta = -10;
      else if (e.key === "PageUp") delta = 10;
      else if (e.key === "Home") delta = min - valueRef.current;
      else if (e.key === "End") delta = max - valueRef.current;
      if (delta === 0) return;
      e.preventDefault();
      const nextVal = Math.max(min, Math.min(max, valueRef.current + delta));
      if (nextVal === valueRef.current) return;
      const r = clamp01((nextVal - min) / Math.max(1, max - min));
      syncVisualFromRatio(r, nextVal);
      onValueInputRef.current(nextVal);
    }

    return (
      <div
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={initialValue}
        className={`custom-gpu-slider ${
          variant === "hue" ? "is-hue" : "is-accent"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <div className="custom-gpu-slider-track">
          {variant === "accent" && (
            <div
              ref={fillRef}
              className="custom-gpu-slider-fill"
              style={{ backgroundColor: initialAccentColor }}
            />
          )}
        </div>
        <span ref={thumbRef} className="custom-gpu-slider-thumb" />
      </div>
    );
  },
);

function paintLinearGradientOnCanvas(
  ctx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  stops: string[],
  angleDeg: number,
): void {
  if (!ctx || w <= 0 || h <= 0) return;
  if (stops.length <= 1) {
    ctx.fillStyle = stops[0] ?? "#1d1d21";
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const halfLen = (Math.abs(w * dx) + Math.abs(h * dy)) * 0.5;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const grad = ctx.createLinearGradient(
    cx - dx * halfLen,
    cy - dy * halfLen,
    cx + dx * halfLen,
    cy + dy * halfLen,
  );
  const last = stops.length - 1;
  for (let i = 0; i <= last; i++) {
    grad.addColorStop(i / last, stops[i]);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function CustomThemeDrawer({
  onClose,
  onBackToSettings,
}: {
  onClose: () => void;
  onBackToSettings: () => void;
}) {
  const { me, saveProfile } = useJaText();

  const initialCfgRef = useRef(getThemeConfig());
  const initialCustom = initialCfgRef.current.custom;
  const initialColors =
    initialCustom.colors.length > 0 ? [...initialCustom.colors] : ["#efb4aa"];
  const initialHex = initialColors[0] ?? "#efb4aa";
  const initialHsv = hexToHsv(initialHex);

  const [closing, setClosing] = useState(false);
  const [appearance, setAppearance] = useState<"dark" | "light">(
    initialCustom.appearance,
  );
  const [stopSlots, setStopSlots] = useState<string[]>(initialColors);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [appliedToast, setAppliedToast] = useState(false);

  const draftRef = useRef<LiveDraftState>({
    appearance: initialCustom.appearance,
    colors: [...initialColors],
    angle: initialCustom.angle,
    intensity: initialCustom.intensity,
    selectedIdx: 0,
    hue: initialHsv.h,
    sat: initialHsv.s,
    val: initialHsv.v,
  });

  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const liveCanvasSizeRef = useRef<{ w: number; h: number }>({ w: 48, h: 84 });

  const stopsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopsCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const stopChipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const svBoxRef = useRef<HTMLDivElement | null>(null);
  const svThumbRef = useRef<HTMLSpanElement | null>(null);
  const svSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const svDragRectRef = useRef<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const svDraggingRef = useRef(false);
  const pendingSvPointRef = useRef<{ x: number; y: number } | null>(null);

  const hueSliderRef = useRef<FastGpuSliderHandle | null>(null);
  const angleSliderRef = useRef<FastGpuSliderHandle | null>(null);
  const intensitySliderRef = useRef<FastGpuSliderHandle | null>(null);

  const angleLabelRef = useRef<HTMLElement | null>(null);
  const intensityLabelRef = useRef<HTMLElement | null>(null);
  const hexSwatchRef = useRef<HTMLSpanElement | null>(null);
  const hexInputRef = useRef<HTMLInputElement | null>(null);
  const hexFocusedRef = useRef(false);
  const fallbackColorInputRef = useRef<HTMLInputElement | null>(null);
  const applyBtnRef = useRef<HTMLButtonElement | null>(null);

  const rafFrameRef = useRef<number | null>(null);
  const backdropPointerDownRef = useRef(false);
  const hasUncommittedChangesRef = useRef(
    initialCfgRef.current.kind !== "custom",
  );

  // Deduplication caches so unchanged properties never touch the DOM
  const lastPaintedHueIntRef = useRef<number>(-1);
  const lastStopsKeyRef = useRef<string>("");
  const lastActiveHexRef = useRef<string>("");
  const lastAccentKeyRef = useRef<string>("");

  function positionSvThumbOnly(s: number, v: number) {
    const thumb = svThumbRef.current;
    const w = svDragRectRef.current?.width ?? svSizeRef.current.width;
    const h = svDragRectRef.current?.height ?? svSizeRef.current.height;
    if (!thumb || w <= 0 || h <= 0) return;
    const x = Math.max(0, Math.min(w, s * w));
    const y = Math.max(0, Math.min(h, (1 - v) * h));
    thumb.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  }

  function paintFrameNow() {
    const d = draftRef.current;

    if (pendingSvPointRef.current) {
      const pt = pendingSvPointRef.current;
      pendingSvPointRef.current = null;
      const rect = svDragRectRef.current;
      if (rect && rect.width > 0 && rect.height > 0) {
        const s = clamp01((pt.x - rect.left) / rect.width);
        const v = clamp01(1 - (pt.y - rect.top) / rect.height);
        d.sat = s;
        d.val = v;
        const cIdx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
        d.colors[cIdx] = hsvToHex(d.hue, s, v);
        hasUncommittedChangesRef.current = true;
      }
    }

    const idx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
    const activeHex = d.colors[idx] ?? "#efb4aa";
    const hueInt = Math.round(d.hue);

    if (hueInt !== lastPaintedHueIntRef.current && svBoxRef.current) {
      lastPaintedHueIntRef.current = hueInt;
      svBoxRef.current.style.backgroundColor = hsvToHex(d.hue, 1, 1);
    }

    positionSvThumbOnly(d.sat, d.val);

    if (activeHex !== lastActiveHexRef.current) {
      lastActiveHexRef.current = activeHex;
      const activeChip = stopChipRefs.current[idx];
      if (activeChip) {
        activeChip.style.backgroundColor = activeHex;
      }
      if (hexSwatchRef.current) {
        hexSwatchRef.current.style.backgroundColor = activeHex;
      }
      if (hexInputRef.current && !hexFocusedRef.current) {
        hexInputRef.current.value = activeHex.toUpperCase();
      }
      if (fallbackColorInputRef.current) {
        fallbackColorInputRef.current.value = activeHex;
      }
    }

    const stopsKey = d.colors.join("|");
    if (stopsKey !== lastStopsKeyRef.current) {
      lastStopsKeyRef.current = stopsKey;
      paintLinearGradientOnCanvas(
        stopsCtxRef.current,
        96,
        2,
        d.colors,
        90,
      );
    }

    const accentKey = `${d.appearance}|${d.colors[0] ?? ""}`;
    if (accentKey !== lastAccentKeyRef.current) {
      lastAccentKeyRef.current = accentKey;
      const { accent, accentDark } = computePreviewAccent(
        d.appearance,
        d.colors[0] ?? "#7c5cff",
      );
      angleSliderRef.current?.setAccentColor(accent);
      intensitySliderRef.current?.setAccentColor(accent);
      if (applyBtnRef.current) {
        applyBtnRef.current.style.backgroundColor = accent;
        applyBtnRef.current.style.color = accentDark;
      }
    }

    if (angleLabelRef.current) {
      const nextAngleText = `${d.angle}°`;
      if (angleLabelRef.current.textContent !== nextAngleText) {
        angleLabelRef.current.textContent = nextAngleText;
      }
    }

    if (intensityLabelRef.current) {
      const nextIntText = `${d.intensity}%`;
      if (intensityLabelRef.current.textContent !== nextIntText) {
        intensityLabelRef.current.textContent = nextIntText;
      }
    }

    const blended = computeBlendedGradientStops({
      appearance: d.appearance,
      colors: d.colors,
      intensity: d.intensity,
    });
    const { w, h } = liveCanvasSizeRef.current;
    paintLinearGradientOnCanvas(liveCtxRef.current, w, h, blended, d.angle);
  }

  function scheduleFastPaint() {
    if (rafFrameRef.current !== null) return;
    rafFrameRef.current = window.requestAnimationFrame(() => {
      rafFrameRef.current = null;
      paintFrameNow();
    });
  }

  function commitDraftToEngine(forceSyncNow = false) {
    if (rafFrameRef.current !== null) {
      window.cancelAnimationFrame(rafFrameRef.current);
      rafFrameRef.current = null;
    }
    if (!hasUncommittedChangesRef.current && !forceSyncNow) {
      flushThemePersistence();
      return;
    }
    hasUncommittedChangesRef.current = false;
    const d = draftRef.current;
    const latest = updateThemeConfig((prev) => ({
      ...prev,
      kind: "custom",
      custom: {
        appearance: d.appearance,
        colors: [...d.colors],
        angle: d.angle,
        intensity: d.intensity,
      },
    }));
    flushThemePersistence();

    if (latest.syncAcrossDevices && me) {
      void saveProfile({
        displayName: me.displayName,
        username: me.username,
        bio: me.bio,
        pronouns: me.pronouns,
        avatarColor: me.avatarColor,
        syncedTheme: toSyncedThemePayload(latest),
      }).catch(() => undefined);
    }
  }

  const commitRef = useRef(commitDraftToEngine);
  useEffect(() => {
    commitRef.current = commitDraftToEngine;
  });

  // Setup lightweight canvases, ResizeObserver on SV palette, passive:false touch guard, and safe lifecycle flush
  useEffect(() => {
    const liveCanvas = liveCanvasRef.current;
    if (liveCanvas) {
      const syncAspect = () => {
        const vw = Math.max(1, window.innerWidth);
        const vh = Math.max(1, window.innerHeight);
        const w = 48;
        const h = Math.max(32, Math.min(128, Math.round(w * (vh / vw))));
        if (liveCanvas.width !== w || liveCanvas.height !== h) {
          liveCanvas.width = w;
          liveCanvas.height = h;
        }
        liveCanvasSizeRef.current = { w, h };
        liveCtxRef.current = liveCanvas.getContext("2d", { alpha: false });
      };
      syncAspect();
    }

    const stopsCanvas = stopsCanvasRef.current;
    if (stopsCanvas) {
      stopsCtxRef.current = stopsCanvas.getContext("2d", { alpha: false });
    }

    const svEl = svBoxRef.current;
    let ro: ResizeObserver | null = null;
    const preventSvScroll = (ev: TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
    };

    if (svEl) {
      const rect = svEl.getBoundingClientRect();
      svSizeRef.current = { width: rect.width, height: rect.height };

      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          svSizeRef.current = {
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          };
          positionSvThumbOnly(draftRef.current.sat, draftRef.current.val);
        });
        ro.observe(svEl);
      }

      svEl.addEventListener("touchstart", preventSvScroll, { passive: false });
      svEl.addEventListener("touchmove", preventSvScroll, { passive: false });
    }

    lastPaintedHueIntRef.current = -1;
    lastStopsKeyRef.current = "";
    lastActiveHexRef.current = "";
    lastAccentKeyRef.current = "";
    paintFrameNow();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        commitRef.current(false);
      }
    };
    const onPageHide = () => {
      commitRef.current(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      if (rafFrameRef.current !== null) {
        window.cancelAnimationFrame(rafFrameRef.current);
        rafFrameRef.current = null;
      }
      ro?.disconnect();
      if (svEl) {
        svEl.removeEventListener("touchstart", preventSvScroll);
        svEl.removeEventListener("touchmove", preventSvScroll);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      commitRef.current(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectStopIndex(nextIdx: number, colsOverride?: string[]) {
    const d = draftRef.current;
    const cols = colsOverride ?? d.colors;
    const clampedIdx = Math.max(0, Math.min(nextIdx, cols.length - 1));
    const hex = cols[clampedIdx] ?? "#efb4aa";
    const parsed = hexToHsv(hex);
    const preservedHue =
      parsed.s < 0.015 || parsed.v < 0.015 ? d.hue : parsed.h;

    d.selectedIdx = clampedIdx;
    d.hue = preservedHue;
    d.sat = parsed.s;
    d.val = parsed.v;

    setSelectedIdx(clampedIdx);
    hueSliderRef.current?.setValue(preservedHue);
    lastActiveHexRef.current = "";
    lastPaintedHueIntRef.current = -1;
    scheduleFastPaint();
  }

  function updateActiveStopDirect(nextHexRaw: string) {
    const d = draftRef.current;
    const idx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
    const fallback = d.colors[idx] ?? "#efb4aa";
    const clean = normalizeHexColor(nextHexRaw, fallback);
    const parsed = hexToHsv(clean);
    const preservedHue =
      parsed.s < 0.015 || parsed.v < 0.015 ? d.hue : parsed.h;

    d.hue = preservedHue;
    d.sat = parsed.s;
    d.val = parsed.v;
    d.colors[idx] = clean;
    hasUncommittedChangesRef.current = true;

    hueSliderRef.current?.setValue(preservedHue);
    lastActiveHexRef.current = "";
    lastPaintedHueIntRef.current = -1;
    scheduleFastPaint();
  }

  function onSvPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    svSizeRef.current = { width: rect.width, height: rect.height };
    svDragRectRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    svDraggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic pointer capture errors
    }
    pendingSvPointRef.current = { x: e.clientX, y: e.clientY };
    paintFrameNow();
  }

  function onSvPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!svDraggingRef.current) return;
    pendingSvPointRef.current = { x: e.clientX, y: e.clientY };
    scheduleFastPaint();
  }

  function onSvPointerUp() {
    if (!svDraggingRef.current) return;
    svDraggingRef.current = false;
    if (pendingSvPointRef.current) {
      paintFrameNow();
    }
    svDragRectRef.current = null;
  }

  function handleHueInput(nextHue: number) {
    const d = draftRef.current;
    d.hue = nextHue;
    const s = Math.max(0.04, d.sat);
    const v = Math.max(0.08, d.val);
    d.sat = s;
    d.val = v;
    const idx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
    d.colors[idx] = hsvToHex(nextHue, s, v);
    hasUncommittedChangesRef.current = true;
    scheduleFastPaint();
  }

  function handleAngleInput(nextAngle: number) {
    draftRef.current.angle = nextAngle;
    hasUncommittedChangesRef.current = true;
    scheduleFastPaint();
  }

  function handleIntensityInput(nextIntensity: number) {
    draftRef.current.intensity = nextIntensity;
    hasUncommittedChangesRef.current = true;
    scheduleFastPaint();
  }

  function handleModeChange(nextMode: "dark" | "light") {
    if (draftRef.current.appearance === nextMode) return;
    draftRef.current.appearance = nextMode;
    hasUncommittedChangesRef.current = true;
    setAppearance(nextMode);
    scheduleFastPaint();
  }

  function handleAddColour() {
    const d = draftRef.current;
    if (d.colors.length >= 5) return;
    const shifted = hsvToHex(
      (d.hue + 48) % 360,
      Math.max(0.32, d.sat),
      Math.max(0.55, d.val),
    );
    const nextColors = [...d.colors, shifted].slice(0, 5);
    const nextIdx = nextColors.length - 1;
    d.colors = nextColors;
    hasUncommittedChangesRef.current = true;
    setStopSlots([...nextColors]);
    selectStopIndex(nextIdx, nextColors);
  }

  function handleRemoveColour() {
    const d = draftRef.current;
    if (d.colors.length <= 1) return;
    const removeAt = Math.min(d.selectedIdx, d.colors.length - 1);
    const nextColors = d.colors.filter((_, i) => i !== removeAt);
    const nextIdx = Math.max(0, removeAt - 1);
    d.colors = nextColors;
    hasUncommittedChangesRef.current = true;
    setStopSlots([...nextColors]);
    selectStopIndex(nextIdx, nextColors);
  }

  async function handleEyedropper() {
    const win = window as unknown as { EyeDropper?: EyeDropperConstructor };
    if (typeof win.EyeDropper === "function") {
      try {
        const dropper = new win.EyeDropper();
        const result = await dropper.open();
        if (result?.sRGBHex) {
          updateActiveStopDirect(result.sRGBHex);
        }
        return;
      } catch {
        return;
      }
    }
    fallbackColorInputRef.current?.click();
  }

  function handleRandomise() {
    const d = draftRef.current;
    const baseHue = Math.floor(Math.random() * 360);
    const isLight = d.appearance === "light";
    const c1 = hsvToHex(baseHue, isLight ? 0.34 : 0.62, isLight ? 0.96 : 0.58);
    const c2 = hsvToHex(
      (baseHue + 52) % 360,
      isLight ? 0.3 : 0.56,
      isLight ? 0.94 : 0.48,
    );
    const c3 = hsvToHex(
      (baseHue + 115) % 360,
      isLight ? 0.36 : 0.64,
      isLight ? 0.95 : 0.62,
    );
    const nextColors = [c1, c2, c3];
    d.colors = nextColors;
    hasUncommittedChangesRef.current = true;
    setStopSlots([...nextColors]);
    selectStopIndex(0, nextColors);
  }

  function closeWithAnim(cb: () => void) {
    if (closing) return;
    commitDraftToEngine(false);
    setClosing(true);
    window.setTimeout(cb, 165);
  }

  const safeIdx = Math.min(selectedIdx, Math.max(0, stopSlots.length - 1));
  const currentActiveHex =
    draftRef.current.colors[safeIdx] ?? stopSlots[safeIdx] ?? "#efb4aa";
  const pureHueHex = hsvToHex(draftRef.current.hue, 1, 1);
  const liveAccent = computePreviewAccent(
    draftRef.current.appearance,
    draftRef.current.colors[0] ?? currentActiveHex,
  );

  return (
    <>
      <canvas
        ref={liveCanvasRef}
        width={48}
        height={84}
        className={`custom-theme-live-backdrop ${closing ? "closing" : ""}`}
        aria-hidden="true"
        onPointerDown={(e) => {
          backdropPointerDownRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (backdropPointerDownRef.current && e.target === e.currentTarget) {
            backdropPointerDownRef.current = false;
            closeWithAnim(onClose);
          }
        }}
      />
      <aside
        className={`custom-theme-drawer ${closing ? "closing" : ""}`}
        data-drawer-mode={appearance}
        aria-label="Customise your theme"
      >
        <div className="custom-theme-drawer-head">
          <h3>Customise your theme</h3>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close theme customiser"
            onClick={() => closeWithAnim(onClose)}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="custom-theme-drawer-body">
          <div className="custom-theme-group">
            <span className="custom-theme-label">Appearance</span>
            <div
              className="custom-theme-mode-switch"
              role="group"
              aria-label="Base appearance"
            >
              <button
                type="button"
                className={`custom-theme-mode-btn ${
                  appearance === "dark" ? "active" : ""
                }`}
                onClick={() => handleModeChange("dark")}
                title="Dark appearance"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
                <span>Dark</span>
              </button>
              <button
                type="button"
                className={`custom-theme-mode-btn ${
                  appearance === "light" ? "active" : ""
                }`}
                onClick={() => handleModeChange("light")}
                title="Light appearance"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="4.5" />
                  <path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
                </svg>
                <span>Light</span>
              </button>
            </div>
          </div>

          <div className="custom-theme-group">
            <span className="custom-theme-label">Colours</span>
            <div className="custom-theme-stops-bar">
              <canvas
                ref={stopsCanvasRef}
                width={96}
                height={2}
                className="custom-theme-stops-canvas"
                aria-hidden="true"
              />
              {stopSlots.map((slotHex, idx) => {
                const liveHex = draftRef.current.colors[idx] ?? slotHex;
                return (
                  <button
                    type="button"
                    key={idx}
                    ref={(el) => {
                      stopChipRefs.current[idx] = el;
                    }}
                    className={`custom-theme-stop-chip ${
                      idx === safeIdx ? "active" : ""
                    }`}
                    style={{ backgroundColor: liveHex }}
                    aria-label={`Colour stop ${idx + 1}`}
                    onClick={() => selectStopIndex(idx)}
                  />
                );
              })}
            </div>

            <div
              ref={svBoxRef}
              className="custom-theme-sv-canvas"
              style={{ backgroundColor: pureHueHex }}
              onPointerDown={onSvPointerDown}
              onPointerMove={onSvPointerMove}
              onPointerUp={onSvPointerUp}
              onPointerCancel={onSvPointerUp}
            >
              <div className="custom-theme-sv-white" />
              <div className="custom-theme-sv-black" />
              <span ref={svThumbRef} className="custom-theme-sv-thumb" />
            </div>

            <FastGpuSlider
              ref={hueSliderRef}
              ariaLabel="Colour hue"
              min={0}
              max={360}
              initialValue={Math.round(initialHsv.h)}
              variant="hue"
              onValueInput={handleHueInput}
            />

            <div className="custom-theme-hex-row">
              <span
                ref={hexSwatchRef}
                className="custom-theme-hex-swatch"
                style={{ backgroundColor: currentActiveHex }}
              />
              <input
                ref={hexInputRef}
                type="text"
                className="custom-theme-hex-input"
                defaultValue={currentActiveHex.toUpperCase()}
                maxLength={7}
                aria-label="Hex colour code"
                onFocus={() => {
                  hexFocusedRef.current = true;
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#?[0-9a-fA-F]{6}$/.test(val.trim())) {
                    updateActiveStopDirect(val);
                  }
                }}
                onBlur={() => {
                  hexFocusedRef.current = false;
                  const idx = Math.min(
                    draftRef.current.selectedIdx,
                    Math.max(0, draftRef.current.colors.length - 1),
                  );
                  const latestHex = (
                    draftRef.current.colors[idx] ?? "#efb4aa"
                  ).toUpperCase();
                  if (hexInputRef.current) {
                    hexInputRef.current.value = latestHex;
                  }
                }}
              />
              <input
                ref={fallbackColorInputRef}
                type="color"
                defaultValue={currentActiveHex}
                hidden
                onChange={(e) => updateActiveStopDirect(e.target.value)}
              />
              <button
                type="button"
                className="custom-theme-hex-icon-btn"
                title="Pick colour"
                aria-label="Pick colour"
                onClick={() => void handleEyedropper()}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m2 22 1-1h3l9-9" />
                  <path d="M3 21v-3l9-9" />
                  <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
                </svg>
              </button>
              <button
                type="button"
                className="custom-theme-hex-icon-btn"
                title="Remove colour stop"
                aria-label="Remove colour stop"
                disabled={stopSlots.length <= 1}
                onClick={handleRemoveColour}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {stopSlots.length < 5 && (
              <button
                type="button"
                className="custom-theme-add-stop-btn"
                onClick={handleAddColour}
              >
                <PlusIcon size={15} />
                <span>Add Colour</span>
              </button>
            )}
          </div>

          <div className="custom-theme-group">
            <span className="custom-theme-label">Controls</span>

            <div className="custom-theme-slider-field">
              <div className="custom-theme-slider-head">
                <span>Gradient Direction</span>
                <strong ref={angleLabelRef}>{initialCustom.angle}°</strong>
              </div>
              <FastGpuSlider
                ref={angleSliderRef}
                ariaLabel="Gradient direction"
                min={0}
                max={360}
                initialValue={initialCustom.angle}
                variant="accent"
                initialAccentColor={liveAccent.accent}
                onValueInput={handleAngleInput}
              />
            </div>

            <div className="custom-theme-slider-field">
              <div className="custom-theme-slider-head">
                <span>Colour Intensity</span>
                <strong ref={intensityLabelRef}>
                  {initialCustom.intensity}%
                </strong>
              </div>
              <FastGpuSlider
                ref={intensitySliderRef}
                ariaLabel="Colour intensity"
                min={10}
                max={100}
                initialValue={initialCustom.intensity}
                variant="accent"
                initialAccentColor={liveAccent.accent}
                onValueInput={handleIntensityInput}
              />
            </div>
          </div>
        </div>

        <div className="custom-theme-drawer-foot">
          <div className="custom-theme-foot-top">
            <button
              type="button"
              className="ghost-btn custom-theme-random-btn"
              title="Shuffle colours"
              onClick={handleRandomise}
            >
              Shuffle
            </button>
            <button
              ref={applyBtnRef}
              type="button"
              className="primary-btn custom-theme-apply-btn"
              style={{
                backgroundColor: liveAccent.accent,
                color: liveAccent.accentDark,
              }}
              onClick={() => {
                commitDraftToEngine(true);
                setAppliedToast(true);
                window.setTimeout(() => setAppliedToast(false), 1600);
              }}
            >
              {appliedToast ? (
                <>
                  <CheckIcon size={15} /> Applied
                </>
              ) : (
                "Apply Theme"
              )}
            </button>
          </div>

          <button
            type="button"
            className="custom-theme-back-btn"
            onClick={() => closeWithAnim(onBackToSettings)}
          >
            Back to Settings
          </button>
        </div>
      </aside>
    </>
  );
}
