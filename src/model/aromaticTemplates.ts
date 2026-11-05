import type { Molecule } from "../types/chemistry";
import type { StructureTemplate } from "./structureTemplates";

/**
 * Named aromatics and bicyclics for the TemplatePalette's "namedAromatics"
 * category: anthracene, phenanthrene, azulene, biphenyl, fluorene and
 * indene — the polycyclic workhorses of teaching and synthesis that are
 * bigger than the RingPicker's single rings but not heteroatomic enough
 * for the fused-heterocycle set.
 *
 * All geometry is generated here from regular-polygon trigonometry at the
 * model's BOND_LEN = 42 world-px scale (nothing is copied from any external
 * library), then re-centred so each template's bounding-box centre sits at
 * the origin. The convention matches the existing fused-heterocycle
 * templates: six-membered rings are drawn "pointy-top" with two vertical
 * edges (vertex offsets (0, ±42) and (±36.373, ±21), where 36.373 =
 * 42·√3/2), and fused rings simply share an edge — because rings are
 * generated on a shared coordinate lattice, the shared edge's two atoms
 * are the *same* atom records (deduplicated by coordinate), which is what
 * makes the fusion real connectivity rather than two rings drawn close.
 *
 * Kekulé patterns are explicit per-template perfect matchings (every carbon
 * takes part in exactly one C=C), worked out by hand per skeleton and
 * verified by the formula/valence tests: junction carbons end with three
 * ring bonds around a single double bond (used valence 4, no H), peripheral
 * carbons with one double and one single (used 3, one implicit H each), and
 * fluorene's sp³ bridge carbon with two single bonds (two H). Azulene is
 * non-alternant (it contains an odd ring), so its matching is not an
 * "every other bond" alternation — the pairings below are one of its two
 * canonical Kekulé structures.
 */

/** World px — see BOND_LEN in model/constants.ts. Not imported: that module
 * imports the template registry this file feeds, and a top-level runtime
 * constant would make the edge a cycle. */
const BOND = 42;

/** Hexagon half-width: 42·√3/2, so a vertical edge's two vertices are
 * exactly one bond length apart vertically. */
const HEX_HALF_W = (BOND * Math.sqrt(3)) / 2;

/** Hexagon circumradius is the bond length itself. */
const HEX_R = BOND;

/** Pentagon circumradius for side 42: R = 42 / (2·sin 36°). */
const PENT_R = BOND / (2 * Math.sin(Math.PI / 5));

/** Pentagon apothem (centre → edge-midpoint distance). */
const PENT_APOTHEM = PENT_R * Math.cos(Math.PI / 5);

/** Heptagon circumradius for side 42: R = 42 / (2·sin(π/7)). */
const HEPT_R = BOND / (2 * Math.sin(Math.PI / 7));

interface Pt {
  x: number;
  y: number;
}

function polar(angleDeg: number, radius: number): Pt {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
}

/**
 * A "pointy-top" hexagon's six vertices in walk order: top, upper-right,
 * lower-right, bottom, lower-left, upper-left. Vertical edges connect
 * v1–v2 (right) and v4–v5 (left).
 */
function hexagon(cx: number, cy: number): Pt[] {
  return [
    { x: cx, y: cy - HEX_R },
    { x: cx + HEX_HALF_W, y: cy - BOND / 2 },
    { x: cx + HEX_HALF_W, y: cy + BOND / 2 },
    { x: cx, y: cy + HEX_R },
    { x: cx - HEX_HALF_W, y: cy + BOND / 2 },
    { x: cx - HEX_HALF_W, y: cy - BOND / 2 },
  ];
}

/**
 * Regular n-gon vertices in walk order, vertex 0 at `startAngleDeg`
 * (screen angles, y-down: -90 = up).
 */
function regularPolygon(cx: number, cy: number, radius: number, n: number, startAngleDeg: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const offset = polar(startAngleDeg + (i * 360) / n, radius);
    return { x: cx + offset.x, y: cy + offset.y };
  });
}

const key = (p: Pt) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/**
 * Accumulator for a fused polycyclic skeleton. Rings are added as vertex
 * walks; atoms are deduplicated by coordinate, so a ring that re-lists an
 * existing vertex fuses onto it (shares the atom), and a re-listed edge
 * resolves to the existing bond instead of doubling it. Double bonds are
 * requested as index pairs into each ring's own vertex list and are only
 * applied when the ring introducing the bond owns it — shared fusion edges
 * stay single unless the first ring made them otherwise (none of these
 * skeletons do: every template's perfect matching keeps its fusion edges
 * single and puts each junction's double bond on a non-shared edge).
 */
class FusedBuilder {
  private readonly atoms: Molecule["atoms"] = {};
  private readonly bonds: Molecule["bonds"] = {};
  private readonly idByPoint = new Map<string, string>();
  private readonly bondByKey = new Set<string>();
  private nextAtomId = 1;
  private nextBondId = 1;

  private atomAt(p: Pt): string {
    const k = key(p);
    const existing = this.idByPoint.get(k);
    if (existing) return existing;
    const id = `a${this.nextAtomId++}`;
    this.atoms[id] = { id, x: p.x, y: p.y, element: "C", charge: 0 };
    this.idByPoint.set(k, id);
    return id;
  }

  private addBond(a1: string, a2: string, order: 1 | 2) {
    const bondKey = a1 < a2 ? `${a1}|${a2}` : `${a2}|${a1}`;
    if (this.bondByKey.has(bondKey)) return;
    this.bondByKey.add(bondKey);
    const id = `b${this.nextBondId++}`;
    this.bonds[id] = { id, a1, a2, order, stereo: "none", doubleSide: "auto" };
  }

  /**
   * Adds one ring: `points` in walk order (closed back to points[0]),
   * `doublePairs` index pairs into that walk to make order-2 bonds.
   */
  addRing(points: Pt[], doublePairs: [number, number][] = []) {
    const ids = points.map((p) => this.atomAt(p));
    const doubled = new Set(doublePairs.map(([i, j]) => (ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`)));
    for (let i = 0; i < ids.length; i++) {
      const a1 = ids[i];
      const a2 = ids[(i + 1) % ids.length];
      const pairKey = a1 < a2 ? `${a1}|${a2}` : `${a2}|${a1}`;
      this.addBond(a1, a2, doubled.has(pairKey) ? 2 : 1);
    }
  }

  /** An inter-ring bridge (e.g. biphenyl's single bond) between the atoms
   * at two already-placed points. */
  bridge(p1: Pt, p2: Pt) {
    this.addBond(this.atomAt(p1), this.atomAt(p2), 1);
  }

  /**
   * The four vertices that complete a hexagon fused onto edge e1–e2,
   * walking from e1 around the far side (away from e2) so the caller's
   * full ring walk is [e1, w1, w2, w3, w4, e2]. Rotating e1 about the
   * fused hexagon's centre in one direction lands on e2 after one step —
   * that direction would just retrace the shared edge — so the *other*
   * rotation direction (the one whose first step is not e2) is the far
   * side; walking it four times covers the four new vertices and the walk
   * closes on e2.
   */
  static fusedHexagonVertices(e1: Pt, e2: Pt, awayFrom: Pt): Pt[] {
    const mid = { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 };
    const dx = e2.x - e1.x;
    const dy = e2.y - e1.y;
    const len = Math.hypot(dx, dy);
    // Fused hexagon centre: one hexagon apothem out from the shared edge's
    // midpoint, on the far side (normal points away from the neighbour
    // ring's centre, passed in as `awayFrom`).
    let nx = dy / len;
    let ny = -dx / len;
    if (nx * (awayFrom.x - mid.x) + ny * (awayFrom.y - mid.y) > 0) {
      nx = -nx;
      ny = -ny;
    }
    const center = { x: mid.x + nx * HEX_HALF_W, y: mid.y + ny * HEX_HALF_W };
    const rel = { x: e1.x - center.x, y: e1.y - center.y };
    const step = (dir: number) => {
      const cos = Math.cos((dir * 60 * Math.PI) / 180);
      const sin = Math.sin((dir * 60 * Math.PI) / 180);
      return { x: rel.x * cos - rel.y * sin, y: rel.x * sin + rel.y * cos };
    };
    // The rotation direction whose 60° step lands back on e2 is the shared
    // edge; walk the opposite one, 60° at a time, for the four new
    // vertices.
    const towardE2 = Math.hypot(step(1).x - (e2.x - center.x), step(1).y - (e2.y - center.y)) < 0.01 ? 1 : -1;
    const away = -towardE2;
    const verts: Pt[] = [];
    for (let k = 1; k <= 4; k++) {
      const cos = Math.cos((away * 60 * k * Math.PI) / 180);
      const sin = Math.sin((away * 60 * k * Math.PI) / 180);
      verts.push({ x: center.x + rel.x * cos - rel.y * sin, y: center.y + rel.x * sin + rel.y * cos });
    }
    return verts;
  }

  /**
   * Finishes the template: recentres every atom so the bounding-box centre
   * sits at (0, 0) — the convention StructureTemplate documents — and
   * returns the Molecule.
   */
  build(): Molecule {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const a of Object.values(this.atoms)) {
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x);
      minY = Math.min(minY, a.y);
      maxY = Math.max(maxY, a.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (const a of Object.values(this.atoms)) {
      a.x -= cx;
      a.y -= cy;
    }
    return { atoms: this.atoms, bonds: this.bonds, hapticBonds: {}, aromaticRingDisplays: {} };
  }
}

function aromaticTemplate(id: string, label: string, molecule: Molecule): StructureTemplate {
  return { id, label, category: "namedAromatics", molecule, annotations: [] };
}

/**
 * Anthracene — three linearly fused rings (shared vertical edges at
 * x = ∓36.373). Kekulé matching: outer rings carry three doubles each
 * ({01, 23, 45}), the middle ring two ({01, 23}); the shared edges stay
 * single, each junction carries exactly one double on a non-shared edge,
 * giving C14H10.
 */
function anthracene(): StructureTemplate {
  const b = new FusedBuilder();
  b.addRing(hexagon(-2 * HEX_HALF_W, 0), [[0, 1], [2, 3], [4, 5]]);
  b.addRing(hexagon(0, 0), [[0, 1], [2, 3]]);
  b.addRing(hexagon(2 * HEX_HALF_W, 0), [[0, 1], [2, 3]]);
  return aromaticTemplate("anthracene", "Anthracene", b.build());
}

/**
 * Phenanthrene — angularly fused: the third ring shares the middle ring's
 * upper-right *diagonal* edge rather than its vertical one, which is what
 * bends the skeleton and creates the famous bay region between C4 and C5.
 * A hexagon fused on a ±60° edge has its centre one "hexagon step" up the
 * diagonal: centre offset (+HEX_HALF_W, −1.5·BOND) from the middle ring.
 * Doubles: left ring {01, 23, 45}, middle ring {23} (its other edge is
 * the fusion), right ring {01, 23, 45} — C14H10.
 */
function phenanthrene(): StructureTemplate {
  const b = new FusedBuilder();
  b.addRing(hexagon(0, 0), [[0, 1], [2, 3], [4, 5]]);
  b.addRing(hexagon(2 * HEX_HALF_W, 0), [[2, 3]]);
  // Third ring fused on the middle ring's upper-right diagonal edge
  // (vertices 0–1), bulging up-right. Walk [e1, w1..w4, e2]: the four new
  // vertices go around the far side, the walk closes on e2, and the
  // closing e2–e1 bond dedupes to the already-single shared edge. The
  // third ring carries the standard even alternation on that walk order.
  const mid = hexagon(2 * HEX_HALF_W, 0);
  const third = FusedBuilder.fusedHexagonVertices(mid[0], mid[1], { x: 2 * HEX_HALF_W, y: 0 });
  b.addRing([mid[0], ...third, mid[1]], [[0, 1], [2, 3], [4, 5]]);
  return aromaticTemplate("phenanthrene", "Phenanthrene", b.build());
}

/**
 * Azulene — the non-alternant cyclopentadiene ⊕ cycloheptatriene fusion.
 * Both rings are built on a shared vertical edge from (0, −21) to (0, 21):
 * the pentagon bulges left (apothem PENT_APOTHEM ≈ 28.92) and the heptagon
 * right (apothem √(HEPT_R² − 21²) ≈ 43.60). Doubles: {P2–P3, P4–P5,
 * T1–T2, T3–T4, P1–T5} — one canonical Kekulé structure; the shared edge
 * stays single, both junctions carry their double on a ring edge, C10H8.
 */
function azulene(): StructureTemplate {
  const b = new FusedBuilder();
  // Pentagon left of the shared edge: centre at (−PENT_APOTHEM, 0); its
  // walk starts at the shared edge's top vertex (0, −21).
  const penta = regularPolygon(-PENT_APOTHEM, 0, PENT_R, 5, Math.atan2(-21, PENT_APOTHEM) * (180 / Math.PI));
  // Heptagon right: centre at (√(HEPT_R²−21²), 0); walk starts at the
  // same top shared vertex.
  const heptaCenterX = Math.sqrt(HEPT_R * HEPT_R - 21 * 21);
  const hepta = regularPolygon(heptaCenterX, 0, HEPT_R, 7, Math.atan2(-21, -heptaCenterX) * (180 / Math.PI));
  b.addRing(penta, [[1, 2], [3, 4]]);
  // Heptagon walk (angles increasing from vertex 0) runs down the LEFT
  // side of the ring — vertex 1 is the lower-left vertex T5 — so the
  // canonical doubles {P1–T5, T3–T4, T1–T2} land on index pairs
  // [0,1], [2,3], [4,5]. The closing bond v6–v0 is the shared edge and
  // dedupes to the pentagon's single.
  b.addRing(hepta, [[0, 1], [2, 3], [4, 5]]);
  return aromaticTemplate("azulene", "Azulene", b.build());
}

/**
 * Biphenyl — two benzene rings joined by a single, rotatable bridge bond.
 * The rings are drawn in the usual staggered "herringbone" pose: ring B's
 * centre is one bridge bond (42 px at ±30°) beyond ring A's upper-right
 * vertex, so the bridge reads as a normal bond in the drawing while
 * staying a rotatable single bond in the model. Doubles: even alternation
 * on both rings; the bridge bond is single. C12H10.
 */
function biphenyl(): StructureTemplate {
  const b = new FusedBuilder();
  const ringA = hexagon(0, 0);
  // Ring B centre: from A's upper-right vertex, one bond length up-right
  // at 30° above horizontal (y-down: −30°).
  const step = polar(-30, BOND);
  const ringB = hexagon(ringA[1].x + step.x + HEX_HALF_W, ringA[1].y + step.y + BOND / 2);
  b.addRing(ringA, [[0, 1], [2, 3], [4, 5]]);
  b.addRing(ringB, [[0, 1], [2, 3], [4, 5]]);
  // Bridge: A's upper-right vertex (index 1) to B's facing (lower-left)
  // vertex (index 5).
  b.bridge(ringA[1], ringB[5]);
  return aromaticTemplate("biphenyl", "Biphenyl", b.build());
}

/**
 * Fluorene — biphenyl's two rings tied together by a sp³ methylene bridge
 * (C9), i.e. a central cyclopentadiene ring fused to a benzene on each of
 * its upper slanted edges. The pentagon is drawn apex-down (the CH2 at the
 * bottom), which is the conventional fluorene pose. Doubles: the two
 * benzo rings alternate ({0–1, 2–3, 4–5} in each one's own walk order);
 * the pentagon is all single, so the apex carbon carries two H. C13H10.
 */
function fluoreneIndene(id: string, label: string, withLeftRing: boolean): StructureTemplate {
  const b = new FusedBuilder();
  // Central pentagon, apex pointing down: walk apex (90°) → lower-left →
  // upper-left → upper-right → lower-right.
  const pent = regularPolygon(0, 0, PENT_R, 5, 90);
  // Shared edges: the upper slanted edges — tr–r (indices 3–4) on the
  // right, l–tl (indices 1–2) on the left.
  const pentCenter = { x: 0, y: 0 };
  const rightHex = FusedBuilder.fusedHexagonVertices(pent[3], pent[4], pentCenter);
  b.addRing([pent[3], ...rightHex, pent[4]], [[0, 1], [2, 3], [4, 5]]);
  if (withLeftRing) {
    const leftHex = FusedBuilder.fusedHexagonVertices(pent[1], pent[2], pentCenter);
    b.addRing([pent[1], ...leftHex, pent[2]], [[0, 1], [2, 3], [4, 5]]);
  }
  // The pentagon is added last: its bonds are all single (fluorene) or
  // carry the lone C2=C3 on the non-fused left edge (indene's [[1,2]]),
  // and its two shared edges dedupe to the benzo rings' single fusion
  // bonds rather than the other way round.
  b.addRing(pent, withLeftRing ? [] : [[1, 2]]);
  return aromaticTemplate(id, label, b.build());
}

/**
 * The named-aromatics set re-exported into STRUCTURE_TEMPLATES by
 * model/structureTemplates.ts. Fluorene (two benzo rings + CH2 bridge) and
 * indene (one benzo ring + CH2, i.e. benzocyclopentene) share the builder;
 * the pentagon's lone C=C in indene sits on the C2–C3 bond opposite the
 * bridge — its canonical depiction.
 */
export const AROMATIC_TEMPLATES: StructureTemplate[] = [
  anthracene(),
  phenanthrene(),
  azulene(),
  biphenyl(),
  fluoreneIndene("fluorene", "Fluorene", true),
  fluoreneIndene("indene", "Indene", false),
];
