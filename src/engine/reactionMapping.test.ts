import { describe, expect, test } from "vitest";
import type { Molecule, ReactionScheme } from "../types/chemistry";
import { addAtom, addBond, emptyMolecule, setAtomMapNumber } from "../model/molecule";
import { clearReactionMap, mapReactionAtoms, validateReactionMap } from "./reactionMapping";

function ether(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "rC", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "rO", { x: 42, y: 0 }, "O");
  mol = addBond(mol, "rCO", "rC", "rO");
  mol = addAtom(mol, "pC", { x: 300, y: 0 }, "C");
  mol = addAtom(mol, "pO", { x: 342, y: 0 }, "O");
  mol = addBond(mol, "pCO", "pC", "pO");
  return mol;
}

describe("mapReactionAtoms", () => {
  test("maps atoms whose element and environment are unambiguous", () => {
    const mol = ether();
    const result = mapReactionAtoms(mol, [{ reactants: [["rC", "rO"]], products: [["pC", "pO"]] }]);

    expect(result).not.toBeNull();
    expect(result?.numbers.get("rC")).toBe(result?.numbers.get("pC"));
    expect(result?.numbers.get("rO")).toBe(result?.numbers.get("pO"));
    expect(result?.numbers.get("rC")).not.toBe(result?.numbers.get("rO"));
  });

  test("leaves a fully symmetric pair unmapped rather than guessing", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "r1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "r2", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "rb", "r1", "r2");
    mol = addAtom(mol, "p1", { x: 300, y: 0 }, "C");
    mol = addAtom(mol, "p2", { x: 342, y: 0 }, "C");
    mol = addBond(mol, "pb", "p1", "p2");

    expect(mapReactionAtoms(mol, [{ reactants: [["r1", "r2"]], products: [["p1", "p2"]] }])).toBeNull();
  });

  test("keeps a manual map number instead of replacing it", () => {
    let mol = ether();
    mol = setAtomMapNumber(mol, "rC", 7);
    mol = setAtomMapNumber(mol, "pC", 7);

    const result = mapReactionAtoms(mol, [{ reactants: [["rC", "rO"]], products: [["pC", "pO"]] }]);
    expect(result?.numbers.get("rC")).toBe(7);
    expect(result?.numbers.get("pC")).toBe(7);
  });

  test("carries one numbering across steps through a shared intermediate", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 120, y: 0 }, "O");
    mol = addAtom(mol, "c", { x: 240, y: 0 }, "N");

    const result = mapReactionAtoms(mol, [
      { reactants: [["a"]], products: [["b"]] },
      { reactants: [["b"]], products: [["c"]] },
    ]);

    expect(result?.numbers.get("b")).toBe(result?.numbers.get("c"));
  });
});

describe("clearReactionMap", () => {
  test("removes numbers from the scheme's atoms only", () => {
    let mol = ether();
    mol = setAtomMapNumber(mol, "rC", 1);
    mol = setAtomMapNumber(mol, "pC", 1);
    mol = addAtom(mol, "outside", { x: 600, y: 0 }, "C");
    mol = setAtomMapNumber(mol, "outside", 9);

    const after = clearReactionMap(mol, ["rC", "pC"]);
    expect(after.atoms.rC.mapNumber).toBeUndefined();
    expect(after.atoms.pC.mapNumber).toBeUndefined();
    expect(after.atoms.outside.mapNumber).toBe(9);
  });

  test("returns the same molecule when there is nothing to clear", () => {
    const mol = ether();
    expect(clearReactionMap(mol, ["rC", "pC"])).toBe(mol);
  });
});

describe("validateReactionMap", () => {
  const scheme: ReactionScheme = {
    id: "s1",
    steps: [{ id: "st1", reactantAtomIds: ["rC", "rO"], productAtomIds: ["pC", "pO"], arrowIds: ["a1"] }],
  };

  test("accepts a complete, one-to-one map", () => {
    let mol = ether();
    mol = setAtomMapNumber(mol, "rC", 1);
    mol = setAtomMapNumber(mol, "pC", 1);
    mol = setAtomMapNumber(mol, "rO", 2);
    mol = setAtomMapNumber(mol, "pO", 2);

    const validation = validateReactionMap(mol, scheme);
    expect(validation.valid).toBe(true);
    expect(validation.mappedAtoms).toBe(4);
    expect(validation.duplicateNumbers).toEqual([]);
  });

  test("rejects a number shared by two different atoms", () => {
    let mol = ether();
    mol = setAtomMapNumber(mol, "rC", 1);
    mol = setAtomMapNumber(mol, "pC", 1);
    mol = setAtomMapNumber(mol, "rO", 1);

    const validation = validateReactionMap(mol, scheme);
    expect(validation.valid).toBe(false);
    expect(validation.duplicateNumbers).toEqual([1]);
  });

  test("reports atoms still waiting for a number", () => {
    let mol = ether();
    mol = setAtomMapNumber(mol, "rC", 1);
    mol = setAtomMapNumber(mol, "pC", 1);

    const validation = validateReactionMap(mol, scheme);
    expect(validation.unmappedReactantAtomIds).toEqual(["rO"]);
    expect(validation.unmappedProductAtomIds).toEqual(["pO"]);
  });
});
