/**
 * Local QVAC LLM - the only AI in Punt runs on this machine (track rule: no cloud).
 * cpu / gpu_layers:0 / ctx_size:4096 is the proven-good config for this hardware.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { createWriteStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  loadModel,
  unloadModel,
  completion,
  cancel,
  transcribe,
  LLAMA_3_2_1B_INST_Q4_0,
  QWEN3_4B_INST_Q4_K_M,
  WHISPER_EN_BASE_Q8_0,
} from "@qvac/sdk";

// Served from the Ollama registry - the HF CDN is unreachable from some networks.
// Blob digest doubles as an integrity check.
const JUDGE_GGUF = join(homedir(), ".qvac", "models", "qwen3-4b.gguf");
const JUDGE_URL =
  "https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:3e4cb14174460404e7a233e531675303b2fbf7749c02f91864fe311ab6344e4f";

export const MODELS = {
  // fast parse in the composer - latency matters, the user confirms the draft anyway
  parse: LLAMA_3_2_1B_INST_Q4_0,
  // juror grading - accuracy is the product; a 1B flips verdicts on 2-1 scorelines.
  // (The SDK's QWEN3_4B_Q4_K_M entry is mislabeled addon:"diffusion";
  //  QWEN3_4B_INST_Q4_K_M is the correct llamacpp one - see startLocalLlm.)
  judge: "judge",
};

/** Fetch the judge model once if missing (~2.4GB) so `npm run demo` works out of the box. */
async function ensureJudgeModel(onProgress) {
  if (existsSync(JUDGE_GGUF)) return;
  onProgress?.(0);
  const res = await fetch(JUDGE_URL);
  if (!res.ok) throw new Error(`judge model download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(JUDGE_GGUF + ".part"));
  const { rename } = await import("node:fs/promises");
  await rename(JUDGE_GGUF + ".part", JUDGE_GGUF);
}

const BET_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    home: { type: "string" },
    away: { type: "string" },
    kickoff: { type: "string" },
    market: { type: "string", enum: ["result", "over_under", "scorer"] },
    selection: { type: "string" },
    stake: { type: "number" },
    resolution: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
  required: ["home", "away", "kickoff", "market", "selection", "stake", "resolution", "flags"],
  additionalProperties: false,
};

const MODEL_CONFIG = { ctx_size: 4096, device: "cpu", gpu_layers: 0 };

/**
 * Resolve + load the judge. Priority: local GGUF if already fetched (no
 * re-download) → the SDK registry constant (idiomatic, sha256-checked by the
 * SDK) → the Ollama blob self-fetch for networks the registry can't reach.
 */
async function loadJudge(onProgress) {
  const opts = { modelConfig: MODEL_CONFIG, onProgress: (p) => onProgress?.(p.percentage) };
  if (!existsSync(JUDGE_GGUF)) {
    try {
      return await loadModel({ modelSrc: QWEN3_4B_INST_Q4_K_M, ...opts });
    } catch {
      await ensureJudgeModel(onProgress); // registry unreachable - pinned blob fallback
    }
  }
  return loadModel({ modelSrc: JUDGE_GGUF, modelType: "llamacpp-completion", ...opts });
}

/** Load the local model once; returns { run } where run(history, schema?) → completion text. */
export async function startLocalLlm({ onProgress, model = MODELS.parse } = {}) {
  const modelId =
    model === MODELS.judge
      ? await loadJudge(onProgress)
      : await loadModel({
          modelSrc: model,
          modelConfig: MODEL_CONFIG,
          onProgress: (p) => onProgress?.(p.percentage),
        });

  /**
   * One completion. `onDelta(textSoFar)` fires per streamed token so a UI can
   * render the model thinking live; `onStart(requestId)` hands out the SDK
   * request id so a stale run can be cancelled (see cancelRun).
   */
  async function run(history, schema, { maxTokens = 300, onDelta, onStart } = {}) {
    const req = {
      modelId,
      history,
      stream: true,
      // temperature 0: every juror must grade deterministically; n_predict caps
      // runaway generation (a 1B model under grammar can spin to ctx overflow)
      generationParams: { temp: 0, predict: maxTokens },
    };
    if (schema) req.responseFormat = { type: "json_schema", json_schema: { name: "punt", schema } };
    const runHandle = completion(req);
    onStart?.(runHandle.requestId);
    let text = "";
    for await (const event of runHandle.events) {
      if (event.type === "contentDelta") {
        text += event.text;
        onDelta?.(text);
      }
    }
    await runHandle.final;
    return text;
  }

  return {
    modelId,
    run,
    betDraftSchema: BET_DRAFT_SCHEMA,
    /** Release the model's memory - call on daemon shutdown. */
    close: () => unloadModel({ modelId }).catch(() => {}),
  };
}

/** Cancel an in-flight run by its requestId (latest-wins composer parses). */
export function cancelRun(requestId) {
  return cancel({ requestId }).catch(() => {}); // races with natural completion are fine
}

/**
 * On-device speech-to-text (Whisper base.en, ~80MB, fetched via the SDK
 * registry on first use). Speak the bet the way you'd say it in the group
 * chat; the text lands in the same parse pipeline as typing.
 */
export async function startWhisper({ onProgress } = {}) {
  const modelId = await loadModel({
    modelSrc: WHISPER_EN_BASE_Q8_0,
    onProgress: (p) => onProgress?.(p.percentage),
  });
  return {
    modelId,
    /** WAV/PCM buffer (or file path) → transcript text. */
    transcribe: (audio) => transcribe({ modelId, audioChunk: audio }),
    close: () => unloadModel({ modelId }).catch(() => {}),
  };
}

/**
 * On-device text-to-speech (Supertonic/Chatterbox, ~200MB). Reads the parsed
 * bet draft back to the user: "You're staking 10 USDT that Arsenal beats
 * Tottenham. Swipe to confirm." Loaded once per peer session.
 *
 * @returns {Promise<{ modelId: string, speak: (text: string) => Promise<Buffer>, close: () => Promise<void> }>}
 */
export async function startTts({ onProgress } = {}) {
  const { textToSpeech } = await import("@qvac/sdk");
  const modelId = await loadModel({
    modelSrc: "chatterbox-en-q8-0",
    modelType: "tts",
    onProgress: (p) => onProgress?.(p.percentage),
  });
  return {
    modelId,
    /** Plain text → WAV audio buffer. */
    speak: async (text) => {
      const result = await textToSpeech({ modelId, text });
      return result.audio;
    },
    close: () => unloadModel({ modelId }).catch(() => {}),
  };
}

/**
 * On-device voice activity detection (Silero VAD, ~2MB). Detects when the
 * user stops speaking in push-to-talk mode so the composer auto-transcribes
 * without a manual stop button.
 *
 * @returns {Promise<{ modelId: string, detect: (audioChunk: Buffer) => Promise<{ speech: boolean }>, close: () => Promise<void> }>}
 */
export async function startVad({ onProgress } = {}) {
  const { createVad } = await import("@qvac/sdk");
  const modelId = await loadModel({
    modelSrc: "silero-vad",
    modelType: "vad",
    onProgress: (p) => onProgress?.(p.percentage),
  });
  const detector = await createVad({ modelId });
  return {
    modelId,
    /** Raw audio chunk → { speech: boolean }. Returns true while user is speaking. */
    detect: (audioChunk) => detector.detect(audioChunk),
    close: () => unloadModel({ modelId }).catch(() => {}),
  };
}
