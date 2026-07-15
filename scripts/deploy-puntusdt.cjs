const { ethers } = require("ethers");
const fs = require("fs");

async function main() {
  const env = Object.fromEntries(
    fs.readFileSync(".env", "utf-8").split("\n")
      .filter(l => l && !l.startsWith("#"))
      .map(l => l.split("=").map(s => s.trim()))
  );

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const deployer = ethers.Wallet.fromPhrase(env.CREATOR_MNEMONIC).connect(provider);
  const abi = JSON.parse(fs.readFileSync("contracts/PuntUSDT.abi.json", "utf-8"));
  const bytecode = "0x" + fs.readFileSync("contracts/PuntUSDT.bin", "utf-8").trim();
  const chainId = Number(env.CHAIN_ID ?? 84532);

  console.log(`deployer: ${deployer.address}`);
  console.log(`chainId:  ${chainId}`);
  console.log(`balance:  ${ethers.formatEther(await provider.getBalance(deployer.address))} ETH`);

  const factory = new ethers.ContractFactory(abi, bytecode, deployer);
  console.log("deploying PuntUSDT…");
  const contract = await factory.deploy(chainId);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();

  console.log(`\nDEPLOYED: ${addr}`);
  console.log(`Explorer: https://sepolia.basescan.org/address/${addr}`);
  console.log(`\nAdd to .env:  PUNTUSDT_CONTRACT=${addr}`);
  console.log(`Add to .env:  FACILITATOR_MNEMONIC=<fund this wallet with Sepolia ETH>`);
}

main().catch(err => { console.error(err); process.exit(1); });
