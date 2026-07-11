import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { ethers } from "ethers";
import { compileContract as compile } from "../scripts/solc-compile.js";

const PORT = 8600 + (process.pid % 400); // fresh port per run; a crashed run can't poison the next

let anvil, provider, usdt, escrow;
// anvil default funded accounts
let deployer, creator, joiner, outsider, juror1, juror2, juror3;

before(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
  process.on("exit", () => anvil?.kill());
  // cacheTimeout -1: ethers' result cache returns stale nonces against an instamining anvil
  provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, undefined, { cacheTimeout: -1, pollingInterval: 100 });
  for (let i = 0; ; i++) {
    try { await provider.getBlockNumber(); break; }
    catch { if (i > 50) throw new Error("anvil did not start"); await new Promise((r) => setTimeout(r, 100)); }
  }
  const accounts = [];
  for (let i = 0; i < 7; i++) {
    // anvil's deterministic mnemonic
    accounts.push(ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, `m/44'/60'/0'/0/${i}`).connect(provider));
  }
  [deployer, creator, joiner, outsider, juror1, juror2, juror3] = accounts;

  const u = await compile("MockUSDT");
  usdt = await new ethers.ContractFactory(u.abi, u.bytecode, deployer).deploy();
  await usdt.waitForDeployment();
  const e = await compile("Escrow");
  escrow = await new ethers.ContractFactory(e.abi, e.bytecode, deployer).deploy(await usdt.getAddress());
  await escrow.waitForDeployment();

  for (const w of [creator, joiner, outsider]) {
    await (await usdt.mint(w.address, 1_000_000_000n)).wait(); // 1000 USDT (6 dp)
    await (await usdt.connect(w).approve(await escrow.getAddress(), ethers.MaxUint256)).wait();
  }
});

after(() => anvil?.kill());

const STAKE = 5_000_000n; // 5 USDT
let betCount = 0;
const newBetId = () => ethers.keccak256(ethers.toUtf8Bytes(`bet-${++betCount}`));
const jurors = () => [juror1.address, juror2.address, juror3.address];
const futureDeadline = async () => BigInt((await provider.getBlock("latest")).timestamp + 3600);

async function createAndJoin(betId) {
  await (await escrow.connect(creator).create(betId, STAKE, jurors(), await futureDeadline())).wait();
  await (await escrow.connect(joiner).join(betId)).wait();
}

async function verdictSig(signer, betId, winner) {
  const digest = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "bytes32", "address"],
    ["PUNT_VERDICT", (await provider.getNetwork()).chainId, await escrow.getAddress(), betId, winner]
  );
  return signer.signMessage(ethers.getBytes(digest));
}

test("create pulls the creator's stake into the escrow", async () => {
  const betId = newBetId();
  const beforeBal = await usdt.balanceOf(creator.address);
  await (await escrow.connect(creator).create(betId, STAKE, jurors(), await futureDeadline())).wait();
  assert.equal(await usdt.balanceOf(creator.address), beforeBal - STAKE);
  assert.equal(await usdt.balanceOf(await escrow.getAddress()) >= STAKE, true);
});

test("join pulls the same stake from the joiner; double join and unknown pot revert", async () => {
  const betId = newBetId();
  await (await escrow.connect(creator).create(betId, STAKE, jurors(), await futureDeadline())).wait();
  const beforeBal = await usdt.balanceOf(joiner.address);
  await (await escrow.connect(joiner).join(betId)).wait();
  assert.equal(await usdt.balanceOf(joiner.address), beforeBal - STAKE);
  await assert.rejects(escrow.connect(outsider).join(betId)); // already joined
  await assert.rejects(escrow.connect(joiner).join(newBetId())); // no such pot
});

test("creator cannot join their own bet", async () => {
  const betId = newBetId();
  await (await escrow.connect(creator).create(betId, STAKE, jurors(), await futureDeadline())).wait();
  await assert.rejects(escrow.connect(creator).join(betId));
});

test("settle with 2-of-3 juror signatures pays the winner the whole pot", async () => {
  const betId = newBetId();
  await createAndJoin(betId);
  const sigs = [await verdictSig(juror1, betId, joiner.address), await verdictSig(juror3, betId, joiner.address)];
  const beforeBal = await usdt.balanceOf(joiner.address);
  await (await escrow.connect(outsider).settle(betId, joiner.address, sigs)).wait();
  assert.equal(await usdt.balanceOf(joiner.address), beforeBal + 2n * STAKE);
});

test("settle rejects: one sig, duplicate juror, non-juror signer, non-participant winner", async () => {
  const betId = newBetId();
  await createAndJoin(betId);
  const s1 = await verdictSig(juror1, betId, creator.address);
  await assert.rejects(escrow.settle(betId, creator.address, [s1]));
  await assert.rejects(escrow.settle(betId, creator.address, [s1, s1]));
  const bad = await verdictSig(outsider, betId, creator.address);
  await assert.rejects(escrow.settle(betId, creator.address, [s1, bad]));
  const forWrongWinner = [await verdictSig(juror1, betId, outsider.address), await verdictSig(juror2, betId, outsider.address)];
  await assert.rejects(escrow.settle(betId, outsider.address, forWrongWinner));
});

test("settle before anyone joins reverts; pot cannot be settled twice", async () => {
  const betId = newBetId();
  await (await escrow.connect(creator).create(betId, STAKE, jurors(), await futureDeadline())).wait();
  const sigs = [await verdictSig(juror1, betId, creator.address), await verdictSig(juror2, betId, creator.address)];
  await assert.rejects(escrow.settle(betId, creator.address, sigs)); // not joined
  await (await escrow.connect(joiner).join(betId)).wait();
  await (await escrow.settle(betId, creator.address, sigs)).wait();
  await assert.rejects(escrow.settle(betId, creator.address, sigs)); // already settled
});

test("refund after the deadline returns both stakes; before deadline it reverts", async () => {
  const betId = newBetId();
  await createAndJoin(betId);
  await assert.rejects(escrow.refund(betId)); // too early
  await provider.send("evm_increaseTime", [7200]);
  await provider.send("evm_mine", []);
  const cBefore = await usdt.balanceOf(creator.address);
  const jBefore = await usdt.balanceOf(joiner.address);
  await (await escrow.refund(betId)).wait();
  assert.equal(await usdt.balanceOf(creator.address), cBefore + STAKE);
  assert.equal(await usdt.balanceOf(joiner.address), jBefore + STAKE);
  await assert.rejects(escrow.refund(betId)); // already refunded
});

test("unjoined pot refunds only the creator after the deadline", async () => {
  const betId = newBetId();
  await (await escrow.connect(creator).create(betId, STAKE, jurors(), await futureDeadline())).wait();
  await provider.send("evm_increaseTime", [7200]);
  await provider.send("evm_mine", []);
  const cBefore = await usdt.balanceOf(creator.address);
  await (await escrow.refund(betId)).wait();
  assert.equal(await usdt.balanceOf(creator.address), cBefore + STAKE);
});

test("settled pot cannot be refunded even after the deadline", async () => {
  const betId = newBetId();
  await createAndJoin(betId);
  const sigs = [await verdictSig(juror1, betId, creator.address), await verdictSig(juror2, betId, creator.address)];
  await (await escrow.settle(betId, creator.address, sigs)).wait();
  await provider.send("evm_increaseTime", [7200]);
  await provider.send("evm_mine", []);
  await assert.rejects(escrow.refund(betId));
});

test("create rejects duplicate juror addresses", async () => {
  const betId = newBetId();
  const dup = [juror1.address, juror1.address, juror2.address];
  await assert.rejects(escrow.connect(creator).create(betId, STAKE, dup, await futureDeadline()));
});

test("getJurors exposes the jury set for pre-join verification", async () => {
  const betId = newBetId();
  await (await escrow.connect(creator).create(betId, STAKE, jurors(), await futureDeadline())).wait();
  assert.deepEqual([...(await escrow.getJurors(betId))], jurors());
});
