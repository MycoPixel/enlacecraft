// @vitest-environment jsdom
//
// Needed because importProject() now sanitizes text-annotation html via
// DOMPurify (see io/sanitizeHtml.ts), which requires a real DOM — see
// cdxml.test.ts for the same override, for the same underlying reason.
import { describe, expect, test } from "vitest";
import { importProject, exportProject, ProjectParseError } from "./project";
import { findConnectedFragments } from "../model/valence";
import type { Molecule, TextAnnotation } from "../types/chemistry";

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
          molecule: {
            // The atoms the haptic bond refers to must exist, or the
            // validator (rightly) drops it as a dangling reference.
            atoms: {
              a0: { id: "a0", x: 0, y: 0, element: "Fe", charge: 0 },
              a1: { id: "a1", x: 10, y: 0, element: "C", charge: 0 },
              a2: { id: "a2", x: 20, y: 0, element: "C", charge: 0 },
            },
            bonds: {},
            hapticBonds: { hb0: { id: "hb0", metalAtomId: "a0", ringAtomIds: ["a1", "a2"] } },
            aromaticRingDisplays: {},
          },
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

// Regression test for a real stored-XSS vulnerability: a text annotation's
// `html` is rendered with a raw `div.innerHTML = annotation.html` write
// (see TextAnnotationView.tsx). A hand-crafted or shared .enlacecraft file
// could smuggle an executable payload through that field — importProject()
// must sanitize it (see io/sanitizeHtml.ts) rather than passing it through
// verbatim, for both the version-1 and version-2 file shapes.
describe("importProject sanitizes text annotation html (stored-XSS regression)", () => {
  test("strips a script/onerror payload from a version-2 file's text annotation", () => {
    const malicious = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Tab 1",
          molecule: { atoms: {}, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {} },
          annotations: {
            ann1: {
              id: "ann1",
              kind: "text",
              x: 0,
              y: 0,
              width: 100,
              height: 20,
              html: '<img src="x" onerror="alert(document.cookie)">still here',
              fontSize: 14,
            },
          },
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(malicious);
    const html = (project.tabs[0].annotations.ann1 as TextAnnotation).html;
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
    expect(html).toContain("still here"); // legitimate text content survives
  });

  test("strips the same payload from a version-1 file's text annotation", () => {
    const malicious = JSON.stringify({
      version: 1,
      molecule: { atoms: {}, bonds: {} },
      annotations: {
        ann1: { id: "ann1", kind: "text", x: 0, y: 0, width: 100, height: 20, html: '<script>alert(1)</script>', fontSize: 14 },
      },
      view: { scale: 1, tx: 0, ty: 0 },
    });

    const project = importProject(malicious);
    expect((project.tabs[0].annotations.ann1 as TextAnnotation).html).not.toContain("<script");
  });

  test("leaves the toolbar's real output (bold/italic/sub/sup/font-size span) untouched", () => {
    const html = '<b>bold</b> <sub>2</sub><span style="font-size: 18px">big</span>';
    const clean = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Tab 1",
          molecule: { atoms: {}, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {} },
          annotations: { ann1: { id: "ann1", kind: "text", x: 0, y: 0, width: 100, height: 20, html, fontSize: 14 } },
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(clean);
    expect((project.tabs[0].annotations.ann1 as TextAnnotation).html).toBe(html);
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
            atoms: Object.fromEntries(
              ["a1", "a2", "a3", "a4", "a5", "a6"].map((id, i) => [id, { id, x: i * 10, y: 0, element: "C", charge: 0 }]),
            ),
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

// ChemDraw reaction-scheme grouping is stored on the molecule (see
// ReactionScheme's doc comment), so it must survive a project save/open
// cycle like sgroups do — and its arrow references, which point into the
// sibling annotation map, must be pruned when that map loses an arrow.
describe("reaction scheme grouping in projects", () => {
  const baseMolecule: Molecule = {
    atoms: {
      a0: { id: "a0", x: 0, y: 0, element: "C", charge: 0 },
      a1: { id: "a1", x: 60, y: 0, element: "O", charge: 0 },
    },
    bonds: {},
    hapticBonds: {},
    aromaticRingDisplays: {},
  };

  test("schemes and their arrow references survive a save/open cycle", () => {
    const saved = exportProject({
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Scheme",
          molecule: {
            ...baseMolecule,
            schemes: [
              {
                id: "s1",
                steps: [
                  { id: "st1", reactantAtomIds: ["a0"], productAtomIds: ["a1"], arrowIds: ["ann1"] },
                ],
              },
            ],
          },
          annotations: {
            ann1: { id: "ann1", kind: "arrow", x1: 80, y1: 0, x2: 140, y2: 0, variant: "forward" },
          },
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(saved);
    expect(project.tabs[0].molecule.schemes).toEqual([
      { id: "s1", steps: [{ id: "st1", reactantAtomIds: ["a0"], productAtomIds: ["a1"], arrowIds: ["ann1"] }] },
    ]);
  });

  test("an arrow reference to a missing annotation is pruned on load", () => {
    const saved = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Scheme",
          molecule: {
            ...baseMolecule,
            schemes: [
              { id: "s1", steps: [{ id: "st1", reactantAtomIds: ["a0"], productAtomIds: ["a1"], arrowIds: ["gone"] }] },
            ],
          },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(saved);
    const step = project.tabs[0].molecule.schemes![0].steps[0];
    expect(step.arrowIds).toEqual([]);
    // The structure grouping itself is still meaningful, so it stays.
    expect(step.reactantAtomIds).toEqual(["a0"]);
    expect(step.productAtomIds).toEqual(["a1"]);
  });

  test("a scheme whose atoms were all dropped is removed entirely", () => {
    const saved = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Scheme",
          molecule: {
            atoms: {},
            bonds: {},
            schemes: [
              { id: "s1", steps: [{ id: "st1", reactantAtomIds: ["ghost"], productAtomIds: [], arrowIds: [] }] },
            ],
          },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    const project = importProject(saved);
    expect(project.tabs[0].molecule.schemes).toBeUndefined();
  });
});

describe("project page setup persistence", () => {
  const page = { x: 0, y: 0, width: 595.28, height: 841.89, bondLength: 36, marginWidth: 3 };

  test("round-trips a tab's page setup", () => {
    const json = exportProject({
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "A4",
          molecule: { atoms: {}, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {} },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
          page,
        },
      ],
    });

    expect(importProject(json).tabs[0].page).toEqual(page);
  });

  test("an older save without a page still imports (the store supplies its default)", () => {
    const saved = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Old",
          molecule: { atoms: {}, bonds: {}, hapticBonds: {} },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

    expect(importProject(saved).tabs[0].page).toBeUndefined();
  });

  test("a malformed page box is dropped rather than rejecting the whole project", () => {
    const saved = JSON.stringify({
      version: 2,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Broken page",
          molecule: { atoms: {}, bonds: {}, hapticBonds: {} },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
          page: { x: 0, y: 0, width: 0, height: 0 },
        },
      ],
    });

    expect(importProject(saved).tabs[0].page).toBeUndefined();
  });
});
