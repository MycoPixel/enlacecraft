// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";
import type { Annotation, Molecule } from "../types/chemistry";

function twoAtoms(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 100, y: 0 }, "C");
  return mol;
}

const text = (id: string, x: number): Annotation => ({
  id,
  kind: "text",
  x,
  y: 0,
  width: 80,
  height: 24,
  html: id,
  fontSize: 14,
});

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: twoAtoms(),
    annotations: { t1: text("t1", 200) },
    groups: [],
    selected: new Set<string>(),
    selectedAnnotationIds: new Set<string>(),
    selectedCycleId: null,
    past: [],
    future: [],
    hasUnsavedChanges: false,
    language: "en",
  });
});

const state = () => useMoleculeStore.getState();

describe("object grouping", () => {
  test("groups atoms and annotations and expands a click to the whole group", () => {
    state().setSelected(new Set(["a", "b"]));
    state().setSelectedAnnotationIds(new Set(["t1"]));
    const id = state().groupSelection();
    expect(id).toBeTruthy();
    expect(state().groups).toHaveLength(1);
    expect(state().groups[0]).toMatchObject({ atomIds: ["a", "b"], annotationIds: ["t1"] });

    // Selecting one member selects every member.
    state().setSelected(new Set(["a"]));
    expect(state().selected).toEqual(new Set(["a", "b"]));
    expect(state().selectedAnnotationIds).toEqual(new Set(["t1"]));
  });

  test("grouping absorbs an existing group instead of nesting", () => {
    state().setSelected(new Set(["a", "b"]));
    state().groupSelection();
    state().setSelectedAnnotationIds(new Set(["t1"]));
    state().groupSelection();
    expect(state().groups).toHaveLength(1);
    expect(state().groups[0].atomIds).toEqual(["a", "b"]);
    expect(state().groups[0].annotationIds).toEqual(["t1"]);
  });

  test("moving grouped atoms carries the grouped annotation", () => {
    state().setSelected(new Set(["a", "b"]));
    state().setSelectedAnnotationIds(new Set(["t1"]));
    state().groupSelection();

    state().moveAtomsTransient({
      a: { x: 10, y: 5 },
      b: { x: 110, y: 5 },
    });

    expect(state().annotations.t1).toMatchObject({ x: 210, y: 5 });
  });

  test("rotating the selection rotates grouped annotations too", () => {
    state().setSelected(new Set(["a", "b"]));
    state().setSelectedAnnotationIds(new Set(["t1"]));
    state().groupSelection();
    const before = state().annotations.t1 as { x: number; y: number };

    state().setSelected(new Set(["a"]));
    state().rotateSelection(90);

    const after = state().annotations.t1 as { x: number; y: number };
    expect(after).not.toEqual(before);
    // A 90° turn around the atoms' midpoint (50, 0) maps (200, 0) to (50, 150).
    expect(after.x).toBeCloseTo(50);
    expect(after.y).toBeCloseTo(150);
  });

  test("undo restores grouping and the grouped annotation position", () => {
    state().setSelected(new Set(["a", "b"]));
    state().setSelectedAnnotationIds(new Set(["t1"]));
    state().groupSelection();
    state().setSelected(new Set(["a"]));
    state().rotateSelection(90);

    state().undo();
    expect((state().annotations.t1 as { x: number }).x).toBeCloseTo(200);
    expect(state().groups).toHaveLength(1);
  });

  test("ungrouping removes the groups touching the selection", () => {
    state().setSelected(new Set(["a", "b"]));
    state().groupSelection();
    expect(state().ungroupSelection()).toBe(1);
    expect(state().groups).toHaveLength(0);
  });

  test("deleting a member prunes a group that falls below two objects", () => {
    state().setSelected(new Set(["a", "b"]));
    state().groupSelection();
    state().deleteAtom("b");
    expect(state().groups).toHaveLength(0);
  });
});

describe("z-order restacking", () => {
  beforeEach(() => {
    useMoleculeStore.setState({
      annotations: { t1: text("t1", 200), t2: text("t2", 320) },
      selectedAnnotationIds: new Set<string>(),
    });
  });

  test("bringToFront lifts the selection above its peers and is undoable", () => {
    state().setSelectedAnnotationIds(new Set(["t1"]));
    state().bringToFront();

    expect(state().annotations.t2.zOrder).toBe(0);
    expect(state().annotations.t1.zOrder).toBe(1);

    state().undo();
    expect(state().annotations.t1.zOrder).toBeUndefined();
    expect(state().annotations.t2.zOrder).toBeUndefined();
  });

  test("sendToBack and the single-step moves keep a stable order", () => {
    state().setSelectedAnnotationIds(new Set(["t2"]));
    state().sendToBack();
    expect(state().annotations.t2.zOrder).toBe(0);
    expect(state().annotations.t1.zOrder).toBe(1);

    state().bringForward();
    expect(state().annotations.t2.zOrder).toBe(1);
    expect(state().annotations.t1.zOrder).toBe(0);
  });

  test("restacking is a no-op when the visual order already matches", () => {
    state().setSelectedAnnotationIds(new Set(["t2"]));
    state().bringToFront();
    const past = state().past.length;
    state().bringToFront();
    expect(state().past).toHaveLength(past);
  });
});
