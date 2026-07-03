/**
 * Set up the demo wallets in .env (gitignored). Never prints a secret.
 *
 * - CREATOR/JOINER mnemonics: generated if missing. On this dev machine an
 *   already-funded local wallet can be reused by pre-seeding .env yourself.
 * - JUROR1..3 mnemonics: generated if missing — jurors only sign verdicts,
 *   they never need gas.
 * - Prints each derived address and what (if anything) needs faucet funding.
 *
 * Run: node scripts/fund-wallets.js
 */
import { ethers } from "ethers";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";
import { readEnvFile, writeEnvFile } from "./env-file.js";

const env = await readEnvFile();
const RPC = env.get("RPC_URL") ?? "https://ethereum-sepolia-rpc.publicnode.com";
env.set("RPC_URL", RPC);

const ROLES = ["CREATOR", "JOINER", "JUROR1", "JUROR2", "JUROR3"];
const addresses = {};

for (const role of ROLES) {
  const key = `${role}_MNEMONIC`;
  if (!env.get(key)) env.set(key, ethers.Mnemonic.fromEntropy(ethers.randomBytes(16)).phrase);
  const wallet = new WalletManagerEvm(env.get(key), { provider: RPC, chainId: 11155111 });
  const account = await wallet.getAccount(0);
  addresses[role] = await account.getAddress();
  env.set(`${role}_ADDRESS`, addresses[role]);
}

await writeEnvFile(env);

const provider = new ethers.JsonRpcProvider(RPC);
console.log("Wallets (mnemonics saved to .env only):");
for (const role of ROLES) {
  const bal = ethers.formatEther(await provider.getBalance(addresses[role]));
  console.log(`  ${role.padEnd(7)} ${addresses[role]}  ${bal} ETH`);
}
console.log("\nCREATOR and JOINER need a little Sepolia ETH for gas (faucet: https://sepoliafaucet.com).");
console.log("Jurors need nothing — they only sign verdicts.");
