/// <reference lib="webworker" />

type AsrCallable = (
  audio: Float32Array,
  options?: {
    chunk_length_s?: number;
    stride_length_s?: number;
  },
) => Promise<{ text?: string }>;

interface TranscribeRequestMessage {
  type: "transcribe";
  id: string;
  pcm: Float32Array;
}

interface TranscribeProgressMessage {
  type: "progress";
  id: string;
  percent: number;
  partialText?: string;
}

interface TranscribeDoneMessage {
  type: "done";
  id: string;
  text: string;
}

interface TranscribeErrorMessage {
  type: "error";
  id: string;
  message: string;
}

export type WorkerIncomingMessage = TranscribeRequestMessage;
export type WorkerOutgoingMessage =
  | TranscribeProgressMessage
  | TranscribeDoneMessage
  | TranscribeErrorMessage;

const SAMPLE_RATE = 16_000;
const SEGMENT_SECONDS = 28;
const SEGMENT_SAMPLES = SEGMENT_SECONDS * SAMPLE_RATE;

let cachedPipelinePromise: Promise<AsrCallable> | null = null;

async function getWorkerWhisperPipeline(): Promise<AsrCallable> {
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
            backends?: { onnx?: { wasm?: { numThreads?: number } } };
          };
        }) => {
          if (mod.env) {
            mod.env.allowLocalModels = false;
            if (mod.env.backends?.onnx?.wasm) {
              // Single thread inside dedicated Worker guarantees compatibility without COOP/COEP headers
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

// Serialize jobs inside the worker so multiple transcriptions don't thrash WASM memory
let queueChain: Promise<void> = Promise.resolve();

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<WorkerIncomingMessage>) => {
  const data = event.data;
  if (!data || data.type !== "transcribe") return;

  queueChain = queueChain.then(async () => {
    const { id, pcm } = data;
    try {
      workerScope.postMessage({
        type: "progress",
        id,
        percent: 5,
      } satisfies WorkerOutgoingMessage);

      const transcriber = await getWorkerWhisperPipeline();

      const totalSamples = pcm.length;
      if (totalSamples === 0) {
        workerScope.postMessage({
          type: "done",
          id,
          text: "No clear speech detected in this voice note.",
        } satisfies WorkerOutgoingMessage);
        return;
      }

      // Split long voice notes into manageable 28s segments so progress updates smoothly
      // and WASM memory stays bounded even on 6+ minute recordings.
      const totalSegments = Math.max(1, Math.ceil(totalSamples / SEGMENT_SAMPLES));
      const parts: string[] = [];

      for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
        const start = segIdx * SEGMENT_SAMPLES;
        const end = Math.min(totalSamples, start + SEGMENT_SAMPLES);
        const slice = pcm.subarray(start, end);

        const pctBefore = Math.min(
          95,
          Math.max(10, Math.round(10 + (segIdx / totalSegments) * 85)),
        );
        workerScope.postMessage({
          type: "progress",
          id,
          percent: pctBefore,
          partialText: parts.length > 0 ? parts.join(" ").trim() : undefined,
        } satisfies WorkerOutgoingMessage);

        const out = await transcriber(slice, {
          chunk_length_s: 30,
          stride_length_s: 5,
        });
        const segText = (out?.text ?? "").trim();
        if (segText) {
          parts.push(segText);
        }
      }

      const combined = parts.join(" ").replace(/\s+/g, " ").trim();
      workerScope.postMessage({
        type: "done",
        id,
        text: combined || "No clear speech detected in this voice note.",
      } satisfies WorkerOutgoingMessage);
    } catch (err) {
      workerScope.postMessage({
        type: "error",
        id,
        message:
          err instanceof Error && err.message
            ? err.message
            : "Couldn't transcribe this voice note right now.",
      } satisfies WorkerOutgoingMessage);
    }
  });
};
