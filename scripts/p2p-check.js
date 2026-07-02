/**
 * Phase 0 proof: a bet posted from process B appears validated in process A.
 * Two real OS processes, each with its own Corestore, replicating the
 * Autobase feed over a direct peer socket.
 *
 * Run: node scripts/p2p-check.js
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeed } from "@punt/feed/feed.js";

const SELF = fileURLToPath(import.meta.url);
const role = process.argv[2];

const bet = {
  type: "bet",
  creator: "b".repeat(64),
  text: "France beat Brazil, 5 USDT — posted from process B",
  match: { home: "France", away: "Brazil", kickoff: "2026-07-05T19:00:00Z" },
  market: "result",
  selection: "France win",
  stake: 5,
  resolution: "France beat Brazil at full time per official result",
  createdAt: Date.now(),
};

if (role === "indexer") {
  const feed = await createFeed({ storage: await mkdtemp(join(tmpdir(), "punt-idx-")) });
  const server = net.createServer((sock) => {
    const rep = feed.replicate(false);
    sock.pipe(rep).pipe(sock);
    sock.on("error", () => {});
  });
  server.listen(0, "127.0.0.1", () => {
    console.log(`READY ${feed.key.toString("hex")} ${server.address().port}`);
  });
  for (;;) {
    const bets = await feed.listBets();
    if (bets.length > 0) {
      console.log(`VALIDATED ${JSON.stringify(bets[0])}`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
} else if (role === "peer") {
  const [key, port] = [process.argv[3], Number(process.argv[4])];
  const feed = await createFeed({
    storage: await mkdtemp(join(tmpdir(), "punt-peer-")),
    key: Buffer.from(key, "hex"),
  });
  const sock = net.connect(port, "127.0.0.1", () => {
    const rep = feed.replicate(true);
    sock.pipe(rep).pipe(sock);
  });
  sock.on("error", () => {});
  await feed.postBet(bet);
  console.log("POSTED");
  setTimeout(() => process.exit(0), 15000); // stay alive while the indexer converges
} else {
  // orchestrator: spawn both, assert the indexer validates B's bet
  const indexer = spawn(process.execPath, [SELF, "indexer"], { stdio: ["ignore", "pipe", "inherit"] });
  let peer;
  const timeout = setTimeout(() => {
    console.error("FAIL: timed out");
    indexer.kill();
    peer?.kill();
    process.exit(1);
  }, 30000);

  indexer.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.startsWith("READY ")) {
        const [, key, port] = line.split(" ");
        peer = spawn(process.execPath, [SELF, "peer", key, port], { stdio: ["ignore", "inherit", "inherit"] });
      } else if (line.startsWith("VALIDATED ")) {
        console.log("PASS: bet posted from process B validated in process A");
        console.log(line.slice("VALIDATED ".length));
        clearTimeout(timeout);
        peer?.kill();
        process.exit(0);
      }
    }
  });
}
