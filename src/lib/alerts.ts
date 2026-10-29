import { Capacitor } from "@capacitor/core";
import { JaTextNative, type DeviceSystemSoundItem } from "./nativeBridge";

export type SoundMode = "default" | "system" | "custom";

export interface SoundSelection {
  mode: SoundMode;
  uri: string;
  label: string;
}

export interface NotificationPreferences {
  notificationsEnabled: boolean;
  soundsEnabled: boolean;
  notificationSound: SoundSelection;
  callRingtone: SoundSelection;
}

export const DEFAULT_SOUND_LABEL = "JaText (Default)";
export const DEFAULT_NOTIFICATION_SOUND_URL = "/sounds/jatext-notification.mp3";
export const DEFAULT_CALL_RINGTONE_URL = "/sounds/jatext-ringtone.wav";
export const SOUND_PREFS_CHANGED_EVENT = "jatext:sound-prefs-changed";

const PREFERENCES_KEY = "jatext-notification-preferences-v1";
const CUSTOM_SOUND_DB = "jatext-custom-sounds-v1";
const CUSTOM_SOUND_STORE = "sounds";

export function defaultSoundSelection(): SoundSelection {
  return {
    mode: "default",
    uri: "",
    label: DEFAULT_SOUND_LABEL,
  };
}

function normalizeSoundSelection(raw: unknown): SoundSelection {
  if (!raw || typeof raw !== "object") {
    return defaultSoundSelection();
  }
  const obj = raw as Partial<SoundSelection>;
  const mode: SoundMode =
    obj.mode === "system" || obj.mode === "custom" ? obj.mode : "default";
  const uri = typeof obj.uri === "string" ? obj.uri : "";
  const label =
    typeof obj.label === "string" && obj.label.trim()
      ? obj.label.trim()
      : DEFAULT_SOUND_LABEL;
  if (mode !== "default" && !uri) {
    return defaultSoundSelection();
  }
  return { mode, uri, label: mode === "default" ? DEFAULT_SOUND_LABEL : label };
}

export function loadNotificationPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) {
      return {
        notificationsEnabled: Capacitor.isNativePlatform(),
        soundsEnabled: true,
        notificationSound: defaultSoundSelection(),
        callRingtone: defaultSoundSelection(),
      };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {
        notificationsEnabled: Capacitor.isNativePlatform(),
        soundsEnabled: true,
        notificationSound: defaultSoundSelection(),
        callRingtone: defaultSoundSelection(),
      };
    }
    const preferences = parsed as Partial<NotificationPreferences>;
    return {
      notificationsEnabled:
        preferences.notificationsEnabled !== undefined
          ? preferences.notificationsEnabled === true
          : Capacitor.isNativePlatform(),
      soundsEnabled: preferences.soundsEnabled !== false,
      notificationSound: normalizeSoundSelection(preferences.notificationSound),
      callRingtone: normalizeSoundSelection(preferences.callRingtone),
    };
  } catch {
    return {
      notificationsEnabled: Capacitor.isNativePlatform(),
      soundsEnabled: true,
      notificationSound: defaultSoundSelection(),
      callRingtone: defaultSoundSelection(),
    };
  }
}

export function syncSoundPreferencesToNative(preferences: NotificationPreferences) {
  if (!Capacitor.isNativePlatform()) return;
  void JaTextNative.setSoundPreferences({
    notifMode: preferences.notificationSound.mode,
    notifUri: preferences.notificationSound.uri,
    notifLabel: preferences.notificationSound.label,
    ringMode: preferences.callRingtone.mode,
    ringUri: preferences.callRingtone.uri,
    ringLabel: preferences.callRingtone.label,
  }).catch(() => undefined);
}

export function saveNotificationPreferences(preferences: NotificationPreferences) {
  const normalized: NotificationPreferences = {
    notificationsEnabled: preferences.notificationsEnabled === true,
    soundsEnabled: preferences.soundsEnabled !== false,
    notificationSound: normalizeSoundSelection(preferences.notificationSound),
    callRingtone: normalizeSoundSelection(preferences.callRingtone),
  };
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(normalized));
  syncSoundPreferencesToNative(normalized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SOUND_PREFS_CHANGED_EVENT, { detail: normalized }));
  }
}

/* ------------------------------------------------------------------ */
/* IndexedDB Custom Sound Storage (Web + WebView fallback)             */
/* ------------------------------------------------------------------ */

const customObjectUrlCache = new Map<string, string>();

function openCustomSoundDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CUSTOM_SOUND_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CUSTOM_SOUND_STORE)) {
        db.createObjectStore(CUSTOM_SOUND_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putCustomSoundBlob(key: string, blob: Blob): Promise<string> {
  const prev = customObjectUrlCache.get(key);
  if (prev) {
    URL.revokeObjectURL(prev);
  }
  const objUrl = URL.createObjectURL(blob);
  customObjectUrlCache.set(key, objUrl);
  try {
    const db = await openCustomSoundDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_SOUND_STORE, "readwrite");
      tx.objectStore(CUSTOM_SOUND_STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Keep in-memory URL even if IndexedDB fails in private mode
  }
  return objUrl;
}

async function getCustomSoundObjectUrl(key: string): Promise<string | null> {
  const existing = customObjectUrlCache.get(key);
  if (existing) return existing;
  try {
    const db = await openCustomSoundDb();
    const blob = await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(CUSTOM_SOUND_STORE, "readonly");
      const req = tx.objectStore(CUSTOM_SOUND_STORE).get(key);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    customObjectUrlCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function saveUploadedCustomSound(
  category: "notification" | "ringtone",
  file: File,
): Promise<SoundSelection> {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Custom audio files must be under 15 MB.");
  }
  const idbKey = category === "ringtone" ? "custom_ringtone" : "custom_notification";
  await putCustomSoundBlob(idbKey, file);

  const cleanLabel = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || file.name;
  if (Capacitor.isNativePlatform()) {
    const base64 = await fileToBase64(file);
    const saved = await JaTextNative.saveCustomSound({
      category,
      fileName: file.name,
      base64,
    });
    return {
      mode: "custom",
      uri: saved.path,
      label: cleanLabel,
    };
  }

  return {
    mode: "custom",
    uri: idbKey,
    label: cleanLabel,
  };
}

export async function fetchDeviceSystemSounds(
  category: "notification" | "ringtone",
): Promise<DeviceSystemSoundItem[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const res = await JaTextNative.listDeviceSounds({ category });
    return Array.isArray(res.sounds) ? res.sounds : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Sound Playback (Messages, Previews & Looping Incoming Call Ring)    */
/* ------------------------------------------------------------------ */

let audioContext: AudioContext | null = null;
let defaultNotifAudio: HTMLAudioElement | null = null;
let defaultRingtoneAudio: HTMLAudioElement | null = null;
let activeWebRingtoneAudio: HTMLAudioElement | null = null;
let activeWebPreviewAudio: HTMLAudioElement | null = null;
let webRingtoneFallbackInterval: number | null = null;
let ringtoneLoopToken = 0;

if (typeof window !== "undefined" && !Capacitor.isNativePlatform()) {
  const unlockWebAudioOnce = () => {
    try {
      audioContext ??= new window.AudioContext();
      if (audioContext.state === "suspended") {
        void audioContext.resume().catch(() => undefined);
      }
      if (!defaultNotifAudio) {
        defaultNotifAudio = new Audio(DEFAULT_NOTIFICATION_SOUND_URL);
        defaultNotifAudio.preload = "auto";
      }
      if (!defaultRingtoneAudio) {
        defaultRingtoneAudio = new Audio(DEFAULT_CALL_RINGTONE_URL);
        defaultRingtoneAudio.preload = "auto";
      }
    } catch {
      // Ignore
    }
    window.removeEventListener("pointerdown", unlockWebAudioOnce, true);
    window.removeEventListener("keydown", unlockWebAudioOnce, true);
  };
  window.addEventListener("pointerdown", unlockWebAudioOnce, { capture: true, passive: true });
  window.addEventListener("keydown", unlockWebAudioOnce, { capture: true, passive: true });
}

function stopWebAudioElement(el: HTMLAudioElement | null) {
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    // Ignore
  }
}

function clearWebRingtoneFallback() {
  if (webRingtoneFallbackInterval !== null && typeof window !== "undefined") {
    window.clearInterval(webRingtoneFallbackInterval);
    webRingtoneFallbackInterval = null;
  }
}

function playSynthRingtonePulse() {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  try {
    audioContext ??= new window.AudioContext();
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }
    const ctx = audioContext;
    const now = ctx.currentTime;
    const notes = [
      { f: 659.25, t: 0, d: 0.18 },
      { f: 783.99, t: 0.2, d: 0.18 },
      { f: 1046.5, t: 0.4, d: 0.3 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.f, now + n.t);
      gain.gain.setValueAtTime(0.0001, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.14, now + n.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.02);
    }
  } catch {
    // Ignore
  }
}

function playSentTick() {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  audioContext ??= new window.AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }
  const context = audioContext;
  const startAt = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.09, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.095);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.1);
}

export function playMessageSound(direction: "sent" | "received") {
  if (direction === "sent") {
    playSentTick();
    return;
  }

  const prefs = loadNotificationPreferences();
  if (!prefs.soundsEnabled) return;
  const sel = prefs.notificationSound;

  if (Capacitor.isNativePlatform() && (sel.mode === "system" || sel.mode === "custom")) {
    void JaTextNative.previewSound({
      category: "notification",
      mode: sel.mode,
      uri: sel.uri,
      loop: false,
    }).catch(() => undefined);
    return;
  }

  void (async () => {
    let url = DEFAULT_NOTIFICATION_SOUND_URL;
    if (sel.mode === "custom") {
      const customUrl = await getCustomSoundObjectUrl("custom_notification");
      if (customUrl) url = customUrl;
    }

    try {
      if (url === DEFAULT_NOTIFICATION_SOUND_URL) {
        defaultNotifAudio ??= new Audio(DEFAULT_NOTIFICATION_SOUND_URL);
        defaultNotifAudio.currentTime = 0;
        defaultNotifAudio.volume = 1.0;
        await defaultNotifAudio.play();
      } else {
        const audio = new Audio(url);
        audio.volume = 1.0;
        await audio.play();
      }
    } catch {
      if (Capacitor.isNativePlatform()) {
        void JaTextNative.previewSound({
          category: "notification",
          mode: sel.mode,
          uri: sel.uri,
          loop: false,
        }).catch(() => undefined);
      }
    }
  })();
}

export function startIncomingCallRingtone() {
  const token = ++ringtoneLoopToken;
  const prefs = loadNotificationPreferences();
  if (!prefs.soundsEnabled) return;

  if (Capacitor.isNativePlatform()) {
    void JaTextNative.startNativeRingtone().catch(() => undefined);
    return;
  }

  stopWebAudioElement(activeWebRingtoneAudio);
  activeWebRingtoneAudio = null;
  clearWebRingtoneFallback();

  void (async () => {
    let url = DEFAULT_CALL_RINGTONE_URL;
    if (prefs.callRingtone.mode === "custom") {
      const customUrl = await getCustomSoundObjectUrl("custom_ringtone");
      if (token !== ringtoneLoopToken) return;
      if (customUrl) url = customUrl;
    }
    if (token !== ringtoneLoopToken) return;
    const audio =
      url === DEFAULT_CALL_RINGTONE_URL
        ? (defaultRingtoneAudio ??= new Audio(DEFAULT_CALL_RINGTONE_URL))
        : new Audio(url);
    audio.currentTime = 0;
    audio.loop = true;
    audio.volume = 0.95;
    activeWebRingtoneAudio = audio;
    try {
      await audio.play();
    } catch {
      // Browser blocked autoplay prior to user interaction — run synthesized loop + resume on first gesture
      if (token !== ringtoneLoopToken || typeof window === "undefined") return;
      playSynthRingtonePulse();
      webRingtoneFallbackInterval = window.setInterval(() => {
        if (token !== ringtoneLoopToken) {
          clearWebRingtoneFallback();
          return;
        }
        playSynthRingtonePulse();
      }, 2200);
      const retryOnGesture = () => {
        window.removeEventListener("pointerdown", retryOnGesture, true);
        window.removeEventListener("keydown", retryOnGesture, true);
        if (token !== ringtoneLoopToken) return;
        clearWebRingtoneFallback();
        void audio.play().catch(() => undefined);
      };
      window.addEventListener("pointerdown", retryOnGesture, { capture: true, passive: true });
      window.addEventListener("keydown", retryOnGesture, { capture: true, passive: true });
    }
  })();
}

export function stopIncomingCallRingtone() {
  ringtoneLoopToken++;
  clearWebRingtoneFallback();
  stopWebAudioElement(activeWebRingtoneAudio);
  activeWebRingtoneAudio = null;
  if (Capacitor.isNativePlatform()) {
    void JaTextNative.stopNativeRingtone().catch(() => undefined);
  }
}

export function stopSoundPreviewPlayback() {
  stopWebAudioElement(activeWebPreviewAudio);
  activeWebPreviewAudio = null;
  if (Capacitor.isNativePlatform()) {
    void JaTextNative.stopSoundPreview().catch(() => undefined);
  }
}

export function previewSelectedSound(
  category: "notification" | "ringtone",
  selection: SoundSelection,
) {
  stopSoundPreviewPlayback();
  if (Capacitor.isNativePlatform()) {
    void JaTextNative.previewSound({
      category,
      mode: selection.mode,
      uri: selection.uri,
      loop: false,
    }).catch(() => undefined);
    return;
  }

  void (async () => {
    let url =
      category === "ringtone"
        ? DEFAULT_CALL_RINGTONE_URL
        : DEFAULT_NOTIFICATION_SOUND_URL;
    if (selection.mode === "custom") {
      const key = category === "ringtone" ? "custom_ringtone" : "custom_notification";
      const customUrl = await getCustomSoundObjectUrl(key);
      if (customUrl) url = customUrl;
    }
    try {
      const audio = new Audio(url);
      audio.loop = false;
      audio.volume = 0.92;
      activeWebPreviewAudio = audio;
      await audio.play();
    } catch {
      // Ignore
    }
  })();
}
