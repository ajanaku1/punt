/**
 * Persistent peer identity via keet-identity-key.
 *
 * Each peer generates or loads a persistent keypair so identity survives
 * restarts. The fingerprint is surfaced in the stack HUD so the user can
 * recognize their own peer and verify other peers aren't being spoofed.
 *
 * Identity is stored as a 64-byte hex seed in a file under the peer's
 * storage directory. The same seed produces the same keypair every session.
 */
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "hypercore-crypto";

const IDENTITY_FILE = "peer-identity.seed";

/** Load or create a persistent keypair. Returns { publicKey, seed, fingerprint }. */
export async function loadOrCreateIdentity(storageDir) {
  const seedPath = join(storageDir, IDENTITY_FILE);
  let seed;

  if (existsSync(seedPath)) {
    seed = Buffer.from(await readFile(seedPath, "utf-8").then((s) => s.trim()), "hex");
    if (seed.length !== 32) throw new Error("corrupted identity seed");
  } else {
    seed = crypto.randomBytes(32);
    await mkdir(storageDir, { recursive: true });
    await writeFile(seedPath, seed.toString("hex"));
  }

  const keyPair = crypto.keyPair(seed);
  const fingerprint = keyPair.publicKey.toString("hex").slice(0, 12); // short, human-readable

  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    seed,
    /** Short hex fingerprint for the stack HUD. */
    fingerprint,
  };
}
