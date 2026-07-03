import Autobase from "autobase";
import Corestore from "corestore";
import { validateBet } from "@punt/shared/bet.js";
import { validateVerdictMsg } from "@punt/shared/verdict.js";

/**
 * The Punt bet feed: an optimistic multi-writer Autobase.
 * Anyone can append a bet without being a writer; the apply handler
 * validates the schema and acks the writer only when the bet is valid,
 * so junk never reaches anyone's view.
 *
 * Replicate with feed.replicate() (Autobase-level — store-level streams
 * never wake up optimistic writers).
 */
export async function createFeed({ storage, key = null }) {
  const store = new Corestore(storage);
  const base = new Autobase(store, key, {
    valueEncoding: "json",
    optimistic: true,
    open: (viewStore) => viewStore.get("bets", { valueEncoding: "json" }),
    async apply(nodes, view, host) {
      for (const node of nodes) {
        const msg = node.value;
        const valid =
          (msg?.type === "bet" && validateBet(msg).ok) ||
          (msg?.type === "verdict" && validateVerdictMsg(msg));
        if (!valid) continue;
        await host.ackWriter(node.from.key);
        await view.append(msg);
      }
    },
  });
  await base.ready();

  async function listAll() {
    await base.update();
    const messages = [];
    for (let i = 0; i < base.view.length; i++) messages.push(await base.view.get(i));
    return messages;
  }

  return {
    key: base.key,
    localKey: base.local.key,
    base,
    replicate: (isInitiatorOrStream) => base.replicate(isInitiatorOrStream),
    postBet: (bet) => base.append(bet, { optimistic: true }),
    postVerdict: (verdict) => base.append(verdict, { optimistic: true }),
    async listBets() {
      return (await listAll()).filter((m) => m.type === "bet");
    },
    async listVerdicts(betId) {
      return (await listAll()).filter((m) => m.type === "verdict" && (!betId || m.betId === betId));
    },
    async close() {
      await base.close();
      await store.close();
    },
  };
}
