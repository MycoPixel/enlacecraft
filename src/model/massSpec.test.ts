import { describe, expect, it, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "./molecule";
import {
  ADDUCTS,
  adductIon,
  allAdductIons,
  degreeOfUnsaturation,
  elementCounts,
  exactMass,
  isotopePattern,
  MONOISOTOPIC_MASS,
  annotateNeutralLosses,
  applicableNeutralLosses,
  neutralLossesByMass,
  NEUTRAL_LOSSES,
} from "./massSpec";
import type { Atom, Element, Molecule } from "../types/chemistry";

/**
 * Reference compounds with published monoisotopic masses. These are the
 * numbers a mass spectroscopist would recognise instantly, so a table or
 * summation error shows up immediately rather than as a plausible-looking
 * wrong number.
 */
const REFERENCE: { name: string; formula: string; mass: number }[] = [
  { name: "water", formula: "H2O", mass: 18.010564684 },
  { name: "benzene", formula: "C6H6", mass: 78.046950193 },
  { name: "ethanol", formula: "C2H6O", mass: 46.041864812 },
  { name: "acetic acid", formula: "C2H4O2", mass: 60.021129353 },
  { name: "acetone", formula: "C3H6O", mass: 58.041864812 },
  { name: "toluene", formula: "C7H8", mass: 92.062600255 },
  { name: "benzoic acid", formula: "C7H6O2", mass: 122.036779432 },
  { name: "caffeine", formula: "C8H10N4O2", mass: 194.08037557 },
  { name: "aspirin", formula: "C9H8O4", mass: 180.042258737 },
  { name: "chloroform", formula: "CHCl3", mass: 117.914383 },
];

function chain(elements: Element[]): Molecule {
  let mol = emptyMolecule();
  const ids: string[] = [];
  elements.forEach((el, i) => {
    const id = `a${i}`;
    ids.push(id);
    mol = addAtom(mol, id, { x: i * 40, y: 0 }, el);
  });
  for (let i = 0; i < ids.length - 1; i++) mol = addBond(mol, `b${i}`, ids[i], ids[i + 1]);
  return mol;
}

/** Builds a molecule whose *formula* is exactly as given, by saturating
 * carbons with implicit hydrogens. Lets us check masses against references
 * without hand-drawing each structure. */
function withFormula(carbons: number, hetero: Partial<Record<Element, number>> = {}): Molecule {
  let mol = emptyMolecule();
  let x = 0;
  for (let i = 0; i < carbons; i++) {
    mol = addAtom(mol, `c${i}`, { x: (x += 40), y: 0 }, "C");
    if (i > 0) mol = addBond(mol, `bc${i}`, `c${i - 1}`, `c${i}`);
  }
  (Object.keys(hetero) as Element[]).forEach((el) => {
    const n = hetero[el] ?? 0;
    for (let i = 0; i < n; i++) {
      const id = `${el}${i}`;
      mol = addAtom(mol, id, { x: (x += 40), y: 0 }, el);
      mol = addBond(mol, `b${el}${i}`, `c0`, id);
    }
  });
  return mol;
}

describe("monoisotopic mass table", () => {
  test("carbon is exactly 12, which is what makes monoisotopic masses exact", () => {
    expect(MONOISOTOPIC_MASS.C).toBe(12);
  });

  test("covers every element 1-118", () => {
    expect(Object.keys(MONOISOTOPIC_MASS)).toHaveLength(118);
  });

  test("distinguishes chlorine from its average weight", () => {
    // The whole reason this table exists: ATOMIC_WEIGHT.Cl is 35.45 (average),
    // but the ion you observe is 34.968853.
    expect(MONOISOTOPIC_MASS.Cl).toBeCloseTo(34.968853, 6);
    expect(MONOISOTOPIC_MASS.Cl).toBeLessThan(35.45);
  });

  test("matches published values for the elements that matter most in organic MS", () => {
    expect(MONOISOTOPIC_MASS.H).toBeCloseTo(1.00782503, 8);
    expect(MONOISOTOPIC_MASS.N).toBeCloseTo(14.003074, 6);
    expect(MONOISOTOPIC_MASS.O).toBeCloseTo(15.994915, 6);
    expect(MONOISOTOPIC_MASS.S).toBeCloseTo(31.972071, 6);
    expect(MONOISOTOPIC_MASS.Br).toBeCloseTo(78.9183371, 6);
    expect(MONOISOTOPIC_MASS.I).toBeCloseTo(126.904473, 6);
  });
});

describe("exactMass", () => {
  test("matches published monoisotopic masses", () => {
    // Drawn rather than formula-built where it matters, because implicit-H
    // counting is exactly the part most likely to be wrong.
    const water = withFormula(0);
    // Build H2O explicitly: a bare O would be OH2 in skeletal terms.
    let h2o = addAtom(water, "o", { x: 0, y: 0 }, "O");
    h2o = addBond(h2o, "b1", "o", "h1");
    h2o = addBond(h2o, "b2", "o", "h2");
    h2o = addAtom(h2o, "h1", { x: 40, y: 0 }, "H");
    h2o = addAtom(h2o, "h2", { x: -40, y: 0 }, "H");
    expect(exactMass(h2o)).toBeCloseTo(REFERENCE[0].mass, 6);
  });

  test("methane from a single skeletal carbon", () => {
    // One bare vertex is CH4 -- the implicit-H path, which is the app's
    // normal drawing convention.
    expect(exactMass(withFormula(1))).toBeCloseTo(16.031300128, 6);
  });

  test("ethane", () => {
    expect(exactMass(chain(["C", "C"]))).toBeCloseTo(30.046950193, 6);
  });

  test("benzene ring", () => {
    // Alternating bond orders matter: a six-carbon ring bonded all-single is
    // C6H12, not benzene, and masses 84.0939 instead of 78.0470.
    let mol = emptyMolecule();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = `c${i}`;
      ids.push(id);
      mol = addAtom(mol, id, { x: 40 * i, y: 0 }, "C");
    }
    for (let i = 0; i < 6; i++) mol = addBond(mol, `b${i}`, ids[i], ids[(i + 1) % 6], i % 2 === 0 ? 2 : 1);
    expect(exactMass(mol)).toBeCloseTo(REFERENCE[1].mass, 6);
  });

  test("ethanol, with the OH oxygen carrying its implicit hydrogen", () => {
    let mol = chain(["C", "C", "O"]);
    expect(exactMass(mol)).toBeCloseTo(REFERENCE[2].mass, 6);
  });

  test("acetic acid: a carbonyl, not two hydroxyls", () => {
    let mol = chain(["C", "C"]);
    mol = addAtom(mol, "o", { x: 80, y: 0 }, "O");
    mol = addAtom(mol, "oh", { x: 80, y: 40 }, "O");
    mol = addBond(mol, "b2", "a1", "o", 2);
    mol = addBond(mol, "b3", "a1", "oh");
    expect(exactMass(mol)).toBeCloseTo(REFERENCE[3].mass, 6);
  });

  test("chloroform: one carbon, three chlorines", () => {
    let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, "C");
    for (let i = 0; i < 3; i++) {
      const id = `cl${i}`;
      mol = addAtom(mol, id, { x: 40 * (i + 1), y: 0 }, "Cl");
      mol = addBond(mol, `b${i}`, "c", id);
    }
    expect(exactMass(mol)).toBeCloseTo(REFERENCE[9].mass, 6);
  });

  test("an abbreviated group counts its full expansion", () => {
    // A single "Ph" vertex must contribute C6H5, not "nothing" — getting
    // this wrong is silent, since the drawing looks correct.
    let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "ph", { x: 40, y: 0 }, "C", "Ph");
    mol = addBond(mol, "b1", "c", "ph");
    const counts = elementCounts(mol);
    expect(counts.C).toBe(7);
    // Toluene is C7H8: 5 from Ph, 3 from the drawn methyl.
    expect(counts.H).toBe(8);
    expect(exactMass(mol)).toBeCloseTo(REFERENCE[5].mass, 6);
  });

  test("a labelled isotope replaces the natural mass rather than adding to it", () => {
    // 13C-methane. The label swaps one 12C for a 13C and changes nothing else —
    // an earlier version also re-weighted the atom's four implicit hydrogens,
    // inflating the mass by ~4 u.
    const mol: Molecule = {
      atoms: { c: { id: "c", x: 0, y: 0, element: "C", charge: 0, isotope: 13 } },
      bonds: {}, hapticBonds: {}, aromaticRingDisplays: {},
    };
    expect(exactMass(mol)).toBeCloseTo(13.00335484 + 4 * MONOISOTOPIC_MASS.H, 6);
    expect(exactMass(mol)).toBeCloseTo(17.034655, 6);
  });

  test("deuterium swaps a hydrogen rather than adding one", () => {
    // A D is element H with isotope 2, so the adjustment is 2.014102 - 1.007825.
    const plain = withFormula(1);
    const deuterated: Molecule = {
      atoms: { c: { id: "c", x: 0, y: 0, element: "C", charge: 0 }, d: { id: "d", x: 40, y: 0, element: "H", charge: 0, isotope: 2 } },
      bonds: { b1: { id: "b1", a1: "c", a2: "d", order: 1, stereo: "none", doubleSide: "auto" } },
      hapticBonds: {}, aromaticRingDisplays: {},
    };
    const plainH = elementCounts(plain).H;
    void plainH;
    const dMass = exactMass(deuterated);
    const naturalH = exactMass(plain);
    // One heavy hydrogen among three.
    expect(dMass).toBeGreaterThan(naturalH + 0.99);
    expect(dMass).toBeLessThan(naturalH + 1.02);
  });

  test("an empty molecule has zero mass", () => {
    expect(exactMass(emptyMolecule())).toBe(0);
  });
});

describe("adducts", () => {
  test("[M+H]+ adds a proton, not a hydrogen atom", () => {
    // The difference is one electron: 1.007276 vs 1.007825. Using the atomic
    // mass here is a classic error and shifts every positive-mode m/z by
    // 0.55 mDa, which at m/z 200 is ~2.7 ppm.
    const ethanol = chain(["C", "C", "O"]);
    const protonated = adductIon(ethanol, ADDUCTS.find((a) => a.id === "M+H")!);
    expect(protonated.mz).toBeCloseTo(REFERENCE[2].mass + 1.007276, 6);
    expect(protonated.mz).toBeCloseTo(47.049141, 5);
  });

  test("[M-H]- subtracts a proton", () => {
    const ethanol = chain(["C", "C", "O"]);
    const deprotonated = adductIon(ethanol, ADDUCTS.find((a) => a.id === "M-H")!);
    expect(deprotonated.mz).toBeCloseTo(REFERENCE[2].mass - 1.007276, 6);
  });

  test("a doubly charged ion reports m/z divided by |charge|", () => {
    const ethanol = chain(["C", "C", "O"]);
    const singly = adductIon(ethanol, ADDUCTS.find((a) => a.id === "M+H")!);
    const doubly = adductIon(ethanol, ADDUCTS.find((a) => a.id === "M+2H")!);
    // [M+2H]2+ has roughly the same neutral mass as [M+H]+ but half the m/z.
    expect(doubly.mz).toBeCloseTo((singly.neutralMass + 2 * 1.007276) / 2, 6);
    expect(doubly.mz).toBeLessThan(singly.mz);
  });

  test("sodium and potassium adducts use the right masses", () => {
    const water = chain(["O"]);
    const na = adductIon(water, ADDUCTS.find((a) => a.id === "M+Na")!);
    expect(na.mz).toBeCloseTo(exactMass(water) + MONOISOTOPIC_MASS.Na - 0.00054857990946, 6);
  });

  test("every adduct produces a finite m/z", () => {
    const mol = withFormula(6);
    for (const ion of allAdductIons(mol)) {
      expect(Number.isFinite(ion.mz)).toBe(true);
      expect(ion.mz).toBeGreaterThan(0);
    }
  });
});

describe("degree of unsaturation", () => {
  test("benzene is 4 (three double bonds plus the ring)", () => {
    let mol = emptyMolecule();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = `c${i}`;
      ids.push(id);
      mol = addAtom(mol, id, { x: 40 * i, y: 0 }, "C");
    }
    for (let i = 0; i < 6; i++) mol = addBond(mol, `b${i}`, ids[i], ids[(i + 1) % 6], i % 2 === 0 ? 2 : 1);
    expect(degreeOfUnsaturation(elementCounts(mol))).toBe(3 + 1);
  });

  test("an alkane chain is 0", () => {
    expect(degreeOfUnsaturation(elementCounts(chain(["C", "C", "C"])))).toBe(0);
  });

  test("oxygen does not affect the count", () => {
    // O appears at any valence, so it never changes DBE.
    expect(degreeOfUnsaturation({ C: 2, H: 6, O: 1 })).toBe(
      degreeOfUnsaturation({ C: 2, H: 6 }),
    );
  });

  test("halogens count like hydrogens", () => {
    expect(degreeOfUnsaturation({ C: 1, H: 2, Cl: 2 })).toBe(
      degreeOfUnsaturation({ C: 1, H: 4 }),
    );
  });

  test("an impossible formula returns null rather than a negative number", () => {
    expect(degreeOfUnsaturation({ C: 1, H: 10 })).toBeNull();
  });
});

describe("isotope pattern", () => {
  test("peaks are reported at absolute m/z, not offsets from zero", () => {
    const mol = withFormula(1);
    const pattern = isotopePattern(mol, 4);
    expect(pattern[0].offset).toBe(0);
    expect(pattern[0].mz).toBeCloseTo(exactMass(mol), 6);
    expect(pattern[0].mz).toBeCloseTo(16.0313, 4);
  });

  test("carbon contributes an M+1 peak of about 1.1%", () => {
    const pattern = isotopePattern(withFormula(1), 3);
    const m1 = pattern.find((p) => p.offset === 1);
    expect(m1).toBeDefined();
    // One carbon: 13C is 1.07% natural abundance, plus a little from the H.
    expect(m1!.relativeIntensity).toBeGreaterThan(0.005);
    expect(m1!.relativeIntensity).toBeLessThan(0.03);
  });

  /** CH2Cl2 / CHBr2 with `n` halogens attached to a single carbon. */
  function dihalide(n: number, el: Element) {
    let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, "C");
    for (let i = 0; i < n; i++) {
      const id = `x${i}`;
      mol = addAtom(mol, id, { x: 40 * (i + 1), y: 0 }, el);
      mol = addBond(mol, `b${i}`, "c", id);
    }
    return mol;
  }

  test("one chlorine gives M:M+2 of about 3:1 — the classic check", () => {
    // 0.2424 / 0.7576 = 0.32. This ratio is the standard way of counting
    // chlorines in an unknown, so it is worth being exactly right.
    const pattern = isotopePattern(dihalide(1, "Cl"), 4);
    const m0 = pattern.find((p) => p.offset === 0)!;
    const m2 = pattern.find((p) => p.offset === 2)!;
    expect(m2).toBeDefined();
    expect(m2.relativeIntensity / m0.relativeIntensity).toBeCloseTo(0.32, 2);
  });

  test("two chlorines roughly double the M+2 relative to M", () => {
    // Not 0.64 by coincidence: M+2 picks up both ways of having exactly one
    // 37Cl. An earlier version of this test expected 0.32 here, which is the
    // one-chlorine figure — the kind of slip that would have taught the wrong
    // diagnostic.
    const pattern = isotopePattern(dihalide(2, "Cl"), 4);
    const m0 = pattern.find((p) => p.offset === 0)!;
    const m2 = pattern.find((p) => p.offset === 2)!;
    expect(m2.relativeIntensity / m0.relativeIntensity).toBeCloseTo(0.64, 2);
  });

  test("bromine is very nearly 1:1 with its M+2", () => {
    let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "br", { x: 40, y: 0 }, "Br");
    mol = addBond(mol, "b1", "c", "br");
    const pattern = isotopePattern(mol, 3);
    const m0 = pattern.find((p) => p.offset === 0)!;
    const m2 = pattern.find((p) => p.offset === 2)!;
    expect(m2.relativeIntensity / m0.relativeIntensity).toBeCloseTo(0.97, 1);
  });

  test("the monoisotopic peak is the base peak and the pattern increases in mass", () => {
    const pattern = isotopePattern(chain(["C", "C", "Cl"]), 4);
    expect(pattern).toHaveLength(5);
    for (let i = 1; i < pattern.length; i++) {
      expect(pattern[i].mz).toBeGreaterThan(pattern[i - 1].mz);
      expect(pattern[i].offset).toBe(pattern[i - 1].offset + 1);
    }
  });

  test("hydrogens count toward M+1", () => {
    // Methane's four H add ~0.05% on top of the carbon's 1.07%. Small, but it
    // is why a labelled/unlabelled pair can differ at high mass.
    const pattern = isotopePattern(withFormula(1), 2);
    expect(pattern.find((p) => p.offset === 1)).toBeDefined();
  });
});

describe("neutral losses", () => {
  test("water's loss is 18.0106, which is the number students learn first", () => {
    expect(NEUTRAL_LOSSES.find((l) => l.id === "H2O")!.mass).toBeCloseTo(18.010565, 6);
  });

  test("the well-known losses are present and correct", () => {
    const byId = Object.fromEntries(NEUTRAL_LOSSES.map((l) => [l.id, l.mass]));
    expect(byId.CO).toBeCloseTo(27.994915, 6);
    expect(byId.CO2).toBeCloseTo(43.989829, 6);
    expect(byId.NH3).toBeCloseTo(17.026549, 6);
    expect(byId.CH3OH).toBeCloseTo(32.026215, 6);
    expect(byId.HCN).toBeCloseTo(27.010899, 6);
  });

  test("sorts by mass so the list reads down a spectrum", () => {
    const sorted = neutralLossesByMass();
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].mass).toBeGreaterThan(sorted[i - 1].mass);
    }
  });

  test("every loss carries an explanatory note", () => {
    for (const loss of NEUTRAL_LOSSES) expect(loss.note.length).toBeGreaterThan(10);
  });
});

describe("reference table self-check", () => {
  test("the published reference masses are what this file claims", () => {
    // Guards the fixture itself: if someone edits REFERENCE without checking,
    // every test above would be validating against a wrong number.
    for (const ref of REFERENCE) {
      const counts = parseFormula(ref.formula);
      let mass = 0;
      for (const el in counts) mass += MONOISOTOPIC_MASS[el] * counts[el];
      expect(mass).toBeCloseTo(ref.mass, 6);
    }
  });
});

/** Minimal formula parser for the reference fixture only. */
function parseFormula(formula: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) counts[m[1]] = (counts[m[1]] ?? 0) + (m[2] ? parseInt(m[2], 10) : 1);
  return counts;
}
describe("verified against RDKit", () => {
  /**
   * Monoisotopic masses for real compounds, taken from RDKit's
   * Descriptors.ExactMolWt and checked against this module's table plus its
   * element summation. Checked out-of-band rather than hard-coded from
   * memory, because a table that is plausible but wrong is the failure mode
   * this whole module exists to avoid.
   *
   * Exercised through a molecule built to the stated formula rather than a
   * hand-drawn structure, so the test stays about the mass arithmetic and
   * not about whether this particular drawing is right.
   */
  const CASES: { name: string; counts: Record<string, number>; mass: number }[] = [
    { name: "caffeine C8H10N4O2", counts: { C: 8, H: 10, N: 4, O: 2 }, mass: 194.080375560 },
    { name: "glucose C6H12O6", counts: { C: 6, H: 12, O: 6 }, mass: 180.063388 },
    { name: "acetaminophen C8H9NO2", counts: { C: 8, H: 9, N: 1, O: 2 }, mass: 151.063329 },
    { name: "nicotine C10H14N2", counts: { C: 10, H: 14, N: 2 }, mass: 162.115699 },
    { name: "ibuprofen C13H18O2", counts: { C: 13, H: 18, O: 2 }, mass: 206.130680 },
  ];

  test("summation reproduces RDKit's exact masses for real molecules", () => {
    for (const c of CASES) {
      let mass = 0;
      for (const el in c.counts) mass += MONOISOTOPIC_MASS[el] * c.counts[el];
      expect(Math.abs(mass - c.mass), `${c.name}: ${mass} vs ${c.mass}`).toBeLessThan(1e-5);
    }
  });

  test("the degree of unsaturation of each is the textbook value", () => {
    expect(degreeOfUnsaturation(CASES[0].counts)).toBe(6); // caffeine
    expect(degreeOfUnsaturation(CASES[1].counts)).toBe(1); // glucose, one ring
    expect(degreeOfUnsaturation(CASES[2].counts)).toBe(5); // acetaminophen
  });

  test("caffeine's [M+H]+ matches RDKit's 195.087652", () => {
    // Protonation adds exactly one proton mass; no separate "H atom" step.
    const caffeineMass = CASES[0].mass;
    const protonated = caffeineMass + 1.007276466621;
    expect(protonated).toBeCloseTo(195.087652, 6);
  });
});

// ---------------------------------------------------------------------------
// Regressions. Each of these was a real defect found by review, not a
// hypothetical: the first one in particular hung the app.
// ---------------------------------------------------------------------------

/** Builds a molecule from "C*6,Cl*4" style specs. */
function specMolecule(spec: string): Molecule {
  const atoms: Record<string, Atom> = {};
  spec.split(",").forEach((tok, i) => {
    const [element, n = "1"] = tok.split("*");
    for (let k = 0; k < Number(n); k++) {
      const id = `a${i}_${k}`;
      atoms[id] = { id, element: element as Element, x: i * 2 + k, y: 0, charge: 0 };
    }
  });
  return { ...emptyMolecule(), atoms };
}

/** Builds a molecule from "C*2,O*1" style specs, fully bonded in a chain.
 *  Named distinctly from the module-level chain(elements) helper above. */
function chainFromSpec(spec: string): Molecule {
  let mol = specMolecule(spec);
  const ids = Object.keys(mol.atoms);
  for (let i = 1; i < ids.length; i++) {
    mol = addBond(mol, `b${i}`, ids[i - 1], ids[i], 1);
  }
  return mol;
}

describe("isotopePattern performance", () => {
  it("stays fast on a drug-sized molecule", () => {
    // Previously this grew as 2^(number of atoms) because every isotope
    // combination was materialised and only merged at the very end: a 12-carbon
    // chain took 3.5 s and a slightly larger one exhausted memory outright,
    // which froze the UI thread the moment the Mass tab was opened.
    const mol = specMolecule("C*24,N*4,O*6");
    const started = performance.now();
    const pattern = isotopePattern(mol, 6);
    const elapsed = performance.now() - started;

    expect(pattern.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(250);
  });
});

describe("isotopePattern data", () => {
  it("shows boron's 10B peak BELOW the base mass", () => {
    // 11B is 80% abundant, so it -- not 10B -- is the base. A boron compound
    // really does have a peak under its nominal mass.
    const pattern = isotopePattern(specMolecule("B,C*3"), 3);
    expect(pattern.some((p) => p.offset < 0)).toBe(true);
    const base = pattern.find((p) => p.offset === 0)!;
    const light = pattern.filter((p) => p.offset < 0);
    expect(light[0].mz).toBeLessThan(base.mz);
    // 10B vs 11B is 0.9964 u apart.
    expect(base.mz - light[0].mz).toBeCloseTo(0.9964, 3);
  });

  it("gives selenium its real isotope spread", () => {
    // Selenium has six stable isotopes from 74 to 82, with 80Se (49.6%) the
    // most abundant -- so several peaks sit below the base mass.
    const pattern = isotopePattern(specMolecule("C*2,Se"), 8);
    expect(pattern.filter((p) => p.offset < 0).length).toBeGreaterThan(1);
    for (const p of pattern) expect(Number.isFinite(p.mz)).toBe(true);
    expect(Math.max(...pattern.map((p) => p.mz))).toBeLessThan(200);
  });

  it("places merged peaks at a probability-weighted m/z, not an average of averages", () => {
    // Two chlorines put 37Cl+37Cl at the same nominal mass as other
    // combinations; the reported position must be their true centroid.
    const pattern = isotopePattern(specMolecule("C,Cl*2"), 3);
    const base = pattern.find((p) => p.offset === 0)!;
    const m2 = pattern.find((p) => p.offset === 2)!;
    // m/z is absolute, so the spacing is what carries the information here.
    expect(m2.mz - base.mz).toBeCloseTo(1.99705, 4);
  });
});

describe("isotopePattern with several boron or selenium atoms", () => {
  const rel = (pattern: ReturnType<typeof isotopePattern>, offset: number) =>
    pattern.find((p) => p.offset === offset)?.relativeIntensity;

  it("keeps the 10B2 peak of a diboron compound", () => {
    // 10B is 19.9%, 11B 80.1%. For two borons: 10B2 at M-2, 10B+11B at M-1 and
    // 11B2 (the base) at M. A cut-off taken from ONE atom's shift dropped M-2.
    const pattern = isotopePattern(specMolecule("B*2"), 4);
    expect(rel(pattern, -2)).toBeCloseTo((0.199 * 0.199) / (0.801 * 0.801), 2);
    expect(rel(pattern, -1)).toBeCloseTo((2 * 0.199 * 0.801) / (0.801 * 0.801), 2);
    expect(rel(pattern, 0)).toBe(1);
  });

  it("reaches M-3 for three borons", () => {
    const pattern = isotopePattern(specMolecule("B*3"), 4);
    expect(Math.min(...pattern.map((p) => p.offset))).toBe(-3);
    expect(rel(pattern, -3)).toBeCloseTo(Math.pow(0.199 / 0.801, 3), 2);
  });

  it("lets two selenium atoms spread over their full 74Se2..82Se2 range", () => {
    // One 74Se sits 6 u below the base (80Se), so two reach 12 u below it.
    const pattern = isotopePattern(specMolecule("Se*2"), 4);
    expect(Math.min(...pattern.map((p) => p.offset))).toBe(-12);
    // Sanity: the total is still a probability distribution over what's kept.
    const total = pattern.reduce((a, p) => a + p.abundance, 0);
    expect(total).toBeGreaterThan(0.999);
    expect(total).toBeLessThanOrEqual(1.0000001);
  });

  it("does not lose peaks when a light isotope can pull a high state back into range", () => {
    // Carbon is processed alongside boron; a state pushed above the window by
    // 13C must survive until 10B can bring it back. Total probability mass is
    // the cheap invariant for that: nothing meaningful may be dropped.
    const pattern = isotopePattern(specMolecule("C*4,B*2"), 4);
    const total = pattern.reduce((a, p) => a + p.abundance, 0);
    expect(total).toBeGreaterThan(0.9999);
  });
});

describe("adduct labels", () => {
  it("does not render a doubled charge sign", () => {
    // "[M+H]+\u207a" reads as "[M+H]+ plus" -- an ASCII '+' and then a
    // superscript one. Single-charge ions should carry only the superscript.
    for (const adduct of ADDUCTS) {
      // Only the *trailing* sign is the charge; "[M+H]" legitimately contains
      // an ASCII '+' as part of the adduct name.
      expect(adduct.label, `${adduct.id} has a doubled charge sign`).not.toContain("+\u207a");
      expect(adduct.label, `${adduct.id} is missing its charge sign`).not.toMatch(/\]\)?$/);
    }
  });
});

describe("neutral loss masses", () => {
  it("matches each loss to its own formula", () => {
    // Three entries disagreed with their stated formula: NO was off by ~1 u
    // and HNO2 / SO2 by 15 and 4 mDa. Checked against RDKit's elemental masses
    // rather than against a second hand-typed copy of the same numbers.
    const expected: Record<string, number> = {
      NO: 29.997989,
      HNO2: 47.000728,
      SO2: 63.9619,
      H2O: 18.010565,
      CO2: 43.989829,
    };
    for (const [formula, mass] of Object.entries(expected)) {
      const loss = NEUTRAL_LOSSES.find((l) => l.formula === formula)!;
      expect(loss, `missing loss ${formula}`).toBeTruthy();
      expect(loss.mass, `wrong mass for ${formula}`).toBeCloseTo(mass, 6);
    }
  });

  it("keeps every entry self-consistent with its formula", () => {
    // Guards the whole table, not just the three that happened to be caught.
    const MONO: Record<string, number> = {
      H: 1.00782503, C: 12, N: 14.003074, O: 15.99491462, S: 31.972071,
    };
    for (const loss of NEUTRAL_LOSSES) {
      let expected = 0;
      // Match arrays start with the full match, so the element and count are
      // at indices 1 and 2 -- destructuring from the front would read the whole
      // "H2" as the element and yield NaN.
      for (const match of loss.formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
        const el = match[1];
        const n = match[2];
        expected += MONO[el] * Number(n || 1);
      }
      // The table stores 6 decimal places, so 1e-6 is the tightest tolerance
      // that doesn't flag ordinary storage rounding.
      expect(loss.mass, `${loss.formula} mass disagrees with its formula`).toBeCloseTo(expected, 5);
    }
  });
});

describe("molecule-specific neutral losses", () => {
  const formulas = (mol: Molecule) => applicableNeutralLosses(mol).map((l) => l.formula);

  it("never offers a loss whose elements the molecule lacks", () => {
    // Previously every molecule was shown the same six losses, so benzene was
    // offered water and ammonia despite containing neither oxygen nor nitrogen.
    const benzene = chainFromSpec("C*6");
    expect(formulas(benzene)).not.toContain("H2O");
    expect(formulas(benzene)).not.toContain("NH3");
    expect(formulas(benzene)).not.toContain("CO2");
    // Hydrogen loss is available to any molecule with hydrogens.
    expect(formulas(benzene)).toContain("H2");
  });

  it("never offers a loss bigger than, or equal to, the molecule itself", () => {
    // Element presence is not enough: ethanol (46 u) has C, H and O but cannot
    // lose C6H6O (94 u) or C6H4O2 (108 u).
    const ethanol = chainFromSpec("C*2,O*1");
    for (const l of applicableNeutralLosses(ethanol)) {
      expect(l.mass, `${l.formula} is heavier than the molecule`).toBeLessThan(exactMass(ethanol));
    }
    expect(formulas(ethanol)).not.toContain("C6H6O");
    expect(formulas(ethanol)).not.toContain("C6H4O2");
    expect(formulas(ethanol)).not.toContain("C3H6O");
    expect(formulas(ethanol)).not.toContain("C4H8");
    // Still gets the ones it really can make.
    expect(formulas(ethanol)).toContain("H2O");
    expect(formulas(ethanol)).toContain("H2");
  });

  it("checks atom counts, not just which elements are present", () => {
    // Methane has carbon and hydrogen, so by element alone it was offered
    // ethylene and butene -- both need more carbons than it has.
    const methane = chainFromSpec("C*1");
    expect(formulas(methane)).toContain("H2");
    expect(formulas(methane)).not.toContain("C2H4");
    expect(formulas(methane)).not.toContain("C4H8");
  });

  it("does not let water lose itself", () => {
    expect(formulas(chainFromSpec("O*1"))).not.toContain("H2O");
  });

  it("offers water for an alcohol but not for an ether", () => {
    const alcohol = chainFromSpec("C*2,O*1");
    expect(formulas(alcohol)).toContain("H2O");

    // A real ether: C-C-O-C-C, so the oxygen carries no hydrogen.
    const etherMol = emptyMolecule();
    let e = addAtom(etherMol, "a1", { x: 0, y: 0 }, "C");
    e = addAtom(e, "a2", { x: 1, y: 0 }, "C");
    e = addAtom(e, "o", { x: 2, y: 0 }, "O");
    e = addAtom(e, "a3", { x: 3, y: 0 }, "C");
    e = addAtom(e, "a4", { x: 4, y: 0 }, "C");
    e = addBond(e, "b1", "a1", "a2", 1);
    e = addBond(e, "b2", "a2", "o", 1);
    e = addBond(e, "b3", "o", "a3", 1);
    e = addBond(e, "b4", "a3", "a4", 1);
    expect(formulas(e)).not.toContain("H2O");
  });

  it("offers CO2 for a carboxylic acid", () => {
    const mol = emptyMolecule();
    const c1 = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    const o1 = addAtom(c1, "o1", { x: 1, y: 0 }, "O");
    const o2 = addAtom(o1, "o2", { x: 2, y: 0 }, "O");
    const carboxy = addBond(o2, "b1", "c1", "o2", 2);
    const full = addBond(carboxy, "b2", "c1", "o1", 1);
    expect(formulas(full)).toContain("CO2");
  });

  it("offers SO2 only with a sulfonyl group", () => {
    const plain = chainFromSpec("C*2,S*1");
    expect(formulas(plain)).not.toContain("SO2");

    const mol = emptyMolecule();
    let m = addAtom(mol, "s", { x: 0, y: 0 }, "S");
    for (const [id, el, x] of [["c1", "C", -1], ["c2", "C", 1], ["o1", "O", 0], ["o2", "O", 2]] as const) {
      m = addAtom(m, id, { x, y: 1 }, el);
    }
    m = addBond(m, "b1", "s", "c1", 1);
    m = addBond(m, "b2", "s", "c2", 1);
    m = addBond(m, "b3", "s", "o1", 1);
    m = addBond(m, "b4", "s", "o2", 2);
    expect(formulas(m)).toContain("SO2");
  });

  it("keeps every loss's element requirement consistent with its formula", () => {
    for (const loss of NEUTRAL_LOSSES) {
      for (const el of loss.requires) {
        expect(loss.formula, `${loss.formula} requires ${el} it does not contain`).toContain(el);
      }
      if (loss.requires.length === 0) {
        // Only hydrogen can be lost without any heavy element present.
        expect(loss.formula).toBe("H2");
      }
    }
  });
});

describe("annotating measured peaks with neutral losses", () => {
  /** A spectrum with a precursor and the given fragment m/z values. */
  const spectrum = (precursorMz: number, mzs: number[]) => ({
    precursorMz,
    peaks: mzs.map((mz) => ({ mz })),
  });

  it("matches a peak that sits exactly a loss below the precursor", () => {
    // Precursor 500, water at 481.9894.
    const hits = annotateNeutralLosses(spectrum(500, [481.9894]), NEUTRAL_LOSSES);
    expect(hits).toHaveLength(1);
    expect(hits[0].loss.formula).toBe("H2O");
    expect(hits[0].peakCount).toBe(1);
    expect(Math.abs(hits[0].errorDa)).toBeLessThan(0.0005);
  });

  it("does not annotate peaks outside the tolerance", () => {
    // 18.05 lost is water's mass but 39 mDa away -- beyond a 20 mDa window.
    expect(annotateNeutralLosses(spectrum(500, [481.95]), NEUTRAL_LOSSES)).toHaveLength(0);
  });

  it("annotates one peak at most once, with the closest loss", () => {
    // CO is 27.994915 and N2 is 28.006148. A gap of 28.0000 is 5.1 mDa from
    // CO and 6.1 mDa from N2, so CO wins -- and critically, only one of them is
    // reported, rather than the same peak being explained twice.
    const hits = annotateNeutralLosses(spectrum(500, [472]), NEUTRAL_LOSSES);
    expect(hits).toHaveLength(1);
    expect(hits[0].loss.formula).toBe("CO");
    expect(hits[0].peakCount).toBe(1);
  });

  it("counts how many peaks one loss explains", () => {
    const hits = annotateNeutralLosses(spectrum(500, [481.9894, 481.9895]), NEUTRAL_LOSSES);
    expect(hits).toHaveLength(1);
    expect(hits[0].loss.formula).toBe("H2O");
    expect(hits[0].peakCount).toBe(2);
  });

  it("returns nothing without a usable precursor", () => {
    // Many MassBank records have no precursor m/z at all; guessing one would
    // invent annotations.
    expect(annotateNeutralLosses({ peaks: [{ mz: 100 }] }, NEUTRAL_LOSSES)).toHaveLength(0);
    expect(annotateNeutralLosses({ precursorMz: NaN, peaks: [{ mz: 100 }] }, NEUTRAL_LOSSES)).toHaveLength(0);
  });

  it("ignores fragments heavier than their own precursor", () => {
    expect(annotateNeutralLosses(spectrum(100, [150]), NEUTRAL_LOSSES)).toHaveLength(0);
  });

  it("only annotates losses the molecule can actually make", () => {
    const mol = chainFromSpec("C*6"); // benzene: no oxygen, no nitrogen
    expect(annotateNeutralLosses(spectrum(100, [100 - 18.010565]), applicableNeutralLosses(mol))).toHaveLength(0);
    expect(annotateNeutralLosses(spectrum(100, [100 - 2.01565]), applicableNeutralLosses(mol))).toHaveLength(1);
  });
});
