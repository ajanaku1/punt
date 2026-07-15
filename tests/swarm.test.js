import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "hypercore-crypto";
import { createFeed } from "@punt/feed/feed.js";
import { joinFeedSwarm } from "@punt/feed/swarm.js";

// The DHT transport itself is Hyperswarm's (well-tested) responsibility and
// needs real UDP that a sandbox can't form; live cross-machine discovery is
// exercised by the demo. These tests pin the two things that ARE ours and
// correctness-critical: our wiring joins the right topic and replicates every
// connection, and two peers holding the same feed key target the same topic.

function fakeSwarm() {
  const s = new EventEmitter();
  s.joined = [];
  s.join = (topic, opts) => {
    s.joined.push({ topic, opts });
    return { flushed: async () => {} };
  };
  s.destroy = async () => {};
  return s;
}

test("joinFeedSwarm joins the feed's discovery key and replicates each connection", () => {
  const replicated = [];
  const feed = { discoveryKey: crypto.randomBytes(32), replicate: (c) => replicated.push(c) };
  const swarm = fakeSwarm();
  const peers = [];

  joinFeedSwarm(feed, { swarm, onPeer: (c) => peers.push(c) });

  // joins on the feed's own discovery topic, as both server and client
  assert.equal(swarm.joined.length, 1);
  assert.ok(Buffer.compare(swarm.joined[0].topic, feed.discoveryKey) === 0, "topic is the feed's discovery key");
  assert.deepEqual(swarm.joined[0].opts, { server: true, client: true });

  // every inbound connection is replicated at the Autobase level (base.replicate)
  const conn = new EventEmitter();
  swarm.emit("connection", conn);
  assert.equal(replicated.length, 1);
  assert.equal(replicated[0], conn);
  assert.equal(peers.length, 1, "onPeer fired for the connection");
});

// Stack HUD reads peerCount() — live connections in, close drops the count.
test("joinFeedSwarm peerCount tracks live connections for the stack HUD", () => {
  const feed = { discoveryKey: crypto.randomBytes(32), replicate: () => {} };
  const swarm = fakeSwarm();
  const handle = joinFeedSwarm(feed, { swarm });

  assert.equal(handle.peerCount(), 0);
  const a = new EventEmitter();
  const b = new EventEmitter();
  swarm.emit("connection", a);
  swarm.emit("connection", b);
  assert.equal(handle.peerCount(), 2);
  a.emit("close");
  assert.equal(handle.peerCount(), 1);
  b.emit("close");
  assert.equal(handle.peerCount(), 0);
});

test("two peers sharing a feed key target the same DHT topic", async () => {
  const dirs = [];
  const mk = async (n) => {
    const d = await mkdtemp(join(tmpdir(), `punt-dk-${n}-`));
    dirs.push(d);
    return d;
  };
  const host = await createFeed({ storage: await mk("host") });
  const joiner = await createFeed({ storage: await mk("joiner"), key: host.key });

  assert.ok(Buffer.compare(host.discoveryKey, joiner.discoveryKey) === 0, "same swarm topic for both peers");
  assert.ok(
    Buffer.compare(host.discoveryKey, crypto.discoveryKey(host.key)) === 0,
    "topic is discoveryKey(feed.key) — derivable by anyone who knows the key",
  );

  await host.close();
  await joiner.close();
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});
