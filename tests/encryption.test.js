import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "hypercore-crypto";
import { createFeed } from "@punt/feed/feed.js";

// The feed key says WHERE the group meets (DHT topic); the FEED_SECRET says
// WHO can read the pots. These tests pin both directions: holders of the
// secret converge normally, and a peer holding only the feed key sees nothing.

async function feed(name, t, opts = {}) {
  const dir = await mkdtemp(join(tmpdir(), `punt-enc-${name}-`));
  const f = await createFeed({ storage: dir, ...opts });
  t.after(async () => {
    await f.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  });
  return f;
}

const bet = (creator) => ({
  type: "bet",
  creator,
  text: "private group bet",
  match: { home: "Ghana", away: "Senegal", kickoff: "2026-06-15T17:00:00Z" },
  market: "result",
  selection: "Ghana win",
  stake: 2,
  resolution: "Ghana beat Senegal at full time",
  createdAt: 1751800000000,
});

function connect(x, y) {
  const sx = x.replicate(true);
  const sy = y.replicate(false);
  sx.pipe(sy).pipe(sx);
}

async function eventually(fn, ms = 10000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}

test("peers holding the group secret replicate and read the encrypted feed", async (t) => {
  const secret = crypto.randomBytes(32);
  const a = await feed("a", t, { encryptionKey: secret });
  const b = await feed("b", t, { key: a.key, encryptionKey: secret });
  connect(a, b);

  await b.postBet(bet(b.localKey.toString("hex")));
  await eventually(async () => (await a.listBets()).length === 1);
  assert.equal((await a.listBets())[0].text, "private group bet");
});

test("a peer with the feed key but WITHOUT the secret cannot read the pots", async (t) => {
  const secret = crypto.randomBytes(32);
  const a = await feed("host", t, { encryptionKey: secret });
  const b = await feed("member", t, { key: a.key, encryptionKey: secret });
  connect(a, b);
  await b.postBet(bet(b.localKey.toString("hex")));
  await eventually(async () => (await a.listBets()).length === 1);

  // the eavesdropper knows where the group meets — but not the secret
  const spy = await feed("spy", t, { key: a.key });
  connect(a, spy);
  await new Promise((r) => setTimeout(r, 2000)); // give replication every chance
  assert.equal((await spy.listBets()).length, 0, "no bets readable without the group secret");
});
