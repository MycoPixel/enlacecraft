import { describe, expect, test } from "vitest";
import {
  addAtom, addBond, addHapticBond, cleanUpAtoms, deleteAtom, emptyMolecule, extractFragment,
  findHapticBond, insertMolecule, resolveHapticSelection, separateOverlappingFragments,
  stripExplicitHydrogens, subMolecule,
} from "./molecule";
import type { Molecule } from "../types/chemistry";
import { BOND_LEN } from "./constants";

/** A minimal ferrocene-shaped skeleton: an Fe atom, a 5-membered ring of
 * carbons (bonded to each other, no H's drawn), and one haptic bond
 * covering all 5 ring carbons \u2014 enough to exercise the haptic-bond-aware
 * code paths without needing a chemically complete ferrocene drawing. */
function ironCpSandwichHalf(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "fe", { x: 0, y: 0 }, "Fe");
  const ringIds = ["c1", "c2", "c3", "c4", "c5"];
  ringIds.forEach((id, i) => {
    mol = addAtom(mol, id, { x: 40 + i * 10, y: i * 5 }, "C");
  });
  for (let i = 0; i < ringIds.length; i++) {
    mol = addBond(mol, `rb${i}`, ringIds[i], ringIds[(i + 1) % ringIds.length]);
  }
  mol = addHapticBond(mol, "hb1", "fe", ringIds);
  return mol;
}

describe("resolveHapticSelection", () => {
  test("one metal + >=2 other atoms resolves", () => {
    const mol = ironCpSandwichHalf();
    const resolved = resolveHapticSelection(mol, ["fe", "c1", "c2", "c3", "c4", "c5"]);
    expect(resolved).not.toBeNull();
    expect(resolved!.metalAtomId).toBe("fe");
    expect(resolved!.ringAtomIds.sort()).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  test("no metal atom in the selection resolves to null", () => {
    const mol = ironCpSandwichHalf();
    expect(resolveHapticSelection(mol, ["c1", "c2", "c3"])).toBeNull();
  });

  test("more than one metal-like atom resolves to null (ambiguous)", () => {
    let mol = ironCpSandwichHalf();
    mol = addAtom(mol, "pt", { x: -40, y: 0 }, "Pt");
    expect(resolveHapticSelection(mol, ["fe", "pt", "c1", "c2"])).toBeNull();
  });

  test("fewer than 2 non-metal atoms resolves to null", () => {
    const mol = ironCpSandwichHalf();
    expect(resolveHapticSelection(mol, ["fe", "c1"])).toBeNull();
  });
});

describe("findHapticBond", () => {
  test("finds a haptic bond regardless of ring-atom order in the query", () => {
    const mol = ironCpSandwichHalf();
    const found = findHapticBond(mol, "fe", ["c5", "c3", "c1", "c4", "c2"]);
    expect(found?.id).toBe("hb1");
  });

  test("a different ring-atom set (even overlapping) doesn't match", () => {
    const mol = ironCpSandwichHalf();
    expect(findHapticBond(mol, "fe", ["c1", "c2", "c3", "c4"])).toBeNull();
  });
});

describe("hapticBonds cascade-cleanup", () => {
  test("deleteAtom on a ring atom removes the haptic bond referencing it", () => {
    const mol = ironCpSandwichHalf();
    const next = deleteAtom(mol, "c3");
    expect(Object.keys(next.hapticBonds)).toHaveLength(0);
  });

  test("deleteAtom on the metal atom removes the haptic bond referencing it", () => {
    const mol = ironCpSandwichHalf();
    const next = deleteAtom(mol, "fe");
    expect(Object.keys(next.hapticBonds)).toHaveLength(0);
  });

  test("deleteAtom on an unrelated atom leaves the haptic bond intact", () => {
    let mol = ironCpSandwichHalf();
    mol = addAtom(mol, "unrelated", { x: 100, y: 100 }, "O");
    const next = deleteAtom(mol, "unrelated");
    expect(Object.keys(next.hapticBonds)).toHaveLength(1);
  });

  test("subMolecule only keeps a haptic bond whose metal AND every ring atom survive", () => {
    const mol = ironCpSandwichHalf();
    const full = subMolecule(mol, ["fe", "c1", "c2", "c3", "c4", "c5"]);
    expect(Object.keys(full.hapticBonds)).toHaveLength(1);

    const partial = subMolecule(mol, ["fe", "c1", "c2", "c3", "c4"]); // missing c5
    expect(Object.keys(partial.hapticBonds)).toHaveLength(0);
  });

  test("extractFragment mirrors subMolecule's haptic-bond filtering", () => {
    const mol = ironCpSandwichHalf();
    const partial = extractFragment(mol, ["fe", "c1", "c2"]);
    expect(Object.keys(partial.hapticBonds)).toHaveLength(0);
  });

  test("stripExplicitHydrogens never touches a haptic bond (H atoms are never ring/metal members)", () => {
    let mol = ironCpSandwichHalf();
    mol = addAtom(mol, "h1", { x: 5, y: 5 }, "H");
    mol = addBond(mol, "hbond", "c1", "h1");
    const next = stripExplicitHydrogens(mol);
    expect(next.atoms.h1).toBeUndefined(); // the H was stripped as expected
    expect(Object.keys(next.hapticBonds)).toHaveLength(1); // haptic bond unaffected
  });
});

describe("insertMolecule with dative bonds and haptic bonds", () => {
  test("preserves a dative bond's flag on the inserted copy (previously silently dropped)", () => {
    let incoming = emptyMolecule();
    incoming = addAtom(incoming, "co", { x: 0, y: 0 }, "Co");
    incoming = addAtom(incoming, "n", { x: 10, y: 0 }, "N");
    incoming = addBond(incoming, "b1", "co", "n");
    incoming = { ...incoming, bonds: { ...incoming.bonds, b1: { ...incoming.bonds.b1, dative: true } } };

    const { mol } = insertMolecule(emptyMolecule(), incoming, 0, 0);
    const bonds = Object.values(mol.bonds);
    expect(bonds).toHaveLength(1);
    expect(bonds[0].dative).toBe(true);
  });

  test("remaps and merges a haptic bond's atom ids into the base molecule", () => {
    const incoming = ironCpSandwichHalf();
    const { mol, newAtomIds } = insertMolecule(emptyMolecule(), incoming, 100, 0);

    expect(newAtomIds).toHaveLength(6); // fe + 5 ring carbons
    const hapticBonds = Object.values(mol.hapticBonds);
    expect(hapticBonds).toHaveLength(1);
    // The remapped ids should be fresh (not the original "fe"/"c1"...) but
    // every id referenced should actually exist in the merged molecule.
    expect(mol.atoms[hapticBonds[0].metalAtomId]).toBeDefined();
    expect(hapticBonds[0].ringAtomIds.every((id) => mol.atoms[id])).toBe(true);
    expect(hapticBonds[0].ringAtomIds).toHaveLength(5);
  });

  test("merging into a base molecule that already has its own haptic bond keeps both", () => {
    const base = ironCpSandwichHalf();
    const incoming = ironCpSandwichHalf();
    const { mol } = insertMolecule(base, incoming, 200, 0);
    expect(Object.keys(mol.hapticBonds)).toHaveLength(2);
  });
});

function bondAngleDeg(mol: Molecule, aId: string, bId: string): number {
  const a = mol.atoms[aId];
  const b = mol.atoms[bId];
  return Math.round(((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) * 100) / 100;
}

function bondLen(mol: Molecule, aId: string, bId: string): number {
  const a = mol.atoms[aId];
  const b = mol.atoms[bId];
  return Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 100) / 100;
}

/** A signed difference between two angles in degrees, wrapped to (-180, 180]
 * - avoids the usual near-360°-vs-near-0° false positive a plain subtraction
 * would give. */
function angleDiffDeg(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return Math.round(d * 100) / 100;
}

describe("cleanUpAtoms", () => {
  test("straightens a wobbly open chain into a proper alternating-60° zigzag", () => {
    let mol = emptyMolecule();
    // Deliberately NOT already a clean zigzag - each bond points in an
    // arbitrary, inconsistent direction.
    const pts = [
      { x: 0, y: 0 }, { x: 40, y: 5 }, { x: 75, y: 30 },
      { x: 120, y: 20 }, { x: 150, y: 55 }, { x: 200, y: 40 },
    ];
    const ids = pts.map((_, i) => `c${i}`);
    pts.forEach((p, i) => { mol = addAtom(mol, ids[i], p, "C"); });
    for (let i = 0; i < ids.length - 1; i++) mol = addBond(mol, `b${i}`, ids[i], ids[i + 1]);

    const cleaned = cleanUpAtoms(mol, ids);

    // Every bond is exactly the standard length.
    for (let i = 0; i < ids.length - 1; i++) {
      expect(bondLen(cleaned, ids[i], ids[i + 1])).toBe(BOND_LEN);
    }
    // The very first transition (bond0 -> bond1) is the one free choice
    // that picks which side the zigzag starts on - it's ±30°, not a
    // forced ±60° (see ZigzagState's isSegmentStart doc comment in
    // cleanUpAtoms). Every transition after that is strictly forced by
    // alternation, which is the actual "perfect zigzag" guarantee this
    // test is after.
    const angles = ids.slice(0, -1).map((id, i) => bondAngleDeg(cleaned, id, ids[i + 1]));
    expect(Math.abs(angleDiffDeg(angles[1], angles[0]))).toBe(30);
    for (let i = 2; i < angles.length; i++) {
      expect(Math.abs(angleDiffDeg(angles[i], angles[i - 1]))).toBe(60);
    }
  });

  test("preserves a chain's original up/down zigzag orientation instead of flipping it", () => {
    let mol = emptyMolecule();
    // Already roughly zigzagging DOWN first (second bond trends negative-y
    // relative to the first) - cleanup should keep that sense, not flip to
    // trending up first.
    const pts = [{ x: 0, y: 0 }, { x: 36, y: 3 }, { x: 70, y: -20 }, { x: 108, y: -15 }];
    const ids = pts.map((_, i) => `c${i}`);
    pts.forEach((p, i) => { mol = addAtom(mol, ids[i], p, "C"); });
    for (let i = 0; i < ids.length - 1; i++) mol = addBond(mol, `b${i}`, ids[i], ids[i + 1]);

    const cleaned = cleanUpAtoms(mol, ids);
    const angle1 = bondAngleDeg(cleaned, ids[1], ids[2]);
    // The original second bond trends downward (toward negative y, i.e. a
    // negative angle in screen coordinates) relative to the first - the
    // cleaned-up version should keep that sense.
    expect(angle1).toBeLessThan(0);
  });

  test("a branch point gives each of its arms its own independent zigzag", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "hub", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: -5 }, "C");
    mol = addAtom(mol, "a2", { x: 78, y: 10 }, "C");
    mol = addAtom(mol, "a3", { x: 122, y: 2 }, "C");
    mol = addAtom(mol, "b1", { x: -35, y: 20 }, "C");
    mol = addAtom(mol, "b2", { x: -70, y: 5 }, "C");
    mol = addAtom(mol, "b3", { x: -112, y: 18 }, "C");
    mol = addAtom(mol, "c1", { x: 5, y: -42 }, "C");
    mol = addBond(mol, "hb1", "hub", "a1");
    mol = addBond(mol, "hb2", "a1", "a2");
    mol = addBond(mol, "hb2b", "a2", "a3");
    mol = addBond(mol, "hb3", "hub", "b1");
    mol = addBond(mol, "hb4", "b1", "b2");
    mol = addBond(mol, "hb4b", "b2", "b3");
    mol = addBond(mol, "hb5", "hub", "c1");
    const ids = ["hub", "a1", "a2", "a3", "b1", "b2", "b3", "c1"];

    const cleaned = cleanUpAtoms(mol, ids);

    for (const [x, y] of [
      ["hub", "a1"], ["a1", "a2"], ["a2", "a3"],
      ["hub", "b1"], ["b1", "b2"], ["b2", "b3"],
      ["hub", "c1"],
    ]) {
      expect(bondLen(cleaned, x, y)).toBe(BOND_LEN);
    }
    // Within each arm, the bond straight off the hub (bond 0) to the next
    // one (bond 1) is that arm's own free ±30° pick; the bond after that
    // (bond 2) is forced by alternation, so THAT transition is where the
    // "each arm is its own proper zigzag" guarantee actually shows up.
    const hubA1 = bondAngleDeg(cleaned, "hub", "a1");
    const a1A2 = bondAngleDeg(cleaned, "a1", "a2");
    const a2A3 = bondAngleDeg(cleaned, "a2", "a3");
    expect(Math.abs(angleDiffDeg(a1A2, hubA1))).toBe(30);
    expect(Math.abs(angleDiffDeg(a2A3, a1A2))).toBe(60);

    const hubB1 = bondAngleDeg(cleaned, "hub", "b1");
    const b1B2 = bondAngleDeg(cleaned, "b1", "b2");
    const b2B3 = bondAngleDeg(cleaned, "b2", "b3");
    expect(Math.abs(angleDiffDeg(b1B2, hubB1))).toBe(30);
    expect(Math.abs(angleDiffDeg(b2B3, b1B2))).toBe(60);
  });

  test("a chain hanging off a ring zigzags without moving the ring or its attachment point", () => {
    let mol = emptyMolecule();
    // A hexagon, already regular, plus a wobbly 4-atom chain off one vertex.
    const ringIds = ["r0", "r1", "r2", "r3", "r4", "r5"];
    const n = 6;
    const r = BOND_LEN / (2 * Math.sin(Math.PI / n));
    ringIds.forEach((id, i) => {
      const a = (i / n) * 2 * Math.PI;
      mol = addAtom(mol, id, { x: r * Math.cos(a), y: r * Math.sin(a) }, "C");
    });
    for (let i = 0; i < n; i++) mol = addBond(mol, `rb${i}`, ringIds[i], ringIds[(i + 1) % n]);

    const attachPoint = { ...mol.atoms["r0"] };
    const s1Pos = { x: attachPoint.x + 50, y: attachPoint.y + 3 };
    mol = addAtom(mol, "s1", s1Pos, "C");
    mol = addAtom(mol, "s2", { x: attachPoint.x + 85, y: attachPoint.y + 30 }, "C");
    mol = addAtom(mol, "s3", { x: attachPoint.x + 130, y: attachPoint.y + 20 }, "C");
    mol = addAtom(mol, "s4", { x: attachPoint.x + 172, y: attachPoint.y + 38 }, "C");
    mol = addBond(mol, "sb0", "r0", "s1");
    mol = addBond(mol, "sb1", "s1", "s2");
    mol = addBond(mol, "sb2", "s2", "s3");
    mol = addBond(mol, "sb3", "s3", "s4");

    // Clean up only the chain substituent. s1 is a boundary atom here
    // (bonded to r0, which is outside the given ids) — same treatment as
    // a ring atom bonded to something outside the selection: it's kept
    // exactly where it was instead of being pulled into the zigzag, and
    // the chain builds outward from it.
    const cleaned = cleanUpAtoms(mol, ["s1", "s2", "s3", "s4"]);

    // Neither the ring nor the attachment point moved.
    expect(cleaned.atoms["r0"].x).toBeCloseTo(attachPoint.x, 6);
    expect(cleaned.atoms["r0"].y).toBeCloseTo(attachPoint.y, 6);
    expect(cleaned.atoms["s1"].x).toBeCloseTo(s1Pos.x, 6);
    expect(cleaned.atoms["s1"].y).toBeCloseTo(s1Pos.y, 6);

    // Every bond among the given atoms is normalized...
    expect(bondLen(cleaned, "s1", "s2")).toBe(BOND_LEN);
    expect(bondLen(cleaned, "s2", "s3")).toBe(BOND_LEN);
    expect(bondLen(cleaned, "s3", "s4")).toBe(BOND_LEN);
    // ...and s1-s2-s3-s4 zigzags exactly like a freestanding chain would:
    // s1-s2 establishes the segment's axis (s1 is the fixed anchor, so
    // this bond isn't part of the alternation itself), s2-s3 is the one
    // free ±30° pick, and s3-s4 is forced to alternate 60° from it.
    const bond1 = bondAngleDeg(cleaned, "s1", "s2");
    const bond2 = bondAngleDeg(cleaned, "s2", "s3");
    const bond3 = bondAngleDeg(cleaned, "s3", "s4");
    expect(Math.abs(angleDiffDeg(bond2, bond1))).toBe(30);
    expect(Math.abs(angleDiffDeg(bond3, bond2))).toBe(60);
  });

  test("a single bond just normalizes length and snaps to the nearest 30°, no alternation to speak of", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 50, y: 8 }, "C");
    mol = addBond(mol, "bd", "a", "b");

    const cleaned = cleanUpAtoms(mol, ["a", "b"]);
    expect(bondLen(cleaned, "a", "b")).toBe(BOND_LEN);
    // 50,8 is close to 0° - nearest 30° multiple is 0°.
    expect(bondAngleDeg(cleaned, "a", "b")).toBe(0);
  });
});

describe("separateOverlappingFragments", () => {
  /** Two ethane-shaped fragments (one bond each), at the given left edges. */
  function twoFragments(x1: number, x2: number): Molecule {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a1", { x: x1, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: x1 + BOND_LEN, y: 0 }, "C");
    mol = addBond(mol, "ab", "a1", "a2");
    mol = addAtom(mol, "b1", { x: x2, y: 0 }, "C");
    mol = addAtom(mol, "b2", { x: x2 + BOND_LEN, y: 0 }, "C");
    mol = addBond(mol, "bb", "b1", "b2");
    return mol;
  }

  function span(mol: Molecule, ids: string[]): { minX: number; maxX: number } {
    return {
      minX: Math.min(...ids.map((id) => mol.atoms[id].x)),
      maxX: Math.max(...ids.map((id) => mol.atoms[id].x)),
    };
  }

  test("lays overlapping structures out in a row with a clear gap", () => {
    const mol = twoFragments(0, 0);
    const separated = separateOverlappingFragments(mol);

    const first = span(separated, ["a1", "a2"]);
    const second = span(separated, ["b1", "b2"]);
    expect(first.minX).toBe(0);
    expect(second.minX).toBeCloseTo(first.maxX + 1.5 * BOND_LEN, 6);
    // Internal geometry is untouched: both bonds still standard length.
    expect(bondLen(separated, "a1", "a2")).toBe(BOND_LEN);
    expect(bondLen(separated, "b1", "b2")).toBe(BOND_LEN);
  });

  test("preserves left-to-right reading order", () => {
    // b starts to the right but overlaps a's right edge.
    const mol = twoFragments(0, BOND_LEN * 0.5);
    const separated = separateOverlappingFragments(mol);

    expect(separated.atoms["a1"].x).toBeLessThan(separated.atoms["b1"].x);
  });

  test("returns the molecule untouched when nothing overlaps", () => {
    const mol = twoFragments(0, BOND_LEN * 4);
    expect(separateOverlappingFragments(mol)).toBe(mol);
  });

  test("is a no-op for a single structure", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: BOND_LEN, y: 0 }, "C");
    mol = addBond(mol, "ab", "a1", "a2");
    expect(separateOverlappingFragments(mol)).toBe(mol);
  });

  test("treats structures that merely touch as overlapping", () => {
    // Exactly adjacent bounding boxes: no gap, so not a readable layout.
    const mol = twoFragments(0, BOND_LEN);
    const separated = separateOverlappingFragments(mol);
    expect(span(separated, ["b1", "b2"]).minX).toBeGreaterThan(BOND_LEN);
  });
});
