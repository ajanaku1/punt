import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeed } from "@punt/feed/feed.js";

const validBet = (text) => ({
  type: "bet",
  creator: "b".repeat(64),
  text,
  match: { home: "France", away: "Brazil", kickoff: "2026-07-05T19:00:00Z" },
  market: "result",
  selection: "France win",
  stake: 5,
  resolution: "France beat Brazil at full time per official result",
  createdAt: 1751500000000,
});

async function eventually(fn, ms = 8000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > deadline) throw new Error("timed out waiting for convergence");
    await new Promise((r) => setTimeout(r, 100));
  }
}

test("optimistic bet from non-writer converges on both peers; junk never lands", async (t) => {
  const dirA = await mkdtemp(join(tmpdir(), "punt-a-"));
  const dirB = await mkdtemp(join(tmpdir(), "punt-b-"));
  t.after(() => Promise.all([rm(dirA, { recursive: true, force: true }), rm(dirB, { recursive: true, force: true })]));

  const a = await createFeed({ storage: dirA }); // bootstrap indexer
  const b = await createFeed({ storage: dirB, key: a.key }); // non-writer peer

  // Autobase-level replication (NOT store-level) — spike gotcha 1
  const s1 = a.replicate(true);
  const s2 = b.replicate(false);
  s1.pipe(s2).pipe(s1);

  await b.postBet(validBet("France win, 5 USDT"));
  await eventually(async () => (await a.listBets()).length === 1);
  await eventually(async () => (await b.listBets()).length === 1);
  assert.equal((await a.listBets())[0].text, "France win, 5 USDT");

  // junk: schema-invalid append (raw, as a hostile peer would) is never acked into the view
  await b.base.append({ type: "spam", lol: true }, { optimistic: true });
  await b.postBet(validBet("Second valid bet"));
  await eventually(async () => (await a.listBets()).length === 2);
  const texts = (await a.listBets()).map((x) => x.text);
  assert.deepEqual(texts.sort(), ["France win, 5 USDT", "Second valid bet"].sort());

  await a.close();
  await b.close();
});

test("verdict messages replicate; malformed verdicts never land", async (t) => {
  const dirA = await mkdtemp(join(tmpdir(), "punt-va-"));
  const dirB = await mkdtemp(join(tmpdir(), "punt-vb-"));
  t.after(() => Promise.all([rm(dirA, { recursive: true, force: true }), rm(dirB, { recursive: true, force: true })]));

  const a = await createFeed({ storage: dirA });
  const b = await createFeed({ storage: dirB, key: a.key });
  const s1 = a.replicate(true);
  const s2 = b.replicate(false);
  s1.pipe(s2).pipe(s1);

  const verdict = {
    type: "verdict",
    betId: "c".repeat(64),
    winner: "0x" + "3".repeat(40),
    juror: "0x" + "4".repeat(40),
    sig: "0x" + "ab".repeat(65),
    reasoning: "France won 2-1 at full time, so the creator's call is correct.",
  };
  await b.postVerdict(verdict);
  await b.base.append({ type: "verdict", betId: "nope" }, { optimistic: true }); // junk

  await eventually(async () => (await a.listVerdicts(verdict.betId)).length === 1);
  const got = (await a.listVerdicts(verdict.betId))[0];
  assert.equal(got.winner, verdict.winner);
  assert.equal((await a.listVerdicts("d".repeat(64))).length, 0);
  assert.equal((await a.listBets()).length, 0); // verdicts don't pollute the bet list

  await a.close();
  await b.close();
});
