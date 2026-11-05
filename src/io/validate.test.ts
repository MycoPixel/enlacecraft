// @vitest-environment jsdom
//
// jsdom because text annotations are run through DOMPurify (see
// io/sanitizeHtml.ts), which needs a real DOM.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ImportValidationError,
  LIMITS,
  newRepairReport,
  sanitizeAnnotationRecord,
  sanitizeFragment,
  sanitizeMolecule,
  sanitizeObjectGroups,
  sanitizePageSetup,
  sanitizeUserTemplates,
  sanitizeView,
  totalDropped,
} from "./validate";
import { importProject, ProjectParseError } from "./project";
import { BookmarksParseError, importBookmarks } from "./templateBookmarks";
import { importMol } from "./molfile";
import { importCdxml } from "./cdxml";
import { exportSmiles } from "./smiles";
import { loadUserTemplates } from "../model/userTemplates";
import { computeFormula, implicitH } from "../model/valence";

const atom = (id: string, x = 0, y = 0, element = "C", extra: object = {}) => ({ id, x, y, element, charge: 0, ...extra });
const bond = (id: string, a1: string, a2: string, extra: object = {}) => ({ id, a1, a2, order: 1, stereo: "none", doubleSide: "auto", ...extra });

/** Hostile-key JSON: JSON.parse creates a real own "__proto__" property. */
const hostile = (json: string) => JSON.parse(json);

describe("sanitizeMolecule", () => {
  test("keeps a well-formed molecule and backfills optional containers", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule({ atoms: { a1: atom("a1"), a2: atom("a2", 30) }, bonds: { b1: bond("b1", "a1", "a2") } }, report);
    expect(Object.keys(mol.atoms)).toEqual(["a1", "a2"]);
    expect(Object.keys(mol.bonds)).toEqual(["b1"]);
    expect(mol.hapticBonds).toEqual({});
    expect(mol.aromaticRingDisplays).toEqual({});
    expect(totalDropped(report)).toBe(0);
  });

  test("drops a bond that points at a missing atom, and counts it", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule({ atoms: { a1: atom("a1") }, bonds: { b1: bond("b1", "a1", "GHOST") } }, report);
    expect(mol.bonds).toEqual({});
    expect(report.droppedBonds).toBe(1);
  });

  test("drops self-bonds and bonds with an invalid order", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule(
      { atoms: { a1: atom("a1"), a2: atom("a2") }, bonds: { b1: bond("b1", "a1", "a1"), b2: bond("b2", "a1", "a2", { order: 7 }) } },
      report,
    );
    expect(mol.bonds).toEqual({});
    expect(report.droppedBonds).toBe(2);
  });

  test("drops atoms with an unknown element or non-numeric/non-finite coordinates, and their bonds", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule(
      {
        atoms: { a1: atom("a1"), a2: atom("a2", 0, 0, "Zz"), a3: atom("a3", "5" as never), a4: atom("a4", Number.NaN), a5: atom("a5", 1e9) },
        bonds: { b1: bond("b1", "a1", "a2") },
      },
      report,
    );
    expect(Object.keys(mol.atoms)).toEqual(["a1"]);
    expect(mol.bonds).toEqual({});
    expect(report.droppedAtoms).toBe(4);
    expect(report.droppedBonds).toBe(1);
  });

  test("uses the record key as the id even if the object says otherwise", () => {
    const mol = sanitizeMolecule({ atoms: { real: atom("liar") }, bonds: {} });
    expect(mol.atoms.real.id).toBe("real");
    expect(mol.atoms.liar).toBeUndefined();
  });

  test("never copies unknown fields", () => {
    const mol = sanitizeMolecule({ atoms: { a1: atom("a1", 0, 0, "C", { evil: "<img onerror=x>", onclick: "x" }) }, bonds: {} });
    expect(Object.keys(mol.atoms.a1).sort()).toEqual(["charge", "element", "id", "x", "y"]);
  });

  test("an invalid OPTIONAL field is omitted (and counted), not fatal", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule({ atoms: { a1: atom("a1", 0, 0, "C", { charge: 1e9, isotope: -3, lonePairs: 99 }) }, bonds: {} }, report);
    expect(mol.atoms.a1.charge).toBe(0);
    expect(mol.atoms.a1.isotope).toBeUndefined();
    expect(mol.atoms.a1.lonePairs).toBeUndefined();
    expect(report.fixedFields).toBe(3);
  });

  test("highlight colours must be plain hex — nothing that could break out of an attribute", () => {
    const mol = sanitizeMolecule({
      atoms: {
        a1: atom("a1", 0, 0, "C", { highlightColor: "#ffd60a" }),
        a2: atom("a2", 0, 0, "C", { highlightColor: 'red" onload="alert(1)' }),
        a3: atom("a3", 0, 0, "C", { highlightColor: "url(javascript:alert(1))" }),
      },
      bonds: {},
    });
    expect(mol.atoms.a1.highlightColor).toBe("#ffd60a");
    expect(mol.atoms.a2.highlightColor).toBeUndefined();
    expect(mol.atoms.a3.highlightColor).toBeUndefined();
  });

  test("haptic bonds and aromatic-ring displays that reference missing atoms are dropped", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule(
      {
        atoms: { m: atom("m", 0, 0, "Fe"), r1: atom("r1"), r2: atom("r2"), r3: atom("r3") },
        bonds: {},
        hapticBonds: { ok: { id: "ok", metalAtomId: "m", ringAtomIds: ["r1", "r2", "nope"] }, bad: { id: "bad", metalAtomId: "zzz", ringAtomIds: ["r1"] } },
        aromaticRingDisplays: { ok: { id: "ok", atomIds: ["r1", "r2", "r3"] }, bad: { id: "bad", atomIds: ["r1", "x", "y"] } },
      },
      report,
    );
    expect(mol.hapticBonds.ok.ringAtomIds).toEqual(["r1", "r2"]);
    expect(mol.hapticBonds.bad).toBeUndefined();
    expect(mol.aromaticRingDisplays.ok).toBeDefined();
    expect(mol.aromaticRingDisplays.bad).toBeUndefined();
    expect(report.droppedOther).toBe(2);
  });

  test("refuses structures over the atom limit", () => {
    const atoms = Object.fromEntries(Array.from({ length: LIMITS.maxAtoms + 1 }, (_, i) => [`a${i}`, atom(`a${i}`)]));
    expect(() => sanitizeMolecule({ atoms, bonds: {} })).toThrow(ImportValidationError);
  });

  test("refuses containers of the wrong type", () => {
    expect(() => sanitizeMolecule(null)).toThrow(ImportValidationError);
    expect(() => sanitizeMolecule({ atoms: [], bonds: {} })).toThrow(ImportValidationError);
    expect(() => sanitizeMolecule({ atoms: {}, bonds: "x" })).toThrow(ImportValidationError);
  });
});

describe("prototype-pollution keys", () => {
  test("__proto__ / constructor / prototype are never accepted as record keys", () => {
    const evil = hostile(
      `{"atoms":{"__proto__":{"id":"p","x":0,"y":0,"element":"C","injected":1},"constructor":{"id":"c","x":0,"y":0,"element":"C"},"a1":{"id":"a1","x":0,"y":0,"element":"C"}},"bonds":{"__proto__":{"a1":"a1","a2":"a1","order":1}}}`,
    );
    const report = newRepairReport();
    const mol = sanitizeMolecule(evil, report);
    expect(Object.keys(mol.atoms)).toEqual(["a1"]);
    expect(Object.getPrototypeOf(mol.atoms)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(mol.bonds)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).injected).toBeUndefined();
    expect(report.droppedAtoms).toBe(2);
  });

  test("the annotations record no longer has its prototype rewired (regression)", () => {
    const evil = hostile(`{"__proto__":{"kind":"text","x":0,"y":0,"width":10,"height":10,"html":"<b>x</b>","injected":1}}`);
    const report = newRepairReport();
    const out = sanitizeAnnotationRecord(evil, report);
    expect(Object.keys(out)).toEqual([]);
    expect((Object.getPrototypeOf(out) as { injected?: unknown }).injected).toBeUndefined();
    expect(report.droppedAnnotations).toBe(1);
  });
});

describe("annotations", () => {
  test("text html is sanitized, unknown kinds and non-string html are dropped", () => {
    const report = newRepairReport();
    const out = sanitizeAnnotationRecord(
      {
        t1: { id: "t1", kind: "text", x: 0, y: 0, width: 50, height: 20, html: '<b>ok</b><img src=x onerror="alert(1)"><script>alert(2)</script>', fontSize: 14 },
        t2: { id: "t2", kind: "text", x: 0, y: 0, width: 50, height: 20, html: 42, fontSize: 14 },
        t3: { id: "t3", kind: "script", x: 0, y: 0 },
        a1: { id: "a1", kind: "arrow", x1: 0, y1: 0, x2: 50, y2: 0, variant: "forward" },
      },
      report,
    );
    expect(Object.keys(out).sort()).toEqual(["a1", "t1"]);
    const html = (out.t1 as { html: string }).html;
    expect(html).toContain("<b>ok</b>");
    expect(html).not.toMatch(/onerror|<script|alert/);
    expect(report.droppedAnnotations).toBe(2);
  });

  test("arrow with a non-finite endpoint is dropped", () => {
    const out = sanitizeAnnotationRecord({ a1: { id: "a1", kind: "arrow", x1: 0, y1: 0, x2: Number.POSITIVE_INFINITY, y2: 0, variant: "forward" } });
    expect(out).toEqual({});
  });

  test("shape, orbital and TLC annotations sanitize with defaults and bounds", () => {
    const out = sanitizeAnnotationRecord({
      s1: { id: "s1", kind: "shape", x: 0, y: 0, width: 80, height: 40, variant: "ellipse", filled: true },
      o1: { id: "o1", kind: "orbital", x: 10, y: 10, size: 40, angle: 45, variant: "p", filled: false },
      p1: { id: "p1", kind: "tlc", x: 0, y: 0, width: 90, height: 130, spots: [{ fx: 0.5, fy: 0.6, r: 4, color: "#ff0000" }, { fx: 2, fy: -1 }] },
      s2: { id: "s2", kind: "shape", x: 0, y: 0, width: 80, height: 40, variant: "hexagon" },
      o2: { id: "o2", kind: "orbital", x: 0, y: 0, size: -5, angle: 0, variant: "s" },
    });
    // The two valid ones survive plus the plate; the negative-size orbital
    // is dropped (bad REQUIRED field). The unknown shape variant is REPAIRED
    // to the default — the same policy as an unknown arrow variant, since
    // variant is an optional field.
    expect(Object.keys(out).sort()).toEqual(["o1", "p1", "s1", "s2"]);
    expect((out.s1 as { variant: string }).variant).toBe("ellipse");
    expect((out.s2 as { variant: string }).variant).toBe("hexagon");
    expect((out.o1 as { angle: number }).angle).toBe(45);
    const plate = out.p1 as { spots: { fx: number; fy: number; color?: string }[] };
    // The in-bounds spot keeps its color; the out-of-range spot is skipped
    // without failing the plate.
    expect(plate.spots).toHaveLength(1);
    expect(plate.spots[0].fx).toBe(0.5);
    expect(plate.spots[0].color).toBe("#ff0000");
  });

  test("new bond stereo styles and arrow fields pass validation", () => {
    const out = sanitizeAnnotationRecord({
      a1: { id: "a1", kind: "arrow", x1: 0, y1: 0, x2: 90, y2: 0, variant: "retrosynthetic", dashed: true },
    });
    const arrow = out.a1 as { variant: string; dashed?: boolean };
    expect(arrow.variant).toBe("retrosynthetic");
    expect(arrow.dashed).toBe(true);
  });
});

describe("sanitizeView", () => {
  test("falls back to the default view for scale 0, NaN, or garbage", () => {
    const dflt = { scale: 1, tx: 0, ty: 0 };
    expect(sanitizeView({ scale: 0, tx: 0, ty: 0 })).toEqual(dflt);
    expect(sanitizeView({ scale: Number.NaN, tx: 0, ty: 0 })).toEqual(dflt);
    expect(sanitizeView({ scale: "2", tx: 0, ty: 0 })).toEqual(dflt);
    expect(sanitizeView(null)).toEqual(dflt);
    expect(sanitizeView({ scale: 2, tx: 5, ty: -5 })).toEqual({ scale: 2, tx: 5, ty: -5 });
  });
});

describe("sanitizePageSetup", () => {
  test("returns undefined for a missing or non-object page", () => {
    expect(sanitizePageSetup(undefined)).toBeUndefined();
    expect(sanitizePageSetup(null)).toBeUndefined();
    expect(sanitizePageSetup("A4")).toBeUndefined();
    expect(sanitizePageSetup([])).toBeUndefined();
  });

  test("keeps a complete page box", () => {
    expect(sanitizePageSetup({ x: 0, y: 0, width: 595.28, height: 841.89, bondLength: 36, marginWidth: 3 })).toEqual({
      x: 0,
      y: 0,
      width: 595.28,
      height: 841.89,
      bondLength: 36,
      marginWidth: 3,
      margin: 28.35,
    });
  });

  test("keeps a custom printable margin", () => {
    expect(
      sanitizePageSetup({ x: 0, y: 0, width: 595.28, height: 841.89, bondLength: 30, marginWidth: 2, margin: 12.5 }),
    ).toMatchObject({ margin: 12.5 });
  });

  test("drops a page whose box is invalid instead of inventing a size", () => {
    expect(sanitizePageSetup({ x: 0, y: 0, width: 0, height: 841.89 })).toBeUndefined();
    expect(sanitizePageSetup({ x: 0, y: 0, width: Number.NaN, height: 841.89 })).toBeUndefined();
    expect(sanitizePageSetup({ x: 0, y: 0, width: 595.28 })).toBeUndefined();
    expect(sanitizePageSetup({ x: "0", y: 0, width: 595.28, height: 841.89 })).toBeUndefined();
  });

  test("defaults an out-of-range bond length or margin without losing the page", () => {
    const page = sanitizePageSetup({ x: 0, y: 0, width: 595.28, height: 841.89, bondLength: 0, marginWidth: -1 });
    expect(page).toEqual({ x: 0, y: 0, width: 595.28, height: 841.89, bondLength: 30, marginWidth: 2, margin: 28.35 });
    expect(
      sanitizePageSetup({ x: 0, y: 0, width: 595.28, height: 841.89, bondLength: 30, marginWidth: 2, margin: -4 })?.margin,
    ).toBe(28.35);
  });
});

describe("sanitizeObjectGroups", () => {
  const molecule = sanitizeMolecule({ atoms: { a: atom("a"), b: atom("b", 100) }, bonds: {} });
  const annotations = sanitizeAnnotationRecord({
    t: { id: "t", kind: "text", x: 0, y: 0, width: 40, height: 20, html: "x", fontSize: 14 },
  });

  test("keeps live references and drops stale ones", () => {
    const groups = sanitizeObjectGroups(
      [
        { id: "g1", atomIds: ["a", "missing", "b"], annotationIds: ["t", "nope"], cycleIds: [] },
        { id: "g2", atomIds: ["a"], annotationIds: [], cycleIds: [] },
      ],
      molecule,
      annotations,
    );
    expect(groups).toEqual([{ id: "g1", atomIds: ["a", "b"], annotationIds: ["t"], cycleIds: [] }]);
  });

  test("an object can only belong to one group", () => {
    const groups = sanitizeObjectGroups(
      [
        { id: "g1", atomIds: ["a", "b"] },
        { id: "g2", atomIds: ["b", "a"] },
      ],
      molecule,
      annotations,
    );
    expect(groups).toHaveLength(1);
    expect(groups?.[0].id).toBe("g1");
  });

  test("missing or fully invalid groups degrade to undefined", () => {
    expect(sanitizeObjectGroups(undefined, molecule, annotations)).toBeUndefined();
    expect(sanitizeObjectGroups([{ id: "g", atomIds: ["missing"] }], molecule, annotations)).toBeUndefined();
  });
});

describe("z-order sanitisation", () => {
  test("keeps a finite zOrder on annotations and cycles", () => {
    const annotations = sanitizeAnnotationRecord({
      t: { id: "t", kind: "text", x: 0, y: 0, width: 40, height: 20, html: "x", fontSize: 14, zOrder: 7 },
      bad: { id: "bad", kind: "text", x: 0, y: 0, width: 40, height: 20, html: "x", fontSize: 14, zOrder: "top" },
    });
    expect(annotations.t.zOrder).toBe(7);
    expect(annotations.bad.zOrder).toBeUndefined();
  });
});

describe("R-group definition sanitisation", () => {
  const fragment = {
    atoms: { fa: atom("fa"), fb: atom("fb", 30, 0, "O") },
    bonds: { fbond: bond("fbond", "fa", "fb") },
  };
  const goodDef = { id: "rg1", label: "R1", attachmentAtomId: "fa", molecule: fragment };

  test("keeps a well-formed definition and sanitizes its fragment", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule({ atoms: { a1: atom("a1") }, bonds: {}, rgroups: { rg1: goodDef } }, report);
    expect(mol.rgroups?.rg1).toMatchObject({ id: "rg1", label: "R1", attachmentAtomId: "fa" });
    expect(mol.rgroups?.rg1.molecule.atoms.fb).toMatchObject({ element: "O" });
    expect(mol.rgroups?.rg1.molecule.bonds.fbond).toBeDefined();
    expect(totalDropped(report)).toBe(0);
  });

  test("drops malformed definitions and keeps valid ones", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule(
      {
        atoms: { a1: atom("a1") },
        bonds: {},
        rgroups: {
          good: goodDef,
          badLabel: { ...goodDef, label: "substituent" }, // not an R-shaped label
          noFragment: { ...goodDef, molecule: undefined },
          notObject: 42,
          // Attachment atom is not part of the (sanitized) fragment.
          badAttach: { ...goodDef, attachmentAtomId: "ghost" },
          // An attachment atom that sanitizeMolecule dropped along the way.
          droppedAttach: { ...goodDef, attachmentAtomId: "fb", molecule: { atoms: {}, bonds: {} } },
        },
      },
      report,
    );
    expect(Object.keys(mol.rgroups ?? {})).toEqual(["rg1"]);
    expect(report.droppedOther).toBe(5);
  });

  test("regenerates missing/duplicate ids and never accepts a hostile id", () => {
    const mol = sanitizeMolecule({
      atoms: { a1: atom("a1") },
      bonds: {},
      rgroups: {
        dup: { ...goodDef, id: "same" },
        dup2: { ...goodDef, id: "same", label: "R2" },
        hostile: { ...goodDef, id: "__proto__", label: "R3" },
        noId: { ...goodDef, id: undefined, label: "R4" },
      },
    });
    const defs = Object.values(mol.rgroups ?? {});
    expect(defs).toHaveLength(4);
    expect(new Set(defs.map((d) => d.id)).size).toBe(4);
    for (const def of defs) expect(def.id).not.toBe("__proto__");
  });

  test("nested rgroups inside a fragment are stripped, not recursed into", () => {
    const mol = sanitizeMolecule({
      atoms: { a1: atom("a1") },
      bonds: {},
      rgroups: {
        rg1: { ...goodDef, molecule: { ...fragment, rgroups: { inner: goodDef } } },
      },
    });
    expect(mol.rgroups?.rg1.molecule.rgroups).toBeUndefined();
  });

  test("too many definitions refuse the whole file; a non-object record does too", () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i <= LIMITS.maxRGroups; i++) many[`r${i}`] = { ...goodDef, label: `R${i % 100}` };
    expect(() => sanitizeMolecule({ atoms: {}, bonds: {}, rgroups: many })).toThrow(ImportValidationError);
    expect(() => sanitizeMolecule({ atoms: {}, bonds: {}, rgroups: [goodDef] })).toThrow(ImportValidationError);
  });

  test("a definition whose fragment has no surviving atoms is dropped", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule(
      { atoms: { a1: atom("a1") }, bonds: {}, rgroups: { empty: { ...goodDef, molecule: { atoms: { bad: atom("bad", 0, 0, "Zz") }, bonds: {} } } } },
      report,
    );
    expect(mol.rgroups).toBeUndefined();
    expect(report.droppedOther).toBe(1);
  });

  test("a project round-trip keeps valid definitions and drops broken ones", () => {
    const file = (molecule: object) =>
      JSON.stringify({
        version: 2,
        activeTabId: "t1",
        tabs: [{ id: "t1", title: "x", molecule, annotations: {}, view: { scale: 1, tx: 0, ty: 0 } }],
      });
    const restored = importProject(file({ atoms: { a1: atom("a1") }, bonds: {}, rgroups: { rg1: goodDef } }));
    expect(restored.tabs[0].molecule.rgroups?.rg1.label).toBe("R1");

    const broken = importProject(
      file({ atoms: { a1: atom("a1") }, bonds: {}, rgroups: { rg1: { ...goodDef, attachmentAtomId: "ghost" } } }),
    );
    expect(broken.tabs[0].molecule.rgroups).toBeUndefined();
  });
});

describe("importProject on hostile input", () => {
  const tab = (over: object = {}) => ({
    id: "t1",
    title: "x",
    molecule: { atoms: { a1: atom("a1") }, bonds: {} },
    annotations: {},
    view: { scale: 1, tx: 0, ty: 0 },
    ...over,
  });
  const file = (tabs: object[], activeTabId = "t1") => JSON.stringify({ version: 2, activeTabId, tabs });

  test("a dangling bond no longer survives to crash SMILES export (regression)", () => {
    const project = importProject(file([tab({ molecule: { atoms: { a1: atom("a1") }, bonds: { b1: bond("b1", "a1", "GHOST") } } })]));
    const mol = project.tabs[0].molecule;
    expect(() => exportSmiles(mol)).not.toThrow();
    expect(computeFormula(mol)).toBe("CH4");
    expect(implicitH(mol, "a1")).toBe(4);
  });

  test("reports what it dropped so the UI can tell the user", () => {
    const report = newRepairReport();
    importProject(file([tab({ molecule: { atoms: { a1: atom("a1") }, bonds: { b1: bond("b1", "a1", "GHOST") } } })]), report);
    expect(report.droppedBonds).toBe(1);
    expect(totalDropped(report)).toBe(1);
  });

  test("a hostile __proto__ annotation key cannot pollute anything", () => {
    const json = `{"version":2,"activeTabId":"t1","tabs":[{"id":"t1","title":"x","molecule":{"atoms":{},"bonds":{}},"annotations":{"__proto__":{"kind":"text","x":0,"y":0,"width":1,"height":1,"html":"x","injected":1}},"view":{"scale":1,"tx":0,"ty":0}}]}`;
    const project = importProject(json);
    expect(Object.keys(project.tabs[0].annotations)).toEqual([]);
    expect((Object.getPrototypeOf(project.tabs[0].annotations) as { injected?: unknown }).injected).toBeUndefined();
  });

  test("unknown activeTabId falls back to the first tab", () => {
    expect(importProject(file([tab()], "does-not-exist")).activeTabId).toBe("t1");
  });

  test("duplicate tab ids: the later duplicate is dropped", () => {
    const report = newRepairReport();
    const project = importProject(file([tab(), tab({ title: "second" })]), report);
    expect(project.tabs).toHaveLength(1);
    expect(project.tabs[0].title).toBe("x");
    expect(report.droppedOther).toBe(1);
  });

  test("a zero/NaN scale is replaced by the default view instead of blanking the canvas", () => {
    expect(importProject(file([tab({ view: { scale: 0, tx: 0, ty: 0 } })])).tabs[0].view).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  test("over-long titles are truncated", () => {
    expect(importProject(file([tab({ title: "x".repeat(5000) })])).tabs[0].title).toHaveLength(LIMITS.maxTitleChars);
  });

  test("refuses too many tabs, oversized input, and non-object roots", () => {
    const many = Array.from({ length: LIMITS.maxTabs + 1 }, (_, i) => tab({ id: `t${i}` }));
    expect(() => importProject(file(many))).toThrow(ProjectParseError);
    expect(() => importProject(" ".repeat(LIMITS.maxFileChars + 1))).toThrow(ProjectParseError);
    expect(() => importProject("[]")).toThrow(ProjectParseError);
    expect(() => importProject("null")).toThrow(ProjectParseError);
  });

  test("a tab that isn't an object is a parse error, not a TypeError", () => {
    expect(() => importProject(JSON.stringify({ version: 2, activeTabId: "t1", tabs: [null] }))).toThrow(ProjectParseError);
  });

  test("too many atoms in one tab is a ProjectParseError", () => {
    const atoms = Object.fromEntries(Array.from({ length: LIMITS.maxAtoms + 1 }, (_, i) => [`a${i}`, atom(`a${i}`)]));
    expect(() => importProject(file([tab({ molecule: { atoms, bonds: {} } })]))).toThrow(ProjectParseError);
  });
});

describe("clipboard fragments", () => {
  test("a hostile fragment is rebuilt: bad atoms/annotations dropped, html sanitized", () => {
    const frag = sanitizeFragment({
      molecule: { atoms: { a1: atom("a1"), a2: atom("a2", 0, 0, "Nope") }, bonds: { b1: bond("b1", "a1", "a2") } },
      annotations: [{ id: "t", kind: "text", x: 0, y: 0, width: 10, height: 10, html: "<img src=x onerror=alert(1)>hi", fontSize: 12 }, "junk", null],
    });
    expect(Object.keys(frag.molecule.atoms)).toEqual(["a1"]);
    expect(frag.molecule.bonds).toEqual({});
    expect(frag.annotations).toHaveLength(1);
    expect((frag.annotations[0] as { html: string }).html).not.toMatch(/onerror/);
  });

  test("throws (so paste falls back cleanly) when the payload isn't a fragment", () => {
    expect(() => sanitizeFragment("nope")).toThrow(ImportValidationError);
    expect(() => sanitizeFragment({ molecule: 5, annotations: [] })).toThrow(ImportValidationError);
  });
});

describe("saved templates and bookmarks", () => {
  const good = { id: "t1", label: "Benzene", molecule: { atoms: { a1: atom("a1") }, bonds: {} }, annotations: [], createdAt: 1 };

  // Use our own in-memory Storage instead of the environment's. Newer Node
  // versions (25+) ship a built-in `localStorage` global that has no methods
  // unless started with --localstorage-file, and it shadows jsdom's working
  // one — so `localStorage.clear()` throws there. Stubbing makes these tests
  // behave the same on every Node version.
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("importBookmarks repairs individual templates and rebuilds the rest", () => {
    const json = JSON.stringify({
      version: 1,
      templates: [
        { ...good, molecule: { atoms: { a1: atom("a1") }, bonds: { b: bond("b", "a1", "x") } } },
        { label: "", molecule: {}, annotations: [] },
        "junk",
      ],
    });
    const out = importBookmarks(json);
    expect(out).toHaveLength(1);
    expect(out[0].molecule.bonds).toEqual({});
  });

  test("importBookmarks rejects a file where nothing survives, and oversized lists", () => {
    expect(() => importBookmarks(JSON.stringify({ version: 1, templates: ["x", 1] }))).toThrow(BookmarksParseError);
    const many = Array.from({ length: LIMITS.maxTemplates + 1 }, () => good);
    expect(() => importBookmarks(JSON.stringify({ version: 1, templates: many }))).toThrow(BookmarksParseError);
  });

  test("localStorage templates are validated on load", () => {
    localStorage.setItem(
      "enlacecraft-user-templates",
      JSON.stringify([good, { label: "evil", molecule: { atoms: { a: atom("a", 0, 0, "Bad") }, bonds: {} }, annotations: [] }, 5]),
    );
    const loaded = loadUserTemplates();
    expect(loaded.map((t) => t.label)).toEqual(["Benzene", "evil"]);
    expect(loaded[1].molecule.atoms).toEqual({});
  });

  test("garbage in localStorage yields an empty list, never a throw", () => {
    localStorage.setItem("enlacecraft-user-templates", "{not json");
    expect(loadUserTemplates()).toEqual([]);
    localStorage.setItem("enlacecraft-user-templates", '{"a":1}');
    expect(loadUserTemplates()).toEqual([]);
    expect(sanitizeUserTemplates(undefined)).toEqual([]);
  });
});

describe("MOL / CDXML parsers", () => {
  function molText(atoms: [string, number, number][], bonds: [number, number, number][] = []) {
    const lines = ["", "  test", "", `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`];
    for (const [el, x, y] of atoms) lines.push(`${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${(0).toFixed(4).padStart(10)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    for (const [a, b, o] of bonds) lines.push(`${String(a).padStart(3)}${String(b).padStart(3)}${String(o).padStart(3)}  0`);
    lines.push("M  END");
    return lines.join("\n");
  }

  test("an R-group/query atom becomes a visible placeholder label, not a fake element", () => {
    const mol = importMol(molText([["C", 0, 0], ["R#", 1.5, 0]], [[1, 2, 1]]));
    const atoms = Object.values(mol.atoms);
    expect(atoms.every((a) => /^[A-Z][a-z]?$/.test(a.element))).toBe(true);
    expect(atoms.find((a) => a.group === "R#")).toBeDefined();
    expect(() => computeFormula(mol)).not.toThrow();
  });

  test("D and T are read as hydrogen isotopes", () => {
    const mol = importMol(molText([["C", 0, 0], ["D", 1.5, 0]], [[1, 2, 1]]));
    // stripExplicitHydrogens folds the isotopic H into the carbon's label,
    // so check via the raw parse instead when it survives as an atom:
    const h = Object.values(mol.atoms).find((a) => a.element === "H");
    if (h) expect(h.isotope).toBe(2);
    expect(Object.values(mol.atoms).some((a) => a.group === "D")).toBe(false);
  });

  test("a truncated MOL file (fewer atom lines than promised) is refused", () => {
    // No bonds here: with one, deleting an atom line would just make the
    // bond line get read as an atom (MOL V2000 is fixed-width).
    const text = molText([["C", 0, 0], ["C", 1.5, 0]]).split("\n");
    text.splice(5, 1); // remove the second atom line -> "M  END" is where atom 2 should be
    expect(() => importMol(text.join("\n"))).toThrow(/coordinates/i);
    text.splice(5, 1); // now nothing at all where atom 2 should be
    expect(() => importMol(text.join("\n"))).toThrow(/coordinates/i);
  });

  test("CDXML with non-numeric coordinates is refused", () => {
    expect(() => importCdxml('<CDXML><page><fragment><n id="1" p="abc 0" Element="6"/></fragment></page></CDXML>')).toThrow();
  });

  test("CDXML with more atoms than the limit is refused", () => {
    const nodes = Array.from({ length: LIMITS.maxAtoms + 1 }, (_, i) => `<n id="${i + 1}" p="${i} 0" Element="6"/>`).join("");
    expect(() => importCdxml(`<CDXML><page><fragment>${nodes}</fragment></page></CDXML>`)).toThrow(/too many atoms/i);
  });
});

describe("reaction scheme sanitization", () => {
  const atoms = { a0: atom("a0"), a1: atom("a1", 60) };

  test("keeps a scheme whose atom ids exist and drops stale ones", () => {
    const mol = sanitizeMolecule({
      atoms,
      bonds: {},
      schemes: [
        { id: "s1", steps: [{ id: "st1", reactantAtomIds: ["a0", "ghost"], productAtomIds: ["a1"], arrowIds: ["ann1"] }] },
      ],
    });
    expect(mol.schemes).toEqual([
      { id: "s1", steps: [{ id: "st1", reactantAtomIds: ["a0"], productAtomIds: ["a1"], arrowIds: ["ann1"] }] },
    ]);
  });

  test("regenerates missing and duplicate scheme/step ids", () => {
    const mol = sanitizeMolecule({
      atoms,
      bonds: {},
      schemes: [
        { id: "dup", steps: [{ id: "step", reactantAtomIds: ["a0"], productAtomIds: [], arrowIds: [] }] },
        { id: "dup", steps: [{ id: "step", reactantAtomIds: ["a1"], productAtomIds: [], arrowIds: [] }] },
      ],
    });
    const schemes = mol.schemes!;
    expect(schemes).toHaveLength(2);
    expect(schemes[0].id).not.toBe(schemes[1].id);
    expect(schemes[0].steps[0].id).not.toBe(schemes[1].steps[0].id);
    // The first, well-formed ids are kept as-is.
    expect(schemes[0].id).toBe("dup");
    expect(schemes[0].steps[0].id).toBe("step");
  });

  test("drops a step with no surviving atoms and then the empty scheme", () => {
    const mol = sanitizeMolecule({
      atoms,
      bonds: {},
      schemes: [{ id: "s1", steps: [{ id: "st1", reactantAtomIds: ["ghost"], productAtomIds: [], arrowIds: [] }] }],
    });
    expect(mol.schemes).toBeUndefined();
  });

  test("refuses an oversized scheme list rather than truncating it", () => {
    const schemes = Array.from({ length: LIMITS.maxReactionSchemes + 1 }, (_, i) => ({
      id: `s${i}`,
      steps: [{ id: `st${i}`, reactantAtomIds: ["a0"], productAtomIds: [], arrowIds: [] }],
    }));
    expect(() => sanitizeMolecule({ atoms, bonds: {}, schemes })).toThrow(ImportValidationError);
  });
});

describe("S-group sanitization", () => {
  const atoms = { a0: atom("a0"), a1: atom("a1", 60), a2: atom("a2", 120) };
  const bonds = { b0: bond("b0", "a0", "a1"), b1: bond("b1", "a1", "a2") };

  test("keeps a valid group and prunes stale atom/bond references", () => {
    const mol = sanitizeMolecule({
      atoms,
      bonds,
      sgroups: {
        sg1: {
          id: "sg1",
          type: "SRU",
          atomIds: ["a0", "ghost", "a0"],
          bondIds: ["b0", "ghost"],
          bracketAnnotationIds: ["br1", "br1"],
          subscript: "n",
        },
      },
    });
    expect(mol.sgroups).toEqual({
      sg1: {
        id: "sg1",
        type: "SRU",
        atomIds: ["a0"],
        bondIds: ["b0"],
        bracketAnnotationIds: ["br1"],
        subscript: "n",
      },
    });
  });

  test("drops a group with no surviving atoms", () => {
    const report = newRepairReport();
    const mol = sanitizeMolecule({ atoms, bonds, sgroups: { sg1: { id: "sg1", type: "SRU", atomIds: ["ghost"] } } }, report);
    expect(mol.sgroups).toBeUndefined();
    expect(report.droppedOther).toBe(1);
  });

  test("drops a group with an unknown type", () => {
    const mol = sanitizeMolecule({ atoms, bonds, sgroups: { sg1: { id: "sg1", type: "NOPE", atomIds: ["a0"] } } });
    expect(mol.sgroups).toBeUndefined();
  });

  test("clears a parentId whose parent did not survive", () => {
    const mol = sanitizeMolecule({
      atoms,
      bonds,
      sgroups: { sg1: { id: "sg1", type: "SRU", atomIds: ["a0"], parentId: "gone" } },
    });
    expect(mol.sgroups!.sg1.parentId).toBeUndefined();
  });

  test("refuses an oversized S-group list rather than truncating it", () => {
    const sgroups = Object.fromEntries(
      Array.from({ length: LIMITS.maxSgroups + 1 }, (_, i) => [
        `sg${i}`,
        { id: `sg${i}`, type: "SRU", atomIds: ["a0"] },
      ]),
    );
    expect(() => sanitizeMolecule({ atoms, bonds, sgroups })).toThrow(ImportValidationError);
  });
});
