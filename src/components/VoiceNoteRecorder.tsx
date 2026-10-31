import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { JaTextNative, ensureNativeMediaPermissions } from "../lib/nativeBridge";
import {
  encodeVoiceNoteMime,
  formatAudioDuration,
  pickSupportedAudioMime,
  type VoiceNoteMeta,
} from "../lib/voiceNotes";
import { PauseIcon, PlayIcon, SendIcon, TrashIcon } from "./UiIcons";

interface WebSpeechRecognitionInstance {
  stop: () => void;
  abort: () => void;
}

function summarizePeaks(samples: number[], targetBars = 28): number[] {
  if (samples.length === 0) {
    return Array.from({ length: targetBars }, (_, i) => 22 + ((i * 17) % 45));
  }
  const bars: number[] = [];
  for (let i = 0; i < targetBars; i++) {
    const start = Math.floor((i * samples.length) / targetBars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / targetBars));
    let sum = 0;
    for (let j = start; j < end && j < samples.length; j++) {
      sum += samples[j];
    }
    const avg = sum / Math.max(1, end - start);
    bars.push(Math.max(12, Math.min(100, Math.round(avg))));
  }
  return bars;
}

export function VoiceNoteRecorder({
  onSendVoiceNote,
  onCancel,
  onError,
}: {
  onSendVoiceNote: (file: File, meta: VoiceNoteMeta) => Promise<void> | void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [liveBars, setLiveBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 16));
  const [sending, setSending] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const peakSamplesRef = useRef<number[]>([]);
  const startedAtRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const transcriptFinalRef = useRef<string>("");
  const webSpeechRef = useRef<WebSpeechRecognitionInstance | null>(null);
  const nativeSpeechListenerRef = useRef<PluginListenerHandle | null>(null);
  const activeRef = useRef(true);
  const pausedRef = useRef(false);
  const mimeInfoRef = useRef(pickSupportedAudioMime());

  const cleanupAll = useCallback(async () => {
    activeRef.current = false;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (webSpeechRef.current) {
      try {
        webSpeechRef.current.stop();
      } catch {
        // Ignore stop errors.
      }
      webSpeechRef.current = null;
    }
    if (nativeSpeechListenerRef.current) {
      void nativeSpeechListenerRef.current.remove();
      nativeSpeechListenerRef.current = null;
    }
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await JaTextNative.stopSpeechCapture();
        if (res.transcript?.trim() && !transcriptFinalRef.current.trim()) {
          transcriptFinalRef.current = res.transcript.trim();
        }
      } catch {
        // Ignore native speech stop errors.
      }
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore recorder stop errors.
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;

    async function start() {
      const granted = await ensureNativeMediaPermissions(false);
      if (!granted) {
        onError("Microphone permission is needed to record voice notes.");
        onCancel();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        onError("Voice recording is not supported on this device.");
        onCancel();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const mimeInfo = pickSupportedAudioMime();
        mimeInfoRef.current = mimeInfo;
        const recorder = mimeInfo.mimeType
          ? new MediaRecorder(stream, { mimeType: mimeInfo.mimeType })
          : new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];
        peakSamplesRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.start(150);
        startedAtRef.current = Date.now();
        accumulatedMsRef.current = 0;

        timerRef.current = window.setInterval(() => {
          if (pausedRef.current) return;
          const totalMs = accumulatedMsRef.current + (Date.now() - startedAtRef.current);
          setElapsedSec(totalMs / 1000);
        }, 200);

        // Live Web Audio waveform analyzer
        try {
          const audioCtx = new window.AudioContext();
          audioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.72;
          source.connect(analyser);
          const freq = new Uint8Array(analyser.frequencyBinCount);
          let lastSamplePush = 0;

          const tick = () => {
            if (!activeRef.current) return;
            if (!pausedRef.current) {
              analyser.getByteFrequencyData(freq);
              const bars: number[] = [];
              let sum = 0;
              for (let i = 0; i < 24; i++) {
                const val = freq[i % freq.length] ?? 0;
                sum += val;
                bars.push(Math.max(14, Math.min(100, Math.round((val / 255) * 100))));
              }
              setLiveBars(bars);
              const now = performance.now();
              if (now - lastSamplePush > 90) {
                lastSamplePush = now;
                const avgPct = Math.max(14, Math.min(100, Math.round((sum / (24 * 255)) * 135)));
                peakSamplesRef.current.push(avgPct);
              }
            }
            rafRef.current = window.requestAnimationFrame(tick);
          };
          rafRef.current = window.requestAnimationFrame(tick);
        } catch {
          // Waveform visualizer is non-critical if AudioContext fails.
        }
        // Transcription runs strictly on-demand when holding down a voice note and clicking "Transcribe".
      } catch (cause) {
        onError(
          cause instanceof Error && cause.name === "NotAllowedError"
            ? "Allow microphone access to record a voice note."
            : "Could not access microphone for voice note.",
        );
        onCancel();
      }
    }

    void start();
    return () => {
      cancelled = true;
      void cleanupAll();
    };
  }, [cleanupAll, onCancel, onError]);

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (!paused) {
      if (recorder.state === "recording") {
        recorder.pause();
        accumulatedMsRef.current += Date.now() - startedAtRef.current;
        pausedRef.current = true;
        setPaused(true);
        try {
          webSpeechRef.current?.stop();
        } catch {
          // Ignore.
        }
      }
    } else if (recorder.state === "paused") {
      recorder.resume();
      startedAtRef.current = Date.now();
      pausedRef.current = false;
      setPaused(false);
    }
  }

  async function finishAndSend() {
    if (sending) return;
    const recorder = recorderRef.current;
    if (!recorder) return;
    setSending(true);

    const totalMs = pausedRef.current
      ? accumulatedMsRef.current
      : accumulatedMsRef.current + (Date.now() - startedAtRef.current);
    const durationSec = Math.max(0.6, totalMs / 1000);

    const stoppedBlob = await new Promise<Blob>((resolve) => {
      if (recorder.state === "inactive") {
        const fallbackType = mimeInfoRef.current.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type: fallbackType }));
        return;
      }
      recorder.onstop = () => {
        const actualType = recorder.mimeType || mimeInfoRef.current.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type: actualType }));
      };
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      }
    });

    await cleanupAll();

    const waveform = summarizePeaks(peakSamplesRef.current, 28);
    const meta: VoiceNoteMeta = {
      durationSec,
      waveform,
    };
    const encodedMime = encodeVoiceNoteMime(stoppedBlob.type || "audio/webm", meta);
    const ext = mimeInfoRef.current.ext || "webm";
    const fileName = `Voice note (${formatAudioDuration(durationSec)}).${ext}`;
    const voiceFile = new File([stoppedBlob], fileName, { type: encodedMime });

    try {
      await onSendVoiceNote(voiceFile, meta);
    } finally {
      setSending(false);
    }
  }

  async function cancelRecording() {
    await cleanupAll();
    onCancel();
  }

  return (
    <div className="voice-recorder-bar" role="region" aria-label="Recording voice note">
      <button
        type="button"
        className="icon-btn voice-cancel-btn"
        title="Discard voice note"
        aria-label="Discard voice note"
        disabled={sending}
        onClick={() => void cancelRecording()}
      >
        <TrashIcon size={17} />
      </button>

      <button
        type="button"
        className="icon-btn voice-pause-btn"
        title={paused ? "Resume recording" : "Pause recording"}
        aria-label={paused ? "Resume recording" : "Pause recording"}
        disabled={sending}
        onClick={togglePause}
      >
        {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
      </button>

      <div className="voice-recorder-track">
        <div className="voice-recorder-top">
          <span className={`voice-rec-dot ${paused ? "paused" : ""}`} aria-hidden="true" />
          <span className="voice-rec-time">{formatAudioDuration(elapsedSec)}</span>
          <div className="voice-rec-bars" aria-hidden="true">
            {liveBars.map((height, idx) => (
              <span
                key={idx}
                className="voice-rec-bar"
                style={{ height: `${Math.max(18, height)}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="send-btn"
        title="Send voice note"
        aria-label="Send voice note"
        disabled={sending}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void finishAndSend()}
      >
        <SendIcon size={18} />
      </button>
    </div>
  );
}
