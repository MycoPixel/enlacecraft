import type { Bond, Molecule, Point } from "../types/chemistry";
import { angleOf } from "../model/geometry";
import { neighborIds } from "../model/valence";

/** How far (in bonds) to search for a ring closing back around a double
 * bond before giving up and treating it as an open chain. Real 2D drawings
 * essentially never have a meaningfully-sized ring bigger than this, so
 * capping the search keeps resolveDoubleBondSide cheap even on large,
 * heavily-substituted molecules. */
const MAX_RING_SEARCH_DEPTH = 10;

/**
 * Shortest path (as a list of atom ids, from `fromId` to `toId` inclusive)
 * that never passes through `blockedId` — used to find the smallest ring
 * that closes a double bond's neighbor back around to the bond's far atom.
 * Returns null if no such path exists within MAX_RING_SEARCH_DEPTH.
 */
function shortestPathAvoiding(mol: Molecule, fromId: string, toId: string, blockedId: string): string[] | null {
  if (fromId === toId) return [fromId];
  const parent = new Map<string, string>();
  const visited = new Set([fromId, blockedId]);
  let frontier = [fromId];
  let depth = 0;
  while (frontier.length && depth < MAX_RING_SEARCH_DEPTH) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of neighborIds(mol, id)) {
        if (visited.has(nb)) continue;
        parent.set(nb, id);
        if (nb === toId) {
          const path = [toId];
          let cur = toId;
          while (cur !== fromId) { cur = parent.get(cur)!; path.push(cur); }
          return path.reverse();
        }
        visited.add(nb);
        next.push(nb);
      }
    }
    frontier = next;
    depth++;
  }
  return null;
}

/** One "other neighbor" of the bond's a1/a2, classified as either part of a
 * ring around the bond (with that ring's size and interior atoms) or a
 * plain substituent (with just its own position). */
interface Candidate {
  isRing: boolean;
  ringSize: number;
  /** Point to use for perpendicular-side classification: the ring's own
   * interior atoms' centroid for a ring candidate (robust to the immediate
   * neighbor atom happening to sit almost exactly on the bond's line in
   * distorted/imported geometry), or just the neighbor's own position for
   * a plain substituent. */
  reference: Point;
}

function collectCandidates(mol: Molecule, bond: Bond, atomId: string, otherEndId: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const n of neighborIds(mol, atomId)) {
    if (n === bond.a1 || n === bond.a2) continue;
    const path = shortestPathAvoiding(mol, n, otherEndId, atomId);
    if (path) {
      // path runs n -> ... -> otherEndId; drop otherEndId itself (that's
      // one of the double bond's own atoms) so the centroid reflects only
      // the ring's other interior atoms.
      const interior = path.slice(0, -1).map((id) => mol.atoms[id]).filter(Boolean);
      const centroid = {
        x: interior.reduce((s, p) => s + p.x, 0) / interior.length,
        y: interior.reduce((s, p) => s + p.y, 0) / interior.length,
      };
      candidates.push({ isRing: true, ringSize: path.length + 1, reference: centroid });
    } else {
      const p = mol.atoms[n];
      if (p) candidates.push({ isRing: false, ringSize: Infinity, reference: p });
    }
  }
  return candidates;
}

/**
 * Resolves how a double bond's second line should actually be drawn:
 *  - An explicit "center" | "left" | "right" (set by the user cycling the
 *    double-bond tool) always wins.
 *  - "auto" (the default for every new double bond) prefers whichever side
 *    actually closes into a ring around this bond, biasing the second line
 *    to a ring's interior (the classic benzene look). Ring membership is
 *    decided by graph connectivity (does *some* path back to the bond's
 *    far atom exist through this neighbor, not using the bond itself),
 *    then that ring's own interior atoms are used — as a group, via their
 *    centroid — to decide which side they're actually on. That's what
 *    makes this robust on real imported geometry: a single ring neighbor
 *    can happen to sit almost exactly on the bond's own line (common in
 *    fused, irregular ring systems like a steroid skeleton or azulene's
 *    5-7 rings), which used to make that whole ring invisible to a check
 *    based only on that one atom's position, letting a same-side-counting
 *    substituent wrongly win and point the double bond outward instead of
 *    into the ring.
 *  - When *both* sides close into a ring (a fused-ring shared bond, like
 *    naphthalene's central bond), the larger ring wins; an exact tie (two
 *    equal-sized rings) falls back to whichever side has more neighbor
 *    atoms overall, and finally to a fixed side, so the choice is always
 *    deterministic rather than flickering between renders.
 *  - Falls back to "center" only when neither side is a ring and the
 *    substituents are themselves evenly split (a genuinely symmetric
 *    open-chain double bond).
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
  const sideOf = (p: Point) => (p.x - a1.x) * ux + (p.y - a1.y) * uy; // sign only depends on perpendicular offset from the bond's own line

  const candidates = [
    ...collectCandidates(mol, bond, bond.a1, bond.a2),
    ...collectCandidates(mol, bond, bond.a2, bond.a1),
  ];

  let posCount = 0, negCount = 0;
  let posRingSize = Infinity, negRingSize = Infinity;
  for (const c of candidates) {
    const dot = sideOf(c.reference);
    if (dot === 0) continue; // exactly on the line — no side information
    if (dot > 0) {
      posCount++;
      if (c.isRing) posRingSize = Math.min(posRingSize, c.ringSize);
    } else {
      negCount++;
      if (c.isRing) negRingSize = Math.min(negRingSize, c.ringSize);
    }
  }

  const posIsRing = posRingSize !== Infinity;
  const negIsRing = negRingSize !== Infinity;

  if (posIsRing !== negIsRing) {
    // Only one side actually closes into a ring — that side wins outright,
    // regardless of how the raw neighbor counts happen to split (this is
    // what fixes a ring bond flanked by symmetric substituents, or a ring
    // whose immediate neighbor atom is nearly collinear with the bond).
    return posIsRing ? "right" : "left";
  }

  if (posIsRing && negIsRing && posRingSize !== negRingSize) {
    // Both sides are rings (a fused shared bond) but of different sizes —
    // bias toward the larger ring.
    return posRingSize > negRingSize ? "right" : "left";
  }

  // Either neither side is a ring, or both are same-sized rings (e.g.
  // naphthalene's central bond, two equal hexagons) — fall back to the
  // plain neighbor count, and if that's tied too, a fixed side keeps the
  // result deterministic instead of centering a fused bond oddly.
  if (posCount === negCount) return posIsRing && negIsRing ? "right" : "center";
  return posCount > negCount ? "right" : "left";
}
