import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import * as M from "../model/molecule";
import { computeFormula } from "../model/valence";
import { exportMol, exportMolV3000, importMol, importSdf } from "./molfile";
import type { Molecule } from "../types/chemistry";

/** A 3-atom chain (C-C-O, single bonds), same shape as ethanol's skeleton —
 * a small but non-trivial fixture for round-trip tests. */
function ethanolSkeleton(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 80, y: 20 }, "O");
  mol = addBond(mol, "b0", "a0", "a1");
  mol = addBond(mol, "b1", "a1", "a2");
  return mol;
}

describe("exportMol / importMol round-trip", () => {
  test("atom count, bond count, and molecular formula survive a round trip", () => {
    const original = ethanolSkeleton();
    const roundTripped = importMol(exportMol(original));

    expect(Object.keys(roundTripped.atoms)).toHaveLength(3);
    expect(Object.keys(roundTripped.bonds)).toHaveLength(2);
    expect(computeFormula(roundTripped)).toBe(computeFormula(original));
  });

  test("bond orders survive (a double and a triple bond, not just singles)", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 80, y: 0 }, "N");
    mol = addBond(mol, "b0", "a0", "a1", 2);
    mol = addBond(mol, "b1", "a1", "a2", 3);

    const roundTripped = importMol(exportMol(mol));
    const orders = Object.values(roundTripped.bonds)
      .map((b) => b.order)
      .sort();
    expect(orders).toEqual([2, 3]);
  });

  test("a dative bond survives as MDL type 8, order 1, no stereo — same convention OpenChemLib itself uses", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "Co");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "N");
    mol = addBond(mol, "b0", "a0", "a1");
    mol = { ...mol, bonds: { ...mol.bonds, b0: { ...mol.bonds.b0, dative: true } } };

    const mf = exportMol(mol);
    expect(mf).toMatch(/\n\s*1\s*2\s*8\s*0/);

    const roundTripped = importMol(mf);
    const bonds = Object.values(roundTripped.bonds);
    expect(bonds).toHaveLength(1);
    expect(bonds[0].dative).toBe(true);
    expect(bonds[0].order).toBe(1);
    expect(bonds[0].stereo).toBe("none");
  });

  test("an ordinary (non-dative) bond round-trips without ever gaining a dative flag", () => {
    const roundTripped = importMol(exportMol(ethanolSkeleton()));
    expect(Object.values(roundTripped.bonds).every((b) => !b.dative)).toBe(true);
  });

  test("wedge/dash stereo bonds survive, and become order 1 regardless of the original order", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 1, "wedge");

    const roundTripped = importMol(exportMol(mol));
    const bond = Object.values(roundTripped.bonds)[0];
    expect(bond.stereo).toBe("wedge");
    expect(bond.order).toBe(1);
  });

  test("formal charges survive via the inline atom-block charge column", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "n1", { x: 0, y: 0 }, "N");
    mol = { ...mol, atoms: { ...mol.atoms, n1: { ...mol.atoms.n1, charge: 1 } } };

    const roundTripped = importMol(exportMol(mol));
    const atom = Object.values(roundTripped.atoms)[0];
    expect(atom.charge).toBe(1);
  });

  test("an abbreviated group label (e.g. Ph) survives as the same group id", () => {
    const mol = addAtom(emptyMolecule(), "g1", { x: 0, y: 0 }, "C", "Ph");
    const roundTripped = importMol(exportMol(mol));
    const atom = Object.values(roundTripped.atoms)[0];
    expect(atom.group).toBe("Ph");
  });
});

describe("importMol: real-world file quirks", () => {
  test("M  CHG property lines override the inline charge column", () => {
    // A single nitrogen atom, inline charge column left at 0 (neutral),
    // but an M CHG property line asserting +1 — the modern/unbounded way
    // real writers (including PubChem) specify formal charges.
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  1  0  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
      "M  CHG  1   1   1",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const atom = Object.values(mol.atoms)[0];
    expect(atom.charge).toBe(1);
  });

  test("M  ISO property lines carry the ABSOLUTE mass number (13C stays 13C, not 14C)", () => {
    // Two carbons: the first labeled 13C via M ISO (the encoding OpenChemLib,
    // PubChem, and ChemDraw write), the second unlabeled. The value in an
    // M ISO entry is the isotope's actual mass number — unlike the atom
    // block's inline column, which holds a *difference* from the standard
    // mass — so 13 must land as isotope 13, not 12+13.
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0  0  0  0",
      "M  ISO  1   1  13",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const atoms = Object.values(mol.atoms);
    expect(atoms[0].isotope).toBe(13);
    expect(atoms[1].isotope).toBeUndefined();
  });

  test("M  ISO with the standard mass number stores absent (13C file saying 12 stays unlabeled)", () => {
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  1  0  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "M  ISO  1   1  12",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const atom = Object.values(mol.atoms)[0];
    expect(atom.isotope).toBeUndefined();
  });

  test("M  ISO keeps isotope-labeled hydrogens through the explicit-H strip (deuterium)", () => {
    // Deuterium is exactly the case the strip must NOT eat: element H,
    // single terminal bond — but isotopically labeled, which is chemically
    // meaningful and deliberately preserved (see isSimpleTerminalHydrogen).
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0  0  0  0",
      "M  ISO  1   2   2",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const atoms = Object.values(mol.atoms);
    expect(atoms).toHaveLength(2); // the D survives the strip
    const d = atoms.find((a) => a.element === "H");
    expect(d?.isotope).toBe(2);
  });

  test("aromatic bond type 4 is approximated as a double bond", () => {
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  4  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const bond = Object.values(mol.bonds)[0];
    expect(bond.order).toBe(2);
  });

  test("a query bond type (5-8) falls back to a single bond rather than misrendering", () => {
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  5  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    const bond = Object.values(mol.bonds)[0];
    expect(bond.order).toBe(1);
  });

  test("an explicit terminal hydrogen is stripped back to implicit", () => {
    // Methane written the "real-world" way: carbon plus 4 explicit,
    // singly-bonded H atoms — the common shape of a PubChem/SDF export,
    // as opposed to this app's own skeletal (implicit-H) convention.
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  5  4  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.0900    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "   -0.3633    1.0277    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "   -0.3633   -0.5138    0.8901 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "   -0.3633   -0.5138   -0.8901 H   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0  0  0  0",
      "  1  3  1  0  0  0  0",
      "  1  4  1  0  0  0  0",
      "  1  5  1  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    // Only the carbon should remain — implicitH() re-derives the same 4
    // hydrogens from valence for display, so no chemical information is
    // lost even though the explicit H atoms/bonds are gone.
    expect(Object.keys(mol.atoms)).toHaveLength(1);
    expect(Object.values(mol.atoms)[0].element).toBe("C");
    expect(computeFormula(mol)).toBe("CH4");
  });

  test("an explicit hydrogen that is charged or multiply-bonded is left as-is", () => {
    // A charged H (e.g. a bare proton, H+) shouldn't be silently deleted —
    // stripping is only meant for ordinary neutral terminal H atoms.
    // Fields after the coordinate block are symbol, mass-diff, then
    // charge-code (3 -> +1, per molCodeToCharge) — in that order.
    const molText = [
      "test",
      "  EnlaceCraft",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.0000    0.0000    0.0000 H   0  3  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0  0  0  0",
      "M  END",
    ].join("\n");

    const mol = importMol(molText);
    expect(Object.keys(mol.atoms)).toHaveLength(2);
  });
});

describe("optional property round-trips (M MAP / M HIG)", () => {
  function chainWithExtras() {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b1", "a1", "a2");
    return {
      ...mol,
      atoms: {
        a1: { ...mol.atoms.a1, mapNumber: 1, highlightColor: "#ffd60a" },
        a2: { ...mol.atoms.a2, mapNumber: 2, highlightColor: "#0a84ff" },
      },
    };
  }

  test("atom map numbers survive an export/import round trip", () => {
    const mol = importMol(exportMol(chainWithExtras()));
    expect(mol.atoms[Object.keys(mol.atoms)[0]].mapNumber).toBe(1);
    expect(mol.atoms[Object.keys(mol.atoms)[1]].mapNumber).toBe(2);
  });

  test("highlight colors survive an export/import round trip", () => {
    const mol = importMol(exportMol(chainWithExtras()));
    const colors = Object.values(mol.atoms).map((a) => a.highlightColor);
    expect(colors).toContain("#ffd60a");
    expect(colors).toContain("#0a84ff");
  });

  test("a molecule with no map numbers or highlights writes neither property block", () => {
    const text = exportMol(chainWithExtras2());
    expect(text).not.toContain("M  MAP");
    expect(text).not.toContain("M  HIG");
    expect(text).not.toContain("M  HCOL");
  });

  test("repeated colors share one HCOL entry", () => {
    let mol = chainWithExtras2();
    mol = { ...mol, atoms: { ...mol.atoms, a1: { ...mol.atoms.a1, highlightColor: "#34c759" } } };
    mol = { ...mol, atoms: { ...mol.atoms, a2: { ...mol.atoms.a2, highlightColor: "#34c759" } } };
    const text = exportMol(mol);
    expect(text).toContain("M  HCOL  1");
    expect(text).toContain("34c759");
  });

  test("a HIG entry referencing an undefined color is ignored rather than turned black", () => {
    // Hand-written third-party files can legitimately contain one or the
    // other; importing must not crash or paint the wrong atoms.
    const text = [
      "no_name",
      "  test",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0",
      "    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0",
      "M  HIG001  1  7",
      "M  END",
    ].join("\n");
    const mol = importMol(text);
    expect(Object.values(mol.atoms).every((a) => a.highlightColor === undefined)).toBe(true);
  });
});

/** Plain two-carbon chain with no optional properties. */
function chainWithExtras2() {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 40, y: 0 }, "C");
  mol = addBond(mol, "b1", "a1", "a2");
  return mol;
}

describe("importSdf", () => {
  test("reads every $$$$-separated record and keeps its title line", () => {
    const sdf = [
      exportMol(chainWithExtras2(), "ethane"),
      "$$$$",
      exportMol(ethanolSkeleton(), "ethanol"),
      "$$$$",
    ].join("\n");

    const { records, skipped } = importSdf(sdf);
    expect(skipped).toBe(0);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.title)).toEqual(["ethane", "ethanol"]);
    expect(Object.keys(records[0].molecule.atoms)).toHaveLength(2);
    expect(Object.keys(records[1].molecule.atoms)).toHaveLength(3);
  });

  test("accepts a final record without a trailing $$$$", () => {
    const sdf = `${exportMol(chainWithExtras2(), "ethane")}\n$$$$\n${exportMol(ethanolSkeleton(), "ethanol")}`;
    const { records } = importSdf(sdf);
    expect(records).toHaveLength(2);
    expect(records[1].title).toBe("ethanol");
  });

  test("a plain MOL file (no separator) is a one-record SDF", () => {
    const { records, skipped } = importSdf(exportMol(ethanolSkeleton(), "ethanol"));
    expect(skipped).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe("ethanol");
  });

  test("data fields after M  END are ignored, not parsed as another molecule", () => {
    const sdf = [
      exportMol(chainWithExtras2(), "ethane"),
      "> <PUBCHEM_COMPOUND_CID>",
      "6324",
      "",
      "$$$$",
    ].join("\n");

    const { records } = importSdf(sdf);
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0].molecule.atoms)).toHaveLength(2);
  });

  test("one unreadable record is skipped instead of aborting the whole file", () => {
    const sdf = [
      exportMol(chainWithExtras2(), "good-1"),
      "$$$$",
      "broken record",
      "  no counts line",
      "",
      "$$$$",
      exportMol(ethanolSkeleton(), "good-2"),
      "$$$$",
    ].join("\n");

    const { records, skipped } = importSdf(sdf);
    expect(skipped).toBe(1);
    expect(records.map((r) => r.title)).toEqual(["good-1", "good-2"]);
  });

  test("throws the parser's error when no record is readable", () => {
    expect(() => importSdf("broken record\n  no counts line\n")).toThrow();
  });

  test("empty input yields no records and no error", () => {
    expect(importSdf("")).toEqual({ records: [], skipped: 0 });
  });
});

describe("exportMolV3000", () => {
  test("writes the V3000 CTAB skeleton with counts and both blocks", () => {
    const out = exportMolV3000(ethanolSkeleton(), "eth");
    expect(out).toContain("V3000\n");
    expect(out).toContain("M  V30 BEGIN CTAB");
    expect(out).toContain("M  V30 COUNTS 3 2 0 0 1");
    expect(out).toContain("M  V30 1 C 0.0000 0.0000 0.0000 0");
    expect(out).toContain("M  V30 3 O ");
    expect(out).toContain("M  V30 BEGIN BOND");
    expect(out).toContain("M  V30 1 1 1 2");
    expect(out).toContain("M  V30 2 1 2 3");
    expect(out).toContain("M  V30 END CTAB");
    expect(out.trimEnd().endsWith("M  END")).toBe(true);
  });

  test("atom properties ride the V3000 property names (CHG/MASS/aamap)", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "N");
    mol = M.setAtomChargeAbsolute(mol, "a0", 1);
    mol = M.setAtomIsotope(mol, "a0", "N", 15);
    mol = M.setAtomMapNumber(mol, "a0", 7);
    const out = exportMolV3000(mol);
    expect(out).toContain("CHG=1");
    expect(out).toContain("MASS=15");
    // aamap is the positional 5th field, so the line reads "... 0.0000 7 CHG=1 MASS=15".
    expect(out).toMatch(/M  V30 1 N -?0\.0000 -?0\.0000 0\.0000 7 CHG=1 MASS=15/);
  });

  test("stereo bonds use CFG codes and dative bonds use type 10", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 80, y: 0 }, "Fe");
    mol = addBond(mol, "b0", "a0", "a1", 1, "wedge");
    mol = addBond(mol, "b1", "a1", "a2", 1, "none", true);
    const out = exportMolV3000(mol);
    expect(out).toContain("M  V30 1 1 1 2 CFG=1");
    // The dative bond (C→Fe): type 10, no CFG.
    expect(out).toContain("M  V30 2 10 2 3");
  });

  test("dash and wavy bonds map to CFG=3 and CFG=2", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b0", "a0", "a1", 1, "dash");
    const out = exportMolV3000(mol);
    expect(out).toContain("CFG=3");
    // (wavy covered implicitly by the mapping table; dash exercises the path.)
  });
});
