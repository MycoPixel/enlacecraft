import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import type { ArrowAnnotation, Molecule } from "../types/chemistry";

function reactionMolecule(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "r1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "r2", { x: 42, y: 0 }, "O");
  mol = addBond(mol, "rb", "r1", "r2");
  mol = addAtom(mol, "p1", { x: 300, y: 30 }, "C");
  mol = addAtom(mol, "p2", { x: 342, y: 30 }, "O");
  mol = addBond(mol, "pb", "p1", "p2");
  return mol;
}

function arrow(id: string, x1: number, x2: number, y = 0): ArrowAnnotation {
  return { id, kind: "arrow", x1, y1: y, x2, y2: y, variant: "forward" };
}

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: reactionMolecule(),
    annotations: { a1: arrow("a1", 140, 200, 15) },
    selected: new Set(["r1", "r2", "p1", "p2"]),
    selectedAnnotationIds: new Set(["a1"]),
    past: [],
    future: [],
    hasUnsavedChanges: false,
    showReactionInterpretation: false,
    reactionMapHighlight: new Set<string>(),
    language: "en",
  });
});

const state = () => useMoleculeStore.getState();

describe("reaction scheme authoring", () => {
  test("creates a scheme from the selection in one undo step", () => {
    const count = state().createSchemeFromSelection();
    expect(count).toBe(1);

    const schemes = state().molecule.schemes ?? [];
    expect(schemes).toHaveLength(1);
    expect(schemes[0].steps[0].reactantAtomIds.sort()).toEqual(["r1", "r2"]);
    expect(schemes[0].steps[0].productAtomIds.sort()).toEqual(["p1", "p2"]);
    expect(state().past).toHaveLength(1);

    state().undo();
    expect(state().molecule.schemes).toBeUndefined();
  });

  test("selecting a scheme selects both its atoms and its arrows", () => {
    state().createSchemeFromSelection();
    const scheme = (state().molecule.schemes ?? [])[0];
    state().setSelected(new Set());
    state().setSelectedAnnotationIds(new Set());

    state().selectScheme(scheme.id);
    expect([...state().selected].sort()).toEqual(["p1", "p2", "r1", "r2"]);
    expect([...state().selectedAnnotationIds]).toEqual(["a1"]);
  });

  test("removing a scheme leaves the drawing untouched", () => {
    state().createSchemeFromSelection();
    const scheme = (state().molecule.schemes ?? [])[0];
    state().removeScheme(scheme.id);

    expect(state().molecule.schemes).toBeUndefined();
    expect(Object.keys(state().molecule.atoms)).toHaveLength(4);
  });

  test("cleaning a reaction is one undo step for atoms and annotations", () => {
    state().createSchemeFromSelection();
    const scheme = (state().molecule.schemes ?? [])[0];
    const before = state().past.length;

    const count = state().cleanReaction(scheme.id);
    expect(count).toBe(1);
    expect(state().past).toHaveLength(before + 1);

    const movedArrow = state().annotations.a1 as ArrowAnnotation;
    expect(movedArrow.y1).toBe(movedArrow.y2);
    expect(state().molecule.atoms.r1.y).toBe(state().molecule.atoms.p1.y);

    state().undo();
    expect(state().molecule.atoms.p1.y).toBe(30);
  });

  test("mapping a reaction stores numbers and a transient highlight", () => {
    state().createSchemeFromSelection();
    const scheme = (state().molecule.schemes ?? [])[0];

    const mapped = state().mapReactionAtoms(scheme.id);
    expect(mapped).toBeGreaterThan(0);
    expect(state().molecule.atoms.r1.mapNumber).toBe(state().molecule.atoms.p1.mapNumber);
    expect(state().reactionMapHighlight.size).toBeGreaterThan(0);

    state().clearReactionMap(scheme.id);
    expect(state().molecule.atoms.r1.mapNumber).toBeUndefined();
    expect(state().reactionMapHighlight.size).toBe(0);
  });

  test("the interpretation toggle is transient", () => {
    state().toggleReactionInterpretation();
    expect(state().showReactionInterpretation).toBe(true);
    state().toggleReactionInterpretation();
    expect(state().showReactionInterpretation).toBe(false);
  });
});
