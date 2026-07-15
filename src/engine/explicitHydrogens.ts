import type { Molecule, Point } from "../types/chemistry";
import { polar } from "../model/geometry";
import { implicitH, neighborAngles } from "../model/valence";
import { BOND_LEN } from "../model/constants";

/** Angular spacing between adjacent hydrogens in a fanned-out group. Its
 * own constant (rather than reusing the chain tool's 30° zig-zag kink)
 * since the two are conceptually unrelated even though the values are
 * close — this one's picked purely so 3-4 fanned H's read as a tidy
 * cluster rather than a wide, loose spread. */
const H_FAN_SPACING = (26 * Math.PI) / 180;

/** One implicit hydrogen, made explicit: a real position to draw a bond
 * and an "H" label at, for the "expanded structural formula" view (see
 * showExpandedFormula in the store). Purely a rendering-time computation —
 * these are never added to the actual Molecule, so toggling the view back
 * off, undo/redo, export formats, valence checks, etc. all stay exactly as
 * if it had never been on. */
export interface ExplicitHydrogen {
  /** The heavy atom this hydrogen belongs to. */
  atomId: string;
  x: number;
  y: number;
}

/**
 * Computes where every carbon's implicit hydrogens would be drawn if made
 * explicit, fanned out into the open space around each atom:
 *  - An atom with no existing bonds (e.g. a bare "C" standing for methane)
 *    gets its hydrogens spread evenly around the full circle.
 *  - An atom with existing bonds gets its hydrogens fanned, evenly spaced,
 *    centered in the single largest open angular gap between its existing
 *    bonds — so a terminal -CH3's three H's fan out away from the chain,
 *    and an interior -CH2-'s two H's fan out to whichever side has more
 *    room, matching how these are conventionally drawn by hand.
 * Bond length matches every other bond in the app, for visual consistency.
 *
 * Carbon-only: heteroatoms (O, N, S, ...) already show their own hydrogen
 * count as part of their label text regardless of this toggle — an -OH or
 * -NH2 is always spelled out, since a heteroatom is never an implicit,
 * label-less vertex the way a plain carbon is. Fanning out separate H
 * bonds for them too would just duplicate what's already shown.
 */
export function computeExplicitHydrogens(mol: Molecule): ExplicitHydrogen[] {
  const result: ExplicitHydrogen[] = [];
  for (const atomId in mol.atoms) {
    const atom = mol.atoms[atomId];
    if (atom.element !== "C") continue;
    const count = implicitH(mol, atomId);
    if (count === 0) continue;
    const existing = neighborAngles(mol, atomId);
    for (const angle of fanAngles(existing, count)) {
      const p: Point = polar(atom.x, atom.y, BOND_LEN, angle);
      result.push({ atomId, x: p.x, y: p.y });
    }
  }
  return result;
}

function fanAngles(existingBondAngles: number[], count: number): number[] {
  if (existingBondAngles.length === 0) {
    // No bonds to fan around — spread evenly around the whole circle,
    // starting straight up, e.g. methane's four H's as a symmetric cross.
    return Array.from({ length: count }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / count);
  }
  const center = largestGapCenter(existingBondAngles);
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => center + (i - mid) * H_FAN_SPACING);
}

/** The angular midpoint of the largest gap between consecutive angles
 * (sorted, wrapping around the circle). `angles` must be non-empty. */
function largestGapCenter(angles: number[]): number {
  const sorted = [...angles].sort((a, b) => a - b);
  let bestGap = -Infinity;
  let bestCenter = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI);
    const gap = b - a;
    if (gap > bestGap) {
      bestGap = gap;
      bestCenter = a + gap / 2;
    }
  }
  return bestCenter;
}
