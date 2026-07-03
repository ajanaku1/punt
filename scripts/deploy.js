/**
 * Compile + deploy MockUSDT and Escrow to Sepolia, mint test USDT to the
 * creator and joiner, and save the contract addresses to .env.
 *
 * Deployment uses ethers (contract creation); all demo-journey value movement
 * goes through WDK. The creator mnemonic derives the same address in both
 * (BIP-44 m/44'/60'/0'/0/0).
 *
 * Run: node scripts/fund-wallets.js first, fund CREATOR with Sepolia ETH, then
 *      node scripts/deploy.js
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ethers } from "ethers";
import solc from "solc";
import { readEnvFile, writeEnvFile, ROOT } from "./env-file.js";

async function compile(name) {
  const source = await readFile(join(ROOT, "contracts", `${name}.sol`), "utf8");
  const input = {
    language: "Solidity",
    sources: { [`${name}.sol`]: { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } }, // same settings as tests — deploy the bytecode we tested
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const c = out.contracts[`${name}.sol`][name];
  return { abi: c.abi, bytecode: c.evm.bytecode.object };
}

const env = await readEnvFile();
const mnemonic = env.get("CREATOR_MNEMONIC");
if (!mnemonic) throw new Error("run scripts/fund-wallets.js first");

const provider = new ethers.JsonRpcProvider(env.get("RPC_URL"), undefined, { cacheTimeout: -1 });
const deployer = ethers.HDNodeWallet.fromPhrase(mnemonic).connect(provider);
console.log(`Deployer ${deployer.address}, balance ${ethers.formatEther(await provider.getBalance(deployer.address))} ETH`);

const u = await compile("MockUSDT");
const usdt = await new ethers.ContractFactory(u.abi, u.bytecode, deployer).deploy();
await usdt.waitForDeployment();
console.log("MockUSDT:", await usdt.getAddress());

const e = await compile("Escrow");
const escrow = await new ethers.ContractFactory(e.abi, e.bytecode, deployer).deploy(await usdt.getAddress());
await escrow.waitForDeployment();
console.log("Escrow:  ", await escrow.getAddress());

const HUNDRED_USDT = 100_000_000n; // 6 decimals
for (const role of ["CREATOR", "JOINER"]) {
  const to = env.get(`${role}_ADDRESS`);
  await (await usdt.mint(to, HUNDRED_USDT)).wait();
  console.log(`Minted 100 USDT to ${role} ${to}`);
}

env.set("USDT_CONTRACT", await usdt.getAddress());
env.set("ESCROW_CONTRACT", await escrow.getAddress());
await writeEnvFile(env);
console.log("Saved USDT_CONTRACT and ESCROW_CONTRACT to .env");
