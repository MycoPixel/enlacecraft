// @vitest-environment jsdom
//
// importCdxml() parses with the browser's DOMParser, which doesn't exist
// under plain Node — this file needs the jsdom environment (see
// vitest.config.ts's default "node" environment, overridden per-file here)
// while valence.test.ts/molfile.test.ts stay on the faster default.
import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { exportCdxml, importCdxml } from "./cdxml";
import type { Molecule } from "../types/chemistry";

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
