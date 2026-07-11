import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeed } from "@punt/feed/feed.js";
import { betHash } from "@punt/shared/bet.js";

// Multi-peer convergence over in-memory Autobase replication (no DHT — the
// transport is P1; this pins the guarantee the Pears track cares about: every
// peer computes the identical view by replay, junk is excluded, and a
// partitioned writer reconverges once it reconnects).

async function feed(name, t, key) {
  const dir = await mkdtemp(join(tmpdir(), `punt-conv-${name}-`));
  const f = await createFeed({ storage: dir, key });
  t.after(async () => {
    await f.close();
    await rm(dir, { recursive: true, force: true });
  });
  return f;
}

function connect(x, y) {
  const sx = x.replicate(true);
  const sy = y.replicate(false);
  sx.pipe(sy).pipe(sx); // Autobase-level duplex — one stream pair per edge
}

const bet = (f, text) => ({
  type: "bet",
  creator: f.localKey.toString("hex"), // I2: author = the appending writer
  text,
  match: { home: "Argentina", away: "Croatia", kickoff: "2026-06-20T18:00:00Z" },
  market: "result",
  selection: "Argentina win",
  stake: 4,
  resolution: "Argentina beat Croatia at full time",
  createdAt: 1751700000000 + text.length,
});

const ids = async (f) => (await f.listBets()).map(betHash).sort();

async function eventually(fn, ms = 15000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > deadline) throw new Error("timed out waiting for convergence");
    await new Promise((r) => setTimeout(r, 100));
  }
}

test("three writers converge to an identical view; junk never lands", async (t) => {
  const a = await feed("a", t);
  const b = await feed("b", t, a.key);
  const c = await feed("c", t, a.key);
  connect(a, b);
  connect(a, c);
  connect(b, c);

  await a.postBet(bet(a, "from a"));
  await b.postBet(bet(b, "from b"));
  await c.postBet(bet(c, "from c"));
  await c.base.append({ type: "spam", junk: true }, { optimistic: true }); // hostile non-schema append

  await eventually(async () => (await a.listBets()).length === 3);
  await eventually(async () => (await b.listBets()).length === 3);
  await eventually(async () => (await c.listBets()).length === 3);

  const ia = await ids(a);
  assert.deepEqual(ia, await ids(b), "b matches a");
  assert.deepEqual(ia, await ids(c), "c matches a");
  assert.equal(ia.length, 3, "exactly the three valid bets — junk excluded");
});

test("a partitioned writer diverges, then reconverges after the partition heals", async (t) => {
  const a = await feed("pa", t);
  const b = await feed("pb", t, a.key);
  const c = await feed("pc", t, a.key);

  // partition: a<->b connected; c is isolated and writes offline
  connect(a, b);
  await b.postBet(bet(b, "pre-heal from b"));
  await c.postBet(bet(c, "offline from c"));
  await eventually(async () => (await a.listBets()).length === 1);
  await eventually(async () => (await c.listBets()).length === 1);
  assert.notDeepEqual(await ids(a), await ids(c), "partitioned peers hold divergent state");

  // heal: c joins the mesh
  connect(a, c);
  connect(b, c);
  await eventually(async () => (await a.listBets()).length === 2);
  await eventually(async () => (await b.listBets()).length === 2);
  await eventually(async () => (await c.listBets()).length === 2);

  const ha = await ids(a);
  assert.deepEqual(ha, await ids(b), "b reconverged");
  assert.deepEqual(ha, await ids(c), "c reconverged — identical state on every peer");
});
