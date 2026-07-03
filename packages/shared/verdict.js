/**
 * Jury verdicts — signed with each juror's EVM key so the escrow contract can
 * verify them with ecrecover. Digest layout must stay byte-identical to
 * Escrow.settle(): keccak256("PUNT_VERDICT", chainid, escrow, betId, winner).
 */
import { ethers } from "ethers";

/** Feed-level shape check for gossiped verdicts (signatures are verified by consumers). */
export function validateVerdictMsg(msg) {
  return (
    typeof msg === "object" && msg !== null &&
    msg.type === "verdict" &&
    /^[0-9a-f]{64}$/.test(msg.betId ?? "") &&
    /^0x[0-9a-fA-F]{40}$/.test(msg.winner ?? "") &&
    /^0x[0-9a-fA-F]{40}$/.test(msg.juror ?? "") &&
    /^0x[0-9a-fA-F]{130}$/.test(msg.sig ?? "") &&
    (msg.reasoning === undefined || (typeof msg.reasoning === "string" && msg.reasoning.length <= 2000))
  );
}

export function verdictDigest({ chainId, escrow, betId, winner }) {
  return ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "bytes32", "address"],
    ["PUNT_VERDICT", chainId, escrow, betId, winner],
  );
}

/** EIP-191 signature over the digest (matches the contract's prefixed recover). */
export function signVerdict(signer, verdict) {
  return signer.signMessage(ethers.getBytes(verdictDigest(verdict)));
}

export function verifyVerdict({ chainId, escrow, betId, winner, sig, juror }) {
  try {
    const digest = verdictDigest({ chainId, escrow, betId, winner });
    return ethers.verifyMessage(ethers.getBytes(digest), sig) === ethers.getAddress(juror);
  } catch {
    return false;
  }
}

/**
 * 2-of-3: given gossiped verdicts for one bet, return { winner, sigs } when two
 * distinct listed jurors validly signed the same winner, else null.
 */
export function majorityWinner(verdicts, jurors, { chainId, escrow, betId }) {
  const listed = new Set(jurors.map((a) => ethers.getAddress(a)));
  const byWinner = new Map(); // winner → Map(juror → sig)
  for (const v of verdicts) {
    if (!verifyVerdict({ chainId, escrow, betId, winner: v.winner, sig: v.sig, juror: v.juror })) continue;
    const juror = ethers.getAddress(v.juror);
    if (!listed.has(juror)) continue;
    if (!byWinner.has(v.winner)) byWinner.set(v.winner, new Map());
    byWinner.get(v.winner).set(juror, v.sig);
  }
  for (const [winner, votes] of byWinner) {
    if (votes.size >= 2) return { winner, sigs: [...votes.values()].slice(0, 2) };
  }
  return null;
}
