/**
 * Blind-peering juror discovery - creates a separate Hyperswarm DHT topic
 * derived from the bet hash so jurors find each other without joining the
 * main feed. A juror who joins the main feed can read all pots; a juror who
 * joins only via blind-peering learns about only the specific bet they're
 * grading.
 *
 * Gate: PUNT_JUROR_POOL=1 enables this path. Without it, jurors join the main
 * feed (existing behavior).
 *
 * Topic derivation: keccak256(betId || "juror-pool") - deterministic per bet,
 * discoverable by anyone who knows the bet hash (i.e., everyone on the main
 * feed already). The blind-peering topic is NOT encrypted - jurors need to
 * discover each other, not hide the fact that they're grading.
 */
import Hyperswarm from "hyperswarm";
import { createHash } from "node:crypto";

/** Derive a deterministic 32-byte topic from a bet hash. */
export function jurorPoolTopic(betId) {
  return createHash("sha256")
    .update(betId + ":juror-pool")
    .digest();
}

/**
 * Join a blind-peering swarm for one bet. Returns a handle with the swarm
 * and a peerCount() getter. Jurors use this to find each other without
 * joining the main feed.
 *
 * @param {Buffer} topic - 32-byte topic from jurorPoolTopic()
 * @param {Function} replicate - feed.replicate to wire into each connection
 * @param {object} [opts]
 * @param {Hyperswarm} [opts.swarm] - pre-built swarm (test seam)
 * @param {Array} [opts.bootstrap] - DHT bootstrap nodes
 * @returns {{ swarm: Hyperswarm, peerCount: () => number, flushed: () => Promise<void>, destroy: () => Promise<void> }}
 */
export function joinJurorPool(topic, replicate, opts = {}) {
  const swarm = opts.swarm ?? new Hyperswarm(opts.bootstrap ? { bootstrap: opts.bootstrap } : undefined);
  let peers = 0;

  swarm.on("connection", (conn) => {
    peers += 1;
    conn.on?.("error", () => {});
    conn.on?.("close", () => {
      peers = Math.max(0, peers - 1);
    });
    replicate(conn);
  });

  const discovery = swarm.join(topic, { server: true, client: true });

  return {
    swarm,
    peerCount: () => peers,
    flushed: () => discovery.flushed(),
    async destroy() {
      await swarm.destroy();
    },
  };
}
