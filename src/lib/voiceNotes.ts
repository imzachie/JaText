export interface VoiceNoteMeta {
  durationSec: number;
  waveform: number[];
  transcript?: string;
}

const TRANSCRIPT_CACHE_KEY = "jatext-voice-transcripts-v1";
const DEFAULT_WAVEFORM = [
  24, 38, 56, 42, 72, 85, 60, 46, 78, 92, 64, 48, 36, 70,
  88, 76, 52, 62, 84, 58, 44, 68, 74, 50, 38, 54, 40, 28,
];

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function pickSupportedAudioMime(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "audio/webm", ext: "webm" };
  }
  const candidates: { mimeType: string; ext: string }[] = [
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/webm", ext: "webm" },
    { mimeType: "audio/mp4", ext: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return { mimeType: "", ext: "webm" };
}

export function encodeVoiceNoteMime(baseMime: string, meta: VoiceNoteMeta): string {
  const cleanBase = (baseMime.split(";")[0] || "audio/webm").trim();
  const compact = {
    d: Math.max(0.5, Math.round(meta.durationSec * 10) / 10),
    w: (meta.waveform.length ? meta.waveform : DEFAULT_WAVEFORM)
      .slice(0, 28)
      .map((bar) => Math.max(10, Math.min(100, Math.round(bar)))),
    ...(meta.transcript?.trim() ? { t: meta.transcript.trim().slice(0, 1200) } : {}),
  };
  return `${cleanBase};jvn=${toBase64Url(JSON.stringify(compact))}`;
}

export function decodeVoiceNoteMime(attachmentType?: string | null): VoiceNoteMeta | null {
  if (!attachmentType) return null;
  const match = /;jvn=([A-Za-z0-9_-]+)/.exec(attachmentType);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(match[1]));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { d?: unknown; w?: unknown; t?: unknown };
    const durationSec = typeof record.d === "number" && Number.isFinite(record.d) ? record.d : 0;
    const waveform = Array.isArray(record.w)
      ? record.w
          .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
          .map((n) => Math.max(10, Math.min(100, Math.round(n))))
      : DEFAULT_WAVEFORM;
    const transcript = typeof record.t === "string" && record.t.trim() ? record.t.trim() : undefined;
    return {
      durationSec,
      waveform: waveform.length > 0 ? waveform : DEFAULT_WAVEFORM,
      transcript,
    };
  } catch {
    return null;
  }
}

export function isVoiceNoteOrAudio(
  attachmentType?: string | null,
  attachmentName?: string | null,
): boolean {
  const type = (attachmentType ?? "").toLowerCase();
  if (type.startsWith("audio/")) return true;
  const name = (attachmentName ?? "").toLowerCase();
  if (/\.(mp3|wav|m4a|aac|opus|flac)$/i.test(name)) return true;
  if (!type.startsWith("video/") && /voice[-_ ]?note/i.test(name)) return true;
  return false;
}

export function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getDefaultWaveform(): number[] {
  return DEFAULT_WAVEFORM;
}

function loadTranscriptCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TRANSCRIPT_CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function getCachedVoiceTranscript(messageId: string): string | undefined {
  const map = loadTranscriptCache();
  return map[messageId];
}

export const VOICE_TRANSCRIPT_EVENT = "jatext:voice-transcript";

export interface VoiceTranscriptEventDetail {
  messageId: string;
  status: "progress" | "done" | "error";
  percent?: number;
  partialText?: string;
  text?: string;
  error?: string;
}

function emitVoiceTranscriptEvent(detail: VoiceTranscriptEventDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<VoiceTranscriptEventDetail>(VOICE_TRANSCRIPT_EVENT, { detail }));
  } catch {
    // Ignore dispatch errors in non-DOM contexts.
  }
}

export function saveCachedVoiceTranscript(messageId: string, transcript: string): void {
  try {
    const map = loadTranscriptCache();
    map[messageId] = transcript;
    const entries = Object.entries(map).slice(-200);
    localStorage.setItem(TRANSCRIPT_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage quota errors.
  }
  emitVoiceTranscriptEvent({
    messageId,
    status: "done",
    percent: 100,
    text: transcript,
  });
}

type AsrCallable = (
  audio: Float32Array,
  options?: { chunk_length_s?: number; stride_length_s?: number },
) => Promise<{ text?: string }>;

let cachedAsrPipelinePromise: Promise<AsrCallable> | null = null;

async function getFallbackWhisperPipeline(): Promise<AsrCallable> {
  if (!cachedAsrPipelinePromise) {
    const cdnUrl = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm";
    cachedAsrPipelinePromise = import(/* @vite-ignore */ cdnUrl)
      .then(
        async (mod: {
          pipeline: (
            task: string,
            model: string,
            opts?: Record<string, unknown>,
          ) => Promise<AsrCallable>;
          env?: { allowLocalModels?: boolean };
        }) => {
          if (mod.env) mod.env.allowLocalModels = false;
          return mod.pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
            dtype: "q8",
          });
        },
      )
      .catch((error: unknown) => {
        cachedAsrPipelinePromise = null;
        throw error;
      });
  }
  return cachedAsrPipelinePromise;
}

interface PendingWorkerJob {
  messageId: string;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  onProgress?: (percent: number, partialText?: string) => void;
}

let sharedWorker: Worker | null = null;
let sharedWorkerFailed = false;
const pendingWorkerJobs = new Map<string, PendingWorkerJob>();
const inFlightTranscripts = new Map<string, Promise<string>>();

function getOrCreateTranscriptWorker(): Worker | null {
  if (sharedWorkerFailed || typeof Worker === "undefined") return null;
  if (sharedWorker) return sharedWorker;
  try {
    const worker = new Worker(new URL("./voiceTranscriptWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (
      event: MessageEvent<
        | { type: "progress"; id: string; percent: number; partialText?: string }
        | { type: "done"; id: string; text: string }
        | { type: "error"; id: string; message: string }
      >,
    ) => {
      const msg = event.data;
      if (!msg || !msg.id) return;
      const job = pendingWorkerJobs.get(msg.id);
      if (!job) return;

      if (msg.type === "progress") {
        job.onProgress?.(msg.percent, msg.partialText);
        emitVoiceTranscriptEvent({
          messageId: job.messageId,
          status: "progress",
          percent: msg.percent,
          partialText: msg.partialText,
        });
      } else if (msg.type === "done") {
        pendingWorkerJobs.delete(msg.id);
        job.resolve(msg.text);
      } else if (msg.type === "error") {
        pendingWorkerJobs.delete(msg.id);
        job.reject(new Error(msg.message || "Transcription failed."));
      }
    };
    worker.onerror = () => {
      sharedWorkerFailed = true;
      sharedWorker = null;
      for (const [id, job] of pendingWorkerJobs.entries()) {
        pendingWorkerJobs.delete(id);
        job.reject(new Error("Worker transcription unavailable."));
      }
    };
    sharedWorker = worker;
    return worker;
  } catch {
    sharedWorkerFailed = true;
    return null;
  }
}

async function runWorkerTranscription(
  messageId: string,
  pcm16k: Float32Array,
  onProgress?: (percent: number, partialText?: string) => void,
): Promise<string> {
  const worker = getOrCreateTranscriptWorker();
  if (!worker) {
    throw new Error("Worker unavailable");
  }
  const jobId = `${messageId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const transferablePcm = new Float32Array(pcm16k.length);
  transferablePcm.set(pcm16k);

  return new Promise<string>((resolve, reject) => {
    pendingWorkerJobs.set(jobId, { messageId, resolve, reject, onProgress });
    worker.postMessage(
      {
        type: "transcribe",
        id: jobId,
        pcm: transferablePcm,
      },
      [transferablePcm.buffer],
    );
  });
}

async function decodeTo16kHzMono(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load voice note audio.");
  }
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = new window.AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const targetSampleRate = 16_000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));
    const offline = new OfflineAudioContext(1, frameCount, targetSampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    // Copy out of AudioBuffer so the underlying buffer can be transferred cleanly to the Worker
    const out = new Float32Array(rendered.length);
    out.set(rendered.getChannelData(0));
    return out;
  } finally {
    void audioCtx.close().catch(() => undefined);
  }
}

export async function resolveVoiceNoteTranscript(
  messageId: string,
  audioUrl: string,
  embeddedTranscript?: string,
  onProgress?: (percent: number, partialText?: string) => void,
): Promise<string> {
  if (embeddedTranscript?.trim()) {
    saveCachedVoiceTranscript(messageId, embeddedTranscript.trim());
    return embeddedTranscript.trim();
  }
  const cached = getCachedVoiceTranscript(messageId);
  if (cached) return cached;

  const existingJob = inFlightTranscripts.get(messageId);
  if (existingJob) return existingJob;

  const jobPromise = (async () => {
    try {
      emitVoiceTranscriptEvent({ messageId, status: "progress", percent: 2 });
      onProgress?.(2);

      const pcm16k = await decodeTo16kHzMono(audioUrl);

      let text: string;
      try {
        text = await runWorkerTranscription(messageId, pcm16k, onProgress);
      } catch {
        // Graceful fallback if Worker fails in restricted WebView
        const transcriber = await getFallbackWhisperPipeline();
        const output = await transcriber(pcm16k, {
          chunk_length_s: 30,
          stride_length_s: 5,
        });
        text = (output.text ?? "").trim() || "No clear speech detected in this voice note.";
      }

      const finalText = text.trim() || "No clear speech detected in this voice note.";
      saveCachedVoiceTranscript(messageId, finalText);
      return finalText;
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Couldn't transcribe this voice note right now.";
      emitVoiceTranscriptEvent({ messageId, status: "error", error: msg });
      throw err;
    } finally {
      inFlightTranscripts.delete(messageId);
    }
  })();

  inFlightTranscripts.set(messageId, jobPromise);
  return jobPromise;
}
