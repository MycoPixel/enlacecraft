import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { exportProject, importProject } from "../io/project";
import { translate } from "../i18n/translate";
import type { Molecule } from "../types/chemistry";

/** Host c1—R1 plus a standalone two-atom substituent (s1—s2) to define. */
function setup(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "r1", { x: 60, y: 0 }, "C", "R1");
  mol = addBond(mol, "b1", "c1", "r1");
  mol = addAtom(mol, "s1", { x: 200, y: 0 }, "C");
  mol = addAtom(mol, "s2", { x: 260, y: 0 }, "O");
  mol = addBond(mol, "b2", "s1", "s2");
  return mol;
}

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: setup(),
    annotations: {},
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

describe("R-group store actions", () => {
  test("defines an R-group from the selection in one undo step", () => {
    state().setSelected(new Set(["s1", "s2"]));
    state().defineRGroupFromSelection("R1");

    const s = state();
    expect(s.past).toHaveLength(1);
    const defs = Object.values(s.molecule.rgroups ?? {});
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ label: "R1", attachmentAtomId: "s1" });
    expect(s.molecule.atoms.s1).toBeUndefined();
    expect(s.molecule.atoms.s2).toBeUndefined();
    // The selection's atoms moved into the definition — nothing to keep.
    expect(s.selected.size).toBe(0);
    expect(s.announcement?.key).toBe("a11y.rgroupDefined");

    state().undo();
    expect(state().past).toHaveLength(0);
    expect(state().molecule.rgroups).toBeUndefined();
    expect(state().molecule.atoms.s1).toBeDefined();
    expect(state().molecule.atoms.s2).toBeDefined();
  });

  test("an empty selection is a no-op with a status message", () => {
    const before = state().molecule;
    state().defineRGroupFromSelection("R1");
    expect(state().past).toHaveLength(0);
    expect(state().molecule).toBe(before);
    expect(state().status).toBe("status.rgroupEmptySelection");
  });

  test("a non-R label is a no-op with a status message", () => {
    state().setSelected(new Set(["s1"]));
    state().defineRGroupFromSelection("X");
    expect(state().past).toHaveLength(0);
    expect(state().molecule.rgroups).toBeUndefined();
    expect(state().status).toBe("status.rgroupLabelInvalid");
  });

  test("expanding is one undo step and announces the copy count", () => {
    state().setSelected(new Set(["s1", "s2"]));
    state().defineRGroupFromSelection("R1");
    expect(state().past).toHaveLength(1);

    state().expandGenericStructure();
    const s = state();
    expect(s.past).toHaveLength(2);
    expect(s.announcement?.key).toBe("a11y.rgroupExpanded");
    expect(s.announcement?.params).toEqual({ count: 1 });
    expect(s.status).toBe(translate("en", "status.rgroupExpanded", { count: 1 }));
    // Original two atoms (c1, r1) plus one fully-expanded copy (host carbon
    // + the two fragment atoms, the R placeholder deleted).
    expect(Object.keys(s.molecule.atoms)).toHaveLength(5);
    expect(Object.values(s.molecule.rgroups ?? {})).toHaveLength(1);

    state().undo();
    expect(state().past).toHaveLength(1);
    expect(Object.keys(state().molecule.atoms)).toHaveLength(2);
    // Undo of Expand keeps the definition — only the copies go away.
    expect(Object.values(state().molecule.rgroups ?? {})).toHaveLength(1);

    state().undo();
    expect(state().molecule.rgroups).toBeUndefined();
  });

  test("expanding with nothing to do is a no-op with a status message", () => {
    state().expandGenericStructure();
    expect(state().past).toHaveLength(0);
    expect(state().status).toBe("status.rgroupNothingDefined");

    // Definitions but no drawn R label any more.
    const defs = { d1: { id: "d1", label: "R1", attachmentAtomId: "f", molecule: emptyMolecule() } };
    useMoleculeStore.setState({
      molecule: { ...emptyMolecule(), rgroups: defs },
    });
    state().expandGenericStructure();
    expect(state().past).toHaveLength(0);
    expect(state().status).toBe("status.rgroupNoLabels");
  });

  test("clearing definitions is one undo step and does not restore fragments", () => {
    state().setSelected(new Set(["s1", "s2"]));
    state().defineRGroupFromSelection("R1");
    expect(state().molecule.atoms.s1).toBeUndefined();

    state().clearRGroups();
    const s = state();
    expect(s.past).toHaveLength(2);
    expect(s.molecule.rgroups).toBeUndefined();
    expect(s.announcement?.key).toBe("a11y.rgroupCleared");
    // Clearing forgets the definitions; the extracted atoms stay extracted.
    expect(s.molecule.atoms.s1).toBeUndefined();

    state().undo();
    expect(Object.values(state().molecule.rgroups ?? {})).toHaveLength(1);
  });

  test("clearing without definitions is a no-op with a status message", () => {
    state().clearRGroups();
    expect(state().past).toHaveLength(0);
    expect(state().status).toBe("status.rgroupNothingDefined");
  });

  test("definitions survive a project save/open round-trip and still expand", () => {
    state().setSelected(new Set(["s1", "s2"]));
    state().defineRGroupFromSelection("R1");

    const json = exportProject({
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "R-groups",
          molecule: state().molecule,
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });
    const restored = importProject(json).tabs[0].molecule;
    const defs = Object.values(restored.rgroups ?? {});
    expect(defs).toHaveLength(1);
    expect(defs[0].label).toBe("R1");
    expect(defs[0].attachmentAtomId).toBe("s1");
    expect(defs[0].molecule.atoms.s1).toBeDefined();
    expect(defs[0].molecule.atoms.s2).toBeDefined();

    // A restored document expands like a live one.
    useMoleculeStore.setState({ molecule: restored, past: [], future: [] });
    state().expandGenericStructure();
    expect(state().announcement?.key).toBe("a11y.rgroupExpanded");
    expect(state().announcement?.params).toEqual({ count: 1 });
  });
});
