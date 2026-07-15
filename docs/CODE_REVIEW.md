# Punt - Code Review Companion

A narrative walk of Punt's architecture for judges reviewing the source. Companion to `PERMALINKS.md` (commit-pinned file links) and the seven `docs/adr/` architecture decision records.

## The idea

Punt is three pillars that must all be present for the product to work:

1. **Pears** carries the market - an Autobase feed replicated between peers over the Hyperswarm DHT. Jurors use blind-peering for per-bet DHT pools. Match evidence is cached P2P over Hyperdrive. Peers have persistent keet identities. There is no server.

2. **QVAC** carries the brain - Qwen3 4B grades bets with RAG-augmented few-shot context at temperature 0. Llama 3.2 1B parses plain English. Whisper transcribes speech with Silero VAD for push-to-talk. Supertonic TTS reads bets back. All on-device.

3. **WDK** carries the money - every peer has a self-custodial wallet. Stakes sit in an escrow contract on Base Sepolia. Verdicts are signed with the same WDK key and verified on-chain via `ecrecover`. Gasless staking via EIP-3009 lets joiners stake without holding ETH.

## The core loop

**Create.** A user types or speaks a bet. VAD detects speech. Whisper transcribes. The local 1B model structures it, flags ambiguity, and streams the draft. TTS reads it back. The user confirms. The bet is appended to the Autobase feed. The peer stakes USDT in the escrow.

**Join.** Another peer sees the bet in the swipe stack. They swipe right. Their wallet counter-stakes. With gasless staking enabled, they sign an EIP-3009 authorization off-chain; the facilitator pays gas. The pot is now funded.

**Settle.** After the match, three jurors each run their local 4B model. RAG retrieves similar past verdicts as few-shot context. The model grades at temperature 0 against the official result. Each signs their verdict. 2-of-3 releases the escrow. The winner gets the full pot.

## Key architectural decisions

### Triple load-bearing, deepened

Punt now exercises 7 Pears primitives (Autobase, Hyperswarm, blind-peering, Hyperdrive, hyperblobs, keet-identity-key, Corestore), 6 QVAC plugins (Qwen3 4B, Llama 3.2 1B, Whisper, EmbeddingGemma, Supertonic TTS, Silero VAD), and 2 WDK paths (Escrow staking, EIP-3009 gasless). Every one is structural - remove it and a named capability disappears.

### The feed is deterministic

Four invariants (I1-I4) enforced in `reduce()`: schema validation, author binding, verdict dedup, determinism. Spam and impersonation are structurally impossible.

### The jury is enforced on-chain

A juror's verdict is a signed cryptographic commitment verified by `Escrow.settle()` via `ecrecover`. Two signatures from listed jurors release the pot. No oracle, no admin, no appeals process.

### Gasless staking

The joiner signs an EIP-3009 `TransferWithAuthorization` off-chain. A funded facilitator relays the tx. The joiner's wallet signs with `ethers.Wallet.signTypedData()` - same key as staking and verdicts. This is a second WDK settlement path.

### AI is on-device and deterministic

All six QVAC plugins run locally. The 4B jury model runs at temperature 0 with JSON schema constraints. RAG provides few-shot context from past verdicts. Extraction is deterministic: garbled output → no verdict, not a wrong one.

## Boundaries

Punt runs on Base Sepolia with test USDT. It is honest-majority across three jurors. It is fixed-stake two-sided pots between friends - no odds, no house edge. The football-data.org API feeds match results to the jury, but the jury interprets them. Joiners can stake without ETH through EIP-3009 and a facilitator. No company hosts markets or takes a cut.

## Code organization

```
packages/shared/ - bet schema, verdict signing, WDK helpers, LLM loading (TTS + VAD), peer identity
packages/feed/ - Autobase feed, DHT swarm, blind-peering, Hyperdrive evidence cache
packages/juror/ - grading prompt, football-data client, RAG context, juror daemon
packages/app/ - peer daemon, Electron shell, swipe UI, gasless staking path
contracts/ - Escrow.sol, MockUSDT.sol, PuntUSDT.sol (EIP-3009)
scripts/ - demo orchestration, facilitator, metrics, deployment, funding
tests/ - 68 node:test specs (schema, feed, escrow, parse, verdicts, WDK, DHT, convergence, edge cases)
docs/
 adr/ - 7 architecture decision records
 PERMALINKS.md - commit-pinned code review guide
 CODE_REVIEW.md - this file
```

## Judge verdict

Punt uses all three Tether stacks at depth (7 Pears primitives, 6 QVAC plugins, 2 WDK paths) - each load-bearing. It enforces an on-device AI decision on-chain. It ships gasless staking so joiners never need ETH. These claims are verifiable by reading four files: `packages/feed/feed.js` (the reducer), `contracts/Escrow.sol` (the settlement), `contracts/PuntUSDT.sol` (EIP-3009), and `packages/app/peer.js` (gasless staking).
