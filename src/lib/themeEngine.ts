import { useSyncExternalStore } from "react";

export type DefaultThemeId = "light" | "ash" | "dark" | "onyx" | "system";

export type ColourThemeId =
  | "mint-meadow"
  | "citrus-sherbet"
  | "retro-raincloud"
  | "hanami"
  | "sunrise"
  | "cotton-candy"
  | "lofi-vibes"
  | "desert-khaki"
  | "sunset"
  | "chroma-glow"
  | "forest"
  | "crimson-moon"
  | "midnight-blurple"
  | "mars"
  | "dusk"
  | "under-the-sea"
  | "retro-storm"
  | "neon-nights"
  | "strawberry-lemonade"
  | "aurora"
  | "sepia"
  | "blurple-twilight";

export interface CustomGradientTheme {
  appearance: "dark" | "light";
  colors: string[];
  angle: number;
  intensity: number;
}

export interface SyncedThemePayload {
  k: "d" | "p" | "c";
  d?: DefaultThemeId;
  p?: ColourThemeId;
  c?: {
    a: "d" | "l";
    cols: string[];
    ang: number;
    int: number;
  };
  u?: number;
}

export interface JaTextThemeConfig {
  kind: "default" | "preset" | "custom";
  defaultId: DefaultThemeId;
  presetId: ColourThemeId;
  custom: CustomGradientTheme;
  syncAcrossDevices: boolean;
  updatedAt?: number;
}

export interface DefaultThemeOption {
  id: DefaultThemeId;
  name: string;
  swatchBg: string;
  swatchBorder: string;
}

export interface ColourThemePreset {
  id: ColourThemeId;
  name: string;
  appearance: "dark" | "light";
  colors: string[];
  angle: number;
  intensity: number;
  swatchGradient: string;
}

/**
 * 1:1 Default Theme swatches matching image-7.png:
 * Light (#ffffff), Ash (#323339), Dark (#1d1d21), Onyx (#000000), plus System Sync.
 */
export const DEFAULT_THEME_OPTIONS: DefaultThemeOption[] = [
  {
    id: "light",
    name: "Light",
    swatchBg: "#ffffff",
    swatchBorder: "rgba(0, 0, 0, 0.16)",
  },
  {
    id: "ash",
    name: "Ash",
    swatchBg: "#323339",
    swatchBorder: "rgba(255, 255, 255, 0.22)",
  },
  {
    id: "dark",
    name: "Dark",
    swatchBg: "#1d1d21",
    swatchBorder: "rgba(255, 255, 255, 0.2)",
  },
  {
    id: "onyx",
    name: "Onyx",
    swatchBg: "#000000",
    swatchBorder: "rgba(255, 255, 255, 0.22)",
  },
];

/**
 * 1:1 Colour Theme gradients sampled directly from image-7.png (21 presets + Custom Theme tile = 22 tiles).
 */
export const COLOUR_THEME_PRESETS: ColourThemePreset[] = [
  // Row 1 (after Custom Theme tile)
  {
    id: "mint-meadow",
    name: "Mint Apple",
    appearance: "light",
    colors: ["#a8d9c7", "#afddad", "#c8e2af"],
    angle: 180,
    intensity: 68,
    swatchGradient: "linear-gradient(180deg, #a8d9c7 0%, #afddad 50%, #c8e2af 100%)",
  },
  {
    id: "citrus-sherbet",
    name: "Citrus Sherbet",
    appearance: "light",
    colors: ["#f9d796", "#f7caa0", "#f6bfa8"],
    angle: 180,
    intensity: 68,
    swatchGradient: "linear-gradient(180deg, #f9d796 0%, #f7caa0 50%, #f6bfa8 100%)",
  },
  {
    id: "retro-raincloud",
    name: "Retro Raincloud",
    appearance: "light",
    colors: ["#a6bbd2", "#bbbcda", "#98bbce"],
    angle: 135,
    intensity: 66,
    swatchGradient: "linear-gradient(135deg, #a6bbd2 0%, #bbbcda 52%, #98bbce 100%)",
  },
  {
    id: "hanami",
    name: "Hanami",
    appearance: "light",
    colors: ["#f6d9d2", "#e6ebcb", "#d0ecce"],
    angle: 45,
    intensity: 70,
    swatchGradient: "linear-gradient(45deg, #f6d9d2 0%, #e6ebcb 52%, #d0ecce 100%)",
  },
  {
    id: "sunrise",
    name: "Sunrise",
    appearance: "light",
    colors: ["#cfa1b6", "#dfc6ac", "#d0c89a"],
    angle: 135,
    intensity: 66,
    swatchGradient: "linear-gradient(135deg, #cfa1b6 0%, #dfc6ac 52%, #d0c89a 100%)",
  },
  {
    id: "cotton-candy",
    name: "Cotton Candy",
    appearance: "light",
    colors: ["#f7d3dc", "#e8d9ec", "#d9defa"],
    angle: 180,
    intensity: 70,
    swatchGradient: "linear-gradient(180deg, #f7d3dc 0%, #e8d9ec 50%, #d9defa 100%)",
  },
  {
    id: "lofi-vibes",
    name: "LoFi Vibes",
    appearance: "light",
    colors: ["#d0e2f8", "#d4f0e5", "#e1efd2"],
    angle: 180,
    intensity: 70,
    swatchGradient: "linear-gradient(180deg, #d0e2f8 0%, #d4f0e5 50%, #e1efd2 100%)",
  },
  {
    id: "desert-khaki",
    name: "Desert Khaki",
    appearance: "light",
    colors: ["#efe9cf", "#f2ebe6", "#efe8d2"],
    angle: 135,
    intensity: 72,
    swatchGradient: "linear-gradient(135deg, #efe9cf 0%, #f2ebe6 52%, #efe8d2 100%)",
  },
  {
    id: "sunset",
    name: "Sunset",
    appearance: "dark",
    colors: ["#3a2070", "#794654", "#af663c"],
    angle: 135,
    intensity: 64,
    swatchGradient: "linear-gradient(135deg, #3a2070 0%, #794654 50%, #af663c 100%)",
  },
  {
    id: "chroma-glow",
    name: "Chroma Glow",
    appearance: "dark",
    colors: ["#2156a4", "#7e2eb4", "#7f1c9f", "#1a6fb3"],
    angle: 135,
    intensity: 64,
    swatchGradient:
      "linear-gradient(135deg, #2156a4 0%, #7e2eb4 40%, #7f1c9f 72%, #1a6fb3 100%)",
  },

  // Row 2
  {
    id: "forest",
    name: "Forest",
    appearance: "dark",
    colors: ["#121f14", "#39422b", "#87723c"],
    angle: 135,
    intensity: 66,
    swatchGradient: "linear-gradient(135deg, #121f14 0%, #39422b 52%, #87723c 100%)",
  },
  {
    id: "crimson-moon",
    name: "Crimson Moon",
    appearance: "dark",
    colors: ["#770707", "#2e0202", "#000000"],
    angle: 45,
    intensity: 72,
    swatchGradient: "linear-gradient(45deg, #770707 0%, #2e0202 52%, #000000 100%)",
  },
  {
    id: "midnight-blurple",
    name: "Midnight",
    appearance: "dark",
    colors: ["#40379c", "#1b1243", "#100626"],
    angle: 45,
    intensity: 68,
    swatchGradient: "linear-gradient(45deg, #40379c 0%, #1b1243 55%, #100626 100%)",
  },
  {
    id: "mars",
    name: "Mars",
    appearance: "dark",
    colors: ["#6e4233", "#703a34", "#733636"],
    angle: 180,
    intensity: 64,
    swatchGradient: "linear-gradient(180deg, #6e4233 0%, #703a34 50%, #733636 100%)",
  },
  {
    id: "dusk",
    name: "Dusk",
    appearance: "dark",
    colors: ["#524155", "#63627f", "#7483a7"],
    angle: 180,
    intensity: 62,
    swatchGradient: "linear-gradient(180deg, #524155 0%, #63627f 50%, #7483a7 100%)",
  },
  {
    id: "under-the-sea",
    name: "Under the Sea",
    appearance: "dark",
    colors: ["#4e6352", "#466a5e", "#526a67"],
    angle: 180,
    intensity: 62,
    swatchGradient: "linear-gradient(180deg, #4e6352 0%, #466a5e 50%, #526a67 100%)",
  },
  {
    id: "retro-storm",
    name: "Retro Storm",
    appearance: "dark",
    colors: ["#37587e", "#45467b", "#2f6381"],
    angle: 135,
    intensity: 64,
    swatchGradient: "linear-gradient(135deg, #37587e 0%, #45467b 50%, #2f6381 100%)",
  },
  {
    id: "neon-nights",
    name: "Neon Nights",
    appearance: "dark",
    colors: ["#1b7684", "#654c94", "#843681"],
    angle: 180,
    intensity: 64,
    swatchGradient: "linear-gradient(180deg, #1b7684 0%, #654c94 50%, #843681 100%)",
  },
  {
    id: "strawberry-lemonade",
    name: "Berry Citrus",
    appearance: "dark",
    colors: ["#8c1556", "#9c571a", "#b9841e"],
    angle: 135,
    intensity: 64,
    swatchGradient: "linear-gradient(135deg, #8c1556 0%, #9c571a 52%, #b9841e 100%)",
  },
  {
    id: "aurora",
    name: "Aurora",
    appearance: "dark",
    colors: ["#092865", "#107378", "#081a52"],
    angle: 45,
    intensity: 68,
    swatchGradient: "linear-gradient(45deg, #092865 0%, #107378 48%, #081a52 100%)",
  },
  {
    id: "sepia",
    name: "Sepia",
    appearance: "dark",
    colors: ["#6a5e50", "#4f3e26", "#49361a"],
    angle: 45,
    intensity: 66,
    swatchGradient: "linear-gradient(45deg, #6a5e50 0%, #4f3e26 52%, #49361a 100%)",
  },

  // Row 3
  {
    id: "blurple-twilight",
    name: "Deep Indigo",
    appearance: "dark",
    colors: ["#2332b6", "#1f1e7e", "#1e1769"],
    angle: 45,
    intensity: 68,
    swatchGradient: "linear-gradient(45deg, #2332b6 0%, #1f1e7e 52%, #1e1769 100%)",
  },
];

export const CUSTOM_TILE_SWATCH =
  "linear-gradient(135deg, #668f81 0%, #667c8b 50%, #84766d 100%)";

const STORAGE_KEY_PREFIX = "jatext:theme-config:v1:";
const GLOBAL_STORAGE_KEY = "jatext:theme-config:v1:global";

const DEFAULT_CONFIG: JaTextThemeConfig = {
  kind: "default",
  defaultId: "dark",
  presetId: "mint-meadow",
  custom: {
    appearance: "dark",
    colors: ["#efb4aa", "#b6e0d3", "#a5c4f3"],
    angle: 45,
    intensity: 60,
  },
  syncAcrossDevices: true,
  updatedAt: 0,
};

const listeners = new Set<() => void>();
let activeUserScope = "global";
const configByScope = new Map<string, JaTextThemeConfig>();
let mediaListenerBound = false;
let lastAppliedSignature = "";
let rafApplyHandle: number | null = null;
let persistTimerHandle: number | null = null;
let pendingPersistScope: string | null = null;
let remoteSyncHandler: ((payload: SyncedThemePayload) => Promise<void> | void) | null = null;
let remoteSyncTimerHandle: ReturnType<typeof setTimeout> | null = null;
let pendingRemotePayload: SyncedThemePayload | null = null;

export function registerThemeRemoteSyncHandler(
  handler: ((payload: SyncedThemePayload) => Promise<void> | void) | null,
): void {
  remoteSyncHandler = handler;
  if (handler && pendingRemotePayload) {
    const queued = pendingRemotePayload;
    pendingRemotePayload = null;
    if (remoteSyncTimerHandle !== null) {
      clearTimeout(remoteSyncTimerHandle);
      remoteSyncTimerHandle = null;
    }
    try {
      void handler(queued);
    } catch {
      // ignore remote sync handler errors
    }
  }
}

function scheduleRemoteThemePush(payload: SyncedThemePayload, immediate = false): void {
  pendingRemotePayload = payload;
  if (remoteSyncTimerHandle !== null) {
    clearTimeout(remoteSyncTimerHandle);
    remoteSyncTimerHandle = null;
  }
  const run = () => {
    remoteSyncTimerHandle = null;
    if (!remoteSyncHandler || !pendingRemotePayload) return;
    const nextPayload = pendingRemotePayload;
    pendingRemotePayload = null;
    try {
      void remoteSyncHandler(nextPayload);
    } catch {
      // ignore remote sync handler errors
    }
  };
  if (immediate || typeof window === "undefined") {
    run();
  } else {
    remoteSyncTimerHandle = setTimeout(run, 260);
  }
}

function writeScopeToStorage(scope: string, cfg: JaTextThemeConfig): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(cfg);
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${scope}`, serialized);
    window.localStorage.setItem(GLOBAL_STORAGE_KEY, serialized);
  } catch {
    // ignore quota errors
  }
}

export function flushThemePersistence(): void {
  if (persistTimerHandle !== null && typeof window !== "undefined") {
    window.clearTimeout(persistTimerHandle);
    persistTimerHandle = null;
  }
  if (pendingPersistScope) {
    const scope = pendingPersistScope;
    pendingPersistScope = null;
    const cfg = configByScope.get(scope);
    if (cfg) {
      writeScopeToStorage(scope, cfg);
      if (cfg.syncAcrossDevices && scope !== "global") {
        scheduleRemoteThemePush(toSyncedThemePayload(cfg), true);
      }
    }
  } else if (pendingRemotePayload) {
    scheduleRemoteThemePush(pendingRemotePayload, true);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushThemePersistence);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushThemePersistence();
    }
  });
  window.addEventListener("storage", (e) => {
    if (!e.newValue) return;
    const scopedKey = `${STORAGE_KEY_PREFIX}${activeUserScope}`;
    if (e.key !== scopedKey && e.key !== GLOBAL_STORAGE_KEY) return;
    try {
      const incoming = sanitizeConfig(JSON.parse(e.newValue) as Partial<JaTextThemeConfig>);
      const cur = configByScope.get(activeUserScope);
      if (cur && JSON.stringify(cur) === JSON.stringify(incoming)) return;
      configByScope.set(activeUserScope, incoming);
      applyThemeToDocument(incoming);
      emitChange();
    } catch {
      // ignore malformed storage events
    }
  });
}

export function normalizeHexColor(raw: string, fallback = "#9b6cff"): string {
  const clean = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toLowerCase()}`;
  }
  return fallback;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHexColor(hex).slice(1);
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [rRaw, gRaw, bRaw] = hexToRgb(hex);
  const r = rRaw / 255;
  const g = gRaw / 255;
  const b = bRaw / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  weightB: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, weightB));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function sanitizeConfig(raw: Partial<JaTextThemeConfig> | null | undefined): JaTextThemeConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_CONFIG;
  const kind: JaTextThemeConfig["kind"] =
    raw.kind === "preset" || raw.kind === "custom" ? raw.kind : "default";
  const defaultId: DefaultThemeId =
    raw.defaultId === "light" ||
    raw.defaultId === "ash" ||
    raw.defaultId === "dark" ||
    raw.defaultId === "onyx" ||
    raw.defaultId === "system"
      ? raw.defaultId
      : "dark";
  const validPreset = COLOUR_THEME_PRESETS.some((p) => p.id === raw.presetId)
    ? (raw.presetId as ColourThemeId)
    : "mint-meadow";
  const rawCols = Array.isArray(raw.custom?.colors) ? raw.custom.colors : DEFAULT_CONFIG.custom.colors;
  const colors = rawCols
    .slice(0, 5)
    .map((c) => normalizeHexColor(String(c ?? ""), "#efb4aa"));
  if (colors.length === 0) colors.push("#efb4aa", "#b6e0d3");

  return {
    kind,
    defaultId,
    presetId: validPreset,
    custom: {
      appearance: raw.custom?.appearance === "light" ? "light" : "dark",
      colors,
      angle:
        typeof raw.custom?.angle === "number" && Number.isFinite(raw.custom.angle)
          ? Math.max(0, Math.min(360, Math.round(raw.custom.angle)))
          : 45,
      intensity:
        typeof raw.custom?.intensity === "number" && Number.isFinite(raw.custom.intensity)
          ? Math.max(10, Math.min(100, Math.round(raw.custom.intensity)))
          : 60,
    },
    syncAcrossDevices:
      typeof raw.syncAcrossDevices === "boolean" ? raw.syncAcrossDevices : true,
    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) && raw.updatedAt > 0
        ? Math.round(raw.updatedAt)
        : 0,
  };
}

function loadConfigForScope(scope: string): JaTextThemeConfig {
  const cached = configByScope.get(scope);
  if (cached) return cached;
  if (typeof window !== "undefined") {
    try {
      const raw =
        window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`) ??
        window.localStorage.getItem(GLOBAL_STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeConfig(JSON.parse(raw) as Partial<JaTextThemeConfig>);
        configByScope.set(scope, parsed);
        return parsed;
      }
    } catch {
      // ignore storage errors
    }
  }
  configByScope.set(scope, DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function emitChange() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

function getSystemAppearance(): "light" | "dark" {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

function bindSystemThemeListener() {
  if (mediaListenerBound || typeof window === "undefined" || !window.matchMedia) return;
  mediaListenerBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => {
    const cur = getThemeConfig();
    if (cur.kind === "default" && cur.defaultId === "system") {
      applyThemeToDocument(cur);
      emitChange();
    }
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
  }
}

export function computeBlendedGradientStops(spec: {
  appearance: "dark" | "light";
  colors: string[];
  intensity: number;
}): string[] {
  const baseRgb: [number, number, number] =
    spec.appearance === "light" ? [252, 253, 255] : [13, 14, 20];
  const strength = Math.max(0.1, Math.min(1, spec.intensity / 100));
  const rawStops = spec.colors.length > 0 ? spec.colors : ["#7c5cff"];
  const factor = spec.appearance === "light" ? strength * 0.78 : strength * 0.72;
  return rawStops.map((hex) => {
    const rgb = hexToRgb(hex);
    const mixed = mixRgb(baseRgb, rgb, factor);
    return rgbToHex(mixed[0], mixed[1], mixed[2]);
  });
}

export function computePreviewAccent(
  appearance: "dark" | "light",
  firstColorHex: string,
): { accent: string; accentDark: string } {
  const rawAccentHsv = hexToHsv(firstColorHex || "#7c5cff");
  if (appearance === "light") {
    return {
      accent: hsvToHex(
        rawAccentHsv.h,
        Math.max(0.55, Math.min(0.88, rawAccentHsv.s + 0.28)),
        Math.min(0.76, Math.max(0.45, rawAccentHsv.v * 0.78)),
      ),
      accentDark: "#ffffff",
    };
  }
  return {
    accent: hsvToHex(
      rawAccentHsv.h,
      Math.max(0.48, Math.min(0.82, rawAccentHsv.s + 0.14)),
      Math.max(0.72, Math.min(0.95, rawAccentHsv.v + 0.18)),
    ),
    accentDark: "#0f1018",
  };
}

export function buildCssGradientFromSpec(spec: {
  appearance: "dark" | "light";
  colors: string[];
  angle: number;
  intensity: number;
}): {
  backgroundCss: string;
  bgSolid: string;
  panel: string;
  panel2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentDark: string;
} {
  const rawStops = spec.colors.length > 0 ? spec.colors : ["#7c5cff"];
  const blendedStops = computeBlendedGradientStops(spec);

  const gradientStops =
    blendedStops.length === 1
      ? `${blendedStops[0]} 0%, ${blendedStops[0]} 100%`
      : blendedStops
          .map((c, idx) => `${c} ${Math.round((idx / (blendedStops.length - 1)) * 100)}%`)
          .join(", ");

  const firstRgb = hexToRgb(blendedStops[0]);
  const midRgb = hexToRgb(blendedStops[Math.floor(blendedStops.length / 2)]);
  const avgTint = mixRgb(firstRgb, midRgb, 0.5);
  const { accent, accentDark } = computePreviewAccent(spec.appearance, rawStops[0]);

  if (spec.appearance === "light") {
    const panelRgb = mixRgb([255, 255, 255], avgTint, 0.42);
    const panel2Rgb = mixRgb([241, 243, 248], avgTint, 0.55);
    const borderRgb = mixRgb([204, 210, 222], avgTint, 0.42);
    return {
      backgroundCss: `linear-gradient(${spec.angle}deg, ${gradientStops})`,
      bgSolid: rgbToHex(avgTint[0], avgTint[1], avgTint[2]),
      panel: `rgba(${Math.round(panelRgb[0])}, ${Math.round(panelRgb[1])}, ${Math.round(panelRgb[2])}, 0.78)`,
      panel2: `rgba(${Math.round(panel2Rgb[0])}, ${Math.round(panel2Rgb[1])}, ${Math.round(panel2Rgb[2])}, 0.84)`,
      border: `rgba(${Math.round(borderRgb[0])}, ${Math.round(borderRgb[1])}, ${Math.round(borderRgb[2])}, 0.72)`,
      text: "#12151c",
      muted: "#4a5162",
      accent,
      accentDark,
    };
  }

  const panelRgb = mixRgb([16, 17, 24], avgTint, 0.46);
  const panel2Rgb = mixRgb([26, 28, 38], avgTint, 0.52);
  const borderRgb = mixRgb([56, 60, 78], avgTint, 0.48);
  return {
    backgroundCss: `linear-gradient(${spec.angle}deg, ${gradientStops})`,
    bgSolid: rgbToHex(avgTint[0], avgTint[1], avgTint[2]),
    panel: `rgba(${Math.round(panelRgb[0])}, ${Math.round(panelRgb[1])}, ${Math.round(panelRgb[2])}, 0.76)`,
    panel2: `rgba(${Math.round(panel2Rgb[0])}, ${Math.round(panel2Rgb[1])}, ${Math.round(panel2Rgb[2])}, 0.82)`,
    border: `rgba(${Math.round(borderRgb[0])}, ${Math.round(borderRgb[1])}, ${Math.round(borderRgb[2])}, 0.65)`,
    text: "#f4f5fa",
    muted: "#b4b8cb",
    accent,
    accentDark,
  };
}

export function applyThemeToDocument(config: JaTextThemeConfig): void {
  if (typeof document === "undefined") return;
  bindSystemThemeListener();
  const root = document.documentElement;

  let mode: "light" | "dark" = "dark";
  let hasGradient = false;
  let vars: {
    bg: string;
    bgImage: string;
    panel: string;
    panel2: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentDark: string;
  };

  if (config.kind === "default") {
    const resolvedId =
      config.defaultId === "system" ? getSystemAppearance() : config.defaultId;
    if (resolvedId === "light") {
      mode = "light";
      vars = {
        bg: "#ffffff",
        bgImage: "none",
        panel: "#f2f3f5",
        panel2: "#e6e8ec",
        border: "#d5d8e0",
        text: "#111318",
        muted: "#585d6a",
        accent: "#7c4dff",
        accentDark: "#ffffff",
      };
    } else if (resolvedId === "ash") {
      mode = "dark";
      vars = {
        bg: "#323339",
        bgImage: "none",
        panel: "#2b2d31",
        panel2: "#383a40",
        border: "#43464f",
        text: "#f2f3f5",
        muted: "#a9adb8",
        accent: "#9b6cff",
        accentDark: "#170d2b",
      };
    } else if (resolvedId === "onyx") {
      mode = "dark";
      vars = {
        bg: "#000000",
        bgImage: "none",
        panel: "#07070a",
        panel2: "#121218",
        border: "#20202a",
        text: "#f5f5fa",
        muted: "#8f90a3",
        accent: "#9b6cff",
        accentDark: "#170d2b",
      };
    } else {
      // Dark (#1d1d21)
      mode = "dark";
      vars = {
        bg: "#1d1d21",
        bgImage: "none",
        panel: "#151519",
        panel2: "#24252b",
        border: "#30323a",
        text: "#f2f2f7",
        muted: "#9a9aad",
        accent: "#9b6cff",
        accentDark: "#170d2b",
      };
    }
  } else {
    hasGradient = true;
    const preset =
      config.kind === "preset"
        ? (COLOUR_THEME_PRESETS.find((p) => p.id === config.presetId) ??
          COLOUR_THEME_PRESETS[0])
        : null;
    const spec = preset
      ? {
          appearance: preset.appearance,
          colors: preset.colors,
          angle: preset.angle,
          intensity: preset.intensity,
        }
      : config.custom;
    mode = spec.appearance;
    const computed = buildCssGradientFromSpec(spec);
    vars = {
      bg: computed.bgSolid,
      bgImage: computed.backgroundCss,
      panel: computed.panel,
      panel2: computed.panel2,
      border: computed.border,
      text: computed.text,
      muted: computed.muted,
      accent: computed.accent,
      accentDark: computed.accentDark,
    };
  }

  const [ar, ag, ab] = hexToRgb(vars.accent);
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const accentLuminance = 0.2126 * toLin(ar) + 0.7152 * toLin(ag) + 0.0722 * toLin(ab);
  const isLightAccent = accentLuminance > 0.36;

  const signature = `${mode}|${hasGradient}|${isLightAccent}|${vars.bg}|${vars.bgImage}|${vars.panel}|${vars.panel2}|${vars.border}|${vars.text}|${vars.muted}|${vars.accent}|${vars.accentDark}`;
  if (signature === lastAppliedSignature) return;
  lastAppliedSignature = signature;

  root.dataset.jtMode = mode;
  root.dataset.jtGradient = hasGradient ? "true" : "false";
  root.dataset.jtLightAccent = isLightAccent ? "true" : "false";
  root.style.colorScheme = mode;
  root.style.setProperty("--bg", vars.bg);
  root.style.setProperty("--app-bg-image", vars.bgImage);
  root.style.setProperty("--panel", vars.panel);
  root.style.setProperty("--panel-2", vars.panel2);
  root.style.setProperty("--border", vars.border);
  root.style.setProperty("--text", vars.text);
  root.style.setProperty("--muted", vars.muted);
  root.style.setProperty("--accent", vars.accent);
  root.style.setProperty("--accent-dark", vars.accentDark);
  root.style.colorScheme = mode;
}

export function setThemeUserScope(userId: string | null | undefined): void {
  const nextScope = userId || "global";
  if (activeUserScope === nextScope) {
    applyThemeToDocument(loadConfigForScope(nextScope));
    return;
  }
  flushThemePersistence();
  activeUserScope = nextScope;
  const cfg = loadConfigForScope(nextScope);
  applyThemeToDocument(cfg);
  emitChange();
}

export function getThemeConfig(): JaTextThemeConfig {
  return loadConfigForScope(activeUserScope);
}

export function updateThemeConfig(
  patch: Partial<JaTextThemeConfig> | ((prev: JaTextThemeConfig) => JaTextThemeConfig),
  options?: { continuous?: boolean; skipRemoteSync?: boolean },
): JaTextThemeConfig {
  const prev = getThemeConfig();
  const rawNext = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
  const now = Date.now();
  const next = sanitizeConfig({ ...rawNext, updatedAt: now });
  configByScope.set(activeUserScope, next);

  if (options?.continuous && typeof window !== "undefined") {
    pendingPersistScope = activeUserScope;
    if (persistTimerHandle !== null) {
      window.clearTimeout(persistTimerHandle);
    }
    persistTimerHandle = window.setTimeout(() => {
      persistTimerHandle = null;
      flushThemePersistence();
    }, 180);

    if (rafApplyHandle === null) {
      rafApplyHandle = window.requestAnimationFrame(() => {
        rafApplyHandle = null;
        const latest = getThemeConfig();
        applyThemeToDocument(latest);
        emitChange();
      });
    }
    return next;
  }

  if (rafApplyHandle !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(rafApplyHandle);
    rafApplyHandle = null;
  }
  pendingPersistScope = null;
  if (persistTimerHandle !== null && typeof window !== "undefined") {
    window.clearTimeout(persistTimerHandle);
    persistTimerHandle = null;
  }
  writeScopeToStorage(activeUserScope, next);
  applyThemeToDocument(next);
  emitChange();

  if (!options?.skipRemoteSync && next.syncAcrossDevices && activeUserScope !== "global") {
    scheduleRemoteThemePush(toSyncedThemePayload(next));
  }
  return next;
}

export function toSyncedThemePayload(cfg: JaTextThemeConfig): SyncedThemePayload {
  const u = cfg.updatedAt && cfg.updatedAt > 0 ? cfg.updatedAt : Date.now();
  if (cfg.kind === "default") {
    return { k: "d", d: cfg.defaultId, u };
  }
  if (cfg.kind === "preset") {
    return { k: "p", p: cfg.presetId, u };
  }
  return {
    k: "c",
    c: {
      a: cfg.custom.appearance === "light" ? "l" : "d",
      cols: cfg.custom.colors.slice(0, 5),
      ang: cfg.custom.angle,
      int: cfg.custom.intensity,
    },
    u,
  };
}

export function isSameSyncedThemeShape(
  a: SyncedThemePayload | undefined,
  b: SyncedThemePayload | undefined,
): boolean {
  if (!a || !b || a.k !== b.k) return false;
  if (a.k === "d") return a.d === b.d;
  if (a.k === "p") return a.p === b.p;
  if (a.k === "c") {
    if (!a.c || !b.c) return false;
    return (
      a.c.a === b.c.a &&
      a.c.ang === b.c.ang &&
      a.c.int === b.c.int &&
      a.c.cols.length === b.c.cols.length &&
      a.c.cols.every((col, idx) => col.toLowerCase() === b.c!.cols[idx]?.toLowerCase())
    );
  }
  return false;
}

const backfilledUsers = new Set<string>();

export function applyRemoteSyncedThemeIfChanged(
  userId: string,
  remote: SyncedThemePayload | undefined,
  serverProfileLoaded = true,
): void {
  if (!userId) return;
  const current = loadConfigForScope(userId);
  if (!current.syncAcrossDevices) return;

  if (!remote) {
    if (
      serverProfileLoaded &&
      !backfilledUsers.has(userId) &&
      ((current.updatedAt ?? 0) > 0 ||
        current.kind !== "default" ||
        current.defaultId !== "dark")
    ) {
      backfilledUsers.add(userId);
      scheduleRemoteThemePush(toSyncedThemePayload(current));
    }
    return;
  }

  const localPayload = toSyncedThemePayload(current);
  if (isSameSyncedThemeShape(localPayload, remote)) {
    if (remote.u && remote.u > (current.updatedAt ?? 0)) {
      const synced = sanitizeConfig({ ...current, updatedAt: remote.u });
      configByScope.set(userId, synced);
      writeScopeToStorage(userId, synced);
    }
    return;
  }

  const localTs = current.updatedAt ?? 0;
  if (localTs > 0) {
    if (remote.u && remote.u < localTs) {
      // Remote payload is older than our local pick; push our newer theme up.
      scheduleRemoteThemePush(localPayload);
      return;
    }
    if (!remote.u && Date.now() - localTs < 5_000) {
      return;
    }
  }

  const appliedTs = remote.u && remote.u > 0 ? remote.u : Date.now();
  let next: JaTextThemeConfig = current;
  if (remote.k === "d" && remote.d) {
    next = sanitizeConfig({
      ...current,
      kind: "default",
      defaultId: remote.d,
      updatedAt: appliedTs,
    });
  } else if (remote.k === "p" && remote.p) {
    next = sanitizeConfig({
      ...current,
      kind: "preset",
      presetId: remote.p,
      updatedAt: appliedTs,
    });
  } else if (remote.k === "c" && remote.c) {
    next = sanitizeConfig({
      ...current,
      kind: "custom",
      custom: {
        appearance: remote.c.a === "l" ? "light" : "dark",
        colors: remote.c.cols,
        angle: remote.c.ang,
        intensity: remote.c.int,
      },
      updatedAt: appliedTs,
    });
  }

  configByScope.set(userId, next);
  writeScopeToStorage(userId, next);
  if (activeUserScope === userId) {
    applyThemeToDocument(next);
    emitChange();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useJaTextTheme(): JaTextThemeConfig {
  return useSyncExternalStore(subscribe, getThemeConfig, () => DEFAULT_CONFIG);
}
