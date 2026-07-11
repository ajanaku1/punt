/**
 * jury:demo — one-command proof that the settlement jury is real on-device AI.
 *
 *   npm run jury:demo
 *
 * Loads the actual judge model (Qwen3-4B GGUF, self-fetched on first run) and
 * grades a handful of tricky fixtures at temperature 0 — no cloud, no mocks.
 * These are exactly the scorelines that flip a smaller model: an away-team loss
 * printed "2-1", a draw, and over/under totals. Exits non-zero if any verdict
 * is wrong, so it doubles as a regression gate for the grading prompt.
 */
import { startLocalLlm, MODELS } from "@punt/shared/llm.js";
import { buildGradeHistory, extractGrade, GRADE_SCHEMA, digestEvidence } from "@punt/juror/grade.js";

const fx = (label, home, away, resolution, ftHome, ftAway, winner, expected) => ({
  label,
  bet: { match: { home, away }, resolution },
  evidence: { fullTime: { home: ftHome, away: ftAway }, winner },
  expected,
});

const FIXTURES = [
  fx("clear home win", "France", "Brazil", "France beat Brazil at full time", 2, 1, "HOME_TEAM", true),
  // the classic flip: bet on the AWAY side, final printed as "2-1" for the HOME side
  fx("away side lost (2-1 flip trap)", "France", "Brazil", "Brazil beat France at full time", 2, 1, "HOME_TEAM", false),
  fx("draw is not a win", "Spain", "Japan", "Spain beat Japan at full time", 1, 1, "DRAW", false),
  fx("over 2.5 goals", "Germany", "Mexico", "More than 2.5 total goals are scored", 2, 1, "HOME_TEAM", true),
  fx("under 2.5 goals (fails)", "Italy", "Wales", "Fewer than 2.5 total goals are scored", 2, 1, "HOME_TEAM", false),
];

const llm = await startLocalLlm({
  model: MODELS.judge,
  onProgress: (p) => process.stdout.write(`\rloading judge model… ${Math.round(p)}%   `),
});
process.stdout.write("\n\n");

let pass = 0;
for (const f of FIXTURES) {
  const raw = await llm.run(buildGradeHistory(f.bet, f.evidence), GRADE_SCHEMA);
  const g = extractGrade(raw);
  const ok = g.ok && g.creatorWins === f.expected;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${f.label}`);
  console.log(`   ${digestEvidence(f.bet, f.evidence)}`);
  console.log(`   bet wins if: ${f.bet.resolution}`);
  console.log(`   verdict: creatorWins=${g.ok ? g.creatorWins : `ERROR(${g.error})`}  (expected ${f.expected})`);
  if (g.ok) console.log(`   reasoning: ${g.reasoning}`);
  console.log();
}

console.log(`${pass}/${FIXTURES.length} verdicts correct — Qwen3-4B, on-device, temperature 0.`);
process.exit(pass === FIXTURES.length ? 0 : 1);
