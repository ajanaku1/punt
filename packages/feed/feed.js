import Autobase from "autobase";
import Corestore from "corestore";
import Hyperbee from "hyperbee";
import { validateBet, betHash } from "@punt/shared/bet.js";
import { validateVerdictMsg } from "@punt/shared/verdict.js";

/**
 * The Punt bet feed: an optimistic multi-writer Autobase whose view is a
 * deterministic, indexed reducer over a Hyperbee. Anyone can append a bet or
 * verdict without being a writer; `apply` is the SOLE mutator of the view and
 * runs identically on every peer, so all peers converge to the same state.
 *
 * View key layout (Hyperbee, utf-8 keys / json values):
 *   bet/<betId>                → the bet message
 *   verdict/<betId>/<juror>    → that juror's verdict (one per juror — dedup)
 *   tally/<betId>              → { winners:{addr:count}, leader, leaderCount }  (informational)
 *
 * Invariants (enforced by `reduce`, preserved across Autobase reindex):
 *   I1  Schema gate — only schema-valid bets/verdicts enter the view; junk is
 *       dropped BEFORE the writer is acked, so spam never reaches anyone.
 *   I2  Author binding (anti-spoofing) — a bet enters the view only if its
 *       `creator` key equals the key of the writer that appended it, so a peer
 *       cannot post bets under another peer's identity.
 *   I3  Verdict dedup — at most one verdict per (betId, juror) is retained
 *       (keyed by juror); a juror re-signing overwrites, never double-counts.
 *   I4  Determinism — the view is a pure function of the message log; Autobase
 *       re-runs `apply` on reorg and every peer lands on the identical Hyperbee.
 *
 * Settlement authority note: `tally/` is a convenience view and does NOT verify
 * signatures. The authoritative 2-of-3 decision stays in verdict.js
 * `majorityWinner()` (verifies sigs + distinct listed jurors) and is enforced
 * on-chain by `Escrow.settle()`'s `ecrecover`.
 *
 * Replicate with feed.replicate() (Autobase-level — store-level streams never
 * wake optimistic writers).
 */
const PREFIX_END = "~"; // > every char used in our hex/address keys — a safe range upper bound

async function reduce(view, host, node) {
  const msg = node.value;
  const writer = node.from?.key ? node.from.key.toString("hex") : null;

  if (msg?.type === "bet") {
    if (!validateBet(msg).ok) return; // I1
    if (writer && msg.creator !== writer) return; // I2: bet author must be the appending writer
    await host.ackWriter(node.from.key);
    await view.put(`bet/${betHash(msg)}`, msg);
    return;
  }

  if (msg?.type === "verdict") {
    if (!validateVerdictMsg(msg)) return; // I1
    await host.ackWriter(node.from.key);
    await view.put(`verdict/${msg.betId}/${msg.juror.toLowerCase()}`, msg); // I3: dedup per juror
    await retally(view, msg.betId);
    return;
  }
}

/** Recompute the informational tally for one bet from its retained verdicts. */
async function retally(view, betId) {
  const winners = {};
  for await (const { value } of view.createReadStream({ gte: `verdict/${betId}/`, lt: `verdict/${betId}/${PREFIX_END}` })) {
    winners[value.winner] = (winners[value.winner] ?? 0) + 1;
  }
  const leader = Object.entries(winners).sort((a, b) => b[1] - a[1])[0];
  await view.put(`tally/${betId}`, { winners, leader: leader?.[0] ?? null, leaderCount: leader?.[1] ?? 0 });
}

/**
 * @param encryptionKey 32-byte group secret. Blocks are encrypted at rest and
 * on the wire: knowing WHERE the group meets (the feed key / DHT topic) is not
 * enough to READ the pots — you need the secret a friend handed you.
 */
export async function createFeed({ storage, key = null, encryptionKey = null }) {
  const store = new Corestore(storage);
  const base = new Autobase(store, key, {
    valueEncoding: "json",
    optimistic: true,
    encryptionKey,
    open: (viewStore) => new Hyperbee(viewStore.get("punt-view"), { keyEncoding: "utf-8", valueEncoding: "json" }),
    async apply(nodes, view, host) {
      for (const node of nodes) await reduce(view, host, node);
    },
  });
  await base.ready();

  async function readRange(prefix) {
    await base.update();
    const out = [];
    for await (const { value } of base.view.createReadStream({ gte: prefix, lt: prefix + PREFIX_END })) out.push(value);
    return out;
  }

  return {
    key: base.key,
    localKey: base.local.key,
    discoveryKey: base.discoveryKey, // swarm topic — peers who know `key` find each other on the DHT
    base,
    replicate: (isInitiatorOrStream) => base.replicate(isInitiatorOrStream),
    postBet: (bet) => base.append(bet, { optimistic: true }),
    postVerdict: (verdict) => base.append(verdict, { optimistic: true }),
    listBets: () => readRange("bet/"),
    listVerdicts: (betId) => readRange(betId ? `verdict/${betId}/` : "verdict/"),
    async tally(betId) {
      await base.update();
      return (await base.view.get(`tally/${betId}`))?.value ?? null;
    },
    async close() {
      await base.close();
      await store.close();
    },
  };
}
