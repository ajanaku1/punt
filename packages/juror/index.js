/**
 * Juror daemon - one of the three peers whose local LLMs settle bets.
 * Watches the feed for matched bets whose match has finished, grades the
 * resolution against football-data.org with its own on-device model at
 * temperature 0, signs the verdict with its EVM key, and gossips it back
 * over the same feed. It never holds stakes and never needs gas.
 *
 * Transport: joins the feed on the Hyperswarm DHT by default; set
 * PUNT_FEED_LOCAL=1 to dial the localhost TCP feed instead (offline demo/tests).
 *
 * Env: PUNT_JUROR=1|2|3. PUNT_FEED_CONNECT=host:port used only in local mode.
 */
import { join } from "node:path";
import { ethers } from "ethers";
import net from "node:net";
import { createFeed } from "@punt/feed/feed.js";
import { joinFeedSwarm } from "@punt/feed/swarm.js";
import { betHash } from "@punt/shared/bet.js";
import { startLocalLlm, MODELS } from "@punt/shared/llm.js";
import { signVerdict } from "@punt/shared/verdict.js";
import { settlementConfigFromEnv, signingAccount } from "@punt/shared/wdk.js";
import { loadOrCreateIdentity } from "@punt/shared/identity.js";
import { buildGradeHistory, extractGrade, GRADE_SCHEMA } from "./grade.js";
import { footballData } from "./football.js";
import { readEnvFile, ROOT } from "../../scripts/env-file.js";

const n = process.env.PUNT_JUROR ?? "1";
const env = Object.fromEntries(await readEnvFile());
const log = (...a) => console.log(`[juror ${n}]`, ...a);

// Verdicts are signed by a self-custodial WDK account (same stack as the
// stakes) - so every signature in Punt, money and jury alike, is WDK-native.
const account = await signingAccount(env[`JUROR${n}_MNEMONIC`], settlementConfigFromEnv(env));
const jurorAddress = await account.getAddress();

if (!env.FOOTBALL_DATA_KEY) {
  console.error(`[juror ${n}] FOOTBALL_DATA_KEY missing from .env - cannot grade without official results`);
  process.exit(1);
}
// FOOTBALL_DATA_URL override exists for local pipeline testing only - the real
// demo runs against api.football-data.org
const results = footballData(env.FOOTBALL_DATA_KEY, fetch, env.FOOTBALL_DATA_URL || undefined);

const provider = new ethers.JsonRpcProvider(env.RPC_URL, undefined, { cacheTimeout: -1 });
const escrow = new ethers.Contract(
  env.ESCROW_CONTRACT,
  ["function pots(bytes32) view returns (address creator, address joiner, uint256 stake, uint64 deadline, bool closed)"],
  provider,
);
const chainId = BigInt(env.CHAIN_ID ?? 84532);

const feed = await createFeed({
  storage: join(ROOT, ".stores", `juror${n}`),
  key: Buffer.from(env.FEED_KEY, "hex"),
  encryptionKey: env.FEED_SECRET ? Buffer.from(env.FEED_SECRET, "hex") : null, // group secret - jurors read the pots too
});
if (process.env.PUNT_FEED_LOCAL) {
  const [host, port] = (process.env.PUNT_FEED_CONNECT ?? "127.0.0.1:9471").split(":");
  (function connect() {
    const sock = net.connect(Number(port), host, () => {
      const rep = feed.replicate(true);
      sock.pipe(rep).pipe(sock);
    });
    sock.on("error", () => {});
    sock.on("close", () => setTimeout(connect, 1500));
  })();
} else {
  joinFeedSwarm(feed); // real Hyperswarm DHT discovery - default
}

const jurorIdentity = await loadOrCreateIdentity(join(ROOT, ".stores", `juror${n}`));
log(`identity ${jurorIdentity.fingerprint}`);

log("loading local model…");
const llm = await startLocalLlm({ model: MODELS.judge, onProgress: () => {} });
log(`ready - signing as ${jurorAddress}  identity ${jurorIdentity.fingerprint}`);

// release the model + feed cleanly on shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await Promise.allSettled([llm.close(), feed.close()]);
    process.exit(0);
  });
}

async function gradeBet(bet, betId, pot) {
  const evidence = await results.findFinished(bet.match.home, bet.match.away, bet.match.kickoff);
  if (!evidence) return log(`no finished match yet for ${bet.match.home} v ${bet.match.away}`);

  const raw = await llm.run(buildGradeHistory(bet, evidence), GRADE_SCHEMA);
  const grade = extractGrade(raw);
  if (!grade.ok) return log(`grade unusable (${grade.error}) - abstaining`);

  const winner = grade.creatorWins ? pot.creator : pot.joiner;
  const sig = await signVerdict(account, { chainId, escrow: env.ESCROW_CONTRACT, betId: "0x" + betId, winner });
  await feed.postVerdict({ type: "verdict", betId, winner, juror: jurorAddress, sig, reasoning: grade.reasoning });
  log(`VERDICT on ${betId.slice(0, 12)}…: creator ${grade.creatorWins ? "WINS" : "LOSES"} - ${grade.reasoning}`);
}

const graded = new Set();
for (;;) {
  try {
    for (const bet of await feed.listBets()) {
      const betId = betHash(bet);
      if (graded.has(betId)) continue;
      if (Date.parse(bet.match.kickoff) > Date.now()) continue; // not kicked off yet
      const mine = (await feed.listVerdicts(betId)).some((v) => v.juror === jurorAddress);
      if (mine) { graded.add(betId); continue; }
      const pot = await escrow.pots("0x" + betId);
      if (pot.creator === ethers.ZeroAddress || pot.joiner === ethers.ZeroAddress || pot.closed) continue;
      await gradeBet(bet, betId, pot);
      graded.add(betId);
    }
  } catch (err) {
    log("watch error:", err.message);
  }
  await new Promise((r) => setTimeout(r, 15000));
}
