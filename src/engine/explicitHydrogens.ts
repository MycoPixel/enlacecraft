import type { Molecule, Point } from "../types/chemistry";
import { addAtom, addBond } from "../model/molecule";
import { polar, largestGapAngle } from "../model/geometry";
import { implicitH, neighborAngles } from "../model/valence";
import { BOND_LEN } from "../model/constants";
import { nextId } from "../model/id";

/** Angular spacing between adjacent hydrogens in a fanned-out group. Its
 * own constant (rather than reusing the chain tool's 30 degree zig-zag
 * kink) since the two are conceptually unrelated even though the values
 * are close -- this one's picked purely so 3-4 fanned H's read as a tidy
 * cluster rather than a wide, loose spread. */
const H_FAN_SPACING = (26 * Math.PI) / 180;

/**
 * Adds a real terminal H atom and single bond for every implicit
 * hydrogen on every carbon, fanned into the open space around each atom:
 *  - An atom with no existing bonds (e.g. a bare "C" standing for methane)
 *    gets its hydrogens spread evenly around the full circle.
 *  - An atom with existing bonds gets its hydrogens fanned, evenly spaced,
 *    centered in the single largest open angular gap between its existing
 *    bonds -- so a terminal -CH3's three H's fan out away from the chain,
 *    and an interior -CH2-'s two H's fan out to whichever side has more
 *    room, matching how these are conventionally drawn by hand.
 * Bond length matches every other bond in the app, for visual consistency.
 *
 * This is a genuine structural edit -- same as drawing the H's by hand --
 * not a view setting: the new atoms are real (selectable, movable,
 * deletable, counted by formula/valence/export like any other atom), so
 * this belongs behind an undoable action (see the store's
 * toggleExplicitHydrogens), not a toggle that silently reverts on its
 * own. stripExplicitHydrogens (molecule.ts) is the reverse direction.
 *
 * Carbon-only, matching stripExplicitHydrogens' own scope: heteroatoms
 * (O, N, S, ...) already show their hydrogen count as part of their
 * label text (-OH, -NH2) regardless of this action -- they're never an
 * implicit, label-less vertex the way a plain carbon is, so there's
 * nothing to expand for them.
 *
 * Safe to call on a molecule that already has some real explicit H's
 * (whether hand-drawn or from a previous call): implicitH() accounts for
 * bonds that already exist, so an atom that's already fully explicit
 * simply gets zero new hydrogens rather than duplicates.
 */
export function addExplicitHydrogens(mol: Molecule): Molecule {
  let next = mol;
  for (const atomId in mol.atoms) {
    const atom = mol.atoms[atomId];
    if (atom.element !== "C") continue;
    const count = implicitH(next, atomId);
    if (count === 0) continue;
    const existing = neighborAngles(next, atomId);
    for (const angle of fanAngles(existing, count)) {
      const p: Point = polar(atom.x, atom.y, BOND_LEN, angle);
      const hId = nextId();
      next = addAtom(next, hId, p, "H");
      next = addBond(next, nextId(), atomId, hId, 1);
    }
  }
  return next;
}

function fanAngles(existingBondAngles: number[], count: number): number[] {
  if (existingBondAngles.length === 0) {
    // No bonds to fan around -- spread evenly around the whole circle,
    // starting straight up, e.g. methane's four H's as a symmetric cross.
    return Array.from({ length: count }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / count);
  }
  const center = largestGapAngle(existingBondAngles);
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => center + (i - mid) * H_FAN_SPACING);
}
