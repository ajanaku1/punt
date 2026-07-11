import { readFile } from "node:fs/promises";
import { join } from "node:path";
import solc from "solc";
import { ROOT } from "./env-file.js";

/**
 * Compile contracts/<name>.sol with the exact settings the tests and the
 * deploy share — one source of truth for the bytecode we ship. No RPC, no
 * keys, no network: safe to run in CI.
 *
 * @returns {Promise<{ abi: object[], bytecode: string }>}
 */
export async function compileContract(name) {
  const source = await readFile(join(ROOT, "contracts", `${name}.sol`), "utf8");
  const input = {
    language: "Solidity",
    sources: { [`${name}.sol`]: { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const c = out.contracts[`${name}.sol`][name];
  return { abi: c.abi, bytecode: c.evm.bytecode.object };
}
