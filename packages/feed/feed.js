import Autobase from "autobase";
import Corestore from "corestore";
import { validateBet } from "@punt/shared/bet.js";

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
        if (msg?.type !== "bet") continue;
        if (!validateBet(msg).ok) continue;
        await host.ackWriter(node.from.key);
        await view.append(msg);
      }
    },
  });
  await base.ready();

  return {
    key: base.key,
    localKey: base.local.key,
    base,
    replicate: (isInitiatorOrStream) => base.replicate(isInitiatorOrStream),
    postBet: (bet) => base.append(bet, { optimistic: true }),
    async listBets() {
      await base.update();
      const bets = [];
      for (let i = 0; i < base.view.length; i++) bets.push(await base.view.get(i));
      return bets;
    },
    async close() {
      await base.close();
      await store.close();
    },
  };
}
