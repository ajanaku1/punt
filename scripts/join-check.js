/**
 * Phase 0 proof: real testnet USDT moves into an escrow pot, with every
 * value movement signed by a self-custodial WDK wallet — native approve()
 * for allowances, sendTransaction + calldata for escrow calls. No ethers
 * signers anywhere in the journey.
 *
 * Run: node scripts/join-check.js
 */
import { ethers } from "ethers";
import { betHash } from "@punt/shared/bet.js";
import { settlementConfigFromEnv, signingAccount, readOnlyAccount, usdtBalance } from "@punt/shared/wdk.js";
import { readEnvFile } from "./env-file.js";

const env = Object.fromEntries(await readEnvFile());
const cfg = settlementConfigFromEnv(env);

const escrowAbi = new ethers.Interface([
  "function create(bytes32,uint256,address[3],uint64)",
  "function join(bytes32)",
]);

const creator = await signingAccount(env.CREATOR_MNEMONIC, cfg);
const joiner = await signingAccount(env.JOINER_MNEMONIC, cfg);
const escrowWatch = readOnlyAccount(cfg.escrowContract, cfg);

const bet = {
  type: "bet",
  creator: "a".repeat(64),
  text: "France beat Brazil, 5 USDT",
  match: { home: "France", away: "Brazil", kickoff: "2026-07-05T19:00:00Z" },
  market: "result",
  selection: "France win",
  stake: 5,
  resolution: "France beat Brazil at full time per official result",
  createdAt: Date.now(),
};
const betId = "0x" + betHash(bet);
const stake = 5_000_000n; // 5 USDT, 6 decimals
const jurors = [env.JUROR1_ADDRESS, env.JUROR2_ADDRESS, env.JUROR3_ADDRESS];
const deadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);

console.log("betId:", betId);
console.log("escrow USDT before:", await usdtBalance(escrowWatch, cfg));

const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, undefined, { cacheTimeout: -1, pollingInterval: 500 });

async function mined(pending, label) {
  const { hash, fee } = await pending;
  const rcpt = await provider.waitForTransaction(hash); // WDK returns at submission; the next call needs this mined
  if (rcpt.status !== 1) throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: ${hash} (fee ${fee})`);
}

const send = (account, to, data, label) => mined(account.sendTransaction({ to, data }), label);
const approve = (account, label) =>
  mined(account.approve({ token: cfg.usdtContract, spender: cfg.escrowContract, amount: stake }), label);

await approve(creator, "creator approve");
await send(creator, cfg.escrowContract, escrowAbi.encodeFunctionData("create", [betId, stake, jurors, deadline]), "creator create");
await approve(joiner, "joiner approve ");
await send(joiner, cfg.escrowContract, escrowAbi.encodeFunctionData("join", [betId]), "joiner join   ");

const after = await usdtBalance(escrowWatch, cfg);
console.log("escrow USDT after:", after);
console.log(after >= 2n * stake ? "PASS: both stakes are in the pot, moved by WDK wallets" : "FAIL: pot not funded");
