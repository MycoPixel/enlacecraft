import type { CatalyticCycle, Molecule, Point } from "../types/chemistry";
import { connectedComponents } from "./molecule";

/**
 * Helpers for live catalytic cycles (see CatalyticCycle's doc comment).
 *
 * Kept beside the molecule model rather than in the renderer because the
 * same pruning rules have to run on delete, on import and in the store.
 */

/** Every atom id that belongs to a cycle's nodes. */
export function cycleAtomIds(cycle: CatalyticCycle): Set<string> {
  const ids = new Set<string>();
  for (const node of cycle.nodes) {
    for (const id of node) ids.add(id);
  }
  return ids;
}

/** A cycle whose nodes all survive keeps its identity; a node that loses
 * every atom is removed. A cycle that had nodes but no longer has any is
 * dropped rather than left as an unexplained empty ring. A cycle that was
 * always a bare ring (0 nodes) is kept. */
export function pruneCyclesForAtoms(
  cycles: CatalyticCycle[] | undefined,
  atoms: ReadonlySet<string> | Record<string, unknown>
): CatalyticCycle[] | undefined {
  if (!cycles || cycles.length === 0) return cycles;
  const atomIds = atoms instanceof Set ? atoms : new Set(Object.keys(atoms));
  let changed = false;
  const out: CatalyticCycle[] = [];

  for (const cycle of cycles) {
    const nodes: string[][] = [];
    let cycleChanged = false;
    for (const node of cycle.nodes) {
      const ids = node.filter((id) => atomIds.has(id));
      if (ids.length === 0) {
        cycleChanged = true;
        continue;
      }
      if (ids.length !== node.length) cycleChanged = true;
      nodes.push(ids);
    }
    if (cycle.nodes.length > 0 && nodes.length === 0) {
      changed = true;
      continue;
    }
    if (cycleChanged) changed = true;
    out.push(cycleChanged ? { ...cycle, nodes } : cycle);
  }

  return changed ? (out.length > 0 ? out : undefined) : cycles;
}

/** The connected fragments of `atomIds` that can become cycle nodes. */
export function fragmentsForNodes(molecule: Molecule, atomIds: Iterable<string>): string[][] {
  return connectedComponents(molecule, [...atomIds]).filter((ids) => ids.length > 0);
}

/** A radius that clears every node's atoms, with room for labels and arcs. */
export function suggestedCycleRadius(molecule: Molecule, centre: Point, nodes: string[][], padding = 58): number {
  let max = 0;
  for (const node of nodes) {
    for (const id of node) {
      const atom = molecule.atoms[id];
      if (!atom) continue;
      max = Math.max(max, Math.hypot(atom.x - centre.x, atom.y - centre.y));
    }
  }
  return Math.max(70, max + padding);
}

/** Centroid of a set of atoms, or the supplied fallback when none exist. */
export function centroidOf(molecule: Molecule, atomIds: Iterable<string>, fallback: Point): Point {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const id of atomIds) {
    const atom = molecule.atoms[id];
    if (!atom) continue;
    x += atom.x;
    y += atom.y;
    count += 1;
  }
  return count > 0 ? { x: x / count, y: y / count } : fallback;
}
