# ADR-002: Encrypted Feed Design

## Context

The feed key (a 32-byte Hypercore public key) is also the DHT discovery topic - anyone who knows it can find the swarm and replicate the raw blocks. Without encryption, knowing where the group meets means reading every pot. This is unacceptable for a betting app where stakes, winners, and peer identities are sensitive.

## Decision

Encrypt every Autobase block with a **32-byte group secret** passed as `encryptionKey` to the Autobase constructor. The feed key (`FEED_KEY`) answers *where* the group meets; the group secret (`FEED_SECRET`) answers *who can read the pots*. Both are handed to friends out-of-band (e.g., shared via `.env`).

The bootstrap peer generates `FEED_SECRET` via `crypto.randomBytes(32)` on first run and writes both `FEED_KEY` and `FEED_SECRET` to `.env`. Joining peers read both from `.env`. Neither is ever gossiped over the DHT.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **No encryption** (public feed) | Violates the trust model. Punt is for friends, not a public prediction market. Bets should be private to the group. |
| **Per-message encryption** (each bet encrypted separately) | Adds complexity without benefit. The group shares one secret; there's no subgroup access control. Block-level encryption is simpler and equally effective. |
| **Key rotation** (periodic secret changes) | Would orphan peers mid-session. A betting round lasts hours; the secret should be stable for the lifetime of a group. |
| **Public-key encryption per peer** | Requires key discovery before any bet can be read. With 3 jurors + 2 players, this is 10 key exchanges before the first bet. Group symmetric encryption is one secret. |

## Consequences

- **Positive:** DHT discovery and feed replication work without exposing bet contents. A passive network observer sees encrypted blocks.
- **Positive:** The `.env` file is the natural "invite link" - share one file and a friend can join, read, and post.
- **Negative:** `.env` files are not secure channels. This is adequate for a friend-group demo but not for adversarial settings. A production version would use a proper key exchange (e.g., keet-identity-key + Noise handshake).
- **Negative:** If `FEED_SECRET` leaks, all past and future bets are readable. Forward secrecy is out of scope.

## References

- `packages/feed/feed.js:createFeed()` - `encryptionKey` parameter
- `packages/app/peer.js` - bootstrap peer generates the secret at line 46
