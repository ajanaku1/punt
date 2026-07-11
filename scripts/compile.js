/**
 * CI contract-compile check — proves contracts/*.sol still compile with no RPC
 * and no keys. Exits non-zero on any solc error.
 */
import { compileContract } from "./solc-compile.js";

for (const name of ["MockUSDT", "Escrow"]) {
  const { bytecode } = await compileContract(name);
  console.log(`✓ ${name} compiled — ${bytecode.length / 2} bytes`);
}
