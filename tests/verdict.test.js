import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  verdictDigest,
  signVerdict,
  verifyVerdict,
  majorityWinner,
} from "@punt/shared/verdict.js";

const CHAIN = 84532n;
const ESCROW = "0x" + "11".repeat(20);
const BET = "0x" + "22".repeat(32);
const w1 = ethers.Wallet.createRandom();
const w2 = ethers.Wallet.createRandom();
const w3 = ethers.Wallet.createRandom();
const WINNER = ethers.getAddress("0x" + "33".repeat(20));
const OTHER = ethers.getAddress("0x" + "44".repeat(20));

test("digest matches the contract's packed encoding", () => {
  const expected = ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "bytes32", "address"],
    ["PUNT_VERDICT", CHAIN, ESCROW, BET, WINNER],
  );
  assert.equal(verdictDigest({ chainId: CHAIN, escrow: ESCROW, betId: BET, winner: WINNER }), expected);
});

test("sign + verify round trip; wrong winner or juror fails", async () => {
  const v = { chainId: CHAIN, escrow: ESCROW, betId: BET, winner: WINNER };
  const sig = await signVerdict(w1, v);
  assert.equal(verifyVerdict({ ...v, sig, juror: w1.address }), true);
  assert.equal(verifyVerdict({ ...v, sig, juror: w2.address }), false);
  assert.equal(verifyVerdict({ ...v, winner: OTHER, sig, juror: w1.address }), false);
});

test("majorityWinner needs 2 valid signatures agreeing from distinct listed jurors", async () => {
  const jurors = [w1.address, w2.address, w3.address];
  const v = { chainId: CHAIN, escrow: ESCROW, betId: BET };
  const forWinner = async (w, winner) => ({
    winner, juror: w.address, sig: await signVerdict(w, { ...v, winner }),
  });

  // one vote: no majority
  assert.equal(majorityWinner([await forWinner(w1, WINNER)], jurors, v), null);
  // two agreeing: majority
  const m = majorityWinner([await forWinner(w1, WINNER), await forWinner(w3, WINNER)], jurors, v);
  assert.equal(m.winner, WINNER);
  assert.equal(m.sigs.length, 2);
  // split vote: no majority
  assert.equal(majorityWinner([await forWinner(w1, WINNER), await forWinner(w2, OTHER)], jurors, v), null);
  // same juror twice does not count as two
  assert.equal(majorityWinner([await forWinner(w1, WINNER), await forWinner(w1, WINNER)], jurors, v), null);
  // non-listed juror's vote ignored
  const outsider = ethers.Wallet.createRandom();
  assert.equal(majorityWinner([await forWinner(w1, WINNER), await forWinner(outsider, WINNER)], jurors, v), null);
});
