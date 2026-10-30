// @vitest-environment jsdom
//
// A second layer of real-ChemDraw coverage on top of cdxml.test.ts: each
// fixture here was written by ChemDraw (or by RDKit's ChemDraw-compatible
// writer), not by this app, so it catches assumptions the app's own
// exporter and importer happen to share.
import { describe, expect, test } from "vitest";
import { exportCdxmlDocument, importCdxmlDocument } from "./cdxml";
import dativeFixture from "./fixtures/rdkit-dative.cdxml?raw";
import wavyFixture from "./fixtures/rdkit-wavy.cdxml?raw";
import aromaticFixture from "./fixtures/rdkit-aromatic.cdxml?raw";
import reactionBocFixture from "./fixtures/rdkit-reaction-boc.cdxml?raw";
import type { Molecule } from "../types/chemistry";

type ImportedDocument = ReturnType<typeof importCdxmlDocument>;

/** The parts of a document that should survive import → export → import. */
function stableShape(doc: ImportedDocument) {
  const mol: Molecule = doc.molecule;
  return {
    atoms: Object.keys(mol.atoms).length,
    bonds: Object.keys(mol.bonds).length,
    elements: Object.values(mol.atoms).map((a) => a.element).sort(),
    bondKinds: Object.values(mol.bonds)
      .map((b) => (b.dative ? "dative" : `${b.order}:${b.stereo}`))
      .sort(),
    annotations: doc.annotations.map((a) => a.kind).sort(),
    schemes: mol.schemes?.length ?? 0,
    sgroups: Object.keys(mol.sgroups ?? {}).length,
  };
}

function roundTrip(fixture: string): ImportedDocument {
  const first = importCdxmlDocument(fixture);
  const xml = exportCdxmlDocument(first.molecule, first.annotations, "fixture", first.page);
  return importCdxmlDocument(xml);
}

describe("real ChemDraw fixture corpus", () => {
  test.each([
    ["wavy bonds", wavyFixture],
    ["aromatic 1.5 bonds", aromaticFixture],
    ["reaction with Boc nicknames", reactionBocFixture],
  ])("%s survive import → export → import", (_label, fixture) => {
    const first = importCdxmlDocument(fixture);
    const second = roundTrip(fixture);
    expect(stableShape(second)).toEqual(stableShape(first));
    expect(Object.keys(second.molecule.atoms).length).toBeGreaterThan(0);
  });

  test("a real ChemDraw dative-bond file imports the dative bonds, not plain singles", () => {
    const doc = importCdxmlDocument(dativeFixture);
    const bonds = Object.values(doc.molecule.bonds);
    expect(bonds.filter((b) => b.dative)).toHaveLength(4);
    // The donor atoms are nitrogens in this drawing; the metal is Os.
    expect(Object.values(doc.molecule.atoms).some((a) => a.element === "Os")).toBe(true);
  });

  test("dative bonds round-trip through CDX's Order=\"dative\"", () => {
    const first = importCdxmlDocument(dativeFixture);
    const second = roundTrip(dativeFixture);
    expect(stableShape(second)).toEqual(stableShape(first));
    expect(Object.values(second.molecule.bonds).filter((b) => b.dative)).toHaveLength(4);
  });
});
