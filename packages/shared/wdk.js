/**
 * Shared WDK helpers — all stake custody goes through self-custodial WDK wallets.
 * One place for settlement config so every peer agrees on chain, RPC, and contracts.
 */
import WalletManagerEvm, { WalletAccountReadOnlyEvm } from "@tetherto/wdk-wallet-evm";

export function settlementConfigFromEnv(env = process.env) {
  const { RPC_URL, USDT_CONTRACT, ESCROW_CONTRACT } = env;
  if (!RPC_URL) throw new Error("RPC_URL is required");
  return {
    rpcUrl: RPC_URL,
    chainId: Number(env.CHAIN_ID ?? 11155111),
    usdtContract: USDT_CONTRACT,
    escrowContract: ESCROW_CONTRACT,
    usdtDecimals: 6,
  };
}

/** Signing account derived from a BIP-39 mnemonic (each user's self-custodial wallet). */
export async function signingAccount(mnemonic, cfg) {
  const wallet = new WalletManagerEvm(mnemonic, { provider: cfg.rpcUrl, chainId: cfg.chainId });
  return wallet.getAccount(0);
}

/** Keyless read-only account for watching any address's balances. */
export function readOnlyAccount(address, cfg) {
  return new WalletAccountReadOnlyEvm(address, { provider: cfg.rpcUrl, chainId: cfg.chainId });
}

/** USDT balance in base units (6 decimals). */
export function usdtBalance(account, cfg) {
  return account.getTokenBalance(cfg.usdtContract);
}
