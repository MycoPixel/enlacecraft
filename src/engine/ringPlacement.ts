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
  if (template.fused) {
    return placeNaphthalene(mol, center, attachAtomId);
  }

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

/**
 * Places naphthalene: two regular hexagons (each with every bond length
 * equal to BOND_LEN) fused sharing one edge — 10 carbons, 11 bonds. Unlike
 * the generic polygon code above, this shape isn't point-symmetric, so it's
 * built from a fixed local layout (fusion bond vertical, the two hexagons
 * side by side) which is then rigidly rotated + translated into place —
 * onto `center` directly (empty canvas), or so that one of its own carbons
 * (`ATTACH_KEY`) lands on `attachAtomId` and the rest of the fused pair
 * extends away from that atom's existing bonds, mirroring how the generic
 * placeRing above orients a single ring off an attach atom.
 *
 * Kekulé structure: the shared fusion bond (S1-S2) is one of the five
 * double bonds, plus two more alternating double bonds per ring — that
 * pattern is what gives the two bridgehead carbons (S1, S2) zero implicit
 * hydrogens and every other carbon exactly one, so the resulting formula is
 * C10H8 (MW ~128.17 g/mol, matching real naphthalene).
 */
function placeNaphthalene(mol: Molecule, center: Point, attachAtomId: string | null): Molecule {
  const r = BOND_LEN; // a regular hexagon's circumradius equals its own bond length
  const a = (r * Math.sqrt(3)) / 2; // apothem — half the center-to-center distance between the two fused hexagons

  // Local layout, whole molecule's centroid at the origin, fusion bond
  // vertical at x = 0. S1/S2 are the two shared (bridgehead) carbons; A1-A4
  // and B1-B4 are each ring's other four carbons, in ring-walk order.
  const local: Record<string, Point> = {
    S1: { x: 0, y: -r / 2 },
    S2: { x: 0, y: r / 2 },
    A1: { x: -a, y: r },
    A2: { x: -2 * a, y: r / 2 },
    A3: { x: -2 * a, y: -r / 2 },
    A4: { x: -a, y: -r },
    B1: { x: a, y: -r },
    B2: { x: 2 * a, y: -r / 2 },
    B3: { x: 2 * a, y: r / 2 },
    B4: { x: a, y: r },
  };

  // Both hexagons' ring-walk bonds (each list includes the shared S1-S2
  // edge once); `double` encodes the Kekulé pattern from this function's
  // doc comment.
  const bonds: { from: string; to: string; double: boolean }[] = [
    { from: "S1", to: "S2", double: true }, // shared fusion bond
    { from: "S2", to: "A1", double: false },
    { from: "A1", to: "A2", double: true },
    { from: "A2", to: "A3", double: false },
    { from: "A3", to: "A4", double: true },
    { from: "A4", to: "S1", double: false },
    { from: "S1", to: "B1", double: false },
    { from: "B1", to: "B2", double: true },
    { from: "B2", to: "B3", double: false },
    { from: "B3", to: "B4", double: true },
    { from: "B4", to: "S2", double: false },
  ];

  // A plain (non-bridgehead) carbon to fuse onto an existing atom through —
  // it picks up exactly one double + one single ring bond, leaving one
  // valence slot free for whatever that atom was already bonded to, same
  // budget a single-ring attach atom leaves.
  const ATTACH_KEY = "A3";

  let theta = 0;
  let tx = center.x;
  let ty = center.y;

  if (attachAtomId) {
    const atom = mol.atoms[attachAtomId];
    const existingAngles = neighborAngles(mol, attachAtomId);
    const dir = existingAngles.length ? existingAngles[0] + Math.PI : -Math.PI / 2;
    const v0 = local[ATTACH_KEY];
    const localDir = angleOf(v0, { x: 0, y: 0 }); // local direction from the attach vertex toward the rest of the fused pair
    theta = dir - localDir; // rotate so that direction now points along `dir`, i.e. away from the atom's existing bonds
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rotatedV0 = { x: v0.x * cos - v0.y * sin, y: v0.x * sin + v0.y * cos };
    tx = atom.x - rotatedV0.x;
    ty = atom.y - rotatedV0.y;
  }

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const worldOf = (p: Point): Point => ({
    x: tx + p.x * cos - p.y * sin,
    y: ty + p.x * sin + p.y * cos,
  });

  let working = mol;
  const ids: Record<string, string> = {};
  for (const key in local) {
    if (attachAtomId && key === ATTACH_KEY) {
      // Fusing onto an existing atom: leave its element/identity as-is
      // rather than minting a new one — see placeRing's matching comment.
      ids[key] = attachAtomId;
      continue;
    }
    const id = nextId();
    working = addAtom(working, id, worldOf(local[key]), "C");
    ids[key] = id;
  }

  for (const b of bonds) {
    working = addBond(working, nextId(), ids[b.from], ids[b.to], b.double ? 2 : 1, "none");
  }

  return working;
}
