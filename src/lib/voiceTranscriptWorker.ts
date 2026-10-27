// Dedicated Web Worker for background voice-note speech-to-text transcription.
// Runs ONNX Whisper WASM completely off the UI thread so scrolling, animations,
// and typing stay silky-smooth 60 FPS even on 5+ minute voice notes.
// Automatically detects music, cancels remaining transcription immediately,
// and returns "(Music)" only.

type AsrCallable = (
  audio: Float32Array,
  options?: { chunk_length_s?: number; stride_length_s?: number },
) => Promise<{ text?: string }>;

interface WorkerRequest {
  type: "transcribe";
  id: string;
  pcm: Float32Array;
}

let cachedPipelinePromise: Promise<AsrCallable> | null = null;

async function getWhisperPipeline(): Promise<AsrCallable> {
  if (!cachedPipelinePromise) {
    const cdnUrl = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm";
    cachedPipelinePromise = import(/* @vite-ignore */ cdnUrl)
      .then(
        async (mod: {
          pipeline: (
            task: string,
            model: string,
            opts?: Record<string, unknown>,
          ) => Promise<AsrCallable>;
          env?: {
            allowLocalModels?: boolean;
            backends?: {
              onnx?: {
                wasm?: { numThreads?: number };
              };
            };
          };
        }) => {
          if (mod.env) {
            mod.env.allowLocalModels = false;
            if (mod.env.backends?.onnx?.wasm) {
              mod.env.backends.onnx.wasm.numThreads = 1;
            }
          }
          return mod.pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
            dtype: "q8",
          });
        },
      )
      .catch((err: unknown) => {
        cachedPipelinePromise = null;
        throw err;
      });
  }
  return cachedPipelinePromise;
}

const SAMPLE_RATE = 16_000;
const FIRST_PROBE_SECONDS = 12;
const SEGMENT_SECONDS = 25;
const OVERLAP_SECONDS = 2;

const MUSIC_TAG_PATTERN =
  /[[(✶*]\s*(?:music|singing|song|instrumental|melody|guitar|piano|drums|beat|beats|hip[- ]?hop|rap music|pop music|rock music|electronic music|upbeat music|sad music|dramatic music|background music|playing music|music playing|musical|chorus|vocalizing|humming)[^)\]*]*[\])✶*]/iu;
const MUSIC_NOTE_PATTERN = /[♪♫♬♩🎵🎶]/u;

function isMusicSegmentText(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (MUSIC_NOTE_PATTERN.test(trimmed)) return true;
  if (MUSIC_TAG_PATTERN.test(trimmed)) return true;
  if (/^\(?\s*music\s*\)?\.?$/i.test(trimmed)) return true;
  return false;
}

function stitchSegments(parts: string[]): string {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];

  let acc = cleaned[0];
  for (let i = 1; i < cleaned.length; i++) {
    const next = cleaned[i];
    const accWords = acc.split(/\s+/);
    const nextWords = next.split(/\s+/);
    let overlapCount = 0;
    const maxCheck = Math.min(8, accWords.length, nextWords.length);
    for (let k = maxCheck; k >= 2; k--) {
      const tail = accWords
        .slice(-k)
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "");
      const head = nextWords
        .slice(0, k)
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "");
      if (tail && tail === head) {
        overlapCount = k;
        break;
      }
    }
    const remainder = overlapCount > 0 ? nextWords.slice(overlapCount).join(" ") : next;
    if (remainder) {
      acc = `${acc} ${remainder}`;
    }
  }
  return acc.replace(/\s+/g, " ").trim();
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (!data || data.type !== "transcribe") return;

  const { id, pcm } = data;
  try {
    self.postMessage({ type: "progress", id, percent: 5 });
    const transcriber = await getWhisperPipeline();
    self.postMessage({ type: "progress", id, percent: 15 });

    const totalSamples = pcm.length;
    const firstWindowSamples = FIRST_PROBE_SECONDS * SAMPLE_RATE;
    const windowSamples = SEGMENT_SECONDS * SAMPLE_RATE;
    const stepSamples = (SEGMENT_SECONDS - OVERLAP_SECONDS) * SAMPLE_RATE;

    if (totalSamples <= firstWindowSamples) {
      const out = await transcriber(pcm, { chunk_length_s: 30, stride_length_s: 5 });
      const rawText = (out?.text ?? "").trim();
      if (isMusicSegmentText(rawText)) {
        self.postMessage({ type: "done", id, text: "(Music)" });
        return;
      }
      const text = rawText || "No clear speech detected in this voice note.";
      self.postMessage({ type: "done", id, text });
      return;
    }

    // Build windows: fast 12s initial probe window so music cancels twice as fast,
    // followed by 25s windows with 2s overlap for seamless long-form speech stitching.
    const slices: Array<[number, number]> = [[0, Math.min(totalSamples, firstWindowSamples)]];
    const overlapSamples = OVERLAP_SECONDS * SAMPLE_RATE;
    for (
      let start = firstWindowSamples - overlapSamples;
      start < totalSamples;
      start += stepSamples
    ) {
      const end = Math.min(totalSamples, start + windowSamples);
      slices.push([start, end]);
      if (end >= totalSamples) break;
    }

    const collected: string[] = [];
    for (let i = 0; i < slices.length; i++) {
      const [start, end] = slices[i];
      const slice = pcm.subarray(start, end);
      const out = await transcriber(slice, { chunk_length_s: 30, stride_length_s: 5 });
      const segText = (out?.text ?? "").trim();

      // Immediately cancel remaining transcription if music is detected!
      if (isMusicSegmentText(segText)) {
        self.postMessage({
          type: "done",
          id,
          text: "(Music)",
        });
        return;
      }

      if (segText && !/^\[blank_audio\]$/i.test(segText)) {
        collected.push(segText);
      }
      const percent = Math.min(98, Math.round(15 + ((i + 1) / slices.length) * 83));
      self.postMessage({
        type: "progress",
        id,
        percent,
        partialText: stitchSegments(collected),
      });
    }

    const finalText = stitchSegments(collected) || "No clear speech detected in this voice note.";
    self.postMessage({
      type: "done",
      id,
      text: isMusicSegmentText(finalText) ? "(Music)" : finalText,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Couldn't transcribe this voice note right now.";
    self.postMessage({ type: "error", id, message });
  }
};
