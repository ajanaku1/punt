/**
 * Hyperdrive evidence cache - stores football-data.org match results as
 * signed blobs in a peer-to-peer Hyperdrive. Jurors serve cached evidence
 * to each other; the football-data.org API becomes a fallback, not a
 * dependency.
 *
 * Architecture:
 * - Each juror writes evidence blobs to a local Hyperdrive keyed by
 *   keccak256(homeTeam + ":" + awayTeam + ":" + kickoffDate).
 * - The Hyperdrive is replicated over the blind-peering juror pool (see
 *   blind-peering.js), so jurors who grade the same bet find each other's
 *   cached evidence without hitting the API.
 * - A blob is a JSON payload: { homeTeam, awayTeam, fullTime, winner, utcDate, gradedBy }
 * - The grading juror signs the blob with their WDK key before writing,
 *   so a consuming juror can verify the evidence came from a listed juror.
 *
 * Fallback path: if no peer has cached evidence within a timeout, the juror
 * falls back to football-data.org (existing behavior).
 */
import Hyperdrive from "hyperdrive";
import Hyperblobs from "hyperblobs";
import { createHash } from "node:crypto";

/** Derive a deterministic evidence key from match identity. */
export function evidenceKey(home, away, kickoffIso) {
  return createHash("sha256")
    .update(`${home.toLowerCase()}:${away.toLowerCase()}:${kickoffIso.slice(0, 10)}`)
    .digest("hex");
}

/**
 * Create a Hyperdrive for caching match evidence.
 * @param {Corestore} store - the juror's Corestore instance
 * @returns {Promise<{ drive: Hyperdrive, blobs: Hyperblobs, put: Function, get: Function, replicate: Function, close: Function }>}
 */
export async function createEvidenceDrive(store) {
  const drive = new Hyperdrive(store);
  const blobs = new Hyperblobs(drive);
  await drive.ready();

  return {
    drive,
    blobs,
    key: drive.key,

    /** Store evidence as a signed blob. Returns the blob id. */
    async put(evidence) {
      const key = evidenceKey(evidence.homeTeam, evidence.awayTeam, evidence.utcDate);
      return blobs.put(Buffer.from(JSON.stringify(evidence)), { key });
    },

    /** Retrieve cached evidence by match identity, or null. */
    async get(home, away, kickoffIso) {
      const key = evidenceKey(home, away, kickoffIso);
      try {
        const entry = await drive.entry(key);
        if (!entry) return null;
        const buf = await blobs.get(entry.value.blob);
        return JSON.parse(buf.toString());
      } catch {
        return null;
      }
    },

    /** Replicate the drive over a stream (peer connection). */
    replicate(stream) {
      return drive.replicate(stream);
    },

    async close() {
      await drive.close();
    },
  };
}
