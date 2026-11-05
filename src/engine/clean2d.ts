import type { BondOrder, BondStereo, Element, Molecule, Point } from "../types/chemistry";
import { BOND_LEN } from "../model/constants";
import { angleDelta, angleOf, dist, polar, snapAngle } from "../model/geometry";

/**
 * Hybridisation-aware 2D structure clean-up — the engine behind the
 * "Clean Up" command (model/molecule.ts's cleanUpAtoms, which is now a thin
 * delegation to cleanStructure2D).
 *
 * ## Why this replaced the old fixed-30° relaxation
 *
 * cleanUpAtoms used to redraw every chain as a zigzag whose bond directions
 * were snapped to the nearest 30° and alternated by exactly 60° thereafter.
 * That produces a *tidy* drawing, but not a *chemically literate* one: a
 * triple bond was drawn with 120° kinks at its ends, a C=C got the same
 * angles as a C–C, an O–H stuck out at whatever angle it happened to have,
 * and every bond — C–C or O–H or C≡N — came out at the same length. This
 * module keeps the old algorithm's good properties (rings become regular
 * polygons, boundary atoms never move, the whole fragment recentres in
 * place, everything stays on the 30° snap grid) and adds the chemistry:
 *
 *  1. **Ideal angles from hybridisation.** An atom's incident bond orders
 *     decide sp (triple bond, or two double bonds — a cumulated system),
 *     sp2 (any double bond) or sp3; the ideal angle spread around it
 *     follows. 2-coordinate sp3 is deliberately drawn at 120°, not 109.5° —
 *     see the comment at `twoNeighborInteriorAngle`.
 *  2. **Real bond lengths by element.** A small table of standard covalent
 *     single-bond lengths (see COVALENT_SINGLE_BOND_A) scaled so a C–C
 *     single bond is exactly the canvas BOND_LEN, with the usual order
 *     contraction factors for double/triple/aromatic bonds. The drawing's
 *     overall scale therefore never changes.
 *  3. **Ring templates.** Rings are rebuilt as regular polygons (the same
 *     behavior molecule.ts always had — the helper moved here wholesale).
 *  4. **cis/trans preservation.** After layout, every double bond with one
 *     substituent at each end is checked: if the substituents' sides of the
 *     bond axis (sign of the cross product) came out different from how
 *     they were drawn, the flipped subtree is mirrored back across the
 *     axis. Connectivity is never touched — only positions.
 *  5. **Stereo preservation.** Any atom that is an endpoint of a wedge /
 *     dash / any-other `Bond.stereo` bond is treated as fixed, exactly like
 *     a boundary atom, so a manually drawn wedge can never be silently
 *     reinterpreted by moving the atoms it anchors. (The mirror in point 4
 *     likewise refuses to move fixed atoms.)
 *  6. **A non-bonded overlap penalty.** Placement avoids parking a child
 *     on an already-placed atom in the first place (walking the snap grid
 *     or the fan slots until the position clears); a short iterative
 *     relaxation then pushes apart any remaining atom pairs closer than
 *     ~0.8× a bond length without being bonded to each other — the
 *     leftovers a direction-following placement can still produce.
 *
 * The module is pure: it never mutates `mol` (or any atom/bond object in
 * it) and returns a fresh Molecule carrying new atom position objects for
 * the atoms that moved, exactly like the rest of the codebase's immutable
 * update style. Running it twice in a row changes nothing the second time
 * (within floating-point tolerance): every stage is deterministic and the
 * relaxation only moves pairs that are strictly closer than the threshold
 * it leaves them at.
 *
 * ## Known gaps (deliberate, same as before)
 *
 * Two rings joined by a floppy chain are each regularized but not
 * reconciled with each other; a ring left with three or more of its atoms
 * already placed by other rings or boundaries (bridged / heavily-shared
 * polycyclics) is left as-is rather than forced into a polygon that could
 * not honor all of them; and a branch atom's own bond directions are kept
 * from the drawing when it is the fragment's anchor (only atoms hanging
 * *off* the anchor get ideal angles) — a full constraint solver is out of
 * scope.
 */

/** Tunables for cleanStructure2D; every field has a sane default. */
export interface Clean2DOptions {
  /**
   * Snap grid for bond *directions*, in radians — same meaning as the snap
   * preference threaded into the old cleanUpAtoms (π/6 = every 30°). Angles
   * come out as multiples of this wherever a direction is chosen freely
   * (anchor bonds); ideal-angle placements land on the grid too as long as
   * the grid divides 60°. 0 (or any non-positive value) disables snapping.
   */
  snapStep?: number;
  /** Maximum sweeps of the non-bonded overlap relaxation. Each sweep is
   * O(pairs); a few dozen converges every realistic drawing. */
  overlapIterations?: number;
  /** Non-bonded atom pairs closer than this factor × their expected single-
   * bond length are pushed apart (0.8 — touching-but-not-bonded is already
   * unreadable, but a legitimate 1,3-separation must never be "fixed"). */
  overlapFactor?: number;
}

/** What cleanStructure2D returns: a new Molecule (input untouched) and how
 * many atoms actually changed position — the "Clean as I draw" caller can
 * use `moved` to skip recording a no-op. */
export interface Clean2DResult {
  mol: Molecule;
  moved: number;
}

// ---------------------------------------------------------------------------
// Element → bond length table
// ---------------------------------------------------------------------------

/**
 * Standard covalent single-bond lengths to the marked element, in
 * angstroms — the values an organic-chemistry textbook prints for bonds
 * from carbon/hydrogen/nitrogen/oxygen and friends:
 *
 *   H 1.09 · B 1.58 · C 1.54 · N 1.47 · O 1.43 · F 1.35
 *   Si 1.87 · P 1.84 · S 1.82 · Cl 1.77 · Br 1.94 · I 2.14
 *
 * These are *single*-bond lengths; multiple-bond contraction is applied
 * separately (see bondOrderFactor) so the table stays one-dimensional.
 * Elements not listed here (metals, noble gases, exotic main-group) fall
 * back to carbon's 1.54 Å: we have no better single number for them, and
 * falling back to the canvas default keeps their bonds exactly the length
 * they always were instead of inventing data.
 */
const COVALENT_SINGLE_BOND_A: Partial<Record<Element, number>> = {
  H: 1.09,
  B: 1.58,
  C: 1.54,
  N: 1.47,
  O: 1.43,
  F: 1.35,
  Si: 1.87,
  P: 1.84,
  S: 1.82,
  Cl: 1.77,
  Br: 1.94,
  I: 2.14,
};

/** Unlisted elements are treated as carbon-sized (see the table comment). */
const FALLBACK_SINGLE_BOND_A = 1.54;

/**
 * Å → canvas scale factor, chosen so a C–C single bond lands exactly on
 * BOND_LEN — the whole drawing keeps its existing scale; only relative
 * bond lengths become chemically meaningful.
 */
const A_TO_CANVAS = BOND_LEN / 1.54;

/** Double bonds are ~7% shorter than singles (ethylene 1.33 vs 1.54 Å). */
const DOUBLE_BOND_FACTOR = 0.93;
/** Triple bonds ~12% shorter (acetylene 1.20 vs 1.54 Å). */
const TRIPLE_BOND_FACTOR = 0.88;
/** Aromatic bonds sit between single and double (benzene 1.39 ≈ 1.5 order),
 * so they get a milder contraction than a drawn Kekulé double bond. */
const AROMATIC_BOND_FACTOR = 0.95;

/**
 * Length factor for a bond's drawn order — or AROMATIC_BOND_FACTOR when the
 * bond is an edge of a Kekulized aromatic ring (same rule as the
 * aromatic-circle display toggle, engine/aromaticRings.ts's
 * isKekulizedRing: the drawn 1/2 alternation there is a drawing convention
 * for a 1.5-order system, so the length should be too).
 */
function bondLengthFactor(order: BondOrder, aromatic: boolean): number {
  if (aromatic) return AROMATIC_BOND_FACTOR;
  if (order === 2) return DOUBLE_BOND_FACTOR;
  if (order === 3) return TRIPLE_BOND_FACTOR;
  return 1;
}

/** Expected drawn length between two atoms for the given order factor —
 * the average of the two elements' single-bond lengths (a C–Cl bond is
 * neither a C–C nor a Cl–Cl), scaled to canvas units. */
function expectedBondLength(elementA: Element, elementB: Element, factor: number): number {
  const angstroms =
    ((COVALENT_SINGLE_BOND_A[elementA] ?? FALLBACK_SINGLE_BOND_A) +
      (COVALENT_SINGLE_BOND_A[elementB] ?? FALLBACK_SINGLE_BOND_A)) /
    2;
  return angstroms * A_TO_CANVAS * factor;
}

/**
 * The clean-up engine's bond-length model, exposed for callers that want to
 * preview/predict geometry (and for the test suite): the standard drawn
 * length between two elements for a single/double/triple bond, in canvas
 * units — C–C single = BOND_LEN exactly, C–Cl ≈ 1.655 Å scaled, double and
 * triple bonds contracted, aromatic edges ×0.95. Ring *templates* are the
 * one deliberate exception: a regularized ring keeps every edge at plain
 * BOND_LEN so cleaned rings match what the ring tool itself places (see
 * regularRingTargets).
 */
export function standardBondLength(elementA: Element, elementB: Element, order: BondOrder, aromatic = false): number {
  return expectedBondLength(elementA, elementB, bondLengthFactor(order, aromatic));
}

// ---------------------------------------------------------------------------
// Hybridisation and ideal angles
// ---------------------------------------------------------------------------

type Hybridisation = "sp" | "sp2" | "sp3";

/**
 * Hybridisation from what the drawing shows (incident bond orders) — the
 * only perceptible 2D evidence: any triple bond, or two double bonds on the
 * same atom (an allene/cumulated system), means sp; any double bond means
 * sp2; otherwise sp3. Drawn aromatic-ring atoms are sp2 by the same test
 * (their Kekulé form shows a double bond). Dative bonds count as single —
 * nothing reads order on them.
 */
function hybridisationOf(doubleCount: number, tripleCount: number): Hybridisation {
  if (tripleCount > 0 || doubleCount >= 2) return "sp";
  if (doubleCount >= 1) return "sp2";
  return "sp3";
}

/**
 * Interior angle between the two bonds of a 2-coordinate atom.
 *
 * sp → 180°: a cumulated/allene carbon or an alkyne carbon is linear, and
 * the drawing should say so.
 *
 * sp2 → 120°: trigonal, drawn as the full planar angle.
 *
 * sp3 → **120°, not 109.5°** — a deliberate drawing convention, documented
 * here because the number looks "wrong" next to the tetrahedral ideal.
 * A 2-coordinate sp3 atom (an ether O, a chain –CH2–) is conventionally
 * drawn with the standard skeletal zigzag: every textbook drawing of
 * butane puts 120° at each carbon, because the projected C–C–C angle of a
 * staggered chain *is* ~111°–120° and 120° keeps the whole drawing on the
 * 30° snap grid. Drawing actual 109.5° at every chain carbon would produce
 * a slightly irregular-looking zigzag that no longer meets the grid, for
 * no visual gain. (3- and 4-coordinate sp3 atoms still use the tetrahedral
 * values below, where the distinction actually shows.)
 */
function twoNeighborInteriorAngle(hyb: Hybridisation): number {
  if (hyb === "sp") return Math.PI;
  return (120 * Math.PI) / 180;
}

/**
 * Target direction offsets (from the direction back to the atom's parent)
 * at which to place `childCount` remaining neighbors of an atom with total
 * degree `deg`, one slot per child. The returned slots are symmetric about
 * "directly opposite the parent bond" — the open side — so children fan
 * out into free space instead of folding back over the incoming bond:
 *
 *  - deg 2: the single child sits at ± the interior angle from
 *    `twoNeighborInteriorAngle` (side picked to match the drawing).
 *  - deg 3: children at ±110° for sp3 (two projected tetrahedral angles —
 *    109.5° clamped to 110°, which sums to 360° with the 140°
 *    between-children angle) or ±120° for sp2 (a proper trigonal Y).
 *  - deg 4: children at −90°/+90°/180° from the parent direction — the
 *    standard "cross" projection of a tetrahedron (parent up, children
 *    left/down/right). Four in-plane bond angles must sum to 360°, so an
 *    all-109.5° drawing is geometrically impossible; the 90° cross keeps
 *    every angle ≤ ideal and separates the substituents maximally. No slot
 *    points along the parent bond itself — a child placed there would sit
 *    on top of the bond's other end.
 *  - deg ≥ 5 (hypercoordinate, e.g. PCl5-ish sketches): spread the
 *    children evenly across the open half-plane (perpendiculars included,
 *    parent direction excluded). Rare and deliberately just readable
 *    rather than chemically load-bearing.
 */
function fanSlotOffsets(deg: number, hyb: Hybridisation, childCount: number): number[] {
  const deg2rad = (d: number) => (d * Math.PI) / 180;
  if (deg <= 2) {
    const t = twoNeighborInteriorAngle(hyb);
    return [-t, t];
  }
  if (deg === 3) {
    const spread = hyb === "sp3" ? deg2rad(110) : deg2rad(120);
    return [-spread, spread];
  }
  if (deg === 4) return [-deg2rad(90), deg2rad(90), Math.PI];
  // deg >= 5: childCount slots evenly spaced across the open half-plane.
  if (childCount <= 1) return [Math.PI];
  const spacing = Math.PI / (childCount - 1);
  const slots: number[] = [];
  for (let i = 0; i < childCount; i++) slots.push(Math.PI / 2 + i * spacing);
  return slots;
}

// ---------------------------------------------------------------------------
// Graph helpers (local to the engine so it stays import-cycle-free with
// model/molecule.ts, which delegates back into this module)
// ---------------------------------------------------------------------------

/** One bond, as seen from one of its atoms. */
interface BondLink {
  other: string;
  order: BondOrder;
  dative: boolean;
  stereo: BondStereo;
}

function buildAdjacency(mol: Molecule): Map<string, BondLink[]> {
  const adj = new Map<string, BondLink[]>();
  for (const id in mol.atoms) adj.set(id, []);
  for (const bond of Object.values(mol.bonds)) {
    adj.get(bond.a1)?.push({ other: bond.a2, order: bond.order, dative: bond.dative === true, stereo: bond.stereo });
    adj.get(bond.a2)?.push({ other: bond.a1, order: bond.order, dative: bond.dative === true, stereo: bond.stereo });
  }
  return adj;
}

/**
 * Groups the given atom ids into connected components, using only bonds
 * whose both ends are also in the given id set — i.e. "connected via the
 * current selection." Two selected atoms that are only connected through
 * an *unselected* atom count as separate components here.
 *
 * This is what lets align/distribute (and this engine) treat a whole
 * bonded structure as one rigid piece instead of moving individual atoms
 * independently — the latter is what design tools do for independent
 * shapes, but for atoms joined by bonds of a fixed, meaningful length it
 * collapses the structure instead of arranging it. When every selected
 * atom happens to be its own component (e.g. several separate lone atoms),
 * this naturally reduces to per-atom behavior.
 *
 * Exported (and re-exported by model/molecule.ts under the same name) so
 * the clean-up engine and model/molecule.ts share one definition without
 * an engine → model → engine import cycle.
 */
export function connectedComponents(mol: Molecule, atomIds: string[]): string[][] {
  return componentsFromAdjacency(mol, atomIds, buildAdjacency(mol));
}

/** componentsOf with the adjacency passed in — the engine's internal hot
 * path already has the index built. */
function componentsFromAdjacency(mol: Molecule, atomIds: string[], adj: Map<string, BondLink[]>): string[][] {
  const idSet = new Set(atomIds);
  const seen = new Set<string>();
  const components: string[][] = [];

  const neighborsWithin = (id: string): string[] => {
    const out: string[] = [];
    for (const link of adj.get(id) ?? []) {
      if (idSet.has(link.other)) out.push(link.other);
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
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

// ---------------------------------------------------------------------------
// Ring detection and regular-polygon templates (moved verbatim from
// model/molecule.ts — same behavior, new home)
// ---------------------------------------------------------------------------

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
function detectRings(mol: Molecule, componentIds: string[], adj: Map<string, BondLink[]>): string[][] {
  if (componentIds.length === 0) return [];
  const idSet = new Set(componentIds);
  const neighborsWithin = (id: string): string[] => {
    const out: string[] = [];
    for (const link of adj.get(id) ?? []) {
      if (idSet.has(link.other)) out.push(link.other);
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
    while (parent.has(cur)) {
      cur = parent.get(cur)!;
      path.push(cur);
    }
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
    let lcaIdxA = -1;
    let lcaIdxB = -1;
    for (let j = 0; j < pathB.length; j++) {
      if (indexInA.has(pathB[j])) {
        lcaIdxA = indexInA.get(pathB[j])!;
        lcaIdxB = j;
        break;
      }
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
    let cx = 0;
    let cy = 0;
    for (const id of ringWalk) {
      const p = origPos(id);
      cx += p.x;
      cy += p.y;
    }
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
 * Whether `ringWalk`'s bonds alternate single/double like a drawn aromatic
 * ring — the same rule engine/aromaticRings.ts's isKekulizedRing applies
 * for the inscribed-circle toggle (≥5 atoms, floor(n/2) double bonds, no
 * two adjacent, no triple/dative edges). Re-implemented locally over the
 * engine's own adjacency (and checked against the rings this module
 * already detected) so aromatic *lengths* need no second ring search.
 */
function isKekulizedRingWalk(ringWalk: string[], adj: Map<string, BondLink[]>): boolean {
  const n = ringWalk.length;
  if (n < 5) return false;
  const orders: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ringWalk[i];
    const b = ringWalk[(i + 1) % n];
    const link = (adj.get(a) ?? []).find((l) => l.other === b);
    if (!link || link.order === 3 || link.dative) return false;
    orders.push(link.order);
  }
  if (orders.filter((o) => o === 2).length !== Math.floor(n / 2)) return false;
  for (let i = 0; i < n; i++) {
    if (orders[i] === 2 && orders[(i + 1) % n] === 2) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

/** Which bonds of the component are aromatic (for length purposes), keyed
 * "a|b" with a < b — the union of every detected ring that passes
 * isKekulizedRingWalk. */
function aromaticBondKeys(rings: string[][], adj: Map<string, BondLink[]>): Set<string> {
  const keys = new Set<string>();
  for (const ring of rings) {
    if (!isKekulizedRingWalk(ring, adj)) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      keys.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  }
  return keys;
}

/** Drawn length for one concrete bond of the molecule. */
function bondDrawLength(
  mol: Molecule,
  aId: string,
  bId: string,
  order: BondOrder,
  dative: boolean,
  aromaticKeys: Set<string>
): number {
  const a = mol.atoms[aId];
  const b = mol.atoms[bId];
  const aromatic = !dative && aromaticKeys.has(aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`);
  return expectedBondLength(a.element, b.element, bondLengthFactor(order, aromatic));
}

/** Sign of which side of the directed line a→b the point `p` sits on
 * (sign of the cross product (b−a)×(p−a)); 0 means exactly on the line. */
function sideSign(a: Point, b: Point, p: Point): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

/**
 * One bond's worth of cis/trans repair: if exactly one end's substituent
 * ended up on the opposite side of the double-bond axis from where it was
 * drawn, mirror that end's substituent subtree back across the axis (the
 * double-bond atoms themselves sit ON the axis, so mirroring leaves them
 * exactly where the layout put them). Both ends flipping preserves
 * cis/trans parity and is left alone; an end that was drawn exactly on the
 * axis (sign 0 — a degenerate, unreadable drawing) is left alone too.
 *
 * The mirror walks the contiguous movable region hanging off the flipped
 * substituent and stops at fixed atoms (boundary / stereo-anchored /
 * ring-templated): manually drawn stereochemistry and regularized rings
 * win over cis/trans repair, and mirroring *through* a fixed atom would
 * tear the geometry around it. In the overwhelmingly common case — an
 * acyclic C=C with substituents — the whole subtree is movable.
 */
function repairDoubleBondSide(
  placed: Map<string, Point>,
  fixed: Set<string>,
  mol: Molecule,
  compSet: Set<string>,
  adj: Map<string, BondLink[]>,
  aId: string,
  bId: string
): void {
  const subsOf = (id: string, except: string): string[] =>
    (adj.get(id) ?? [])
      .map((l) => l.other)
      .filter((o) => o !== except && compSet.has(o));

  const subsA = subsOf(aId, bId);
  const subsB = subsOf(bId, aId);
  // cis/trans is only defined when each end carries exactly one substituent
  // (a =CH2 end has two — nothing to flip, and which one "flipped" would be
  // ambiguous anyway).
  if (subsA.length !== 1 || subsB.length !== 1) return;

  const aOrig = mol.atoms[aId];
  const bOrig = mol.atoms[bId];
  const aNew = placed.get(aId)!;
  const bNew = placed.get(bId)!;
  const subA = subsA[0];
  const subB = subsB[0];

  const beforeA = sideSign(aOrig, bOrig, mol.atoms[subA]);
  const beforeB = sideSign(aOrig, bOrig, mol.atoms[subB]);
  // A substituent drawn exactly on the axis gives no side to preserve.
  if (beforeA === 0 || beforeB === 0) return;
  const afterA = sideSign(aNew, bNew, placed.get(subA)!);
  const afterB = sideSign(aNew, bNew, placed.get(subB)!);

  const flippedA = afterA !== 0 && afterA !== beforeA;
  const flippedB = afterB !== 0 && afterB !== beforeB;
  // Neither flipped: done. Both flipped: cis/trans parity is unchanged
  // (the whole bond rotated under its substituents) — mirroring either
  // side would only churn the drawing.
  if (flippedA === flippedB) return;

  const axisA = aNew;
  const axisB = bNew;
  const sub = flippedA ? subA : subB;

  // Reflect `p` across the line through the (placed) double-bond atoms.
  const vx = axisB.x - axisA.x;
  const vy = axisB.y - axisA.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return; // degenerate axis — nothing sensible to mirror across

  const mirror = (p: Point): Point => {
    const t = ((p.x - axisA.x) * vx + (p.y - axisA.y) * vy) / len2;
    return { x: 2 * (axisA.x + t * vx) - p.x, y: 2 * (axisA.y + t * vy) - p.y };
  };

  // Never mirror a fixed substituent itself — its position IS the drawn
  // stereochemistry/anchoring we promised not to touch.
  if (fixed.has(sub)) return;

  const visited = new Set([aId, bId, sub]);
  const queue = [sub];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curPos = placed.get(cur)!;
    placed.set(cur, mirror(curPos));
    for (const link of adj.get(cur) ?? []) {
      const nb = link.other;
      if (!compSet.has(nb) || visited.has(nb) || fixed.has(nb)) continue;
      visited.add(nb);
      queue.push(nb);
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Cleans up the 2D geometry of the given atoms (or every atom when
 * `atomIds` is omitted/empty) and returns a new Molecule — the input is
 * never mutated, and atoms that didn't move keep their original object
 * references. See the module doc comment for the full pipeline and its
 * rationale.
 */
export function cleanStructure2D(mol: Molecule, atomIds?: string[], opts: Clean2DOptions = {}): Clean2DResult {
  const snapStep = opts.snapStep ?? Math.PI / 6;
  const overlapIterations = opts.overlapIterations ?? 48;
  const overlapFactor = opts.overlapFactor ?? 0.8;

  // Undefined means "the whole molecule" (the store's empty-selection
  // case); an explicitly empty array means "nothing selected" — a no-op.
  const ids = atomIds === undefined ? Object.keys(mol.atoms) : atomIds;
  if (ids.length === 0) return { mol, moved: 0 };

  const adj = buildAdjacency(mol);
  const atoms = { ...mol.atoms };
  let moved = 0;

  for (const component of componentsFromAdjacency(mol, ids, adj)) {
    const compSet = new Set(component);
    const isBoundary = (id: string): boolean => (adj.get(id) ?? []).some((l) => !compSet.has(l.other));

    // --- what is fixed, and where -------------------------------------
    const boundary = component.filter(isBoundary);
    const fixed = new Map<string, Point>();
    for (const id of boundary) fixed.set(id, { x: mol.atoms[id].x, y: mol.atoms[id].y });

    // Atoms anchoring manual stereochemistry are fixed too, exactly like
    // boundary atoms: a wedge/dash/whatever bond is an assertion about the
    // drawn geometry, and clean-up must never move either end of it (a
    // moved wedge endpoint can silently invert a drawn configuration).
    // An endpoint whose partner is outside the component is already a
    // boundary atom; here we catch the in-component pairs.
    const stereoFixed: string[] = [];
    for (const id of component) {
      if (fixed.has(id)) continue;
      const touchesStereo = (adj.get(id) ?? []).some((l) => l.stereo !== "none" && compSet.has(l.other));
      if (touchesStereo) {
        fixed.set(id, { x: mol.atoms[id].x, y: mol.atoms[id].y });
        stereoFixed.push(id);
      }
    }

    // Rings become regular polygons (smaller rings first, so a fused pair
    // builds the smaller ring and then the larger one off its shared edge).
    // A ring with THREE OR MORE of its atoms already fixed (a bridged or
    // heavily-shared polycyclic — two rings sharing more than an edge) is
    // skipped entirely: a regular polygon can honor 0, 1 or 2 anchor
    // constraints, not 3+, and overwriting earlier rings' targets with a
    // polygon that ignores them would both distort the already-regular ring
    // and make a second clean-up disagree with the first (the template
    // would re-anchor on different geometry). Leaving such a ring exactly
    // where the earlier template put its shared atoms is the honest
    // outcome — same gap as the pre-engine cleanUpAtoms, now without the
    // idempotence leak.
    const rings = detectRings(mol, component, adj).sort((a, b) => a.length - b.length);
    const aromaticKeys = aromaticBondKeys(rings, adj);
    for (const ringWalk of rings) {
      // already over-constrained by earlier (smaller) rings or boundaries —
      // honor what they placed instead of overwriting it
      if (ringWalk.filter((id) => fixed.has(id)).length >= 3) continue;
      for (const [id, p] of regularRingTargets(mol, ringWalk, fixed)) fixed.set(id, p);
    }

    // A fragment with nothing fixed at all (a plain chain or a lone atom,
    // no boundary, no ring) still needs a starting point.
    if (fixed.size === 0) fixed.set(component[0], { x: mol.atoms[component[0]].x, y: mol.atoms[component[0]].y });

    // --- BFS placement out from the fixed anchors ----------------------
    const placed = new Map(fixed);
    // Direction parent→child each atom was placed along (seeds have none).
    const incomingDir = new Map<string, number>();
    const queue: string[] = [...placed.keys()];

    const bondTo = (cur: string, nb: string): BondLink | undefined => (adj.get(cur) ?? []).find((l) => l.other === nb);

    // Minimum readable separation between two non-bonded atoms — the same
    // threshold the overlap penalty below enforces. Placement consults it
    // *while* choosing directions (see isClearPosition) so a child lands
    // somewhere stable the first time instead of being shoved off its ideal
    // spot afterwards — that afterwards-shove is what would otherwise make
    // a second clean-up disagree with the first (the pushed position
    // becomes the new "drawn direction" and snaps somewhere else).
    const minSeparation = (aId: string, bId: string): number =>
      overlapFactor * expectedBondLength(mol.atoms[aId].element, mol.atoms[bId].element, 1);

    /** Is the candidate position for `childId` free of non-bonded
     * overlap with everything placed so far (fixed anchors included)?
     * Bonded pairs may of course sit at bond length. */
    const isClearPosition = (childId: string, pos: Point): boolean => {
      for (const [otherId, otherPos] of placed) {
        if (bondTo(childId, otherId)) continue;
        if (dist(pos, otherPos) < minSeparation(childId, otherId) - 1e-9) return false;
      }
      return true;
    };

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curPos = placed.get(cur)!;
      const children = (adj.get(cur) ?? []).map((l) => l.other).filter((o) => compSet.has(o) && !placed.has(o));
      if (children.length === 0) continue;

      const backDir = incomingDir.has(cur) ? incomingDir.get(cur)! + Math.PI : null;

      if (backDir === null) {
        // cur is an anchor (boundary / stereo / ring-template / a lone
        // fragment seed). Its own geometry is either fixed by contract or
        // supplied by a ring template, and each bond hanging off it starts
        // a new "segment": keep each child's own drawn direction, snapped
        // to the grid — the same anchors-and-segments behavior the old
        // relaxation had. Idealizing the angles *between* an anchor's
        // bonds would move the anchor's other neighbors or fight the ring
        // template, so it's deliberately not attempted here. If the drawn
        // direction piles the child onto an already-placed atom, walk
        // outward along the snap grid (nearest first) until the position
        // clears — that's what un-piles several substituents drawn in the
        // same direction off one anchor.
        for (const child of children) {
          const link = bondTo(cur, child)!;
          const len = bondDrawLength(mol, cur, child, link.order, link.dative, aromaticKeys);
          const drawn = snapAngle(angleOf(curPos, mol.atoms[child]), snapStep);
          const candidates: number[] = [drawn];
          if (snapStep > 0) {
            for (let k = 1; k <= 4; k++) candidates.push(drawn + k * snapStep, drawn - k * snapStep);
          }
          let angle = candidates[0];
          for (const candidate of candidates) {
            if (isClearPosition(child, polar(curPos.x, curPos.y, len, candidate))) {
              angle = candidate;
              break;
            }
          }
          placed.set(child, polar(curPos.x, curPos.y, len, angle));
          incomingDir.set(child, angle);
          queue.push(child);
        }
        continue;
      }

      // cur was itself placed: fan its remaining children into the open
      // side at hybridisation-ideal angles (see fanSlotOffsets), assigning
      // children to slots so the fanned result stays rotationally closest
      // to how they were drawn — that is what keeps "which substituent was
      // up vs down" stable through a clean-up. Slots that would land the
      // child on an already-placed atom are skipped in favor of the next
      // best slot; only when every slot collides does the nearest one win
      // and the overlap penalty below take over.
      const degree = (adj.get(cur) ?? []).length;
      const doubleCount = (adj.get(cur) ?? []).filter((l) => l.order === 2 && !l.dative).length;
      const tripleCount = (adj.get(cur) ?? []).filter((l) => l.order === 3 && !l.dative).length;
      const hyb = hybridisationOf(doubleCount, tripleCount);
      const slots = fanSlotOffsets(degree, hyb, children.length).sort((a, b) => a - b);
      const keyed = children
        .map((id) => ({ id, key: angleDelta(backDir, angleOf(curPos, mol.atoms[id])) }))
        .sort((p, q) => p.key - q.key);
      const open = [...slots];
      for (const { id: child } of keyed) {
        const childLink = bondTo(cur, child)!;
        const len = bondDrawLength(mol, cur, child, childLink.order, childLink.dative, aromaticKeys);
        const drawn = angleOf(curPos, mol.atoms[child]);
        const ranked = open
          .map((off, i) => ({ off, i, score: Math.abs(angleDelta(backDir + off, drawn)) }))
          .sort((p, q) => p.score - q.score);
        let chosen = ranked[0];
        for (const candidate of ranked) {
          if (isClearPosition(child, polar(curPos.x, curPos.y, len, backDir + candidate.off))) {
            chosen = candidate;
            break;
          }
        }
        open.splice(chosen.i, 1);
        const angle = backDir + chosen.off;
        placed.set(child, polar(curPos.x, curPos.y, len, angle));
        incomingDir.set(child, angle);
        queue.push(child);
      }
    }

    // --- non-bonded overlap penalty ------------------------------------
    // Placement above already avoids parking a child on a placed atom, so
    // this relaxation is the safety net for what it *couldn't* avoid: a
    // cis/trans mirror reflecting a subtree onto someone, freeform
    // (snap-free) placements with no alternative directions to walk, and
    // fans where every slot collided. Push apart every non-bonded pair
    // closer than overlapFactor × its expected single-bond length. Fixed
    // atoms never move; if one end is fixed the other takes the whole
    // push. Pairs land exactly ON the threshold and the threshold check
    // has an epsilon, so a later sweep (or a whole second clean-up run)
    // finds nothing left to do.
    const fixedSet = new Set(fixed.keys());
    const movablePairs: { a: string; b: string; threshold: number; index: number }[] = [];
    for (let i = 0; i < component.length; i++) {
      for (let j = i + 1; j < component.length; j++) {
        const a = component[i];
        const b = component[j];
        if (fixedSet.has(a) && fixedSet.has(b)) continue;
        if (bondTo(a, b)) continue; // bonded pairs are the drawing's skeleton, never pushed
        const ea = mol.atoms[a].element;
        const eb = mol.atoms[b].element;
        movablePairs.push({
          a,
          b,
          threshold: overlapFactor * expectedBondLength(ea, eb, 1),
          index: movablePairs.length,
        });
      }
    }
    const GOLDEN_ANGLE = 2.399963229728653;
    for (let iter = 0; iter < overlapIterations; iter++) {
      let anyMoved = false;
      for (const pair of movablePairs) {
        const pa = placed.get(pair.a)!;
        const pb = placed.get(pair.b)!;
        const d = dist(pa, pb);
        if (d >= pair.threshold - 1e-9) continue;
        anyMoved = true;
        const aFixed = fixedSet.has(pair.a);
        const bFixed = fixedSet.has(pair.b);
        // Coincident atoms have no meaningful "away from each other"
        // direction; a deterministic pseudo-angle (golden angle × pair
        // index) spreads same-spot atoms into a stable spiral instead of
        // leaving them stuck or jittering on fp noise.
        const angle = d < 1e-9 ? GOLDEN_ANGLE * pair.index : Math.atan2(pb.y - pa.y, pb.x - pa.x);
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const push = pair.threshold - d;
        // Split the push between the two ends; a fixed end takes no share,
        // so its partner gets the whole correction.
        const shareA = aFixed ? 0 : bFixed ? 1 : 0.5;
        const shareB = bFixed ? 0 : aFixed ? 1 : 0.5;
        if (shareA > 0) placed.set(pair.a, { x: pa.x - ux * push * shareA, y: pa.y - uy * push * shareA });
        if (shareB > 0) placed.set(pair.b, { x: pb.x + ux * push * shareB, y: pb.y + uy * push * shareB });
      }
      if (!anyMoved) break;
    }

    // --- cis/trans repair (last, so its invariant is the final word) ---
    for (const bond of Object.values(mol.bonds)) {
      if (bond.order !== 2 || bond.dative) continue;
      if (!compSet.has(bond.a1) || !compSet.has(bond.a2)) continue;
      repairDoubleBondSide(placed, fixedSet, mol, compSet, adj, bond.a1, bond.a2);
    }

    // --- recentre in place when nothing anchored the fragment ----------
    // Same contract as before: a fragment with no boundary atom straightens
    // where it stands (its center of mass lands exactly where it started).
    // Stereo-fixed atoms pin the fragment instead — translating everything
    // would move the wedge endpoints we just promised not to touch.
    if (boundary.length === 0 && stereoFixed.length === 0) {
      let origSumX = 0;
      let origSumY = 0;
      let newSumX = 0;
      let newSumY = 0;
      for (const id of component) {
        origSumX += mol.atoms[id].x;
        origSumY += mol.atoms[id].y;
        newSumX += placed.get(id)!.x;
        newSumY += placed.get(id)!.y;
      }
      const n = component.length;
      const dx = origSumX / n - newSumX / n;
      const dy = origSumY / n - newSumY / n;
      if (dx !== 0 || dy !== 0) {
        for (const id of component) {
          const p = placed.get(id)!;
          placed.set(id, { x: p.x + dx, y: p.y + dy });
        }
      }
    }

    // --- commit: new atom objects for moved atoms only ------------------
    for (const id of component) {
      const p = placed.get(id)!;
      const a = atoms[id];
      if (Math.abs(p.x - a.x) > 1e-9 || Math.abs(p.y - a.y) > 1e-9) {
        atoms[id] = { ...a, x: p.x, y: p.y };
        moved++;
      }
    }
  }

  // Nothing moved: hand back the very same molecule object, so callers
  // (the store's commit, a "Clean as I draw" toggle) can treat this as the
  // no-op it was — no new state, no undo entry, no re-render.
  if (moved === 0) return { mol, moved: 0 };

  return { mol: { ...mol, atoms }, moved };
}
