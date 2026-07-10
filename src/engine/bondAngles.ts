import type { Molecule } from "../types/chemistry";
import { snapAngle } from "../model/geometry";
import { neighborAngles } from "../model/valence";

/**
 * Chooses the angle for a new bond drawn from `atomId`.
 *  - If the user dragged in a particular direction, snap that to 30°.
 *  - If they just clicked (no explicit direction) and the atom already has
 *    one bond, continue the chain at 120° for a natural zig-zag.
 *  - Otherwise default to a 30°-up-right start.
 */
export function bestNewAngle(
  mol: Molecule,
  atomId: string,
  desiredAngle: number | null
): number {
  const existing = neighborAngles(mol, atomId);

  if (desiredAngle != null) return snapAngle(desiredAngle);

  if (existing.length === 0) return -Math.PI / 6;

  const base = existing[0];
  const candidateA = base + (2 * Math.PI) / 3;
  return snapAngle(candidateA);
}
