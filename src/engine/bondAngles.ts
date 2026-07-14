import type { Molecule } from "../types/chemistry";
import { snapAngle } from "../model/geometry";
import { neighborAngles } from "../model/valence";

/**
 * Chooses the angle for a new bond drawn from `atomId`.
 *  - If the user dragged in a particular direction, snap that to 30° —
 *    unless `freeform` (held Shift while dragging), which follows the
 *    cursor exactly instead, for the rare case a bond needs to land at a
 *    genuinely arbitrary angle (e.g. matching an unusually-drawn import).
 *  - If they just clicked (no explicit direction) and the atom already has
 *    one bond, continue the chain at 120° for a natural zig-zag — this
 *    default doesn't change with `freeform`, since there's no dragged
 *    direction to keep exact in that case anyway.
 *  - Otherwise default to a 30°-up-right start.
 */
export function bestNewAngle(
  mol: Molecule,
  atomId: string,
  desiredAngle: number | null,
  freeform: boolean = false
): number {
  const existing = neighborAngles(mol, atomId);

  if (desiredAngle != null) return freeform ? desiredAngle : snapAngle(desiredAngle);

  if (existing.length === 0) return -Math.PI / 6;

  const base = existing[0];
  const candidateA = base + (2 * Math.PI) / 3;
  return snapAngle(candidateA);
}
