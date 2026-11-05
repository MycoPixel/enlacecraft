import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { BOND_LEN } from "../model/constants";
import type { Molecule } from "../types/chemistry";

/**
 * "Clean as I draw" wiring regression tests.
 *
 * The toggle used to look dead for two reasons: the mouse bond tool
 * completed its strokes with a bare addAtom + addBond pair in two separate
 * commits (polish only ran inside addAtomWithBond/addChain, i.e. keyboard
 * drawing), and even where polish ran it received only the stroke's NEW
 * atoms — which made each one a singleton, self-boundary component that
 * clean2d pinned exactly where it landed. Strokes now finish through
 * addAtomWithBond and the polish set includes the anchor atom, so the
 * engine holds the anchor and re-places just the new atom. These tests pin
 * the visible difference the toggle makes on that path.
 */

/** An existing a—b fragment the new stroke attaches to (the real scenario:
 * the bond tool grows from a structure that is already on the canvas). */
function anchoredStructure(): Molecule {
  let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: BOND_LEN, y: 0 }, "C");
  mol = addBond(mol, "bond-1", "a", "b", 1, "none");
  return mol;
}

/** A deliberately sloppy stroke end: 24 px out at a ~20° angle. */
const SLOPPY = { x: 22, y: 8 };

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: anchoredStructure(),
    annotations: {},
    selected: new Set(),
    selectedAnnotationIds: new Set(),
    selectedCycleId: null,
    past: [],
    future: [],
    hasUnsavedChanges: false,
    cleanAsIdraw: false,
    language: "en",
  });
});

const state = () => useMoleculeStore.getState();
const newAtom = () => {
  const ids = Object.keys(state().molecule.atoms).filter((id) => id !== "a" && id !== "b");
  expect(ids).toHaveLength(1);
  return state().molecule.atoms[ids[0]];
};

describe("clean as I draw — bond-tool stroke path", () => {
  test("OFF: the drawn (short, off-angle) position is kept exactly", () => {
    expect(state().cleanAsIdraw).toBe(false);
    state().addAtomWithBond(SLOPPY, "C", "a");
    const atom = newAtom();
    expect(atom.x).toBeCloseTo(SLOPPY.x, 6);
    expect(atom.y).toBeCloseTo(SLOPPY.y, 6);
  });

  test("ON: the new atom lands a full ideal bond length from its anchor", () => {
    state().toggleCleanAsIdraw();
    expect(state().cleanAsIdraw).toBe(true);
    state().addAtomWithBond(SLOPPY, "C", "a");
    const atom = newAtom();
    // The anchor keeps its place (it is the component's boundary atom) and
    // the new atom is re-placed at the standard drawn length.
    expect(state().molecule.atoms.a).toMatchObject({ x: 0, y: 0 });
    expect(state().molecule.atoms.b).toMatchObject({ x: BOND_LEN, y: 0 });
    expect(Math.hypot(atom.x, atom.y)).toBeCloseTo(BOND_LEN, 4);
    // and it really moved — the stroke did not already land ideal
    expect(Math.hypot(SLOPPY.x, SLOPPY.y)).not.toBeCloseTo(BOND_LEN, 2);
  });

  test("ON: a lone two-atom fragment idealizes its length without a boundary", () => {
    useMoleculeStore.setState({ molecule: addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C") });
    state().toggleCleanAsIdraw();
    state().addAtomWithBond(SLOPPY, "C", "a");
    const a = state().molecule.atoms.a;
    const atom = newAtom();
    // No boundary atom here, so the engine recentres the fragment in place —
    // the anchor may translate, but the bond lands at its ideal length.
    expect(Math.hypot(atom.x - a.x, atom.y - a.y)).toBeCloseTo(BOND_LEN, 4);
  });

  test("ON: the polish is part of the stroke's single undo step", () => {
    state().toggleCleanAsIdraw();
    state().addAtomWithBond(SLOPPY, "C", "a");
    state().undo();
    expect(Object.keys(state().molecule.atoms)).toHaveLength(2); // a and b
    expect(Object.keys(state().molecule.bonds)).toHaveLength(1); // a—b
  });

  test("bond attributes (double bond) pass through the polished commit", () => {
    state().toggleCleanAsIdraw();
    state().addAtomWithBond(SLOPPY, "C", "a", undefined, undefined, { order: 2 });
    const bonds = Object.values(state().molecule.bonds);
    expect(bonds).toHaveLength(2);
    const added = bonds.find((b) => b.a1 === "a" || b.a2 === "a" ? b.order === 2 : false);
    expect(added).toBeTruthy();
  });

  test("stereo bonds (wedge) keep their drawn geometry", () => {
    state().toggleCleanAsIdraw();
    state().addAtomWithBond(SLOPPY, "C", "a", undefined, undefined, { order: 1, stereo: "wedge" });
    const bonds = Object.values(state().molecule.bonds);
    const added = bonds.find((b) => b.stereo === "wedge");
    expect(added).toBeTruthy();
    // Stereo anchors are never moved by the polish — the new atom keeps
    // exactly the drawn position (the wedge asserts this geometry).
    const atom = newAtom();
    expect(atom.x).toBeCloseTo(SLOPPY.x, 6);
    expect(atom.y).toBeCloseTo(SLOPPY.y, 6);
  });

  test("toggling flips the in-session preference both ways", () => {
    state().toggleCleanAsIdraw();
    expect(state().cleanAsIdraw).toBe(true);
    state().toggleCleanAsIdraw();
    expect(state().cleanAsIdraw).toBe(false);
  });
});
