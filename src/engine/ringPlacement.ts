import type { Molecule, Point, RingAttachment, RingTemplate } from "../types/chemistry";
import { addAtom, addBond } from "../model/molecule";
import { angleOf, dist, polar } from "../model/geometry";
import { neighborAngles } from "../model/valence";
import { BOND_LEN } from "../model/constants";
import { nextId } from "../model/id";

/** One ring vertex's resolved world position, plus (when it reuses an atom
 * already on the canvas) that atom's id — shared shape for both the real
 * placement and its hover preview. */
interface RingVertex {
  pos: Point;
  existingId: string | null;
}

/** Existing bonded neighbors of `atomId`, excluding `excludeId` (its
 * partner in the attachment) — used to steer a newly-fused ring away from
 * whatever else the attachment point/bond already connects to. */
function otherNeighborPositions(mol: Molecule, atomId: string, excludeId: string): Point[] {
  const positions: Point[] = [];
  for (const b of Object.values(mol.bonds)) {
    const other = b.a1 === atomId ? b.a2 : b.a2 === atomId ? b.a1 : null;
    if (other && other !== excludeId) positions.push(mol.atoms[other]);
  }
  return positions;
}

/**
 * Computes world positions for a single (non-fused) `sides`-gon template,
 * honoring `attachment`. Shared by placeRing (which turns this into real
 * atoms/bonds) and previewRing (which just draws it), so the hover preview
 * always matches exactly where the ring will actually land.
 */
function computeSingleRingVertices(mol: Molecule, sides: number, center: Point, attachment: RingAttachment): RingVertex[] {
  if (attachment.type === "bond") {
    const p1 = mol.atoms[attachment.a1];
    const p2 = mol.atoms[attachment.a2];
    if (!p1 || !p2) return computeSingleRingVertices(mol, sides, center, { type: "none" });

    const r = dist(p1, p2) / (2 * Math.sin(Math.PI / sides));
    const apothem = r * Math.cos(Math.PI / sides);
    const bondAngle = angleOf(p1, p2);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // The ring can bulge to either side of the bond; pick whichever side
    // sits farther from whatever else the two bond atoms already connect
    // to, so the new ring doesn't land on top of existing structure.
    const centerA = { x: midX + apothem * Math.cos(bondAngle + Math.PI / 2), y: midY + apothem * Math.sin(bondAngle + Math.PI / 2) };
    const centerB = { x: midX + apothem * Math.cos(bondAngle - Math.PI / 2), y: midY + apothem * Math.sin(bondAngle - Math.PI / 2) };
    const others = [
      ...otherNeighborPositions(mol, attachment.a1, attachment.a2),
      ...otherNeighborPositions(mol, attachment.a2, attachment.a1),
    ];
    const score = (c: Point) => others.reduce((sum, p) => sum + dist(c, p), 0);
    // No other neighbors to steer clear of: default to "above" the bond
    // (smaller y), matching every other ring template's default upward
    // (-90°) orientation.
    const ringCenter = others.length ? (score(centerA) >= score(centerB) ? centerA : centerB)
      : (centerA.y <= centerB.y ? centerA : centerB);

    const angle1 = angleOf(ringCenter, p1);
    const angle2 = angleOf(ringCenter, p2);
    const step = (2 * Math.PI) / sides;
    const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // p1, p2 are adjacent ring vertices; figure out which rotation
    // direction (+step or -step) actually walks from p1 to p2.
    const dir = Math.abs(norm(angle1 + step) - norm(angle2)) < 1e-6 ? 1 : -1;

    const vertices: RingVertex[] = [];
    for (let i = 0; i < sides; i++) {
      if (i === 0) vertices.push({ pos: p1, existingId: attachment.a1 });
      else if (i === 1) vertices.push({ pos: p2, existingId: attachment.a2 });
      else vertices.push({ pos: polar(ringCenter.x, ringCenter.y, r, angle1 + dir * i * step), existingId: null });
    }
    return vertices;
  }

  const r = BOND_LEN / (2 * Math.sin(Math.PI / sides));
  let cx = center.x;
  let cy = center.y;
  let startAngle = -Math.PI / 2;

  if (attachment.type === "atom") {
    const a = mol.atoms[attachment.atomId];
    const existingAngles = neighborAngles(mol, attachment.atomId);
    const dir = existingAngles.length ? existingAngles[0] + Math.PI : -Math.PI / 2;
    cx = a.x + r * Math.cos(dir);
    cy = a.y + r * Math.sin(dir);
    startAngle = angleOf({ x: cx, y: cy }, a);
  }

  const vertices: RingVertex[] = [];
  for (let i = 0; i < sides; i++) {
    if (i === 0 && attachment.type === "atom") {
      vertices.push({ pos: mol.atoms[attachment.atomId], existingId: attachment.atomId });
      continue;
    }
    vertices.push({ pos: polar(cx, cy, r, startAngle + (i * 2 * Math.PI) / sides), existingId: null });
  }
  return vertices;
}

/**
 * Places a new ring in `mol` per `attachment` — centered at `center` on
 * empty canvas, fused through a single existing atom, or fused directly
 * onto an existing bond (which becomes one of the new ring's edges).
 */
export function placeRing(mol: Molecule, template: RingTemplate, center: Point, attachment: RingAttachment): Molecule {
  if (template.fused) {
    return placeNaphthalene(mol, center, attachment);
  }

  const sides = template.sides;
  const vertices = computeSingleRingVertices(mol, sides, center, attachment);

  let working = mol;
  const ids: string[] = [];
  for (let i = 0; i < sides; i++) {
    const v = vertices[i];
    if (v.existingId) {
      // Fusing onto existing atom(s): leave their element as-is rather than
      // overwriting with a heteroatom override — see RingTemplate's
      // heteroatoms doc comment.
      ids.push(v.existingId);
      continue;
    }
    const id = nextId();
    const element = template.heteroatoms?.find((h) => h.position === i)?.element ?? "C";
    working = addAtom(working, id, v.pos, element);
    ids.push(id);
  }

  for (let i = 0; i < sides; i++) {
    const a1 = ids[i];
    const a2 = ids[(i + 1) % sides];
    const order = template.bondOrders?.[i] ?? (template.aromatic && i % 2 === 0 ? 2 : 1);
    // addBond is a no-op if a1/a2 are already bonded (true for the shared
    // edge when attachment.type === "bond"), so the existing bond's own
    // order/stereo is left untouched rather than overwritten.
    working = addBond(working, nextId(), a1, a2, order, "none");
  }

  return working;
}

// ---------------------------------------------------------------------
// Naphthalene: two fused regular hexagons, sharing one edge.
// ---------------------------------------------------------------------

/** Local layout, whole-molecule centroid at the origin, fusion bond
 * vertical at x = 0. S1/S2 are the two shared (bridgehead) carbons; A1-A4
 * and B1-B4 are each ring's other four carbons, in ring-walk order. Built
 * fresh per call for a given circumradius `r` (BOND_LEN normally, or the
 * actual existing-bond length when fusing onto a bond — see
 * placeNaphthalene). */
function naphthaleneLocalLayout(r: number): Record<string, Point> {
  const a = (r * Math.sqrt(3)) / 2; // apothem — half the center-to-center distance between the two fused hexagons
  return {
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
}

/** Both hexagons' ring-walk bonds (each list includes the shared S1-S2
 * edge once); `double` encodes naphthalene's Kekulé pattern — the shared
 * fusion bond plus two more alternating double bonds per ring (5 total),
 * which is what gives the two bridgehead carbons (S1, S2) zero implicit
 * hydrogens and every other carbon exactly one, so the resulting formula
 * is C10H8 (MW ~128.17 g/mol, matching real naphthalene). */
const NAPHTHALENE_BONDS: { from: string; to: string; double: boolean }[] = [
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

/** A plain (non-bridgehead) carbon to fuse onto a single existing atom
 * through — it picks up exactly one double + one single ring bond,
 * leaving one valence slot free for whatever that atom was already
 * bonded to, same budget a single-ring attach atom leaves. */
const ATOM_ATTACH_KEY = "A3";
/** A plain, adjacent (non-bridgehead) edge to fuse onto an existing bond
 * through — both ends keep a spare valence slot for the rest of what they
 * were already bonded to (2 free on A2, 1 free on A3). */
const BOND_ATTACH_EDGE: [string, string] = ["A2", "A3"];

function rotate(p: Point, cos: number, sin: number): Point {
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/**
 * Resolves the rigid rotation+translation that carries the fixed local
 * naphthalene layout into world space, honoring `attachment`. Returns the
 * transform plus (for "bond" attachment, where either side of the bond is
 * geometrically valid) picks whichever orientation sits farther from the
 * rest of the existing structure.
 */
function resolveNaphthaleneTransform(
  mol: Molecule,
  center: Point,
  attachment: RingAttachment
): { local: Record<string, Point>; worldOf: (p: Point) => Point; attachIds: Partial<Record<string, string>> } {
  if (attachment.type === "bond") {
    const p1 = mol.atoms[attachment.a1];
    const p2 = mol.atoms[attachment.a2];
    if (p1 && p2) {
      const r = dist(p1, p2); // keep the shared edge's length exactly what it already is
      const local = naphthaleneLocalLayout(r);
      const [qKey1, qKey2] = BOND_ATTACH_EDGE;
      const Q1 = local[qKey1];
      const Q2 = local[qKey2];

      // Two rigid (rotation-only, no mirroring) mappings exist — Q1->p1,
      // Q2->p2, or the swapped Q1->p2, Q2->p1 — and they place the fused
      // pair's bulk on opposite sides of the bond. Try both, keep whichever
      // clears the rest of the existing structure better. Each candidate
      // carries its own attachIds alongside its worldOf, since which local
      // key maps to which real atom id flips between the two.
      const build = (targetFor1: Point, targetFor2: Point, idFor1: string, idFor2: string) => {
        const theta = angleOf(targetFor1, targetFor2) - angleOf(Q1, Q2);
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const rq1 = rotate(Q1, cos, sin);
        const tx = targetFor1.x - rq1.x;
        const ty = targetFor1.y - rq1.y;
        const worldOf = (p: Point): Point => {
          const rp = rotate(p, cos, sin);
          return { x: tx + rp.x, y: ty + rp.y };
        };
        return { worldOf, attachIds: { [qKey1]: idFor1, [qKey2]: idFor2 } };
      };
      const candidateA = build(p1, p2, attachment.a1, attachment.a2);
      const candidateB = build(p2, p1, attachment.a2, attachment.a1);

      const others = [
        ...otherNeighborPositions(mol, attachment.a1, attachment.a2),
        ...otherNeighborPositions(mol, attachment.a2, attachment.a1),
      ];
      const scoreOf = (worldOf: (p: Point) => Point) => {
        let sum = 0;
        for (const key in local) {
          if (key === qKey1 || key === qKey2) continue;
          const wp = worldOf(local[key]);
          for (const o of others) sum += dist(wp, o);
        }
        return sum;
      };
      const chosen = others.length
        ? (scoreOf(candidateA.worldOf) >= scoreOf(candidateB.worldOf) ? candidateA : candidateB)
        // No other neighbors to steer clear of: default to whichever
        // orientation's non-attach atoms sit higher up (smaller average
        // y), matching the rest of the app's upward default.
        : (() => {
            const avgY = (w: (p: Point) => Point) => {
              let sum = 0, n = 0;
              for (const key in local) { if (key !== qKey1 && key !== qKey2) { sum += w(local[key]).y; n++; } }
              return sum / n;
            };
            return avgY(candidateA.worldOf) <= avgY(candidateB.worldOf) ? candidateA : candidateB;
          })();
      const { worldOf, attachIds } = chosen;
      return { local, worldOf, attachIds };
    }
  }

  const r = BOND_LEN;
  const local = naphthaleneLocalLayout(r);
  let theta = 0;
  let tx = center.x;
  let ty = center.y;

  if (attachment.type === "atom") {
    const atom = mol.atoms[attachment.atomId];
    const existingAngles = neighborAngles(mol, attachment.atomId);
    const dir = existingAngles.length ? existingAngles[0] + Math.PI : -Math.PI / 2;
    const v0 = local[ATOM_ATTACH_KEY];
    const localDir = angleOf(v0, { x: 0, y: 0 }); // local direction from the attach vertex toward the rest of the fused pair
    theta = dir - localDir; // rotate so that direction now points along `dir`, i.e. away from the atom's existing bonds
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const rotatedV0 = rotate(v0, cos, sin);
    tx = atom.x - rotatedV0.x;
    ty = atom.y - rotatedV0.y;
  }

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const worldOf = (p: Point): Point => {
    const rp = rotate(p, cos, sin);
    return { x: tx + rp.x, y: ty + rp.y };
  };
  return { local, worldOf, attachIds: attachment.type === "atom" ? { [ATOM_ATTACH_KEY]: attachment.atomId } : {} };
}

/**
 * Places naphthalene: two regular hexagons (all bond lengths equal) fused
 * sharing one edge — 10 carbons, 11 bonds. Unlike the generic polygon code
 * above, this shape isn't point-symmetric, so it's built from a fixed local
 * layout which is then rigidly rotated + translated into place — onto
 * `center` directly (empty canvas), fused through a single existing atom,
 * or fused directly onto an existing bond (see resolveNaphthaleneTransform
 * for how each case picks its transform).
 */
function placeNaphthalene(mol: Molecule, center: Point, attachment: RingAttachment): Molecule {
  const { local, worldOf, attachIds } = resolveNaphthaleneTransform(mol, center, attachment);

  let working = mol;
  const ids: Record<string, string> = {};
  for (const key in local) {
    const existing = attachIds[key];
    if (existing) {
      // Fusing onto existing atom(s): leave their element/identity as-is
      // rather than minting a new one — see placeRing's matching comment.
      ids[key] = existing;
      continue;
    }
    const id = nextId();
    working = addAtom(working, id, worldOf(local[key]), "C");
    ids[key] = id;
  }

  for (const b of NAPHTHALENE_BONDS) {
    // addBond is a no-op if already bonded (true for the shared edge when
    // fusing onto a bond), leaving that existing bond's order untouched.
    working = addBond(working, nextId(), ids[b.from], ids[b.to], b.double ? 2 : 1, "none");
  }

  return working;
}

// ---------------------------------------------------------------------
// Hover preview: same geometry as above, but returns polygon outlines to
// draw rather than mutating the molecule — so what you see hovering is
// exactly what you'll get on click.
// ---------------------------------------------------------------------

/**
 * Computes the polygon outline(s) a ring template would produce for
 * `attachment`, without touching the molecule — for the ring tool's hover
 * preview. Returns one closed point loop for a plain ring, or two (one per
 * hexagon) for naphthalene.
 */
export function previewRingLoops(mol: Molecule, template: RingTemplate, center: Point, attachment: RingAttachment): Point[][] {
  if (template.fused) {
    const { local, worldOf } = resolveNaphthaleneTransform(mol, center, attachment);
    const loopA = ["S1", "S2", "A1", "A2", "A3", "A4"].map((k) => worldOf(local[k]));
    const loopB = ["S2", "S1", "B1", "B2", "B3", "B4"].map((k) => worldOf(local[k]));
    return [loopA, loopB];
  }
  const vertices = computeSingleRingVertices(mol, template.sides, center, attachment);
  return [vertices.map((v) => v.pos)];
}
