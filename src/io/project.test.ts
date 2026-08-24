import { describe, expect, test } from "vitest";
import { importProject, exportProject, ProjectParseError } from "./project";
import { findConnectedFragments } from "../model/valence";

/**
 * Regression test for a real bug: a project file (or autosave snapshot)
 * written before `hapticBonds` was added to the Molecule type loads with
 * that field simply absent, and the first thing that calls
 * Object.values() on it (findConnectedFragments, via the formula/MW
 * display) throws immediately on open — see importProject's
 * migrateMolecule() doc comment.
 */
describe("importProject migrates old saves missing hapticBonds", () => {
  test("version 2 file with no hapticBonds on its molecule imports cleanly", () => {
    const oldSave = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Tab 1",
          // Deliberately no hapticBonds key — the pre-hapticity save shape.
          molecule: {
            atoms: { a0: { id: "a0", x: 0, y: 0, element: "C", charge: 0 } },
            bonds: {},
          },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(oldSave);
    expect(project.tabs[0].molecule.hapticBonds).toEqual({});
    // The actual crash site: this must not throw.
    expect(() => findConnectedFragments(project.tabs[0].molecule)).not.toThrow();
  });

  test("version 1 file with no hapticBonds on its molecule imports cleanly", () => {
    const oldSave = JSON.stringify({
      version: 1,
      molecule: { atoms: {}, bonds: {} },
      annotations: {},
      view: { scale: 1, tx: 0, ty: 0 },
    });

    const project = importProject(oldSave);
    expect(project.tabs[0].molecule.hapticBonds).toEqual({});
  });

  test("a molecule that already has hapticBonds is left untouched", () => {
    const saved = exportProject({
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Tab 1",
          molecule: { atoms: {}, bonds: {}, hapticBonds: { hb0: { id: "hb0", metalAtomId: "a0", ringAtomIds: ["a1", "a2"] } }, aromaticRingDisplays: {} },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(saved);
    expect(project.tabs[0].molecule.hapticBonds).toEqual({ hb0: { id: "hb0", metalAtomId: "a0", ringAtomIds: ["a1", "a2"] } });
  });

  test("still rejects genuinely malformed project files", () => {
    expect(() => importProject("not json")).toThrow(ProjectParseError);
    expect(() => importProject(JSON.stringify({ version: 2, tabs: [] }))).toThrow(ProjectParseError);
  });
});

describe("importProject migrates old saves missing aromaticRingDisplays", () => {
  test("version 2 file with no aromaticRingDisplays on its molecule imports cleanly", () => {
    const oldSave = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Tab 1",
          // Deliberately no aromaticRingDisplays key -- same missing-field
          // shape as the hapticBonds bug above, for the field added after it.
          molecule: {
            atoms: { a0: { id: "a0", x: 0, y: 0, element: "C", charge: 0 } },
            bonds: {},
            hapticBonds: {},
          },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(oldSave);
    expect(project.tabs[0].molecule.aromaticRingDisplays).toEqual({});
  });

  test("a molecule that already has aromaticRingDisplays is left untouched", () => {
    const saved = exportProject({
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Tab 1",
          molecule: {
            atoms: {},
            bonds: {},
            hapticBonds: {},
            aromaticRingDisplays: { r0: { id: "r0", atomIds: ["a1", "a2", "a3", "a4", "a5", "a6"] } },
          },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(saved);
    expect(project.tabs[0].molecule.aromaticRingDisplays).toEqual({ r0: { id: "r0", atomIds: ["a1", "a2", "a3", "a4", "a5", "a6"] } });
  });
});
