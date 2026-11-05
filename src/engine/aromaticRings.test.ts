import { describe, expect, test } from "vitest";
import { emptyMolecule, addAtom, addBond } from "../model/molecule";
import { findRings, isKekulizedRing, ringContainsBond, resolveEligibleRingForBond, ringCircleGeometry } from "./aromaticRings";
import { placeRing } from "./ringPlacement";
import { RING_TEMPLATES } from "../model/constants";

function ringTemplate(id: string) {
  const t = RING_TEMPLATES.find((r) => r.id === id);
  if (!t) throw new Error(`no such ring template: ${id}`);
  return t;
}

describe("findRings / isKekulizedRing", () => {
  test("benzene: one 6-ring, kekulized", () => {
    const mol = placeRing(emptyMolecule(), ringTemplate("benzene"), { x: 0, y: 0 }, { type: "none" });
    const rings = findRings(mol);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(6);
    expect(isKekulizedRing(mol, rings[0])).toBe(true);
  });

  test("furan: one 5-ring, kekulized (the reference case for this whole feature)", () => {
    const mol = placeRing(emptyMolecule(), ringTemplate("furan"), { x: 0, y: 0 }, { type: "none" });
    const rings = findRings(mol);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
    expect(isKekulizedRing(mol, rings[0])).toBe(true);
  });

  test("cyclohexane: one 6-ring, not kekulized (all single bonds)", () => {
    const mol = placeRing(emptyMolecule(), ringTemplate("cyclohexane"), { x: 0, y: 0 }, { type: "none" });
    const rings = findRings(mol);
    expect(rings).toHaveLength(1);
    expect(isKekulizedRing(mol, rings[0])).toBe(false);
  });

  test("naphthalene: two separate 6-rings, both kekulized; the shared fusion bond is ambiguous, an outer bond resolves uniquely", () => {
    const mol = placeRing(emptyMolecule(), ringTemplate("naphthalene"), { x: 0, y: 0 }, { type: "none" });
    const rings = findRings(mol);
    expect(rings).toHaveLength(2);
    for (const r of rings) {
      expect(r).toHaveLength(6);
      expect(isKekulizedRing(mol, r)).toBe(true);
    }
    const bonds = Object.values(mol.bonds);
    const fusionBond = bonds.find((b) => rings.filter((r) => ringContainsBond(r, b.a1, b.a2)).length === 2);
    const outerBond = bonds.find((b) => rings.filter((r) => ringContainsBond(r, b.a1, b.a2)).length === 1);
    expect(fusionBond).toBeDefined();
    expect(outerBond).toBeDefined();
    expect(resolveEligibleRingForBond(mol, fusionBond!)).toBeNull();
    expect(resolveEligibleRingForBond(mol, outerBond!)).not.toBeNull();
  });

  test("a triple bond in the ring path disqualifies it", () => {
    // A hand-built 5-ring where one edge is a triple bond -- shouldn't
    // pass isKekulizedRing even if the double-bond count happens to work
    // out, since a triple bond can never be part of an alternating
    // aromatic-style pattern.
    let mol = emptyMolecule();
    const ids = ["a", "b", "c", "d", "e"];
    for (const id of ids) mol = addAtom(mol, id, { x: 0, y: 0 }, "C");
    mol = addBond(mol, "b1", "a", "b", 2);
    mol = addBond(mol, "b2", "b", "c", 1);
    mol = addBond(mol, "b3", "c", "d", 3); // triple bond
    mol = addBond(mol, "b4", "d", "e", 1);
    mol = addBond(mol, "b5", "e", "a", 1);
    const rings = findRings(mol);
    expect(rings).toHaveLength(1);
    expect(isKekulizedRing(mol, rings[0])).toBe(false);
  });

  test("a non-alternating ring (two adjacent double bonds) is rejected", () => {
    let mol = emptyMolecule();
    for (const id of ["a", "b", "c", "d", "e", "f"]) mol = addAtom(mol, id, { x: 0, y: 0 }, "C");
    mol = addBond(mol, "b1", "a", "b", 2);
    mol = addBond(mol, "b2", "b", "c", 2); // adjacent double bonds -- not a valid alternating pattern
    mol = addBond(mol, "b3", "c", "d", 1);
    mol = addBond(mol, "b4", "d", "e", 2);
    mol = addBond(mol, "b5", "e", "f", 1);
    mol = addBond(mol, "b6", "f", "a", 1);
    const rings = findRings(mol);
    expect(rings).toHaveLength(1);
    expect(isKekulizedRing(mol, rings[0])).toBe(false);
  });

  test("rings smaller than 5 atoms never qualify", () => {
    let mol = emptyMolecule();
    for (const id of ["a", "b", "c"]) mol = addAtom(mol, id, { x: 0, y: 0 }, "C");
    mol = addBond(mol, "b1", "a", "b", 2);
    mol = addBond(mol, "b2", "b", "c", 1);
    mol = addBond(mol, "b3", "c", "a", 1);
    const rings = findRings(mol);
    expect(rings).toHaveLength(1);
    expect(isKekulizedRing(mol, rings[0])).toBe(false);
  });
});

describe("ringCircleGeometry", () => {
  test("centers on the ring's own atoms and stays comfortably inside a regular hexagon", () => {
    const mol = placeRing(emptyMolecule(), ringTemplate("benzene"), { x: 100, y: 50 }, { type: "none" });
    const ring = findRings(mol)[0];
    const geo = ringCircleGeometry(mol, ring);
    expect(geo).not.toBeNull();
    expect(geo!.cx).toBeCloseTo(100, 0);
    expect(geo!.cy).toBeCloseTo(50, 0);
    expect(geo!.r).toBeGreaterThan(0);
    // Comfortably inside: strictly less than the distance to any vertex.
    for (const id of ring) {
      const a = mol.atoms[id];
      const dist = Math.hypot(a.x - geo!.cx, a.y - geo!.cy);
      expect(geo!.r).toBeLessThan(dist);
    }
  });

  test("returns null if a ring atom no longer exists", () => {
    const mol = placeRing(emptyMolecule(), ringTemplate("benzene"), { x: 0, y: 0 }, { type: "none" });
    const ring = findRings(mol)[0];
    expect(ringCircleGeometry(mol, [...ring, "not-a-real-atom-id"])).toBeNull();
  });
});
