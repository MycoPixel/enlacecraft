import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";
import { importSmiles } from "../io/smilesImport";

const state = () => useMoleculeStore.getState();

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: emptyMolecule(),
    annotations: {},
    selected: new Set(),
    selectedAnnotationIds: new Set(),
    selectedCycleId: null,
    groups: [],
    past: [],
    future: [],
    hasUnsavedChanges: false,
    language: "en",
    view: { scale: 1, tx: 0, ty: 0 },
    canvasSize: { width: 800, height: 600 },
  });
});

describe("store buildReaction", () => {
  test("draws the row, selects it, and commits exactly one undo step", () => {
    const schemeId = state().buildReaction({
      reactants: [{ molecule: importSmiles("CCO").molecule }],
      products: [{ molecule: importSmiles("CC(=O)O").molecule }],
      arrowVariant: "forward",
      conditionsAbove: "H2SO4",
    });

    expect(schemeId).not.toBeNull();
    const schemes = state().molecule.schemes ?? [];
    expect(schemes).toHaveLength(1);
    expect(schemes[0].id).toBe(schemeId);
    expect(state().past).toHaveLength(1);

    // The whole new row is selected: atoms plus its arrow.
    const atomIds = [...state().selected];
    expect(atomIds.length).toBeGreaterThan(0);
    expect(atomIds.every((id) => !!state().molecule.atoms[id])).toBe(true);
    expect([...state().selectedAnnotationIds]).toEqual(state().molecule.schemes![0].steps[0].arrowIds);
  });

  test("keeps a stoichiometric coefficient attached to its structure", () => {
    const schemeId = state().buildReaction({
      reactants: [{ molecule: importSmiles("CCO").molecule, coefficient: "2" }],
      products: [{ molecule: importSmiles("CC(=O)O").molecule }],
      arrowVariant: "forward",
    });

    expect(schemeId).not.toBeNull();
    const coefficient = Object.values(state().annotations).find(
      (ann) => ann.kind === "text" && ann.coefficientFor && ann.coefficientFor.length > 0
    );
    expect(coefficient?.kind).toBe("text");
    if (coefficient?.kind !== "text") return;
    expect(coefficient.html).toBe("2");
    expect(coefficient.coefficientFor).toEqual(state().molecule.schemes![0].steps[0].reactantAtomIds);
  });

  test("undo removes the row and prunes the now-stale selection", () => {
    const base = addAtom(emptyMolecule(), "keep", { x: -50, y: 0 }, "C");
    useMoleculeStore.setState({ molecule: base });

    state().buildReaction({
      reactants: [{ molecule: importSmiles("CCO").molecule }],
      products: [{ molecule: importSmiles("CC(=O)O").molecule }],
      arrowVariant: "forward",
    });
    expect(state().selected.size).toBeGreaterThan(0);

    state().undo();

    expect(state().molecule.atoms.keep).toEqual(base.atoms.keep);
    expect(state().molecule.schemes).toBeUndefined();
    expect(state().annotations).toEqual({});
    // Regression: stale atom ids in `selected` used to survive undo and make
    // ContextMenu's group detection dereference a non-existent atom.
    expect(state().selected.size).toBe(0);
    expect(state().selectedAnnotationIds.size).toBe(0);
    for (const id of state().selected) {
      expect(state().molecule.atoms[id]).toBeDefined();
    }
  });

  test("returns null when a side has no structures", () => {
    const molecule = importSmiles("CCO").molecule;
    expect(
      state().buildReaction({
        reactants: [],
        products: [{ molecule }],
        arrowVariant: "forward",
      })
    ).toBeNull();
    expect(
      state().buildReaction({
        reactants: [{ molecule }],
        products: [],
        arrowVariant: "forward",
      })
    ).toBeNull();
    expect(state().past).toHaveLength(0);
  });
});
