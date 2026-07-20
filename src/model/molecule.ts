import type { Atom, Bond, BondOrder, BondStereo, DoubleBondSide, Element, Molecule, Point } from "../types/chemistry";
import { nextId } from "./id";
import { BOND_LEN } from "./constants";
import { angleOf, dist, polar, snapAngle } from "./geometry";

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

/**
 * Groups the given atom ids into connected components, using only bonds
 * whose both ends are also in the given id set — i.e. "connected via the
 * current selection." Two selected atoms that are only connected through
 * an *unselected* atom count as separate components here.
 *
 * This is what lets align/distribute treat a whole bonded structure as one
 * rigid piece (see alignAtoms/distributeAtoms) instead of moving individual
 * atoms independently — the latter is what design tools do for independent
 * shapes, but for atoms joined by bonds of a fixed, meaningful length it
 * collapses the structure instead of arranging it. When every selected atom
 * happens to be its own component (e.g. several separate lone atoms), this
 * naturally reduces to the old atom-by-atom behavior.
 */
export function connectedComponents(mol: Molecule, atomIds: string[]): string[][] {
  const idSet = new Set(atomIds);
  const seen = new Set<string>();
  const components: string[][] = [];

  const neighborsWithin = (id: string): string[] => {
    const out: string[] = [];
    for (const b of Object.values(mol.bonds)) {
      if (b.a1 === id && idSet.has(b.a2)) out.push(b.a2);
      else if (b.a2 === id && idSet.has(b.a1)) out.push(b.a1);
    }
    return out;
  };

  for (const id of atomIds) {
    if (seen.has(id) || !mol.atoms[id]) continue;
    const comp: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nb of neighborsWithin(cur)) {
        if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
      }
    }
    components.push(comp);
  }
  return components;
}

interface Fragment { ids: string[]; atoms: Atom[]; minX: number; maxX: number; minY: number; maxY: number }

function fragmentsOf(mol: Molecule, atomIds: string[]): Fragment[] {
  return connectedComponents(mol, atomIds)
    .map((ids): Fragment | null => {
      const atoms = ids.map((id) => mol.atoms[id]).filter((a): a is Atom => !!a);
      if (atoms.length === 0) return null;
      return {
        ids,
        atoms,
        minX: Math.min(...atoms.map((a) => a.x)),
        maxX: Math.max(...atoms.map((a) => a.x)),
        minY: Math.min(...atoms.map((a) => a.y)),
        maxY: Math.max(...atoms.map((a) => a.y)),
      };
    })
    .filter((f): f is Fragment => f !== null);
}

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

/**
 * Aligns whole connected fragments (see connectedComponents) to a shared
 * edge or centerline computed from their combined bounding box — each
 * fragment slides rigidly as a unit, so its own bond lengths and angles are
 * completely unaffected, only its position relative to the other fragments
 * changes. A no-op with fewer than 2 fragments, since there's nothing to
 * align a single rigid piece to.
 */
export function alignAtoms(mol: Molecule, atomIds: string[], mode: AlignMode): Molecule {
  const fragments = fragmentsOf(mol, atomIds);
  if (fragments.length < 2) return mol;

  let axis: "x" | "y";
  let target: number;
  switch (mode) {
    case "left": axis = "x"; target = Math.min(...fragments.map((f) => f.minX)); break;
    case "right": axis = "x"; target = Math.max(...fragments.map((f) => f.maxX)); break;
    case "centerX": axis = "x"; target = (Math.min(...fragments.map((f) => f.minX)) + Math.max(...fragments.map((f) => f.maxX))) / 2; break;
    case "top": axis = "y"; target = Math.min(...fragments.map((f) => f.minY)); break;
    case "bottom": axis = "y"; target = Math.max(...fragments.map((f) => f.maxY)); break;
    case "centerY": axis = "y"; target = (Math.min(...fragments.map((f) => f.minY)) + Math.max(...fragments.map((f) => f.maxY))) / 2; break;
  }

  const atoms = { ...mol.atoms };
  for (const f of fragments) {
    let edge: number;
    switch (mode) {
      case "left": edge = f.minX; break;
      case "right": edge = f.maxX; break;
      case "centerX": edge = (f.minX + f.maxX) / 2; break;
      case "top": edge = f.minY; break;
      case "bottom": edge = f.maxY; break;
      case "centerY": edge = (f.minY + f.maxY) / 2; break;
    }
    const delta = target - edge;
    for (const id of f.ids) {
      const a = atoms[id];
      if (!a) continue;
      atoms[id] = axis === "x" ? { ...a, x: a.x + delta } : { ...a, y: a.y + delta };
    }
  }
  return { ...mol, atoms };
}

export type DistributeAxis = "horizontal" | "vertical";

/**
 * Evenly re-spaces 3+ whole fragments (see connectedComponents) between the
 * two extreme ones' centers along the given axis — like alignAtoms, each
 * fragment translates rigidly, so internal bond geometry never changes,
 * only spacing between fragments. A no-op with fewer than 3 fragments.
 */
export function distributeAtoms(mol: Molecule, atomIds: string[], axis: DistributeAxis): Molecule {
  const fragments = fragmentsOf(mol, atomIds);
  if (fragments.length < 3) return mol;

  const centerOf = (f: Fragment) => (axis === "horizontal" ? (f.minX + f.maxX) / 2 : (f.minY + f.maxY) / 2);
  const entries = fragments.map((f) => ({ f, center: centerOf(f) })).sort((p, q) => p.center - q.center);
  const first = entries[0].center;
  const last = entries[entries.length - 1].center;
  const step = (last - first) / (entries.length - 1);

  const atoms = { ...mol.atoms };
  entries.forEach((e, i) => {
    const delta = first + step * i - e.center;
    for (const id of e.f.ids) {
      const a = atoms[id];
      if (!a) continue;
      atoms[id] = axis === "horizontal" ? { ...a, x: a.x + delta } : { ...a, y: a.y + delta };
    }
  });
  return { ...mol, atoms };
}

/**
 * Detects rings within `componentIds` (assumed to already be one connected
 * fragment) as the fundamental cycles of a breadth-first spanning tree:
 * for every bond not used by the tree, the cycle it closes is the tree
 * path between its two atoms plus that bond itself. This finds every ring
 * exactly for the common case — one or more simple rings, optionally fused
 * (sharing an edge) or spiro-joined (sharing one atom) to each other or to
 * plain chains. For a bridged polycyclic system (two rings sharing more
 * than one edge), which atoms end up on which fundamental cycle can depend
 * on the arbitrary spanning tree — a true SSSR algorithm would be needed
 * to always recover the chemist's-eye "smallest rings" there. That's an
 * acceptable gap: bridged systems are rare in a 2D sketch tool, and this
 * still terminates and produces *some* reasonable ring, just possibly not
 * the visually smallest one.
 */
function detectRings(mol: Molecule, componentIds: string[]): string[][] {
  if (componentIds.length === 0) return [];
  const idSet = new Set(componentIds);
  const neighborsWithin = (id: string): string[] => {
    const out: string[] = [];
    for (const b of Object.values(mol.bonds)) {
      if (b.a1 === id && idSet.has(b.a2)) out.push(b.a2);
      else if (b.a2 === id && idSet.has(b.a1)) out.push(b.a1);
    }
    return out;
  };

  const parent = new Map<string, string>();
  const treeEdge = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const treeEdges = new Set<string>();
  const root = componentIds[0];
  const seen = new Set([root]);
  const bfsQueue = [root];
  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()!;
    for (const nb of neighborsWithin(cur)) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      parent.set(nb, cur);
      treeEdges.add(treeEdge(cur, nb));
      bfsQueue.push(nb);
    }
  }

  const pathToRoot = (start: string): string[] => {
    const path = [start];
    let cur = start;
    while (parent.has(cur)) { cur = parent.get(cur)!; path.push(cur); }
    return path;
  };

  const rings: string[][] = [];
  const seenRingKey = new Set<string>();
  for (const b of Object.values(mol.bonds)) {
    if (!idSet.has(b.a1) || !idSet.has(b.a2)) continue;
    if (treeEdges.has(treeEdge(b.a1, b.a2))) continue;

    const pathA = pathToRoot(b.a1);
    const pathB = pathToRoot(b.a2);
    const indexInA = new Map(pathA.map((id, i): [string, number] => [id, i]));
    let lcaIdxA = -1, lcaIdxB = -1;
    for (let j = 0; j < pathB.length; j++) {
      if (indexInA.has(pathB[j])) { lcaIdxA = indexInA.get(pathB[j])!; lcaIdxB = j; break; }
    }
    if (lcaIdxA < 0) continue;

    const ring = [...pathA.slice(0, lcaIdxA + 1), ...pathB.slice(0, lcaIdxB).reverse()];
    if (ring.length < 3) continue;
    const key = [...ring].sort().join(",");
    if (seenRingKey.has(key)) continue;
    seenRingKey.add(key);
    rings.push(ring);
  }
  return rings;
}

/** Signed area (shoelace formula) of a ring's *current* positions, walked
 * in `ringWalk` order — its sign encodes which way the ring currently
 * turns (clockwise vs counter-clockwise), so a regenerated regular polygon
 * can be walked the same way instead of coming out mirror-flipped. */
function signedRingArea(ringWalk: string[], posOf: (id: string) => Point): number {
  let sum = 0;
  for (let i = 0; i < ringWalk.length; i++) {
    const p1 = posOf(ringWalk[i]);
    const p2 = posOf(ringWalk[(i + 1) % ringWalk.length]);
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum;
}

/**
 * Computes regular-polygon target positions for one ring, honoring
 * whichever of its atoms are already fixed (from `fixed`) — 0, 1, or 2
 * (adjacent) of them — the same three cases ringPlacement.ts's ring *tool*
 * already handles for placing a brand-new ring on the canvas:
 *  - Two adjacent fixed atoms (a shared/fused edge): the rest of the
 *    polygon is built off that edge, bulging toward whichever side is
 *    closer to the ring's own pre-cleanup center (so it doesn't flip to
 *    the opposite side of the shared bond).
 *  - One fixed atom (a spiro junction, or a boundary atom): the polygon is
 *    centered along the same direction that atom's current position
 *    already sits from the ring's own current center.
 *  - None fixed: the polygon is centered on the ring's own current
 *    centroid, oriented to match its current first-atom direction.
 * All three preserve the ring's current handedness via signedRingArea, so
 * it's never mirror-flipped from how it was drawn.
 */
function regularRingTargets(mol: Molecule, ringWalk: string[], fixed: Map<string, Point>): Map<string, Point> {
  const n = ringWalk.length;
  const r = BOND_LEN / (2 * Math.sin(Math.PI / n));
  const step = (2 * Math.PI) / n;
  const origPos = (id: string) => mol.atoms[id];
  const dirSign = signedRingArea(ringWalk, origPos) >= 0 ? 1 : -1;

  const origCentroid = (): Point => {
    let cx = 0, cy = 0;
    for (const id of ringWalk) { const p = origPos(id); cx += p.x; cy += p.y; }
    return { x: cx / n, y: cy / n };
  };

  const targets = new Map<string, Point>();
  const fixedIndices = ringWalk.map((id, i) => (fixed.has(id) ? i : -1)).filter((i) => i >= 0);

  // Two fixed atoms adjacent in the ring walk — build off that shared edge.
  for (const i0 of fixedIndices) {
    const i1 = (i0 + 1) % n;
    if (!fixed.has(ringWalk[i1])) continue;
    const p1 = fixed.get(ringWalk[i0])!;
    const p2 = fixed.get(ringWalk[i1])!;
    const apothem = r * Math.cos(Math.PI / n);
    const bondAngle = angleOf(p1, p2);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const centerA = { x: midX + apothem * Math.cos(bondAngle + Math.PI / 2), y: midY + apothem * Math.sin(bondAngle + Math.PI / 2) };
    const centerB = { x: midX + apothem * Math.cos(bondAngle - Math.PI / 2), y: midY + apothem * Math.sin(bondAngle - Math.PI / 2) };
    const refCenter = origCentroid();
    const center = dist(centerA, refCenter) <= dist(centerB, refCenter) ? centerA : centerB;
    const angle1 = angleOf(center, p1);
    const angle2 = angleOf(center, p2);
    const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const dir = Math.abs(norm(angle1 + step) - norm(angle2)) < 1e-6 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const idx = (i0 + k) % n;
      targets.set(ringWalk[idx], idx === i0 ? p1 : idx === i1 ? p2 : polar(center.x, center.y, r, angle1 + dir * k * step));
    }
    return targets;
  }

  // One fixed atom, or none — anchor via that atom (or the current
  // centroid), oriented to match the ring's current layout.
  const i0 = fixedIndices.length > 0 ? fixedIndices[0] : 0;
  const anchorId = ringWalk[i0];
  const centroid = origCentroid();
  let center: Point;
  let startAngle: number;
  if (fixed.has(anchorId)) {
    const anchorPos = fixed.get(anchorId)!;
    const curAnchor = origPos(anchorId);
    const dirAngle = dist(curAnchor, centroid) < 1e-6 ? -Math.PI / 2 : angleOf(curAnchor, centroid);
    center = { x: anchorPos.x + r * Math.cos(dirAngle), y: anchorPos.y + r * Math.sin(dirAngle) };
    startAngle = angleOf(center, anchorPos);
  } else {
    center = centroid;
    startAngle = angleOf(centroid, origPos(anchorId));
  }
  for (let k = 0; k < n; k++) {
    const idx = (i0 + k) % n;
    targets.set(ringWalk[idx], idx === i0 && fixed.has(anchorId) ? fixed.get(anchorId)! : polar(center.x, center.y, r, startAngle + dirSign * k * step));
  }
  return targets;
}

/**
 * "Clean Up": redraws each ring found in the given atoms (see
 * detectRings) as a proper regular polygon of its own size — a pentagon
 * stays a pentagon with 108° interior angles, a hexagon a hexagon, etc.,
 * each with every edge exactly the standard bond length — then relaxes
 * every remaining chain atom/substituent outward from there, normalizing
 * its bond length and snapping its direction to the nearest 30°, the same
 * snapping the drawing tools themselves use.
 *
 * Each connected fragment (see connectedComponents) is handled on its own,
 * anchored so it doesn't drift or detach in a way the user didn't ask for:
 *  - If any atom in the fragment has a bond to something *outside* the
 *    given atoms (e.g. cleaning up one substituent, or one ring, of a
 *    larger structure), every such boundary atom is treated as already
 *    fixed, and everything else builds outward from there — so the
 *    fragment's attachment point to the rest of the molecule never moves.
 *  - Otherwise (the fragment is entirely self-contained in the selection —
 *    including the common case of cleaning up with nothing selected, i.e.
 *    the whole molecule) the first ring (or, if there's no ring at all,
 *    the whole chain) has to anchor on *some* arbitrarily-chosen atom, but
 *    the whole fragment is then shifted back so its center of mass lands
 *    exactly where it started — so Clean Up only straightens things in
 *    place rather than relocating the structure elsewhere.
 *
 * Two rings that share no atoms but are joined only by a floppy chain (or
 * a ring plus a separately-anchored ring elsewhere in the same fragment)
 * are each individually regularized but not reconciled against each other
 * — same honest gap as an irregular bridged ring above: a full
 * constraint solver is out of scope here.
 */
export function cleanUpAtoms(mol: Molecule, atomIds: string[]): Molecule {
  const atoms = { ...mol.atoms };

  for (const component of connectedComponents(mol, atomIds)) {
    const compSet = new Set(component);
    const neighborsWithin = (id: string): string[] => {
      const out: string[] = [];
      for (const b of Object.values(mol.bonds)) {
        if (b.a1 === id && compSet.has(b.a2)) out.push(b.a2);
        else if (b.a2 === id && compSet.has(b.a1)) out.push(b.a1);
      }
      return out;
    };
    const isBoundary = (id: string): boolean => {
      for (const b of Object.values(mol.bonds)) {
        if (b.a1 === id && !compSet.has(b.a2)) return true;
        if (b.a2 === id && !compSet.has(b.a1)) return true;
      }
      return false;
    };

    const boundary = component.filter(isBoundary);
    const fixed = new Map<string, Point>();
    for (const id of boundary) fixed.set(id, { x: mol.atoms[id].x, y: mol.atoms[id].y });

    const rings = detectRings(mol, component).sort((a, b) => a.length - b.length);
    for (const ringWalk of rings) {
      if (ringWalk.every((id) => fixed.has(id))) continue; // already fully placed by a smaller, earlier ring
      for (const [id, p] of regularRingTargets(mol, ringWalk, fixed)) fixed.set(id, p);
    }

    // A fragment with neither a boundary atom nor any ring (a plain chain,
    // or a lone atom) still needs *some* starting point for the relax-
    // outward pass below.
    if (fixed.size === 0) fixed.set(component[0], { x: mol.atoms[component[0]].x, y: mol.atoms[component[0]].y });

    for (const [id, p] of fixed) {
      const a = atoms[id];
      if (a) atoms[id] = { ...a, x: p.x, y: p.y };
    }

    const visited = new Set(fixed.keys());
    const queue = [...visited];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of neighborsWithin(cur)) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        const curAtom = atoms[cur];
        const nbAtom = atoms[nb];
        const angle = snapAngle(angleOf(curAtom, nbAtom));
        const p = polar(curAtom.x, curAtom.y, BOND_LEN, angle);
        atoms[nb] = { ...nbAtom, x: p.x, y: p.y };
        queue.push(nb);
      }
    }

    if (boundary.length === 0) {
      let origSumX = 0, origSumY = 0, newSumX = 0, newSumY = 0;
      for (const id of component) {
        origSumX += mol.atoms[id].x;
        origSumY += mol.atoms[id].y;
        newSumX += atoms[id].x;
        newSumY += atoms[id].y;
      }
      const n = component.length;
      const dx = origSumX / n - newSumX / n;
      const dy = origSumY / n - newSumY / n;
      if (dx !== 0 || dy !== 0) {
        for (const id of component) {
          const a = atoms[id];
          atoms[id] = { ...a, x: a.x + dx, y: a.y + dy };
        }
      }
    }
  }

  return { ...mol, atoms };
}
