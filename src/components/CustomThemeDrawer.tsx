import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildCssGradientFromSpec,
  flushThemePersistence,
  getThemeConfig,
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  toSyncedThemePayload,
  updateThemeConfig,
  useJaTextTheme,
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

function buildStopsGradientCss(cols: string[]): string {
  if (cols.length <= 1) return cols[0] ?? "#efb4aa";
  return `linear-gradient(90deg, ${cols
    .map((c, idx) => `${c} ${Math.round((idx / (cols.length - 1)) * 100)}%`)
    .join(", ")})`;
}

export function CustomThemeDrawer({
  onClose,
  onBackToSettings,
}: {
  onClose: () => void;
  onBackToSettings: () => void;
}) {
  const { me, saveProfile } = useJaText();
  const theme = useJaTextTheme();
  const [closing, setClosing] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [hexDraft, setHexDraft] = useState(
    () => (theme.custom.colors[0] ?? "#efb4aa").toUpperCase(),
  );
  const [appliedToast, setAppliedToast] = useState(false);

  const drawerRef = useRef<HTMLElement | null>(null);
  const liveBackdropRef = useRef<HTMLDivElement | null>(null);
  const stopsBarRef = useRef<HTMLDivElement | null>(null);
  const stopChipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const svBoxRef = useRef<HTMLDivElement | null>(null);
  const svThumbRef = useRef<HTMLSpanElement | null>(null);
  const svRectRef = useRef<DOMRect | null>(null);
  const hueInputRef = useRef<HTMLInputElement | null>(null);
  const angleInputRef = useRef<HTMLInputElement | null>(null);
  const angleLabelRef = useRef<HTMLElement | null>(null);
  const intensityInputRef = useRef<HTMLInputElement | null>(null);
  const intensityLabelRef = useRef<HTMLElement | null>(null);
  const hexSwatchRef = useRef<HTMLSpanElement | null>(null);
  const hexInputRef = useRef<HTMLInputElement | null>(null);
  const fallbackColorInputRef = useRef<HTMLInputElement | null>(null);

  const isDraggingRef = useRef(false);
  const rafFrameRef = useRef<number | null>(null);

  const colors = theme.custom.colors.length > 0 ? theme.custom.colors : ["#efb4aa"];
  const safeIdx = Math.min(selectedIdx, colors.length - 1);
  const activeHex = colors[safeIdx] ?? "#efb4aa";
  const initialHsv = hexToHsv(activeHex);

  const draftRef = useRef<LiveDraftState>({
    appearance: theme.custom.appearance,
    colors: [...colors],
    angle: theme.custom.angle,
    intensity: theme.custom.intensity,
    selectedIdx: safeIdx,
    hue: initialHsv.h,
    sat: initialHsv.s,
    val: initialHsv.v,
  });

  // Switch live preview to custom mode immediately on open
  useEffect(() => {
    if (getThemeConfig().kind !== "custom") {
      updateThemeConfig({ kind: "custom" });
    }
    return () => {
      if (rafFrameRef.current !== null) {
        window.cancelAnimationFrame(rafFrameRef.current);
        rafFrameRef.current = null;
      }
      flushThemePersistence();
    };
  }, []);

  // Keep draftRef & uncontrolled slider/picker DOM synced whenever non-drag state updates
  useEffect(() => {
    if (isDraggingRef.current) return;
    const cols = theme.custom.colors.length > 0 ? theme.custom.colors : ["#efb4aa"];
    const idx = Math.min(selectedIdx, cols.length - 1);
    const hex = cols[idx] ?? "#efb4aa";
    const parsed = hexToHsv(hex);
    const prevHue = draftRef.current.hue;
    const preservedHue = parsed.s < 0.015 || parsed.v < 0.015 ? prevHue : parsed.h;

    draftRef.current = {
      appearance: theme.custom.appearance,
      colors: [...cols],
      angle: theme.custom.angle,
      intensity: theme.custom.intensity,
      selectedIdx: idx,
      hue: preservedHue,
      sat: parsed.s,
      val: parsed.v,
    };

    setHexDraft(hex.toUpperCase());
    if (hueInputRef.current) hueInputRef.current.value = String(Math.round(preservedHue));
    if (angleInputRef.current) angleInputRef.current.value = String(theme.custom.angle);
    if (angleLabelRef.current) angleLabelRef.current.textContent = `${theme.custom.angle}°`;
    if (intensityInputRef.current) {
      intensityInputRef.current.value = String(theme.custom.intensity);
    }
    if (intensityLabelRef.current) {
      intensityLabelRef.current.textContent = `${theme.custom.intensity}%`;
    }
    positionSvThumb(parsed.s, parsed.v, hex, preservedHue);
  }, [
    selectedIdx,
    theme.custom.appearance,
    theme.custom.colors,
    theme.custom.angle,
    theme.custom.intensity,
  ]);

  function positionSvThumb(s: number, v: number, hex: string, hue: number) {
    const box = svBoxRef.current;
    const thumb = svThumbRef.current;
    if (box) {
      box.style.backgroundColor = hsvToHex(hue, 1, 1);
    }
    if (thumb && box) {
      const rect = svRectRef.current ?? box.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const x = Math.max(0, Math.min(rect.width, s * rect.width));
        const y = Math.max(0, Math.min(rect.height, (1 - v) * rect.height));
        thumb.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
      thumb.style.backgroundColor = hex;
    }
  }

  /**
   * 120 FPS zero-lag DOM painter during active touch/mouse dragging:
   * Updates ONLY the isolated live backdrop + scoped drawer CSS variables + picker thumb,
   * avoiding :root 2,500-node style invalidation and React re-renders until finger lift.
   */
  function scheduleFastDragPaint() {
    if (rafFrameRef.current !== null) return;
    rafFrameRef.current = window.requestAnimationFrame(() => {
      rafFrameRef.current = null;
      const d = draftRef.current;
      const idx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
      const hex = d.colors[idx] ?? "#efb4aa";

      positionSvThumb(d.sat, d.val, hex, d.hue);

      if (stopsBarRef.current) {
        stopsBarRef.current.style.background = buildStopsGradientCss(d.colors);
      }
      const activeChip = stopChipRefs.current[idx];
      if (activeChip) {
        activeChip.style.backgroundColor = hex;
      }
      if (hexSwatchRef.current) {
        hexSwatchRef.current.style.backgroundColor = hex;
      }
      if (hexInputRef.current && document.activeElement !== hexInputRef.current) {
        hexInputRef.current.value = hex.toUpperCase();
      }
      if (angleLabelRef.current) {
        angleLabelRef.current.textContent = `${d.angle}°`;
      }
      if (intensityLabelRef.current) {
        intensityLabelRef.current.textContent = `${d.intensity}%`;
      }

      const computed = buildCssGradientFromSpec({
        appearance: d.appearance,
        colors: d.colors,
        angle: d.angle,
        intensity: d.intensity,
      });

      if (liveBackdropRef.current) {
        liveBackdropRef.current.style.opacity = "1";
        liveBackdropRef.current.style.background = computed.backgroundCss;
      }

      const drawer = drawerRef.current;
      if (drawer) {
        drawer.style.setProperty("--panel", computed.panel);
        drawer.style.setProperty("--panel-2", computed.panel2);
        drawer.style.setProperty("--border", computed.border);
        drawer.style.setProperty("--text", computed.text);
        drawer.style.setProperty("--muted", computed.muted);
        drawer.style.setProperty("--accent", computed.accent);
        drawer.style.setProperty("--accent-dark", computed.accentDark);
      }
    });
  }

  function clearDrawerInlineOverrides() {
    if (liveBackdropRef.current) {
      liveBackdropRef.current.style.opacity = "0";
    }
    const drawer = drawerRef.current;
    if (drawer) {
      drawer.style.removeProperty("--panel");
      drawer.style.removeProperty("--panel-2");
      drawer.style.removeProperty("--border");
      drawer.style.removeProperty("--text");
      drawer.style.removeProperty("--muted");
      drawer.style.removeProperty("--accent");
      drawer.style.removeProperty("--accent-dark");
    }
  }

  function commitDraftToEngine() {
    isDraggingRef.current = false;
    if (rafFrameRef.current !== null) {
      window.cancelAnimationFrame(rafFrameRef.current);
      rafFrameRef.current = null;
    }
    const d = draftRef.current;
    const idx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
    const currentHex = (d.colors[idx] ?? "#efb4aa").toUpperCase();
    setHexDraft(currentHex);
    clearDrawerInlineOverrides();
    updateThemeConfig((prev) => ({
      ...prev,
      kind: "custom",
      custom: {
        appearance: d.appearance,
        colors: [...d.colors],
        angle: d.angle,
        intensity: d.intensity,
      },
    }));
  }

  function updateActiveStopDirect(nextHexRaw: string) {
    const clean = normalizeHexColor(nextHexRaw, activeHex);
    const parsed = hexToHsv(clean);
    draftRef.current.hue = parsed.h;
    draftRef.current.sat = parsed.s;
    draftRef.current.val = parsed.v;
    const nextCols = [...draftRef.current.colors];
    const idx = Math.min(safeIdx, Math.max(0, nextCols.length - 1));
    nextCols[idx] = clean;
    draftRef.current.colors = nextCols;
    commitDraftToEngine();
  }

  function updateSvFromClientPoint(clientX: number, clientY: number) {
    const rect = svRectRef.current ?? svBoxRef.current?.getBoundingClientRect() ?? null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const d = draftRef.current;
    d.sat = s;
    d.val = v;
    const idx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
    d.colors[idx] = hsvToHex(d.hue, s, v);
    scheduleFastDragPaint();
  }

  function onSvPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    isDraggingRef.current = true;
    svRectRef.current = e.currentTarget.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic pointer capture errors
    }
    updateSvFromClientPoint(e.clientX, e.clientY);
  }

  function onSvPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    updateSvFromClientPoint(e.clientX, e.clientY);
  }

  function onSvPointerUp() {
    if (!isDraggingRef.current) return;
    svRectRef.current = null;
    commitDraftToEngine();
  }

  function handleHueInput(nextHue: number) {
    isDraggingRef.current = true;
    const d = draftRef.current;
    d.hue = nextHue;
    const s = Math.max(0.04, d.sat);
    const v = Math.max(0.08, d.val);
    d.sat = s;
    d.val = v;
    const idx = Math.min(d.selectedIdx, Math.max(0, d.colors.length - 1));
    d.colors[idx] = hsvToHex(nextHue, s, v);
    scheduleFastDragPaint();
  }

  function handleAngleInput(nextAngle: number) {
    isDraggingRef.current = true;
    draftRef.current.angle = nextAngle;
    scheduleFastDragPaint();
  }

  function handleIntensityInput(nextIntensity: number) {
    isDraggingRef.current = true;
    draftRef.current.intensity = nextIntensity;
    scheduleFastDragPaint();
  }

  function handleSliderRelease() {
    if (!isDraggingRef.current) return;
    commitDraftToEngine();
  }

  function handleAddColour() {
    if (colors.length >= 5) return;
    const d = draftRef.current;
    const shifted = hsvToHex((d.hue + 48) % 360, Math.max(0.32, d.sat), Math.max(0.55, d.val));
    const nextIndex = colors.length;
    updateThemeConfig((prev) => ({
      ...prev,
      kind: "custom",
      custom: {
        ...prev.custom,
        colors: [...prev.custom.colors, shifted].slice(0, 5),
      },
    }));
    setSelectedIdx(nextIndex);
  }

  function handleRemoveColour() {
    if (colors.length <= 1) return;
    const nextIdx = Math.max(0, safeIdx - 1);
    updateThemeConfig((prev) => ({
      ...prev,
      kind: "custom",
      custom: {
        ...prev.custom,
        colors: prev.custom.colors.filter((_, i) => i !== safeIdx),
      },
    }));
    setSelectedIdx(nextIdx);
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
    const baseHue = Math.floor(Math.random() * 360);
    const isLight = theme.custom.appearance === "light";
    const c1 = hsvToHex(baseHue, isLight ? 0.34 : 0.62, isLight ? 0.96 : 0.58);
    const c2 = hsvToHex((baseHue + 52) % 360, isLight ? 0.3 : 0.56, isLight ? 0.94 : 0.48);
    const c3 = hsvToHex((baseHue + 115) % 360, isLight ? 0.36 : 0.64, isLight ? 0.95 : 0.62);
    updateThemeConfig((prev) => ({
      ...prev,
      kind: "custom",
      custom: {
        ...prev.custom,
        colors: [c1, c2, c3],
      },
    }));
    setSelectedIdx(0);
  }

  function closeWithAnim(cb: () => void) {
    if (closing) return;
    if (isDraggingRef.current) {
      commitDraftToEngine();
    } else {
      flushThemePersistence();
    }
    setClosing(true);
    window.setTimeout(cb, 170);
  }

  const stripGradient = buildStopsGradientCss(colors);
  const pureHueHex = hsvToHex(draftRef.current.hue, 1, 1);

  return (
    <>
      <div
        ref={liveBackdropRef}
        className="custom-theme-live-backdrop"
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className={`custom-theme-drawer ${closing ? "closing" : ""}`}
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
            <div className="custom-theme-mode-switch" role="group" aria-label="Base appearance">
              <button
                type="button"
                className={`custom-theme-mode-btn ${
                  theme.custom.appearance === "dark" ? "active" : ""
                }`}
                onClick={() => {
                  draftRef.current.appearance = "dark";
                  updateThemeConfig((prev) => ({
                    ...prev,
                    kind: "custom",
                    custom: { ...prev.custom, appearance: "dark" },
                  }));
                }}
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
                  theme.custom.appearance === "light" ? "active" : ""
                }`}
                onClick={() => {
                  draftRef.current.appearance = "light";
                  updateThemeConfig((prev) => ({
                    ...prev,
                    kind: "custom",
                    custom: { ...prev.custom, appearance: "light" },
                  }));
                }}
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
            <div
              ref={stopsBarRef}
              className="custom-theme-stops-bar"
              style={{ background: stripGradient }}
            >
              {colors.map((col, idx) => (
                <button
                  type="button"
                  key={idx}
                  ref={(el) => {
                    stopChipRefs.current[idx] = el;
                  }}
                  className={`custom-theme-stop-chip ${idx === safeIdx ? "active" : ""}`}
                  style={{ backgroundColor: col }}
                  aria-label={`Colour stop ${idx + 1} (${col})`}
                  onClick={() => {
                    if (isDraggingRef.current) commitDraftToEngine();
                    draftRef.current.selectedIdx = idx;
                    setSelectedIdx(idx);
                  }}
                />
              ))}
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
              <span
                ref={svThumbRef}
                className="custom-theme-sv-thumb"
                style={{ backgroundColor: activeHex }}
              />
            </div>

            <input
              ref={hueInputRef}
              type="range"
              className="custom-theme-hue-slider"
              aria-label="Colour hue"
              min={0}
              max={360}
              step={1}
              defaultValue={Math.round(initialHsv.h)}
              onInput={(e) => handleHueInput(Number((e.target as HTMLInputElement).value))}
              onPointerUp={handleSliderRelease}
              onPointerCancel={handleSliderRelease}
              onTouchEnd={handleSliderRelease}
              onTouchCancel={handleSliderRelease}
              onMouseUp={handleSliderRelease}
              onKeyUp={handleSliderRelease}
              onBlur={handleSliderRelease}
            />

            <div className="custom-theme-hex-row">
              <span
                ref={hexSwatchRef}
                className="custom-theme-hex-swatch"
                style={{ backgroundColor: activeHex }}
              />
              <input
                ref={hexInputRef}
                type="text"
                className="custom-theme-hex-input"
                value={hexDraft}
                maxLength={7}
                aria-label="Hex colour code"
                onChange={(e) => {
                  const val = e.target.value;
                  setHexDraft(val);
                  if (/^#?[0-9a-fA-F]{6}$/.test(val.trim())) {
                    updateActiveStopDirect(val);
                  }
                }}
                onBlur={() => setHexDraft(activeHex.toUpperCase())}
              />
              <input
                ref={fallbackColorInputRef}
                type="color"
                value={activeHex}
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
                disabled={colors.length <= 1}
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

            {colors.length < 5 && (
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
                <strong ref={angleLabelRef}>{theme.custom.angle}°</strong>
              </div>
              <input
                ref={angleInputRef}
                type="range"
                className="custom-theme-control-range"
                min={0}
                max={360}
                step={1}
                defaultValue={theme.custom.angle}
                onInput={(e) => handleAngleInput(Number((e.target as HTMLInputElement).value))}
                onPointerUp={handleSliderRelease}
                onPointerCancel={handleSliderRelease}
                onTouchEnd={handleSliderRelease}
                onTouchCancel={handleSliderRelease}
                onMouseUp={handleSliderRelease}
                onKeyUp={handleSliderRelease}
                onBlur={handleSliderRelease}
              />
            </div>

            <div className="custom-theme-slider-field">
              <div className="custom-theme-slider-head">
                <span>Colour Intensity</span>
                <strong ref={intensityLabelRef}>{theme.custom.intensity}%</strong>
              </div>
              <input
                ref={intensityInputRef}
                type="range"
                className="custom-theme-control-range"
                min={10}
                max={100}
                step={1}
                defaultValue={theme.custom.intensity}
                onInput={(e) =>
                  handleIntensityInput(Number((e.target as HTMLInputElement).value))
                }
                onPointerUp={handleSliderRelease}
                onPointerCancel={handleSliderRelease}
                onTouchEnd={handleSliderRelease}
                onTouchCancel={handleSliderRelease}
                onMouseUp={handleSliderRelease}
                onKeyUp={handleSliderRelease}
                onBlur={handleSliderRelease}
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
              type="button"
              className="primary-btn custom-theme-apply-btn"
              onClick={() => {
                if (isDraggingRef.current) {
                  commitDraftToEngine();
                }
                const latest = updateThemeConfig((prev) => ({ ...prev, kind: "custom" }));
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
