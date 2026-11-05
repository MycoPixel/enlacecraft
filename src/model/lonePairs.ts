import type { Molecule } from "../types/chemistry";

/** Distance from the atom center a lone pair's dots sit at, matching the
 * old fixed cardinal-slot radius so existing single-lone-pair drawings
 * (by far the most common case) look the same as before. */
export const LONE_PAIR_DISTANCE = 11;

/** Angular separation between adjacent lone pairs on the same atom, in
 * degrees, when there's room for it — e.g. two lone pairs on an atom with
 * one bond pointing straight down end up at roughly "10 o'clock" and "2
 * o'clock" (±27.5° either side of straight up) rather than one on top and
 * one out to the side. */
const ANGULAR_STEP_DEG = 55;

/**
 * Picks a good default local (x, y) position for lone pair `index` (of
 * `total` on this atom), used whenever that pair doesn't have its own
 * dragged-into-place override (see Atom.lonePairOffsets's doc comment).
 *
 * The core idea: find the largest open angular gap between this atom's
 * existing bonds — the direction with the most free space around it — and
 * place lone pairs symmetrically around the middle of that gap, spaced
 * `ANGULAR_STEP_DEG` apart (narrowed if needed so they still fit inside
 * the gap). For the common case of a terminal atom with one (non-H) bond,
 * that gap is "everything except where the bond goes", so its middle is
 * directly opposite the bond — e.g. an -OH pointing down from a ring
 * carbon gets its lone pairs placed above, split left/right of straight
 * up, exactly like a chemist would draw it by hand.
 *
 * Explicit hydrogen neighbors (a drawn N-H or O-H, as opposed to an
 * implicit/label-only H) are deliberately excluded from this search
 * whenever the atom has at least one non-H neighbor too — e.g. a ring
 * N-H's lone pair should orient off the two ring bonds, not the N-H bond.
 * Without this, an N-H (or O-H) whose hydrogen happens to sit roughly
 * opposite or symmetrically between the heavy-atom bonds produces two
 * nearly-tied candidate gaps, and small position changes flip which one
 * "wins" — which looks like the lone pair swinging back and forth around
 * the N-H/O-H bond rather than staying still relative to the ring or
 * chain it's actually attached to. An atom bonded ONLY to hydrogens (bare
 * water/ammonia-like fragments) has no heavy-atom direction to prefer, so
 * it falls back to using the H bonds after all.
 *
 * An atom with no bonds at all (a freshly placed, unconnected atom) falls
 * back to straight up for a single pair, matching the previous fixed
 * top/right/bottom/left slot order for additional ones.
 */
export function defaultLonePairPosition(
  mol: Molecule,
  atomId: string,
  index: number,
  total: number
): { x: number; y: number } {
  const atom = mol.atoms[atomId];
  if (!atom) return { x: 0, y: -LONE_PAIR_DISTANCE };

  const heavyAngles: number[] = [];
  const allAngles: number[] = [];
  for (const bond of Object.values(mol.bonds)) {
    const otherId = bond.a1 === atomId ? bond.a2 : bond.a2 === atomId ? bond.a1 : null;
    if (!otherId) continue;
    const other = mol.atoms[otherId];
    if (!other) continue;
    const angle = Math.atan2(other.y - atom.y, other.x - atom.x);
    allAngles.push(angle);
    if (other.element !== "H") heavyAngles.push(angle);
  }
  const neighborAngles = heavyAngles.length > 0 ? heavyAngles : allAngles;

  const { center, gapWidth } = bestOpenGap(neighborAngles);

  // Spread pairs evenly around the gap's center, narrowing the spacing
  // (rather than overflowing into the bonds on either side) if the gap
  // isn't wide enough for the default step at this many pairs.
  const desiredSpread = ANGULAR_STEP_DEG * (total - 1);
  const maxSpread = ((gapWidth * 180) / Math.PI) * 0.8; // keep an 20% margin from the bonds
  const spreadDeg = total > 1 ? Math.min(desiredSpread, maxSpread) : 0;
  const stepDeg = total > 1 ? spreadDeg / (total - 1) : 0;
  const stepRad = (stepDeg * Math.PI) / 180;

  const offsetFromCenter = index - (total - 1) / 2;
  const angle = center + offsetFromCenter * stepRad;

  return {
    x: LONE_PAIR_DISTANCE * Math.cos(angle),
    y: LONE_PAIR_DISTANCE * Math.sin(angle),
  };
}

/** Finds the widest gap between consecutive bond angles (wrapping around
 * the circle) and returns its angular center and width, both in radians,
 * using the same atan2 convention as the rest of the canvas (0 = pointing
 * right, positive = clockwise on screen). No bonds at all is treated as
 * one huge gap centered straight up. */
function bestOpenGap(neighborAngles: number[]): { center: number; gapWidth: number } {
  if (neighborAngles.length === 0) {
    return { center: -Math.PI / 2, gapWidth: Math.PI * 2 };
  }

  const sorted = [...neighborAngles].sort((a, b) => a - b);
  const n = sorted.length;
  let bestGap = -Infinity;
  let bestCenter = -Math.PI / 2;

  for (let i = 0; i < n; i++) {
    const a = sorted[i];
    const b = (i + 1 < n ? sorted[i + 1] : sorted[0] + Math.PI * 2);
    const gap = b - a;
    if (gap > bestGap) {
      bestGap = gap;
      bestCenter = a + gap / 2;
    }
  }

  // Normalize to (-pi, pi] purely for readability/consistency — cos/sin
  // below don't care, but it keeps stored/inspected angles predictable.
  while (bestCenter > Math.PI) bestCenter -= Math.PI * 2;
  while (bestCenter <= -Math.PI) bestCenter += Math.PI * 2;

  return { center: bestCenter, gapWidth: bestGap };
}
