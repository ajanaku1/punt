import { createHash } from "node:crypto";

export const MARKETS = ["result", "over_under", "scorer"];
export const MAX_STAKE = 1000; // testnet USDT
export const MAX_TEXT = 500;

const isHexKey = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
const isText = (s, max = MAX_TEXT) => typeof s === "string" && s.length > 0 && s.length <= max;

/** Validate a bet object against the feed schema. Returns { ok } or { ok:false, error }. */
export function validateBet(bet) {
  const fail = (error) => ({ ok: false, error });
  if (typeof bet !== "object" || bet === null) return fail("not an object");
  if (bet.type !== "bet") return fail("type must be 'bet'");
  if (!isHexKey(bet.creator)) return fail("creator must be a 64-hex public key");
  if (!isText(bet.text)) return fail("text missing or too long");
  const m = bet.match;
  if (typeof m !== "object" || m === null) return fail("match missing");
  if (!isText(m.home, 100) || !isText(m.away, 100)) return fail("match needs home and away");
  if (!isText(m.kickoff, 40) || Number.isNaN(Date.parse(m.kickoff))) return fail("match.kickoff must be an ISO date");
  if (!MARKETS.includes(bet.market)) return fail(`market must be one of ${MARKETS.join(", ")}`);
  if (!isText(bet.selection)) return fail("selection missing or too long");
  if (typeof bet.stake !== "number" || !Number.isFinite(bet.stake) || bet.stake <= 0 || bet.stake > MAX_STAKE)
    return fail(`stake must be a number in (0, ${MAX_STAKE}]`);
  if (!isText(bet.resolution)) return fail("resolution criteria missing or too long");
  if (typeof bet.createdAt !== "number" || !Number.isFinite(bet.createdAt)) return fail("createdAt must be a timestamp");
  return { ok: true };
}

/** Canonical sha256 of a bet (sorted keys) — used as the escrow pot key. */
export function betHash(bet) {
  const canonical = (v) => {
    if (Array.isArray(v)) return v.map(canonical);
    if (typeof v === "object" && v !== null)
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canonical(bet))).digest("hex");
}
