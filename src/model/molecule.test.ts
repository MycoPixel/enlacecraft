import { describe, expect, test } from "vitest";
import {
  addAtom, addBond, addHapticBond, deleteAtom, emptyMolecule, extractFragment,
  findHapticBond, insertMolecule, resolveHapticSelection, stripExplicitHydrogens, subMolecule,
} from "./molecule";
import type { Molecule } from "../types/chemistry";

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
