import { describe, expect, test } from "vitest";
import type { Molecule } from "../types/chemistry";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { BOND_LEN } from "../model/constants";
import { cleanStructure2D, connectedComponents, standardBondLength } from "./clean2d";

// ---------------------------------------------------------------------------
// Geometry helpers (kept independent of the engine's own math on purpose —
// they re-derive angles/lengths from raw coordinates so a bug in the engine's
// helpers can't hide behind a matching bug in the test's)
// ---------------------------------------------------------------------------

function bondLen(mol: Molecule, aId: string, bId: string): number {
  const a = mol.atoms[aId];
  const b = mol.atoms[bId];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The (0..180] interior angle at a 2-bonded atom, in degrees. */
function vertexAngleDeg(mol: Molecule, id: string): number {
  const a = mol.atoms[id];
  const neighbors = Object.values(mol.bonds)
    .filter((b) => b.a1 === id || b.a2 === id)
    .map((b) => (b.a1 === id ? mol.atoms[b.a2] : mol.atoms[b.a1]));
  if (neighbors.length !== 2) throw new Error(`atom ${id} has ${neighbors.length} bonds, expected 2`);
  return angleAtDeg(a, neighbors[0], neighbors[1]);
}

/** The (0..180] angle at vertex `v` between the directions to `p` and `q`. */
function angleAtDeg(v: { x: number; y: number }, p: { x: number; y: number }, q: { x: number; y: number }): number {
  const a1 = Math.atan2(p.y - v.y, p.x - v.x);
  const a2 = Math.atan2(q.y - v.y, q.x - v.x);
  let d = Math.abs(a1 - a2);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

/** Sign of which side of the directed line a→b the point `p` is on — the
 * same cross-product test the engine's cis/trans repair uses. */
function sideSign(mol: Molecule, aId: string, bId: string, pId: string): number {
  const a = mol.atoms[aId];
  const b = mol.atoms[bId];
  const p = mol.atoms[pId];
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

function centroid(mol: Molecule, ids: string[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const id of ids) {
    sx += mol.atoms[id].x;
    sy += mol.atoms[id].y;
  }
  return { x: sx / ids.length, y: sy / ids.length };
}

/** Angstroms → canvas units, written out from the documented table rather
 * than imported, so the tests pin the table's *values*: a C–C single bond is
 * exactly BOND_LEN and everything else scales from real bond lengths. */
const aToCanvas = BOND_LEN / 1.54;
function fromAngstroms(pairA: number, pairB: number, factor = 1): number {
  return ((pairA + pairB) / 2) * aToCanvas * factor;
}

describe("bond-length model (standardBondLength)", () => {
  test("a C–C single bond is exactly the canvas BOND_LEN (scale never changes)", () => {
    expect(standardBondLength("C", "C", 1)).toBe(BOND_LEN);
  });

  test("heteroatom bonds use the textbook table (C–Cl, C–O, C–H)", () => {
    expect(standardBondLength("C", "Cl", 1)).toBeCloseTo(fromAngstroms(1.54, 1.77), 6);
    expect(standardBondLength("C", "O", 1)).toBeCloseTo(fromAngstroms(1.54, 1.43), 6);
    expect(standardBondLength("C", "H", 1)).toBeCloseTo(fromAngstroms(1.54, 1.09), 6);
  });

  test("double and triple bonds contract; aromatic contracts less than double", () => {
    expect(standardBondLength("C", "C", 2)).toBeCloseTo(BOND_LEN * 0.93, 6);
    expect(standardBondLength("C", "C", 3)).toBeCloseTo(BOND_LEN * 0.88, 6);
    expect(standardBondLength("C", "C", 1, true)).toBeCloseTo(BOND_LEN * 0.95, 6);
    expect(standardBondLength("C", "C", 2, true)).toBeCloseTo(BOND_LEN * 0.95, 6);
  });
});

describe("ideal angles per hybridisation", () => {
  test("sp: a triple bond's carbon is drawn linear (180°) at both ends", () => {
    // but-2-yne skeleton: a–b≡c–d
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 18 }, "C");
    mol = addAtom(mol, "c", { x: 85, y: 5 }, "C");
    mol = addAtom(mol, "d", { x: 120, y: 30 }, "C");
    mol = addBond(mol, "b1", "a", "b", 1);
    mol = addBond(mol, "b2", "b", "c", 3);
    mol = addBond(mol, "b3", "c", "d", 1);

    const cleaned = cleanStructure2D(mol).mol;

    expect(vertexAngleDeg(cleaned, "b")).toBeCloseTo(180, 6);
    expect(vertexAngleDeg(cleaned, "c")).toBeCloseTo(180, 6);
  });

  test("sp: a cumulated diene center (two double bonds) is linear too", () => {
    // allene skeleton: a=b=c
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 38, y: 14 }, "C");
    mol = addAtom(mol, "c", { x: 70, y: -8 }, "C");
    mol = addBond(mol, "b1", "a", "b", 2);
    mol = addBond(mol, "b2", "b", "c", 2);

    const cleaned = cleanStructure2D(mol).mol;
    expect(vertexAngleDeg(cleaned, "b")).toBeCloseTo(180, 6);
    // and both bonds are true double-bond lengths
    expect(bondLen(cleaned, "a", "b")).toBeCloseTo(standardBondLength("C", "C", 2), 6);
  });

  test("sp2: a double-bond carbon with one other neighbor sits at 120°", () => {
    // propene skeleton: a=b–c
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 45, y: 10 }, "C");
    mol = addAtom(mol, "c", { x: 80, y: 28 }, "C");
    mol = addBond(mol, "b1", "a", "b", 2);
    mol = addBond(mol, "b2", "b", "c", 1);

    const cleaned = cleanStructure2D(mol).mol;
    expect(vertexAngleDeg(cleaned, "b")).toBeCloseTo(120, 6);
  });

  test("sp3: a 2-coordinate carbon is drawn at the skeletal 120°, not 109.5°", () => {
    // butane skeleton, deliberately wobbly
    let mol = emptyMolecule();
    const pts = [{ x: 0, y: 0 }, { x: 44, y: -6 }, { x: 82, y: 14 }, { x: 128, y: 2 }];
    const ids = ["a", "b", "c", "d"];
    pts.forEach((p, i) => {
      mol = addAtom(mol, ids[i], p, "C");
    });
    for (let i = 0; i < 3; i++) mol = addBond(mol, `b${i}`, ids[i], ids[i + 1], 1);

    const cleaned = cleanStructure2D(mol).mol;
    expect(vertexAngleDeg(cleaned, "b")).toBeCloseTo(120, 6);
    expect(vertexAngleDeg(cleaned, "c")).toBeCloseTo(120, 6);
    for (const [x, y] of [["a", "b"], ["b", "c"], ["c", "d"]]) {
      expect(bondLen(cleaned, x, y)).toBeCloseTo(BOND_LEN, 6);
    }
  });

  test("sp3: a 3-coordinate carbon fans its remaining bonds ±110° around the incoming bond", () => {
    // isobutane skeleton: a–b, plus b–c and b–m (b is the 3-coordinate hub)
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 9 }, "C");
    mol = addAtom(mol, "c", { x: 88, y: -4 }, "C");
    mol = addAtom(mol, "m", { x: 55, y: 45 }, "C");
    mol = addBond(mol, "b1", "a", "b", 1);
    mol = addBond(mol, "b2", "b", "c", 1);
    mol = addBond(mol, "b3", "b", "m", 1);

    const cleaned = cleanStructure2D(mol).mol;
    // 109.5° clamped to 110° for each drawn-out bond (the pair sums with
    // the 140° between them to fill the plane).
    expect(angleAtDeg(cleaned.atoms.b, cleaned.atoms.a, cleaned.atoms.c)).toBeCloseTo(110, 1);
    expect(angleAtDeg(cleaned.atoms.b, cleaned.atoms.a, cleaned.atoms.m)).toBeCloseTo(110, 1);
  });
});

describe("real bond lengths in a cleaned drawing", () => {
  test("cleaned bonds land on the element/order lengths, not one fixed length", () => {
    // chloroethenal-ish skeleton mixing C–C, C=O and C–Cl
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: 50, y: 12 }, "C");
    mol = addAtom(mol, "o1", { x: 95, y: -6 }, "O");
    mol = addAtom(mol, "cl1", { x: 30, y: 48 }, "Cl");
    mol = addBond(mol, "b1", "c1", "c2", 1);
    mol = addBond(mol, "b2", "c2", "o1", 2);
    mol = addBond(mol, "b3", "c1", "cl1", 1);

    const cleaned = cleanStructure2D(mol).mol;

    expect(bondLen(cleaned, "c1", "c2")).toBeCloseTo(standardBondLength("C", "C", 1), 6);
    expect(bondLen(cleaned, "c2", "o1")).toBeCloseTo(standardBondLength("C", "O", 2), 6);
    expect(bondLen(cleaned, "c1", "cl1")).toBeCloseTo(standardBondLength("C", "Cl", 1), 6);
    // sanity on the actual numbers: C–C = 42, C=O ≈ 37.7, C–Cl ≈ 45.1
    expect(bondLen(cleaned, "c1", "c2")).toBe(BOND_LEN);
    expect(bondLen(cleaned, "c2", "o1")).toBeCloseTo(fromAngstroms(1.54, 1.43, 0.93), 6);
    expect(bondLen(cleaned, "c1", "cl1")).toBeCloseTo(fromAngstroms(1.54, 1.77), 6);
  });
});

describe("ring templates", () => {
  test("a badly distorted cyclohexane comes out a regular hexagon", () => {
    let mol = emptyMolecule();
    const scrambled = [
      { x: 0, y: 0 }, { x: 47, y: 9 }, { x: 60, y: 55 }, { x: 22, y: 80 },
      { x: -30, y: 62 }, { x: -38, y: 15 },
    ];
    const ids = ["r0", "r1", "r2", "r3", "r4", "r5"];
    scrambled.forEach((p, i) => {
      mol = addAtom(mol, ids[i], p, "C");
    });
    for (let i = 0; i < 6; i++) mol = addBond(mol, `rb${i}`, ids[i], ids[(i + 1) % 6], 1);

    const cleaned = cleanStructure2D(mol).mol;

    for (let i = 0; i < 6; i++) {
      expect(bondLen(cleaned, ids[i], ids[(i + 1) % 6])).toBeCloseTo(BOND_LEN, 6);
      expect(vertexAngleDeg(cleaned, ids[i])).toBeCloseTo(120, 4);
    }
  });
});

describe("cis/trans preservation for double bonds", () => {
  function dichloroethene(cl2: { x: number; y: number }): Molecule {
    // Distorted cis/trans-1,2-dichloroethene: c1=c2 axis, one Cl on each
    // carbon. `cl2`'s position decides cis (same y-side as cl1) vs trans.
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: 50, y: 12 }, "C");
    mol = addAtom(mol, "cl1", { x: -18, y: 30 }, "Cl");
    mol = addAtom(mol, "cl2", cl2, "Cl");
    mol = addBond(mol, "dbl", "c1", "c2", 2);
    mol = addBond(mol, "s1", "c1", "cl1", 1);
    mol = addBond(mol, "s2", "c2", "cl2", 1);
    return mol;
  }

  test("cis-dichloroethene: both chlorines stay on the same side after cleaning", () => {
    const mol = dichloroethene({ x: 72, y: 40 }); // both Cl above the axis
    expect(sideSign(mol, "c1", "c2", "cl1")).toBe(1);
    expect(sideSign(mol, "c1", "c2", "cl2")).toBe(1);

    const cleaned = cleanStructure2D(mol).mol;

    const after1 = sideSign(cleaned, "c1", "c2", "cl1");
    const after2 = sideSign(cleaned, "c1", "c2", "cl2");
    expect(after1).not.toBe(0);
    expect(after2).not.toBe(0);
    expect(after1).toBe(after2);
  });

  test("trans-dichloroethene: the chlorines stay on opposite sides", () => {
    const mol = dichloroethene({ x: 72, y: -30 }); // cl1 above, cl2 below
    expect(sideSign(mol, "c1", "c2", "cl1")).toBe(1);
    expect(sideSign(mol, "c1", "c2", "cl2")).toBe(-1);

    const cleaned = cleanStructure2D(mol).mol;

    const after1 = sideSign(cleaned, "c1", "c2", "cl1");
    const after2 = sideSign(cleaned, "c1", "c2", "cl2");
    expect(after1).not.toBe(0);
    expect(after2).not.toBe(0);
    expect(after1).toBe(-after2);
  });
});

describe("stereo preservation", () => {
  test("both endpoints of a wedge bond stay exactly where they were", () => {
    // 2-butanol-ish: the c1–c2 bond is a drawn wedge, so c1 and c2 anchor
    // manual stereochemistry and must not move at all.
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: 40, y: 8 }, "C");
    mol = addAtom(mol, "c3", { x: 85, y: -5 }, "C");
    mol = addAtom(mol, "o1", { x: 60, y: 45 }, "O");
    mol = addBond(mol, "wedge", "c1", "c2", 1, "wedge");
    mol = addBond(mol, "b2", "c2", "c3", 1);
    mol = addBond(mol, "b3", "c2", "o1", 1);

    const result = cleanStructure2D(mol);
    const cleaned = result.mol;

    // Reference equality is the strongest possible "not touched": the
    // engine rewrites only moved atoms, so the wedge endpoints are the very
    // same objects.
    expect(cleaned.atoms.c1).toBe(mol.atoms.c1);
    expect(cleaned.atoms.c2).toBe(mol.atoms.c2);
    // Everything else still gets cleaned, anchored on the fixed wedge ends.
    expect(bondLen(cleaned, "c2", "c3")).toBeCloseTo(BOND_LEN, 6);
    expect(bondLen(cleaned, "c2", "o1")).toBeCloseTo(standardBondLength("C", "O", 1), 6);
    expect(result.moved).toBe(2);
  });
});

describe("non-bonded overlap penalty", () => {
  test("four methyls drawn on the same spot get pushed apart to readable separation", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c0", { x: 0, y: 0 }, "C");
    for (const id of ["m1", "m2", "m3", "m4"]) {
      mol = addAtom(mol, id, { x: 12, y: 7 }, "C");
      mol = addBond(mol, `b-${id}`, "c0", id, 1);
    }

    const cleaned = cleanStructure2D(mol).mol;

    // Every non-bonded pair ends at least ~0.8× a C–C bond apart (the
    // penalty's threshold), small tolerance for convergence.
    const threshold = 0.8 * standardBondLength("C", "C", 1);
    const methyls = ["m1", "m2", "m3", "m4"];
    for (let i = 0; i < methyls.length; i++) {
      for (let j = i + 1; j < methyls.length; j++) {
        expect(bondLen(cleaned, methyls[i], methyls[j])).toBeGreaterThanOrEqual(threshold - 1);
      }
    }
  });
});

describe("determinism and purity", () => {
  test("is idempotent: cleaning an already-cleaned structure moves nothing", () => {
    // distorted cyclohexane with a propyl chain — plenty of geometry for a
    // second pass to disagree with, if it were going to
    let mol = emptyMolecule();
    const ring = [
      { x: 0, y: 0 }, { x: 47, y: 9 }, { x: 60, y: 55 }, { x: 22, y: 80 },
      { x: -30, y: 62 }, { x: -38, y: 15 },
    ];
    const rIds = ["r0", "r1", "r2", "r3", "r4", "r5"];
    ring.forEach((p, i) => {
      mol = addAtom(mol, rIds[i], p, "C");
    });
    for (let i = 0; i < 6; i++) mol = addBond(mol, `rb${i}`, rIds[i], rIds[(i + 1) % 6], 1);
    mol = addAtom(mol, "s1", { x: -80, y: -10 }, "C");
    mol = addAtom(mol, "s2", { x: -110, y: 12 }, "C");
    mol = addAtom(mol, "s3", { x: -150, y: -8 }, "C");
    mol = addBond(mol, "sb1", "r4", "s1", 1);
    mol = addBond(mol, "sb2", "s1", "s2", 1);
    mol = addBond(mol, "sb3", "s2", "s3", 1);

    const first = cleanStructure2D(mol);
    expect(first.moved).toBeGreaterThan(0);

    const second = cleanStructure2D(first.mol);
    expect(second.moved).toBe(0);
    for (const id of Object.keys(first.mol.atoms)) {
      expect(second.mol.atoms[id].x).toBeCloseTo(first.mol.atoms[id].x, 6);
      expect(second.mol.atoms[id].y).toBeCloseTo(first.mol.atoms[id].y, 6);
    }
  });

  test("an already-ideal zigzag chain is a no-op (moved = 0)", () => {
    // built from the same trig the engine uses, so exact equality is fair
    let mol = emptyMolecule();
    mol = addAtom(mol, "c0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "c1", { x: BOND_LEN, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: BOND_LEN + BOND_LEN * Math.cos(Math.PI / 3), y: BOND_LEN * Math.sin(Math.PI / 3) }, "C");
    mol = addAtom(mol, "c3", { x: 2 * BOND_LEN + BOND_LEN * Math.cos(Math.PI / 3), y: BOND_LEN * Math.sin(Math.PI / 3) }, "C");
    mol = addBond(mol, "b1", "c0", "c1", 1);
    mol = addBond(mol, "b2", "c1", "c2", 1);
    mol = addBond(mol, "b3", "c2", "c3", 1);

    const result = cleanStructure2D(mol);
    expect(result.moved).toBe(0);
  });

  test("never mutates the input molecule; moved atoms are new objects, still ones keep their identity", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 9 }, "C");
    mol = addAtom(mol, "c", { x: 88, y: -4 }, "C");
    mol = addAtom(mol, "m", { x: 55, y: 45 }, "C");
    mol = addBond(mol, "b1", "a", "b", 1);
    mol = addBond(mol, "b2", "b", "c", 1);
    mol = addBond(mol, "b3", "b", "m", 1);

    const snapshot = JSON.stringify(mol);
    const result = cleanStructure2D(mol);

    expect(JSON.stringify(mol)).toBe(snapshot);
    expect(result.mol).not.toBe(mol);
    expect(result.mol.atoms.c).not.toBe(mol.atoms.c); // moved → fresh object
    expect(Object.keys(result.mol.bonds)).toEqual(Object.keys(mol.bonds)); // connectivity untouched
    expect(result.mol.atoms.c.element).toBe("C"); // only positions change
  });

  test("boundary atoms are fixed: cleaning a chain selection moves neither the ring it hangs on nor the attachment atom", () => {
    let mol = emptyMolecule();
    // a regular hexagon…
    const r = BOND_LEN / (2 * Math.sin(Math.PI / 6));
    const rIds = ["r0", "r1", "r2", "r3", "r4", "r5"];
    rIds.forEach((id, i) => {
      const a = (i / 6) * 2 * Math.PI;
      mol = addAtom(mol, id, { x: r * Math.cos(a), y: r * Math.sin(a) }, "C");
    });
    for (let i = 0; i < 6; i++) mol = addBond(mol, `rb${i}`, rIds[i], rIds[(i + 1) % 6], 1);
    // …plus a wobbly 2-atom chain off r0
    mol = addAtom(mol, "s1", { x: r + 50, y: 3 }, "C");
    mol = addAtom(mol, "s2", { x: r + 85, y: 30 }, "C");
    mol = addBond(mol, "sb1", "r0", "s1", 1);
    mol = addBond(mol, "sb2", "s1", "s2", 1);

    const result = cleanStructure2D(mol, ["s1", "s2"]);
    const cleaned = result.mol;

    // s1 is a boundary atom (bonded to r0, outside the selection): pinned.
    expect(cleaned.atoms.s1).toBe(mol.atoms.s1);
    // everything outside the selection is untouched, objects included
    for (const id of rIds) expect(cleaned.atoms[id]).toBe(mol.atoms[id]);
    // the chain still gets cleaned, anchored on s1
    expect(bondLen(cleaned, "s1", "s2")).toBeCloseTo(BOND_LEN, 6);
  });

  test("a boundary-free fragment recentres: its centroid lands where it started", () => {
    let mol = emptyMolecule();
    const pts = [{ x: 100, y: 100 }, { x: 144, y: 94 }, { x: 182, y: 114 }, { x: 228, y: 102 }];
    const ids = ["a", "b", "c", "d"];
    pts.forEach((p, i) => {
      mol = addAtom(mol, ids[i], p, "C");
    });
    for (let i = 0; i < 3; i++) mol = addBond(mol, `b${i}`, ids[i], ids[i + 1], 1);

    const before = centroid(mol, ids);
    const cleaned = cleanStructure2D(mol).mol;
    const after = centroid(cleaned, ids);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  test("an empty selection returns the same molecule untouched", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    const result = cleanStructure2D(mol, []);
    expect(result.mol).toBe(mol);
    expect(result.moved).toBe(0);
  });

  test("connectedComponents (re-exported from model/molecule.ts) still groups via in-selection bonds only", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "bridge", { x: 40, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 80, y: 0 }, "C");
    mol = addBond(mol, "b1", "a", "bridge", 1);
    mol = addBond(mol, "b2", "bridge", "b", 1);

    expect(connectedComponents(mol, ["a", "b"])).toEqual([["a"], ["b"]]);
    expect(connectedComponents(mol, ["a", "bridge", "b"])).toEqual([["a", "bridge", "b"]]);
  });
});
