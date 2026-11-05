import { describe, expect, test } from "vitest";
import { importStructure3D, perceiveBonds, elementForSymbol, isStructure3DFile } from "./importStructure3d";
import { parseV2000 } from "../components/Molecule3D/rotateBond";

/** Methane: the textbook sanity case — one carbon at the origin and four
 * hydrogens on a tetrahedron at the C-H bond length of ~1.09 Å. */
const METHANE_XYZ = [
  "5",
  "methane",
  "C   0.000000  0.000000  0.000000",
  "H   0.629118  0.629118  0.629118",
  "H  -0.629118 -0.629118  0.629118",
  "H  -0.629118  0.629118 -0.629118",
  "H   0.629118 -0.629118 -0.629118",
  "",
].join("\n");

describe("importStructure3D — XYZ", () => {
  test("reads every atom with its 3D coordinates", () => {
    const parsed = parseV2000(importStructure3D("methane.xyz", METHANE_XYZ));
    expect(parsed.atoms).toHaveLength(5);
    expect(parsed.atoms[0].element).toBe("C");
    expect(parsed.atoms[1].element).toBe("H");
    expect(parsed.atoms[0].x).toBeCloseTo(0, 6);
    expect(parsed.atoms[1].x).toBeCloseTo(0.629118, 4);
  });

  test("perceives the four C-H bonds from geometry alone", () => {
    // XYZ has no connectivity at all, so getting sticks out of it depends
    // entirely on distance-based perception working.
    const parsed = parseV2000(importStructure3D("methane.xyz", METHANE_XYZ));
    expect(parsed.bonds).toHaveLength(4);
    // Every perceived bond is carbon-to-hydrogen; no H-H edges.
    expect(parsed.bonds.every((b) => (b.a === 0) !== (b.b === 0))).toBe(true);
  });

  test("produces a molfile 3Dmol can consume (z is written, not defaulted to 0)", () => {
    const text = importStructure3D("methane.xyz", METHANE_XYZ);
    const lines = text.split("\n");
    // Line 4 is the carbon (all zeros); line 5 is the first hydrogen, whose
    // z is the one that would silently vanish if only x/y were written.
    // V2000 atom coordinates are 4-decimal, so 0.629118 lands as 0.6291.
    expect(lines[5].slice(20, 30).trim()).toBe("0.6291");
    expect(text).toContain("M  END");
  });

  test("rejects a file whose atom count doesn't match its lines", () => {
    const bad = "5\nmethane\nC 0 0 0\nH 1 1 1\n";
    expect(() => importStructure3D("bad.xyz", bad)).toThrow();
  });

  test("rejects a non-numeric atom count", () => {
    expect(() => importStructure3D("bad.xyz", "notanumber\ncomment\nC 0 0 0\n")).toThrow();
  });
});

describe("importStructure3D — PDB", () => {
  const GLYCINE_PDB = [
    "ATOM      1  N   MET A   1      -1.994   0.047  -0.351  1.00  0.00           N",
    "ATOM      2  CA  MET A   1      -0.517   0.223   0.426  1.00  0.00           C",
    "ATOM      3  C   MET A   1       0.716  -0.663   0.176  1.00  0.00           C",
    "ATOM      4  O   MET A   1       0.661  -1.790   0.643  1.00  0.00           O",
    "END",
    "",
  ].join("\n");

  test("reads ATOM records and their element column", () => {
    const parsed = parseV2000(importStructure3D("met.pdb", GLYCINE_PDB));
    expect(parsed.atoms).toHaveLength(4);
    expect(parsed.atoms.map((a) => a.element)).toEqual(["N", "C", "C", "O"]);
  });

  test("uses CONECT records when present instead of perceiving bonds", () => {
    const withConect = GLYCINE_PDB.replace(
      "END",
      "CONECT    1    2    3\nCONECT    2    4\nEND"
    );
    const parsed = parseV2000(importStructure3D("met.pdb", withConect));
    expect(parsed.bonds).toHaveLength(3);
  });

  test("falls back to perception when there are no CONECT records", () => {
    const parsed = parseV2000(importStructure3D("met.pdb", GLYCINE_PDB));
    // N-CA, N-C and CA-C and CA-O are all within bonding distance here.
    expect(parsed.bonds.length).toBeGreaterThan(0);
  });

  test("reads the element from the element column, not the atom name", () => {
    // "CA" is a carbon alpha, not calcium — the element column is the only
    // disambiguator, and getting this wrong turns a protein into a metal.
    const parsed = parseV2000(importStructure3D("x.pdb", GLYCINE_PDB));
    expect(parsed.atoms[1].element).toBe("C");
  });

  test("rejects a file with no atoms", () => {
    expect(() => importStructure3D("empty.pdb", "REMARK nothing here\nEND\n")).toThrow();
  });
});

describe("importStructure3D — MOL", () => {
  const MOL = [
    "water",
    "  test",
    "",
    "  3  2  0  0  0  0  0  0  0  0999 V2000",
    "    0.0000    0.0000    0.0000 O   0  0",
    "    0.9584    0.0000    0.0000 H   0  0",
    "   -0.2396    0.9273    0.0000 H   0  0",
    "  1  2  1",
    "  1  3  1",
    "M  END",
  ].join("\n");

  test("reads atoms and the explicit bond block", () => {
    const parsed = parseV2000(importStructure3D("water.mol", MOL));
    expect(parsed.atoms).toHaveLength(3);
    expect(parsed.bonds).toHaveLength(2);
  });
});

describe("importStructure3D — format detection", () => {
  test("recognizes the supported extensions", () => {
    for (const n of ["a.xyz", "a.PDB", "a.mol", "a.sdf", "a.ent"]) {
      expect(isStructure3DFile(n)).toBe(true);
    }
  });

  test("rejects an unknown extension with an explanatory error", () => {
    expect(() => importStructure3D("drawing.png", "whatever")).toThrow(/expected \.xyz/);
  });
});

describe("perceiveBonds", () => {
  test("bonds a pair at the C-C distance but not one far apart", () => {
    const near = perceiveBonds(["C", "C"], [{ x: 0, y: 0, z: 0 }, { x: 1.54, y: 0, z: 0 }]);
    const far = perceiveBonds(["C", "C"], [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }]);
    expect(near).toHaveLength(1);
    expect(far).toHaveLength(0);
  });

  test("never bonds two hydrogens to each other", () => {
    // H-H contacts inside a dense structure are short but are not bonds;
    // without this guard methane's own hydrogens would sprout H-H edges.
    const bonds = perceiveBonds(["H", "H"], [{ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }]);
    expect(bonds).toHaveLength(0);
  });

  test("coincident atoms don't produce a zero-length bond", () => {
    expect(perceiveBonds(["C", "C"], [{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }])).toHaveLength(0);
  });

  test("bond indices are 1-based and each pair appears once", () => {
    const bonds = perceiveBonds(
      ["C", "C", "C"],
      [{ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 }, { x: 3.0, y: 0, z: 0 }]
    );
    expect(bonds.map((b) => b.a)).not.toContain(0);
    expect(new Set(bonds.map((b) => `${b.a}-${b.b}`)).size).toBe(bonds.length);
  });
});

describe("elementForSymbol", () => {
  test("normalizes case and returns null for unknowns", () => {
    expect(elementForSymbol("c")).toBe("C");
    expect(elementForSymbol("CL")).toBe("Cl");
    expect(elementForSymbol("Xx")).toBeNull();
  });
});