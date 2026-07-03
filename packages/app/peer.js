/**
 * Punt peer daemon — one per user. Owns the three pillars for this peer:
 * the Autobase feed, the WDK wallet, and the local QVAC LLM. The Electron
 * renderer is dumb chrome that talks to this over localhost JSON — no native
 * modules ever load inside Electron.
 *
 * Env: PUNT_ROLE=CREATOR|JOINER, PUNT_UI_PORT, and either PUNT_FEED_LISTEN
 * (tcp port, boots a new feed and saves FEED_KEY to .env) or PUNT_FEED_CONNECT
 * (host:port, joins the feed in FEED_KEY).
 */
import http from "node:http";
import net from "node:net";
import { join } from "node:path";
import { ethers } from "ethers";
import { createFeed } from "@punt/feed/feed.js";
import { validateBet, betHash } from "@punt/shared/bet.js";
import { buildParseHistory, extractBetDraft } from "@punt/shared/parse.js";
import { startLocalLlm } from "@punt/shared/llm.js";
import { settlementConfigFromEnv, signingAccount, usdtBalance } from "@punt/shared/wdk.js";
import { majorityWinner } from "@punt/shared/verdict.js";
import { readEnvFile, writeEnvFile, ROOT } from "../../scripts/env-file.js";

const role = process.env.PUNT_ROLE ?? "CREATOR";
const uiPort = Number(process.env.PUNT_UI_PORT ?? 9701);
const env = Object.fromEntries(await readEnvFile());
const cfg = settlementConfigFromEnv(env);

const JURY_GRACE_MS = 6 * 3600 * 1000; // refund only opens well after the jury window

// ---- pillars ------------------------------------------------------------

const feed = await (async () => {
  const storage = join(ROOT, ".stores", role.toLowerCase());
  if (process.env.PUNT_FEED_LISTEN) {
    const f = await createFeed({ storage });
    const map = await readEnvFile();
    map.set("FEED_KEY", f.key.toString("hex"));
    await writeEnvFile(map);
    const server = net.createServer((sock) => {
      const rep = f.replicate(false);
      sock.pipe(rep).pipe(sock);
      sock.on("error", () => {});
    });
    server.listen(Number(process.env.PUNT_FEED_LISTEN), "127.0.0.1");
    return f;
  }
  const f = await createFeed({ storage, key: Buffer.from(env.FEED_KEY, "hex") });
  const [host, port] = (process.env.PUNT_FEED_CONNECT ?? "127.0.0.1:9471").split(":");
  (function connect() {
    const sock = net.connect(Number(port), host, () => {
      const rep = f.replicate(true);
      sock.pipe(rep).pipe(sock);
    });
    sock.on("error", () => {});
    sock.on("close", () => setTimeout(connect, 1500)); // peers come and go; keep dialing
  })();
  return f;
})();

const account = await signingAccount(env[`${role}_MNEMONIC`], cfg);
const myAddress = await account.getAddress();
const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, undefined, { cacheTimeout: -1, pollingInterval: 500 });
const escrowRead = new ethers.Contract(
  cfg.escrowContract,
  ["function pots(bytes32) view returns (address creator, address joiner, uint256 stake, uint64 deadline, bool closed)"],
  provider,
);
const erc20 = new ethers.Interface(["function approve(address,uint256)"]);
const escrowAbi = new ethers.Interface([
  "function create(bytes32,uint256,address[3],uint64)",
  "function join(bytes32)",
  "function settle(bytes32,address,bytes[])",
]);

let llm = null;
let llmProgress = 0;
startLocalLlm({ onProgress: (p) => (llmProgress = p) })
  .then((l) => (llm = l))
  .catch((err) => console.error("LLM failed to start:", err.message));

// ---- helpers ------------------------------------------------------------

async function sendAndWait(to, data, label) {
  const { hash } = await account.sendTransaction({ to, data });
  const rcpt = await provider.waitForTransaction(hash);
  if (rcpt.status !== 1) throw new Error(`${label} reverted (${hash})`);
  return hash;
}

const toUnits = (usdt) => BigInt(Math.round(usdt * 1e6));

const potCache = new Map(); // betId → { status, refreshedAt }
async function potStatus(betId) {
  const cached = potCache.get(betId);
  if (cached && Date.now() - cached.refreshedAt < 4000) return cached.status;
  const pot = await escrowRead.pots("0x" + betId).catch(() => null);
  let status = "unfunded";
  if (pot && pot.creator !== ethers.ZeroAddress) {
    if (pot.closed) status = "settled";
    else if (pot.joiner !== ethers.ZeroAddress) status = "matched";
    else status = "open";
  }
  const entry = { status, refreshedAt: Date.now() };
  potCache.set(betId, entry);
  return status;
}

async function stateSnapshot() {
  const bets = await feed.listBets();
  const withStatus = await Promise.all(
    bets.map(async (bet) => {
      const id = betHash(bet);
      const verdicts = (await feed.listVerdicts(id)).map(({ juror, winner, reasoning }) => ({ juror, winner, reasoning }));
      return { ...bet, betId: id, potStatus: await potStatus(id), mine: bet.payout === myAddress, verdicts };
    }),
  );
  const [usdt, eth] = await Promise.all([
    usdtBalance(account, cfg).catch(() => 0n),
    provider.getBalance(myAddress).catch(() => 0n),
  ]);
  return {
    role,
    address: myAddress,
    usdt: Number(usdt) / 1e6,
    eth: ethers.formatEther(eth),
    modelReady: !!llm,
    modelProgress: llmProgress,
    feedKey: feed.key.toString("hex"),
    bets: withStatus,
  };
}

// draft → canonical bet on the feed + funded pot on-chain
async function postBet(draft) {
  const bet = {
    type: "bet",
    creator: feed.localKey.toString("hex"),
    payout: myAddress,
    text: draft.text,
    match: { home: draft.home, away: draft.away, kickoff: draft.kickoff },
    market: draft.market,
    selection: draft.selection,
    stake: draft.stake,
    resolution: draft.resolution,
    createdAt: Date.now(),
  };
  const check = validateBet(bet);
  if (!check.ok) throw new Error(check.error);

  const betId = betHash(bet);
  const stake = toUnits(bet.stake);
  // for bets on already-finished matches (the live-demo case) keep a real jury window
  const deadline = BigInt(Math.floor(Math.max(Date.parse(bet.match.kickoff) + JURY_GRACE_MS, Date.now() + JURY_GRACE_MS) / 1000));
  const jurors = [env.JUROR1_ADDRESS, env.JUROR2_ADDRESS, env.JUROR3_ADDRESS];
  await sendAndWait(cfg.usdtContract, erc20.encodeFunctionData("approve", [cfg.escrowContract, stake]), "approve");
  await sendAndWait(cfg.escrowContract, escrowAbi.encodeFunctionData("create", ["0x" + betId, stake, jurors, deadline]), "create pot");
  await feed.postBet(bet);
  return { betId };
}

async function joinBet(betId, stake) {
  const units = toUnits(stake);
  await sendAndWait(cfg.usdtContract, erc20.encodeFunctionData("approve", [cfg.escrowContract, units]), "approve");
  await sendAndWait(cfg.escrowContract, escrowAbi.encodeFunctionData("join", ["0x" + betId]), "join pot");
  potCache.delete(betId);
  return { betId };
}

// the winner watches the verdict gossip and submits the 2-of-3 settle themselves
const settled = new Set();
async function settleWatch() {
  for (const bet of await feed.listBets().catch(() => [])) {
    const betId = betHash(bet);
    if (settled.has(betId)) continue;
    if ((await potStatus(betId)) !== "matched") continue;
    const verdicts = await feed.listVerdicts(betId);
    const majority = majorityWinner(verdicts, [env.JUROR1_ADDRESS, env.JUROR2_ADDRESS, env.JUROR3_ADDRESS], {
      chainId: BigInt(cfg.chainId),
      escrow: cfg.escrowContract,
      betId: "0x" + betId,
    });
    if (!majority || majority.winner !== myAddress) continue;
    console.log(`[${role}] jury majority says we won ${betId.slice(0, 12)}… — settling`);
    try {
      await sendAndWait(
        cfg.escrowContract,
        escrowAbi.encodeFunctionData("settle", ["0x" + betId, majority.winner, majority.sigs]),
        "settle",
      );
      settled.add(betId);
      potCache.delete(betId);
      console.log(`[${role}] pot released — the winner's USDT is home`);
    } catch (err) {
      console.error(`[${role}] settle failed:`, err.message);
    }
  }
}
setInterval(() => settleWatch().catch(() => {}), 10000);

// ---- localhost API for the renderer -------------------------------------

const readBody = (req) =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
  });

const routes = {
  "GET /state": () => stateSnapshot(),
  "POST /parse": async ({ text }) => {
    if (!llm) throw new Error("model still loading");
    const raw = await llm.run(buildParseHistory(text), llm.betDraftSchema);
    const d = extractBetDraft(raw);
    if (!d.ok) throw new Error(d.error);
    return { ...d.draft, text };
  },
  "POST /post": (draft) => postBet(draft),
  "POST /join": ({ betId, stake }) => joinBet(betId, stake),
};

http
  .createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("access-control-allow-origin", "*"); // renderer loads from file://; daemon binds 127.0.0.1 only
    const handler = routes[`${req.method} ${req.url}`];
    if (!handler) {
      res.statusCode = 404;
      return res.end("{}");
    }
    try {
      res.end(JSON.stringify(await handler(await readBody(req))));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  })
  .listen(uiPort, "127.0.0.1", () => {
    console.log(`[${role}] peer daemon on http://127.0.0.1:${uiPort} — wallet ${myAddress}`);
  });
