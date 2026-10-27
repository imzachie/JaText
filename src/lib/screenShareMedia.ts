import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { JaTextNative } from "./nativeBridge";

export interface ScreenAudioMixer {
  outputTrack: MediaStreamTrack;
  hasScreenAudio: boolean;
  setMicMuted: (muted: boolean) => void;
  setMicTrack: (track: MediaStreamTrack | null, muted: boolean) => void;
  attachScreenAudioTrack: (track: MediaStreamTrack | null) => void;
  attachMediaElementAudio: (mediaEl: HTMLMediaElement) => void;
  pushNativePcm16Base64: (pcmBase64: string, sampleRate: number) => void;
  dispose: () => void;
}

export function createScreenAudioMixer(
  initialMicTrack: MediaStreamTrack | null,
  initialMicMuted: boolean,
): ScreenAudioMixer | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }

    const destination = ctx.createMediaStreamDestination();

    const micGain = ctx.createGain();
    micGain.gain.value = initialMicMuted ? 0 : 1;
    micGain.connect(destination);

    const screenGain = ctx.createGain();
    screenGain.gain.value = 0.95;
    screenGain.connect(destination);

    let micSource: MediaStreamAudioSourceNode | null = null;
    let screenTrackSource: MediaStreamAudioSourceNode | null = null;
    let mediaElementSource: MediaElementAudioSourceNode | null = null;
    let localMonitorGain: GainNode | null = null;
    let nextPcmTime = 0;
    let disposed = false;

    const mixer: ScreenAudioMixer = {
      outputTrack: destination.stream.getAudioTracks()[0],
      hasScreenAudio: false,

      setMicMuted(muted: boolean) {
        if (disposed) return;
        micGain.gain.value = muted ? 0 : 1;
      },

      setMicTrack(track: MediaStreamTrack | null, muted: boolean) {
        if (disposed) return;
        if (micSource) {
          try {
            micSource.disconnect();
          } catch {
            // ignore
          }
          micSource = null;
        }
        micGain.gain.value = muted ? 0 : 1;
        if (track && track.readyState === "live") {
          try {
            const ms = new MediaStream([track]);
            micSource = ctx.createMediaStreamSource(ms);
            micSource.connect(micGain);
          } catch {
            // ignore
          }
        }
      },

      attachScreenAudioTrack(track: MediaStreamTrack | null) {
        if (disposed) return;
        if (screenTrackSource) {
          try {
            screenTrackSource.disconnect();
          } catch {
            // ignore
          }
          screenTrackSource = null;
        }
        if (track && track.readyState === "live") {
          try {
            if (ctx.state === "suspended") {
              void ctx.resume().catch(() => undefined);
            }
            const ms = new MediaStream([track]);
            screenTrackSource = ctx.createMediaStreamSource(ms);
            screenTrackSource.connect(screenGain);
            mixer.hasScreenAudio = true;
          } catch {
            // ignore
          }
        }
      },

      attachMediaElementAudio(mediaEl: HTMLMediaElement) {
        if (disposed) return;
        try {
          if (ctx.state === "suspended") {
            void ctx.resume().catch(() => undefined);
          }
          mediaElementSource = ctx.createMediaElementSource(mediaEl);
          mediaElementSource.connect(screenGain);
          // Also route gently to local speakers so the sharer hears their shared video too
          localMonitorGain = ctx.createGain();
          localMonitorGain.gain.value = 0.85;
          mediaElementSource.connect(localMonitorGain);
          localMonitorGain.connect(ctx.destination);
          mixer.hasScreenAudio = true;
        } catch {
          // Fallback if mediaElementSource is unavailable
        }
      },

      pushNativePcm16Base64(pcmBase64: string, sampleRate: number) {
        if (disposed || !pcmBase64) return;
        try {
          if (ctx.state === "suspended") {
            void ctx.resume().catch(() => undefined);
          }
          const binary = atob(pcmBase64);
          const sampleCount = Math.floor(binary.length / 2);
          if (sampleCount <= 0) return;

          const sr = sampleRate > 0 ? sampleRate : 16000;
          const audioBuffer = ctx.createBuffer(1, sampleCount, sr);
          const channel = audioBuffer.getChannelData(0);

          for (let i = 0; i < sampleCount; i++) {
            const lo = binary.charCodeAt(i * 2);
            const hi = binary.charCodeAt(i * 2 + 1);
            let val = (hi << 8) | lo;
            if (val >= 0x8000) val -= 0x10000;
            channel[i] = val / 32768;
          }

          const src = ctx.createBufferSource();
          src.buffer = audioBuffer;
          src.connect(screenGain);

          const now = ctx.currentTime;
          if (nextPcmTime < now + 0.01 || nextPcmTime > now + 0.45) {
            nextPcmTime = now + 0.04;
          }
          src.start(nextPcmTime);
          nextPcmTime += audioBuffer.duration;
          mixer.hasScreenAudio = true;
        } catch {
          // ignore malformed chunk
        }
      },

      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          micSource?.disconnect();
        } catch {
          // ignore
        }
        try {
          screenTrackSource?.disconnect();
        } catch {
          // ignore
        }
        try {
          mediaElementSource?.disconnect();
          localMonitorGain?.disconnect();
        } catch {
          // ignore
        }
        try {
          destination.stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        void ctx.close().catch(() => undefined);
      },
    };

    mixer.setMicTrack(initialMicTrack, initialMicMuted);
    return mixer.outputTrack ? mixer : null;
  } catch {
    return null;
  }
}

export interface ActiveScreenShareSession {
  videoTrack: MediaStreamTrack;
  screenAudioTrack: MediaStreamTrack | null;
  sharedVideoElement?: HTMLVideoElement | null;
  stop: (notifyNative?: boolean) => void;
}

export function isWebDisplayMediaSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function")
  );
}

/**
 * Starts native Android MediaProjection screen + internal audio capture.
 * Crucial Android WebView fix: mounts the capture <canvas> into document.body
 * (offscreen 2x2px with 0.01 opacity) and runs a 260ms frame keep-alive so
 * WebView's canvas.captureStream() NEVER stalls or sends black frames!
 */
export async function startNativeAndroidScreenShare(options: {
  mixer: ScreenAudioMixer | null;
  onSystemStopped: () => void;
}): Promise<ActiveScreenShareSession | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const startRes = await JaTextNative.startScreenCapture();
  if (!startRes.started) return null;

  const width = Math.max(240, startRes.width ?? 540);
  const height = Math.max(240, startRes.height ?? 960);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;";
  document.body.appendChild(canvas);

  const ctx2d = canvas.getContext("2d", { alpha: false });
  if (!ctx2d) {
    canvas.remove();
    await JaTextNative.stopScreenCapture().catch(() => undefined);
    return null;
  }
  ctx2d.fillStyle = "#0b0b10";
  ctx2d.fillRect(0, 0, width, height);

  const captureCanvas = canvas as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  if (typeof captureCanvas.captureStream !== "function") {
    canvas.remove();
    await JaTextNative.stopScreenCapture().catch(() => undefined);
    return null;
  }

  const stream = captureCanvas.captureStream(18);
  const videoTrack = stream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;
  if (!videoTrack) {
    canvas.remove();
    await JaTextNative.stopScreenCapture().catch(() => undefined);
    return null;
  }
  try {
    videoTrack.contentHint = "detail";
  } catch {
    // ignore
  }

  let stopped = false;
  let decodingFrame = false;
  let latestDataUrl: string | null = null;
  const img = new Image();

  const drawFrameSource = (src: string) => {
    if (stopped || decodingFrame) return;
    decodingFrame = true;
    img.onload = () => {
      decodingFrame = false;
      if (stopped) return;
      if (canvas.width !== img.naturalWidth && img.naturalWidth > 0) {
        canvas.width = img.naturalWidth;
      }
      if (canvas.height !== img.naturalHeight && img.naturalHeight > 0) {
        canvas.height = img.naturalHeight;
      }
      ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
      videoTrack.requestFrame?.();
    };
    img.onerror = () => {
      decodingFrame = false;
    };
    img.src = src;
  };

  const frameHandle: PluginListenerHandle = await JaTextNative.addListener(
    "screenCaptureFrame",
    (ev) => {
      if (stopped || !ev.frame) return;
      latestDataUrl = `data:image/jpeg;base64,${ev.frame}`;
      drawFrameSource(latestDataUrl);
    },
  );

  const audioHandle: PluginListenerHandle = await JaTextNative.addListener(
    "screenCaptureAudio",
    (ev) => {
      if (stopped || !ev.pcm) return;
      options.mixer?.pushNativePcm16Base64(ev.pcm, ev.sampleRate || 16000);
    },
  );

  // Keep-alive redraw so WebRTC encoder always receives keyframes even when phone screen is static
  const keepAliveTimer = window.setInterval(() => {
    if (stopped) return;
    if (latestDataUrl && !decodingFrame) {
      drawFrameSource(latestDataUrl);
    } else {
      videoTrack.requestFrame?.();
    }
  }, 260);

  let stopHandle: PluginListenerHandle | null = null;

  const cleanup = (notifyNative = true) => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(keepAliveTimer);
    void frameHandle.remove();
    void audioHandle.remove();
    if (stopHandle) {
      void stopHandle.remove();
      stopHandle = null;
    }
    try {
      videoTrack.stop();
    } catch {
      // ignore
    }
    canvas.remove();
    if (notifyNative) {
      void JaTextNative.stopScreenCapture().catch(() => undefined);
    }
  };

  stopHandle = await JaTextNative.addListener("screenCaptureStopped", () => {
    if (stopped) return;
    cleanup(false);
    options.onSystemStopped();
  });

  return {
    videoTrack,
    screenAudioTrack: null,
    stop: cleanup,
  };
}

/**
 * Starts standard Desktop / Tablet Browser screen + system/tab audio sharing.
 */
export async function startWebDisplayScreenShare(options: {
  mixer: ScreenAudioMixer | null;
  onSystemStopped: () => void;
}): Promise<ActiveScreenShareSession> {
  const displayConstraints = {
    video: {
      frameRate: { ideal: 30, max: 60 },
      width: { max: 1920 },
      height: { max: 1080 },
    },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    systemAudio: "include",
    selfBrowserSurface: "include",
    surfaceSwitching: "include",
  } as DisplayMediaStreamOptions;

  let displayStream: MediaStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
  } catch (err) {
    // Retry with minimal constraints if a browser rejects advanced audio options
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "AbortError") {
      throw err;
    }
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  }

  const videoTrack = displayStream.getVideoTracks()[0];
  if (!videoTrack) {
    displayStream.getTracks().forEach((t) => t.stop());
    throw new Error("No screen video track selected.");
  }

  try {
    videoTrack.contentHint = "detail";
  } catch {
    // ignore
  }

  const screenAudioTrack = displayStream.getAudioTracks()[0] ?? null;
  if (screenAudioTrack && options.mixer) {
    options.mixer.attachScreenAudioTrack(screenAudioTrack);
  }

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    videoTrack.onended = null;
    displayStream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
  };

  videoTrack.onended = () => {
    if (stopped) return;
    cleanup();
    options.onSystemStopped();
  };

  return {
    videoTrack,
    screenAudioTrack,
    stop: cleanup,
  };
}

/**
 * Mobile Web fallback Option A: Share a Video / Screen Recording file WITH full stereo audio
 * directly into the call's Screen Share stage (works in Chrome Android & iOS Safari!).
 */
export async function startMobileVideoFileShare(
  file: File,
  options: {
    mixer: ScreenAudioMixer | null;
    onSystemStopped: () => void;
  },
): Promise<ActiveScreenShareSession> {
  const objectUrl = URL.createObjectURL(file);
  const videoEl = document.createElement("video");
  videoEl.src = objectUrl;
  videoEl.playsInline = true;
  videoEl.loop = false;
  videoEl.preload = "auto";
  videoEl.crossOrigin = "anonymous";
  videoEl.setAttribute("playsinline", "true");
  videoEl.setAttribute("webkit-playsinline", "true");
  videoEl.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:4px;height:4px;opacity:0.01;pointer-events:none;z-index:-1;";
  document.body.appendChild(videoEl);

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanupListeners();
      resolve();
    };
    const onError = () => {
      cleanupListeners();
      reject(new Error("Could not play the selected video file."));
    };
    const cleanupListeners = () => {
      videoEl.removeEventListener("loadedmetadata", onReady);
      videoEl.removeEventListener("error", onError);
    };
    videoEl.addEventListener("loadedmetadata", onReady);
    videoEl.addEventListener("error", onError);
  });

  // Connect audio into our WebAudio mixer so BOTH peers AND local user hear the shared video!
  if (options.mixer) {
    options.mixer.attachMediaElementAudio(videoEl);
  }

  await videoEl.play();

  const mediaWithCapture = videoEl as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };

  let videoTrack: MediaStreamTrack | undefined;
  let screenAudioTrack: MediaStreamTrack | null = null;
  let fallbackCanvas: HTMLCanvasElement | null = null;
  let fallbackRafId: number | null = null;

  const nativeCaptured =
    mediaWithCapture.captureStream?.() ?? mediaWithCapture.mozCaptureStream?.() ?? null;

  if (nativeCaptured && nativeCaptured.getVideoTracks().length > 0) {
    videoTrack = nativeCaptured.getVideoTracks()[0];
    screenAudioTrack = nativeCaptured.getAudioTracks()[0] ?? null;
    if (screenAudioTrack && options.mixer && !options.mixer.hasScreenAudio) {
      options.mixer.attachScreenAudioTrack(screenAudioTrack);
    }
  } else {
    // iOS Safari fallback: pump <video> frames onto mounted <canvas>.captureStream(24)
    fallbackCanvas = document.createElement("canvas");
    const vw = Math.max(320, Math.min(1280, videoEl.videoWidth || 640));
    const vh = Math.max(240, Math.min(720, videoEl.videoHeight || 360));
    fallbackCanvas.width = vw;
    fallbackCanvas.height = vh;
    fallbackCanvas.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;";
    document.body.appendChild(fallbackCanvas);
    const ctx2d = fallbackCanvas.getContext("2d", { alpha: false });
    const cStream = (
      fallbackCanvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
    ).captureStream?.(24);
    videoTrack = cStream?.getVideoTracks()[0];
    if (ctx2d && videoTrack) {
      const pump = () => {
        if (!fallbackCanvas) return;
        if (!videoEl.paused && !videoEl.ended) {
          ctx2d.drawImage(videoEl, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
        }
        fallbackRafId = window.requestAnimationFrame(pump);
      };
      fallbackRafId = window.requestAnimationFrame(pump);
    }
  }

  if (!videoTrack) {
    videoEl.pause();
    videoEl.remove();
    fallbackCanvas?.remove();
    URL.revokeObjectURL(objectUrl);
    throw new Error("Could not stream video on this mobile browser.");
  }

  try {
    videoTrack.contentHint = "motion";
  } catch {
    // ignore
  }

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (fallbackRafId !== null) {
      window.cancelAnimationFrame(fallbackRafId);
      fallbackRafId = null;
    }
    videoEl.onended = null;
    try {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();
    } catch {
      // ignore
    }
    videoEl.remove();
    if (fallbackCanvas) {
      fallbackCanvas.remove();
      fallbackCanvas = null;
    }
    try {
      videoTrack?.stop();
      screenAudioTrack?.stop();
    } catch {
      // ignore
    }
    URL.revokeObjectURL(objectUrl);
  };

  videoEl.onended = () => {
    if (stopped) return;
    cleanup();
    options.onSystemStopped();
  };

  return {
    videoTrack,
    screenAudioTrack,
    sharedVideoElement: videoEl,
    stop: cleanup,
  };
}

/**
 * Mobile Web fallback Option B: Share Live Rear/Environment Presentation Camera into Screen Share stage.
 */
export async function startMobileRearPresentationShare(options: {
  onSystemStopped: () => void;
}): Promise<ActiveScreenShareSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Could not access presentation camera.");
  }

  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    videoTrack.onended = null;
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
  };

  videoTrack.onended = () => {
    if (stopped) return;
    cleanup();
    options.onSystemStopped();
  };

  return {
    videoTrack,
    screenAudioTrack: null,
    stop: cleanup,
  };
}
