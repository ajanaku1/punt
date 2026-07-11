/**
 * Punt peer daemon — one per user. Owns the three pillars for this peer:
 * the Autobase feed, the WDK wallet, and the local QVAC LLM. The Electron
 * renderer is dumb chrome that talks to this over localhost JSON — no native
 * modules ever load inside Electron.
 *
 * Transport: by default peers discover each other on the Hyperswarm DHT via
 * the feed's discovery key — no host:port anywhere. Set PUNT_FEED_LOCAL=1 to
 * use the deterministic localhost-TCP path instead (offline demo / tests).
 *
 * Env: PUNT_ROLE=CREATOR|JOINER, PUNT_UI_PORT. PUNT_FEED_LISTEN marks the
 * bootstrapper (boots a new feed, saves FEED_KEY to .env); everyone else joins
 * the feed in FEED_KEY. In PUNT_FEED_LOCAL mode PUNT_FEED_LISTEN is the TCP
 * port and PUNT_FEED_CONNECT is the host:port to dial.
 */
import http from "node:http";
import net from "node:net";
import { join } from "node:path";
import crypto from "hypercore-crypto";
import { ethers } from "ethers";
import { createFeed } from "@punt/feed/feed.js";
import { joinFeedSwarm } from "@punt/feed/swarm.js";
import { validateBet, betHash } from "@punt/shared/bet.js";
import { buildParseHistory, extractBetDraft } from "@punt/shared/parse.js";
import { startLocalLlm, startWhisper, cancelRun } from "@punt/shared/llm.js";
import { settlementConfigFromEnv, signingAccount, usdtBalance } from "@punt/shared/wdk.js";
import { majorityWinner } from "@punt/shared/verdict.js";
import { readEnvFile, writeEnvFile, ROOT } from "../../scripts/env-file.js";

const role = process.env.PUNT_ROLE ?? "CREATOR";
const uiPort = Number(process.env.PUNT_UI_PORT ?? 9701);
const env = Object.fromEntries(await readEnvFile());
const cfg = settlementConfigFromEnv(env);

const JURY_GRACE_MS = 6 * 3600 * 1000; // refund only opens well after the jury window

// ---- pillars ------------------------------------------------------------

const localTransport = !!process.env.PUNT_FEED_LOCAL;
const isBootstrap = !!process.env.PUNT_FEED_LISTEN;

const feed = await (async () => {
  const storage = join(ROOT, ".stores", role.toLowerCase());
  // FEED_SECRET encrypts every block: the feed key says WHERE the group meets,
  // the secret says WHO can read the pots. Both are handed to friends via .env.
  if (isBootstrap && !env.FEED_SECRET) env.FEED_SECRET = crypto.randomBytes(32).toString("hex");
  const encryptionKey = Buffer.from(env.FEED_SECRET, "hex");
  const f = isBootstrap
    ? await createFeed({ storage, encryptionKey })
    : await createFeed({ storage, key: Buffer.from(env.FEED_KEY, "hex"), encryptionKey });
  if (isBootstrap) {
    const map = await readEnvFile();
    map.set("FEED_KEY", f.key.toString("hex"));
    map.set("FEED_SECRET", env.FEED_SECRET);
    await writeEnvFile(map);
  }

  if (!localTransport) {
    joinFeedSwarm(f); // real Hyperswarm DHT discovery — default
    return f;
  }

  // PUNT_FEED_LOCAL: deterministic localhost TCP for offline demo / tests.
  if (isBootstrap) {
    const server = net.createServer((sock) => {
      const rep = f.replicate(false);
      sock.pipe(rep).pipe(sock);
      sock.on("error", () => {});
    });
    server.listen(Number(process.env.PUNT_FEED_LISTEN), "127.0.0.1");
  } else {
    const [host, port] = (process.env.PUNT_FEED_CONNECT ?? "127.0.0.1:9471").split(":");
    (function connect() {
      const sock = net.connect(Number(port), host, () => {
        const rep = f.replicate(true);
        sock.pipe(rep).pipe(sock);
      });
      sock.on("error", () => {});
      sock.on("close", () => setTimeout(connect, 1500)); // peers come and go; keep dialing
    })();
  }
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
  return waitFor(hash, label);
}

async function waitFor(hash, label) {
  const rcpt = await provider.waitForTransaction(hash);
  if (rcpt.status !== 1) throw new Error(`${label} reverted (${hash})`);
  return hash;
}

/** Escrow allowance via WDK's first-class approve (handles the USDT allowance-reset rule). */
async function approveStake(units) {
  const { hash } = await account.approve({ token: cfg.usdtContract, spender: cfg.escrowContract, amount: units });
  return waitFor(hash, "approve");
}

const toUnits = (usdt) => BigInt(Math.round(usdt * 1e6));

const potCache = new Map(); // betId → { info, refreshedAt }
async function potInfo(betId) {
  const cached = potCache.get(betId);
  if (cached && Date.now() - cached.refreshedAt < 4000) return cached.info;
  const pot = await escrowRead.pots("0x" + betId).catch(() => null);
  let info = { status: "unfunded", creator: null, joiner: null };
  if (pot && pot.creator !== ethers.ZeroAddress) {
    const status = pot.closed ? "settled" : pot.joiner !== ethers.ZeroAddress ? "matched" : "open";
    info = { status, creator: pot.creator, joiner: pot.joiner === ethers.ZeroAddress ? null : pot.joiner };
  }
  potCache.set(betId, { info, refreshedAt: Date.now() });
  return info;
}
const potStatus = async (betId) => (await potInfo(betId)).status;

function majorityVerdictWinner(verdicts) {
  const tally = new Map();
  for (const v of verdicts) tally.set(v.winner, (tally.get(v.winner) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function stateSnapshot() {
  const bets = await feed.listBets();
  const withStatus = await Promise.all(
    bets.map(async (bet) => {
      const id = betHash(bet);
      const verdicts = (await feed.listVerdicts(id)).map(({ juror, winner, reasoning }) => ({ juror, winner, reasoning }));
      const pot = await potInfo(id);
      return {
        ...bet,
        betId: id,
        potStatus: pot.status,
        mine: bet.payout === myAddress,
        joinedByMe: pot.joiner === myAddress,
        winnerAddress: pot.status === "settled" ? majorityVerdictWinner(verdicts) : null,
        verdicts,
      };
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
    peerKey: feed.localKey.toString("hex"),
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
  await approveStake(stake);
  await sendAndWait(cfg.escrowContract, escrowAbi.encodeFunctionData("create", ["0x" + betId, stake, jurors, deadline]), "create pot");
  await feed.postBet(bet);
  return { betId };
}

async function joinBet(betId, stake) {
  const units = toUnits(stake);
  await approveStake(units);
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

// speech-to-bet: Whisper loads lazily on first use (~80MB registry fetch),
// so peers who never touch the mic never pay for it
let whisperPromise = null;
const getWhisper = () => (whisperPromise ??= startWhisper());

const routes = {
  "GET /state": () => stateSnapshot(),
  "POST /post": (draft) => postBet(draft),
  "POST /join": ({ betId, stake }) => joinBet(betId, stake),
  "POST /transcribe": async ({ audio }) => {
    const stt = await getWhisper();
    const text = await stt.transcribe(Buffer.from(audio, "base64"));
    return { text: text.trim() };
  },
};

// The composer parse streams over SSE: the user watches the on-device model
// write the bet terms token by token. Latest-wins — a retype cancels the
// in-flight run on the model instead of letting it burn to completion.
let activeParseId = null;
async function handleParse(req, res) {
  const { text } = await readBody(req);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "access-control-allow-origin": "*",
  });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (!llm) {
    emit("error", { error: "model still loading" });
    return res.end();
  }
  if (activeParseId) cancelRun(activeParseId); // stale parse — the user retyped
  let myId = null;
  try {
    const raw = await llm.run(buildParseHistory(text), llm.betDraftSchema, {
      onStart: (id) => (activeParseId = myId = id),
      onDelta: (soFar) => emit("delta", { text: soFar }),
    });
    const d = extractBetDraft(raw);
    if (!d.ok) throw new Error(d.error);
    emit("done", { ...d.draft, text });
  } catch (err) {
    // a cancelled run just goes quiet; only real failures reach the composer
    if (!/cancel/i.test(err.message ?? "")) emit("error", { error: err.message });
  } finally {
    if (activeParseId === myId) activeParseId = null;
    res.end();
  }
}

http
  .createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/parse") return handleParse(req, res).catch(() => res.end());
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

// release the models + feed cleanly on shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    const whisper = await whisperPromise?.catch(() => null);
    await Promise.allSettled([llm?.close(), whisper?.close(), feed.close()]);
    process.exit(0);
  });
}
