import type { Molecule, Point, RingTemplate } from "../types/chemistry";
import { addAtom, addBond } from "../model/molecule";
import { angleOf, polar } from "../model/geometry";
import { neighborAngles } from "../model/valence";
import { BOND_LEN } from "../model/constants";
import { nextId } from "../model/id";

/**
 * Places a new ring in `mol`, either centered at `center` (empty canvas),
 * or fused onto `attachAtomId` if provided (sharing that one atom, extended
 * away from its existing bonds).
 */
export function placeRing(
  mol: Molecule,
  template: RingTemplate,
  center: Point,
  attachAtomId: string | null
): Molecule {
  const sides = template.sides;
  const r = BOND_LEN / (2 * Math.sin(Math.PI / sides));
  let cx = center.x;
  let cy = center.y;
  let startAngle = -Math.PI / 2;

  if (attachAtomId) {
    const a = mol.atoms[attachAtomId];
    const existingAngles = neighborAngles(mol, attachAtomId);
    const dir = existingAngles.length ? existingAngles[0] + Math.PI : -Math.PI / 2;
    cx = a.x + r * Math.cos(dir);
    cy = a.y + r * Math.sin(dir);
    startAngle = angleOf({ x: cx, y: cy }, a);
  }

  let working = mol;
  const ids: string[] = [];

  for (let i = 0; i < sides; i++) {
    if (i === 0 && attachAtomId) {
      // Fusing onto an existing atom: leave its element as-is rather than
      // overwriting it with a heteroatom override — see RingTemplate's
      // heteroatoms doc comment.
      ids.push(attachAtomId);
      continue;
    }
    const ang = startAngle + (i * 2 * Math.PI) / sides;
    const p = polar(cx, cy, r, ang);
    const id = nextId();
    const element = template.heteroatoms?.find((h) => h.position === i)?.element ?? "C";
    working = addAtom(working, id, p, element);
    ids.push(id);
  }

  for (let i = 0; i < sides; i++) {
    const a1 = ids[i];
    const a2 = ids[(i + 1) % sides];
    const order = template.bondOrders?.[i] ?? (template.aromatic && i % 2 === 0 ? 2 : 1);
    working = addBond(working, nextId(), a1, a2, order, "none");
  }

  return working;
}
