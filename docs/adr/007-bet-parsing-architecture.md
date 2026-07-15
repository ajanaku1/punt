# ADR-007: Plain-English Bet Parsing Architecture

## Context

Users type or speak bets in natural language: "Arsenal to beat Spurs Saturday, 5 on it." This must become structured data (match, market, stake, resolution criteria) before it can enter the feed and the escrow. The parsing must run on-device (QVAC track requirement) and must flag ambiguity so the user confirms the draft before it's committed.

## Decision

Use a **local Llama 3.2 1B model** at temperature 0 for bet parsing, with a deterministic extraction and validation layer. The pipeline:

1. `buildParseHistory(text, now)` builds a chat history with a system prompt that includes today's date, the schema, and an example.
2. The LLM streams its response token-by-token - the composer renders the draft live as the model writes it.
3. `extractBetDraft(raw)` extracts the first JSON object, parses it, coerces types, and validates required fields and market enum.
4. The `flags` array captures everything the model had to guess (e.g., "kickoff time guessed as 15:00 UTC") - these are shown to the user as warnings.
5. The user confirms the draft before it's posted to the feed.

The composer also supports **on-device Whisper** (base.en, ~80MB) for speech-to-text - the transcribed text enters the same parse pipeline.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Template-based parsing** (regex, keyword matching) | Cannot handle the full range of natural language: "tenner on Mbappé bagging a brace vs Brazil" uses slang for both the stake and the condition. Template matching would need thousands of patterns and still miss edge cases. |
| **Larger model for parsing** (Qwen3 4B) | 4B is overkill for extraction - it loads slower (~10s vs ~2s for 1B) and the user is waiting in the composer. The 1B model is fast enough for streaming UX. |
| **Cloud LLM API** | Violates QVAC track rules. Also adds latency and API key dependency. |
| **Parse at post time, not at compose time** | Would mean the user doesn't see the structured draft before committing. The flags array exists specifically so the user can catch model guesses before money is at stake. |
| **No streaming - batch only** | The composer would feel slow. Streaming the model's output token-by-token shows the user the AI is working and lets them abort mid-parse if the direction is wrong. |

## Consequences

- **Positive:** Natural language input with ambiguity flags means the user stays in control - the AI proposes, the user confirms.
- **Positive:** The 1B model loads in ~2 seconds and runs on CPU - no GPU required for parsing.
- **Positive:** The `extractBetDraft` function is pure and testable without the model (see `tests/parse.test.js`).
- **Negative:** The 1B model occasionally produces invalid JSON or misidentifies team names. The `flags` array and user confirmation step are the safety net.
- **Negative:** Whisper base.en is English-only and ~80MB. A multilingual version would need a larger model. Out of scope for the prototype.

## References

- `packages/shared/parse.js:buildParseHistory()` - prompt construction
- `packages/shared/parse.js:extractBetDraft()` - deterministic extraction
- `packages/shared/llm.js:startLocalLlm()` - model loading and streaming
- `packages/shared/llm.js:startWhisper()` - speech-to-text
- `packages/app/renderer/app.js:apiParse()` - SSE streaming in the UI
