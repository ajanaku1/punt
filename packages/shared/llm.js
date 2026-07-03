/**
 * Local QVAC LLM — the only AI in Punt runs on this machine (track rule: no cloud).
 * cpu / gpu_layers:0 / ctx_size:4096 is the proven-good config for this hardware.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { createWriteStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

// Served from the Ollama registry — the HF CDN is unreachable from some networks.
// Blob digest doubles as an integrity check.
const JUDGE_GGUF = join(homedir(), ".qvac", "models", "qwen3-4b.gguf");
const JUDGE_URL =
  "https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:3e4cb14174460404e7a233e531675303b2fbf7749c02f91864fe311ab6344e4f";

export const MODELS = {
  // fast parse in the composer — latency matters, the user confirms the draft anyway
  parse: LLAMA_3_2_1B_INST_Q4_0,
  // juror grading — accuracy is the product; a 1B flips verdicts on 2-1 scorelines.
  // Loaded from a plain GGUF path (the SDK registry mislabels its Qwen 4B entry).
  judge: JUDGE_GGUF,
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

/** Load the local model once; returns { run } where run(history, schema?) → completion text. */
export async function startLocalLlm({ onProgress, model = MODELS.parse } = {}) {
  if (model === MODELS.judge) await ensureJudgeModel(onProgress);
  const modelId = await loadModel({
    modelSrc: model,
    ...(model === MODELS.judge ? { modelType: "llamacpp-completion" } : {}),

    modelConfig: { ctx_size: 4096, device: "cpu", gpu_layers: 0 },
    onProgress: (p) => onProgress?.(p.percentage),
  });

  async function run(history, schema, { maxTokens = 300 } = {}) {
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
    let text = "";
    for await (const event of runHandle.events) {
      if (event.type === "contentDelta") text += event.text;
    }
    await runHandle.final;
    return text;
  }

  return { modelId, run, betDraftSchema: BET_DRAFT_SCHEMA };
}
