# ADR-001: Autobase + Hyperswarm as the Data Plane

## Context

Punt needs a shared market of open bets that replicates between peers without a server. Every betting app before Punt used a centralized backend to host and distribute markets. Punt must work when the company behind it doesn't exist - peer-to-peer replication is the entire product proposition.

## Decision

Use **Autobase** (optimistic multi-writer log) over **Hyperswarm** (DHT-based peer discovery) as the sole data plane. One feed key discovers the group on the DHT; one encryption key gates read access. The Autobase `apply` function is a deterministic reducer that validates, deduplicates, and indexes every append - all peers converge to the identical Hyperbee view without coordination.

This is Pattern B multi-writer: anyone can append (bets, verdicts) without being a pre-authorized writer, because the `apply` function gates acceptance - `ackWriter` is called only after the message passes schema validation and author binding.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Central relay server** (WebSocket/HTTP relay) | Violates "no server" proposition. A relay is a server, just smaller - it can still go down, get rate-limited, or be blocked. |
| **Corestore replication directly** (`store.replicate()`) | Wakes only acked writers. An optimistic writer (peer posting a bet before acked) would be invisible to other peers who joined via Corestore streams. Autobase-level replication (`base.replicate()`) wakes optimistic writers. |
| **libp2p + gossipsub** | Would require building a custom CRDT layer. Autobase ships with a battle-tested linearised log with Hyperbee indexing, `apply`, and `ackWriter` - Punt would need to reimplement every one of those. |
| **Single-writer Autobase (Pattern A)** | Would require one designated "feed owner" peer - a de facto server. Pattern B multi-writer means no peer is special. |
| **Shared Hyperswarm seed** | Would give every peer the same swarm identity, breaking DHT discovery (identical identities collide). Each peer mints a fresh random keypair; the *feed key* is what they join on. |

## Consequences

- **Positive:** No server to maintain, pay for, or shut down. Feed replication is free and works as long as the DHT has at least one peer online.
- **Positive:** The deterministic reducer (see ADR-004) means every peer independently validates every message - spam and impersonation are rejected before they enter anyone's view.
- **Negative:** DHT bootstrapping requires at least one peer with a routable connection. The `PUNT_FEED_LOCAL` fallback (direct TCP) exists for offline demos and NAT-restricted test environments.
- **Negative:** Autobase reindexes the full log on restart. For a betting app with hundreds of bets, this is seconds of startup I/O - acceptable. Would need snapshotting at scale.

## References

- `packages/feed/feed.js:createFeed()` - feed construction and `apply`
- `packages/feed/swarm.js:joinFeedSwarm()` - DHT discovery
- `packages/app/peer.js` - peer daemon wiring both together
