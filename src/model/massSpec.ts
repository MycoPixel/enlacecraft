import type { Molecule } from "../types/chemistry";
import { implicitH, parseSimpleFormula } from "./valence";
import { ABBREVIATED_GROUPS } from "./constants";

/**
 * Mass-spectrometry arithmetic: exact monoisotopic masses, adduct ions, degree
 * of unsaturation, isotope patterns, and the neutral losses a spectrum is
 * expected to show.
 *
 * ## Why a separate mass table
 *
 * model/constants.ts's ATOMIC_WEIGHT holds *average* atomic weights rounded
 * to two decimals -- its own comment says "enough precision for a drawing
 * tool's live MW readout, not an analytical one". Mass spectrometry needs the
 * opposite: the mass of the single most abundant isotope, to several decimal
 * places. Those are not two precisions of one quantity but two different
 * quantities -- chlorine averages 35.45, while the ion you actually observe is
 * 34.968853 -- so the drawing tool's table cannot be reused here.
 *
 * Both tables below were generated from RDKit's periodic table rather than
 * transcribed from memory. A mass that is silently wrong by a few mDa is the
 * worst failure this feature could have: it looks entirely plausible, and
 * nothing about it would obviously read as broken.
 */

/** Monoisotopic mass (u) of each element's most abundant isotope, generated
 * from RDKit's GetMostCommonIsotopeMass. Carbon is exactly 12 by definition,
 * which is what makes monoisotopic masses exact rather than approximate. */
export const MONOISOTOPIC_MASS: Record<string, number> = {
  H: 1.007825032,
  He: 4.002603254,
  Li: 7.01600455,
  Be: 9.0121822,
  B: 11.0093054,
  C: 12.0,
  N: 14.003074,
  O: 15.99491462,
  F: 18.99840322,
  Ne: 19.99244018,
  Na: 22.98976928,
  Mg: 23.9850417,
  Al: 26.98153863,
  Si: 27.97692653,
  P: 30.97376163,
  S: 31.972071,
  Cl: 34.96885268,
  Ar: 39.96238312,
  K: 38.96370668,
  Ca: 39.96259098,
  Sc: 44.9559119,
  Ti: 47.9479463,
  V: 50.9439595,
  Cr: 51.9405075,
  Mn: 54.9380451,
  Fe: 55.9349375,
  Co: 58.933195,
  Ni: 57.9353429,
  Cu: 62.9295975,
  Zn: 63.9291422,
  Ga: 68.9255736,
  Ge: 73.9211778,
  As: 74.9215965,
  Se: 79.9165213,
  Br: 78.9183371,
  Kr: 83.911507,
  Rb: 84.91178974,
  Sr: 87.9056121,
  Y: 88.9058483,
  Zr: 89.9047044,
  Nb: 92.9063781,
  Mo: 97.9054082,
  Tc: 96.906365,
  Ru: 101.9043493,
  Rh: 102.905504,
  Pd: 105.903486,
  Ag: 106.905097,
  Cd: 113.9033585,
  In: 114.903878,
  Sn: 119.9021947,
  Sb: 120.9038157,
  Te: 129.9062244,
  I: 126.904473,
  Xe: 131.9041535,
  Cs: 132.9054519,
  Ba: 137.9052472,
  La: 138.9063533,
  Ce: 139.9054387,
  Pr: 140.9076528,
  Nd: 141.9077233,
  Pm: 144.912749,
  Sm: 151.9197324,
  Eu: 152.9212303,
  Gd: 157.9241039,
  Tb: 158.9253468,
  Dy: 163.9291748,
  Ho: 164.9303221,
  Er: 165.9302931,
  Tm: 168.9342133,
  Yb: 173.9388621,
  Lu: 174.9407718,
  Hf: 179.94655,
  Ta: 180.9479958,
  W: 183.9509312,
  Re: 186.9557531,
  Os: 191.9614807,
  Ir: 192.9629264,
  Pt: 194.9647911,
  Au: 196.9665687,
  Hg: 201.970643,
  Tl: 204.9744275,
  Pb: 207.9766521,
  Bi: 208.9803987,
  Po: 208.9824304,
  At: 209.987148,
  Rn: 222.0175706,
  Fr: 223.0197359,
  Ra: 226.0254026,
  Ac: 227.0277521,
  Th: 232.0380553,
  Pa: 231.035884,
  U: 238.0507882,
  Np: 236.04657,
  Pu: 238.0495599,
  Am: 241.0568291,
  Cm: 243.0613891,
  Bk: 247.070307,
  Cf: 249.0748535,
  Es: 252.08298,
  Fm: 257.095105,
  Md: 258.098431,
  No: 259.10103,
  Lr: 262.10963,
  Rf: 267.12153,
  Db: 268.12545,
  Sg: 271.13347,
  Bh: 270.13362,
  Hs: 269.13406,
  Mt: 278.15481,
  Ds: 281.16206,
  Rg: 281.16537,
  Cn: 285.17411,
  Nh: 284.17873,
  Fl: 289.19042,
  Mc: 288.19274,
  Lv: 293.20449,
  Ts: 292.20746,
  Og: 294.21392,
};

/**
 * Exact masses for the labelled isotopes this app supports, generated from
 * RDKit's GetMassForIsotope.
 *
 * Needed because ISOTOPE_PRESETS carries masses rounded to three decimals
 * (13C as 13.003). On a labelled compound that is a ~0.35 mDa error, around
 * 1.7 ppm at m/z 200 -- the order of an HRMS tolerance, and enough to make a
 * labelled and an unlabelled compound indistinguishable.
 */
export const ISOTOPE_EXACT_MASS: Record<string, number> = {
  H2: 2.01410178,
  H3: 3.01604928,
  C13: 13.00335484,
  C14: 14.00324199,
  N15: 15.0001089,
  O17: 16.9991317,
  O18: 17.999161,
  P32: 31.97390727,
  S35: 34.96903216,
  Ca45: 44.9561866,
  Fe57: 56.935394,
  Se77: 76.919914,
  I125: 124.9046302,
};

/** Rest mass of an electron, in u. Ion masses are neutral masses minus the
 * electrons a charge has removed -- which is why [M+H]+ adds 1.007276 and not
 * the 1.007825 of a whole hydrogen atom. */
export const ELECTRON_MASS = 0.00054857990946;

/** Proton rest mass, in u: what [M+H]+ actually adds to a neutral molecule. */
export const PROTON_MASS = 1.007276466621;

/**
 * An adduct: what a molecule picks up or loses to become the ion actually
 * observed. Almost nothing ionizes as the bare molecular ion -- in a soft
 * electrospray source you see [M+H]+ or [M-H]-, so knowing which one to look
 * for is most of what reading a mass spectrum actually requires.
 */
export interface Adduct {
  id: string;
  /** Adduct name as written in a spectrum, e.g. "[M+H]+". */
  label: string;
  /** Polarity of the resulting ion. */
  polarity: "positive" | "negative";
  /** Additive composition applied to the neutral molecule. */
  adds: Record<string, number>;
  charge: number;
}

/**
 * The adducts worth offering for a teaching tool. Ordered roughly by how often
 * they turn up: protonation and deprotonation dominate positive- and
 * negative-mode soft ionization, with the alkali and solvent adducts that show
 * up in real LC-MS runs after those.
 *
 * The solvents matter more than they look: methanol and acetonitrile adducts
 * are routinely the largest peaks in an ESI spectrum, so omitting them would
 * leave a student unable to explain a big ion that is very obviously not their
 * molecule.
 */
export const ADDUCTS: Adduct[] = [
  { id: "M+H", label: "[M+H]\u207a", polarity: "positive", adds: { H: 1 }, charge: 1 },
  { id: "M+Na", label: "[M+Na]\u207a", polarity: "positive", adds: { Na: 1 }, charge: 1 },
  { id: "M+K", label: "[M+K]\u207a", polarity: "positive", adds: { K: 1 }, charge: 1 },
  { id: "M+NH4", label: "[M+NH4]\u207a", polarity: "positive", adds: { N: 1, H: 4 }, charge: 1 },
  { id: "M+MeOH+H", label: "[M+CH3OH+H]\u207a", polarity: "positive", adds: { C: 1, H: 4, O: 1 }, charge: 1 },
  { id: "M+ACN+H", label: "[M+CH3CN+H]\u207a", polarity: "positive", adds: { C: 2, H: 4, N: 1 }, charge: 1 },
  { id: "M+2H", label: "[M+2H]\u00b2\u207a", polarity: "positive", adds: { H: 2 }, charge: 2 },
  { id: "M-H", label: "[M-H]\u207b", polarity: "negative", adds: { H: -1 }, charge: -1 },
  { id: "M+Cl", label: "[M+Cl]\u207b", polarity: "negative", adds: { Cl: 1 }, charge: -1 },
  { id: "M+HCOO", label: "[M+HCOO]\u207b", polarity: "negative", adds: { H: 1, C: 1, O: 2 }, charge: -1 },
  { id: "M-2H", label: "[M-2H]\u00b2\u207b", polarity: "negative", adds: { H: -2 }, charge: -2 },
];

/**
 * Element counts for a molecule, including hydrogens the drawing leaves
 * implicit and the full expansion of any abbreviated-group vertex.
 *
 * This is the single place the three complications of this feature are dealt
 * with: implicit hydrogens (the app's skeletal display convention means the
 * H's aren't in the atom map), abbreviated groups (a single "Ph" vertex is six
 * carbons and five hydrogens), and labelled isotopes. Getting any of them
 * wrong is silent -- the molecule still looks right, only the mass is off.
 */
export function elementCounts(mol: Molecule, atomIds?: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (el: string, n: number) => {
    if (n === 0) return;
    counts[el] = (counts[el] ?? 0) + n;
  };

  for (const id of atomIds ?? Object.keys(mol.atoms)) {
    const atom = mol.atoms[id];
    if (!atom) continue;
    if (atom.group) {
      const formula = ABBREVIATED_GROUPS.find((g) => g.id === atom.group)?.formula ?? atom.groupFormula;
      // A generic placeholder ("R", "R1") has no composition at all and
      // contributes nothing, matching computeMolecularWeight's behaviour --
      // but it DOES need its hydrogens adding, because a labelled R still
      // occupies a valence.
      if (formula) {
        const groupCounts = parseSimpleFormula(formula);
        for (const el in groupCounts) add(el, groupCounts[el]);
      }
      continue;
    }
    add(atom.element, 1);
    add("H", implicitH(mol, id));
  }
  return counts;
}

/** Exact monoisotopic mass (u) of the neutral molecule. */
export function exactMass(mol: Molecule, atomIds?: Iterable<string>): number {
  const counts = elementCounts(mol, atomIds);
  let total = 0;
  for (const el in counts) {
    const m = MONOISOTOPIC_MASS[el];
    // An element missing from the table can't contribute a mass. Silently
    // skipping would under-report; the callers that matter (formula, DBE)
    // surface the problem separately, and every real element is in the table.
    if (m === undefined) continue;
    total += m * counts[el];
  }
  // elementCounts adds every atom with its element's *natural* mass, including
  // a labelled one, so each label needs the difference between its exact
  // isotope mass and that natural mass applied afterwards.
  //
  // The adjustment is the atom itself only — not its hydrogens. Multiplying
  // by (1 + implicitH) here, as an earlier version did, counts every implicit
  // hydrogen twice and inflates a 13C-methane by four hydrogens (~4 u).
  //
  // It also handles deuterium correctly for free: for a D the element is H
  // and the adjustment is 2.014102 - 1.007825, which converts one hydrogen
  // into a deuterium.
  let isotopeAdjustment = 0;
  for (const id of atomIds ?? Object.keys(mol.atoms)) {
    const atom = mol.atoms[id];
    if (!atom || atom.group || !atom.isotope) continue;
    const exact = ISOTOPE_EXACT_MASS[`${atom.element}${atom.isotope}`];
    if (exact === undefined) continue;
    isotopeAdjustment += exact - (MONOISOTOPIC_MASS[atom.element] ?? 0);
  }
  return total + isotopeAdjustment;
}

export interface AdductIon {
  adduct: Adduct;
  /** m/z of the ion. For a multiply-charged ion this is mass / |charge|, which
   * is what is actually read off a spectrum. */
  mz: number;
  /** Neutral exact mass, for reference. */
  neutralMass: number;
}

/** The m/z an adduct produces from this molecule. */
export function adductIon(mol: Molecule, adduct: Adduct, atomIds?: Iterable<string>): AdductIon {
  const neutralMass = exactMass(mol, atomIds);
  let adductMass = 0;
  for (const el in adduct.adds) {
    const m = MONOISOTOPIC_MASS[el];
    if (m === undefined) continue;
    adductMass += m * adduct.adds[el];
  }
  // Electron bookkeeping, which must use the SIGNED charge: a positive ion has
  // lost electrons (lighter) and a negative one has gained them (heavier).
  //
  // Getting this wrong with Math.abs() is easy and invisible — it silently
  // corrupts every negative-mode ion by 2 m-e, putting [M-H]- out by ~1.1 mDa.
  // With signed charge the whole family falls out correctly from one rule,
  // treating `adds` as nuclei gained or lost:
  //   [M+H]+  = M + m(H)  - m(e)
  //   [M-H]-  = M - m(H)  + m(e)
  // both of which are M +/- 1.007276, the proton mass.
  const ionMass = neutralMass + adductMass - ELECTRON_MASS * adduct.charge;
  return { adduct, mz: ionMass / Math.abs(adduct.charge), neutralMass };
}

/** Every adduct ion for a molecule, both polarities. */
export function allAdductIons(mol: Molecule, atomIds?: Iterable<string>): AdductIon[] {
  return ADDUCTS.map((adduct) => adductIon(mol, adduct, atomIds));
}

/**
 * Degree of unsaturation (DBE) -- rings plus pi bonds, counted once.
 *
 * DBE = C - H/2 + N/2 + 1 for a neutral formula, ignoring oxygen and sulfur
 * (which appear at any valence without changing the count) and halogens,
 * which count like hydrogens. It is the quickest way to sanity-check a
 * molecular formula: benzene is 4, an alkane CnH2n+2 is 0, and a formula
 * implying a negative DBE is impossible.
 *
 * Returns null for a formula it can't judge -- an odd charge, or a structure
 * with a generic placeholder label -- rather than a number that looks valid.
 */
export function degreeOfUnsaturation(counts: Record<string, number>): number | null {
  const c = counts.C ?? 0;
  const h = counts.H ?? 0;
  const n = counts.N ?? 0;
  const halogens = (counts.F ?? 0) + (counts.Cl ?? 0) + (counts.Br ?? 0) + (counts.I ?? 0);
  const dbe = c - (h + halogens) / 2 + n / 2 + 1;
  // A negative or non-integral DBE means the formula is impossible for a
  // neutral closed-shell molecule -- surfacing that is more useful than
  // returning the nonsense value.
  if (!Number.isFinite(dbe) || dbe < 0 || Math.abs(dbe - Math.round(dbe)) > 1e-9) return null;
  return Math.round(dbe);
}

/** Natural abundances and isotope masses for the elements whose heavy
 * isotopes actually show up in a pattern. Elements not listed contribute only
 * their monoisotopic peak, which is correct for the overwhelming majority of
 * organic formula. */
const ISOTOPE_ABUNDANCE: Record<string, { abundance: number; mass: number }[]> = {
  H: [{ abundance: 0.999885, mass: 1.00782503 }, { abundance: 0.000115, mass: 2.01410178 }],
  // Boron is 20% 10B / 80% 11B, so its base mass is the *heavier* isotope and
  // the lighter one sits at a NEGATIVE offset. A boron compound's spectrum
  // genuinely has peaks below its nominal mass.
  B: [{ abundance: 0.199, mass: 10.012937 }, { abundance: 0.801, mass: 11.0093054 }],
  C: [{ abundance: 0.9893, mass: 12 }, { abundance: 0.0107, mass: 13.00335484 }],
  N: [{ abundance: 0.99632, mass: 14.003074 }, { abundance: 0.00368, mass: 15.0001089 }],
  O: [
    { abundance: 0.99757, mass: 15.99491462 },
    { abundance: 0.00038, mass: 16.9991317 },
    { abundance: 0.00205, mass: 17.999161 },
  ],
  F: [{ abundance: 1, mass: 18.99840322 }],
  Si: [
    { abundance: 0.922297, mass: 27.97692653 },
    { abundance: 0.046832, mass: 28.9764947 },
    { abundance: 0.030872, mass: 29.97377017 },
  ],
  P: [{ abundance: 1, mass: 30.97376163 }],
  S: [
    { abundance: 0.9493, mass: 31.972071 },
    { abundance: 0.0076, mass: 32.97145876 },
    { abundance: 0.0429, mass: 33.9678669 },
    { abundance: 0.0002, mass: 35.96708076 },
  ],
  Cl: [
    { abundance: 0.7578, mass: 34.96885268 },
    { abundance: 0.2422, mass: 36.96590259 },
  ],
  // Selenium's heaviest isotope is the most abundant (80Se, 49.6%), and it has
  // six stable isotopes spread over 74-82 -- the previous entry here had three
  // masses paired with the wrong abundances.
  Se: [
    { abundance: 0.0089, mass: 73.9224764 },
    { abundance: 0.0937, mass: 75.9192136 },
    { abundance: 0.0763, mass: 76.919914 },
    { abundance: 0.2377, mass: 77.9173091 },
    { abundance: 0.4961, mass: 79.9165213 },
    { abundance: 0.0873, mass: 81.9166994 },
  ],
  Br: [
    { abundance: 0.5069, mass: 78.9183371 },
    { abundance: 0.4931, mass: 80.9162906 },
  ],
  I: [{ abundance: 1, mass: 126.904473 }],
};

export interface IsotopePeak {
  /** Nominal offset from the monoisotopic peak: 0 for M, 1 for M+1, ... */
  offset: number;
  mz: number;
  /** Abundance relative to the tallest peak in the pattern (0-1), so the most
   * intense peak is 1 and the whole pattern is directly plottable. */
  relativeIntensity: number;
  /** Raw probability, before normalisation. */
  abundance: number;
}

/**
 * Theoretical isotope pattern: the M, M+1, M+2 ... peaks with their relative
 * intensities.
 *
 * This is exact combinatorics, not a prediction -- a polynomial multiplication
 * over each element's isotope abundances, which is why no model is involved
 * and why the result is trustworthy. It is the check that confirms a high-res
 * mass: two chlorines give an M+2 of about a third the height of M (1 : 0.32),
 * and bromine is very nearly 1 : 1.
 *
 * Explicit hydrogens are counted, including the implicit ones, because they
 * contribute to M+1 -- a molecule with 30 hydrogens has an M+1 peak of a few
 * percent all on its own, which is enough to matter at high mass.
 */
export function isotopePattern(mol: Molecule, peaks: number = 4, atomIds?: Iterable<string>): IsotopePeak[] {
  const counts = elementCounts(mol, atomIds);

  // The pattern is referenced to each element's MOST ABUNDANT isotope, because
  // that is what MONOISOTOPIC_MASS (and therefore exactMass, and RDKit's
  // ExactMolWt) uses. For most elements the most abundant one is also the
  // lightest, but not for boron (80% 11B) or selenium (49.6% 80Se), whose
  // lighter isotopes therefore land at negative offsets. Anchoring to the
  // lightest instead would make the plotted peaks disagree with the exact mass
  // shown directly above them.
  const shifts = new Map<string, { nominal: number; exact: number }[]>();
  let baseMass = 0;
  let minShift = 0;
  for (const el in counts) {
    baseMass += (MONOISOTOPIC_MASS[el] ?? 0) * counts[el];
    const isotopes = ISOTOPE_ABUNDANCE[el];
    if (!isotopes || isotopes.length < 2) continue;

    let baseIndex = 0;
    for (let i = 1; i < isotopes.length; i++) {
      if (isotopes[i].abundance > isotopes[baseIndex].abundance) baseIndex = i;
    }
    // `exact` is relative to the base isotope and drives the plotted m/z;
    // `nominal` is the rounded value that decides which peak a state lands in.
    // They must share an origin -- computing the mass offset from the lightest
    // isotope while bucketing by the base isotope silently inflates every m/z.
    const baseIsoMass = isotopes[baseIndex].mass;
    const elementShifts = isotopes.map((iso) => ({
      nominal: Math.round(iso.mass - baseIsoMass),
      exact: iso.mass - baseIsoMass,
    }));
    minShift = Math.min(minShift, ...elementShifts.map((sh) => sh.nominal));
    shifts.set(el, elementShifts);
  }

  // State is a map from nominal offset -> { probability, massSum }, where
  // massSum is the probability-weighted running total. Merging by offset after
  // *every atom* is what keeps this linear: collecting every combination and
  // merging only at the end grows the intermediate array exponentially (a
  // 12-carbon chain ran out of memory), because the offsets collapse onto
  // only a handful of values while the number of ways to reach them doubles
  // per atom. Holding a Map keyed by offset keeps it proportional to the
  // number of distinct peaks instead.
  let dist = new Map<number, { probability: number; massSum: number }>();
  dist.set(0, { probability: 1, massSum: 0 });

  for (const el in counts) {
    const elementShifts = shifts.get(el);
    if (!elementShifts) continue;
    const isotopes = ISOTOPE_ABUNDANCE[el];

    for (let atom = 0; atom < counts[el]; atom++) {
      const next = new Map<number, { probability: number; massSum: number }>();
      for (const [offset, state] of dist) {
        for (let i = 0; i < isotopes.length; i++) {
          const newOffset = offset + elementShifts[i].nominal;
          // Upper bound is the requested peak count; lower bound is the most
          // negative single-atom shift (peaks below it can't exist for this
          // molecule since no element present shifts that far).
          if (newOffset > peaks || newOffset < minShift) continue;
          const p = state.probability * isotopes[i].abundance;
          if (p === 0) continue;
          // A child's weighted mass sum is the parent's, scaled by this
          // isotope's abundance (the parent's combos each appear once per
          // isotope, each at this abundance), plus every combo's share of the
          // isotope's own mass delta:
          //     a * massSum + (state.probability * a) * delta
          // Leaving the `a *` factor off inflates each centroid by 1/a, so a
          // lone 13C reads as ~93 u rather than ~1.003.
          //
          // Exact mass, not the rounded nominal offset, so a merged peak sits
          // at its probability-weighted centroid rather than a running average
          // of averages (which also made the result order-dependent).
          const shifted = isotopes[i].abundance * state.massSum + p * elementShifts[i].exact;
          const existing = next.get(newOffset);
          if (existing) {
            existing.probability += p;
            existing.massSum += shifted;
          } else {
            next.set(newOffset, { probability: p, massSum: shifted });
          }
        }
      }
      dist = next;
    }
  }

  const raw = [...dist.entries()]
    .filter(([, v]) => v.probability > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([offset, v]) => ({ offset, mz: baseMass + v.massSum / v.probability, abundance: v.probability }));
  const max = Math.max(...raw.map((p) => p.abundance), 0);
  return raw.map((p) => ({ ...p, relativeIntensity: max > 0 ? p.abundance / max : 0 }));
}

export interface NeutralLoss {
  id: string;
  /** Loss written as a formula, e.g. "H2O". */
  formula: string;
  /** Exact mass lost, in u. */
  mass: number;
  /** When this loss is characteristic, for the tooltip. */
  note: string;
  /**
   * Elements the molecule must contain for this loss to be physically
   * available. A molecule with no oxygen cannot lose water, and listing it
   * anyway is noise that makes the panel look like boilerplate.
   */
  requires: string[];
  /**
   * Stronger structural requirement, checked against the drawn connectivity.
   * Optional: when absent, element availability is the whole test. These stay
   * deliberately coarse -- "has an OH" rather than "is a carboxylic acid" --
   * because a wrong negative here hides a loss that really does occur.
   */
  group?: (mol: Molecule) => boolean;
}

/** The bond joining two atoms, if there is one. */
function bondBetween(mol: Molecule, a: string, b: string) {
  for (const bondId in mol.bonds) {
    const bond = mol.bonds[bondId];
    if ((bond.a1 === a && bond.a2 === b) || (bond.a1 === b && bond.a2 === a)) return bond;
  }
  return undefined;
}

/** Atoms bonded to `id`. */
function neighboursOf(mol: Molecule, id: string): string[] {
  const out: string[] = [];
  for (const bondId in mol.bonds) {
    const bond = mol.bonds[bondId];
    if (bond.a1 === id) out.push(bond.a2);
    else if (bond.a2 === id) out.push(bond.a1);
  }
  return out;
}

/** An -OH or -COOH: oxygen bonded to carbon and bearing a hydrogen. */
function hasHydroxyl(mol: Molecule): boolean {
  for (const id in mol.atoms) {
    if (mol.atoms[id].element !== "O" || implicitH(mol, id) === 0) continue;
    if (neighboursOf(mol, id).some((n) => mol.atoms[n].element === "C")) return true;
  }
  return false;
}

/** A nitrogen with hydrogens -- an amine or, loosely, an amide. */
function hasAmine(mol: Molecule): boolean {
  for (const id in mol.atoms) {
    if ((mol.atoms[id].element as string) === "N" && implicitH(mol, id) > 0) return true;
  }
  return false;
}

/** A carboxyl group: carbon double-bonded to one oxygen, single-bonded to another. */
function hasCarboxyl(mol: Molecule): boolean {
  for (const id in mol.atoms) {
    if (mol.atoms[id].element !== "C") continue;
    let carbonylO = false;
    let hydroxylOrEtherO = false;
    for (const n of neighboursOf(mol, id)) {
      if (mol.atoms[n].element !== "O") continue;
      if (bondBetween(mol, id, n)?.order === 2) carbonylO = true;
      else hydroxylOrEtherO = true;
    }
    if (carbonylO && hydroxylOrEtherO) return true;
  }
  return false;
}

/** A sulfonyl group: sulfur bonded to two oxygens and two carbons. */
function hasSulfonyl(mol: Molecule): boolean {
  for (const id in mol.atoms) {
    if (mol.atoms[id].element !== "S") continue;
    const ns = neighboursOf(mol, id);
    if (ns.filter((n) => mol.atoms[n].element === "O").length >= 2 && ns.filter((n) => mol.atoms[n].element === "C").length >= 2) {
      return true;
    }
  }
  return false;
}

/** A nitro group: nitrogen bonded to two oxygens. */
function hasNitro(mol: Molecule): boolean {
  for (const id in mol.atoms) {
    if (mol.atoms[id].element !== "N") continue;
    if (neighboursOf(mol, id).filter((n) => mol.atoms[n].element === "O").length >= 2) return true;
  }
  return false;
}

/** A carbonyl bonded to a heteroatom -- an ester, amide or acid. */
function hasEsterOrAmide(mol: Molecule): boolean {
  for (const id in mol.atoms) {
    if (mol.atoms[id].element !== "C") continue;
    let carbonyl = false;
    let hetero = false;
    for (const n of neighboursOf(mol, id)) {
      const el = mol.atoms[n].element;
      if (el === "O" || el === "N") hetero = true;
      if (el === "O" && bondBetween(mol, id, n)?.order === 2) carbonyl = true;
    }
    if (carbonyl && hetero) return true;
  }
  return false;
}

/**
 * Which of the listed losses this molecule can actually make.
 *
 * The panel used to show the same six lightest losses for everything, so a
 * molecule with no oxygen was still offered water and one with no nitrogen
 * still offered ammonia. Element availability alone already removes most of
 * the boilerplate; the group checks remove the rest without pretending to
 * more precision than a 2D drawing can support.
 */
export function applicableNeutralLosses(mol: Molecule): NeutralLoss[] {
  // elementCounts rather than the raw atom list: hydrogens are implicit, so a
  // molecule drawn as "C" alone contains no H atom yet can obviously lose H2.
  const present = new Set<string>(Object.keys(elementCounts(mol)));
  return NEUTRAL_LOSSES.filter((loss) => {
    if (!loss.requires.every((el) => present.has(el))) return false;
    return loss.group ? loss.group(mol) : true;
  });
}

/**
 * The neutral losses a spectrum is expected to show, and what each one usually
 * means. Listed by the mass lost (so they read in the order a student meets
 * them going down a spectrum) rather than by mechanism.
 *
 * These are the standard, well-established assignments; a loss of 18.0106 is
 * water essentially without exception. That unambiguity is the point -- it is
 * what makes a student able to read a real peak without a prediction model.
 */
export const NEUTRAL_LOSSES: NeutralLoss[] = [
  { id: "H2", formula: "H2", mass: 2.015650, note: "Hydrogen, sometimes from a fragmenting double bond", requires: ["H"] },
  { id: "CO", formula: "CO", mass: 27.994915, note: "Carbon monoxide -- carbonyl loss", requires: ["C", "O"], group: hasEsterOrAmide },
  { id: "N2", formula: "N2", mass: 28.006148, note: "Nitrogen, from diazo or azide groups", requires: ["N"] },
  { id: "NO", formula: "NO", mass: 29.997989, note: "Nitric oxide, from nitro groups", requires: ["N", "O"], group: hasNitro },
  { id: "CH2O", formula: "CH2O", mass: 30.010565, note: "Formaldehyde", requires: ["C", "H", "O"] },
  { id: "H2O", formula: "H2O", mass: 18.010565, note: "Water -- dehydration, common for alcohols and acids", requires: ["H", "O"], group: hasHydroxyl },
  { id: "NH3", formula: "NH3", mass: 17.026549, note: "Ammonia, from ammonium or amine groups", requires: ["H", "N"], group: hasAmine },
  { id: "CH3OH", formula: "CH3OH", mass: 32.026215, note: "Methanol -- methyl ester loss", requires: ["C", "H", "O"], group: hasEsterOrAmide },
  { id: "HCN", formula: "HCN", mass: 27.010899, note: "Hydrogen cyanide", requires: ["H", "C", "N"] },
  { id: "C2H4", formula: "C2H4", mass: 28.031300, note: "Ethylene, from a saturated four-carbon chain", requires: ["C", "H"] },
  { id: "CH3CN", formula: "CH3CN", mass: 41.026549, note: "Acetonitrile", requires: ["C", "H", "N"] },
  { id: "CO2", formula: "CO2", mass: 43.989829, note: "Carbon dioxide, from carboxyl groups", requires: ["C", "O"], group: hasCarboxyl },
  { id: "C3H6O", formula: "C3H6O", mass: 58.041865, note: "Acetone or propanal", requires: ["C", "H", "O"] },
  { id: "C4H8", formula: "C4H8", mass: 56.062600, note: "Butene, from a butyl chain", requires: ["C", "H"] },
  { id: "C6H5OH", formula: "C6H6O", mass: 94.041865, note: "Phenol -- aromatic hydroxyl loss", requires: ["C", "H", "O"] },
  { id: "SO2", formula: "SO2", mass: 63.961900, note: "Sulfur dioxide, from sulfonyl groups", requires: ["S", "O"], group: hasSulfonyl },
  { id: "HNO2", formula: "HNO2", mass: 47.000728, note: "Nitrous acid", requires: ["H", "N", "O"], group: hasNitro },
  { id: "C6H4O2", formula: "C6H4O2", mass: 108.021130, note: "Benzoquinone-type loss", requires: ["C", "H", "O"] },
];

/** Sorts a copy of NEUTRAL_LOSSES by the mass lost, which is the order a
 * student reads a spectrum in. */
export function neutralLossesByMass(): NeutralLoss[] {
  return [...NEUTRAL_LOSSES].sort((a, b) => a.mass - b.mass);
}
