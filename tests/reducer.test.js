import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeed } from "@punt/feed/feed.js";

async function feed(name, t, key) {
  const dir = await mkdtemp(join(tmpdir(), `punt-red-${name}-`));
  const f = await createFeed({ storage: dir, key });
  t.after(async () => {
    await f.close();
    await rm(dir, { recursive: true, force: true });
  });
  return f;
}

const bet = (creator, text) => ({
  type: "bet",
  creator,
  text,
  match: { home: "Spain", away: "Japan", kickoff: "2026-06-10T18:00:00Z" },
  market: "result",
  selection: "Spain win",
  stake: 3,
  resolution: "Spain beat Japan at full time",
  createdAt: 1751600000000,
});

const verdict = (betId, juror, winner) => ({
  type: "verdict",
  betId,
  winner,
  juror,
  sig: "0x" + "ab".repeat(65),
  reasoning: "graded from the official result",
});

const BET_ID = "e".repeat(64);
const ADDR = (c) => "0x" + c.repeat(40);

// I2 — author binding
test("a bet whose creator is not the appending writer is rejected (anti-spoofing)", async (t) => {
  const f = await feed("spoof", t);
  const me = f.localKey.toString("hex");

  // schema-valid bet, but claims someone else's identity → dropped
  await f.postBet(bet("d".repeat(64), "impersonated bet"));
  assert.equal((await f.listBets()).length, 0, "spoofed-creator bet never lands");

  // correctly attributed to the writer → lands
  await f.postBet(bet(me, "honest bet"));
  const bets = await f.listBets();
  assert.equal(bets.length, 1);
  assert.equal(bets[0].text, "honest bet");
});

// I3 — one verdict per (betId, juror)
test("a juror re-signing overwrites its verdict and never double-counts", async (t) => {
  const f = await feed("dedup", t);
  const juror = ADDR("4");

  await f.postVerdict(verdict(BET_ID, juror, ADDR("a")));
  await f.postVerdict(verdict(BET_ID, juror, ADDR("b"))); // same juror flips

  const vs = await f.listVerdicts(BET_ID);
  assert.equal(vs.length, 1, "only one verdict retained for the juror");
  assert.equal(vs[0].winner, ADDR("b"), "latest verdict wins");

  const tally = await f.tally(BET_ID);
  assert.equal(tally.leaderCount, 1, "a single juror counts once");
});

// tally view reflects distinct jurors agreeing
test("tally counts distinct jurors agreeing on a winner", async (t) => {
  const f = await feed("tally", t);
  const winner = ADDR("a");

  await f.postVerdict(verdict(BET_ID, ADDR("1"), winner));
  await f.postVerdict(verdict(BET_ID, ADDR("2"), winner));

  const tally = await f.tally(BET_ID);
  assert.equal(tally.leader, winner);
  assert.equal(tally.leaderCount, 2);
  assert.equal((await f.listVerdicts(BET_ID)).length, 2);
});
