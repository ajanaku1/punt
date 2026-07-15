# Judge Punt in 5 minutes

A reproducible walk-through for a code reviewer. Tier 0 needs no install. Tier 1 needs no wallet. Tier 2 runs the full on-chain cycle.

## Two things nothing else in the field does

1. **All three Tether stacks are load-bearing.** Remove Pears, QVAC, or WDK and the app stops working.
2. **On-device AI jury verdicts are verified on-chain.** 2-of-3 WDK signatures; `Escrow.settle` checks them with `ecrecover`.

## Deployed contracts (Base Sepolia, chain 84532)

| Contract | Address | Explorer |
|----------|---------|----------|
| Escrow | `0xc98aC5F473FfAA871f66A09c6cCb1c8D95579DD8` | https://sepolia.basescan.org/address/0xc98aC5F473FfAA871f66A09c6cCb1c8D95579DD8 |
| MockUSDT | `0x6C93725DFaBE02410a76ea3504579588A49a90B2` | https://sepolia.basescan.org/address/0x6C93725DFaBE02410a76ea3504579588A49a90B2 |
| PuntUSDT (EIP-3009) | `0x41fD722Bc53426fA2a13b42a3dDF82569E870374` | https://sepolia.basescan.org/address/0x41fD722Bc53426fA2a13b42a3dDF82569E870374 |

## Golden on-chain flow (zero install)

One real create → join → settle cycle on the deployed Escrow. Open each hash on Basescan.

| Step | Method | Transaction |
|------|--------|-------------|
| Create pot | `create` | [0x98e6dab9…dfaad0](https://sepolia.basescan.org/tx/0x98e6dab9f0c2165d9b4faabf1632a1644e4d944c933cedc10c4c2ad31cdfaad0) |
| Join pot | `join` | [0x9e775918…7518d5](https://sepolia.basescan.org/tx/0x9e775918b238c4af0e6289337a115a0445bd5736bf90a0027b2337e9fb7518d5) |
| Settle 2/3 | `settle` | [0x403b1dec…f9e6ae](https://sepolia.basescan.org/tx/0x403b1dec9c0e8f6c72e59efe58840c1353dfb26dc83d7be5daf1059903f9e6ae) |

The settle transaction is the differentiator: jury signatures verified by the contract before USDT moves. Full history: [Escrow txs](https://sepolia.basescan.org/address/0xc98aC5F473FfAA871f66A09c6cCb1c8D95579DD8).

## Setup (30 seconds)

```bash
git clone https://github.com/ajanaku1/punt.git && cd punt
npm install --registry=https://registry.npmjs.org
```

## Tier 1: no wallet, no funds

Each command is one line. Expected result and the pass gate are listed next to it.

| # | Command | What it proves | Pass gate |
|---|---------|----------------|-----------|
| 1 | `npm test` | Schema, feed reducer + encryption, escrow, parse, verdicts, WDK signing, DHT wiring, multi-peer convergence, verdict edge cases | `tests 68 / pass 68 / fail 0`. Escrow tests need Foundry's `anvil`. |
| 2 | `npm run compile` | Contracts compile with no RPC and no keys | Prints `MockUSDT compiled`, `Escrow compiled`, `PuntUSDT compiled` |
| 3 | `npm run coverage` | Line and branch coverage | `feed.js` 100%, overall about 92% statements |
| 4 | `npm run jury:demo` | The settlement jury is real on-device AI. Qwen3 4B grades five tricky fixtures at temperature 0 | `5/5 verdicts correct` |
| 5 | `node scripts/junk-check.js` | Junk and impersonation never reach the feed view | Only the valid bet appears |
| 6 | `node scripts/p2p-check.js` | Two separate processes replicate over Autobase | The bet posted by one process appears in the other |
| 7 | `npm run demo:all` | All three stacks boot in one command | Pears feed, QVAC jury, WDK stake print labeled stages |

## Tier 2: full on-chain cycle

Needs a little Base Sepolia ETH in two wallets. Jurors never need gas.

```bash
node scripts/fund-wallets.js       # writes 5 wallets to a gitignored .env, prints addresses
# fund CREATOR + JOINER from https://www.alchemy.com/faucets/base-sepolia
node scripts/deploy.js             # deploy MockUSDT + Escrow, mint 100 test USDT to each player
# add FOOTBALL_DATA_KEY=<free key from football-data.org> to .env
npm run demo:judge                 # two phones + three jurors + printed checklist
# venue Wi-Fi killing DHT?  PUNT_FEED_LOCAL=1 npm run demo:judge
```

Follow the checklist printed in the terminal. Creator posts a bet on a finished match → joiner swipes right → jurors print VERDICT → settle toast shows Basescan link. Stack HUD under the ticker shows Pears / QVAC / WDK live.

## What to look at in the code

| Claim | Where |
|-------|-------|
| Peers discover on the Hyperswarm DHT, not localhost | `packages/feed/swarm.js`, wired in `packages/app/peer.js` and `packages/juror/index.js` |
| The feed is a deterministic reducer with anti-spoofing | `packages/feed/feed.js` (invariants I1 to I4 in the header) |
| Every signature is WDK-native, stakes and jury alike | `packages/app/peer.js` (`account.sendTransaction`) and `packages/juror/index.js` (`signingAccount`) |
| Jury verdicts are verified on-chain by 2-of-3 ecrecover | `contracts/Escrow.sol` `settle`, matched by `packages/shared/verdict.js` |

## Pass/fail summary

- [ ] `npm test` reports 68 passing
- [ ] `npm run compile` succeeds with no RPC or keys
- [ ] `npm run jury:demo` reports 5/5 correct on-device verdicts
- [ ] `node scripts/junk-check.js` rejects junk
- [ ] Golden settle tx opens on Basescan (`0x403b1dec…`)
- [ ] PuntUSDT deployment verified on Basescan (`0x41fD72…`)
- [ ] `docs/adr/` contains 7 architecture decision records
- [ ] Stack HUD shows Pears peer count + identity, QVAC ready, WDK last tx after a stake
