import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";

/**
 * Mirroring is an ordinary undoable structural edit: selection-scoped, with
 * the same "whole molecule when nothing is selected" fallback as rotate.
 */

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: (() => {
      let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
      mol = addAtom(mol, "b", { x: 100, y: 20 }, "O");
      mol = addAtom(mol, "c", { x: 300, y: 0 }, "N");
      return mol;
    })(),
    selected: new Set<string>(),
    past: [],
    future: [],
    language: "en",
  });
});

const state = () => useMoleculeStore.getState();

describe("mirrorSelection", () => {
  test("mirrors the selected atoms around their own bounding box", () => {
    state().setSelected(new Set(["a", "b"]));
    state().mirrorSelection("horizontal");

    expect(state().molecule.atoms.a.x).toBe(100);
    expect(state().molecule.atoms.b.x).toBe(0);
    expect(state().molecule.atoms.c.x).toBe(300);
  });

  test("mirrors the whole molecule when nothing is selected", () => {
    state().mirrorSelection("horizontal");

    expect(state().molecule.atoms.a.x).toBe(300);
    expect(state().molecule.atoms.b.x).toBe(200);
    expect(state().molecule.atoms.c.x).toBe(0);
  });

  test("is undoable as one step", () => {
    state().setSelected(new Set(["a", "b"]));
    state().mirrorSelection("vertical");
    expect(state().molecule.atoms.a.y).toBe(20);

    state().undo();
    expect(state().molecule.atoms.a.y).toBe(0);
    expect(state().molecule.atoms.b.y).toBe(20);
  });
});
