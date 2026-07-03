/**
 * Plain English → bet draft, via the local QVAC LLM.
 * The model returns JSON; everything deterministic (prompt build, extraction,
 * coercion, validation) lives here so it can be tested without the model.
 */
import { MARKETS, MAX_STAKE } from "./bet.js";

const REQUIRED = ["home", "away", "kickoff", "market", "selection", "stake", "resolution"];

/** Chat history for the parse call — temperature 0, JSON only. */
export function buildParseHistory(text, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return [
    {
      role: "system",
      content: [
        `Today is ${today}. You turn a friend's spoken football bet into strict JSON.`,
        `Reply with ONLY one JSON object, no prose, with keys:`,
        `home, away (team names), kickoff (ISO 8601 UTC, infer the date from phrases like "on Sunday"),`,
        `market (one of: ${MARKETS.join(", ")}), selection (short phrase),`,
        `stake (number, USDT), resolution (one sentence a referee could verify from the final match data),`,
        `flags (array of strings — ONLY things you had to guess, e.g. slang amounts, missing dates; empty array if nothing was guessed).`,
        `The resolution sentence must state exactly the condition under which the bet WINS.`,
        `Example — input: "Arsenal to beat Spurs Saturday, 5 on it" → output:`,
        `{"home":"Arsenal","away":"Tottenham","kickoff":"${today}T15:00:00Z","market":"result",` +
          `"selection":"Arsenal win","stake":5,"resolution":"Arsenal beat Tottenham at full time per the official result",` +
          `"flags":["kickoff time guessed as 15:00 UTC"]}`,
        `If the text is not a resolvable football bet, reply {"error":"<why>"}.`,
      ].join(" "),
    },
    { role: "user", content: text },
  ];
}

/** Pull the bet draft out of raw model output. Returns { ok, draft } or { ok:false, error }. */
export function extractBetDraft(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: "no JSON in model output" };
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: "model output is not valid JSON" };
  }
  if (obj.error) return { ok: false, error: String(obj.error) };
  obj.stake = Number(obj.stake);
  for (const key of REQUIRED) {
    if (obj[key] === undefined || obj[key] === null || obj[key] === "") return { ok: false, error: `missing ${key}` };
  }
  if (!MARKETS.includes(obj.market)) return { ok: false, error: `unknown market ${obj.market}` };
  if (!Number.isFinite(obj.stake) || obj.stake <= 0 || obj.stake > MAX_STAKE) return { ok: false, error: "bad stake" };
  if (Number.isNaN(Date.parse(obj.kickoff))) return { ok: false, error: "bad kickoff date" };
  return { ok: true, draft: { ...obj, flags: Array.isArray(obj.flags) ? obj.flags : [] } };
}

/** Full round trip: text → LLM → draft. `llm.run(history)` returns the raw completion text. */
export async function parseBetText(llm, text, now = new Date()) {
  const raw = await llm.run(buildParseHistory(text, now));
  return extractBetDraft(raw);
}
