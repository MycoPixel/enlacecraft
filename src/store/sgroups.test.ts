import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import type { Annotation, BracketAnnotation, Molecule } from "../types/chemistry";

/**
 * S-group authoring: creation from a selection, editing from the info panel,
 * and the pruning that keeps a group's atom/bond/bracket references honest
 * as the drawing around it is deleted. Groups are molecule metadata, so undo
 * must restore them together with the annotations created alongside them.
 */

function chain(): Molecule {
  let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 60, y: 0 }, "C");
  mol = addAtom(mol, "c", { x: 120, y: 0 }, "C");
  mol = addBond(mol, "ab", "a", "b");
  mol = addBond(mol, "bc", "b", "c");
  return mol;
}

function bracket(id: string): BracketAnnotation {
  return { id, kind: "bracket", x: 0, y: 0, width: 16, height: 90, variant: "square", facing: "open" };
}

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: chain(),
    annotations: {},
    selected: new Set<string>(),
    selectedAnnotationIds: new Set<string>(),
    past: [],
    future: [],
    hasUnsavedChanges: false,
    language: "en",
  });
});

const state = () => useMoleculeStore.getState();
const groups = () => Object.values(state().molecule.sgroups ?? {});

describe("createSGroup", () => {
  test("creates a group with its internal bonds and a default repeat count", () => {
    const id = state().createSGroup(["a", "b"], "SRU");
    expect(id).not.toBeNull();

    const group = state().molecule.sgroups?.[id!];
    expect(group?.type).toBe("SRU");
    expect(group?.atomIds).toEqual(["a", "b"]);
    expect(group?.bondIds).toEqual(["ab"]);
    expect(group?.subscript).toBe("n");
    expect(group?.bracketStyle).toBe("square");
  });

  test("places a square bracket pair around the selection in the same undo step", () => {
    const id = state().createSGroup(["a", "b"], "SRU");
    const group = state().molecule.sgroups?.[id!];
    const brackets = (group?.bracketAnnotationIds ?? []).map((b) => state().annotations[b]);
    expect(brackets).toHaveLength(2);
    expect(brackets.every((b) => b.kind === "bracket")).toBe(true);
    expect(brackets.map((b) => (b as BracketAnnotation).facing).sort()).toEqual(["close", "open"]);

    // Selection follows the new group: atoms plus its bracket glyphs.
    expect([...state().selected].sort()).toEqual(["a", "b"]);
    expect(new Set(state().selectedAnnotationIds)).toEqual(new Set(group?.bracketAnnotationIds));
  });

  test("undo removes the group and the brackets it created together", () => {
    state().createSGroup(["a", "b"], "SRU");
    expect(groups()).toHaveLength(1);
    expect(Object.keys(state().annotations)).toHaveLength(2);

    state().undo();
    expect(state().molecule.sgroups).toBeUndefined();
    expect(state().annotations).toEqual({});
  });

  test("reuses existing bracket annotations instead of placing new ones", () => {
    const annotations: Record<string, Annotation> = { b1: bracket("b1"), b2: bracket("b2") };
    useMoleculeStore.setState({ annotations });
    const id = state().createSGroup(["a", "b"], "SRU", { bracketAnnotationIds: ["b1", "b2"] });

    expect(state().molecule.sgroups?.[id!].bracketAnnotationIds).toEqual(["b1", "b2"]);
    expect(Object.keys(state().annotations).sort()).toEqual(["b1", "b2"]);
  });

  test("returns null when the selection has no surviving atoms", () => {
    expect(state().createSGroup(["gone"], "SRU")).toBeNull();
    expect(state().molecule.sgroups).toBeUndefined();
  });
});

describe("updateSGroup", () => {
  test("changes type, repeat count and label", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    state().updateSGroup(id, { type: "COP", subscript: "m", label: "block" });

    const group = state().molecule.sgroups?.[id];
    expect(group?.type).toBe("COP");
    expect(group?.subscript).toBe("m");
    expect(group?.label).toBe("block");
  });

  test("empty strings clear the optional fields", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    state().updateSGroup(id, { subscript: "", label: "" });

    const group = state().molecule.sgroups?.[id];
    expect(group?.subscript).toBeUndefined();
    expect(group?.label).toBeUndefined();
  });

  test("is undoable", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    state().updateSGroup(id, { type: "COP" });
    state().undo();
    expect(state().molecule.sgroups?.[id].type).toBe("SRU");
  });
});

describe("deleteSGroup", () => {
  test("removes the group metadata but leaves its brackets on the drawing", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    const bracketIds = state().molecule.sgroups?.[id].bracketAnnotationIds ?? [];
    state().deleteSGroup(id);

    expect(state().molecule.sgroups).toBeUndefined();
    expect(Object.keys(state().annotations).sort()).toEqual([...bracketIds].sort());
  });
});

describe("addSelectionToSGroup / removeSelectionFromSGroup", () => {
  test("adds the current selection and its connecting bond", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    state().setSelected(new Set(["c"]));
    state().addSelectionToSGroup(id);

    const group = state().molecule.sgroups?.[id];
    expect(group?.atomIds).toEqual(["a", "b", "c"]);
    expect(group?.bondIds?.sort()).toEqual(["ab", "bc"]);
  });

  test("removes the current selection and drops bonds that no longer touch", () => {
    const id = state().createSGroup(["a", "b", "c"], "SRU")!;
    state().setSelected(new Set(["b", "c"]));
    state().removeSelectionFromSGroup(id);

    const group = state().molecule.sgroups?.[id];
    expect(group?.atomIds).toEqual(["a"]);
    // "ab" survives as a crossing bond: "a" is still a member.
    expect(group?.bondIds).toEqual(["ab"]);
  });

  test("removing every atom deletes the group", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    state().setSelected(new Set(["a", "b"]));
    state().removeSelectionFromSGroup(id);
    expect(state().molecule.sgroups).toBeUndefined();
  });
});

describe("pruning", () => {
  test("deleting a bracket annotation drops the reference but keeps the group", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    const [openId] = state().molecule.sgroups?.[id].bracketAnnotationIds ?? [];
    state().deleteAnnotation(openId);

    const group = state().molecule.sgroups?.[id];
    expect(group?.atomIds).toEqual(["a", "b"]);
    expect(group?.bracketAnnotationIds).toHaveLength(1);
  });

  test("deleting an atom prunes it from the group", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    state().deleteAtom("b");

    const group = state().molecule.sgroups?.[id];
    expect(group?.atomIds).toEqual(["a"]);
    expect(group?.bondIds).toBeUndefined();
  });

  test("deleting every atom in the group removes the group", () => {
    state().createSGroup(["a", "b"], "SRU");
    state().deleteAtom("a");
    state().deleteAtom("b");
    expect(state().molecule.sgroups).toBeUndefined();
  });

  test("deleting a bond prunes it from the group", () => {
    const id = state().createSGroup(["a", "b", "c"], "SRU")!;
    state().deleteBond("bc");
    expect(state().molecule.sgroups?.[id].bondIds).toEqual(["ab"]);
  });
});
