import { describe, expect, test } from "vitest";
import { addAtom, addBond, addHapticBond, emptyMolecule } from "./molecule";
import {
  computeFormula,
  computeMolecularWeight,
  effectiveValence,
  findConnectedFragments,
  hasPlaceholderLabels,
  implicitH,
  isOverValent,
  isPlaceholderLabel,
  usedValence,
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

  test("group 13 is the mirror of carbon: B-/Al- gain a site, B+/Al3+ lose them", () => {
    expect(effectiveValence("B", -1)).toBe(4); // BH4-, BF4-
    expect(effectiveValence("Al", -1)).toBe(4); // AlH4-
    expect(effectiveValence("B", 1)).toBe(2); // borenium
    expect(effectiveValence("Al", 3)).toBe(0); // bare Al3+
  });

  test("simple cations and hydride/proton have no bonding sites", () => {
    expect(effectiveValence("Na", 1)).toBe(0);
    expect(effectiveValence("Li", 1)).toBe(0);
    expect(effectiveValence("Mg", 2)).toBe(0);
    expect(effectiveValence("Ca", 2)).toBe(0);
    expect(effectiveValence("H", 1)).toBe(0);
    expect(effectiveValence("H", -1)).toBe(0);
  });

  test("heavier group 14 behaves like carbon", () => {
    expect(effectiveValence("Sn", 4)).toBe(0);
    expect(effectiveValence("Ge", -1)).toBe(3);
    expect(effectiveValence("Pb", 2)).toBe(2);
  });
});

/** Single atom with a formal charge, for ion tests. */
function ion(element: string, charge: number): Molecule {
  const mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, element as never);
  mol.atoms["a"] = { ...mol.atoms["a"], charge };
  return mol;
}

describe("simple ions get no phantom hydrogens", () => {
  test.each([
    ["Na", 1, "Na"],
    ["K", 1, "K"],
    ["Mg", 2, "Mg"],
    ["Ca", 2, "Ca"],
    ["Al", 3, "Al"],
    ["H", 1, "H"],
    ["Cl", -1, "Cl"],
  ])("%s with charge %i has no implicit H", (el, charge, formula) => {
    const mol = ion(el, charge);
    expect(implicitH(mol, "a")).toBe(0);
    expect(computeFormula(mol)).toBe(formula);
  });

  test("hydride borate BH4- fills to four hydrogens", () => {
    expect(implicitH(ion("B", -1), "a")).toBe(4);
    expect(implicitH(ion("Al", -1), "a")).toBe(4);
  });

  test("ammonium and hydronium still work", () => {
    expect(implicitH(ion("N", 1), "a")).toBe(4);
    expect(implicitH(ion("O", 1), "a")).toBe(3);
  });
});

/** Central atom bonded to `arms` terminal atoms; `orders[i]` is the bond
 * order to arm i (defaults to single). */
function star(center: string, arms: string[], orders: number[] = [], charge = 0): Molecule {
  let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, center as never);
  mol.atoms["c"] = { ...mol.atoms["c"], charge };
  arms.forEach((el, i) => {
    mol = addAtom(mol, `x${i}`, { x: 20 * (i + 1), y: 10 * i }, el as never);
    mol = addBond(mol, `b${i}`, "c", `x${i}`, (orders[i] ?? 1) as never);
  });
  return mol;
}

describe("boron/aluminium anions and hypervalent main-group centers", () => {
  test("BF4- is not over-valent", () => {
    const mol = star("B", ["F", "F", "F", "F"], [], -1);
    expect(isOverValent(mol, "c")).toBe(false);
    expect(implicitH(mol, "c")).toBe(0);
  });

  test("BF5 2- style over-bonding on boron is still flagged", () => {
    expect(isOverValent(star("B", ["F", "F", "F", "F", "F"], [], -1), "c")).toBe(true);
  });

  test("perchlorate: Cl with three S=O-type double bonds and one single is valence 7", () => {
    const mol = star("Cl", ["O", "O", "O", "O"], [2, 2, 2, 1]);
    expect(isOverValent(mol, "c")).toBe(false);
    expect(implicitH(mol, "c")).toBe(0);
  });

  test("hypervalent iodine(III), e.g. PhI(OAc)2, is fine with three bonds", () => {
    const mol = star("I", ["C", "O", "O"]);
    expect(isOverValent(mol, "c")).toBe(false);
    expect(implicitH(mol, "c")).toBe(0);
  });

  test("iodine(V), e.g. IBX/DMP-like, is fine with five bonds", () => {
    const mol = star("I", ["C", "O", "O", "O"], [1, 2, 1, 1]);
    expect(isOverValent(mol, "c")).toBe(false);
  });

  test("xenon difluoride and tetrafluoride are valid; a lone Xe gets no H", () => {
    expect(isOverValent(star("Xe", ["F", "F"]), "c")).toBe(false);
    expect(isOverValent(star("Xe", ["F", "F", "F", "F"]), "c")).toBe(false);
    expect(implicitH(star("Xe", []), "c")).toBe(0);
  });

  test("selenium dioxide (Se=O x2) is fine", () => {
    expect(isOverValent(star("Se", ["O", "O"], [2, 2]), "c")).toBe(false);
  });

  test("a halogen bridging two atoms (C-Br-C) is STILL flagged, with no phantom H", () => {
    // The classic student error. Halogens only go up in pairs, so 2 bonds on a
    // neutral Cl/Br/I is not a valid state and must not resolve to valence 3.
    for (const hal of ["Cl", "Br", "I"]) {
      const mol = star(hal, ["C", "C"]);
      expect(isOverValent(mol, "c")).toBe(true);
      expect(implicitH(mol, "c")).toBe(0);
    }
  });

  test("bromonium / iodonium cations (X+ with two bonds) are valid", () => {
    expect(isOverValent(star("Br", ["C", "C"], [], 1), "c")).toBe(false);
    expect(isOverValent(star("I", ["C", "C"], [], 1), "c")).toBe(false);
  });

  test("a plain terminal halogen still gets one implicit H when alone (HCl)", () => {
    expect(implicitH(ion("Cl", 0), "a")).toBe(1);
    expect(implicitH(star("Cl", ["C"]), "c")).toBe(0);
  });

  test("halogens above the highest candidate are flagged", () => {
    expect(isOverValent(star("Cl", ["O", "O", "O", "O", "O"], [2, 2, 2, 2, 2]), "c")).toBe(true);
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

describe("dative bonds and valence", () => {
  test("a dative bond doesn't count toward either endpoint's used valence", () => {
    // NH3 already fully valence-satisfied by its 3 real N-H bonds, plus a
    // dative bond out to a cobalt center — that 4th connection shouldn't
    // push nitrogen's used valence past 3, or it'd be (wrongly) flagged
    // overvalent for something entirely normal in a coordination compound.
    let mol = emptyMolecule();
    mol = addAtom(mol, "n", { x: 0, y: 0 }, "N");
    mol = addAtom(mol, "h1", { x: 10, y: 0 }, "H");
    mol = addAtom(mol, "h2", { x: 20, y: 0 }, "H");
    mol = addAtom(mol, "h3", { x: 30, y: 0 }, "H");
    mol = addAtom(mol, "co", { x: 40, y: 0 }, "Co");
    mol = addBond(mol, "b1", "n", "h1");
    mol = addBond(mol, "b2", "n", "h2");
    mol = addBond(mol, "b3", "n", "h3");
    mol = addBond(mol, "b4", "n", "co");
    mol = { ...mol, bonds: { ...mol.bonds, b4: { ...mol.bonds.b4, dative: true } } };

    expect(usedValence(mol, "n")).toBe(3);
    expect(implicitH(mol, "n")).toBe(0);
    expect(isOverValent(mol, "n")).toBe(false);
  });

  test("a bare atom with only a dative bond still gets its normal implicit hydrogens", () => {
    // A lone N with nothing but a dative bond to a metal should still
    // auto-complete to what it'd look like as a free ligand (NH3), not be
    // treated as if the dative bond already used up a valence slot.
    let mol = emptyMolecule();
    mol = addAtom(mol, "n", { x: 0, y: 0 }, "N");
    mol = addAtom(mol, "co", { x: 10, y: 0 }, "Co");
    mol = addBond(mol, "b1", "n", "co");
    mol = { ...mol, bonds: { ...mol.bonds, b1: { ...mol.bonds.b1, dative: true } } };

    expect(usedValence(mol, "n")).toBe(0);
    expect(implicitH(mol, "n")).toBe(3);
  });

  test("a transition metal is still exempt from over-valence regardless of how many dative bonds it has", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "co", { x: 0, y: 0 }, "Co");
    const ligandIds = ["n1", "n2", "n3", "n4", "n5", "n6"];
    ligandIds.forEach((id, i) => {
      mol = addAtom(mol, id, { x: (i + 1) * 10, y: 0 }, "N");
      const bondId = `b${i}`;
      mol = addBond(mol, bondId, "co", id);
      mol = { ...mol, bonds: { ...mol.bonds, [bondId]: { ...mol.bonds[bondId], dative: true } } };
    });

    expect(isOverValent(mol, "co")).toBe(false);
  });
});

describe("findConnectedFragments and haptic bonds", () => {
  test("a metal and its ring, connected only by a haptic bond, count as one fragment", () => {
    // Ferrocene-shaped: Fe with no ordinary bonds to a 5-membered C ring,
    // linked only via a haptic bond \u2014 without hapticAdjacency in
    // findConnectedFragments, this would wrongly come back as 2 fragments
    // (bare Fe, and the ring), splitting its formula/MW/descriptors in
    // useFormulaDisplay/useMoleculeDescriptors as if they were unrelated.
    let mol = emptyMolecule();
    mol = addAtom(mol, "fe", { x: 0, y: 0 }, "Fe");
    const ringIds = ["c1", "c2", "c3", "c4", "c5"];
    ringIds.forEach((id, i) => { mol = addAtom(mol, id, { x: 40 + i * 10, y: i * 5 }, "C"); });
    for (let i = 0; i < ringIds.length; i++) {
      mol = addBond(mol, `rb${i}`, ringIds[i], ringIds[(i + 1) % ringIds.length]);
    }
    mol = addHapticBond(mol, "hb1", "fe", ringIds);

    const fragments = findConnectedFragments(mol);
    expect(fragments).toHaveLength(1);
    expect(fragments[0].sort()).toEqual(["c1", "c2", "c3", "c4", "c5", "fe"]);
  });

  test("without any haptic bond, a bare metal and an unrelated ring are still separate fragments", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "fe", { x: 0, y: 0 }, "Fe");
    mol = addAtom(mol, "c1", { x: 100, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: 110, y: 0 }, "C");
    mol = addBond(mol, "rb0", "c1", "c2");

    expect(findConnectedFragments(mol)).toHaveLength(2);
  });
});
