import Hyperswarm from "hyperswarm";

/**
 * Real peer discovery for the Punt feed: join the feed's DHT topic on
 * Hyperswarm and replicate every connection at the Autobase level.
 *
 * Why `feed.replicate(conn)` (base.replicate) and not a store-level stream:
 * an optimistic writer (a peer posting a bet before it is an acked writer)
 * is only woken by the Autobase replication protocol — a Corestore stream
 * would leave such peers invisible. See packages/feed/feed.js.
 *
 * Identity: Hyperswarm mints a fresh random keypair per instance, so every
 * peer already has a DISTINCT swarm identity. Never pass a shared seed
 * (Goal.md pin) — colliding identities break discovery.
 *
 * @param feed  the object returned by createFeed() (needs .discoveryKey, .replicate)
 * @param onPeer optional callback invoked with each new connection
 * @param bootstrap optional DHT bootstrap nodes (tests use a local testnet)
 * @param swarm optional pre-built swarm (dependency-injection seam for tests)
 * @returns { swarm, flushed(), destroy() }
 */
export function joinFeedSwarm(feed, { onPeer, bootstrap, swarm } = {}) {
  swarm = swarm ?? new Hyperswarm(bootstrap ? { bootstrap } : undefined);
  let peers = 0;
  swarm.on("connection", (conn) => {
    peers += 1;
    conn.on?.("error", () => {}); // peers drop; keep the process alive
    conn.on?.("close", () => {
      peers = Math.max(0, peers - 1);
    });
    feed.replicate(conn);
    onPeer?.(conn);
  });
  const discovery = swarm.join(feed.discoveryKey, { server: true, client: true });
  return {
    swarm,
    /** Live Hyperswarm connection count (other peers currently wired). */
    peerCount: () => peers,
    flushed: () => discovery.flushed(),
    async destroy() {
      await swarm.destroy();
    },
  };
}
