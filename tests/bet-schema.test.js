import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBet, betHash } from "@punt/shared/bet.js";

const validBet = () => ({
  type: "bet",
  creator: "a".repeat(64),
  text: "Mbappé scores 2+ vs Brazil, 5 USDT",
  match: { home: "France", away: "Brazil", kickoff: "2026-07-05T19:00:00Z" },
  market: "scorer",
  selection: "Kylian Mbappé scores 2 or more goals",
  stake: 5,
  resolution: "Kylian Mbappé is credited with 2+ goals in France vs Brazil per full-time official data",
  createdAt: 1751500000000,
});

test("accepts a well-formed bet", () => {
  const r = validateBet(validBet());
  assert.equal(r.ok, true);
});

test("rejects non-object and wrong type tag", () => {
  assert.equal(validateBet(null).ok, false);
  assert.equal(validateBet("junk").ok, false);
  assert.equal(validateBet({ ...validBet(), type: "spam" }).ok, false);
});

test("rejects missing or malformed creator key", () => {
  assert.equal(validateBet({ ...validBet(), creator: undefined }).ok, false);
  assert.equal(validateBet({ ...validBet(), creator: "zz" }).ok, false);
});

test("rejects unknown market", () => {
  const r = validateBet({ ...validBet(), market: "first_corner" });
  assert.equal(r.ok, false);
  assert.match(r.error, /market/);
});

test("rejects non-positive, non-finite, or oversized stake", () => {
  assert.equal(validateBet({ ...validBet(), stake: 0 }).ok, false);
  assert.equal(validateBet({ ...validBet(), stake: -5 }).ok, false);
  assert.equal(validateBet({ ...validBet(), stake: Infinity }).ok, false);
  assert.equal(validateBet({ ...validBet(), stake: "5" }).ok, false);
  assert.equal(validateBet({ ...validBet(), stake: 1e9 }).ok, false);
});

test("rejects missing match fields or unparseable kickoff", () => {
  assert.equal(validateBet({ ...validBet(), match: null }).ok, false);
  assert.equal(validateBet({ ...validBet(), match: { home: "France" } }).ok, false);
  const bad = validBet();
  bad.match.kickoff = "next tuesday";
  assert.equal(validateBet(bad).ok, false);
});

test("rejects empty or overlong text fields", () => {
  assert.equal(validateBet({ ...validBet(), resolution: "" }).ok, false);
  assert.equal(validateBet({ ...validBet(), text: "x".repeat(2000) }).ok, false);
});

test("betHash is a 64-hex digest, stable under key order, distinct across bets", () => {
  const a = validBet();
  const reordered = JSON.parse(JSON.stringify(a));
  delete reordered.stake;
  reordered.stake = a.stake; // same content, different key insertion order
  assert.match(betHash(a), /^[0-9a-f]{64}$/);
  assert.equal(betHash(a), betHash(reordered));
  assert.notEqual(betHash(a), betHash({ ...a, stake: 6 }));
});
