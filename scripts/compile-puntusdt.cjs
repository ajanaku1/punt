const solc = require("solc");
const fs = require("fs");
const src = fs.readFileSync("contracts/PuntUSDT.sol", "utf-8");
const input = {
  language: "Solidity",
  sources: { "PuntUSDT.sol": { content: src } },
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    optimizer: { enabled: true, runs: 200 },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors?.some((e) => e.severity === "error")) {
  console.error(output.errors.filter((e) => e.severity === "error").map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}
const c = output.contracts["PuntUSDT.sol"]["PuntUSDT"];
console.log("bytecode length:", c.evm.bytecode.object.length / 2, "bytes");
console.log("abi methods:", c.abi.filter((a) => a.type === "function").map((a) => a.name).join(", "));
fs.writeFileSync("contracts/PuntUSDT.abi.json", JSON.stringify(c.abi));
fs.writeFileSync("contracts/PuntUSDT.bin", c.evm.bytecode.object);
console.log("ABI + bytecode written");
