/** Read/update the gitignored .env — secrets only ever live there, never printed. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ENV_PATH = join(ROOT, ".env");

export async function readEnvFile() {
  const text = await readFile(ENV_PATH, "utf8").catch(() => "");
  const map = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

export async function writeEnvFile(map) {
  const body = [...map].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  await writeFile(ENV_PATH, body, "utf8");
}
