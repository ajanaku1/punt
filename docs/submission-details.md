## What is Punt?

Punt is a desktop P2P app for fixed-stake football pots between friends. No bookmaker. No odds board. No company hosting the market.

You type a bet in plain English, or tap the mic and say it. A mate swipes right to match your stake with real testnet USDT from a self-custodial WDK wallet. After the match, three peers each grade the outcome with an on-device model and sign a verdict. Two matching signatures release the escrow on-chain. Winner takes the pot.

Built for the Tether Developers Cup on all three sponsor stacks: **Pears**, **QVAC**, and **WDK**.

## Two things nothing else in the field does

1. **All three Tether stacks are load-bearing at once.** Take any one away and the app stops working. The feed is Pears, the brain is QVAC, the money is WDK.
2. **On-device AI verdicts are verified on-chain.** Three peers grade the bet with a local model, sign the verdict with a WDK key, and the escrow contract itself checks the 2-of-3 signatures with `ecrecover`. The AI jury is the settlement oracle, and the smart contract enforces it.

## The problem

Every prediction app is a platform. A company lists markets, settles them, and takes a cut. You trust their custody and their oracle.

Punt is the version that only works if the stack is load-bearing: the feed is the network, the AI runs on the peers, and the wallets are yours.

## How it works

1. **Call your shot:** type something like "Morocco beat Ecuador yesterday, 4 on it". A local QVAC model (Llama 3.2 1B) turns it into structured terms and flags anything it had to guess. Your stake locks into the escrow, signed by your WDK wallet.
2. **Peers find each other:** peers and jurors discover on the Hyperswarm DHT from the feed's key. No server, no hardcoded address. The bet is appended to an optimistic Autobase feed and replicates peer to peer.
3. **Swipe to stake:** home is a card stack. Swipe right matches the stake. Swipe left passes. The feed is a deterministic reducer that drops junk and binds every bet to its author key, so spam and impersonation never converge.
4. **Jury pays the winner:** three juror processes each fetch official results from football-data.org, grade with a local model (Qwen3 4B, temperature 0), and sign a verdict with their WDK key. The winner's daemon collects 2-of-3 signatures and settles on Base Sepolia. The contract checks `ecrecover` on-chain.

## Sponsor stack (all load-bearing)

| Stack | Role |
|-------|------|
| **Pears** (Autobase + Corestore + Hyperswarm) | Peers discover on the DHT by the feed key and replicate an encrypted, optimistic multi-writer Autobase. The view is a deterministic reducer that binds each bet to its author, and only holders of the group secret can read the pots. Remove it and there is no app. |
| **QVAC** (`@qvac/sdk`) | Transcribes spoken bets (Whisper), parses plain English into bet terms (streamed live into the composer), and grades settlement. All on-device, no cloud AI. Prove it with `npm run jury:demo`. |
| **WDK** (`@tetherto/wdk-wallet-evm`) | Every signature is WDK-native: stake custody via native `approve` and `sendTransaction`, escrow calls, and juror verdicts. Ethers only encodes calldata and reads chain state. |

## What changed for the semifinal

Judges watch commit history, so here is what grew since the first cut:

- Real **Hyperswarm DHT discovery** replaced localhost TCP. Peers and jurors now find each other on the DHT with no address to configure.
- The feed became a **deterministic reducer** (indexed Hyperbee view) with documented invariants, plus **anti-spoofing**: a bet is accepted only if its author key matches the peer that sent it.
- **All signing moved to WDK**, jury verdicts included, proven byte-identical to the previous path so on-chain `ecrecover` is unaffected.
- **CI + coverage**: GitHub Actions runs the suite and a secrets-free contract compile on every push. Coverage is about 92% of the core packages.
- **`npm run jury:demo`**: one command loads the real Qwen3-4B and grades tricky fixtures on-device, 5 of 5 correct including a 2-1 scoreline that flips a smaller model.
- **Speech-to-bet**: tap the mic and say the bet. On-device Whisper (base.en) transcribes straight into the same parse pipeline. No audio leaves the machine.
- **Encrypted feed**: every Autobase block is encrypted with a group secret, so knowing where the group meets is not enough to read the pots.
- **Live-streaming composer**: the parse streams token by token into the UI, and retyping cancels the stale run on the model.
- **WDK-native allowances**: the ERC-20 approve now goes through WDK's first-class `approve()` instead of hand-encoded calldata.
- Test count grew from 38 to **49**, including multi-peer convergence, partition-recovery, and feed-encryption tests.

## What is real (not mocked)

- Multi-process P2P over the Hyperswarm DHT between separate peer and juror daemons, encrypted end to end
- On-chain USDT movement on **Base Sepolia** (MockUSDT + Escrow.sol)
- On-device inference for speech, parse, and jury (cpu config)
- 49 passing tests, ~92% coverage, CI green on push

Deployed on Base Sepolia (chain 84532):

- Escrow: `0xc98aC5F473FfAA871f66A09c6cCb1c8D95579DD8`
- MockUSDT: `0x6C93725DFaBE02410a76ea3504579588A49a90B2`

## Honest limits

- Desktop Electron shell (phone-shaped window), not a mobile app
- Testnet only, not mainnet or real-money gambling
- Fixed two-sided pots (no odds, no house edge, no multi-way markets)
- Jury trust model is honest-majority across three peers
- Only remote services used: football-data.org and a Base Sepolia RPC

## Try it

Fastest reviewer path with pass/fail gates, most of it with no wallet or funds: [Judge in 5 minutes](judge-in-5-minutes.md).

```bash
git clone https://github.com/ajanaku1/punt.git
cd punt && npm install --registry=https://registry.npmjs.org
npm test              # 49 tests
npm run jury:demo     # real on-device jury grades tricky fixtures
node scripts/fund-wallets.js
# fund CREATOR + JOINER with Base Sepolia ETH
node scripts/deploy.js
npm run demo          # two phones + three jurors
```

## Links

- Repo: https://github.com/ajanaku1/punt
- Landing: https://punt-ten.vercel.app
