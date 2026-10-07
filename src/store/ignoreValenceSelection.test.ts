import { describe, expect, test, beforeEach } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { emptyMolecule, addAtom, setAtomIgnoreValence } from "../model/molecule";

/**
 * toggleIgnoreValenceForSelection exists for the mobile toolbar, which has no
 * cursor and therefore no "the atom under the pointer" to target the way the
 * context menu does. The selection is the target there.
 *
 * Two behaviours are worth pinning down specifically, because both are easy to
 * get wrong: the whole selection has to move as ONE undo step (the toolbar
 * button looks like a single action to the user), and a mixed selection has to
 * resolve predictably rather than flipping every atom independently.
 */

beforeEach(() => {
  useMoleculeStore.setState({ molecule: emptyMolecule(), selected: new Set(), past: [], future: [] });
});

/** Three carbons, with `ignored` of them already flagged. */
function seed(ids: string[], ignored: string[] = []) {
  let mol = emptyMolecule();
  for (const id of ids) mol = addAtom(mol, id, { x: Number(id.slice(1)) * 30, y: 0 }, "C");
  for (const id of ignored) mol = setAtomIgnoreValence(mol, id, true);
  useMoleculeStore.setState({ molecule: mol });
  return ids;
}

describe("toggleIgnoreValenceForSelection", () => {
  test("flags every selected atom when none were flagged", () => {
    seed(["a1", "a2", "a3"]);
    useMoleculeStore.setState({ selected: new Set(["a1", "a2"]) });

    useMoleculeStore.getState().toggleIgnoreValenceForSelection();

    const { atoms } = useMoleculeStore.getState().molecule;
    expect(atoms.a1.ignoreValence).toBe(true);
    expect(atoms.a2.ignoreValence).toBe(true);
    // Unselected atom is untouched.
    expect(atoms.a3.ignoreValence).toBeFalsy();
  });

  test("clears every selected atom when all were flagged", () => {
    seed(["a1", "a2", "a3"], ["a1", "a2"]);
    useMoleculeStore.setState({ selected: new Set(["a1", "a2"]) });

    useMoleculeStore.getState().toggleIgnoreValenceForSelection();

    // Note: setAtomIgnoreValence stores `value || undefined`, so a cleared
    // atom reads back as undefined rather than literal false - assert on
    // truthiness to match how callers actually read this flag.
    const { atoms } = useMoleculeStore.getState().molecule;
    expect(atoms.a1.ignoreValence).toBeFalsy();
    expect(atoms.a2.ignoreValence).toBeFalsy();
  });

  test("resolves a mixed selection by the first atom, not a flip per atom", () => {
    // a1 flagged, a2 not. The rule is "everyone ends up matching the first
    // atom's new value". a1 starts flagged, so its new value is unflagged and
    // both end up cleared. Toggling each independently would instead leave
    // them opposite - which is what this test exists to rule out.
    seed(["a1", "a2"], ["a1"]);
    useMoleculeStore.setState({ selected: new Set(["a1", "a2"]) });

    useMoleculeStore.getState().toggleIgnoreValenceForSelection();

    const { atoms } = useMoleculeStore.getState().molecule;
    expect(atoms.a1.ignoreValence).toBeFalsy();
    expect(atoms.a2.ignoreValence).toBeFalsy();
  });

  test("mixed selection with an unflagged first atom flags them all", () => {
    // The inverse: a1 unflagged, a2 flagged -> both become flagged.
    seed(["a1", "a2"], ["a2"]);
    useMoleculeStore.setState({ selected: new Set(["a1", "a2"]) });

    useMoleculeStore.getState().toggleIgnoreValenceForSelection();

    const { atoms } = useMoleculeStore.getState().molecule;
    expect(atoms.a1.ignoreValence).toBe(true);
    expect(atoms.a2.ignoreValence).toBe(true);
  });

  test("pushes exactly one undo entry for the whole selection", () => {
    seed(["a1", "a2", "a3", "a4"]);
    useMoleculeStore.setState({ selected: new Set(["a1", "a2", "a3", "a4"]) });

    useMoleculeStore.getState().toggleIgnoreValenceForSelection();

    // The toolbar button is one gesture; four separate undo steps would make
    // the user press undo four times to undo one tap.
    expect(useMoleculeStore.getState().past).toHaveLength(1);
    const snapshot = useMoleculeStore.getState().past[0].molecule;
    expect(snapshot.atoms.a1.ignoreValence).toBeFalsy();
  });

  test("clears the redo stack, like any other committed edit", () => {
    seed(["a1"]);
    useMoleculeStore.setState({ selected: new Set(["a1"]), future: [{ molecule: emptyMolecule(), annotations: {} }] });
    useMoleculeStore.getState().toggleIgnoreValenceForSelection();
    expect(useMoleculeStore.getState().future).toHaveLength(0);
  });

  test("does nothing with an empty selection", () => {
    seed(["a1", "a2"]);
    useMoleculeStore.setState({ selected: new Set() });

    useMoleculeStore.getState().toggleIgnoreValenceForSelection();

    expect(useMoleculeStore.getState().past).toHaveLength(0);
    expect(useMoleculeStore.getState().molecule.atoms.a1.ignoreValence).toBeFalsy();
  });

  test("tolerates a selection referencing an atom that no longer exists", () => {
    // Selection is not guaranteed to be pruned on every edit path, and this
    // must not throw on the mobile toolbar's click handler.
    seed(["a1"]);
    useMoleculeStore.setState({ selected: new Set(["a1", "ghost"]) });

    expect(() => useMoleculeStore.getState().toggleIgnoreValenceForSelection()).not.toThrow();
    expect(useMoleculeStore.getState().molecule.atoms.a1.ignoreValence).toBe(true);
  });

  test("leaves the per-atom toggle untouched for the context menu to keep using", () => {
    seed(["a1", "a2"]);
    useMoleculeStore.setState({ selected: new Set(["a1", "a2"]) });

    // Single-atom toggle still flips just that atom and pushes one entry.
    useMoleculeStore.getState().toggleAtomIgnoreValence("a1");

    const { atoms } = useMoleculeStore.getState().molecule;
    expect(atoms.a1.ignoreValence).toBe(true);
    expect(atoms.a2.ignoreValence).toBeFalsy();
    expect(useMoleculeStore.getState().past).toHaveLength(1);
  });
});