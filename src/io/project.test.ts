// @vitest-environment jsdom
//
// Needed because importProject() now sanitizes text-annotation html via
// DOMPurify (see io/sanitizeHtml.ts), which requires a real DOM — see
// cdxml.test.ts for the same override, for the same underlying reason.
import { describe, expect, test } from "vitest";
import { importProject, exportProject, ProjectParseError } from "./project";
import { findConnectedFragments } from "../model/valence";
import type { TextAnnotation } from "../types/chemistry";

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
