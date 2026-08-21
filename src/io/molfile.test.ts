import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { computeFormula } from "../model/valence";
import { exportMol, importMol } from "./molfile";
import type { Molecule } from "../types/chemistry";

/** A 3-atom chain (C-C-O, single bonds), same shape as ethanol's skeleton —
 * a small but non-trivial fixture for round-trip tests. */
function ethanolSkeleton(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 80, y: 20 }, "O");
  mol = addBond(mol, "b0", "a0", "a1");
  mol = addBond(mol, "b1", "a1", "a2");
  return mol;
}

describe("exportMol / importMol round-trip", () => {
  test("atom count, bond count, and molecular formula survive a round trip", () => {
    const original = ethanolSkeleton();
    const roundTripped = importMol(exportMol(original));

    expect(Object.keys(roundTripped.atoms)).toHaveLength(3);
    expect(Object.keys(roundTripped.bonds)).toHaveLength(2);
    expect(computeFormula(roundTripped)).toBe(computeFormula(original));
  });

  test("bond orders survive (a double and a triple bond, not just singles)", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 80, y: 0 }, "N");
    mol = addBond(mol, "b0", "a0", "a1", 2);
    mol = addBond(mol, "b1", "a1", "a2", 3);

    const roundTripped = importMol(exportMol(mol));
    const orders = Object.values(roundTripped.bonds)
      .map((b) => b.order)
      .sort();
    expect(orders).toEqual([2, 3]);
  });

  test("a dative bond survives as MDL type 8, order 1, no stereo — same convention OpenChemLib itself uses", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "Co");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "N");
    mol = addBond(mol, "b0", "a0", "a1");
    mol = { ...mol, bonds: { ...mol.bonds, b0: { ...mol.bonds.b0, dative: true } } };

    const mf = exportMol(mol);
    expect(mf).toMatch(/\n\s*1\s*2\s*8\s*0/);

    const roundTripped = importMol(mf);
    const bonds = Object.values(roundTripped.bonds);
    expect(bonds).toHaveLength(1);
    expect(bonds[0].dative).toBe(true);
    expect(bonds[0].order).toBe(1);
    expect(bonds[0].stereo).toBe("none");
  });

  test("an ordinary (non-dative) bond round-trips without ever gaining a dative flag", () => {
    const roundTripped = importMol(exportMol(ethanolSkeleton()));
    expect(Object.values(roundTripped.bonds).every((b) => !b.dative)).toBe(true);
  });

  test("wedge/dash stereo bonds survive, and become order 1 regardless of the original order", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 1, "wedge");

    const roundTripped = importMol(exportMol(mol));
    const bond = Object.values(roundTripped.bonds)[0];
    expect(bond.stereo).toBe("wedge");
    expect(bond.order).toBe(1);
  });

  test("formal charges survive via the inline atom-block charge column", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "n1", { x: 0, y: 0 }, "N");
    mol = { ...mol, atoms: { ...mol.atoms, n1: { ...mol.atoms.n1, charge: 1 } } };

    const roundTripped = importMol(exportMol(mol));
    const atom = Object.values(roundTripped.atoms)[0];
    expect(atom.charge).toBe(1);
  });

  test("an abbreviated group label (e.g. Ph) survives as the same group id", () => {
    const mol = addAtom(emptyMolecule(), "g1", { x: 0, y: 0 }, "C", "Ph");
    const roundTripped = importMol(exportMol(mol));
    const atom = Object.values(roundTripped.atoms)[0];
    expect(atom.group).toBe("Ph");
  });
});

describe("importMol: real-world file quirks", () => {
  test("M  CHG property lines override the inline charge column", () => {
    // A single nitrogen atom, inline charge column left at 0 (neutral),
    // but an M CHG property line asserting +1 — the modern/unbounded way
    // real writers (including PubChem) specify formal charges.
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  1  0  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
      "M  CHG  1   1   1",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const atom = Object.values(mol.atoms)[0];
    expect(atom.charge).toBe(1);
  });

  test("aromatic bond type 4 is approximated as a double bond", () => {
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  4  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const bond = Object.values(mol.bonds)[0];
    expect(bond.order).toBe(2);
  });

  test("a query bond type (5-8) falls back to a single bond rather than misrendering", () => {
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  5  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const bond = Object.values(mol.bonds)[0];
    expect(bond.order).toBe(1);
  });

  test("an explicit terminal hydrogen is stripped back to implicit", () => {
    // Methane written the "real-world" way: carbon plus 4 explicit,
    // singly-bonded H atoms — the common shape of a PubChem/SDF export,
    // as opposed to this app's own skeletal (implicit-H) convention.
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  5  4  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.0900    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "   -0.3633    1.0277    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "   -0.3633   -0.5138    0.8901 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "   -0.3633   -0.5138   -0.8901 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0  0  0  0",
      "  1  3  1  0  0  0  0",
      "  1  4  1  0  0  0  0",
      "  1  5  1  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    // Only the carbon should remain — implicitH() re-derives the same 4
    // hydrogens from valence for display, so no chemical information is
    // lost even though the explicit H atoms/bonds are gone.
    expect(Object.keys(mol.atoms)).toHaveLength(1);
    expect(Object.values(mol.atoms)[0].element).toBe("C");
    expect(computeFormula(mol)).toBe("CH4");
  });

  test("an explicit hydrogen that is charged or multiply-bonded is left as-is", () => {
    // A charged H (e.g. a bare proton, H+) shouldn't be silently deleted —
    // stripping is only meant for ordinary neutral terminal H atoms.
    // Fields after the coordinate block are symbol, mass-diff, then
    // charge-code (3 -> +1, per molCodeToCharge) — in that order.
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.0000    0.0000    0.0000 H   0  3  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    expect(Object.keys(mol.atoms)).toHaveLength(2);
  });
});
