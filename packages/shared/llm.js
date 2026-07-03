/**
 * Local QVAC LLM — the only AI in Punt runs on this machine (track rule: no cloud).
 * cpu / gpu_layers:0 / ctx_size:4096 is the proven-good config for this hardware.
 */
import { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

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
export async function startLocalLlm({ onProgress } = {}) {
  const modelId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
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
