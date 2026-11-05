import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule, hasExplicitHydrogens, stripExplicitHydrogens } from "../model/molecule";
import { implicitH } from "../model/valence";
import { addExplicitHydrogens } from "./explicitHydrogens";

describe("addExplicitHydrogens", () => {
  test("methane: a bare carbon gets 4 real H atoms and 4 real bonds", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    const result = addExplicitHydrogens(mol);
    const hAtoms = Object.values(result.atoms).filter((a) => a.element === "H");
    expect(hAtoms).toHaveLength(4);
    expect(Object.keys(result.bonds)).toHaveLength(4);
    for (const b of Object.values(result.bonds)) {
      expect(b.order).toBe(1);
      expect([b.a1, b.a2]).toContain("c1");
    }
    // Real atoms now -- implicitH on the carbon itself should read 0.
    expect(implicitH(result, "c1")).toBe(0);
  });

  test("ethane skeleton (two bonded carbons): each gets 3 real H's", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b1", "c1", "c2", 1);
    const result = addExplicitHydrogens(mol);
    const hAtoms = Object.values(result.atoms).filter((a) => a.element === "H");
    expect(hAtoms).toHaveLength(6);
    // 1 C-C bond + 6 new C-H bonds
    expect(Object.keys(result.bonds)).toHaveLength(7);
  });

  test("heteroatoms are left alone -- only carbon gets new explicit H's", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "o1", { x: 40, y: 0 }, "O");
    mol = addBond(mol, "b1", "c1", "o1", 1);
    const result = addExplicitHydrogens(mol);
    const hAtoms = Object.values(result.atoms).filter((a) => a.element === "H");
    // c1 (3 implicit H's, since 1 bond is used) gets 3; o1 (1 implicit H) gets none added.
    expect(hAtoms).toHaveLength(3);
    for (const h of hAtoms) {
      const bond = Object.values(result.bonds).find((b) => b.a1 === h.id || b.a2 === h.id)!;
      expect([bond.a1, bond.a2]).toContain("c1");
    }
  });

  test("is idempotent: calling it again on an already-explicit molecule adds nothing new", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    const once = addExplicitHydrogens(mol);
    const twice = addExplicitHydrogens(once);
    expect(Object.keys(twice.atoms)).toHaveLength(Object.keys(once.atoms).length);
    expect(Object.keys(twice.bonds)).toHaveLength(Object.keys(once.bonds).length);
  });

  test("round-trips cleanly with stripExplicitHydrogens back to the original skeleton", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b1", "c1", "c2", 2);
    const expanded = addExplicitHydrogens(mol);
    expect(hasExplicitHydrogens(expanded)).toBe(true);
    const stripped = stripExplicitHydrogens(expanded);
    expect(Object.keys(stripped.atoms)).toHaveLength(2);
    expect(Object.keys(stripped.bonds)).toHaveLength(1);
    expect(hasExplicitHydrogens(stripped)).toBe(false);
    // The heavy-atom skeleton's own implicit H count is unchanged by the round trip.
    expect(implicitH(stripped, "c1")).toBe(implicitH(mol, "c1"));
  });
});

describe("hasExplicitHydrogens", () => {
  test("false for a plain skeletal molecule with no explicit H's", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    expect(hasExplicitHydrogens(mol)).toBe(false);
  });

  test("true as soon as one simple terminal H atom is present", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "h1", { x: 40, y: 0 }, "H");
    mol = addBond(mol, "b1", "c1", "h1", 1);
    expect(hasExplicitHydrogens(mol)).toBe(true);
  });

  test("a charged or isotope-labeled H doesn't count (stripExplicitHydrogens wouldn't remove it either)", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "h1", { x: 40, y: 0 }, "H");
    mol = { ...mol, atoms: { ...mol.atoms, h1: { ...mol.atoms.h1, isotope: 2 } } };
    mol = addBond(mol, "b1", "c1", "h1", 1);
    expect(hasExplicitHydrogens(mol)).toBe(false);
  });
});
