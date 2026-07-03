/**
 * Spam-defense proof: a junk bet appended by a non-writer peer is rejected by
 * every indexer's schema validation and never reaches anyone's swipe stack.
 *
 * Run: node scripts/junk-check.js
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeed } from "@punt/feed/feed.js";

const a = await createFeed({ storage: await mkdtemp(join(tmpdir(), "punt-junk-a-")) });
const b = await createFeed({ storage: await mkdtemp(join(tmpdir(), "punt-junk-b-")), key: a.key });
const s1 = a.replicate(true);
const s2 = b.replicate(false);
s1.pipe(s2).pipe(s1);

console.log("peer B appends three messages: two junk, one valid bet…");
await b.base.append({ type: "bet", text: "free money click here", stake: 999999999 }, { optimistic: true });
await b.base.append({ type: "spam", lol: true }, { optimistic: true });
await b.postBet({
  type: "bet",
  creator: "b".repeat(64),
  text: "France beat Brazil, 5 USDT",
  match: { home: "France", away: "Brazil", kickoff: "2026-07-05T19:00:00Z" },
  market: "result",
  selection: "France win",
  stake: 5,
  resolution: "France beat Brazil at full time per the official result",
  createdAt: Date.now(),
});

const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  const bets = await a.listBets();
  if (bets.length >= 1) {
    console.log(`peer A's feed contains ${bets.length} bet(s):`);
    for (const bet of bets) console.log("  ✓", bet.text);
    console.log(bets.length === 1 ? "PASS: junk never landed — validation acked only the real bet" : "FAIL: junk got through");
    process.exit(bets.length === 1 ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 200));
}
console.log("FAIL: nothing replicated");
process.exit(1);
