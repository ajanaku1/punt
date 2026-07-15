# ADR-006: Temperature 0 Deterministic Grading

## Context

The jury's grading prompt asks a Qwen3 4B model: given the final match data and the bet's resolution condition, did the creator win? The model's output determines who gets paid. Non-deterministic inference would mean the same evidence could produce different verdicts on different runs - unacceptable for settlement.

## Decision

Run all jury grading at **temperature 0** (`temp: 0` in the QVAC completion params). The prompt is a structured system message + user message with the match data and resolution condition. The model must output JSON with `reasoning` (a step-by-step comparison of the condition against the evidence) followed by `creatorWins` (boolean).

The JSON schema is enforced via `responseFormat: { type: "json_schema" }` - the model is grammar-constrained to produce only valid `{ reasoning: string, creatorWins: boolean }` objects. Property order in the schema ensures the model writes reasoning before committing to the boolean (a 1B model that answers first and reasons after flips verdicts).

The `extractGrade()` function is a deterministic parser: it finds the first JSON object in the output, parses it, and validates the required fields. If extraction fails (no JSON, invalid JSON, missing fields), the juror abstains - no verdict is signed.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Temperature > 0** | Would produce non-deterministic grades. Two jurors with identical evidence could reach different conclusions - making the 2-of-3 threshold meaningless because the "honest" answer isn't well-defined. |
| **No JSON schema constraint** | The 4B model occasionally wraps JSON in markdown fences, adds commentary, or uses the wrong boolean. Schema-constrained generation (`responseFormat: json_schema`) eliminates these failure modes. |
| **Cloud LLM with higher accuracy** | Violates the QVAC on-device requirement. A cloud model would be more accurate but would make the app dependent on an API key and internet connectivity. |
| **Pure rule-based grading** | Would require encoding every possible bet condition as a regex or decision tree - impossible for free-form resolution criteria like "Mbappé scores 2+ goals." The LLM is necessary for natural language understanding. |
| **Confidence threshold** | Some LLM-based systems require the model to output a confidence score and abstain below a threshold. Punt skips this because temperature 0 already gives deterministic output - confidence is implicit in the boolean decision. |

## Consequences

- **Positive:** Deterministic grading means all honest jurors reach the same conclusion. 2-of-3 is a genuine consensus threshold, not a lottery.
- **Positive:** The `extractGrade` fallback (abstain on parse failure) means a garbled model output never produces a false verdict - it produces no verdict at all.
- **Negative:** Temperature 0 can still produce errors (hallucinated facts, misread scorelines). The Qwen3 4B model is accurate for simple result/over-under conditions but can struggle with complex scorer conditions. This is a known limitation of on-device AI.
- **Negative:** A juror that consistently abstains (e.g., due to a corrupted model file) reduces the effective jury size. The remaining two jurors can still settle if both are honest.

## References

- `packages/shared/llm.js:startLocalLlm()` - temperature 0 and grammar constraints
- `packages/juror/grade.js:buildGradeHistory()` - grading prompt construction
- `packages/juror/grade.js:extractGrade()` - deterministic extraction
- `packages/juror/grade.js:GRADE_SCHEMA` - JSON schema with property ordering
