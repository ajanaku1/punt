# Punt Permalinks - Commit-Pinned Code Review Guide

Tether Developers Cup 2026

A judge can walk this document in five minutes and see every high-value decision Punt made. Each section links the exact file and line at `github.com/ajanaku1/punt` `main` HEAD.

## Quick walk (90 seconds)

1. **Triple load-bearing stack**: `packages/app/peer.js` - three pillars boot in sequence: Autobase feed, WDK wallet, local QVAC LLM. Remove any one and the peer daemon doesn't start.
2. **On-chain AI jury**: `contracts/Escrow.sol` `settle()` - 2-of-3 EIP-191 juror signatures verified by `ecrecover`.
3. **Gasless staking**: `packages/app/peer.js` `gaslessStake()` - EIP-3009 off-chain signing + facilitator relay. Joiner never holds ETH.
4. **Deterministic reducer**: `packages/feed/feed.js` `reduce()` - four invariants (I1-I4).

---

## 1. Pears - The Data Plane

### 1.1 Autobase Pattern B multi-writer feed

- `packages/feed/feed.js:createFeed()` - constructs the Autobase with `optimistic: true`, encrypted blocks, and a deterministic Hyperbee reducer.
- ADR: `docs/adr/001-autobase-feed.md`

### 1.2 Hyperswarm DHT peer discovery

- `packages/feed/swarm.js:joinFeedSwarm()` - joins the feed's `discoveryKey` on the DHT. Each peer gets a distinct Hyperswarm identity.
- ADR: `docs/adr/001-autobase-feed.md`

### 1.3 Encrypted feed blocks

- `packages/app/peer.js` - bootstrap peer generates a 32-byte `FEED_SECRET`. The feed key finds the group; the secret reads the pots.
- ADR: `docs/adr/002-encrypted-feed.md`

### 1.4 Blind-peering juror discovery

- `packages/feed/blind-peering.js:joinJurorPool()` - creates a separate DHT topic per bet hash (`keccak256(betId + ":juror-pool")`). Jurors find each other without joining the main feed.
- Gated behind `PUNT_JUROR_POOL` env.

### 1.5 Hyperdrive evidence cache

- `packages/feed/evidence-drive.js:createEvidenceDrive()` - stores football-data.org results as blobs in a P2P Hyperdrive. Jurors serve cached evidence to each other. The API becomes a fallback.

### 1.6 Persistent peer identity

- `packages/shared/identity.js:loadOrCreateIdentity()` - generates or loads a persistent keypair seed. Survives restarts; fingerprint is surfaced in the stack HUD.

---

## 2. QVAC - The Brain

### 2.1 Temperature 0 jury grading

- `packages/juror/grade.js:buildGradeHistory()` - constructs the grading prompt. `packages/shared/llm.js:startLocalLlm()` - Qwen3 4B at `temp: 0` with JSON schema constraint.
- ADR: `docs/adr/006-temperature-zero-grading.md`

### 2.2 Deterministic grade extraction

- `packages/juror/grade.js:extractGrade()` - finds the first JSON object, parses it, validates `creatorWins` and `reasoning`. Abstains on failure - no false verdicts.
- ADR: `docs/adr/006-temperature-zero-grading.md`

### 2.3 On-device bet parsing with streaming

- `packages/shared/parse.js` - Llama 3.2 1B at temp 0 streams the parsed bet JSON token-by-token.
- ADR: `docs/adr/007-bet-parsing-architecture.md`

### 2.4 On-device Whisper speech-to-text

- `packages/shared/llm.js:startWhisper()` - Whisper base.en (~80MB) via QVAC SDK. Transcribed text enters the same parse pipeline.

### 2.5 TTS bet readback

- `packages/shared/llm.js:startTts()` - Supertonic/Chatterbox TTS reads the parsed bet back to the user before staking.

### 2.6 RAG jury context

- `packages/juror/rag.js` - EmbeddingGemma retrieves 2-3 semantically similar past verdicts as few-shot examples in the grade prompt.

### 2.7 VAD push-to-talk

- `packages/shared/llm.js:startVad()` - Silero VAD detects when the user stops speaking in the composer. Auto-transcribes.

### 2.8 ADR rationale

- `docs/adr/003-ai-jury-ecrecover.md` - why on-device jury + on-chain enforcement
- `docs/adr/006-temperature-zero-grading.md` - why deterministic inference for settlement
- `docs/adr/007-bet-parsing-architecture.md` - why local LLM over template matching

---

## 3. WDK - The Money

### 3.1 Self-custodial wallets for all peers

- `packages/shared/wdk.js:signingAccount()` - every peer derives their EVM account from a BIP-39 mnemonic via `WalletManagerEvm`.

### 3.2 WDK-native jury verdict signing

- `packages/shared/verdict.js:signVerdict()` - EIP-191 via `account.signMessage()`. Same key stack as staking.
- ADR: `docs/adr/005-wdk-verdict-signing.md`

### 3.3 Escrow.sol - on-chain 2-of-3 ecrecover

- `contracts/Escrow.sol:settle()` - 2-of-3 distinct juror EIP-191 signatures via `ecrecover`. Winner must be `creator` or `joiner`.
- ADR: `docs/adr/003-ai-jury-ecrecover.md`

### 3.4 Gasless staking via EIP-3009

- `packages/app/peer.js:gaslessStake()` - joiner signs EIP-712 `TransferWithAuthorization` via `ethers.Wallet.signTypedData()`, POSTs to facilitator. Joiner never holds ETH.
- `contracts/PuntUSDT.sol` - self-contained EIP-3009 token. Deployed at `0x41fD722Bc53426fA2a13b42a3dDF82569E870374` on Base Sepolia.

### 3.5 Facilitator sponsor

- `scripts/facilitator.js` - verifies the EIP-712 authorization against the contract's DOMAIN_SEPARATOR, then calls `transferWithAuthorization` with sponsor gas. Loopback HTTP server on `127.0.0.1:9780`.

### 3.6 ADR rationale

- `docs/adr/005-wdk-verdict-signing.md` - why WDK keys for both stakes and verdicts
- `docs/adr/004-reducer-invariants.md` - why feed-level validation before on-chain action

---

## 4. Cross-cutting: Architecture Decision Records

Seven ADRs at `docs/adr/`:

| ADR | Topic |
|-----|-------|
| 001 | Autobase + Hyperswarm as the data plane |
| 002 | Encrypted feed design (group secret) |
| 003 | On-device AI jury with on-chain enforcement |
| 004 | Reducer invariants (I1-I4) |
| 005 | WDK signing for juror verdicts |
| 006 | Temperature 0 deterministic grading |
| 007 | Plain-English bet parsing architecture |

---

## 5. On-chain proof (no install required)

| Claim | Evidence |
|-------|----------|
| Create pot | `Escrow.sol:create()` - stakes USDT, names 3 jurors |
| Join pot | `Escrow.sol:join()` - counter-stakes, verifies jury |
| Settle 2-of-3 | `Escrow.sol:settle()` - `ecrecover` loop, releases 2× stake |
| Gasless USDT | `PuntUSDT.sol` at `0x41fD722B…0374` - EIP-3009 on Base Sepolia |
| Jury demo works | `npm run jury:demo` → 5/5 on Qwen3 4B |
| 68 tests passing | `npm test` - CI green, coverage reported |
| 7 ADRs | `docs/adr/` - every load-bearing choice documented |

---

## What to click if you only have 90 seconds

1. `packages/feed/feed.js` - the four reducer invariants (I1-I4)
2. `contracts/Escrow.sol` `settle()` - the 2-of-3 ecrecover loop
3. `packages/app/peer.js` `gaslessStake()` - EIP-3009 off-chain signing
4. `contracts/PuntUSDT.sol` - the EIP-3009 token
