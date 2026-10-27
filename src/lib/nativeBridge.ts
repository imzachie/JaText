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

export interface ScreenCaptureStoppedEvent {
  stopped: boolean;
}

export interface ApkDownloadProgressEvent {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

export interface AppVersionInfo {
  versionName: string;
  versionCode: number;
  canInstallPackages: boolean;
}

export interface JaTextNativePlugin {
  checkPushSupport(): Promise<{ firebaseConfigured: boolean }>;
  getAppVersionInfo(): Promise<AppVersionInfo>;
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
  setCallAudioRoute(options: { active: boolean; speaker: boolean }): Promise<{ speaker: boolean }>;
  startScreenCapture(): Promise<{ started: boolean; width?: number; height?: number }>;
  stopScreenCapture(): Promise<{ stopped: boolean }>;
  startSpeechCapture(): Promise<{ started: boolean }>;
  stopSpeechCapture(): Promise<{ transcript: string }>;
  addListener(
    eventName: "speechTranscript",
    listenerFunc: (event: SpeechTranscriptEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "screenCaptureFrame",
    listenerFunc: (event: ScreenCaptureFrameEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "screenCaptureStopped",
    listenerFunc: (event: ScreenCaptureStoppedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "apkDownloadProgress",
    listenerFunc: (event: ApkDownloadProgressEvent) => void,
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

export async function configureNativeCallAudio(active: boolean, speaker: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await JaTextNative.setCallAudioRoute({ active, speaker });
  } catch {
    // Ignore on platforms that don't support native audio routing.
  }
}
