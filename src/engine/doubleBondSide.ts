import type { Bond, Molecule } from "../types/chemistry";
import { angleOf } from "../model/geometry";
import { neighborIds } from "../model/valence";

/**
 * Resolves how a double bond's second line should actually be drawn:
 *  - An explicit "center" | "left" | "right" (set by the user cycling the
 *    double-bond tool) always wins.
 *  - "auto" (the default for every new double bond) looks at each bonded
 *    atom's *other* neighbors and draws the second line toward whichever
 *    side they sit on. For a ring, every other ring atom lies on the
 *    interior side of any given edge, so this naturally puts the inner
 *    line toward the ring's center (the classic benzene look) with no
 *    special-casing for rings needed — and it re-evaluates any time bonds
 *    are added or removed nearby (e.g. fusing another ring on one side).
 *  - Falls back to "center" when neighbors are absent or evenly split.
 */
export function resolveDoubleBondSide(mol: Molecule, bond: Bond): "center" | "left" | "right" {
  if (bond.doubleSide !== "auto") return bond.doubleSide;

  const a1 = mol.atoms[bond.a1];
  const a2 = mol.atoms[bond.a2];
  if (!a1 || !a2) return "center";

  const ang = angleOf(a1, a2);
  const perp = ang + Math.PI / 2;
  const ux = Math.cos(perp);
  const uy = Math.sin(perp);

  let posCount = 0;
  let negCount = 0;

  const tally = (center: { x: number; y: number }, ids: string[]) => {
    for (const id of ids) {
      if (id === bond.a1 || id === bond.a2) continue;
      const p = mol.atoms[id];
      if (!p) continue;
      const dot = (p.x - center.x) * ux + (p.y - center.y) * uy;
      if (Math.abs(dot) < 0.5) continue; // essentially collinear, ignore
      if (dot > 0) posCount++; else negCount++;
    }
  };

  tally(a1, neighborIds(mol, bond.a1));
  tally(a2, neighborIds(mol, bond.a2));

  if (posCount === negCount) return "center";
  return posCount > negCount ? "right" : "left";
}
