import type { Bond, Molecule } from "../types/chemistry";
import { angleOf } from "../model/geometry";
import { neighborIds } from "../model/valence";

/** How far (in bonds) to search for a ring closing back around a double
 * bond before giving up and treating it as an open chain. Real 2D drawings
 * essentially never have a meaningfully-sized ring bigger than this, so
 * capping the search keeps resolveDoubleBondSide cheap even on large,
 * heavily-substituted molecules. */
const MAX_RING_SEARCH_DEPTH = 10;

/**
 * Shortest number of bonds from `fromId` to `toId`, without passing through
 * `blockedId` — used to find the smallest ring that closes a double bond's
 * "other neighbor" back around to the bond's far atom. Returns Infinity if
 * no such path exists within MAX_RING_SEARCH_DEPTH.
 */
function shortestPathAvoiding(mol: Molecule, fromId: string, toId: string, blockedId: string): number {
  if (fromId === toId) return 0;
  const visited = new Set([fromId, blockedId]);
  let frontier = [fromId];
  let depth = 0;
  while (frontier.length && depth < MAX_RING_SEARCH_DEPTH) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of neighborIds(mol, id)) {
        if (visited.has(nb)) continue;
        if (nb === toId) return depth + 1;
        visited.add(nb);
        next.push(nb);
      }
    }
    frontier = next;
    depth++;
  }
  return Infinity;
}

/**
 * Smallest ring size that closes back around `bond` through `throughId` (one
 * of one endpoint's "other" neighbors), or Infinity if `throughId` isn't
 * part of any ring containing this bond.
 */
function ringSizeThrough(mol: Molecule, bond: Bond, throughId: string, nearId: string, farId: string): number {
  const pathLen = shortestPathAvoiding(mol, throughId, farId, nearId);
  return pathLen === Infinity ? Infinity : pathLen + 2; // + the two edges nearId-throughId and farId-nearId that close the loop
}

/**
 * Resolves how a double bond's second line should actually be drawn:
 *  - An explicit "center" | "left" | "right" (set by the user cycling the
 *    double-bond tool) always wins.
 *  - "auto" (the default for every new double bond) prefers whichever side
 *    actually closes into a ring around this bond, biasing the second line
 *    to a ring's interior (the classic benzene look) even when the other
 *    side happens to carry just as many substituent atoms — a plain vote
 *    count can't tell a real ring apart from two coincidental substituents,
 *    which used to mis-center bonds like a ring carbon flanked by two
 *    similarly-placed substituents (e.g. after importing a molecule drawn
 *    that way). When *both* sides close into a ring (a fused-ring shared
 *    bond, like naphthalene's central bond), the larger ring wins, so a
 *    shared edge no longer renders as an oddly-centered double line; a
 *    remaining exact tie falls back to whichever side has more neighbor
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

  let posCount = 0;
  let negCount = 0;
  let posRingSize = Infinity;
  let negRingSize = Infinity;

  const tally = (center: { x: number; y: number }, ids: string[], nearId: string, farId: string) => {
    for (const id of ids) {
      if (id === bond.a1 || id === bond.a2) continue;
      const p = mol.atoms[id];
      if (!p) continue;
      const dot = (p.x - center.x) * ux + (p.y - center.y) * uy;
      if (Math.abs(dot) < 0.5) continue; // essentially collinear, ignore
      const ringSize = ringSizeThrough(mol, bond, id, nearId, farId);
      if (dot > 0) {
        posCount++;
        posRingSize = Math.min(posRingSize, ringSize);
      } else {
        negCount++;
        negRingSize = Math.min(negRingSize, ringSize);
      }
    }
  };

  tally(a1, neighborIds(mol, bond.a1), bond.a1, bond.a2);
  tally(a2, neighborIds(mol, bond.a2), bond.a2, bond.a1);

  const posIsRing = posRingSize !== Infinity;
  const negIsRing = negRingSize !== Infinity;

  if (posIsRing !== negIsRing) {
    // Only one side actually closes into a ring — that side wins outright,
    // regardless of how the raw neighbor counts happen to split (this is
    // what fixes a ring bond flanked by symmetric substituents).
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
