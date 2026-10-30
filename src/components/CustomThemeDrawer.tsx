import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
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

  const svBoxRef = useRef<HTMLDivElement | null>(null);
  const svRectRef = useRef<DOMRect | null>(null);
  const fallbackColorInputRef = useRef<HTMLInputElement | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  const colors = theme.custom.colors.length > 0 ? theme.custom.colors : ["#efb4aa"];
  const safeIdx = Math.min(selectedIdx, colors.length - 1);
  const activeHex = colors[safeIdx] ?? "#efb4aa";
  const hsv = hexToHsv(activeHex);

  // Ensure entering the drawer switches live preview to custom mode immediately
  useEffect(() => {
    if (theme.kind !== "custom") {
      updateThemeConfig({ kind: "custom" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setHexDraft(activeHex.toUpperCase());
  }, [activeHex]);

  function scheduleRemoteThemeSync() {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      flushThemePersistence();
      const latest = getThemeConfig();
      if (!latest.syncAcrossDevices || !me) return;
      void saveProfile({
        displayName: me.displayName,
        username: me.username,
        bio: me.bio,
        pronouns: me.pronouns,
        avatarColor: me.avatarColor,
        syncedTheme: toSyncedThemePayload(latest),
      }).catch(() => undefined);
    }, 650);
  }

  useEffect(() => {
    return () => {
      flushThemePersistence();
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  function updateActiveStopHex(nextHexRaw: string, continuous = false) {
    const clean = normalizeHexColor(nextHexRaw, activeHex);
    updateThemeConfig(
      (prev) => {
        const nextCols = [...prev.custom.colors];
        const idx = Math.min(safeIdx, Math.max(0, nextCols.length - 1));
        nextCols[idx] = clean;
        return {
          ...prev,
          kind: "custom",
          custom: {
            ...prev.custom,
            colors: nextCols,
          },
        };
      },
      { continuous },
    );
    scheduleRemoteThemeSync();
  }

  function handleSvPointer(clientX: number, clientY: number, continuous: boolean) {
    const rect = svRectRef.current ?? svBoxRef.current?.getBoundingClientRect() ?? null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const nextHex = hsvToHex(hsv.h, s, v);
    updateActiveStopHex(nextHex, continuous);
  }

  function onSvPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    svRectRef.current = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    handleSvPointer(e.clientX, e.clientY, true);
  }

  function onSvPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    handleSvPointer(e.clientX, e.clientY, true);
  }

  function onSvPointerUp() {
    svRectRef.current = null;
    flushThemePersistence();
  }

  function handleHueChange(nextHue: number) {
    const nextHex = hsvToHex(nextHue, Math.max(0.04, hsv.s), Math.max(0.08, hsv.v));
    updateActiveStopHex(nextHex, true);
  }

  function handleAddColour() {
    if (colors.length >= 5) return;
    const shifted = hsvToHex((hsv.h + 48) % 360, Math.max(0.32, hsv.s), Math.max(0.55, hsv.v));
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
    scheduleRemoteThemeSync();
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
    scheduleRemoteThemeSync();
  }

  async function handleEyedropper() {
    const win = window as unknown as { EyeDropper?: EyeDropperConstructor };
    if (typeof win.EyeDropper === "function") {
      try {
        const dropper = new win.EyeDropper();
        const result = await dropper.open();
        if (result?.sRGBHex) {
          updateActiveStopHex(result.sRGBHex);
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
    scheduleRemoteThemeSync();
  }

  function closeWithAnim(cb: () => void) {
    if (closing) return;
    setClosing(true);
    window.setTimeout(cb, 170);
  }

  const stripGradient =
    colors.length === 1
      ? colors[0]
      : `linear-gradient(90deg, ${colors
          .map((c, idx) => `${c} ${Math.round((idx / (colors.length - 1)) * 100)}%`)
          .join(", ")})`;

  const pureHueHex = hsvToHex(hsv.h, 1, 1);

  return (
    <aside
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
                updateThemeConfig((prev) => ({
                  ...prev,
                  kind: "custom",
                  custom: { ...prev.custom, appearance: "dark" },
                }));
                scheduleRemoteThemeSync();
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
                updateThemeConfig((prev) => ({
                  ...prev,
                  kind: "custom",
                  custom: { ...prev.custom, appearance: "light" },
                }));
                scheduleRemoteThemeSync();
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
            className="custom-theme-stops-bar"
            style={{ background: stripGradient }}
          >
            {colors.map((col, idx) => (
              <button
                type="button"
                key={idx}
                className={`custom-theme-stop-chip ${idx === safeIdx ? "active" : ""}`}
                style={{ backgroundColor: col }}
                aria-label={`Colour stop ${idx + 1} (${col})`}
                onClick={() => setSelectedIdx(idx)}
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
              className="custom-theme-sv-thumb"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                backgroundColor: activeHex,
              }}
            />
          </div>

          <input
            type="range"
            className="custom-theme-hue-slider"
            aria-label="Colour hue"
            min={0}
            max={360}
            value={hsv.h}
            onChange={(e) => handleHueChange(Number(e.target.value))}
          />

          <div className="custom-theme-hex-row">
            <span
              className="custom-theme-hex-swatch"
              style={{ backgroundColor: activeHex }}
            />
            <input
              type="text"
              className="custom-theme-hex-input"
              value={hexDraft}
              maxLength={7}
              aria-label="Hex colour code"
              onChange={(e) => {
                const val = e.target.value;
                setHexDraft(val);
                if (/^#?[0-9a-fA-F]{6}$/.test(val.trim())) {
                  updateActiveStopHex(val);
                }
              }}
              onBlur={() => setHexDraft(activeHex.toUpperCase())}
            />
            <input
              ref={fallbackColorInputRef}
              type="color"
              value={activeHex}
              hidden
              onChange={(e) => updateActiveStopHex(e.target.value)}
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
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
              <strong>{theme.custom.angle}°</strong>
            </div>
            <input
              type="range"
              className="custom-theme-control-range"
              min={0}
              max={360}
              step={5}
              value={theme.custom.angle}
              onChange={(e) => {
                const angle = Number(e.target.value);
                updateThemeConfig(
                  (prev) => ({
                    ...prev,
                    kind: "custom",
                    custom: { ...prev.custom, angle },
                  }),
                  { continuous: true },
                );
                scheduleRemoteThemeSync();
              }}
            />
          </div>

          <div className="custom-theme-slider-field">
            <div className="custom-theme-slider-head">
              <span>Colour Intensity</span>
              <strong>{theme.custom.intensity}%</strong>
            </div>
            <input
              type="range"
              className="custom-theme-control-range"
              min={10}
              max={100}
              step={2}
              value={theme.custom.intensity}
              onChange={(e) => {
                const intensity = Number(e.target.value);
                updateThemeConfig(
                  (prev) => ({
                    ...prev,
                    kind: "custom",
                    custom: { ...prev.custom, intensity },
                  }),
                  { continuous: true },
                );
                scheduleRemoteThemeSync();
              }}
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
  );
}
