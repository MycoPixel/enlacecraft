import { describe, expect, test } from "vitest";
import { emptyMolecule, addAtom, addBond, setAtomCharge } from "./molecule";
import { relevantIrBands, IR_BANDS, type IrBand } from "./irBands";
import type { Molecule } from "../types/chemistry";

/** Chain/ring builder: `nodes` is [element, ...], `edges` is [i, j, order]. */
function build(nodes: [string, number?][], edges: [number, number, 1 | 2 | 3][]): Molecule {
  let mol = emptyMolecule();
  nodes.forEach(([el, charge], i) => {
    mol = addAtom(mol, `a${i}`, { x: 40 * i, y: 0 }, el as never);
    if (charge) mol = setAtomCharge(mol, `a${i}`, charge);
  });
  edges.forEach(([i, j, order], k) => {
    mol = addBond(mol, `b${k}`, `a${i}`, `a${j}`, order);
  });
  return mol;
}

function keysFor(mol: Molecule): string[] {
  return relevantIrBands(mol).map((r) => r.band.key).sort();
}

function bandFor(mol: Molecule, key: string): IrBand | undefined {
  return IR_BANDS.find((b) => b.key === key);
}

describe("functional group detection", () => {
  test("acetone: a ketone carbonyl", () => {
    // CH3-C(=O)-CH3 — the carbonyl carbon needs *two* carbon neighbours to
    // be a ketone; with only one it has an implicit H and is an aldehyde.
    const mol = build(
      [["C"], ["C"], ["O"], ["C"]],
      [[0, 1, 1], [1, 2, 2], [1, 3, 1]],
    );
    expect(keysFor(mol)).toContain("bond.cDoubleO.ketone");
  });

  test("acetaldehyde: an aldehyde carbonyl, which sits higher", () => {
    // CH3-C(=O)H — one carbon neighbour, so the carbonyl keeps an implicit H.
    const mol = build([["C"], ["C"], ["O"]], [[0, 1, 1], [1, 2, 2]]);
    expect(keysFor(mol)).toContain("bond.cDoubleO.aldehyde");
    expect(keysFor(mol)).not.toContain("bond.cDoubleO.ketone");
  });

  test("an amide, whose C-N is a different neighbour from the C=O", () => {
    // The regression this guards: the nitrogen is never the double-bonded
    // endpoint, so a check on that endpoint alone can never find it.
    const mol = build([["C"], ["O"], ["N"]], [[0, 1, 2], [0, 2, 1]]);
    expect(keysFor(mol)).toContain("bond.cDoubleO.amide");
  });

  test("an ester and an acid are distinguished by the second oxygen's H count", () => {
    const ester = build([["C"], ["O"], ["O"], ["C"]], [[0, 1, 2], [0, 2, 1], [2, 3, 1]]);
    const acid = build([["C"], ["O"], ["O"]], [[0, 1, 2], [0, 2, 1]]);
    expect(keysFor(ester)).toContain("bond.cDoubleO.ester");
    expect(keysFor(acid)).toContain("bond.cDoubleO.acid");
  });

  test("a nitrile", () => {
    const mol = build([["C"], ["C"], ["N"]], [[0, 1, 1], [1, 2, 3]]);
    expect(keysFor(mol)).toContain("bond.cTripleN");
  });

  test("an alcohol gives both O-H and C-O", () => {
    const mol = build([["C"], ["O"]], [[0, 1, 1]]);
    expect(keysFor(mol)).toEqual(expect.arrayContaining(["bond.oh", "bond.cSingleO"]));
  });

  test("an ether gives C-O but no O-H", () => {
    const mol = build([["C"], ["O"], ["C"]], [[0, 1, 1], [1, 2, 1]]);
    expect(keysFor(mol)).toContain("bond.cSingleO");
    expect(keysFor(mol)).not.toContain("bond.oh");
  });

  test("benzene contributes the aromatic bands, and an aliphatic CH3 does not", () => {
    const ring = build(
      Array.from({ length: 6 }, () => ["C"] as [string]),
      [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]],
    );
    expect(keysFor(ring)).toEqual(
      expect.arrayContaining(["band.aromaticOop", "bond.cDoubleC.aromatic", "band.chSp2"]),
    );
    const ethane = build([["C"], ["C"]], [[0, 1, 1]]);
    expect(keysFor(ethane)).not.toContain("band.aromaticOop");
    expect(keysFor(ethane)).toContain("band.chSp3");
  });

  test("counts multiply, so a diketone can say 2 x C=O", () => {
    // CH3-CO-CO-CH3: both carbonyl carbons have two carbon neighbours.
    const mol = build(
      [["C"], ["C"], ["O"], ["C"], ["O"], ["C"]],
      [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 2], [3, 5, 1]],
    );
    const hit = relevantIrBands(mol).find((r) => r.band.key === "bond.cDoubleO.ketone");
    expect(hit?.count).toBe(2);
  });

  test("an abbreviated group suppresses its ring rather than being counted as carbon", () => {
    let mol = build(
      Array.from({ length: 6 }, () => ["C"] as [string]),
      [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]],
    );
    // "Ph" is one vertex with no real ring behind it.
    mol = { ...mol, atoms: { ...mol.atoms, a0: { ...mol.atoms.a0, group: "Ph" } } };
    expect(keysFor(mol)).not.toContain("band.aromaticOop");
  });

  test("an acyclic molecule still reports sp3 C-H", () => {
    const mol = build([["C"], ["C"], ["C"]], [[0, 1, 1], [1, 2, 1]]);
    expect(keysFor(mol)).toContain("band.chSp3");
    expect(keysFor(mol)).toContain("band.ch3Bend");
  });
});

describe("the correlation table itself", () => {
  test("every band key the detector emits exists in the table", () => {
    // A typo in a key would otherwise render as a raw i18n key in the panel.
    const emitted = new Set(
      IR_BANDS.map((b) => b.key).flatMap((k) => [k, k.split(".")[0] + ".generic"]),
    );
    for (const band of IR_BANDS) {
      expect(band.min).toBeLessThan(band.max);
      expect(band.max).toBeLessThanOrEqual(4000);
      expect(emitted.has(band.key)).toBe(true);
    }
  });

  test("the condensed-phase bands are flagged so the gas-phase caveat can be shown", () => {
    const oh = bandFor(build([["C"], ["O"]], [[0, 1, 1]]), "bond.oh");
    expect(oh?.condensedPhase).toBe(true);
    const cn = bandFor(build([["C"], ["C"], ["N"]], [[0, 1, 1], [1, 2, 3]]), "bond.cTripleN");
    expect(cn?.condensedPhase).toBeUndefined();
  });
});