/**
 * Grading a bet against the official match data — the deterministic half.
 * The juror's local LLM answers one question at temperature 0: given the
 * final data, did the creator's resolution condition hold?
 */

export const GRADE_SCHEMA = {
  type: "object",
  properties: {
    creatorWins: { type: "boolean" },
    reasoning: { type: "string" },
  },
  required: ["creatorWins", "reasoning"],
  additionalProperties: false,
};

export function buildGradeHistory(bet, evidence) {
  return [
    {
      role: "system",
      content: [
        "You are one juror settling a football bet between two friends.",
        "You are given the bet's resolution condition and the official final match data.",
        'Reply with ONLY a JSON object: {"creatorWins": true|false, "reasoning": "<one or two sentences citing the data>"}.',
        "creatorWins is true exactly when the resolution condition held. Judge ONLY from the data given — never guess.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Match: ${bet.match.home} vs ${bet.match.away}, kickoff ${bet.match.kickoff}.`,
        `Market: ${bet.market}. Selection: ${bet.selection}.`,
        `Resolution condition (creator wins if true): ${bet.resolution}`,
        `Official final data: ${JSON.stringify(evidence)}`,
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
