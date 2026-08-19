import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "./molecule";
import {
  computeFormula,
  computeMolecularWeight,
  effectiveValence,
  hasPlaceholderLabels,
  implicitH,
  isOverValent,
  isPlaceholderLabel,
} from "./valence";
import type { Molecule } from "../types/chemistry";

/** Builds a straight-chain molecule from a list of elements, bonded
 * sequentially (atoms[0]-atoms[1]-atoms[2]-...), all single bonds,
 * neutral, at arbitrary but distinct coordinates (the exact positions
 * never matter to valence/formula math — only the graph does). */
function chain(elements: string[]): Molecule {
  let mol = emptyMolecule();
  const ids = elements.map((_, i) => `a${i}`);
  elements.forEach((el, i) => {
    mol = addAtom(mol, ids[i], { x: i * 20, y: 0 }, el as never);
  });
  for (let i = 0; i < ids.length - 1; i++) {
    mol = addBond(mol, `b${i}`, ids[i], ids[i + 1]);
  }
  return mol;
}

describe("implicitH", () => {
  test("isolated carbon gets 4 implicit hydrogens (methane)", () => {
    const mol = addAtom(emptyMolecule(), "c1", { x: 0, y: 0 }, "C");
    expect(implicitH(mol, "c1")).toBe(4);
  });

  test("terminal carbon in an ethane-like chain gets 3", () => {
    const mol = chain(["C", "C"]);
    expect(implicitH(mol, "a0")).toBe(3);
    expect(implicitH(mol, "a1")).toBe(3);
  });

  test("interior carbon of a propane-like chain gets 2", () => {
    const mol = chain(["C", "C", "C"]);
    expect(implicitH(mol, "a1")).toBe(2);
  });

  test("terminal oxygen (as in an alcohol -OH) gets 1", () => {
    const mol = chain(["C", "O"]);
    expect(implicitH(mol, "a1")).toBe(1);
  });

  test("a fully substituted (quaternary) carbon gets 0", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "center", { x: 0, y: 0 }, "C");
    for (let i = 0; i < 4; i++) {
      mol = addAtom(mol, `arm${i}`, { x: i, y: i }, "C");
      mol = addBond(mol, `bond${i}`, "center", `arm${i}`);
    }
    expect(implicitH(mol, "center")).toBe(0);
  });

  test("a double bond uses up two bonding sites, not one", () => {
    // O=C, as in formaldehyde's carbon: valence 4, one double bond used (2),
    // leaves 2 implicit H (matching formaldehyde's real CH2O formula).
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "o1", { x: 20, y: 0 }, "O");
    mol = addBond(mol, "b1", "c1", "o1", 2);
    expect(implicitH(mol, "c1")).toBe(2);
  });

  test("a group atom (abbreviated substituent) never gets implicit H", () => {
    const mol = addAtom(emptyMolecule(), "g1", { x: 0, y: 0 }, "C", "Ph");
    expect(implicitH(mol, "g1")).toBe(0);
  });

  test("sulfur expands its valence to fit a drawn sulfoxide/sulfone pattern", () => {
    // Plain divalent -S- (thioether): 2 bonds drawn, 2 implicit H would be
    // wrong (S isn't terminal here) but a lone S atom with 2 single bonds
    // already uses its base valence exactly, so 0 implicit H is expected.
    const thioether = chain(["C", "S", "C"]);
    expect(implicitH(thioether, "a1")).toBe(0);

    // A sulfonyl-like S with two double bonds (order sum 4) shouldn't be
    // flagged as over-valent against the base valence of 2 — it should
    // resolve against the next EXPANDED_VALENCES candidate (4) instead,
    // leaving 0 implicit H rather than a nonsensical negative-cropped 0
    // that masks a real over-valence.
    let mol = emptyMolecule();
    mol = addAtom(mol, "s1", { x: 0, y: 0 }, "S");
    mol = addAtom(mol, "o1", { x: 10, y: 0 }, "O");
    mol = addAtom(mol, "o2", { x: -10, y: 0 }, "O");
    mol = addBond(mol, "b1", "s1", "o1", 2);
    mol = addBond(mol, "b2", "s1", "o2", 2);
    expect(implicitH(mol, "s1")).toBe(0);
    expect(isOverValent(mol, "s1")).toBe(false);
  });
});

describe("effectiveValence (charge adjustment)", () => {
  test("ammonium nitrogen (N+) gains a bonding site: 3 -> 4", () => {
    expect(effectiveValence("N", 1)).toBe(4);
  });

  test("alkoxide oxygen (O-) loses a bonding site: 2 -> 1", () => {
    expect(effectiveValence("O", -1)).toBe(1);
  });

  test("carbocation and carbanion both lose one site regardless of charge sign", () => {
    expect(effectiveValence("C", 1)).toBe(3);
    expect(effectiveValence("C", -1)).toBe(3);
  });

  test("valence never goes negative for a large charge", () => {
    expect(effectiveValence("O", -5)).toBe(0);
  });
});

describe("isOverValent", () => {
  test("a plain 4-bonded carbon is not over-valent", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "center", { x: 0, y: 0 }, "C");
    for (let i = 0; i < 4; i++) {
      mol = addAtom(mol, `arm${i}`, { x: i, y: i }, "C");
      mol = addBond(mol, `bond${i}`, "center", `arm${i}`);
    }
    expect(isOverValent(mol, "center")).toBe(false);
  });

  test("a 5-bonded carbon is flagged over-valent", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "center", { x: 0, y: 0 }, "C");
    for (let i = 0; i < 5; i++) {
      mol = addAtom(mol, `arm${i}`, { x: i, y: i }, "C");
      mol = addBond(mol, `bond${i}`, "center", `arm${i}`);
    }
    expect(isOverValent(mol, "center")).toBe(true);
  });

  test("ignoreValence suppresses the warning even when structurally over-valent", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "center", { x: 0, y: 0 }, "C");
    for (let i = 0; i < 5; i++) {
      mol = addAtom(mol, `arm${i}`, { x: i, y: i }, "C");
      mol = addBond(mol, `bond${i}`, "center", `arm${i}`);
    }
    mol = { ...mol, atoms: { ...mol.atoms, center: { ...mol.atoms.center, ignoreValence: true } } };
    expect(isOverValent(mol, "center")).toBe(false);
  });

  test("a group (abbreviated substituent) atom is never over-valent", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "center", { x: 0, y: 0 }, "C", "Ph");
    for (let i = 0; i < 5; i++) {
      mol = addAtom(mol, `arm${i}`, { x: i, y: i }, "C");
      mol = addBond(mol, `bond${i}`, "center", `arm${i}`);
    }
    expect(isOverValent(mol, "center")).toBe(false);
  });
});

describe("computeFormula", () => {
  test("ethanol: C2H6O in Hill order", () => {
    // C-C-O chain, each implicit-H filled to valence -> CH3-CH2-OH.
    const mol = chain(["C", "C", "O"]);
    expect(computeFormula(mol)).toBe("C2H6O");
  });

  test("a single isolated carbon is methane: CH4", () => {
    const mol = addAtom(emptyMolecule(), "c1", { x: 0, y: 0 }, "C");
    expect(computeFormula(mol)).toBe("CH4");
  });

  test("an empty molecule has an empty formula", () => {
    expect(computeFormula(emptyMolecule())).toBe("");
  });

  test("restricting to a subset of atomIds only counts those atoms", () => {
    const mol = chain(["C", "C", "O"]);
    // Just the terminal C-H3 fragment's own atom, in isolation, is
    // methane's formula (its neighbor bond doesn't exist in this subset,
    // so implicitH sees it as if it had no bonds at all... but implicitH
    // is computed against the FULL molecule per its own doc comment, so
    // this actually reflects the real fragment: CH3 as drawn (3 H, one
    // real bond to the rest excluded from the count).
    expect(computeFormula(mol, ["a0"])).toBe("CH3");
  });
});

describe("computeMolecularWeight", () => {
  test("methane's weight matches C + 4*H", () => {
    const mol = addAtom(emptyMolecule(), "c1", { x: 0, y: 0 }, "C");
    // ~16.04 g/mol for real methane (12.011 + 4*1.008)
    expect(computeMolecularWeight(mol)).toBeCloseTo(16.042, 2);
  });

  test("an empty molecule weighs 0", () => {
    expect(computeMolecularWeight(emptyMolecule())).toBe(0);
  });
});

describe("placeholder labels", () => {
  test("a typed generic placeholder (R, X, ...) is flagged", () => {
    let mol = addAtom(emptyMolecule(), "r1", { x: 0, y: 0 }, "C");
    mol = { ...mol, atoms: { ...mol.atoms, r1: { ...mol.atoms.r1, group: "R" } } };
    expect(isPlaceholderLabel(mol.atoms.r1)).toBe(true);
    expect(hasPlaceholderLabels(mol)).toBe(true);
  });

  test("a recognized abbreviated group is not a placeholder", () => {
    const mol = addAtom(emptyMolecule(), "ph1", { x: 0, y: 0 }, "C", "Ph");
    expect(isPlaceholderLabel(mol.atoms.ph1)).toBe(false);
    expect(hasPlaceholderLabels(mol)).toBe(false);
  });

  test("a plain element atom is never a placeholder", () => {
    const mol = addAtom(emptyMolecule(), "c1", { x: 0, y: 0 }, "C");
    expect(hasPlaceholderLabels(mol)).toBe(false);
  });
});
