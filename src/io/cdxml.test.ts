// @vitest-environment jsdom
//
// importCdxml() parses with the browser's DOMParser, which doesn't exist
// under plain Node — this file needs the jsdom environment (see
// vitest.config.ts's default "node" environment, overridden per-file here)
// while valence.test.ts/molfile.test.ts stay on the faster default.
import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { exportCdxml, exportCdxmlDocument, importCdxml, importCdxmlDocument } from "./cdxml";
import type { ArrowAnnotation, BracketAnnotation, Molecule, ShapeAnnotation, TextAnnotation } from "../types/chemistry";

function dist(mol: Molecule, id1: string, id2: string): number {
  const a = mol.atoms[id1];
  const b = mol.atoms[id2];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("exportCdxml / importCdxml round-trip", () => {
  test("atom and bond counts, and elements, survive a round trip", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "N");
    mol = addBond(mol, "b0", "a0", "a1");

    const roundTripped = importCdxml(exportCdxml(mol));
    const elements = Object.values(roundTripped.atoms).map((a) => a.element).sort();

    expect(Object.keys(roundTripped.atoms)).toHaveLength(2);
    expect(Object.keys(roundTripped.bonds)).toHaveLength(1);
    expect(elements).toEqual(["C", "N"]);
  });

  test("bond orders survive (single, double, triple)", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 84, y: 0 }, "N");
    mol = addBond(mol, "b0", "a0", "a1", 2);
    mol = addBond(mol, "b1", "a1", "a2", 3);

    const roundTripped = importCdxml(exportCdxml(mol));
    const orders = Object.values(roundTripped.bonds).map((b) => b.order).sort();
    expect(orders).toEqual([2, 3]);
  });

  test("formal charge survives", () => {
    let mol = addAtom(emptyMolecule(), "n1", { x: 0, y: 0 }, "N");
    mol = { ...mol, atoms: { ...mol.atoms, n1: { ...mol.atoms.n1, charge: 1 } } };

    const roundTripped = importCdxml(exportCdxml(mol));
    expect(Object.values(roundTripped.atoms)[0].charge).toBe(1);
  });

  test("wedge stereo survives and forces bond order to 1", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 1, "wedge");

    const roundTripped = importCdxml(exportCdxml(mol));
    const bond = Object.values(roundTripped.bonds)[0];
    expect(bond.stereo).toBe("wedge");
    expect(bond.order).toBe(1);
  });

  test("bold and dashed bond styles round-trip through CDX's Bold/Dash Display values", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 84, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 1, "bold");
    mol = addBond(mol, "b1", "a1", "a2", 1, "dashed");

    const xml = exportCdxml(mol);
    expect(xml).toContain('Display="Bold"');
    expect(xml).toContain('Display="Dash"');
    const roundTripped = importCdxml(xml);
    const stereos = Object.values(roundTripped.bonds).map((b) => b.stereo).sort();
    expect(stereos).toEqual(["bold", "dashed"]);
  });

  test("a ChemDraw Bold Display bond imports as the bold bond style", () => {
    const doc = importCdxmlDocument(
      `<CDXML BondLength="30"><page><fragment>` +
      `<n id="1" p="0 0" Element="6"/><n id="2" p="30 0" Element="6"/>` +
      `<b id="3" B="1" E="2" Order="1" Display="Bold"/>` +
      `</fragment></page></CDXML>`
    );
    const bond = Object.values(doc.molecule.bonds)[0];
    expect(bond.stereo).toBe("bold");
  });

  test("an abbreviated-group atom exports as its plain base element (group label is dropped)", () => {
    // Documented behavior (see cdxml.ts's file doc comment): CDX's own
    // "nickname" node schema isn't implemented, so Ph/Boc/etc. round-trip
    // as a bare carbon rather than failing or silently mislabeling.
    const mol = addAtom(emptyMolecule(), "g1", { x: 0, y: 0 }, "C", "Ph");
    const roundTripped = importCdxml(exportCdxml(mol));
    const atom = Object.values(roundTripped.atoms)[0];
    expect(atom.element).toBe("C");
    expect(atom.group).toBeUndefined();
  });

  test("self-calibration scales an imported geometry onto this app's BOND_LEN", () => {
    // Two heavy atoms 42 raw units apart (an arbitrary "foreign" unit, not
    // assumed to mean anything) should come back exactly BOND_LEN apart in
    // this app's own coordinate space, whatever BOND_LEN happens to be —
    // this exercises the same self-calibration path real imported
    // ChemDraw/other-tool files rely on, without hard-coding BOND_LEN here.
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1");

    const roundTripped = importCdxml(exportCdxml(mol));
    const [id1, id2] = Object.keys(roundTripped.atoms);
    expect(dist(roundTripped, id1, id2)).toBeCloseTo(dist(mol, "a0", "a1"), 1);
  });

  test("a dative bond is omitted rather than exported as a plain covalent bond", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "N");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "Fe");
    mol = addBond(mol, "b0", "a0", "a1");
    mol.bonds["b0"] = { ...mol.bonds["b0"], dative: true };

    const xml = exportCdxml(mol);
    expect(xml).not.toContain("<b ");

    const roundTripped = importCdxml(xml);
    expect(Object.keys(roundTripped.bonds)).toHaveLength(0);
    expect(Object.keys(roundTripped.atoms)).toHaveLength(2);
  });
});

describe("importCdxml: CDX-specific value mapping", () => {
  function cdxml(atoms: string, bonds: string): string {
    return `<?xml version="1.0" encoding="UTF-8" ?>
<CDXML>
<page><fragment id="1">
${atoms}
${bonds}
</fragment></page>
</CDXML>`;
  }

  test("a delocalized/aromatic bond order (1.5) is approximated as a double bond", () => {
    const text = cdxml(
      `<n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/>`,
      `<b id="3" B="1" E="2" Order="1.5"/>`
    );
    const mol = importCdxml(text);
    expect(Object.values(mol.bonds)[0].order).toBe(2);
  });

  test("Order values at/above 2.5 round to a triple bond", () => {
    const text = cdxml(
      `<n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/>`,
      `<b id="3" B="1" E="2" Order="2.5"/>`
    );
    const mol = importCdxml(text);
    expect(Object.values(mol.bonds)[0].order).toBe(3);
  });

  test("a non-numeric query bond order (e.g. a value list) falls back to a single bond", () => {
    const text = cdxml(
      `<n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/>`,
      `<b id="3" B="1" E="2" Order="1 2"/>`
    );
    const mol = importCdxml(text);
    expect(Object.values(mol.bonds)[0].order).toBe(1);
  });

  test('a "WedgeBegin" bond keeps the B node as the model\'s narrow end (a1)', () => {
    const text = cdxml(
      `<n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="7"/>`,
      `<b id="3" B="1" E="2" Order="1" Display="WedgeBegin"/>`
    );
    const mol = importCdxml(text);
    const bond = Object.values(mol.bonds)[0];
    expect(mol.atoms[bond.a1].element).toBe("C"); // B node
    expect(mol.atoms[bond.a2].element).toBe("N"); // E node
  });

  test('a "WedgeEnd" bond swaps so the E node becomes the model\'s narrow end (a1)', () => {
    const text = cdxml(
      `<n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="7"/>`,
      `<b id="3" B="1" E="2" Order="1" Display="WedgeEnd"/>`
    );
    const mol = importCdxml(text);
    const bond = Object.values(mol.bonds)[0];
    expect(mol.atoms[bond.a1].element).toBe("N"); // E node, swapped to narrow end
    expect(mol.atoms[bond.a2].element).toBe("C"); // B node
  });

  test("an atom with no Element attribute defaults to carbon (CDX's implicit default)", () => {
    const text = cdxml(`<n id="1" p="0 0"/>`, "");
    const mol = importCdxml(text);
    expect(Object.values(mol.atoms)[0].element).toBe("C");
  });

  test("malformed XML raises an error rather than silently returning an empty molecule", () => {
    expect(() => importCdxml("<CDXML><n unterminated")).toThrow("Not a valid CDXML file");
  });
});

describe("importCdxmlDocument: arrows", () => {
  /** A page with one calibrated bond (42 raw units apart, the CDXML
   * convention) plus `extra` page-level XML, so arrow coordinates can be
   * asserted relative to the bond length without hard-coding BOND_LEN. */
  function pageWithBond(extra: string): string {
    return `<?xml version="1.0" encoding="UTF-8" ?>
<CDXML>
<page>
<fragment id="1"><n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/><b id="3" B="1" E="2"/></fragment>
${extra}
</page>
</CDXML>`;
  }

  test('a Head-only line imports as a forward reaction arrow pointing at the head end', () => {
    const doc = importCdxmlDocument(pageWithBond(`<graphic id="4" BoundingBox="0 20 84 20" GraphicType="Line" Head="FullHalfHead" Tail="None"/>`));
    expect(doc.annotations).toHaveLength(1);
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.kind).toBe("arrow");
    expect(arrow.variant).toBe("forward");
    // Calibrated: 84 raw units = two bond lengths; the tail sits where the
    // arrow starts (x1 < x2 = pointing right).
    expect(arrow.x1).toBeCloseTo(0, 1);
    expect(arrow.x2).toBeCloseTo(2 * 42, 1);
    expect(arrow.y1).toBeCloseTo(arrow.y2, 1);
  });

  test('a Tail-only full head reverses the arrow direction', () => {
    const doc = importCdxmlDocument(pageWithBond(`<graphic id="4" BoundingBox="0 20 84 20" GraphicType="Line" Head="None" Tail="FullHalfHead"/>`));
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.variant).toBe("forward");
    expect(arrow.x1).toBeCloseTo(2 * 42, 1); // head (the pointed end) at the left
    expect(arrow.x2).toBeCloseTo(0, 1);
  });

  test('full heads on both ends import as a resonance arrow', () => {
    const doc = importCdxmlDocument(pageWithBond(`<graphic id="4" BoundingBox="0 20 84 20" GraphicType="Line" Head="FullHalfHead" Tail="FullHalfHead"/>`));
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.variant).toBe("resonance");
  });

  test('two antiparallel harpoons collapse into a single equilibrium arrow', () => {
    const doc = importCdxmlDocument(pageWithBond(
      `<graphic id="4" BoundingBox="0 20 84 20" GraphicType="Line" Head="HalfHead" Tail="None"/>` +
      `<graphic id="5" BoundingBox="0 24 84 24" GraphicType="Line" Head="None" Tail="HalfHead"/>`
    ));
    expect(doc.annotations).toHaveLength(1);
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.variant).toBe("equilibrium");
  });

  test('a lone harpoon falls back to a forward arrow rather than being dropped', () => {
    const doc = importCdxmlDocument(pageWithBond(`<graphic id="4" BoundingBox="0 20 84 20" GraphicType="Line" Head="HalfHead" Tail="None"/>`));
    expect(doc.annotations).toHaveLength(1);
    expect((doc.annotations[0] as ArrowAnnotation).variant).toBe("forward");
  });

  test('a plain headless line imports as a line shape (no invented arrowhead)', () => {
    const doc = importCdxmlDocument(pageWithBond(`<graphic id="4" BoundingBox="0 20 84 20" GraphicType="Line"/>`));
    expect(doc.annotations).toHaveLength(1);
    const shape = doc.annotations[0] as ShapeAnnotation;
    expect(shape.kind).toBe("shape");
    expect(shape.variant).toBe("line");
  });

  test('an arc with a HalfHead imports as a curved fishhook arrow', () => {
    const doc = importCdxmlDocument(pageWithBond(`<graphic id="4" BoundingBox="0 0 40 40" GraphicType="Arc" Head="HalfHead" Tail="None"/>`));
    expect(doc.annotations).toHaveLength(1);
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.variant).toBe("curved");
    expect(arrow.barb).toBe("single");
    expect(arrow.curvature).toBeGreaterThan(0);
  });

  test("ChemDraw's dedicated <arrow> element imports as a forward arrow", () => {
    const doc = importCdxmlDocument(pageWithBond(`<arrow id="4" x1="0" y1="30" x2="90" y2="30"/>`));
    expect(doc.annotations).toHaveLength(1);
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.variant).toBe("forward");
    expect(arrow.x1).toBeLessThan(arrow.x2);
  });
});

describe("importCdxmlDocument: text and brackets", () => {
  function page(extra: string): string {
    return `<?xml version="1.0" encoding="UTF-8" ?>
<CDXML>
<page>
<fragment id="1">${extra}</fragment>
</page>
</CDXML>`;
  }

  test('a top-level caption imports as a text annotation with styling and scaled position', () => {
    const doc = importCdxmlDocument(page(
      `<t id="2" p="10 60"><s font="3" size="12" face="1">Hi</s><s face="64">+</s><s font="3" size="12"> and </s><s face="32">2</s></t>`
    ));
    expect(doc.annotations).toHaveLength(1);
    const text = doc.annotations[0] as TextAnnotation;
    expect(text.kind).toBe("text");
    expect(text.x).toBeCloseTo(10 * (42 / 30), 1); // no bonds in file → CDXML default bond length calibration
    expect(text.y).toBeCloseTo(60 * (42 / 30), 1);
    expect(text.html).toContain("<b>Hi</b>");
    expect(text.html).toContain("<sup>+</sup>");
    expect(text.html).toContain("<sub>2</sub>");
    // 12 pt through the units-per-point bridge at the default calibration.
    expect(text.fontSize).toBeCloseTo(12 * (100 / 72) * (42 / 30), 1);
  });

  test('a caption with no style runs still imports (hand-written files)', () => {
    const doc = importCdxmlDocument(page(`<t id="2" p="5 5">Reaction conditions</t>`));
    expect(doc.annotations).toHaveLength(1);
    expect((doc.annotations[0] as TextAnnotation).html).toBe("Reaction conditions");
  });

  test('a <t> nested inside a node is an atom label, not a caption', () => {
    const doc = importCdxmlDocument(page(`<n id="1" p="0 0" Element="6"><t id="2" p="0 0"><s font="3" size="10">OCH3</s></t></n>`));
    expect(Object.keys(doc.molecule.atoms)).toHaveLength(1);
    expect(doc.annotations).toHaveLength(0);
  });

  test('newlines inside a caption become line breaks', () => {
    const doc = importCdxmlDocument(page(`<t id="2" p="5 5"><s font="3" size="10">A\nB</s></t>`));
    const text = doc.annotations[0] as TextAnnotation;
    expect(text.html).toContain("<br>");
  });

  test('a narrow bracket graphic imports as one open-facing glyph', () => {
    const doc = importCdxmlDocument(page(`<graphic id="2" BoundingBox="10 20 20 110" GraphicType="Bracket"/>`));
    expect(doc.annotations).toHaveLength(1);
    const bracket = doc.annotations[0] as BracketAnnotation;
    expect(bracket.variant).toBe("square");
    expect(bracket.facing).toBe("open");
  });

  test('a spanning bracket graphic (ChemDraw\'s two-sided object) imports as an open+close pair', () => {
    const doc = importCdxmlDocument(page(`<graphic id="2" BoundingBox="10 20 160 110" GraphicType="Bracket"/>`));
    expect(doc.annotations).toHaveLength(2);
    const facings = doc.annotations.map((a) => (a as BracketAnnotation).facing);
    expect(facings).toEqual(["open", "close"]);
    const open = doc.annotations[0] as BracketAnnotation;
    expect(open.x).toBeLessThan((doc.annotations[1] as BracketAnnotation).x);
  });

  test('Brace graphics import as curly braces (narrow glyph and spanning pair)', () => {
    const narrow = importCdxmlDocument(page(`<graphic id="2" BoundingBox="10 20 20 110" GraphicType="Brace"/>`));
    expect(narrow.annotations).toHaveLength(1);
    const glyph = narrow.annotations[0] as BracketAnnotation;
    expect(glyph.variant).toBe("curly");
    expect(glyph.facing).toBe("open");

    const spanning = importCdxmlDocument(page(`<graphic id="2" BoundingBox="10 20 160 110" GraphicType="Brace"/>`));
    expect(spanning.annotations).toHaveLength(2);
    expect(spanning.annotations.map((a) => (a as BracketAnnotation).variant)).toEqual(["curly", "curly"]);
    expect(spanning.annotations.map((a) => (a as BracketAnnotation).facing)).toEqual(["open", "close"]);
  });
});

describe("exportCdxmlDocument / importCdxmlDocument round-trip", () => {
  function sampleAnnotations() {
    const forward: ArrowAnnotation = { id: "a1", kind: "arrow", x1: 0, y1: 0, x2: 120, y2: 0, variant: "forward" };
    const resonance: ArrowAnnotation = { id: "a2", kind: "arrow", x1: 0, y1: 60, x2: 120, y2: 60, variant: "resonance" };
    const equilibrium: ArrowAnnotation = { id: "a3", kind: "arrow", x1: 0, y1: 120, x2: 120, y2: 120, variant: "equilibrium" };
    const curved: ArrowAnnotation = { id: "a4", kind: "arrow", x1: 0, y1: 180, x2: 60, y2: 210, variant: "curved", curvature: 15, barb: "single" };
    const text: TextAnnotation = { id: "t1", kind: "text", x: 30, y: 30, width: 120, height: 24, html: "<b>A</b> + B", fontSize: 14 };
    const openBracket: BracketAnnotation = { id: "b1", kind: "bracket", x: 200, y: 20, width: 16, height: 90, variant: "square", facing: "open" };
    const closeBracket: BracketAnnotation = { id: "b2", kind: "bracket", x: 320, y: 20, width: 16, height: 90, variant: "square", facing: "close" };
    return { forward, resonance, equilibrium, curved, text, openBracket, closeBracket, all: [forward, resonance, equilibrium, curved, text, openBracket, closeBracket] };
  }

  test("arrow variants, caption text and bracket pairs survive a save/open cycle", () => {
    const sample = sampleAnnotations();
    const xml = exportCdxmlDocument(emptyMolecule(), sample.all);

    // Curved arrows are deliberately not exported (see cdxml.ts's doc
    // comment) — everything else is.
    expect(xml).not.toContain('GraphicType="Arc"');
    expect(xml).toContain('GraphicType="Line"');
    expect(xml).toContain("<t ");

    const doc = importCdxmlDocument(xml);
    const arrows = doc.annotations.filter((a): a is ArrowAnnotation => a.kind === "arrow");
    const texts = doc.annotations.filter((a): a is TextAnnotation => a.kind === "text");
    const brackets = doc.annotations.filter((a): a is BracketAnnotation => a.kind === "bracket");

    // forward + resonance + equilibrium; the curved arrow was dropped.
    expect(arrows.map((a) => a.variant).sort()).toEqual(["equilibrium", "forward", "resonance"]);
    const forward = arrows.find((a) => a.variant === "forward")!;
    expect(forward.x2).toBeCloseTo(120, 0); // px → units → px is exact at the default calibration
    expect(forward.y1).toBeCloseTo(0, 0);

    expect(texts).toHaveLength(1);
    expect(texts[0].html).toBe("<b>A</b> + B");
    expect(texts[0].fontSize).toBeCloseTo(14, 0);
    expect(texts[0].x).toBeCloseTo(30, 0);

    // The open+close pair re-imports as… an open+close pair, in that order.
    expect(brackets.map((b) => b.facing)).toEqual(["open", "close"]);
  });

  test("equilibrium exports as two harpoons that re-pair on import", () => {
    const sample = sampleAnnotations();
    const xml = exportCdxmlDocument(emptyMolecule(), [sample.equilibrium]);
    expect(xml.match(/Head="HalfHead"/g)).toHaveLength(2);
    const doc = importCdxmlDocument(xml);
    expect(doc.annotations).toHaveLength(1);
    expect((doc.annotations[0] as ArrowAnnotation).variant).toBe("equilibrium");
  });

  test("a curly brace pair exports as a spanning Brace graphic and re-imports as curly", () => {
    // CDX has only two bracket types (Bracket = square, Brace = the curved
    // glyph), so curly braces and parens both write as Brace and both come
    // back as curly — the round trip is variant-stable for curly, and a
    // drawn paren re-opens as its visually-adjacent curved glyph.
    const open: BracketAnnotation = { id: "b1", kind: "bracket", x: 200, y: 20, width: 16, height: 90, variant: "curly", facing: "open" };
    const close: BracketAnnotation = { id: "b2", kind: "bracket", x: 320, y: 20, width: 16, height: 90, variant: "curly", facing: "close" };
    const xml = exportCdxmlDocument(emptyMolecule(), [open, close]);
    expect(xml).toContain('GraphicType="Brace"');
    const doc = importCdxmlDocument(xml);
    expect(doc.annotations).toHaveLength(2);
    expect(doc.annotations.map((a) => (a as BracketAnnotation).variant)).toEqual(["curly", "curly"]);
    expect(doc.annotations.map((a) => (a as BracketAnnotation).facing)).toEqual(["open", "close"]);
  });

  test("a retrosynthetic arrow exports with CDX's RetroSynthetic head and re-imports as retrosynthetic", () => {
    const retro: ArrowAnnotation = { id: "a9", kind: "arrow", x1: 0, y1: 0, x2: 90, y2: 0, variant: "retrosynthetic" };
    const xml = exportCdxmlDocument(emptyMolecule(), [retro]);
    expect(xml).toContain('Head="RetroSynthetic"');
    const doc = importCdxmlDocument(xml);
    expect(doc.annotations).toHaveLength(1);
    const back = doc.annotations[0] as ArrowAnnotation;
    expect(back.kind).toBe("arrow");
    expect(back.variant).toBe("retrosynthetic");
    expect(back.x2).toBeCloseTo(90, 0);
  });

  test("a ChemDraw-written RetroSynthetic head line imports as a retrosynthetic arrow", () => {
    const doc = importCdxmlDocument(
      `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page><fragment id="1"><n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/><b id="3" B="1" E="2"/></fragment>` +
      `<graphic id="4" BoundingBox="0 30 90 30" GraphicType="Line" Head="RetroSynthetic" Tail="None"/></page></CDXML>`
    );
    expect(doc.annotations).toHaveLength(1);
    expect((doc.annotations[0] as ArrowAnnotation).variant).toBe("retrosynthetic");
  });

  test("rectangle and oval graphics import as shape annotations", () => {
    const doc = importCdxmlDocument(
      `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page><fragment id="1"><n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/><b id="3" B="1" E="2"/></fragment>` +
      `<graphic id="4" BoundingBox="10 10 90 60" GraphicType="Rectangle"/>` +
      `<graphic id="5" BoundingBox="100 10 160 70" GraphicType="Oval"/></page></CDXML>`
    );
    expect(doc.annotations).toHaveLength(2);
    const rect = doc.annotations[0] as ShapeAnnotation;
    const oval = doc.annotations[1] as ShapeAnnotation;
    expect(rect.kind).toBe("shape");
    expect(rect.variant).toBe("rectangle");
    expect(oval.variant).toBe("ellipse");
  });

  test("shape annotations export and re-import round-trip", () => {
    const rect: ShapeAnnotation = { id: "s1", kind: "shape", x: 20, y: 30, width: 80, height: 50, variant: "rectangle" };
    const oval: ShapeAnnotation = { id: "s2", kind: "shape", x: 120, y: 30, width: 60, height: 60, variant: "ellipse" };
    const line: ShapeAnnotation = { id: "s3", kind: "shape", x: 10, y: 100, width: 90, height: 0, variant: "line" };
    const xml = exportCdxmlDocument(emptyMolecule(), [rect, oval, line]);
    expect(xml).toContain('GraphicType="Rectangle"');
    expect(xml).toContain('GraphicType="Oval"');
    const doc = importCdxmlDocument(xml);
    const shapes = doc.annotations.filter((a): a is ShapeAnnotation => a.kind === "shape");
    expect(shapes.map((s) => s.variant).sort()).toEqual(["ellipse", "line", "rectangle"]);
    const backRect = shapes.find((s) => s.variant === "rectangle")!;
    expect(backRect.x).toBeCloseTo(20, 0);
    expect(backRect.width).toBeCloseTo(80, 0);
    const backLine = shapes.find((s) => s.variant === "line")!;
    expect(backLine.height).toBeCloseTo(0, 0);
  });

  test("underlined caption text round-trips through CDX's underline face bit", () => {
    const text: TextAnnotation = { id: "t2", kind: "text", x: 30, y: 30, width: 140, height: 24, html: "<u>see refs</u>", fontSize: 14 };
    const xml = exportCdxmlDocument(emptyMolecule(), [text]);
    expect(xml).toContain('face="4"');
    const doc = importCdxmlDocument(xml);
    const texts = doc.annotations.filter((a): a is TextAnnotation => a.kind === "text");
    expect(texts).toHaveLength(1);
    expect(texts[0].html).toBe("<u>see refs</u>");
  });

  test("plain exportCdxml (molecule only) writes no graphics or text", () => {
    const xml = exportCdxml(emptyMolecule());
    expect(xml).not.toContain("GraphicType");
    expect(xml).not.toContain("<t ");
  });
});
