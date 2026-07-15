/**
 * Verdict edge case tests — digest determinism, signature verification,
 * and majorityWinner behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  verdictDigest,
  signVerdict,
  verifyVerdict,
  majorityWinner,
  validateVerdictMsg,
} from "@punt/shared/verdict.js";

const CHAIN_ID = 84532n;
const ESCROW = ethers.Wallet.createRandom().address;
const BET_ID = "0x" + "ab".repeat(32);
const WINNER = ethers.Wallet.createRandom().address;

// ── digest determinism ──────────────────────────────────────────────────

test("verdictDigest: same inputs produce same digest", () => {
  const d1 = verdictDigest({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const d2 = verdictDigest({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  assert.equal(d1, d2, "digest must be deterministic");
});

test("verdictDigest: different winner produces different digest", () => {
  const d1 = verdictDigest({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const d2 = verdictDigest({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: ethers.Wallet.createRandom().address });
  assert.notEqual(d1, d2, "different winners must produce different digests");
});

test("verdictDigest: different chainId produces different digest", () => {
  const d1 = verdictDigest({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const d2 = verdictDigest({ chainId: 1n, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  assert.notEqual(d1, d2, "different chain IDs must produce different digests");
});

test("verdictDigest: different escrow address produces different digest", () => {
  const d1 = verdictDigest({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const d2 = verdictDigest({ chainId: CHAIN_ID, escrow: ethers.Wallet.createRandom().address, betId: BET_ID, winner: WINNER });
  assert.notEqual(d1, d2, "different escrow addresses must produce different digests");
});

// ── signature verification ─────────────────────────────────────────────

test("signVerdict: valid signature passes verification", async () => {
  const juror = ethers.Wallet.createRandom();
  const sig = await signVerdict(juror, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const ok = verifyVerdict({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER, sig, juror: juror.address });
  assert.equal(ok, true, "valid signature must verify");
});

test("signVerdict: wrong juror fails verification", async () => {
  const juror = ethers.Wallet.createRandom();
  const impostor = ethers.Wallet.createRandom();
  const sig = await signVerdict(juror, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const ok = verifyVerdict({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER, sig, juror: impostor.address });
  assert.ok(!ok, "wrong juror must not verify");
});

test("signVerdict: wrong winner fails verification", async () => {
  const juror = ethers.Wallet.createRandom();
  const sig = await signVerdict(juror, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const ok = verifyVerdict({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: ethers.Wallet.createRandom().address, sig, juror: juror.address });
  assert.ok(!ok, "wrong winner must not verify");
});

test("verifyVerdict: returns false on malformed sig, not throws", () => {
  const ok = verifyVerdict({ chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER, sig: "0x00", juror: WINNER });
  assert.ok(!ok, "malformed sig must return false");
});

// ── majorityWinner ──────────────────────────────────────────────────────

test("majorityWinner: returns null with 0 verdicts", () => {
  const jurors = [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];
  const result = majorityWinner([], jurors, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID });
  assert.equal(result, null, "0 verdicts must return null");
});

test("majorityWinner: returns null with 1 valid verdict", async () => {
  const juror = ethers.Wallet.createRandom();
  const jurors = [juror.address, ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];
  const sig = await signVerdict(juror, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const verdicts = [{ juror: juror.address, winner: WINNER, sig }];
  const result = majorityWinner(verdicts, jurors, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID });
  assert.equal(result, null, "1 verdict must return null");
});

test("majorityWinner: returns winner with 2 matching valid verdicts", async () => {
  const j1 = ethers.Wallet.createRandom();
  const j2 = ethers.Wallet.createRandom();
  const j3 = ethers.Wallet.createRandom();
  const jurors = [j1.address, j2.address, j3.address];
  const sig1 = await signVerdict(j1, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const sig2 = await signVerdict(j2, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const verdicts = [
    { juror: j1.address, winner: WINNER, sig: sig1 },
    { juror: j2.address, winner: WINNER, sig: sig2 },
  ];
  const result = majorityWinner(verdicts, jurors, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID });
  assert.notEqual(result, null, "2 matching verdicts must return a winner");
  assert.equal(result.winner, WINNER);
  assert.equal(result.sigs.length, 2);
});

test("majorityWinner: returns null when 2 valid sigs disagree on winner", async () => {
  const j1 = ethers.Wallet.createRandom();
  const j2 = ethers.Wallet.createRandom();
  const j3 = ethers.Wallet.createRandom();
  const jurors = [j1.address, j2.address, j3.address];
  const other = ethers.Wallet.createRandom().address;
  const sig1 = await signVerdict(j1, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const sig2 = await signVerdict(j2, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: other });
  const verdicts = [
    { juror: j1.address, winner: WINNER, sig: sig1 },
    { juror: j2.address, winner: other, sig: sig2 },
  ];
  const result = majorityWinner(verdicts, jurors, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID });
  assert.equal(result, null, "disagreeing jurors must return null");
});

test("majorityWinner: ignores unlisted jurors", async () => {
  const j1 = ethers.Wallet.createRandom();
  const unlisted = ethers.Wallet.createRandom();
  const jurors = [j1.address, ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address];
  const sig1 = await signVerdict(j1, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const sigU = await signVerdict(unlisted, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const verdicts = [
    { juror: j1.address, winner: WINNER, sig: sig1 },
    { juror: unlisted.address, winner: WINNER, sig: sigU },
  ];
  const result = majorityWinner(verdicts, jurors, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID });
  assert.equal(result, null, "unlisted juror must be ignored — only 1 valid vote");
});

test("majorityWinner: returns 2 sigs even with 3 matching", async () => {
  const j1 = ethers.Wallet.createRandom();
  const j2 = ethers.Wallet.createRandom();
  const j3 = ethers.Wallet.createRandom();
  const jurors = [j1.address, j2.address, j3.address];
  const sig1 = await signVerdict(j1, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const sig2 = await signVerdict(j2, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const sig3 = await signVerdict(j3, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID, winner: WINNER });
  const verdicts = [
    { juror: j1.address, winner: WINNER, sig: sig1 },
    { juror: j2.address, winner: WINNER, sig: sig2 },
    { juror: j3.address, winner: WINNER, sig: sig3 },
  ];
  const result = majorityWinner(verdicts, jurors, { chainId: CHAIN_ID, escrow: ESCROW, betId: BET_ID });
  assert.notEqual(result, null);
  assert.equal(result.sigs.length, 2, "must return exactly 2 sigs (2-of-3 threshold)");
});

// ── validateVerdictMsg ─────────────────────────────────────────────────

test("validateVerdictMsg: valid message passes", () => {
  const ok = validateVerdictMsg({
    type: "verdict",
    betId: "ab".repeat(32),
    winner: ethers.Wallet.createRandom().address,
    juror: ethers.Wallet.createRandom().address,
    sig: "0x" + "cd".repeat(65),
  });
  assert.ok(ok, "valid verdict msg must pass validation");
});

test("validateVerdictMsg: missing type fails", () => {
  assert.ok(!validateVerdictMsg({ betId: "ab".repeat(32), winner: "0x" + "00".repeat(20), juror: "0x" + "00".repeat(20), sig: "0x" + "cd".repeat(65) }));
});

test("validateVerdictMsg: wrong sig length fails", () => {
  const ok = validateVerdictMsg({
    type: "verdict",
    betId: "ab".repeat(32),
    winner: ethers.Wallet.createRandom().address,
    juror: ethers.Wallet.createRandom().address,
    sig: "0xdead",
  });
  assert.ok(!ok, "short sig must fail");
});

test("validateVerdictMsg: null returns false, not throws", () => {
  assert.ok(!validateVerdictMsg(null));
  assert.ok(!validateVerdictMsg(undefined));
  assert.ok(!validateVerdictMsg({}));
});
