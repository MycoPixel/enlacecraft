import { describe, expect, test } from "vitest";
import { detectStructureText, importSmiles, SmilesImportError } from "./smilesImport";
import { exportSmiles } from "./smiles";
import { computeFormula } from "../model/valence";

// The parse path deliberately lands in importMol (see smilesImport.ts's doc
// comment), so these tests check the *end-to-end* outcome — the same
// Molecule shape a dropped .mol file would produce — rather than OCL
// internals.

describe("importSmiles", () => {
  test("parses aspirin (aromatic SMILES) into a 13-atom, 13-bond molecule", () => {
    const { molecule } = importSmiles("CC(=O)Oc1ccccc1C(=O)O");
    expect(Object.keys(molecule.atoms)).toHaveLength(13);
    expect(Object.keys(molecule.bonds)).toHaveLength(13);
    // Formula computed the same way the top-bar readout does it.
    expect(computeFormula(molecule)).toBe("C9H8O4");
  });

  test("aromatic and Kekulé SMILES of the same molecule give the same formula and atom count", () => {
    const aromatic = importSmiles("c1ccccc1O");
    const kekule = importSmiles("C1=CC=CC=C1O");
    expect(Object.keys(aromatic.molecule.atoms)).toHaveLength(Object.keys(kekule.molecule.atoms).length);
    expect(computeFormula(aromatic.molecule)).toBe(computeFormula(kekule.molecule));
    expect(computeFormula(aromatic.molecule)).toBe("C6H6O");
  });

  test("round-trips through exportSmiles up to aromatic-bond style", () => {
    const { molecule } = importSmiles("CC(=O)Oc1ccccc1C(=O)O");
    const back = exportSmiles(molecule);
    // exportSmiles writes Kekulé bonds (see smiles.ts), so compare a
    // re-imported formula rather than the literal string.
    const reparsed = importSmiles(back);
    expect(computeFormula(reparsed.molecule)).toBe("C9H8O4");
    expect(reparsed.smiles).toBe(back);
  });

  test("stereo SMILES produces a wedge or dash bond, not a flat one", () => {
    const { molecule } = importSmiles("C[C@H](O)Cl");
    const stereos = Object.values(molecule.bonds).map((b) => b.stereo);
    expect(stereos).toContain("wedge");
    expect(stereos).not.toContain("dash");
    const inverted = importSmiles("C[C@@H](O)Cl");
    const invertedStereos = Object.values(inverted.molecule.bonds).map((b) => b.stereo);
    expect(invertedStereos).toContain("dash");
  });

  test("bracket-atom charges survive (acetate anion)", () => {
    const { molecule } = importSmiles("CC(=O)[O-]");
    const charged = Object.values(molecule.atoms).filter((a) => a.charge !== 0);
    expect(charged).toHaveLength(1);
    expect(charged[0].charge).toBe(-1);
  });

  test("multi-fragment SMILES stays disconnected (salt)", () => {
    const { molecule } = importSmiles("CC(=O)[O-].[Na+]");
    expect(Object.keys(molecule.atoms)).toHaveLength(5);
    // Two connected components: acetate (4 atoms) + sodium (1 atom).
    const bondAtomIds = new Set(Object.values(molecule.bonds).flatMap((b) => [b.a1, b.a2]));
    expect(bondAtomIds.size).toBe(4);
  });

  test("implicit hydrogens are NOT added as atoms (skeletal convention)", () => {
    // Ethanol C2H6O: 9 atoms if H were explicit, 3 under skeletal display.
    const { molecule } = importSmiles("CCO");
    expect(Object.keys(molecule.atoms)).toHaveLength(3);
    expect(computeFormula(molecule)).toBe("C2H6O");
  });

  test("accepts a 'name SMILES' line by picking the SMILES token", () => {
    const { molecule, smiles } = importSmiles("ethanol CCO");
    expect(smiles).toBe("CCO");
    expect(Object.keys(molecule.atoms)).toHaveLength(3);
  });

  test("accepts a 'SMILES name' line (first token)", () => {
    const { smiles } = importSmiles("CCO ethanol");
    expect(smiles).toBe("CCO");
  });

  test("surrounding whitespace and CRLF line endings are tolerated", () => {
    const { molecule } = importSmiles("  \r\n  CCO  \r\n");
    expect(Object.keys(molecule.atoms)).toHaveLength(3);
  });

  test("throws SmilesImportError with a readable reason for garbage input", () => {
    try {
      importSmiles("not a smiles at all");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SmilesImportError);
      expect((err as Error).message).not.toContain("Class$");
      expect((err as Error).message.length).toBeGreaterThan(0);
    }
  });

  test("throws for a dangling ring closure", () => {
    expect(() => importSmiles("C1CC")).toThrow(SmilesImportError);
  });

  test("throws for empty / whitespace-only input", () => {
    expect(() => importSmiles("")).toThrow(SmilesImportError);
    expect(() => importSmiles("   \n\t ")).toThrow(SmilesImportError);
  });

  test("isotopes survive (deuterated methane)", () => {
    const { molecule } = importSmiles("[2H]C([2H])([2H])[2H]");
    const deuteriums = Object.values(molecule.atoms).filter((a) => a.element === "H" && a.isotope === 2);
    expect(deuteriums).toHaveLength(4);
  });
});

describe("detectStructureText", () => {
  const V2000 = [
    "molecule",
    "  test",
    "",
    "  3  2  0  0  0  0  0  0  0  0999 V2000",
    "    0.0000    0.0000    0.0000 C   0  0",
    "    1.0000    0.0000    0.0000 O   0  0",
    "    2.0000    0.0000    0.0000 H   0  0",
    "  1  2  2  0",
    "  1  3  1  0",
    "M  END",
  ].join("\n");

  test("recognizes a V2000 molfile", () => {
    expect(detectStructureText(V2000)).toBe("mol");
  });

  test("recognizes a molfile without a V2000 tag via M  END", () => {
    expect(detectStructureText(V2000.replace(" V2000", "     "))).toBe("mol");
  });

  test("recognizes CDXML by its root element", () => {
    expect(detectStructureText('<?xml version="1.0"?><CDXML BondLength="30"><page/></CDXML>')).toBe("cdxml");
    expect(detectStructureText("<CDXML></CDXML>")).toBe("cdxml");
  });

  test("recognizes SMILES", () => {
    expect(detectStructureText("CCO")).toBe("smiles");
    expect(detectStructureText("C[C@H](O)Cl")).toBe("smiles");
    expect(detectStructureText("c1ccccc1")).toBe("smiles");
  });

  test("rejects prose, numbers, and markup as SMILES", () => {
    expect(detectStructureText("Hello world, this is a sentence.")).toBeNull();
    expect(detectStructureText("12345")).toBeNull();
    expect(detectStructureText("")).toBeNull();
    expect(detectStructureText("   ")).toBeNull();
  });

  test("is case-sensitive enough to not mistake a project JSON for any format", () => {
    expect(detectStructureText('{"version": 2, "tabs": []}')).toBeNull();
  });
});
