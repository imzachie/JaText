import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface SpeechTranscriptEvent {
  text: string;
  isFinal: boolean;
}

export interface ScreenCaptureFrameEvent {
  frame: string;
  width: number;
  height: number;
}

export interface ScreenCaptureAudioEvent {
  pcm: string;
  sampleRate: number;
}

export interface ScreenCaptureStoppedEvent {
  stopped: boolean;
}

export interface ApkDownloadProgressEvent {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface RichContentPasteEvent {
  base64: string;
  mimeType: string;
  fileName: string;
}

export interface AppVersionInfo {
  versionName: string;
  versionCode: number;
  canInstallPackages: boolean;
}

export interface DeviceSystemSoundItem {
  title: string;
  uri: string;
}

export interface NotificationOpenEvent {
  senderId?: string;
  groupId?: string;
  chatId?: string;
  incomingCallWake?: boolean;
}

export interface JaTextNativePlugin {
  checkPushSupport(): Promise<{ firebaseConfigured: boolean }>;
  getAppVersionInfo(): Promise<AppVersionInfo>;
  fetchUpdateManifest(options: { url: string }): Promise<{
    ok: boolean;
    status: number;
    body: string;
  }>;
  openUnknownSourcesSettings(): Promise<{
    canInstallPackages?: boolean;
    launchedInstaller?: boolean;
  }>;
  downloadAndInstallApk(options: { url: string }): Promise<{
    needsUnknownSourcesPermission: boolean;
    launchedInstaller: boolean;
  }>;
  copyImageBase64(options: { base64: string }): Promise<{ copied: boolean }>;
  requestMediaPermissions(options: { video: boolean }): Promise<{ granted: boolean }>;
  setCallAudioRoute(options: {
    active: boolean;
    speaker: boolean;
    video?: boolean;
    title?: string;
  }): Promise<{ speaker: boolean }>;
  startScreenCapture(): Promise<{ started: boolean; width?: number; height?: number }>;
  stopScreenCapture(): Promise<{ stopped: boolean }>;
  startSpeechCapture(): Promise<{ started: boolean }>;
  stopSpeechCapture(): Promise<{ transcript: string }>;
  setAuthStorageItem(options: {
    key: string;
    value: string;
    convexUrl?: string;
  }): Promise<void>;
  getAuthStorageItem(options: { key: string }): Promise<{ value: string | null }>;
  removeAuthStorageItem(options: { key: string }): Promise<void>;
  syncE2EENotificationState(options: {
    convexUrl?: string;
    userId: string;
    notificationsEnabled: boolean;
    isDnd: boolean;
    identitiesJson: string;
    peersJson: string;
    groupsJson: string;
    authJwt?: string;
    authRefreshToken?: string;
  }): Promise<void>;
  showDecryptedNotification(options: {
    tag: string;
    title: string;
    body: string;
    senderId?: string;
    groupId?: string;
    chatId?: string;
  }): Promise<void>;
  triggerIncomingCallWake(options: {
    senderId?: string;
    groupId?: string;
    callerTitle?: string;
    isVideo?: boolean;
  }): Promise<void>;
  cancelIncomingCallWake(): Promise<void>;
  startNativeRingtone(): Promise<void>;
  stopNativeRingtone(): Promise<void>;
  listDeviceSounds(options: {
    category: "notification" | "ringtone";
  }): Promise<{ sounds: DeviceSystemSoundItem[] }>;
  setSoundPreferences(options: {
    notifMode?: string;
    notifUri?: string;
    notifLabel?: string;
    ringMode?: string;
    ringUri?: string;
    ringLabel?: string;
  }): Promise<void>;
  saveCustomSound(options: {
    category: "notification" | "ringtone";
    fileName: string;
    base64: string;
  }): Promise<{ path: string; fileName: string }>;
  previewSound(options: {
    category: "notification" | "ringtone";
    mode: string;
    uri?: string;
    loop?: boolean;
  }): Promise<void>;
  stopSoundPreview(): Promise<void>;
  checkCallWakePermissions(): Promise<{
    canDrawOverlays: boolean;
    canFullScreenIntent: boolean;
  }>;
  openCallWakeSettings(options: { kind: "overlay" | "fullscreen" }): Promise<void>;
  addListener(
    eventName: "speechTranscript",
    listenerFunc: (event: SpeechTranscriptEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "screenCaptureFrame",
    listenerFunc: (event: ScreenCaptureFrameEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "screenCaptureAudio",
    listenerFunc: (event: ScreenCaptureAudioEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "screenCaptureStopped",
    listenerFunc: (event: ScreenCaptureStoppedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "apkDownloadProgress",
    listenerFunc: (event: ApkDownloadProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "richContentPaste",
    listenerFunc: (event: RichContentPasteEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "notificationOpen",
    listenerFunc: (event: NotificationOpenEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const JaTextNative = registerPlugin<JaTextNativePlugin>("JaTextNative");

export async function ensureNativeMediaPermissions(video: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await JaTextNative.requestMediaPermissions({ video });
    return res.granted !== false;
  } catch {
    return true;
  }
}

export async function configureNativeCallAudio(
  active: boolean,
  speaker: boolean,
  options?: { video?: boolean; title?: string },
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await JaTextNative.setCallAudioRoute({
      active,
      speaker,
      video: options?.video,
      title: options?.title,
    });
  } catch {
    // Ignore on platforms that don't support native audio routing.
  }
}

export function createNativeSyncedAuthStorage(convexUrl?: string) {
  return {
    async getItem(key: string): Promise<string | null> {
      const localVal = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (!Capacitor.isNativePlatform()) return localVal;
      try {
        const res = await JaTextNative.getAuthStorageItem({ key });
        if (res.value) {
          if (res.value !== localVal && typeof window !== "undefined") {
            window.localStorage.setItem(key, res.value);
          }
          return res.value;
        }
        if (localVal) {
          await JaTextNative.setAuthStorageItem({ key, value: localVal, convexUrl });
        }
      } catch {
        // Fallback to localStorage
      }
      return localVal;
    },
    async setItem(key: string, value: string): Promise<void> {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, value);
      }
      if (Capacitor.isNativePlatform()) {
        await JaTextNative.setAuthStorageItem({ key, value, convexUrl }).catch(() => undefined);
      }
    },
    async removeItem(key: string): Promise<void> {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
      if (Capacitor.isNativePlatform()) {
        await JaTextNative.removeAuthStorageItem({ key }).catch(() => undefined);
      }
    },
  };
}

