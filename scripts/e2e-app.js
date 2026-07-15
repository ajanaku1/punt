/**
 * End-to-end app flow (scripted, no Electron):
 *   creator peer → post bet → joiner peer matches stake → 3 QVAC jurors grade
 *   → winner settles on-chain via 2-of-3 ecrecover.
 *
 *   node scripts/e2e-app.js
 *
 * Uses PUNT_FEED_LOCAL for a deterministic transport. Real WDK + Base Sepolia
 * + on-device jury models (must already be cached under ~/.qvac/models).
 */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ethers } from "ethers";
import { readEnvFile, ROOT } from "./env-file.js";

const CREATOR_API = "http://127.0.0.1:9701";
const JOINER_API = "http://127.0.0.1:9702";
const STAKE = 1; // USDT — keep E2E cheap
const TIMEOUT_MS = 15 * 60 * 1000; // model load + 3 jurors + chain

const children = [];
const killAll = () => {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* already dead */
    }
  }
};
process.on("exit", killAll);
process.on("SIGINT", () => {
  killAll();
  process.exit(130);
});

function log(...a) {
  console.log(`[e2e ${new Date().toISOString().slice(11, 19)}]`, ...a);
}

function spawnPeer(label, envExtra) {
  const child = spawn(process.execPath, ["packages/app/peer.js"], {
    cwd: ROOT,
    env: { ...process.env, ...envExtra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const prefix = `[${label}]`;
  child.stdout.on("data", (b) => process.stdout.write(`${prefix} ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`${prefix} ${b}`));
  child.on("exit", (code, sig) => log(`${label} exited`, code, sig ?? ""));
  return child;
}

function spawnJuror(n) {
  const child = spawn(process.execPath, ["packages/juror/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PUNT_JUROR: String(n),
      PUNT_FEED_LOCAL: "1",
      PUNT_FEED_CONNECT: "127.0.0.1:9471",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const prefix = `[juror${n}]`;
  child.stdout.on("data", (b) => process.stdout.write(`${prefix} ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`${prefix} ${b}`));
  return child;
}

async function api(base, path, body) {
  const res = await fetch(base + path, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${json.error ?? res.statusText}`);
  return json;
}

async function waitFor(fn, label, ms = TIMEOUT_MS) {
  const deadline = Date.now() + ms;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await sleep(1500);
  }
  throw new Error(`timeout waiting for ${label}${lastErr ? `: ${lastErr.message}` : ""}`);
}

// Finished WC 2026 match (Mexico 2-0 South Africa) — jury can resolve via football-data.org
const draft = {
  text: "Mexico beat South Africa, 1 on it",
  home: "Mexico",
  away: "South Africa",
  kickoff: "2026-06-11T19:00:00Z",
  market: "result",
  selection: "Mexico win",
  stake: STAKE,
  resolution: "Mexico beat South Africa at full time per the official result",
  flags: [],
};

async function main() {
  const started = Date.now();
  log("wiping .stores for a clean encrypted feed…");
  await rm(join(ROOT, ".stores"), { recursive: true, force: true });

  log("starting creator peer (local transport bootstrap)…");
  spawnPeer("creator", {
    PUNT_ROLE: "CREATOR",
    PUNT_UI_PORT: "9701",
    PUNT_FEED_LOCAL: "1",
    PUNT_FEED_LISTEN: "9471",
  });

  await waitFor(async () => {
    const s = await api(CREATOR_API, "/state");
    return s.address ? s : null;
  }, "creator /state", 180_000);
  log("creator ready");

  // re-read env so joiner/jurors pick up any FEED_KEY rewrite
  await sleep(500);

  log("starting joiner peer…");
  spawnPeer("joiner", {
    PUNT_ROLE: "JOINER",
    PUNT_UI_PORT: "9702",
    PUNT_FEED_LOCAL: "1",
    PUNT_FEED_CONNECT: "127.0.0.1:9471",
  });

  await waitFor(async () => {
    const s = await api(JOINER_API, "/state");
    return s.address ? s : null;
  }, "joiner /state", 180_000);
  log("joiner ready");

  log("starting 3 jurors (on-device Qwen3 — first ready may take a few minutes)…");
  for (const n of [1, 2, 3]) spawnJuror(n);

  const creatorBefore = await api(CREATOR_API, "/state");
  const joinerBefore = await api(JOINER_API, "/state");
  log("balances before", {
    creator: creatorBefore.usdt,
    joiner: joinerBefore.usdt,
    stack: creatorBefore.stack,
  });

  log("POST bet on creator (WDK create pot + Autobase append)…");
  const posted = await api(CREATOR_API, "/post", draft);
  log("posted", posted);

  const openOnJoiner = await waitFor(async () => {
    const s = await api(JOINER_API, "/state");
    const bet = s.bets.find((b) => b.betId === posted.betId && b.potStatus === "open");
    return bet ?? null;
  }, "bet replicated to joiner", 120_000);
  log("joiner sees open bet", openOnJoiner.betId.slice(0, 12), "peers", (await api(JOINER_API, "/state")).stack?.pears);

  log("JOIN on joiner (WDK match stake)…");
  const joined = await api(JOINER_API, "/join", { betId: posted.betId, stake: STAKE });
  log("joined", joined);

  await waitFor(async () => {
    const s = await api(CREATOR_API, "/state");
    const bet = s.bets.find((b) => b.betId === posted.betId);
    return bet?.potStatus === "matched" ? bet : null;
  }, "pot matched on creator view", 120_000);
  log("pot matched — waiting for jury + settle…");

  const settled = await waitFor(async () => {
    const s = await api(CREATOR_API, "/state");
    const bet = s.bets.find((b) => b.betId === posted.betId);
    if (!bet) return null;
    if (bet.potStatus === "settled") return { side: "creator", snap: s, bet };
    const j = await api(JOINER_API, "/state");
    const jb = j.bets.find((b) => b.betId === posted.betId);
    if (jb?.potStatus === "settled") return { side: "joiner", snap: j, bet: jb };
    // surface progress
    const v = bet.verdicts?.length ?? 0;
    if (v) log(`verdicts so far: ${v}`, bet.verdicts.map((x) => x.winner?.slice(0, 8)).join(","));
    return null;
  }, "on-chain settle", TIMEOUT_MS);

  const creatorAfter = await api(CREATOR_API, "/state");
  const joinerAfter = await api(JOINER_API, "/state");
  const winner = settled.bet.winnerAddress;
  const settleTx = settled.snap.settleEvent?.txHash ?? settled.snap.lastTx?.settle ?? settled.snap.stack?.wdk?.lastTx;

  log("SETTLED", {
    winner: winner?.slice(0, 12),
    potStatus: settled.bet.potStatus,
    verdicts: settled.bet.verdicts?.length,
    settleTx,
    explorer: settleTx ? `https://sepolia.basescan.org/tx/${settleTx}` : null,
    stack: creatorAfter.stack,
  });
  log("balances after", { creator: creatorAfter.usdt, joiner: joinerAfter.usdt });

  // pot = 2 USDT; winner should be up ~STAKE (net of nothing if they also posted)
  const creatorDelta = creatorAfter.usdt - creatorBefore.usdt;
  const joinerDelta = joinerAfter.usdt - joinerBefore.usdt;
  log("deltas USDT", { creatorDelta, joinerDelta });

  const okSettled = settled.bet.potStatus === "settled";
  const okMoney = Math.abs(creatorDelta + joinerDelta) < 0.01 && (creatorDelta > 0.5 || joinerDelta > 0.5);
  // creator bet Mexico wins → creator should win ~+1 USDT, joiner ~-1
  const expectedCreatorWin = winner?.toLowerCase() === creatorAfter.address.toLowerCase();

  console.log("\n======== E2E RESULT ========");
  console.log(okSettled ? "✓ pot settled on-chain" : "✗ pot not settled");
  console.log(okMoney ? "✓ USDT moved to a winner" : "✗ USDT balances unexpected", { creatorDelta, joinerDelta });
  console.log(expectedCreatorWin ? "✓ creator (Mexico) won as expected" : "· winner was joiner or unknown");
  console.log(creatorAfter.stack ? `✓ stack HUD payload: peers=${creatorAfter.stack.pears?.peers} qvac=${creatorAfter.stack.qvac?.parseReady} wdkTx=${!!creatorAfter.stack.wdk?.lastTx}` : "✗ no stack payload");
  console.log(`elapsed ${(Date.now() - started) / 1000}s`);
  console.log("============================\n");

  killAll();
  await sleep(1000);
  if (!okSettled || !okMoney) process.exit(1);
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err.message);
  killAll();
  process.exit(1);
});
