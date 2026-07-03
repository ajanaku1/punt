import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGradeHistory, extractGrade, GRADE_SCHEMA } from "@punt/juror/grade.js";

const bet = {
  match: { home: "France", away: "Brazil", kickoff: "2026-07-05T19:00:00Z" },
  market: "result",
  selection: "France win",
  resolution: "France beat Brazil at full time per the official result",
};
const evidence = { status: "FINISHED", fullTime: { home: 2, away: 1 }, winner: "HOME_TEAM" };

test("grade prompt contains the resolution and the official evidence", () => {
  const h = buildGradeHistory(bet, evidence);
  const all = h.map((m) => m.content).join("\n");
  assert.match(all, /France beat Brazil at full time/);
  assert.match(all, /"home":\s*2/);
  assert.match(all, /creatorWins/);
});

test("extractGrade pulls a boolean verdict and reasoning", () => {
  const raw = JSON.stringify({ creatorWins: true, reasoning: "Full time 2-1 to France; the resolution condition held." });
  const g = extractGrade(raw);
  assert.equal(g.ok, true);
  assert.equal(g.creatorWins, true);
  assert.match(g.reasoning, /2-1/);
});

test("extractGrade rejects junk and non-boolean verdicts", () => {
  assert.equal(extractGrade("the match was great").ok, false);
  assert.equal(extractGrade(JSON.stringify({ creatorWins: "maybe", reasoning: "?" })).ok, false);
});

test("grade schema forces the two keys", () => {
  assert.deepEqual(GRADE_SCHEMA.required.sort(), ["creatorWins", "reasoning"]);
});
