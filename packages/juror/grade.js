/**
 * Grading a bet against the official match data — the deterministic half.
 * The juror's local LLM answers one question at temperature 0: given the
 * final data, did the creator's resolution condition hold?
 */

// Property order matters: the grammar generates keys in schema order, so the
// model must write its reasoning BEFORE committing to the boolean — a 1B model
// that answers first and reasons after flips verdicts.
export const GRADE_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    creatorWins: { type: "boolean" },
  },
  required: ["creatorWins", "reasoning"],
  additionalProperties: false,
};

/** Render the API evidence as plain English — a 1B model misreads raw JSON enums. */
export function digestEvidence(bet, evidence) {
  const { home, away } = bet.match;
  const ft = evidence.fullTime;
  const outcome =
    evidence.winner === "HOME_TEAM" ? `${home} won.` :
    evidence.winner === "AWAY_TEAM" ? `${away} won.` :
    "The match ended in a draw.";
  return `Final score at full time: ${home} ${ft.home}, ${away} ${ft.away}. ${outcome} Total goals: ${ft.home + ft.away}.`;
}

export function buildGradeHistory(bet, evidence) {
  return [
    {
      role: "system",
      content: [
        "You are one juror settling a football bet between two friends.",
        "You are given the bet's resolution condition and the official final result.",
        'Reply with ONLY a JSON object: {"reasoning": "<restate the final score, then say whether the condition held>", "creatorWins": true|false}.',
        "Write the reasoning first: restate the official score, then compare it against the condition step by step.",
        "creatorWins is true exactly when the resolution condition held. Judge ONLY from the result given — never guess.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Match: ${bet.match.home} vs ${bet.match.away}.`,
        `Resolution condition (creator wins if true): ${bet.resolution}`,
        `Official result: ${digestEvidence(bet, evidence)}`,
        `Did the resolution condition hold?`,
      ].join("\n"),
    },
  ];
}

export function extractGrade(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: "no JSON in model output" };
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (typeof obj.creatorWins !== "boolean" || typeof obj.reasoning !== "string") {
    return { ok: false, error: "missing creatorWins/reasoning" };
  }
  return { ok: true, creatorWins: obj.creatorWins, reasoning: obj.reasoning };
}
