# ADR-004: Reducer Invariants (I1-I4)

## Context

The Autobase `apply` function is the sole mutator of the shared view. Every peer runs it identically on every message in the log - incorrect or non-deterministic behavior here corrupts the entire feed for all peers. The reducer must reject invalid data before it enters anyone's view and must produce identical state on every peer.

## Decision

Enforce four invariants in the `reduce` function, evaluated in order. A message that fails any invariant is silently dropped - the writer is never acked, so the bad message never converges into anyone's Hyperbee.

### I1 - Schema gate

Every bet must pass `validateBet()` (checks type, creator key format, text length, market enum, stake range, ISO date). Every verdict must pass `validateVerdictMsg()` (checks type, hex betId, address format, 130-char signature). Messages that fail are dropped BEFORE the writer is acked.

### I2 - Author binding (anti-spoofing)

A bet enters the view only if its `creator` field (a 64-hex public key) matches the key of the Autobase writer that appended it. Without I2, any peer could post a bet claiming to be any other peer. With I2, a bet's creator is cryptographically bound to the append.

### I3 - Verdict dedup

At most one verdict per `(betId, jurorAddress)` is retained in the view. A juror re-signing overwrites their previous verdict (keyed by lowercased juror address). Without I3, a juror could flood the tally with duplicate votes.

### I4 - Determinism

The view is a pure function of the message log. Autobase re-runs `apply` on reorg; every peer must land on the identical Hyperbee. The `reduce` function uses only the message payload, the writer key, and the current view state - no external state, no randomness, no timestamps beyond what's in the message.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Validate in the UI layer only** | A malicious peer can bypass the UI and append directly via `base.append()`. Schema validation must happen at the reducer level, not the UI level. |
| **Accept all messages, filter in the view** | Would ack the writer, letting spam converge into everyone's log permanently. Rejecting before ack means spam never hits anyone's storage. |
| **Use the writer key from the message, not from the Autobase node** | The message's `creator` field is self-reported. The Autobase `node.from.key` is the actual key that signed the append - it cannot be forged. Author binding must use the latter. |
| **Time-based verdict expiry** | Adds complexity without benefit. A juror re-signing (overwriting) is simpler than expiry windows and doesn't require clock synchronization. |

## Consequences

- **Positive:** Spam and impersonation are structurally impossible - they're rejected at the protocol level, not policed after the fact.
- **Positive:** The tally view (`tally/<betId>`) is a convenience, not an authority. The authoritative 2-of-3 decision stays in `verdict.js:majorityWinner()` which verifies signatures.
- **Negative:** I2 means a peer can only post bets under their own identity. If a user loses their keypair, their bet history is orphaned. Key recovery is out of scope.

## References

- `packages/feed/feed.js:reduce()` - invariant enforcement
- `packages/shared/bet.js:validateBet()` - schema validation
- `packages/shared/verdict.js:validateVerdictMsg()` - verdict validation
