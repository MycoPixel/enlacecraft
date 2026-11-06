import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";
import type { Molecule } from "../types/chemistry";

function twoAtoms(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 120, y: 0 }, "O");
  return mol;
}

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: twoAtoms(),
    annotations: {},
    selected: new Set(),
    selectedAnnotationIds: new Set(),
    selectedCycleId: null,
    linkedAtomId: null,
    past: [],
    future: [],
    hasUnsavedChanges: false,
    language: "en",
  });
});

const state = () => useMoleculeStore.getState();

/** The 3D link tool's click does exactly this pair of writes
 * (see Molecule3DView's toolMode === "link" branch). */
function link3DAtomTo2D(id: string) {
  state().setLinkedAtomId(id);
  state().setSelected(new Set([id]));
}

describe("clear3DAtomLink (cleanup when the 3D panel closes)", () => {
  test("drops the link and the single-atom selection the link tool made", () => {
    link3DAtomTo2D("a");
    expect(state().linkedAtomId).toBe("a");
    expect(state().selected).toEqual(new Set(["a"]));

    state().clear3DAtomLink();
    expect(state().linkedAtomId).toBeNull();
    expect(state().selected.size).toBe(0);
  });

  test("clears the ring but leaves a canvas selection bigger than the linked atom", () => {
    link3DAtomTo2D("a");
    // The user kept selecting on the canvas afterwards — closing the panel
    // must not throw that work away.
    state().setSelected(new Set(["a", "b"]));

    state().clear3DAtomLink();
    expect(state().linkedAtomId).toBeNull();
    expect(state().selected).toEqual(new Set(["a", "b"]));
  });

  test("clears the ring but leaves an unrelated single-atom selection", () => {
    link3DAtomTo2D("a");
    // The link tool replaces the whole selection with the linked atom, so a
    // lone *other* atom can only mean the user re-selected on the canvas.
    state().setSelected(new Set(["b"]));

    state().clear3DAtomLink();
    expect(state().linkedAtomId).toBeNull();
    expect(state().selected).toEqual(new Set(["b"]));
  });

  test("is a no-op when no link exists — a canvas selection survives", () => {
    state().setSelected(new Set(["a", "b"]));

    state().clear3DAtomLink();
    expect(state().linkedAtomId).toBeNull();
    expect(state().selected).toEqual(new Set(["a", "b"]));
  });
});
