# Judge Punt in 5 minutes

A reproducible walk-through for a code reviewer. Tier 1 needs no wallet, no funds, and no keys. Tier 2 runs the full on-chain cycle. On-chain evidence is linked at the bottom, so you can verify the contracts without running anything.

## Deployed contracts (Base Sepolia, chain 84532)

| Contract | Address | Explorer |
|----------|---------|----------|
| Escrow | `0xc98aC5F473FfAA871f66A09c6cCb1c8D95579DD8` | https://sepolia.basescan.org/address/0xc98aC5F473FfAA871f66A09c6cCb1c8D95579DD8 |
| MockUSDT | `0x6C93725DFaBE02410a76ea3504579588A49a90B2` | https://sepolia.basescan.org/address/0x6C93725DFaBE02410a76ea3504579588A49a90B2 |

The contract pages list every create, join, and settle transaction, so the on-chain activity is verifiable directly from the explorer.

## Setup (30 seconds)

```bash
git clone https://github.com/ajanaku1/punt.git && cd punt
npm install --registry=https://registry.npmjs.org
```

## Tier 1: no wallet, no funds

Each command is one line. Expected result and the pass gate are listed next to it.

| # | Command | What it proves | Pass gate |
|---|---------|----------------|-----------|
| 1 | `npm test` | Schema, feed reducer + encryption, escrow (2-of-3 and refund), parse, verdicts, WDK signing, DHT wiring, multi-peer convergence | `tests 49 / pass 49 / fail 0`. Escrow tests need Foundry's `anvil` on the path. |
| 2 | `npm run compile` | Contracts still compile with no RPC and no keys | Prints `MockUSDT compiled` and `Escrow compiled` |
| 3 | `npm run coverage` | Line and branch coverage of the core packages | `feed.js` 100%, overall about 92% statements |
| 4 | `npm run jury:demo` | The settlement jury is real on-device AI. Loads Qwen3 4B (about 2.3GB on first run) and grades five tricky fixtures at temperature 0, including a 2-1 scoreline that flips a smaller model | `5/5 verdicts correct` |
| 5 | `node scripts/junk-check.js` | Junk and impersonation never reach the feed view | Only the valid bet appears |
| 6 | `node scripts/p2p-check.js` | Two separate processes replicate over Autobase | The bet posted by one process appears in the other |

## Tier 2: full on-chain cycle

Needs a little Base Sepolia ETH in two wallets. Jurors never need gas.

```bash
node scripts/fund-wallets.js       # writes 5 wallets to a gitignored .env, prints addresses
# fund CREATOR + JOINER from https://www.alchemy.com/faucets/base-sepolia
node scripts/deploy.js             # deploy MockUSDT + Escrow, mint 100 test USDT to each player
# add FOOTBALL_DATA_KEY=<free key from football-data.org> to .env
npm run demo                       # two phones + three jurors, all separate processes
```

Then on the creator phone, post a bet on a recently finished real match. Swipe right on the joiner phone. Watch the three jurors grade with their own local model and sign. The winner's USDT balance rises by the whole pot, and the settle transaction appears on the Escrow contract page above.

## What to look at in the code

| Claim | Where |
|-------|-------|
| Peers discover on the Hyperswarm DHT, not localhost | `packages/feed/swarm.js`, wired in `packages/app/peer.js` and `packages/juror/index.js` |
| The feed is a deterministic reducer with anti-spoofing | `packages/feed/feed.js` (invariants I1 to I4 in the header) |
| Every signature is WDK-native, stakes and jury alike | `packages/app/peer.js` (`account.sendTransaction`) and `packages/juror/index.js` (`signingAccount`) |
| Jury verdicts are verified on-chain by 2-of-3 ecrecover | `contracts/Escrow.sol` `settle`, matched by `packages/shared/verdict.js` |

## Pass/fail summary

- [ ] `npm test` reports 49 passing
- [ ] `npm run compile` succeeds with no RPC or keys
- [ ] `npm run jury:demo` reports 5/5 correct on-device verdicts
- [ ] `node scripts/junk-check.js` rejects junk
- [ ] The Escrow contract page shows real create, join, and settle transactions
