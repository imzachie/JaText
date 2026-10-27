export interface VoiceNoteMeta {
  durationSec: number;
  waveform: number[];
  transcript?: string;
}

const TRANSCRIPT_CACHE_KEY = "jatext-voice-transcripts-v2";

const MUSIC_OUTPUT_TAG_RE =
  /[[(✶*]\s*(?:music|singing|song|instrumental|melody|guitar|piano|drums|beat|beats|hip[- ]?hop|rap music|pop music|rock music|electronic music|upbeat music|sad music|dramatic music|background music|playing music|music playing|musical|chorus|vocalizing|humming)[^)\]*]*[\])✶*]/iu;
const MUSIC_OUTPUT_NOTE_RE = /[♪♫♬♩🎵🎶]/u;

export function isMusicTranscriptText(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed === "(Music)") return true;
  if (MUSIC_OUTPUT_NOTE_RE.test(trimmed)) return true;
  if (MUSIC_OUTPUT_TAG_RE.test(trimmed)) return true;
  if (/^\(?\s*music\s*\)?\.?$/i.test(trimmed)) return true;
  return false;
}
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

/**
 * Fast pre-Whisper acoustic & stereo music detector.
 * Detects mastered/stereo music tracks before Whisper even runs so we can
 * immediately cancel transcription and output "(Music)" only.
 */
function detectMusicFromDecodedAudio(
  decoded: AudioBuffer,
  mono16k: Float32Array,
): boolean {
  const duration = decoded.duration;
  if (!Number.isFinite(duration) || duration < 3.5) {
    return false;
  }

  // 1) Stereo channel separation check:
  // Microphone voice notes are mono or dual-mono (L ≈ R). Produced music files
  // have genuine stereo panning/reverb separation (side/mid energy >= 0.085)
  // combined with continuous active audio frames.
  if (decoded.numberOfChannels >= 2 && decoded.length > 0) {
    const chL = decoded.getChannelData(0);
    const chR = decoded.getChannelData(1);
    const stride = Math.max(1, Math.floor(decoded.sampleRate / 2000));
    let midSq = 0;
    let sideSq = 0;
    for (let i = 0; i < chL.length; i += stride) {
      const l = chL[i];
      const r = chR[i];
      const mid = 0.5 * (l + r);
      const side = 0.5 * (l - r);
      midSq += mid * mid;
      sideSq += side * side;
    }
    if (midSq > 1e-6) {
      const sideToMidRms = Math.sqrt(sideSq / midSq);
      // Verify active frame continuity so stereo room noise on short speech isn't misclassified
      const frameLen = 800; // 50ms at 16kHz
      const rmsFrames: number[] = [];
      for (let pos = 0; pos + frameLen <= mono16k.length; pos += frameLen) {
        let sumSq = 0;
        for (let k = 0; k < frameLen; k++) {
          const s = mono16k[pos + k];
          sumSq += s * s;
        }
        rmsFrames.push(Math.sqrt(sumSq / frameLen));
      }
      if (rmsFrames.length >= 40) {
        const sorted = [...rmsFrames].sort((a, b) => a - b);
        const p80 = sorted[Math.floor(sorted.length * 0.8)] ?? 0;
        if (p80 > 0.008) {
          const activeCount = rmsFrames.filter((v) => v >= p80 * 0.22).length;
          const activeRatio = activeCount / rmsFrames.length;
          if (sideToMidRms >= 0.09 && activeRatio >= 0.72) {
            return true;
          }
        }
      }
    }
  }

  // 2) Continuous mastered musical envelope + harmonic periodicity check (works on mono music too):
  // Natural speech >= 6.5s has syllable/word/breath dips; continuous music maintains
  // uninterrupted energy across 50ms frames AND strong pitched autocorrelation.
  if (duration >= 6.5 && mono16k.length >= 16_000 * 6) {
    const frameLen = 800; // 50ms @ 16kHz
    const rmsList: number[] = [];
    for (let pos = 0; pos + frameLen <= mono16k.length; pos += frameLen) {
      let sumSq = 0;
      for (let k = 0; k < frameLen; k++) {
        const s = mono16k[pos + k];
        sumSq += s * s;
      }
      rmsList.push(Math.sqrt(sumSq / frameLen));
    }

    // Trim leading/trailing silence (up to 0.75s on each end)
    let firstActive = 0;
    let lastActive = rmsList.length - 1;
    const globalSorted = [...rmsList].sort((a, b) => a - b);
    const p80 = globalSorted[Math.floor(globalSorted.length * 0.8)] ?? 0;
    if (p80 > 0.012) {
      while (firstActive < rmsList.length && rmsList[firstActive] < p80 * 0.15) firstActive++;
      while (lastActive > firstActive && rmsList[lastActive] < p80 * 0.15) lastActive--;
      const core = rmsList.slice(firstActive, lastActive + 1);
      if (core.length >= 100) {
        const sustainedCount = core.filter((v) => v >= p80 * 0.34).length;
        const quietPauseCount = core.filter((v) => v < p80 * 0.14).length;
        const sustainedRatio = sustainedCount / core.length;
        const pauseRatio = quietPauseCount / core.length;

        if (sustainedRatio >= 0.93 && pauseRatio <= 0.025) {
          // Confirm harmonic tonality (music) vs continuous fan/static noise
          let tonalFrames = 0;
          let checkedFrames = 0;
          const stepFrames = Math.max(1, Math.floor(core.length / 24));
          for (let fi = firstActive; fi <= lastActive; fi += stepFrames) {
            const base = fi * frameLen;
            if (base + frameLen > mono16k.length) break;
            let e0 = 0;
            for (let k = 0; k < 512; k++) {
              const s = mono16k[base + k];
              e0 += s * s;
            }
            if (e0 < 1e-5) continue;
            checkedFrames++;
            let bestCorr = 0;
            // Pitch lags 40..220 samples @ 16kHz (~72Hz..400Hz musical fundamentals)
            for (let lag = 40; lag <= 220; lag += 2) {
              let c = 0;
              for (let k = 0; k < 512 - lag; k++) {
                c += mono16k[base + k] * mono16k[base + k + lag];
              }
              const norm = c / e0;
              if (norm > bestCorr) bestCorr = norm;
            }
            if (bestCorr >= 0.42) tonalFrames++;
          }
          if (checkedFrames >= 8 && tonalFrames / checkedFrames >= 0.55) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

async function decodeTo16kHzMono(
  url: string,
): Promise<{ pcm: Float32Array; isMusic: boolean }> {
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
    const isMusic = detectMusicFromDecodedAudio(decoded, out);
    return { pcm: out, isMusic };
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
    const normalizedEmbedded = isMusicTranscriptText(embeddedTranscript)
      ? "(Music)"
      : embeddedTranscript.trim();
    saveCachedVoiceTranscript(messageId, normalizedEmbedded);
    return normalizedEmbedded;
  }
  const cached = getCachedVoiceTranscript(messageId);
  if (cached) {
    return isMusicTranscriptText(cached) ? "(Music)" : cached;
  }

  const existingJob = inFlightTranscripts.get(messageId);
  if (existingJob) return existingJob;

  const jobPromise = (async () => {
    try {
      emitVoiceTranscriptEvent({ messageId, status: "progress", percent: 2 });
      onProgress?.(2);

      const { pcm: pcm16k, isMusic } = await decodeTo16kHzMono(audioUrl);
      if (isMusic) {
        // Music detected pre-Whisper -> cancel transcription immediately and output "(Music)" only!
        saveCachedVoiceTranscript(messageId, "(Music)");
        return "(Music)";
      }

      let text: string;
      try {
        text = await runWorkerTranscription(messageId, pcm16k, onProgress);
      } catch {
        // Graceful fallback if Worker fails in restricted WebView
        const transcriber = await getFallbackWhisperPipeline();
        const probeLen = Math.min(pcm16k.length, 16_000 * 12);
        const probeOut = await transcriber(pcm16k.subarray(0, probeLen), {
          chunk_length_s: 30,
          stride_length_s: 5,
        });
        if (isMusicTranscriptText(probeOut.text)) {
          saveCachedVoiceTranscript(messageId, "(Music)");
          return "(Music)";
        }
        if (pcm16k.length <= probeLen) {
          text = (probeOut.text ?? "").trim() || "No clear speech detected in this voice note.";
        } else {
          const output = await transcriber(pcm16k, {
            chunk_length_s: 30,
            stride_length_s: 5,
          });
          text = isMusicTranscriptText(output.text)
            ? "(Music)"
            : (output.text ?? "").trim() || "No clear speech detected in this voice note.";
        }
      }

      const finalText = isMusicTranscriptText(text)
        ? "(Music)"
        : text.trim() || "No clear speech detected in this voice note.";
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
