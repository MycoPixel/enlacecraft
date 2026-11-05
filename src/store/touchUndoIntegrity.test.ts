// @vitest-environment jsdom
import { describe, expect, test, beforeEach } from "vitest";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { emptyMolecule, addAtom, addBond } from "../model/molecule";
import type { Molecule } from "../types/chemistry";

/**
 * Covers the undo-integrity half of the touch gesture handling in
 * useCanvasInteractions.ts.
 *
 * Several tools mutate the molecule on *pointerdown* and only push their
 * checkpoint in onPointerUp: erase deletes immediately, move repositions
 * atoms as it goes, bond creates a carbon at the press point if you missed
 * an atom. Starting a pinch mid-gesture (a second finger landing) or having
 * the browser cancel the pointer abandoned that drag without ever reaching
 * onPointerUp — so the edit stayed applied but no undo entry existed, and
 * the user could not undo their own change. For erase, where the change is
 * destructive by definition, that meant atoms disappearing permanently.
 *
 * These tests exercise the store-level contract that abortDrag relies on:
 * an in-flight transient mutation is only undoable if a checkpoint is
 * pushed against the pre-mutation snapshot.
 */

const atomCount = (m: Molecule) => Object.keys(m.atoms).length;
/** Last entry of the store's undo stack, without Array.prototype.at — the
 *  tsconfig lib target here predates it (see the same limitation noted in
 *  the other suites). */
const lastSnapshot = () => {
  const { past } = useMoleculeStore.getState();
  return past[past.length - 1];
};
const bondCount = (m: Molecule) => Object.keys(m.bonds).length;

function freshStore() {
  useMoleculeStore.setState({ molecule: emptyMolecule(), past: [], future: [], selected: new Set<string>() });
}

function seedChain() {
  const a = "atom-a";
  const b = "atom-b";
  let mol = addAtom(emptyMolecule(), a, { x: 0, y: 0 }, "C");
  mol = addAtom(mol, b, { x: 40, y: 0 }, "C");
  mol = addBond(mol, "bond-ab", a, b, 1, "none");
  useMoleculeStore.setState({ molecule: mol });
  return { a, b };
}

beforeEach(() => {
  freshStore();
});

describe("transient mutations stay undoable", () => {
  test("erasing then abandoning the gesture is recoverable with undo", () => {
    const { a, b } = seedChain();
    const store = useMoleculeStore.getState();
    const before = store.snapshotBefore();

    // Mirrors the erase tool's pointerdown: delete straight away, with the
    // checkpoint deferred to release (which never comes).
    useMoleculeStore.getState().deleteAtomTransient(a);
    expect(atomCount(useMoleculeStore.getState().molecule)).toBe(1);

    // Before the fix this line simply didn't happen on pinch-abort.
    useMoleculeStore.getState().commitCheckpoint(before);

    const afterUndo = lastSnapshot();
    expect(atomCount(afterUndo.molecule)).toBe(2);
    expect(useMoleculeStore.getState().molecule.atoms[a]).toBeUndefined();
    expect(useMoleculeStore.getState().molecule.atoms[b]).toBeDefined();
  });

  test("checkpoint restores erased atoms and bonds together", () => {
    const { a } = seedChain();
    const store = useMoleculeStore.getState();
    const before = store.snapshotBefore();

    useMoleculeStore.getState().deleteAtomTransient(a);
    expect(atomCount(useMoleculeStore.getState().molecule)).toBe(1);
    // Deleting an atom takes its bonds with it.
    expect(bondCount(useMoleculeStore.getState().molecule)).toBe(0);

    useMoleculeStore.getState().commitCheckpoint(before);
    const restored = lastSnapshot().molecule;
    expect(atomCount(restored)).toBe(2);
    expect(bondCount(restored)).toBe(1);
  });

  test("committing a checkpoint clears the redo stack, as a real commit does", () => {
    seedChain();
    const store = useMoleculeStore.getState();
    const before = store.snapshotBefore();

    // Seed a redo entry the way an earlier undo would leave one.
    useMoleculeStore.setState({ future: [{ molecule: emptyMolecule(), annotations: {} }] });
    useMoleculeStore.getState().deleteAtomTransient(Object.keys(useMoleculeStore.getState().molecule.atoms)[0]);
    useMoleculeStore.getState().commitCheckpoint(before);

    expect(useMoleculeStore.getState().future).toHaveLength(0);
  });

  test("an unmodified gesture commits an identical snapshot (erase on empty canvas)", () => {
    const store = useMoleculeStore.getState();
    const before = store.snapshotBefore();

    // Erase tool pressed on empty canvas: nothing deleted. abortDrag guards on
    // `molecule !== before.molecule`, so this must not add a history entry.
    if (useMoleculeStore.getState().molecule !== before.molecule) {
      useMoleculeStore.getState().commitCheckpoint(before);
    }

    expect(useMoleculeStore.getState().past).toHaveLength(0);
  });

  test("a multi-atom erase stroke is one undo step, not one per atom", () => {
    let mol = emptyMolecule();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = `atom-${i}`;
      mol = addAtom(mol, id, { x: i * 40, y: 0 }, "C");
      ids.push(id);
    }
    useMoleculeStore.setState({ molecule: mol });

    const store = useMoleculeStore.getState();
    const before = store.snapshotBefore();

    // The drag-erase path deletes on every pointermove along the stroke.
    for (const id of ids.slice(0, 3)) {
      useMoleculeStore.getState().deleteAtomTransient(id);
    }
    expect(atomCount(useMoleculeStore.getState().molecule)).toBe(1);

    useMoleculeStore.getState().commitCheckpoint(before);
    const past = useMoleculeStore.getState().past;

    // One entry, and it restores all four — the whole stroke in a single undo.
    expect(past).toHaveLength(1);
    expect(atomCount(past[0].molecule)).toBe(4);
  });
});

describe("move and rotate", () => {
  test("an in-flight move is restorable from its snapshot", () => {
    const { a } = seedChain();
    const store = useMoleculeStore.getState();
    const before = store.snapshotBefore();

    // moveAtomsTransient is what a drag uses; no checkpoint until release.
    useMoleculeStore.getState().moveAtomsTransient({ [a]: { x: 999, y: 999 } });
    expect(useMoleculeStore.getState().molecule.atoms[a].x).toBe(999);

    useMoleculeStore.getState().commitCheckpoint(before);
    const restored = lastSnapshot().molecule;
    expect(restored.atoms[a].x).toBe(0);
  });

  test("a no-op move still records the pre-drag positions", () => {
    const { a } = seedChain();
    const store = useMoleculeStore.getState();
    const before = store.snapshotBefore();
    const originalX = before.molecule.atoms[a].x;

    useMoleculeStore.getState().commitCheckpoint(before);
    const restored = lastSnapshot().molecule;

    expect(restored.atoms[a].x).toBe(originalX);
  });
});
/**
 * Annotation-only edits must mark the document dirty.
 *
 * updateTextHtml, updateTextSize, moveAnnotationTransient,
 * updateBracketSizeOf and updateArrowCurvatureTransient set only `annotations` -
 * they never set hasUnsavedChanges, because going through commitAnnotations()
 * would push an undo checkpoint per keystroke and per pointermove.
 *
 * The dirty flag asks a different question ("does unsaved work exist?"), and it
 * simply wasn't being answered. Typing "conc. H2SO4, 80 C" into a reagent box
 * and closing the tab inside the autosave debounce produced no dirty dot and no
 * beforeunload prompt, so the text was lost with nothing warning about it.
 * Structurally identical edits at least triggered the prompt; annotation-only
 * edits got nothing.
 */
describe("annotation-only edits set the dirty flag", () => {
  beforeEach(() => {
    useMoleculeStore.setState({ hasUnsavedChanges: false, molecule: emptyMolecule(), annotations: {} });
  });

  test("typing into a text annotation marks the document dirty", () => {
    const s = useMoleculeStore.getState();
    const id = s.addTextAnnotation({ x: 0, y: 0 });
    // Adding is a commit, so clear the flag to isolate the LIVE edit.
    useMoleculeStore.setState({ hasUnsavedChanges: false });

    useMoleculeStore.getState().updateTextHtml(id, "conc. H2SO4");
    expect(useMoleculeStore.getState().hasUnsavedChanges).toBe(true);
  });

  test("resizing a text annotation marks the document dirty", () => {
    const s = useMoleculeStore.getState();
    const id = s.addTextAnnotation({ x: 0, y: 0 });
    useMoleculeStore.setState({ hasUnsavedChanges: false });

    useMoleculeStore.getState().updateTextSize(id, 220, 40);
    expect(useMoleculeStore.getState().hasUnsavedChanges).toBe(true);
  });

  test("dragging an annotation marks the document dirty", () => {
    const s = useMoleculeStore.getState();
    const id = s.addTextAnnotation({ x: 0, y: 0 });
    useMoleculeStore.setState({ hasUnsavedChanges: false });

    useMoleculeStore.getState().moveAnnotationTransient(id, { x: 90, y: 60 });
    expect(useMoleculeStore.getState().hasUnsavedChanges).toBe(true);
  });

  test("curving an arrow marks the document dirty", () => {
    const s = useMoleculeStore.getState();
    const id = s.addArrowAnnotation({ x: 0, y: 0 }, { x: 80, y: 0 }, "forward", "full", "medium");
    useMoleculeStore.setState({ hasUnsavedChanges: false });

    useMoleculeStore.getState().updateArrowCurvatureTransient(id, 12);
    expect(useMoleculeStore.getState().hasUnsavedChanges).toBe(true);
  });

  test("still does NOT flood the undo history with one entry per keystroke", () => {
    // The reason these bypass commitAnnotations in the first place - if this
    // ever changes, the "separate undo checkpoint" comment above goes stale.
    const s = useMoleculeStore.getState();
    const id = s.addTextAnnotation({ x: 0, y: 0 });
    const before = useMoleculeStore.getState().past.length;

    for (const text of ["c", "co", "con", "conc"]) {
      useMoleculeStore.getState().updateTextHtml(id, text);
    }
    expect(useMoleculeStore.getState().past.length).toBe(before);
  });
});
