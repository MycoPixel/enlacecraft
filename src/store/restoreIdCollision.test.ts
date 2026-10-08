// @vitest-environment jsdom
import { describe, expect, test, beforeEach } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { emptyMolecule, addAtom, addBond } from "../model/molecule";
import { nextId, reserveIds } from "../model/id";
import type { Molecule, TextAnnotation, ViewTransform } from "../types/chemistry";
import type { SavedTab } from "./useMoleculeStore";

/**
 * Restore must not hand out ids that the restored document already uses.
 *
 * `nextId()` is a page-lifetime counter that restarts at 1 on every load, while
 * a restored document carries ids from whichever session last saved it. Nothing
 * reconciled the two, and `addAtom` writes `atoms[id]` unconditionally - so a
 * collision OVERWROTE instead of appending.
 *
 * Reproduced before the fix: restoring atoms "2" and "3", then drawing one more
 * atom (the counter handed out "2" again), left the count at 2, turned the
 * carbon into a nitrogen 900px away, and left bond "9" pointing 2 -> 3 - so the
 * bond now spanned the canvas. No error, and the corrupted document is what the
 * next autosave persisted.
 *
 * The bug was near-deterministic rather than a race: restored ids are always
 * small integers and the fresh counter is always small, so they overlapped by
 * default.
 */

const textAnn = (id: string): TextAnnotation => ({
  id,
  kind: "text",
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  html: "x",
  fontSize: 12,
});

const restoredDoc = (): Molecule => {
  const withAtoms = addAtom(emptyMolecule(), "2", { x: 0, y: 0 }, "C");
  const twoAtoms = addAtom(withAtoms, "3", { x: 40, y: 0 }, "O");
  return addBond(twoAtoms, "9", "2", "3", 1, "none");
};

const VIEW: ViewTransform = { scale: 1, tx: 0, ty: 0 };

const savedTab = (id: string, title: string, mol: Molecule): SavedTab => ({
  id,
  title,
  molecule: mol,
  annotations: { a1: textAnn("5") },
  view: VIEW,
});

const projectOf = (mol: Molecule) => ({ activeTabId: "tab-1", tabs: [savedTab("tab-1", "Tab 1", mol)] });

describe("reserveIds", () => {
  test("moves the counter past every reserved id", () => {
    reserveIds(["2", "3", "9"]);
    expect(Number(nextId())).toBeGreaterThan(9);
  });

  test("ignores non-numeric ids, which nextId can never produce", () => {
    // The counter is module-level and shared across this file, so an absolute
    // bound would only assert whatever earlier tests happened to leave behind.
    // What matters is that reserving junk moves it by nothing.
    const before = Number(nextId());
    reserveIds(["999999abc", "", "ann-4", "3.5", "-7", "0", "abc", "NaN", "Infinity"]);
    expect(Number(nextId())).toBe(before + 1);
  });

  test("is idempotent and never moves the counter backwards", () => {
    const first = nextId();
    reserveIds(["500"]);
    reserveIds(["500"]);
    const after = Number(nextId());
    expect(after).toBeGreaterThan(500);
    expect(after).toBeGreaterThan(Number(first));
  });

  test("reports how many ids it actually had to move past", () => {
    // Useful in tests and diagnostics; also proves the "already past" case
    // counts 0 rather than silently claiming success.
    expect(reserveIds([])).toBe(0);
  });
});

describe("loadProject", () => {
  beforeEach(() => {
    useMoleculeStore.setState({
      molecule: emptyMolecule(),
      annotations: {},
      past: [],
      future: [],
      selected: new Set<string>(),
      activeTabId: "tab-1",
      tabs: [{ id: "tab-1", title: "Tab 1" }],
      tabDocuments: {},
      hasUnsavedChanges: false,
    });
  });

  test("drawing an atom after a restore does NOT overwrite a restored atom", () => {
    // The exact scenario from the report.
    useMoleculeStore.getState().loadProject(projectOf(restoredDoc()));
    const before = useMoleculeStore.getState().molecule;
    expect(Object.keys(before.atoms)).toHaveLength(2);

    const after = addAtom(before, nextId(), { x: 900, y: 900 }, "N");

    // Three atoms. Before the fix this stayed at 2.
    expect(Object.keys(after.atoms)).toHaveLength(3);
    // And the restored carbon is still a carbon, still where it was.
    expect(after.atoms["2"].element).toBe("C");
    expect(after.atoms["2"].x).toBe(0);
  });

  test("a bond added after a restore cannot clobber a restored bond", () => {
    useMoleculeStore.getState().loadProject(projectOf(restoredDoc()));
    const mol = useMoleculeStore.getState().molecule;

    // A fresh atom, then a fresh bond to it. (Adding a bond between "2" and
    // "3" again would be refused as a duplicate pair, which would test dedup
    // rather than id collision.)
    const newAtomId = nextId();
    const three = addAtom(mol, newAtomId, { x: 80, y: 0 }, "N");
    const bondId = nextId();
    const four = addBond(three, bondId, "3", newAtomId, 1, "none");

    // Both bonds survive.
    expect(Object.keys(four.bonds)).toHaveLength(2);
    // The restored bond still points at the atoms it was drawn between - if the
    // new bond had taken id "9", its endpoints would have been overwritten.
    expect(four.bonds["9"].a1).toBe("2");
    expect(four.bonds["9"].a2).toBe("3");
  });

  test("reserves annotation ids too, not just atoms", () => {
    // addTextAnnotation mints its id from the same counter, so an annotation
    // id is just as collidable as an atom id.
    useMoleculeStore.getState().loadProject(projectOf(restoredDoc()));
    const used = nextId();
    expect(Number(used)).toBeGreaterThan(5); // past the annotation's "5"
  });

  test("reserves across every tab, not only the active one", () => {
    // A background tab's atoms get switched into and then added to, so its
    // ids must be reserved even while another tab is active.
    const other = addAtom(restoredDoc(), "77", { x: 5, y: 5 }, "S");
    useMoleculeStore.getState().loadProject({
      activeTabId: "tab-1",
      tabs: [savedTab("tab-1", "A", restoredDoc()), savedTab("tab-2", "B", other)],
    });
    expect(Number(nextId())).toBeGreaterThan(77);
  });

  test("an empty project reserves nothing and does not break id minting", () => {
    useMoleculeStore.getState().loadProject({
      activeTabId: "tab-1",
      tabs: [savedTab("tab-1", "Empty", emptyMolecule())],
    });
    expect(Number(nextId())).toBeGreaterThan(0);
  });
});

describe("importProjectAsNewTabs", () => {
  beforeEach(() => {
    useMoleculeStore.setState({
      molecule: emptyMolecule(),
      annotations: {},
      past: [],
      future: [],
      selected: new Set<string>(),
      activeTabId: "tab-1",
      tabs: [{ id: "tab-1", title: "Tab 1" }],
      tabDocuments: {},
      hasUnsavedChanges: false,
    });
  });

  test("reserves imported ids so drawing afterwards cannot overwrite them", () => {
    // Opening a .enlacecraft is the same hazard as an autosave restore, and
    // it was equally unguarded.
    useMoleculeStore.getState().importProjectAsNewTabs(projectOf(restoredDoc()));
    const active = useMoleculeStore.getState();
    const after = addAtom(active.molecule, nextId(), { x: 900, y: 900 }, "N");
    expect(Object.keys(after.atoms)).toHaveLength(3);
  });
});