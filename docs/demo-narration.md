# Punt — demo video narration (≤3 min)

Target: 2:45. Real screen recordings only — two Electron phones side by side,
terminal with juror logs below. No mockups.

---

## Beat 1 — the hook (0:00–0:20)

**Screen:** both phones idle on Home, ticker scrolling "NO BOOKIE · NO SERVER".

> Every betting app is a company. It hosts the markets, settles them, and takes
> a cut. Punt is a football bet between friends where the company can't exist —
> because there's no server anywhere. Watch.

## Beat 2 — call your shot (0:20–0:55)

**Screen:** creator phone. Press +, type a bet on a real finished World Cup
match, e.g. "Spain beat Austria yesterday, 3 on it". The local model reads it
back; flags show anything it guessed.

> I type my bet the way I'd say it in the group chat. An AI running on my own
> machine — Tether's QVAC, no cloud — turns it into terms a jury can grade,
> and flags anything it had to guess. When I post, my three test-USDT lock
> into an escrow contract, paid from a wallet only I hold the keys to.

## Beat 3 — the feed is the network (0:55–1:25)

**Screen:** the card appears on the joiner phone. Swipe right. Toast shows the
stake locking; ticker on both phones updates.

> That bet just travelled peer-to-peer over an Autobase feed — Pears tech,
> the same stack as Keet. No backend saw it, because there is no backend.
> My friend swipes right, her wallet matches my stake, and the pot now holds
> both stakes on-chain. Junk bets never get this far: every peer validates
> the schema before acknowledging, so spam dies at the door.

## Beat 4 — the jury (1:25–2:15)

**Screen:** terminal. Three juror processes print verdicts one by one, each
citing the 3-0 score. Cut to the escrow settle line, then the winner's phone:
balance jumps, History shows WON with the jury's reasoning.

> Settlement is where every "decentralized" betting app quietly phones home to
> an oracle. Punt doesn't. Three peers each fetch the official result and grade
> the bet with their own on-device model, at temperature zero. Each signs its
> verdict and gossips it over the same feed. Two matching signatures release
> the pot — the contract checks the jury's cryptography itself. Spain won 3-0,
> the jury agrees, and the winner's USDT lands in her wallet.

## Beat 5 — close (2:15–2:45)

**Screen:** History tab with the settled bet + reasoning, then both phones side
by side; end card with repo URL.

> A bet posted in plain English, matched with a swipe, settled by a jury of
> machines that answer to no one. Pears moves the bets, QVAC is the brain,
> WDK holds the money. No bookmaker, no server, no oracle. That's Punt.

---

## Recording checklist

- [ ] `npm run demo` with a fresh `.stores` (clean feeds, no leftover bets)
- [ ] Bet on a real match finished within the last 2 days (check
      football-data before recording so the jury settles on camera)
- [ ] Terminal font ≥16pt, dark theme matching the phones
- [ ] Capture at 1080p+; phones side by side, terminal below or on a cut
- [ ] One junk-bet shot for Beat 3 (run `node scripts/junk-check.js` in the
      terminal, show the PASS line)
- [ ] Balances visible before and after settlement
