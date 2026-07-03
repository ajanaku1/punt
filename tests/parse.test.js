import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBetDraft, buildParseHistory } from "@punt/shared/parse.js";

const goodJson = JSON.stringify({
  home: "England", away: "Ghana", kickoff: "2026-07-05T17:00:00Z",
  market: "over_under", selection: "England concede 0 goals",
  stake: 10, resolution: "England concede zero goals vs Ghana per full-time score",
  flags: ["'tenner' read as 10 USDT"],
});

test("extracts a clean JSON object from raw model output", () => {
  const d = extractBetDraft(goodJson);
  assert.equal(d.ok, true);
  assert.equal(d.draft.stake, 10);
  assert.deepEqual(d.draft.flags, ["'tenner' read as 10 USDT"]);
});

test("extracts JSON wrapped in markdown fences and prose", () => {
  const d = extractBetDraft("Sure! Here is the bet:\n```json\n" + goodJson + "\n```\nLet me know.");
  assert.equal(d.ok, true);
  assert.equal(d.draft.market, "over_under");
});

test("rejects output with no JSON object", () => {
  assert.equal(extractBetDraft("I could not understand that bet.").ok, false);
});

test("rejects JSON missing required fields or bad market", () => {
  assert.equal(extractBetDraft(JSON.stringify({ home: "A" })).ok, false);
  const bad = JSON.parse(goodJson);
  bad.market = "first_corner";
  assert.equal(extractBetDraft(JSON.stringify(bad)).ok, false);
});

test("coerces a numeric-string stake", () => {
  const d1 = JSON.parse(goodJson);
  d1.stake = "10";
  assert.equal(extractBetDraft(JSON.stringify(d1)).draft.stake, 10);
});

test("parse history pins the current date and the schema", () => {
  const h = buildParseHistory("France win, 5 USDT", new Date("2026-07-03T12:00:00Z"));
  const sys = h.find((m) => m.role === "system").content;
  assert.match(sys, /2026-07-03/);
  assert.match(sys, /over_under/);
  assert.equal(h.at(-1).content, "France win, 5 USDT");
});
