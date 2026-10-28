import { describe, expect, test } from "vitest";
import { addAtom, addBond, cloneMolecule, deleteAtom, emptyMolecule, stripExplicitHydrogens } from "./molecule";
import {
  findSchemeForAnnotation,
  findSchemeForAtom,
  pruneSchemeArrowIds,
  pruneSchemesForAtoms,
  schemeArrowIds,
  schemeAtomIds,
  summarizeScheme,
} from "./reactionSchemes";
import type { Molecule, ReactionScheme } from "../types/chemistry";

function scheme(overrides: Partial<ReactionScheme> = {}): ReactionScheme {
  return {
    id: "s1",
    steps: [
      { id: "st1", reactantAtomIds: ["a", "b"], productAtomIds: ["c"], arrowIds: ["arrow1"] },
    ],
    ...overrides,
  };
}

describe("pruneSchemesForAtoms", () => {
  test("drops references to deleted atoms but keeps the rest of the step", () => {
    const before = [scheme()];
    const after = pruneSchemesForAtoms(before, new Set(["b", "c"]));
    expect(after?.[0].steps[0].reactantAtomIds).toEqual(["b"]);
    expect(after?.[0].steps[0].productAtomIds).toEqual(["c"]);
  });

  test("drops a step once neither side has an atom left", () => {
    const after = pruneSchemesForAtoms([scheme()], new Set<string>());
    expect(after).toBeUndefined();
  });

  test("drops one step without dropping a sibling that still has atoms", () => {
    const before = [
      scheme({
        steps: [
          { id: "st1", reactantAtomIds: ["a"], productAtomIds: [], arrowIds: [] },
          { id: "st2", reactantAtomIds: ["b"], productAtomIds: [], arrowIds: [] },
        ],
      }),
    ];
    const after = pruneSchemesForAtoms(before, new Set(["b"]));
    expect(after?.[0].steps.map((s) => s.id)).toEqual(["st2"]);
  });

  test("returns the same array when nothing was pruned", () => {
    const before = [scheme()];
    expect(pruneSchemesForAtoms(before, new Set(["a", "b", "c"]))).toBe(before);
  });

  test("leaves an absent scheme list absent", () => {
    expect(pruneSchemesForAtoms(undefined, new Set(["a"]))).toBeUndefined();
  });
});

describe("pruneSchemeArrowIds", () => {
  test("removes an arrow id that no longer exists but keeps the step", () => {
    const after = pruneSchemeArrowIds([scheme()], new Set<string>());
    expect(after?.[0].steps).toHaveLength(1);
    expect(after?.[0].steps[0].arrowIds).toEqual([]);
  });

  test("returns the same array when every arrow still exists", () => {
    const before = [scheme()];
    expect(pruneSchemeArrowIds(before, new Set(["arrow1"]))).toBe(before);
  });
});

describe("scheme helpers", () => {
  test("schemeAtomIds and schemeArrowIds dedupe across steps", () => {
    const s = scheme({
      steps: [
        { id: "st1", reactantAtomIds: ["a"], productAtomIds: ["b"], arrowIds: ["x"] },
        { id: "st2", reactantAtomIds: ["a", "c"], productAtomIds: ["b"], arrowIds: ["x", "y"] },
      ],
    });
    expect(schemeAtomIds(s).sort()).toEqual(["a", "b", "c"]);
    expect(schemeArrowIds(s).sort()).toEqual(["x", "y"]);
  });

  test("summarizeScheme reports steps and the largest side", () => {
    const s = scheme({
      steps: [
        { id: "st1", reactantAtomIds: ["a", "b"], productAtomIds: ["c"], arrowIds: ["x"] },
        { id: "st2", reactantAtomIds: ["d"], productAtomIds: ["e", "f", "g"], arrowIds: [] },
      ],
    });
    expect(summarizeScheme(s)).toEqual({ steps: 2, reactants: 2, products: 3, arrows: 1 });
  });

  test("finds the scheme containing an atom or an arrow", () => {
    const mol: Molecule = { ...emptyMolecule(), schemes: [scheme()] };
    expect(findSchemeForAtom(mol, "c")?.id).toBe("s1");
    expect(findSchemeForAtom(mol, "nope")).toBeNull();
    expect(findSchemeForAnnotation(mol, "arrow1")?.id).toBe("s1");
    expect(findSchemeForAnnotation(mol, "nope")).toBeNull();
  });
});

describe("molecule edits keep scheme references consistent", () => {
  function moleculeWithScheme(): Molecule {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "ab", "a", "b");
    mol = { ...mol, schemes: [scheme()] };
    return mol;
  }

  test("cloneMolecule carries the scheme", () => {
    const mol = moleculeWithScheme();
    expect(cloneMolecule(mol).schemes).toBe(mol.schemes);
  });

  test("deleteAtom prunes the deleted atom out of a step", () => {
    const after = deleteAtom(moleculeWithScheme(), "b");
    expect(after.schemes?.[0].steps[0].reactantAtomIds).toEqual(["a"]);
  });

  test("stripExplicitHydrogens prunes a scheme that referenced the removed hydrogen", () => {
    let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "h", { x: 42, y: 0 }, "H");
    mol = addBond(mol, "ch", "c", "h");
    mol = {
      ...mol,
      schemes: [{ id: "s1", steps: [{ id: "st1", reactantAtomIds: ["h"], productAtomIds: ["c"], arrowIds: [] }] }],
    };
    const after = stripExplicitHydrogens(mol);
    expect(after.schemes?.[0].steps[0].reactantAtomIds).toEqual([]);
  });
});
