import type { Bond, Molecule } from "../types/chemistry";
import { neighborIds } from "../model/valence";

/** How far (in bonds) to search for a ring closing back around a given
 * bond before giving up and treating it as acyclic -- same reasoning,
 * and same cap, as doubleBondSide.ts's own ring search: real 2D drawings
 * essentially never have a meaningfully-sized ring bigger than this. */
const MAX_RING_SEARCH_DEPTH = 10;

/**
 * Shortest path from `fromId` back to `toId`, without using the direct
 * bond between them -- i.e. the smallest ring that bond closes, if any.
 * Returns the ring as an ordered list of atom ids (fromId first, toId
 * last), or null if the bond isn't part of any ring within
 * MAX_RING_SEARCH_DEPTH. A local sibling of doubleBondSide.ts's own
 * shortestPathAvoiding rather than a shared import: that one blocks a
 * *node* (for finding a ring around a neighbor), this blocks the one
 * direct *edge* between two already-known atoms, which needs slightly
 * different bookkeeping.
 */
function smallestRingThroughBond(mol: Molecule, fromId: string, toId: string): string[] | null {
  const parent = new Map<string, string>();
  const visited = new Set([fromId]);
  let frontier = [fromId];
  let depth = 0;
  while (frontier.length && depth < MAX_RING_SEARCH_DEPTH) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of neighborIds(mol, id)) {
        if (id === fromId && nb === toId) continue; // the direct bond itself -- skip it, we want another way around
        if (visited.has(nb)) continue;
        parent.set(nb, id);
        if (nb === toId) {
          const path = [toId];
          let cur = toId;
          while (cur !== fromId) {
            cur = parent.get(cur)!;
            path.push(cur);
          }
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

/**
 * Every ring in the molecule, as a list of atom ids in ring-walk order --
 * found by taking, for each bond, the smallest ring that bond closes
 * (see smallestRingThroughBond) and deduplicating by atom set. This is a
 * deliberately simple approach rather than a general SSSR algorithm, but
 * it handles the common cases this app's molecules actually have (single
 * rings, and ortho-fused pairs like naphthalene/indole/purines) exactly
 * right: each bond's own smallest enclosing ring is the small ring it
 * visually belongs to, not some larger ring that happens to also pass
 * through it. It hasn't been validated against exotic bridged or
 * spiro-fused systems beyond that.
 */
export function findRings(mol: Molecule): string[][] {
  const seen = new Set<string>();
  const rings: string[][] = [];
  for (const bond of Object.values(mol.bonds)) {
    const ring = smallestRingThroughBond(mol, bond.a1, bond.a2);
    if (!ring) continue;
    const key = [...ring].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    rings.push(ring);
  }
  return rings;
}

/** Whether atoms a1/a2 are adjacent in the ring's own walk order (i.e.
 * the bond between them is actually one of this ring's edges, not just
 * two atoms that both happen to belong to it). */
export function ringContainsBond(ring: string[], a1: string, a2: string): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const x = ring[i];
    const y = ring[(i + 1) % n];
    if ((x === a1 && y === a2) || (x === a2 && y === a1)) return true;
  }
  return false;
}

function bondBetween(mol: Molecule, a1: string, a2: string): Bond | null {
  for (const b of Object.values(mol.bonds)) {
    if ((b.a1 === a1 && b.a2 === a2) || (b.a1 === a2 && b.a2 === a1)) return b;
  }
  return null;
}

/**
 * Whether this ring's bonds alternate single/double all the way around --
 * the same pattern any built-in aromatic RING_TEMPLATE draws (see
 * engine/ringPlacement.ts's placeRing), and the only thing this checks:
 * no attempt at true (Huckel-rule) aromaticity perception, just "does
 * this ring's Kekule structure look like the kind conventionally drawn
 * with a circle" -- benzene, furan, pyridine, naphthalene's rings,
 * cyclopentadienide, and so on.
 *
 * An odd-membered ring can't perfectly alternate, so it qualifies with
 * exactly floor(n/2) double bonds as long as none of them are adjacent to
 * each other -- for a 5-ring that leaves exactly one place with two
 * single bonds in a row, matching furan/pyrrole/imidazole/
 * cyclopentadienide's own pattern (the heteroatom or anionic carbon that
 * contributes the lone pair instead of a pi bond). This isn't unique to
 * 5-rings: for any n, "floor(n/2) double bonds, no two adjacent" is only
 * achievable by (a) the exact alternating pattern when n is even, or (b)
 * exactly one single-single gap when n is odd -- there's no separate case
 * to special-case here.
 *
 * Deliberately conservative: triple bonds and dative bonds never
 * qualify, and rings smaller than 5 atoms are excluded outright (this
 * app's own ring templates don't offer an aromatic 3- or 4-ring either).
 */
export function isKekulizedRing(mol: Molecule, ring: string[]): boolean {
  const n = ring.length;
  if (n < 5) return false;
  const orders: number[] = [];
  for (let i = 0; i < n; i++) {
    const bond = bondBetween(mol, ring[i], ring[(i + 1) % n]);
    if (!bond || bond.order === 3 || bond.dative) return false;
    orders.push(bond.order);
  }
  const doubleCount = orders.filter((o) => o === 2).length;
  if (doubleCount !== Math.floor(n / 2)) return false;
  for (let i = 0; i < n; i++) {
    if (orders[i] === 2 && orders[(i + 1) % n] === 2) return false;
  }
  return true;
}

/**
 * The single ring eligible for the aromatic-circle toggle at this exact
 * bond, or null if there isn't exactly one. "Exactly one" is deliberate:
 * a fusion bond shared by two otherwise-eligible rings (say, the shared
 * edge of naphthalene's two hexagons) is genuinely ambiguous about which
 * ring the person means, so this declines rather than guessing -- they
 * can right-click one of that ring's other, non-shared bonds instead.
 */
export function resolveEligibleRingForBond(mol: Molecule, bond: Bond): string[] | null {
  const candidates = findRings(mol).filter((ring) => ringContainsBond(ring, bond.a1, bond.a2) && isKekulizedRing(mol, ring));
  return candidates.length === 1 ? candidates[0] : null;
}

/** The bond ids forming this ring's own edges (ring-walk-adjacent pairs),
 * for suppressing their second line while a circle is drawn in its
 * place. Skips any edge that no longer has a real bond behind it (the
 * ring atoms are still there per survivingAromaticRingDisplays, but nothing
 * guarantees every original edge bond specifically survived some other
 * edit) rather than throwing. */
export function ringBondIds(mol: Molecule, ring: string[]): string[] {
  const ids: string[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const bond = bondBetween(mol, ring[i], ring[(i + 1) % n]);
    if (bond) ids.push(bond.id);
  }
  return ids;
}

/**
 * Where to draw the inscribed circle for this ring: centered on the
 * atoms' own centroid, radius scaled to sit comfortably inside the ring
 * without touching its bond lines (0.68x the distance from centroid to
 * the nearest atom -- a bit inside a regular hexagon's apothem, so it
 * clears the bond midpoints too, not just the vertices). Returns null if
 * any ring atom no longer exists.
 */
export function ringCircleGeometry(mol: Molecule, ring: string[]): { cx: number; cy: number; r: number } | null {
  const atoms = ring.map((id) => mol.atoms[id]);
  if (atoms.some((a) => !a)) return null;
  const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
  const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
  const minDist = Math.min(...atoms.map((a) => Math.hypot(a.x - cx, a.y - cy)));
  return { cx, cy, r: minDist * 0.68 };
}
