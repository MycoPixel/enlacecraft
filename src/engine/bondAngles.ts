import type { Molecule } from "../types/chemistry";
import { angleDelta, snapAngle } from "../model/geometry";
import { neighborAngles } from "../model/valence";

/** Smallest absolute angle between two directions, in radians (0..π). */
function angularDistance(a: number, b: number): number {
  return Math.abs(angleDelta(a, b));
}

/**
 * Direction in the middle of the widest gap between the given bond angles.
 * Used when an atom already has two or more bonds: that gap is the most open
 * side to add another substituent, and is what keeps repeat clicks from
 * piling a new bond on top of an existing one.
 */
function widestGapBisector(existing: number[]): number {
  const twoPi = Math.PI * 2;
  const sorted = existing
    .map((a) => ((a % twoPi) + twoPi) % twoPi)
    .sort((a, b) => a - b);
  let bestStart = sorted[sorted.length - 1];
  let bestGap = sorted[0] + twoPi - bestStart;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > bestGap) {
      bestGap = gap;
      bestStart = sorted[i];
    }
  }
  return bestStart + bestGap / 2;
}

/**
 * Chooses the angle for a new bond drawn from `atomId`.
 *  - If the user dragged in a particular direction, snap that to the
 *    current snap step (30° by default) — unless `freeform` (held Shift
 *    while dragging), which follows the cursor exactly instead, for the
 *    rare case a bond needs to land at a genuinely arbitrary angle (e.g.
 *    matching an unusually-drawn import).
 *  - If they just clicked (no explicit direction) and the atom already has
 *    one bond, continue the chain at 120° for a natural zig-zag — this
 *    default doesn't change with `freeform`, since there's no dragged
 *    direction to keep exact in that case anyway.
 *  - With two or more existing bonds, aim for the middle of the widest open
 *    gap instead. This is what makes clicking the bond tool on the same atom
 *    repeatedly fan new bonds out around it, rather than always choosing
 *    `firstBond + 120°` and drawing every new bond underneath the previous
 *    one.
 *  - Otherwise default to a 30°-up-right start.
 *
 * `snapStep` is threaded in rather than read from the store so this module
 * stays pure; the caller passes the user's snap-angle preference, and a
 * non-positive value means "don't snap" (see snapAngle).
 */
export function bestNewAngle(
  mol: Molecule,
  atomId: string,
  desiredAngle: number | null,
  freeform: boolean = false,
  snapStep: number = Math.PI / 6
): number {
  const existing = neighborAngles(mol, atomId);

  if (desiredAngle != null) return freeform ? desiredAngle : snapAngle(desiredAngle, snapStep);

  if (existing.length === 0) return -Math.PI / 6;

  if (existing.length === 1) {
    const base = existing[0];
    return snapAngle(base + (2 * Math.PI) / 3, snapStep);
  }

  const bisector = widestGapBisector(existing);
  if (snapStep <= 0) return bisector;

  // Snap the bisector, then walk out along the grid if snapping happened to
  // land it on top of an existing bond (possible when the open gap is
  // narrower than one snap step). Prefer the candidate farthest from every
  // existing bond.
  const snapped = snapAngle(bisector, snapStep);
  let best = snapped;
  let bestScore = Math.min(...existing.map((a) => angularDistance(snapped, a)));
  for (let step = 1; step <= 6; step++) {
    for (const direction of [-1, 1]) {
      const candidate = snapped + direction * step * snapStep;
      const score = Math.min(...existing.map((a) => angularDistance(candidate, a)));
      if (score > bestScore + 1e-9) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best;
}
