import { BOND_LEN } from "../model/constants";

/**
 * Self-calibrates an imported file's coordinate scale onto this app's own
 * BOND_LEN, given the raw (pre-scale) lengths of every bond in the file.
 *
 * Prefers the median length among bonds between two heavy (non-hydrogen)
 * atoms. Many real-world files — including PubChem's — write every
 * hydrogen out as its own explicit atom with a short (~1.09 Å) bond, and
 * since those often outnumber the molecule's heavy-atom skeleton bonds
 * (~1.5 Å) for a large, hydrogen-rich molecule, blending them into one
 * flat median drags the calibration bond length down — which then makes
 * the *whole* molecule (heavy-atom skeleton included) render oversized
 * relative to every other molecule's normal BOND_LEN-scale bonds. Measuring
 * heavy-heavy bonds only avoids that; falls back to every bond's length
 * (then to a fixed default) if there are no heavy-heavy bonds to measure.
 */
export function calibrateImportScale(allLengths: number[], heavyLengths: number[], fallbackRawLength: number): number {
  const pool = heavyLengths.length > 0 ? heavyLengths : allLengths;
  if (pool.length === 0) return BOND_LEN / fallbackRawLength;
  const sorted = [...pool].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return BOND_LEN / median;
}
