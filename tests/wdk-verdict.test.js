import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { signingAccount } from "@punt/shared/wdk.js";
import { signVerdict, verifyVerdict, majorityWinner } from "@punt/shared/verdict.js";

// Jurors sign verdicts with a self-custodial WDK account (P3). These tests
// prove that move is transparent to on-chain settlement: a WDK signature is
// byte-identical to the ethers one and recovers the same address under
// ecrecover — so Escrow.settle()'s 2-of-3 check behaves exactly as before.

const CHAIN = 84532n;
const ESCROW = "0x" + "11".repeat(20);
const BET = "0x" + "22".repeat(32);
const WINNER = ethers.getAddress("0x" + "33".repeat(20));
const cfg = { rpcUrl: "http://127.0.0.1:8545", chainId: 84532 };

// deterministic test mnemonics (never used for real funds)
const MN = [
  "test test test test test test test test test test test junk",
  "legal winner thank year wave sausage worth useful legal winner thank yellow",
  "actor actor actor actor actor actor actor actor actor actor actor abstract",
];

test("a WDK account derives the same address as ethers and signs an identical verdict", async () => {
  const account = await signingAccount(MN[0], cfg);
  const addr = await account.getAddress();
  const ew = ethers.HDNodeWallet.fromPhrase(MN[0]);

  assert.equal(addr.toLowerCase(), ew.address.toLowerCase(), "WDK derives the standard m/44'/60'/0'/0/0 address");

  const v = { chainId: CHAIN, escrow: ESCROW, betId: BET, winner: WINNER };
  const sigWdk = await signVerdict(account, v);
  const sigEthers = await signVerdict(ew, v);

  assert.equal(sigWdk, sigEthers, "WDK signature is byte-identical to ethers — ecrecover is unaffected");
  assert.equal(verifyVerdict({ ...v, sig: sigWdk, juror: addr }), true);
  assert.equal(verifyVerdict({ ...v, sig: sigWdk, juror: ew.address }), true);
});

test("majorityWinner accepts 2-of-3 WDK-signed verdicts from distinct listed jurors", async () => {
  const accounts = await Promise.all(MN.map((m) => signingAccount(m, cfg)));
  const jurors = await Promise.all(accounts.map((a) => a.getAddress()));
  const v = { chainId: CHAIN, escrow: ESCROW, betId: BET };

  const verdictFrom = async (i, winner) => ({
    winner,
    juror: jurors[i],
    sig: await signVerdict(accounts[i], { ...v, winner }),
  });

  // jurors 0 and 1 agree on WINNER; juror 2 disagrees
  const verdicts = [
    await verdictFrom(0, WINNER),
    await verdictFrom(1, WINNER),
    await verdictFrom(2, ethers.getAddress("0x" + "44".repeat(20))),
  ];

  const result = majorityWinner(verdicts, jurors, { chainId: CHAIN, escrow: ESCROW, betId: BET });
  assert.equal(result.winner, WINNER);
  assert.equal(result.sigs.length, 2, "exactly the two agreeing WDK signatures released to settle()");
});
