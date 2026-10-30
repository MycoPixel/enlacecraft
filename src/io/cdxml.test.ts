// @vitest-environment jsdom
//
// importCdxml() parses with the browser's DOMParser, which doesn't exist
// under plain Node — this file needs the jsdom environment (see
// vitest.config.ts's default "node" environment, overridden per-file here)
// while valence.test.ts/molfile.test.ts stay on the faster default.
import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule, setAtomCustomGroup } from "../model/molecule";
import { exportCdxml, exportCdxmlDocument, importCdxml, importCdxmlDocument } from "./cdxml";
import chemdrawScheme from "./fixtures/chemdraw-scheme.cdxml?raw";
import rdkitSgroups from "./fixtures/rdkit-sgroups.cdxml?raw";
import { A4_PAGE_HEIGHT, A4_PAGE_WIDTH } from "../model/pageSetup";
import type { ArrowAnnotation, BracketAnnotation, Molecule, OrbitalAnnotation, ShapeAnnotation, TextAnnotation, TlcPlateAnnotation } from "../types/chemistry";

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

  test("isotope mass number round-trips through CDX's Isotope property", () => {
    let mol = addAtom(emptyMolecule(), "c1", { x: 0, y: 0 }, "C");
    mol = { ...mol, atoms: { ...mol.atoms, c1: { ...mol.atoms.c1, isotope: 13 } } };
    const xml = exportCdxml(mol);
    expect(xml).toContain('Isotope="13"');
    expect(Object.values(importCdxml(xml).atoms)[0].isotope).toBe(13);
  });

  test("a radical dot round-trips as CDX's doublet Radical value", () => {
    let mol = addAtom(emptyMolecule(), "o1", { x: 0, y: 0 }, "O");
    mol = { ...mol, atoms: { ...mol.atoms, o1: { ...mol.atoms.o1, radical: true } } };
    const xml = exportCdxml(mol);
    expect(xml).toContain('Radical="2"');
    expect(Object.values(importCdxml(xml).atoms)[0].radical).toBe(true);
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

  test("an abbreviated-group atom round-trips through a CDX nickname node", () => {
    const mol = addAtom(emptyMolecule(), "g1", { x: 0, y: 0 }, "C", "Ph");
    const xml = exportCdxml(mol);
    expect(xml).toContain('NodeType="Nickname"');
    expect(xml).toContain(">Ph</s>");
    const atom = Object.values(importCdxml(xml).atoms)[0];
    expect(atom.element).toBe("C");
    expect(atom.group).toBe("Ph");
  });

  test("a free-typed formula round-trips as a labeled node", () => {
    const mol = setAtomCustomGroup(addAtom(emptyMolecule(), "g1", { x: 0, y: 0 }, "C"), "g1", "COOH", "COOH");
    const xml = exportCdxml(mol);
    expect(xml).toContain('NodeType="Unspecified"');
    const atom = Object.values(importCdxml(xml).atoms)[0];
    expect(atom.group).toBe("COOH");
    expect(atom.groupFormula).toBe("COOH");
  });

  test("a placeholder label round-trips as a generic group", () => {
    const mol = setAtomCustomGroup(addAtom(emptyMolecule(), "g1", { x: 0, y: 0 }, "C"), "g1", "R1", undefined);
    const atom = Object.values(importCdxml(exportCdxml(mol)).atoms)[0];
    expect(atom.group).toBe("R1");
    expect(atom.groupFormula).toBeUndefined();
  });

  test("disconnected structures export as separate fragments and re-import as one molecule", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "O");
    mol = addBond(mol, "b0", "a0", "a1");
    mol = addAtom(mol, "a2", { x: 0, y: 80 }, "C");
    mol = addAtom(mol, "a3", { x: 42, y: 80 }, "N");
    mol = addBond(mol, "b1", "a2", "a3");
    mol = addAtom(mol, "a4", { x: 120, y: 120 }, "Na");

    const xml = exportCdxml(mol);
    expect(xml.match(/<fragment /g)).toHaveLength(3);

    const roundTripped = importCdxml(xml);
    expect(Object.keys(roundTripped.atoms)).toHaveLength(5);
    expect(Object.keys(roundTripped.bonds)).toHaveLength(2);
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

  test("boldDouble bond stereo round-trips", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 2, "boldDouble");

    const roundTripped = importCdxml(exportCdxml(mol));
    const bond = Object.values(roundTripped.bonds)[0];
    expect(bond.stereo).toBe("boldDouble");
    expect(bond.order).toBe(2);
  });

  test("dashedDouble bond stereo round-trips", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 2, "dashedDouble");

    const roundTripped = importCdxml(exportCdxml(mol));
    const bond = Object.values(roundTripped.bonds)[0];
    expect(bond.stereo).toBe("dashedDouble");
    expect(bond.order).toBe(2);
  });

  test("hollowWedge bond stereo round-trips", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 1, "hollowWedge");

    const roundTripped = importCdxml(exportCdxml(mol));
    const bond = Object.values(roundTripped.bonds)[0];
    expect(bond.stereo).toBe("hollowWedge");
    expect(bond.order).toBe(1);
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

describe("importCdxml: labeled nodes and attachment markers", () => {
  function page(body: string): string {
    return `<CDXML BondLength="30"><page><fragment id="1">${body}</fragment></page></CDXML>`;
  }

  test("a nickname node imports as a group, not as its definition fragment's atoms", () => {
    const doc = importCdxmlDocument(page(
      `<n id="1" p="0 0" Element="6"/>` +
      `<n id="2" p="30 0" NodeType="Nickname">` +
      `<t id="3" p="30 0"><s font="3" size="10">Ph</s></t>` +
      // ChemDraw stores the abbreviation's expansion here. Those nodes are
      // definition-only and must not become atoms of their own.
      `<fragment id="4"><n id="5" p="0 0" Element="6"/><n id="6" p="30 0" Element="6"/><b id="7" B="5" E="6"/></fragment>` +
      `</n>` +
      `<b id="8" B="1" E="2"/>`
    ));
    expect(Object.keys(doc.molecule.atoms)).toHaveLength(2);
    expect(Object.keys(doc.molecule.bonds)).toHaveLength(1);
    const group = Object.values(doc.molecule.atoms).find((a) => a.group);
    expect(group?.group).toBe("Ph");
  });

  test("a numeric NodeType and a formula label map onto groupFormula", () => {
    const doc = importCdxmlDocument(page(
      `<n id="1" p="0 0" Element="0" NodeType="6"><t id="2" p="0 0"><s>COOH</s></t></n>`
    ));
    const atom = Object.values(doc.molecule.atoms)[0];
    expect(atom.group).toBe("COOH");
    expect(atom.groupFormula).toBe("COOH");
  });

  test("a multi-attachment node is skipped rather than imported as a carbon", () => {
    const doc = importCdxmlDocument(page(
      `<n id="1" p="0 0" Element="26"/>` +
      `<n id="2" p="60 0" Element="6"/><n id="3" p="60 30" Element="6"/>` +
      `<n id="4" p="45 15" NodeType="MultiAttachment" Attachments="2 3"/>` +
      `<b id="5" B="1" E="4"/>`
    ));
    expect(Object.keys(doc.molecule.atoms)).toHaveLength(3);
    expect(Object.keys(doc.molecule.bonds)).toHaveLength(0);
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

  test("a real ChemDraw <arrow> (Head3D/Tail3D, ArrowheadHead) imports as a forward arrow", () => {
    // Shape of the element ChemDraw 22 writes for a plain reaction arrow.
    const doc = importCdxmlDocument(pageWithBond(
      `<arrow id="4" BoundingBox="0 10 84 30" FillType="None" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="2250" Head3D="84 20 0" Tail3D="0 20 0"/>`
    ));
    expect(doc.annotations).toHaveLength(1);
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.kind).toBe("arrow");
    expect(arrow.variant).toBe("forward");
    expect(arrow.x1).toBeCloseTo(0, 1);
    expect(arrow.x2).toBeCloseTo(2 * 42, 1);
    expect(arrow.x1).toBeLessThan(arrow.x2);
    expect(arrow.headSize).toBe("medium");
  });

  test("a curved ChemDraw <arrow> (AngularSize) imports as a curved arrow bowed to the same side", () => {
    const doc = importCdxmlDocument(pageWithBond(
      `<arrow id="4" BoundingBox="0 0 84 42" ArrowheadHead="Full" ArrowheadTail="Full" AngularSize="-270" Head3D="84 42 0" Tail3D="0 42 0" Center3D="42 0 0" HeadSize="800"/>`
    ));
    expect(doc.annotations).toHaveLength(1);
    const arrow = doc.annotations[0] as ArrowAnnotation;
    // The box sits above the chord, so the arc bows up: curvedReverse under
    // the app's y-down perpendicular convention.
    expect(arrow.variant).toBe("curvedReverse");
    expect(arrow.curvature).toBeGreaterThan(0);
    expect(arrow.barb).toBe("full");
    expect(arrow.headSize).toBe("small");
    expect(arrow.x1).toBeCloseTo(0, 1);
    expect(arrow.x2).toBeCloseTo(2 * 42, 1);
  });

  test("a legacy line graphic's ArrowType names the reaction arrowhead", () => {
    const doc = importCdxmlDocument(pageWithBond(`<graphic id="4" BoundingBox="0 20 84 20" GraphicType="Line" ArrowType="FullHead"/>`));
    expect(doc.annotations).toHaveLength(1);
    expect((doc.annotations[0] as ArrowAnnotation).variant).toBe("forward");
  });

  test("a graphic superseded by a newer <arrow> is not imported twice", () => {
    const doc = importCdxmlDocument(pageWithBond(
      `<graphic id="4" SupersededBy="5" BoundingBox="0 20 84 20" GraphicType="Line"/>` +
      `<arrow id="5" Head3D="84 20 0" Tail3D="0 20 0" ArrowheadHead="Full"/>`
    ));
    expect(doc.annotations).toHaveLength(1);
    const arrow = doc.annotations[0] as ArrowAnnotation;
    expect(arrow.kind).toBe("arrow");
    expect(arrow.variant).toBe("forward");
    expect(doc.annotations.some((a) => a.kind === "shape")).toBe(false);
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

  test('a Bracket graphic honours BracketType (Curly/Round)', () => {
    const curly = importCdxmlDocument(page(`<graphic id="2" BoundingBox="10 20 20 110" GraphicType="Bracket" BracketType="Curly"/>`));
    expect((curly.annotations[0] as BracketAnnotation).variant).toBe("curly");
    const round = importCdxmlDocument(page(`<graphic id="2" BoundingBox="10 20 20 110" GraphicType="Bracket" BracketType="Round"/>`));
    expect((round.annotations[0] as BracketAnnotation).variant).toBe("paren");
  });

  test('brackets written bottom-up (y1 > y2) keep their full height', () => {
    const doc = importCdxmlDocument(page(`<graphic id="2" BoundingBox="10 110 20 20" GraphicType="Bracket"/>`));
    const bracket = doc.annotations[0] as BracketAnnotation;
    // 90 raw units at the no-bonds default calibration (42/30).
    expect(bracket.height).toBeCloseTo(90 * (42 / 30), 0);
    expect(bracket.y).toBeCloseTo(20 * (42 / 30), 0);
  });

  test('bracketedgroup attachments give narrow glyphs their open/close facings', () => {
    const doc = importCdxmlDocument(page(
      `<graphic id="7" BoundingBox="10 20 10 110" GraphicType="Bracket"/>` +
      `<graphic id="8" BoundingBox="90 20 90 110" GraphicType="Bracket"/>` +
      `<bracketedgroup id="9"><bracketattachment id="10" GraphicID="7"/><bracketattachment id="11" GraphicID="8"/></bracketedgroup>`
    ));
    expect(doc.annotations.map((a) => (a as BracketAnnotation).facing)).toEqual(["open", "close"]);
  });
});

describe("importCdxmlDocument: orbitals and TLC plates", () => {
  function page(extra: string): string {
    return `<?xml version="1.0" encoding="UTF-8" ?>
<CDXML>
<page>
<fragment id="1"><n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/><b id="3" B="1" E="2"/></fragment>
${extra}
</page>
</CDXML>`;
  }

  test('an Orbital graphic imports as a p orbital glyph', () => {
    const doc = importCdxmlDocument(page(`<graphic id="4" BoundingBox="0 0 0 30" GraphicType="Orbital" OrbitalType="p"/>`));
    expect(doc.annotations).toHaveLength(1);
    const orbital = doc.annotations[0] as OrbitalAnnotation;
    expect(orbital.kind).toBe("orbital");
    expect(orbital.variant).toBe("p");
    expect(orbital.angle).toBe(-90);
    // The test page's 42-unit bond calibrates 1:1, so the 30-unit glyph is
    // 30px tall and each lobe is 15px.
    expect(orbital.size).toBeCloseTo(15, 1);
  });

  test('a TLC plate imports its lanes, spots and Rf values', () => {
    const doc = importCdxmlDocument(page(
      `<tlcplate id="9" OriginFraction="0.1" SolventFrontFraction="0.1" BoundingBox="10 20 110 220" color="0">` +
      `<tlclane id="1"><tlcspot id="2" Rf="0.4" color="0"/></tlclane>` +
      `<tlclane id="3"><tlcspot id="4" Rf="0.8"/></tlclane>` +
      `</tlcplate>`
    ));
    expect(doc.annotations).toHaveLength(1);
    const plate = doc.annotations[0] as TlcPlateAnnotation;
    expect(plate.kind).toBe("tlc");
    expect(plate.spots).toHaveLength(2);
    expect(plate.spots[0].fx).toBeCloseTo(0.25, 3);
    expect(plate.spots[1].fx).toBeCloseTo(0.75, 3);
    expect(plate.spots[0].fy).toBeCloseTo(0.4, 3);
    expect(plate.spots[1].fy).toBeCloseTo(0.8, 3);
    // color="0" is CDX's default black, not the colortable's first (white)
    // entry — spots must not import invisible.
    expect(plate.spots[0].color).toBeUndefined();
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

    // forward + resonance + equilibrium; curved arrows are exported as
    // <arrow> elements and re-import as curved.
    expect(arrows.map((a) => a.variant).sort()).toEqual(["curved", "equilibrium", "forward", "resonance"]);
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

  test("a bracket pair writes once even when the close glyph comes first", () => {
    // A real ChemDraw import can list the close glyph before its open
    // partner. Keying the pair only open -> close used to write the close as
    // a lone bracket and then the open as a spanning pair, doubling it.
    const open: BracketAnnotation = { id: "b1", kind: "bracket", x: 200, y: 20, width: 16, height: 90, variant: "square", facing: "open" };
    const close: BracketAnnotation = { id: "b2", kind: "bracket", x: 320, y: 20, width: 16, height: 90, variant: "square", facing: "close" };
    const xml = exportCdxmlDocument(emptyMolecule(), [close, open]);
    expect(xml.match(/GraphicType="Bracket"/g)).toHaveLength(1);

    const doc = importCdxmlDocument(xml);
    expect(doc.annotations).toHaveLength(2);
    expect(doc.annotations.map((a) => (a as BracketAnnotation).facing).sort()).toEqual(["close", "open"]);
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

  test("new shape variants round-trip: roundedRect, triangle, hexagon, polygon", () => {
    const roundedRect: ShapeAnnotation = { id: "s1", kind: "shape", x: 20, y: 30, width: 80, height: 50, variant: "roundedRect" };
    const triangle: ShapeAnnotation = { id: "s2", kind: "shape", x: 120, y: 30, width: 60, height: 60, variant: "triangle" };
    const hexagon: ShapeAnnotation = { id: "s3", kind: "shape", x: 200, y: 30, width: 60, height: 60, variant: "hexagon" };
    const polygon: ShapeAnnotation = { id: "s4", kind: "shape", x: 280, y: 30, width: 60, height: 60, variant: "polygon", sides: 5 };
    const xml = exportCdxmlDocument(emptyMolecule(), [roundedRect, triangle, hexagon, polygon]);
    const doc = importCdxmlDocument(xml);
    const shapes = doc.annotations.filter((a): a is ShapeAnnotation => a.kind === "shape");
    expect(shapes.map((s) => s.variant).sort()).toEqual(["hexagon", "polygon", "roundedRect", "triangle"]);
    expect((shapes.find((s) => s.variant === "polygon") as ShapeAnnotation).sides).toBe(5);
  });

  test("new shape variants round-trip: arc, curve, polyline", () => {
    const arc: ShapeAnnotation = { id: "s1", kind: "shape", x: 20, y: 30, width: 80, height: 60, variant: "arc", startAngle: 0, sides: 90 };
    const curve: ShapeAnnotation = { id: "s2", kind: "shape", x: 120, y: 30, width: 80, height: 60, variant: "curve", points: [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 80, y: 0 }] };
    const polyline: ShapeAnnotation = { id: "s3", kind: "shape", x: 220, y: 30, width: 80, height: 60, variant: "polyline", points: [{ x: 0, y: 0 }, { x: 20, y: 40 }, { x: 40, y: 20 }, { x: 80, y: 60 }] };
    const xml = exportCdxmlDocument(emptyMolecule(), [arc, curve, polyline]);
    const doc = importCdxmlDocument(xml);
    const shapes = doc.annotations.filter((a): a is ShapeAnnotation => a.kind === "shape");
    expect(shapes.map((s) => s.variant).sort()).toEqual(["arc", "curve", "polyline"]);
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

  test("a colored caption round-trips through CDX's reserved black/white color indexes", () => {
    const text: TextAnnotation = { id: "t3", kind: "text", x: 30, y: 30, width: 140, height: 24, html: '<span style="color:#ff0000">hot</span>', fontSize: 14 };
    const xml = exportCdxmlDocument(emptyMolecule(), [text]);
    // 0 = black, 1 = white, table entries start at 2: red is the third
    // entry (index 4).
    expect(xml).toContain('color="4"');
    const doc = importCdxmlDocument(xml);
    const texts = doc.annotations.filter((a): a is TextAnnotation => a.kind === "text");
    expect(texts).toHaveLength(1);
    expect(texts[0].html).toMatch(/color:\s*#ff0000/i);
  });

  test("a colored TLC spot is in the colortable its color index references", () => {
    const plate: TlcPlateAnnotation = {
      id: "p1", kind: "tlc", x: 0, y: 0, width: 90, height: 130,
      spots: [{ fx: 0.5, fy: 0.4, r: 4, color: "#00aa55" }],
    };
    const xml = exportCdxmlDocument(emptyMolecule(), [plate]);
    // Every index must fall inside the table that was already written in the
    // header (0 = default ink, 1 = white, entries start at 2).
    const tableEntries = (xml.match(/<color /g) ?? []).length;
    const indexes = [...xml.matchAll(/color="(\d+)"/g)].map((m) => Number(m[1]));
    expect(indexes.length).toBeGreaterThan(0);
    for (const idx of indexes) expect(idx).toBeLessThan(tableEntries + 2);

    const doc = importCdxmlDocument(xml);
    const imported = doc.annotations[0] as TlcPlateAnnotation;
    expect(imported.spots[0].color).toBe("#00aa55");
  });

  test("plain exportCdxml (molecule only) writes no graphics or text", () => {
    const xml = exportCdxml(emptyMolecule());
    expect(xml).not.toContain("GraphicType");
    expect(xml).not.toContain("<t ");
  });

  test("new arrow variants round-trip: dashed, double, bold", () => {
    const dashed: ArrowAnnotation = { id: "a1", kind: "arrow", x1: 0, y1: 0, x2: 90, y2: 0, variant: "dashed" };
    const doubl: ArrowAnnotation = { id: "a2", kind: "arrow", x1: 0, y1: 30, x2: 90, y2: 30, variant: "double" };
    const bold: ArrowAnnotation = { id: "a3", kind: "arrow", x1: 0, y1: 60, x2: 90, y2: 60, variant: "bold" };
    const xml = exportCdxmlDocument(emptyMolecule(), [dashed, doubl, bold]);
    const doc = importCdxmlDocument(xml);
    const arrows = doc.annotations.filter((a): a is ArrowAnnotation => a.kind === "arrow");
    expect(arrows.map((a) => a.variant).sort()).toEqual(["bold", "dashed", "double"]);
  });

  test("new arrow variants round-trip: openHead, circleHead, diamondHead", () => {
    const openHead: ArrowAnnotation = { id: "a1", kind: "arrow", x1: 0, y1: 0, x2: 90, y2: 0, variant: "openHead" };
    const circleHead: ArrowAnnotation = { id: "a2", kind: "arrow", x1: 0, y1: 30, x2: 90, y2: 30, variant: "circleHead" };
    const diamondHead: ArrowAnnotation = { id: "a3", kind: "arrow", x1: 0, y1: 60, x2: 90, y2: 60, variant: "diamondHead" };
    const xml = exportCdxmlDocument(emptyMolecule(), [openHead, circleHead, diamondHead]);
    const doc = importCdxmlDocument(xml);
    const arrows = doc.annotations.filter((a): a is ArrowAnnotation => a.kind === "arrow");
    expect(arrows.map((a) => a.variant).sort()).toEqual(["circleHead", "diamondHead", "openHead"]);
  });
});

// A real ChemDraw 22 drawing: a bracketed charged arene, a second fragment
// with an orbital, a reaction arrow, a long curved arrow, a TLC plate with
// eight spots, and square/curly bracket pairs. Every object in it used to
// either vanish or arrive wrong, so this is the end-to-end regression test
// for the cases the focused tests above isolate.
describe("importCdxmlDocument: a real ChemDraw document", () => {
  const doc = importCdxmlDocument(chemdrawScheme);

  test("imports the molecule, including charge and bond styles", () => {
    expect(Object.keys(doc.molecule.atoms)).toHaveLength(14);
    expect(Object.keys(doc.molecule.bonds)).toHaveLength(14);
    expect(Object.values(doc.molecule.atoms).filter((a) => a.charge === 1)).toHaveLength(1);
    const stereos = Object.values(doc.molecule.bonds).map((b) => b.stereo);
    expect(stereos).toContain("wavy");
    expect(stereos).toContain("wedge");
    expect(stereos).toContain("bold");
  });

  test("imports both the straight reaction arrow and the curved mechanism arrow", () => {
    const arrows = doc.annotations.filter((a): a is ArrowAnnotation => a.kind === "arrow");
    expect(arrows).toHaveLength(2);
    const straight = arrows.find((a) => a.variant === "forward")!;
    expect(straight).toBeDefined();
    expect(straight.x1).toBeLessThan(straight.x2);
    const curved = arrows.find((a) => a.variant === "curved" || a.variant === "curvedReverse")!;
    expect(curved).toBeDefined();
    expect(curved.curvature).toBeGreaterThan(0);
    // The old stale line graphic this arrow superseded must not also import.
    expect(doc.annotations.some((a) => a.kind === "shape")).toBe(false);
  });

  test("imports the orbital glyph", () => {
    const orbitals = doc.annotations.filter((a): a is OrbitalAnnotation => a.kind === "orbital");
    expect(orbitals).toHaveLength(1);
    expect(orbitals[0].variant).toBe("p");
  });

  test("imports both bracket pairs with the right glyph shape and facing", () => {
    const brackets = doc.annotations.filter((a): a is BracketAnnotation => a.kind === "bracket");
    expect(brackets).toHaveLength(4);
    expect(brackets.filter((b) => b.variant === "square")).toHaveLength(2);
    expect(brackets.filter((b) => b.variant === "curly")).toHaveLength(2);
    // Each pair has one open and one close glyph, and the full height
    // survives even when the file wrote the box bottom-up.
    for (const variant of ["square", "curly"] as const) {
      const pair = brackets.filter((b) => b.variant === variant);
      expect(pair.map((b) => b.facing).sort()).toEqual(["close", "open"]);
      expect(pair.every((b) => b.height > 100)).toBe(true);
    }
  });

  test("imports the TLC plate, its eight spots and their Rf values", () => {
    const plates = doc.annotations.filter((a): a is TlcPlateAnnotation => a.kind === "tlc");
    expect(plates).toHaveLength(1);
    expect(plates[0].spots).toHaveLength(8);
    expect(plates[0].spots[0].fx).toBeCloseTo(0.0625, 3);
    expect(plates[0].spots[0].fy).toBeCloseTo(0.431193, 3);
    // CDX color 0 is black/default — not white (which made the spots vanish).
    expect(plates[0].spots.every((s) => s.color === undefined)).toBe(true);
  });
});

// --- ChemDraw reaction-scheme grouping ---------------------------------
// A <scheme> groups whole fragments on either side of one or more arrows.
// This app stores that grouping on Molecule.schemes (see ReactionScheme's
// doc comment); the tests below cover the real-file import, the export/
// re-import cycle, multiple steps, and the stale-reference cleanup.
describe("reaction scheme grouping", () => {
  test("imports the scheme and step from a real ChemDraw document", () => {
    const doc = importCdxmlDocument(chemdrawScheme);
    expect(doc.molecule.schemes).toHaveLength(1);

    const scheme = doc.molecule.schemes![0];
    expect(scheme.steps).toHaveLength(1);
    const step = scheme.steps[0];
    expect(step.reactantAtomIds).toHaveLength(8);
    expect(step.productAtomIds).toHaveLength(6);

    // Every referenced atom really exists, and every arrow id resolves to
    // the imported arrow annotation. The fixture points its step at graphic
    // 49, a stale line that was superseded by the real arrow graphic 94 —
    // the importer has to follow SupersededBy to land on the forward arrow.
    for (const id of [...step.reactantAtomIds, ...step.productAtomIds]) {
      expect(doc.molecule.atoms[id]).toBeDefined();
    }
    expect(step.arrowIds).toHaveLength(1);
    const arrow = doc.annotations.find((a) => a.id === step.arrowIds[0]);
    expect(arrow?.kind).toBe("arrow");
    expect((arrow as ArrowAnnotation).variant).toBe("forward");
  });

  test("scheme grouping and its arrow reference survive export/import", () => {
    const doc = importCdxmlDocument(chemdrawScheme);
    const xml = exportCdxmlDocument(doc.molecule, doc.annotations);
    expect(xml).toContain("<scheme");
    expect(xml).toContain("ReactionStepReactants=");
    expect(xml).toContain("ReactionStepProducts=");
    expect(xml).toContain("ReactionStepArrows=");

    const round = importCdxmlDocument(xml);
    expect(round.molecule.schemes).toHaveLength(1);
    const step = round.molecule.schemes![0].steps[0];
    expect(step.reactantAtomIds).toHaveLength(8);
    expect(step.productAtomIds).toHaveLength(6);
    expect(step.arrowIds).toHaveLength(1);
    const arrow = round.annotations.find((a) => a.id === step.arrowIds[0]);
    expect(arrow?.kind).toBe("arrow");
    expect((arrow as ArrowAnnotation).variant).toBe("forward");
  });

  test("a multi-step scheme over several fragments round-trips", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 60, y: 0 }, "O");
    mol = addAtom(mol, "c", { x: 180, y: 0 }, "N");
    mol = addAtom(mol, "d", { x: 300, y: 0 }, "S");
    const arrow1: ArrowAnnotation = { id: "x1", kind: "arrow", x1: 100, y1: 0, x2: 140, y2: 0, variant: "forward" };
    const arrow2: ArrowAnnotation = { id: "x2", kind: "arrow", x1: 220, y1: 0, x2: 260, y2: 0, variant: "forward" };
    mol = {
      ...mol,
      schemes: [
        {
          id: "s1",
          steps: [
            { id: "st1", reactantAtomIds: ["a", "b"], productAtomIds: ["c"], arrowIds: ["x1"] },
            { id: "st2", reactantAtomIds: ["c"], productAtomIds: ["d"], arrowIds: ["x2"] },
          ],
        },
      ],
    };

    const round = importCdxmlDocument(exportCdxmlDocument(mol, [arrow1, arrow2]));
    expect(round.molecule.schemes).toHaveLength(1);
    const steps = round.molecule.schemes![0].steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].reactantAtomIds).toHaveLength(2);
    expect(steps[0].productAtomIds).toHaveLength(1);
    expect(steps[1].reactantAtomIds).toHaveLength(1);
    expect(steps[1].productAtomIds).toHaveLength(1);
    for (const step of steps) {
      expect(step.arrowIds).toHaveLength(1);
      const arrow = round.annotations.find((a) => a.id === step.arrowIds[0]);
      expect(arrow?.kind).toBe("arrow");
    }
  });

  test("stale fragment and arrow references are skipped rather than written", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    mol = {
      ...mol,
      schemes: [
        // Entirely stale: nothing to export, so the whole scheme goes away.
        { id: "s1", steps: [{ id: "st1", reactantAtomIds: ["ghost"], productAtomIds: [], arrowIds: ["gone"] }] },
        // Half valid: the atom survives, the arrow does not.
        { id: "s2", steps: [{ id: "st2", reactantAtomIds: ["a", "ghost"], productAtomIds: [], arrowIds: ["gone"] }] },
      ],
    };

    const xml = exportCdxmlDocument(mol, []);
    const schemes = [...xml.matchAll(/<scheme /g)];
    expect(schemes).toHaveLength(1);
    expect(xml).not.toContain('ReactionStepArrows=');

    const round = importCdxmlDocument(xml);
    expect(round.molecule.schemes).toHaveLength(1);
    expect(round.molecule.schemes![0].steps[0].reactantAtomIds).toHaveLength(1);
    expect(round.molecule.schemes![0].steps[0].arrowIds).toEqual([]);
  });
});

describe("CDXML page setup", () => {
  test("imports the page box and drawing defaults from a real ChemDraw file", () => {
    const doc = importCdxmlDocument(chemdrawScheme);
    expect(doc.page).toEqual({
      x: 0,
      y: 0,
      width: 523.32,
      height: 769.92,
      bondLength: 30,
      marginWidth: 2,
    });
  });

  test("writes a supplied page and reads it back unchanged", () => {
    const page = { x: 0, y: 0, width: 523.32, height: 769.92, bondLength: 36, marginWidth: 3 };
    const xml = exportCdxmlDocument(emptyMolecule(), [], "page", page);
    expect(xml).toContain('BondLength="36"');
    expect(xml).toContain('MarginWidth="3"');
    expect(xml).toContain('BoundingBox="0.0000 0.0000 523.3200 769.9200"');
    expect(importCdxmlDocument(xml).page).toEqual(page);
  });

  test("without a page, export falls back to A4 portrait", () => {
    const page = importCdxmlDocument(exportCdxml(emptyMolecule())).page;
    expect(page).toEqual({
      x: 0,
      y: 0,
      width: A4_PAGE_WIDTH,
      height: A4_PAGE_HEIGHT,
      bondLength: 30,
      marginWidth: 2,
    });
  });

  test("without a page, export grows the page to keep content inside it", () => {
    const mol = addAtom(emptyMolecule(), "a", { x: 2000, y: 0 }, "C");
    const page = importCdxmlDocument(exportCdxml(mol)).page!;
    // 2000 canvas px at the default 30/42 scale, plus a 36 pt margin.
    expect(page.width).toBeCloseTo(2000 * (30 / 42) + 36, 3);
    expect(page.height).toBeCloseTo(A4_PAGE_HEIGHT, 3);
  });

  test("a page without a usable box is ignored rather than inventing one", () => {
    const doc = importCdxmlDocument(`<CDXML BondLength="30"><page BoundingBox="0 0 0 0"><fragment id="1"/></page></CDXML>`);
    expect(doc.page).toBeUndefined();
  });
});

describe("CDXML font-table fidelity", () => {
  test("imports a non-default caption font as a font-family span", () => {
    const doc = importCdxmlDocument(
      `<CDXML CaptionFont="3"><fonttable><font id="3" name="Arial"/><font id="4" name="Times New Roman"/></fonttable>` +
        `<page><t id="1" p="10 10"><s font="4" size="12">Styled</s></t></page></CDXML>`,
    );
    const text = doc.annotations[0] as TextAnnotation;
    expect(text.html).toContain("font-family:Times New Roman");
    expect(text.html).toContain("Styled");
  });

  test("a caption in the document's own CaptionFont stays unadorned", () => {
    const doc = importCdxmlDocument(
      `<CDXML CaptionFont="4"><fonttable><font id="4" name="Helvetica"/></fonttable>` +
        `<page><t id="1" p="10 10"><s font="4" size="12">Plain</s></t></page></CDXML>`,
    );
    expect((doc.annotations[0] as TextAnnotation).html).toBe("Plain");
  });

  test("export writes a fonttable entry and a matching run font id", () => {
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      x: 10,
      y: 10,
      width: 120,
      height: 24,
      html: '<span style="font-family:Times New Roman">Styled</span>',
      fontSize: 14,
    };
    const xml = exportCdxmlDocument(emptyMolecule(), [text]);
    expect(xml).toContain('<font id="4" charset="iso-8859-1" name="Times New Roman"/>');
    expect(xml).toContain('<s font="4"');
    expect(xml).toContain('<font id="3" charset="iso-8859-1" name="Arial"/>');
  });

  test("Arial captions reuse the default font id and do not duplicate the table entry", () => {
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      x: 10,
      y: 10,
      width: 120,
      height: 24,
      html: '<span style="font-family:Arial">Plain</span>',
      fontSize: 14,
    };
    const xml = exportCdxmlDocument(emptyMolecule(), [text]);
    expect(xml.match(/name="Arial"/g)).toHaveLength(1);
    expect(xml).toContain('<s font="3"');
  });

  test("font family survives an export/import round trip", () => {
    const text: TextAnnotation = {
      id: "t1",
      kind: "text",
      x: 10,
      y: 10,
      width: 120,
      height: 24,
      html: '<span style="font-family:Helvetica">Styled</span>',
      fontSize: 14,
    };
    const back = importCdxmlDocument(exportCdxmlDocument(emptyMolecule(), [text]));
    const imported = back.annotations[0] as TextAnnotation;
    expect(imported.html).toContain("font-family:Helvetica");
  });
});

describe("real ChemDraw fixture round trip", () => {
  test("the scheme fixture survives import → export → import", () => {
    const first = importCdxmlDocument(chemdrawScheme);
    const xml = exportCdxmlDocument(first.molecule, first.annotations, "scheme", first.page);
    const second = importCdxmlDocument(xml);

    expect(Object.keys(second.molecule.atoms)).toHaveLength(Object.keys(first.molecule.atoms).length);
    expect(Object.keys(second.molecule.bonds)).toHaveLength(Object.keys(first.molecule.bonds).length);
    expect(second.annotations.map((a) => a.kind).sort()).toEqual(first.annotations.map((a) => a.kind).sort());
    expect(second.page).toEqual(first.page);

    expect(second.molecule.schemes).toHaveLength(1);
    expect(first.molecule.schemes).toHaveLength(1);
    const firstStep = first.molecule.schemes![0].steps[0];
    const secondStep = second.molecule.schemes![0].steps[0];
    expect(secondStep.reactantAtomIds).toHaveLength(firstStep.reactantAtomIds.length);
    expect(secondStep.productAtomIds).toHaveLength(firstStep.productAtomIds.length);
    expect(secondStep.arrowIds).toHaveLength(firstStep.arrowIds.length);
    for (const id of secondStep.arrowIds) {
      expect(second.annotations.some((a) => a.id === id && a.kind === "arrow")).toBe(true);
    }
  });
});

describe("CDXML S-groups", () => {
  const sgroupPage = (body: string): string =>
    `<CDXML BondLength="30"><page><fragment id="1">` +
    `<n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/><n id="3" p="84 0" Element="6"/>` +
    `<b id="4" B="1" E="2"/><b id="5" B="2" E="3"/>` +
    `</fragment>${body}</page></CDXML>`;

  test("imports an RDKit-style MultipleGroup bracketedgroup", () => {
    // Same shape as RDKit's sgroups_and_remove_atoms_4.cdxml: two narrow
    // bracket graphics attached to a page-level <bracketedgroup>.
    const doc = importCdxmlDocument(sgroupPage(
      `<graphic id="10" BoundingBox="0 -20 0 20" GraphicType="Bracket" BracketType="Square"/>` +
      `<graphic id="11" BoundingBox="84 -20 84 20" GraphicType="Bracket" BracketType="Square"/>` +
      `<bracketedgroup id="12" BracketedObjectIDs="1 2 3" BracketUsage="MultipleGroup" PolymerFlipType="NoFlip" RepeatCount="2">` +
      `<bracketattachment id="13" GraphicID="10"><crossingbond id="14" BondID="5" InnerAtomID="2"/></bracketattachment>` +
      `<bracketattachment id="15" GraphicID="11"><crossingbond id="16" BondID="4" InnerAtomID="2"/></bracketattachment>` +
      `</bracketedgroup>`
    ));

    const groups = Object.values(doc.molecule.sgroups ?? {});
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.type).toBe("MUL");
    expect(group.atomIds).toHaveLength(3);
    expect(group.bondIds).toHaveLength(2);
    expect(group.bracketAnnotationIds).toHaveLength(2);
    expect(group.subscript).toBe("2");
    expect(group.bracketStyle).toBe("square");
    // Both bracket annotations really exist in the imported annotation layer.
    const bracketIds = new Set(doc.annotations.filter((a) => a.kind === "bracket").map((a) => a.id));
    for (const id of group.bracketAnnotationIds!) expect(bracketIds.has(id)).toBe(true);
  });

  test("BracketUsage maps onto the app's S-group types", () => {
    const cases: [string, string][] = [
      ["SRU", "SRU"], ["Monomer", "MON"], ["Mer", "MER"], ["Copolymer", "COP"],
      ["Crosslink", "CRO"], ["Modification", "MOD"], ["Graft", "GRA"],
      ["Component", "COM"], ["Superatom", "SUP"], ["Mixture", "MUL"], ["Data", "DAT"],
    ];
    for (const [usage, expected] of cases) {
      const doc = importCdxmlDocument(sgroupPage(
        `<graphic id="10" BoundingBox="0 -20 0 20" GraphicType="Bracket"/>` +
        `<bracketedgroup id="12" BracketedObjectIDs="1 2" BracketUsage="${usage}">` +
        `<bracketattachment id="13" GraphicID="10"/></bracketedgroup>`
      ));
      expect(Object.values(doc.molecule.sgroups ?? {})[0]?.type).toBe(expected);
    }
  });

  test("a bracketedgroup with no surviving atoms is dropped", () => {
    const doc = importCdxmlDocument(sgroupPage(
      `<graphic id="10" BoundingBox="0 -20 0 20" GraphicType="Bracket"/>` +
      `<bracketedgroup id="12" BracketedObjectIDs="999" BracketUsage="SRU">` +
      `<bracketattachment id="13" GraphicID="10"/></bracketedgroup>`
    ));
    expect(doc.molecule.sgroups).toBeUndefined();
  });

  test("an S-group round-trips through export and re-import", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 42, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 84, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1");
    mol = addBond(mol, "b1", "a1", "a2");
    const open: BracketAnnotation = { id: "br1", kind: "bracket", x: 0, y: -10, width: 14, height: 60, variant: "square", facing: "open" };
    const close: BracketAnnotation = { id: "br2", kind: "bracket", x: 120, y: -10, width: 14, height: 60, variant: "square", facing: "close" };
    mol = {
      ...mol,
      sgroups: {
        sg1: {
          id: "sg1",
          type: "SRU",
          atomIds: ["a0", "a1"],
          bondIds: ["b1"],
          subscript: "n",
          bracketAnnotationIds: ["br1", "br2"],
        },
      },
    };

    const xml = exportCdxmlDocument(mol, [open, close]);
    expect(xml).toContain('<bracketedgroup');
    expect(xml).toContain('BracketUsage="SRU"');
    expect(xml).toContain('RepeatCount="n"');
    expect(xml.match(/<bracketattachment /g)).toHaveLength(1); // one spanning graphic
    expect(xml).toContain('<crossingbond');

    const back = importCdxmlDocument(xml);
    const groups = Object.values(back.molecule.sgroups ?? {});
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("SRU");
    expect(groups[0].atomIds).toHaveLength(2);
    expect(groups[0].subscript).toBe("n");
    expect(groups[0].bondIds).toHaveLength(1);
    expect(groups[0].bracketAnnotationIds).toHaveLength(2);
  });

  test("an S-group with no bracket annotations left is not written dangling", () => {
    let mol = addAtom(emptyMolecule(), "a0", { x: 0, y: 0 }, "C");
    mol = { ...mol, sgroups: { sg1: { id: "sg1", type: "SRU", atomIds: ["a0"] } } };
    expect(exportCdxml(mol)).not.toContain("<bracketedgroup");
  });

  test("a real ChemDraw S-group file (RDKit fixture) imports and round-trips", () => {
    const first = importCdxmlDocument(rdkitSgroups);
    const groups = Object.values(first.molecule.sgroups ?? {});
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("MUL");
    expect(groups[0].atomIds).toHaveLength(3);
    expect(groups[0].bondIds).toHaveLength(2);
    expect(groups[0].bracketAnnotationIds).toHaveLength(2);
    expect(groups[0].subscript).toBe("2");

    const xml = exportCdxmlDocument(first.molecule, first.annotations, "sgroups", first.page);
    const second = importCdxmlDocument(xml);
    expect(Object.keys(second.molecule.atoms)).toHaveLength(Object.keys(first.molecule.atoms).length);
    expect(Object.keys(second.molecule.bonds)).toHaveLength(Object.keys(first.molecule.bonds).length);
    const back = Object.values(second.molecule.sgroups ?? {});
    expect(back).toHaveLength(1);
    expect(back[0].type).toBe("MUL");
    expect(back[0].atomIds).toHaveLength(3);
    expect(back[0].bondIds).toHaveLength(2);
    expect(back[0].bracketAnnotationIds).toHaveLength(2);
    expect(back[0].subscript).toBe("2");
  });
});
