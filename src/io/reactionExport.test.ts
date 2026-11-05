import { describe, expect, test } from "vitest";
import type { Atom, Bond, Molecule, ReactionScheme } from "../types/chemistry";
import {
  exportAllReactionSmiles,
  exportReactionSmiles,
  exportRxn,
  exportSdf,
  hasExportableReaction,
} from "./reactionExport";

function atom(id: string, element: Atom["element"], x: number): Atom {
  return { id, x, y: 0, element, charge: 0 };
}

function bond(id: string, a1: string, a2: string, order: Bond["order"] = 1): Bond {
  return { id, a1, a2, order, stereo: "none", doubleSide: "auto" };
}

function molecule(atoms: Atom[], bonds: Bond[], schemes?: ReactionScheme[]): Molecule {
  return {
    atoms: Object.fromEntries(atoms.map((a) => [a.id, a])),
    bonds: Object.fromEntries(bonds.map((b) => [b.id, b])),
    hapticBonds: {},
    aromaticRingDisplays: {},
    ...(schemes ? { schemes } : {}),
  };
}

/** Ethane on the left, ethanol on the right, one scheme connecting them. */
function reaction(): { mol: Molecule; scheme: ReactionScheme } {
  const mol = molecule(
    [
      atom("r1", "C", 0),
      atom("r2", "C", 42),
      atom("p1", "C", 300),
      atom("p2", "C", 342),
      atom("p3", "O", 384),
    ],
    [bond("rb", "r1", "r2"), bond("pb1", "p1", "p2"), bond("pb2", "p2", "p3")]
  );
  const scheme: ReactionScheme = {
    id: "s1",
    steps: [
      {
        id: "step1",
        reactantAtomIds: ["r1", "r2"],
        productAtomIds: ["p1", "p2", "p3"],
        arrowIds: ["arrow1"],
      },
    ],
  };
  return { mol: { ...mol, schemes: [scheme] }, scheme };
}

describe("exportSdf", () => {
  test("writes one record per connected structure", () => {
    const mol = molecule(
      [atom("a", "C", 0), atom("b", "O", 42), atom("c", "N", 500)],
      [bond("ab", "a", "b")]
    );
    const sdf = exportSdf(mol, "sample");

    expect(sdf.match(/^\$\$\$\$$/gm)).toHaveLength(2);
    expect(sdf.match(/M {2}END/g)).toHaveLength(2);
    expect(sdf).toContain("sample 1");
    expect(sdf).toContain("sample 2");
  });

  test("omits the numeric suffix when there is only one structure", () => {
    const mol = molecule([atom("a", "C", 0), atom("b", "O", 42)], [bond("ab", "a", "b")]);
    expect(exportSdf(mol, "ethanol")).toContain("ethanol\n  EnlaceCraft");
    expect(exportSdf(mol, "ethanol")).not.toContain("ethanol 1");
  });

  test("returns an empty string for an empty drawing", () => {
    expect(exportSdf(molecule([], []))).toBe("");
  });

  test("appends one data-field block per record, in fragment order", () => {
    const mol = molecule(
      [atom("a", "C", 0), atom("b", "O", 42), atom("c", "N", 500)],
      [bond("ab", "a", "b")],
    );
    const sdf = exportSdf(mol, "sample", {
      properties: [
        { Formula: "CH4O", "Molecular Weight": "32.04" },
        { Formula: "NH3", "Molecular Weight": "17.03" },
      ],
    });

    expect(sdf).toContain("> <Formula>\nCH4O\n\n");
    expect(sdf).toContain("> <Molecular Weight>\n32.04\n\n");
    expect(sdf).toContain("> <Formula>\nNH3\n\n");
    // Headers must come after M  END and before the record separator.
    expect(sdf.indexOf("M  END")).toBeLessThan(sdf.indexOf("> <Formula>"));
    expect(sdf.indexOf("> <Formula>")).toBeLessThan(sdf.indexOf("$$$$"));
  });

  test("skips blank property values and tolerates missing property entries", () => {
    const mol = molecule([atom("a", "C", 0), atom("b", "O", 42)], [bond("ab", "a", "b")]);
    const sdf = exportSdf(mol, "sample", {
      properties: [{ Formula: "CH4O", SMILES: "", "Molecular Weight": "" }],
    });

    expect(sdf).toContain("> <Formula>\nCH4O\n\n");
    expect(sdf).not.toContain("> <SMILES>");
    expect(sdf).not.toContain("> <Molecular Weight>");
    expect(sdf.endsWith("$$$$\n")).toBe(true);

    // Fewer property arrays than fragments is not an error: later records
    // simply carry no data fields.
    const partial = exportSdf(mol, "sample", { properties: [] });
    expect(partial).not.toContain("> <Formula>");
    expect(partial.endsWith("$$$$\n")).toBe(true);
  });
});

describe("exportRxn", () => {
  test("exports a scheme with one reactant and one product block", () => {
    const { mol } = reaction();
    const rxn = exportRxn(mol)!;

    expect(rxn.startsWith("$RXN\n")).toBe(true);
    expect(rxn).toContain("  EnlaceCraft\n");
    expect(rxn).toMatch(/\n {2}1 {2}1\n/);
    expect(rxn.match(/^\$MOL$/gm)).toHaveLength(2);
  });

  test("carries atom map numbers into each $MOL block", () => {
    const { mol } = reaction();
    const mapped: Molecule = {
      ...mol,
      atoms: {
        ...mol.atoms,
        r1: { ...mol.atoms.r1, mapNumber: 1 },
        p1: { ...mol.atoms.p1, mapNumber: 1 },
      },
    };
    const rxn = exportRxn(mapped)!;
    expect(rxn.match(/^M {2}MAP {2}1 {2}1 {2}1$/gm)).toHaveLength(2);
  });

  test("counts disconnected components on each side separately", () => {
    const mol = molecule(
      [
        atom("r1", "C", 0),
        atom("r2", "C", 42),
        atom("r3", "O", 300),
        atom("p1", "C", 600),
      ],
      [bond("rb", "r1", "r2")],
      [
        {
          id: "s",
          steps: [
            {
              id: "step",
              reactantAtomIds: ["r1", "r2", "r3"],
              productAtomIds: ["p1"],
              arrowIds: [],
            },
          ],
        },
      ]
    );
    const rxn = exportRxn(mol)!;
    expect(rxn).toMatch(/\n {2}2 {2}1\n/);
    expect(rxn.match(/^\$MOL$/gm)).toHaveLength(3);
  });

  test("returns null when there is no scheme", () => {
    expect(exportRxn(molecule([atom("a", "C", 0)], []))).toBeNull();
  });

  test("returns null when a scheme names no atoms at all", () => {
    const mol = molecule([], [], [
      { id: "s", steps: [{ id: "step", reactantAtomIds: [], productAtomIds: [], arrowIds: [] }] },
    ]);
    expect(exportRxn(mol)).toBeNull();
  });
});

describe("reaction SMILES", () => {
  test("writes reactants>>products", () => {
    const { mol } = reaction();
    expect(exportReactionSmiles(mol)).toBe("CC>>CCO");
  });

  test("writes atom map numbers as SMILES atom classes", () => {
    const { mol } = reaction();
    const mapped: Molecule = {
      ...mol,
      atoms: {
        ...mol.atoms,
        r1: { ...mol.atoms.r1, mapNumber: 1 },
        r2: { ...mol.atoms.r2, mapNumber: 2 },
        p1: { ...mol.atoms.p1, mapNumber: 1 },
        p2: { ...mol.atoms.p2, mapNumber: 2 },
      },
    };
    expect(exportReactionSmiles(mapped)).toBe("[CH3:1][CH3:2]>>[CH3:1][CH2:2]O");
  });

  test("returns null when either side is empty", () => {
    const mol = molecule(
      [atom("r1", "C", 0)],
      [],
      [{ id: "s", steps: [{ id: "step", reactantAtomIds: ["r1"], productAtomIds: [], arrowIds: [] }] }]
    );
    expect(exportReactionSmiles(mol)).toBeNull();
  });

  test("joins multiple schemes with newlines", () => {
    const { mol } = reaction();
    const second: ReactionScheme = {
      id: "s2",
      steps: [{ id: "step2", reactantAtomIds: ["p1", "p2", "p3"], productAtomIds: ["r1", "r2"], arrowIds: [] }],
    };
    expect(exportAllReactionSmiles({ ...mol, schemes: [...(mol.schemes ?? []), second] })).toBe(
      "CC>>CCO\nCCO>>CC"
    );
  });

  test("hasExportableReaction requires atoms on both sides", () => {
    const { mol } = reaction();
    expect(hasExportableReaction(mol)).toBe(true);
    expect(hasExportableReaction(molecule([atom("a", "C", 0)], []))).toBe(false);
    expect(
      hasExportableReaction(
        molecule([atom("a", "C", 0)], [], [
          { id: "s", steps: [{ id: "step", reactantAtomIds: ["a"], productAtomIds: [], arrowIds: [] }] },
        ])
      )
    ).toBe(false);
  });
});
