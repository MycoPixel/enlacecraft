import type { Atom, Bond, BondOrder, BondStereo, DoubleBondSide, Element, Molecule, Point } from "../types/chemistry";
import { nextId } from "./id";

export function emptyMolecule(): Molecule {
  return { atoms: {}, bonds: {} };
}

export function cloneMolecule(mol: Molecule): Molecule {
  return { atoms: { ...mol.atoms }, bonds: { ...mol.bonds } };
}

/**
 * All structural edits are pure functions: (Molecule, args) -> Molecule.
 * This keeps the chemistry model fully decoupled from Zustand/React,
 * so it's easy to unit test or reuse (e.g. in a headless import script).
 */

export function addAtom(mol: Molecule, id: string, p: Point, element: Element, group?: string, isotope?: number): Molecule {
  return {
    ...mol,
    atoms: { ...mol.atoms, [id]: { id, x: p.x, y: p.y, element, charge: 0, chargeOffsetX: 0, chargeOffsetY: 0, group, isotope } },
  };
}

/** Sets (or, called again with the same preset, effectively re-asserts) an
 * atom's element + isotope together — see Atom.isotope's doc comment for
 * why these travel as a pair rather than isotope alone. */
export function setAtomIsotope(mol: Molecule, id: string, element: Element, massNumber: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, element, isotope: massNumber, group: undefined } } };
}

/** Clears an atom's isotope label, returning it to the standard isotope. */
export function clearAtomIsotope(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, isotope: undefined } } };
}

/** Cycles an atom's manually-asserted stereo descriptor: none -> R -> S -> none. */
export function cycleAtomStereoLabel(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  const next = a.stereoLabel === "R" ? "S" : a.stereoLabel === "S" ? undefined : "R";
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, stereoLabel: next } } };
}

export function addBond(
  mol: Molecule,
  id: string,
  a1: string,
  a2: string,
  order: BondOrder = 1,
  stereo: BondStereo = "none"
): Molecule {
  if (a1 === a2) return mol;
  const duplicate = Object.values(mol.bonds).find(
    (b) => (b.a1 === a1 && b.a2 === a2) || (b.a1 === a2 && b.a2 === a1)
  );
  if (duplicate) return mol;
  const bond: Bond = { id, a1, a2, order, stereo, doubleSide: "auto" };
  return { ...mol, bonds: { ...mol.bonds, [id]: bond } };
}

export function moveAtoms(mol: Molecule, moves: Record<string, Point>): Molecule {
  const atoms = { ...mol.atoms };
  for (const id in moves) {
    if (atoms[id]) atoms[id] = { ...atoms[id], ...moves[id] };
  }
  return { ...mol, atoms };
}

export function setAtomElement(mol: Molecule, id: string, element: Element): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  // Picking a real element from the periodic-table picker always overrides
  // any abbreviated-group label or isotope this vertex previously had.
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, element, group: undefined, isotope: undefined } } };
}

/** Converts (or places) a vertex to an abbreviated-group shorthand — see
 * Atom.group's doc comment. `element` is set to a plain "C" placeholder
 * since group atoms don't participate in element-based valence math. */
export function setAtomGroup(mol: Molecule, id: string, group: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, element: "C", group, isotope: undefined } } };
}

export function setAtomCharge(mol: Molecule, id: string, delta: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, charge: a.charge + delta } } };
}

export function setAtomChargeOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, chargeOffsetX: dx, chargeOffsetY: dy } } };
}

export function setAtomLonePairsOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, lonePairsOffsetX: dx, lonePairsOffsetY: dy } } };
}

export function setAtomRadicalOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, radicalOffsetX: dx, radicalOffsetY: dy } } };
}

export function setAtomStereoLabelOffset(mol: Molecule, id: string, dx: number, dy: number): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, stereoLabelOffsetX: dx, stereoLabelOffsetY: dy } } };
}

/** Cycles an atom's shown lone-pair count 0 -> 1 -> 2 -> 3 -> 4 -> 0. */
export function cycleAtomLonePairs(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  const next = ((a.lonePairs ?? 0) + 1) % 5;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, lonePairs: next } } };
}

/** Toggles whether an atom shows a radical (unpaired electron) dot. */
export function toggleAtomRadical(mol: Molecule, id: string): Molecule {
  const a = mol.atoms[id];
  if (!a) return mol;
  return { ...mol, atoms: { ...mol.atoms, [id]: { ...a, radical: !a.radical } } };
}

export function setBondOrder(mol: Molecule, id: string, order: BondOrder): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, order, stereo: "none", doubleSide: "auto" } } };
}

export function setBondStereo(mol: Molecule, id: string, stereo: BondStereo): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, stereo, order: 1, doubleSide: "auto" } } };
}

/**
 * Swaps a bond's two endpoints. A wedge/dash's narrow end is always a1 and
 * its wide end a2 (see BondView), so this is what flips which atom a
 * wedge/dash points from — the two atoms and the bond itself are otherwise
 * unchanged. Clicking the wedge/dash tool again on a bond that's already
 * that stereo uses this to flip it in place, since there's nothing else
 * left for a repeat click on it to usefully do.
 */
export function flipBondDirection(mol: Molecule, id: string): Molecule {
  const b = mol.bonds[id];
  if (!b) return mol;
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, a1: b.a2, a2: b.a1 } } };
}

/** Rotates the given atoms around `center` by `angleRad` radians. Bonds are unaffected (they follow their atoms). */
export function rotateAtoms(mol: Molecule, atomIds: string[], center: Point, angleRad: number): Molecule {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const atoms = { ...mol.atoms };
  for (const id of atomIds) {
    const a = atoms[id];
    if (!a) continue;
    const dx = a.x - center.x;
    const dy = a.y - center.y;
    atoms[id] = { ...a, x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  }
  return { ...mol, atoms };
}

/**
 * Cycles a double bond's second-line placement: auto -> left -> right ->
 * center -> auto. Clicking the double-bond tool repeatedly on an existing
 * double bond steps through this, letting you override the automatic
 * placement and eventually return to it. No-op for bonds that aren't
 * currently order 2.
 */
export function cycleDoubleBondSide(mol: Molecule, id: string): Molecule {
  const b = mol.bonds[id];
  if (!b || b.order !== 2) return mol;
  const sequence: DoubleBondSide[] = ["auto", "left", "right", "center"];
  const next = sequence[(sequence.indexOf(b.doubleSide) + 1) % sequence.length];
  return { ...mol, bonds: { ...mol.bonds, [id]: { ...b, doubleSide: next } } };
}

export function deleteAtom(mol: Molecule, id: string): Molecule {
  const atoms = { ...mol.atoms };
  delete atoms[id];
  const bonds: Record<string, Bond> = {};
  for (const bid in mol.bonds) {
    const b = mol.bonds[bid];
    if (b.a1 !== id && b.a2 !== id) bonds[bid] = b;
  }
  return { atoms, bonds };
}

export function deleteBond(mol: Molecule, id: string): Molecule {
  const bonds = { ...mol.bonds };
  delete bonds[id];
  return { ...mol, bonds };
}

/**
 * Removes "simple" terminal hydrogen atoms — element H, a single bond, no
 * charge, no other bonds — and the bonds connecting them. Used when
 * importing files that list every hydrogen explicitly (common in real-world
 * MOL/SDF output, including PubChem's), so imported molecules match this
 * app's skeletal display convention. implicitH() re-derives the same count
 * from the remaining heavy atom's valence, so no chemical information is
 * lost — only the redundant explicit graph nodes are removed. Hydrogens
 * that are multiply-bonded, charged, or isotopically labeled (rare, but
 * chemically meaningful) are deliberately left alone.
 */
export function stripExplicitHydrogens(mol: Molecule): Molecule {
  const bondsByAtom = new Map<string, Bond[]>();
  for (const b of Object.values(mol.bonds)) {
    (bondsByAtom.get(b.a1) ?? bondsByAtom.set(b.a1, []).get(b.a1)!).push(b);
    (bondsByAtom.get(b.a2) ?? bondsByAtom.set(b.a2, []).get(b.a2)!).push(b);
  }

  const atoms = { ...mol.atoms };
  const bonds = { ...mol.bonds };

  for (const id in mol.atoms) {
    const a = mol.atoms[id];
    if (a.element !== "H" || a.charge !== 0 || a.isotope || a.group) continue;
    const connected = bondsByAtom.get(id) ?? [];
    if (connected.length !== 1 || connected[0].order !== 1 || connected[0].stereo !== "none") continue;
    delete atoms[id];
    delete bonds[connected[0].id];
  }

  return { atoms, bonds };
}

/**
 * Extracts the induced subgraph of `mol` restricted to `atomIds`: those
 * atoms plus every bond whose both endpoints are in the set. Ids are kept
 * as-is (unlike insertMolecule, which mints fresh ones) since this is a
 * read-only snapshot for copy/export, not something merged into a live
 * molecule.
 */
export function subMolecule(mol: Molecule, atomIds: Iterable<string>): Molecule {
  const idSet = new Set(atomIds);
  const atoms: Record<string, Atom> = {};
  for (const id of idSet) {
    const a = mol.atoms[id];
    if (a) atoms[id] = a;
  }
  const bonds: Record<string, Bond> = {};
  for (const id in mol.bonds) {
    const b = mol.bonds[id];
    if (idSet.has(b.a1) && idSet.has(b.a2)) bonds[id] = b;
  }
  return { atoms, bonds };
}

/** All atoms reachable from `atomId` by traversing bonds (its connected fragment). */
export function fragmentOf(mol: Molecule, atomId: string): Set<string> {
  const visited = new Set<string>([atomId]);
  const stack = [atomId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const b of Object.values(mol.bonds)) {
      const other = b.a1 === cur ? b.a2 : b.a2 === cur ? b.a1 : null;
      if (other && !visited.has(other)) {
        visited.add(other);
        stack.push(other);
      }
    }
  }
  return visited;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundingBox(mol: Molecule): BoundingBox | null {
  const ids = Object.keys(mol.atoms);
  if (ids.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const a = mol.atoms[id];
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Merges `incoming` into `base`, assigning every incoming atom/bond a fresh
 * id (so it can never collide with what's already on the canvas) and
 * shifting positions by (dx, dy). Used to drop a fetched/imported compound
 * onto an existing drawing without disturbing anything already there.
 */
export function insertMolecule(
  base: Molecule,
  incoming: Molecule,
  dx: number,
  dy: number
): { mol: Molecule; newAtomIds: string[] } {
  const idMap: Record<string, string> = {};
  const atoms = { ...base.atoms };
  const bonds = { ...base.bonds };
  const newAtomIds: string[] = [];

  for (const oldId in incoming.atoms) {
    const a = incoming.atoms[oldId];
    const newId = nextId();
    idMap[oldId] = newId;
    atoms[newId] = {
      id: newId,
      x: a.x + dx,
      y: a.y + dy,
      element: a.element,
      charge: a.charge,
      chargeOffsetX: a.chargeOffsetX ?? 0,
      chargeOffsetY: a.chargeOffsetY ?? 0,
    };
    newAtomIds.push(newId);
  }
  for (const oldId in incoming.bonds) {
    const b = incoming.bonds[oldId];
    const newId = nextId();
    bonds[newId] = { id: newId, a1: idMap[b.a1], a2: idMap[b.a2], order: b.order, stereo: b.stereo, doubleSide: b.doubleSide };
  }

  return { mol: { atoms, bonds }, newAtomIds };
}
