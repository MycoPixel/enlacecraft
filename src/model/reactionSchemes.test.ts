import { describe, expect, test } from "vitest";
import { addAtom, addBond, cloneMolecule, deleteAtom, emptyMolecule, stripExplicitHydrogens } from "./molecule";
import {
  buildSchemesFromSelection,
  findReactionRows,
  findSchemeForAnnotation,
  findSchemeForAtom,
  pruneSchemeArrowIds,
  pruneSchemesForAtoms,
  schemeArrowIds,
  schemeAtomIds,
  summarizeScheme,
} from "./reactionSchemes";
import type { Annotation, ArrowAnnotation, Molecule, ReactionScheme } from "../types/chemistry";

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

function arrow(id: string, x1: number, x2: number, y = 0): ArrowAnnotation {
  return { id, kind: "arrow", x1, y1: y, x2, y2: y, variant: "forward" };
}

function ids(): () => string {
  let n = 0;
  return () => `generated-${++n}`;
}

function twoSidedMolecule(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "r1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "r2", { x: 42, y: 0 }, "C");
  mol = addBond(mol, "rb", "r1", "r2");
  mol = addAtom(mol, "p1", { x: 300, y: 0 }, "C");
  mol = addAtom(mol, "p2", { x: 342, y: 0 }, "O");
  mol = addBond(mol, "pb", "p1", "p2");
  return mol;
}

describe("findReactionRows", () => {
  test("groups arrows on one baseline and orders each row left to right", () => {
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 40, 80, 0),
      a2: arrow("a2", 160, 200, 3),
      a3: arrow("a3", 40, 80, 120),
    };
    const rows = findReactionRows(annotations, ["a2", "a3", "a1"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].map((rowArrow) => rowArrow.id)).toEqual(["a1", "a2"]);
    expect(rows[1].map((rowArrow) => rowArrow.id)).toEqual(["a3"]);
  });

  test("ignores non-arrow annotations in the selection", () => {
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 40, 80),
      text: { id: "text", kind: "text", x: 0, y: -30, width: 40, height: 20, html: "heat", fontSize: 12 },
    };
    expect(findReactionRows(annotations, ["a1", "text"]).flat().map((rowArrow) => rowArrow.id)).toEqual(["a1"]);
  });
});

describe("buildSchemesFromSelection", () => {
  test("groups the structures on each side of one arrow", () => {
    const mol = twoSidedMolecule();
    const annotations: Record<string, Annotation> = { arrow1: arrow("arrow1", 160, 220) };
    const schemes = buildSchemesFromSelection(
      mol,
      annotations,
      ["r1", "r2", "p1", "p2"],
      ["arrow1"],
      ids()
    );

    expect(schemes).toHaveLength(1);
    expect(schemes[0].steps).toHaveLength(1);
    expect([...schemes[0].steps[0].reactantAtomIds].sort()).toEqual(["r1", "r2"]);
    expect([...schemes[0].steps[0].productAtomIds].sort()).toEqual(["p1", "p2"]);
    expect(schemes[0].steps[0].arrowIds).toEqual(["arrow1"]);
  });

  test("makes an intermediate between two arrows a product and then a reactant", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 120, y: 0 }, "C");
    mol = addAtom(mol, "c", { x: 240, y: 0 }, "C");
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 40, 80),
      a2: arrow("a2", 160, 200),
    };
    const schemes = buildSchemesFromSelection(mol, annotations, ["a", "b", "c"], ["a1", "a2"], ids());

    expect(schemes).toHaveLength(1);
    expect(schemes[0].steps).toHaveLength(2);
    expect(schemes[0].steps[0].reactantAtomIds).toEqual(["a"]);
    expect(schemes[0].steps[0].productAtomIds).toEqual(["b"]);
    expect(schemes[0].steps[1].reactantAtomIds).toEqual(["b"]);
    expect(schemes[0].steps[1].productAtomIds).toEqual(["c"]);
  });

  test("does not invent a step when one side of the arrow is empty", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    const annotations: Record<string, Annotation> = { a1: arrow("a1", 40, 80) };
    expect(buildSchemesFromSelection(mol, annotations, ["a"], ["a1"], ids())).toEqual([]);
  });

  test("keeps stacked reaction rows in separate schemes", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 240, y: 0 }, "C");
    mol = addAtom(mol, "c", { x: 0, y: 200 }, "C");
    mol = addAtom(mol, "d", { x: 240, y: 200 }, "C");
    const annotations: Record<string, Annotation> = {
      top: arrow("top", 100, 140, 0),
      bottom: arrow("bottom", 100, 140, 200),
    };
    const schemes = buildSchemesFromSelection(mol, annotations, ["a", "b", "c", "d"], ["top", "bottom"], ids());
    expect(schemes).toHaveLength(2);
    expect(schemes[0].steps[0].arrowIds).toEqual(["top"]);
    expect(schemes[1].steps[0].arrowIds).toEqual(["bottom"]);
  });
});
