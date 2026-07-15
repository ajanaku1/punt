/**
 * EmbeddingGemma RAG for jury few-shot context.
 *
 * When grading a new bet, the juror retrieves 2–3 semantically similar past
 * verdicts from its local Hyperbee, embeds them with on-device EmbeddingGemma,
 * and injects them as few-shot examples into the grading prompt. This improves
 * accuracy on edge cases (e.g., ambiguous resolution criteria) without
 * requiring a larger model.
 *
 * Integration point: called from grade.js buildGradeHistory() before the base
 * system+user prompt is assembled. The retrieved examples are prepended to the
 * history as demonstration (assistant role) turns.
 */
import { loadModel, unloadModel } from "@qvac/sdk";

/** QVAC SDK constant for the EmbeddingGemma model. */
const EMBEDDING_GEMMA_MODEL = "embedding-gemma"; // QVAC SDK constant - adjust if named differently

/**
 * Load the embedding model. Returns { modelId, embed, close }.
 * Call once per juror session; reuse across grading calls.
 */
export async function startRag({ onProgress } = {}) {
  const modelId = await loadModel({
    modelSrc: EMBEDDING_GEMMA_MODEL,
    onProgress: (p) => onProgress?.(p.percentage),
  });

  /**
   * Embed a batch of texts. Uses the QVAC SDK `embedding` function (native).
   * Returns an array of Float32Array embeddings.
   */
  async function embed(texts) {
    // This is the QVAC SDK embedding API - the exact function name depends on
    // the installed SDK version. The pattern matches completion() in llm.js.
    const { embedding } = await import("@qvac/sdk");
    const results = [];
    for (const text of texts) {
      const result = await embedding({ modelId, input: text });
      results.push(result.embedding);
    }
    return results;
  }

  return {
    modelId,
    embed,
    close: () => unloadModel({ modelId }).catch(() => {}),
  };
}

/**
 * Cosine similarity between two embeddings.
 * Both are expected to be Float32Array or arrays of numbers.
 */
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Retrieve the top-k most similar past verdicts from a Hyperbee of stored verdicts.
 *
 * @param {object} rag - the RAG handle from startRag()
 * @param {object} bet - the bet being graded (needs .resolution for the query)
 * @param {Array<{reasoning: string, creatorWins: boolean}>} pastVerdicts - past verdicts from the juror's Hyperbee
 * @param {number} k - how many to retrieve (default 2)
 * @returns {Promise<Array<{reasoning: string, creatorWins: boolean, similarity: number}>>}
 */
export async function retrieveSimilar(rag, bet, pastVerdicts, k = 2) {
  if (pastVerdicts.length === 0) return [];

  // Build texts: combine reasoning with the verdict outcome for context
  const texts = pastVerdicts.map((v) => `${v.reasoning} → creator ${v.creatorWins ? "won" : "lost"}.`);
  const queryText = `Resolution: ${bet.resolution}`;

  const allEmbeddings = await rag.embed([queryText, ...texts]);
  const queryEmbedding = allEmbeddings[0];
  const verdictEmbeddings = allEmbeddings.slice(1);

  const scored = pastVerdicts.map((v, i) => ({
    ...v,
    similarity: cosineSimilarity(queryEmbedding, verdictEmbeddings[i]),
  }));

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}

/**
 * Build few-shot messages from retrieved verdicts.
 * Returns an array of { role: "user"/"assistant", content } messages
 * that can be spliced into the grade prompt history before the real query.
 */
export function fewShotMessages(retrieved) {
  const messages = [];
  for (const v of retrieved) {
    messages.push(
      {
        role: "user",
        content: v._query ?? "(past bet - query omitted for brevity)",
      },
      {
        role: "assistant",
        content: JSON.stringify({
          reasoning: v.reasoning,
          creatorWins: v.creatorWins,
        }),
      },
    );
  }
  return messages;
}
