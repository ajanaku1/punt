# Punt: swipe-to-stake football bets with no bookmaker

Post a football bet in plain English. A friend swipes right to match your stake. Three on-device AI models decide who won. No company hosts the market. No company resolves it. No company takes a cut. There is no server to host it on.

[![Node](https://img.shields.io/badge/Node-25-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8-363636?logo=solidity)](https://soliditylang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/ajanaku1/punt/actions/workflows/ci.yml/badge.svg)](https://github.com/ajanaku1/punt/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-68_passing-brightgreen)]()
[![coverage](https://codecov.io/gh/ajanaku1/punt/branch/main/graph/badge.svg)](https://codecov.io/gh/ajanaku1/punt)

![The swipe feed](docs/images/home.png)

## What sets it apart

All three Tether stacks are required for the core loop. Pears runs the market (Autobase, Hyperswarm, blind-peering, Hyperdrive). QVAC runs the brain (LLM jury, TTS readback, RAG context). WDK runs the money (self-custodial wallets, EIP-3009 gasless staking, ecrecover settlement). Pull any one out and the app stops working.

The on-device AI jury is enforced on-chain. Three peers grade each bet with local models. Two matching WDK signatures release the pot. `Escrow.settle` verifies them with `ecrecover`. No oracle. No admin. The contract is the final word.

Gasless staking means the joiner never touches ETH. They sign a `TransferWithAuthorization` off-chain. A facilitator submits the tx and pays the gas. It is the same key that signs the stake and the verdict.

## Zero-install proof

| Claim | Proof without running the app |
|-------|-------------------------------|
| All three stacks required | [Tech stack table](#tech-stack): each row names what breaks without it |
| On-device jury is real | `npm run jury:demo` → 5/5 (after clone) |
| Create pot on-chain | [tx 0x98e6dab9…](https://sepolia.basescan.org/tx/0x98e6dab9f0c2165d9b4faabf1632a1644e4d944c933cedc10c4c2ad31cdfaad0) |
| Join pot on-chain | [tx 0x9e775918…](https://sepolia.basescan.org/tx/0x9e775918b238c4af0e6289337a115a0445bd5736bf90a0027b2337e9fb7518d5) |
| Settle 2/3 ecrecover | [tx 0x403b1dec…](https://sepolia.basescan.org/tx/0x403b1dec9c0e8f6c72e59efe58840c1353dfb26dc83d7be5daf1059903f9e6ae) |
| Gasless USDT deployed | [0x41fD72…](https://sepolia.basescan.org/address/0x41fD722Bc53426fA2a13b42a3dDF82569E870374): PuntUSDT (EIP-3009) on Base Sepolia |
| 7 ADRs | [`docs/adr/`](docs/adr/): every load-bearing choice documented |
| Judge review guide | [`docs/PERMALINKS.md`](docs/PERMALINKS.md): 5-minute walk with pinned code links |
| CI green | [badge above](https://github.com/ajanaku1/punt/actions/workflows/ci.yml) |

Judge walk-through: **[docs/judge-in-5-minutes.md](docs/judge-in-5-minutes.md)**. Live demo: `npm run demo:judge`. One command: `npm run demo:all`.

## Live Demo

**[https://punt-ten.vercel.app](https://punt-ten.vercel.app)**

Marketing site. The app runs as a local Electron peer demo (see Testing the App).

## Screenshots

| Home | Composer | History | Profile |
|------|----------|---------|---------|
| ![Home](docs/images/home.png) | ![Composer](docs/images/composer.png) | ![History](docs/images/history.png) | ![Profile](docs/images/profile.png) |

---

## What Is Punt?

Every prediction app is a platform. A company hosts the markets. A company settles the bets. A company takes a cut.

Punt is the version a platform cannot be. Bets replicate peer-to-peer over an Autobase feed. Stakes sit in self-custodial WDK wallets escrowed on-chain. Three peers each running a language model on their own machine decide who gets paid. Built for the Tether Developers Cup on all three Tether stacks.

---

## Features

**Compose a bet in plain English.** Type it or say it. Whisper transcribes your voice on-device. Silero VAD knows when you stop talking. A local Llama 3.2 1B streams the structured terms into the composer as it writes them, and flags anything it had to guess. On-device TTS reads the bet back so you hear it before you stake.

**Swipe to stake.** The home screen is a card stack of open bets from every peer in your group. Swipe right to match the stake with real testnet USDT. Swipe left to skip.

**Stake without ETH.** The joiner signs an EIP-3009 `TransferWithAuthorization` off-chain with their WDK key. A funded facilitator pays the gas. The joiner's wallet never touches ETH.

**No server. No hardcoded address.** Peers find each other on the Hyperswarm DHT from the feed key. Jurors use a separate blind-peering DHT topic per bet. They learn about only the bet they grade. Everything else stays private.

**Encrypted blocks.** Every block is encrypted with a group secret. Knowing where the group meets is not enough to read the pots. You hand the secret to your friends out of band.

**Fixed stakes. No bookmaker. No odds.** Two-sided pots between friends. Winner takes the pot. Nobody takes a cut.

**AI jury with RAG.** Three jurors grade each bet against football-data.org results. EmbeddingGemma retrieves similar past verdicts and injects them as few-shot examples. Each juror runs a local Qwen3 4B at temperature 0 with grammar-constrained JSON output. Every verdict is signed by the juror's WDK key. Two matching signatures release the escrow.

**Anti-spoofing at the protocol level.** The feed runs a deterministic reducer with four invariants. Junk is dropped before the writer gets acked. Bets are accepted only when the author key matches the sending peer. Spam and impersonation never reach anyone.

**Peers you can recognize.** keet-identity seeds survive restarts. The stack HUD shows each peer's fingerprint.

**Evidence that doesn't hammer an API.** Match results are cached P2P over Hyperdrive. Later jurors pull from peers, not football-data.org. The API is fallback only.

**Everything is WDK-native.** Stakes, escrow calls, jury verdicts, and EIP-3009 authorizations all sign with the same WDK key.

**Metrics without the cloud.** Prometheus on `127.0.0.1:9090`. Peer count, open bets, verdicts, jury latency, LLM load time, gasless stake count.

---

## Tech Stack

| Layer | Technology | What it does |
|-------|-----------|-------------|
| Bet feed | Pears (Autobase, Corestore, Hyperswarm, blind-peering, Hyperdrive, hyperblobs, keet-identity-key) | Peers discover on the DHT by feed key. Replicate an encrypted multi-writer Autobase. The view is a deterministic reducer that binds each bet to its author. Jurors use blind-peering for a separate DHT pool per bet. Match evidence is cached P2P over Hyperdrive. Each piece is structural. |
| AI | QVAC (`@qvac/sdk`): Llama 3.2 1B, Whisper base.en, Qwen3 4B, EmbeddingGemma, Supertonic TTS, Silero VAD | Speech-to-bet, streaming parse, jury grading at temp 0 with RAG, bet readback, push-to-talk. All on-device. Verify with `npm run jury:demo`. |
| Wallets | WDK (`@tetherto/wdk-wallet-evm`) | Stakes, escrow calls, jury verdicts, and EIP-3009 gasless authorizations all flow through WDK. |
| Escrow | Solidity 0.8 on Base Sepolia | Fixed-stake pots keyed by bet hash. Released by 2-of-3 jury ecrecover. |
| Gasless token | PuntUSDT.sol (EIP-3009) on Base Sepolia | Joiner signs off-chain. Facilitator pays gas. Deployed at [0x41fD722Bc53426fA2a13b42a3dDF82569E870374](https://sepolia.basescan.org/address/0x41fD722Bc53426fA2a13b42a3dDF82569E870374). |
| Shell | Electron | Phone-shaped desktop window. P2P and AI run in a separate Node daemon. |

---

## Testing the App

Reviewing for the cup? [Judge in 5 minutes](docs/judge-in-5-minutes.md) is a reproducible path with pass/fail gates. Most gates work with no wallet.

### Part 1: setup

1. Install Node 22+, clone the repo, run `npm install --registry=https://registry.npmjs.org`.
2. Run `node scripts/fund-wallets.js`. Five wallets land in a gitignored `.env`.
3. Fund CREATOR and JOINER with Base Sepolia ETH ([faucet](https://www.alchemy.com/faucets/base-sepolia)). Jurors never need gas.
4. Run `node scripts/deploy.js` to deploy MockUSDT and Escrow, then mint 100 USDT to each player.
5. Get a free [football-data.org](https://www.football-data.org/client/register) key, add `FOOTBALL_DATA_KEY=<key>` to `.env`.

### Part 2: the journey

1. Run `npm run demo:judge` or `npm run demo`. Two phone-shaped windows open. Three juror processes print to the terminal. A checklist shows up.
2. The stack HUD under the ticker should show: Pears (peers, dht, enc, identity fingerprint), QVAC (AI ready), WDK (balance or last tx).
3. On the creator phone, hit `+` and type a bet on a finished real match. Example: "Morocco beat Ecuador yesterday, 4 on it." The local model reads it back as structured terms. Press POST. Your stake locks in the escrow.
4. The bet appears on the joiner's card stack. It arrived over P2P replication, not through a server.
5. Swipe right on the joiner. Their stake locks. The pot holds both stakes on-chain.
6. Watch the terminal. Each juror fetches the result, runs RAG for similar past verdicts, grades the bet with its own local model, and prints a signed verdict.
7. The winner's daemon collects two matching signatures and settles. A toast shows **Settled on-chain · 2 of 3 QVAC jurors · WDK · ecrecover** with a Basescan link. The winner's USDT balance jumps by the full pot.

If venue Wi-Fi blocks the DHT: `PUNT_FEED_LOCAL=1 npm run demo:judge` falls back to localhost TCP.

### Gasless staking (optional)

Set `PUNT_GASLESS=1` in `.env` and run `node scripts/facilitator.js` alongside the peers. The joiner signs an EIP-3009 authorization. The facilitator relays it with its own ETH.

### Part 3: spam defense

Run `node scripts/junk-check.js`. A peer appends two junk messages and one valid bet. Only the valid bet reaches the feed.

---

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `Escrow.sol` | One pot per bet, keyed by the bet's canonical hash. Creator stakes on create. One joiner counter-stakes. 2-of-3 juror signatures release the pot. Timeout refunds both sides. |
| `MockUSDT.sol` | Six-decimal test USDT with open faucet mint. Used by the existing Escrow. |
| `PuntUSDT.sol` | EIP-3009 USDT for gasless staking. No external deps. `transferWithAuthorization` lets joiners stake without ETH. Deployed at `0x41fD722Bc53426fA2a13b42a3dDF82569E870374`. |

Escrow and MockUSDT are deployed on Base Sepolia. PuntUSDT is deployed separately for the gasless path. Addresses land in `.env` from the deploy scripts.

---

## How It Works

```
 creator phone                                joiner phone
 (Electron)                                   (Electron)
      |                                            |
 peer daemon A  <----- Autobase feed ----->  peer daemon B
 (feed+WDK+LLM)     optimistic replication   (feed+WDK+LLM)
      |                                            |
      |  create pot                       join pot |
      +-----------------+    +---------------------+
                        v    v
                   Escrow contract  (Base Sepolia)
                        ^    ^
                        |    |  settle (2-of-3 signatures)
      +--------+   +--------+   +--------+
      | juror1 |   | juror2 |   | juror3 |     each: own Corestore,
      +--------+   +--------+   +--------+     own local LLM, own key,
           |            |            |          RAG context, blind-peering
           +------------+------------+          pool per bet, Hyperdrive
                       |                       evidence cache
              football-data.org                (fallback only)
```

Peers find each other on the Hyperswarm DHT using the feed's discovery key. No address to configure. Jurors use blind-peering to discover each other on a per-bet DHT topic. A bet is appended optimistically to the shared Autobase. The apply function is a deterministic reducer: it validates the schema, checks that the bet's author key matches the sending peer, and only then acknowledges the writer. Junk and impersonation never converge. Verdicts travel over the same feed as messages signed by each juror's WDK account. The escrow verifies those signatures on-chain with `ecrecover`. The contract is the final arbiter of who gets paid.

**Trust assumption**: honest-majority across the three jurors. Collusion resistance beyond that is out of scope.

**Disclosed services**: football-data.org for match results, a Base Sepolia RPC endpoint, and an optional local facilitator for gasless staking. Everything else (AI inference, evidence caching, peer discovery) runs on the peers' machines.

Every load-bearing decision is documented in [`docs/adr/`](docs/adr/). A commit-pinned review guide is at [`docs/PERMALINKS.md`](docs/PERMALINKS.md).

---

## Running Locally

```bash
git clone https://github.com/ajanaku1/punt.git && cd punt
npm install --registry=https://registry.npmjs.org
node scripts/fund-wallets.js       # generate wallets into .env
# fund CREATOR + JOINER with Base Sepolia ETH, then:
node scripts/deploy.js             # deploy MockUSDT + Escrow, mint test funds
npm test                           # 68 tests (escrow tests need foundry's anvil)
npm run demo                       # the full two-phone, three-juror demo
```

Proofs, each one command:

```bash
npm run demo:all                   # one command: Pears feed, QVAC jury, WDK stake
npm run jury:demo                  # Qwen3 4B grades tricky fixtures on-device
npm run coverage                   # 68 tests with coverage
node scripts/p2p-check.js          # two-process replication proof
node scripts/junk-check.js         # spam rejection proof
node scripts/join-check.js         # WDK wallets fund a pot on-chain
node scripts/facilitator.js        # EIP-3009 gasless sponsor
npm run peer:creator               # one peer daemon, headless
npm run juror1                     # one juror, headless
```

---

## Project Structure

```
punt/
  contracts/            Escrow.sol, MockUSDT.sol, PuntUSDT.sol (EIP-3009)
  packages/
    shared/             bet schema, verdict signing, WDK helpers, identity, LLM (TTS + VAD)
    feed/               Autobase feed, DHT swarm, blind-peering, evidence Hyperdrive
    juror/              grading prompts, football-data client, RAG, juror daemon
    app/                peer daemon, Electron shell, swipe UI
    relay/              optional relay for NAT traversal
  scripts/              fund-wallets, deploy, compile, facilitator, metrics, demo-all, jury-demo, proofs
  tests/                68 node:test specs (schema, feed, escrow, parse, verdicts, WDK, DHT, convergence, edge cases)
  docs/
    adr/                7 architecture decision records
    PERMALINKS.md       commit-pinned code review guide
    CODE_REVIEW.md      companion narrative for judges
    judge-in-5-minutes.md  pass/fail walk-through
  .github/workflows/    CI: contract compile, tests, coverage
  docs/images/          UI screenshots
```

---

## License

MIT
