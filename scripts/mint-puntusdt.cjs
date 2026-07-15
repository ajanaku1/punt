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
  const puntUsdt = new ethers.Contract(
    env.PUNTUSDT_CONTRACT,
    ["function mint(address,uint256)", "function balanceOf(address) view returns (uint256)", "function DOMAIN_SEPARATOR() view returns (bytes32)"],
    deployer,
  );

  // Fund the joiner
  const joiner = ethers.Wallet.fromPhrase(env.JOINER_MNEMONIC);
  const amount = ethers.parseUnits("1000", 6);
  console.log(`minting 1000 USDT to joiner ${joiner.address.slice(0, 10)}…`);
  const tx = await puntUsdt.mint(joiner.address, amount);
  await tx.wait();

  const bal = await puntUsdt.balanceOf(joiner.address);
  const dom = await puntUsdt.DOMAIN_SEPARATOR();
  console.log(`joiner balance: ${Number(bal) / 1e6} USDT`);
  console.log(`DOMAIN_SEPARATOR: ${dom}`);
  console.log(`tx: ${tx.hash}`);
  console.log(`explorer: https://sepolia.basescan.org/tx/${tx.hash}`);
}

main().catch(err => { console.error(err); process.exit(1); });
