import type { Element, RingTemplate } from "../types/chemistry";

/** Canonical bond length in SVG user units at zoom = 1. */
export const BOND_LEN = 42;

export type ElementCategory =
  | "nonmetal" | "halogen" | "noble-gas" | "alkali" | "alkaline-earth"
  | "metalloid" | "post-transition" | "transition" | "lanthanide" | "actinide";

export interface PeriodicElementInfo {
  symbol: Element;
  name: string;
  /** Atomic number — also this element's position in PERIODIC_TABLE. */
  number: number;
  /** Standard atomic weight (g/mol), 2 decimals — for elements with no
   * stable isotope this is the mass number of the most stable known one,
   * same convention as any periodic table wallchart. Precision enough for
   * a drawing tool's live MW readout, not an analytical one. */
  weight: number;
  /** Row/column for the picker grid. Lanthanides/actinides use the
   * conventional detached-rows convention: period 8/9, group = position
   * (1-15) within that row, rather than their real period 6/7 group 3. */
  period: number;
  group: number;
  category: ElementCategory;
}

/**
 * The full periodic table (1-118) — symbol, name, weight, and picker grid
 * position for every element. ELEMENTS/ATOMIC_WEIGHT/ELEMENT_COLOR/
 * ELEMENT_NAME below are all derived from this, so it's the single place
 * to add/correct an element's data.
 */
export const PERIODIC_TABLE: PeriodicElementInfo[] = [
  { symbol: "H", name: "Hydrogen", number: 1, weight: 1.008, period: 1, group: 1, category: "nonmetal" },
  { symbol: "He", name: "Helium", number: 2, weight: 4.003, period: 1, group: 18, category: "noble-gas" },
  { symbol: "Li", name: "Lithium", number: 3, weight: 6.94, period: 2, group: 1, category: "alkali" },
  { symbol: "Be", name: "Beryllium", number: 4, weight: 9.012, period: 2, group: 2, category: "alkaline-earth" },
  { symbol: "B", name: "Boron", number: 5, weight: 10.81, period: 2, group: 13, category: "metalloid" },
  { symbol: "C", name: "Carbon", number: 6, weight: 12.01, period: 2, group: 14, category: "nonmetal" },
  { symbol: "N", name: "Nitrogen", number: 7, weight: 14.01, period: 2, group: 15, category: "nonmetal" },
  { symbol: "O", name: "Oxygen", number: 8, weight: 16.00, period: 2, group: 16, category: "nonmetal" },
  { symbol: "F", name: "Fluorine", number: 9, weight: 19.00, period: 2, group: 17, category: "halogen" },
  { symbol: "Ne", name: "Neon", number: 10, weight: 20.18, period: 2, group: 18, category: "noble-gas" },
  { symbol: "Na", name: "Sodium", number: 11, weight: 22.99, period: 3, group: 1, category: "alkali" },
  { symbol: "Mg", name: "Magnesium", number: 12, weight: 24.31, period: 3, group: 2, category: "alkaline-earth" },
  { symbol: "Al", name: "Aluminium", number: 13, weight: 26.98, period: 3, group: 13, category: "post-transition" },
  { symbol: "Si", name: "Silicon", number: 14, weight: 28.09, period: 3, group: 14, category: "metalloid" },
  { symbol: "P", name: "Phosphorus", number: 15, weight: 30.97, period: 3, group: 15, category: "nonmetal" },
  { symbol: "S", name: "Sulfur", number: 16, weight: 32.07, period: 3, group: 16, category: "nonmetal" },
  { symbol: "Cl", name: "Chlorine", number: 17, weight: 35.45, period: 3, group: 17, category: "halogen" },
  { symbol: "Ar", name: "Argon", number: 18, weight: 39.95, period: 3, group: 18, category: "noble-gas" },
  { symbol: "K", name: "Potassium", number: 19, weight: 39.10, period: 4, group: 1, category: "alkali" },
  { symbol: "Ca", name: "Calcium", number: 20, weight: 40.08, period: 4, group: 2, category: "alkaline-earth" },
  { symbol: "Sc", name: "Scandium", number: 21, weight: 44.96, period: 4, group: 3, category: "transition" },
  { symbol: "Ti", name: "Titanium", number: 22, weight: 47.87, period: 4, group: 4, category: "transition" },
  { symbol: "V", name: "Vanadium", number: 23, weight: 50.94, period: 4, group: 5, category: "transition" },
  { symbol: "Cr", name: "Chromium", number: 24, weight: 52.00, period: 4, group: 6, category: "transition" },
  { symbol: "Mn", name: "Manganese", number: 25, weight: 54.94, period: 4, group: 7, category: "transition" },
  { symbol: "Fe", name: "Iron", number: 26, weight: 55.85, period: 4, group: 8, category: "transition" },
  { symbol: "Co", name: "Cobalt", number: 27, weight: 58.93, period: 4, group: 9, category: "transition" },
  { symbol: "Ni", name: "Nickel", number: 28, weight: 58.69, period: 4, group: 10, category: "transition" },
  { symbol: "Cu", name: "Copper", number: 29, weight: 63.55, period: 4, group: 11, category: "transition" },
  { symbol: "Zn", name: "Zinc", number: 30, weight: 65.38, period: 4, group: 12, category: "transition" },
  { symbol: "Ga", name: "Gallium", number: 31, weight: 69.72, period: 4, group: 13, category: "post-transition" },
  { symbol: "Ge", name: "Germanium", number: 32, weight: 72.63, period: 4, group: 14, category: "metalloid" },
  { symbol: "As", name: "Arsenic", number: 33, weight: 74.92, period: 4, group: 15, category: "metalloid" },
  { symbol: "Se", name: "Selenium", number: 34, weight: 78.97, period: 4, group: 16, category: "nonmetal" },
  { symbol: "Br", name: "Bromine", number: 35, weight: 79.90, period: 4, group: 17, category: "halogen" },
  { symbol: "Kr", name: "Krypton", number: 36, weight: 83.80, period: 4, group: 18, category: "noble-gas" },
  { symbol: "Rb", name: "Rubidium", number: 37, weight: 85.47, period: 5, group: 1, category: "alkali" },
  { symbol: "Sr", name: "Strontium", number: 38, weight: 87.62, period: 5, group: 2, category: "alkaline-earth" },
  { symbol: "Y", name: "Yttrium", number: 39, weight: 88.91, period: 5, group: 3, category: "transition" },
  { symbol: "Zr", name: "Zirconium", number: 40, weight: 91.22, period: 5, group: 4, category: "transition" },
  { symbol: "Nb", name: "Niobium", number: 41, weight: 92.91, period: 5, group: 5, category: "transition" },
  { symbol: "Mo", name: "Molybdenum", number: 42, weight: 95.95, period: 5, group: 6, category: "transition" },
  { symbol: "Tc", name: "Technetium", number: 43, weight: 98.00, period: 5, group: 7, category: "transition" },
  { symbol: "Ru", name: "Ruthenium", number: 44, weight: 101.07, period: 5, group: 8, category: "transition" },
  { symbol: "Rh", name: "Rhodium", number: 45, weight: 102.91, period: 5, group: 9, category: "transition" },
  { symbol: "Pd", name: "Palladium", number: 46, weight: 106.42, period: 5, group: 10, category: "transition" },
  { symbol: "Ag", name: "Silver", number: 47, weight: 107.87, period: 5, group: 11, category: "transition" },
  { symbol: "Cd", name: "Cadmium", number: 48, weight: 112.41, period: 5, group: 12, category: "transition" },
  { symbol: "In", name: "Indium", number: 49, weight: 114.82, period: 5, group: 13, category: "post-transition" },
  { symbol: "Sn", name: "Tin", number: 50, weight: 118.71, period: 5, group: 14, category: "post-transition" },
  { symbol: "Sb", name: "Antimony", number: 51, weight: 121.76, period: 5, group: 15, category: "metalloid" },
  { symbol: "Te", name: "Tellurium", number: 52, weight: 127.60, period: 5, group: 16, category: "metalloid" },
  { symbol: "I", name: "Iodine", number: 53, weight: 126.90, period: 5, group: 17, category: "halogen" },
  { symbol: "Xe", name: "Xenon", number: 54, weight: 131.29, period: 5, group: 18, category: "noble-gas" },
  { symbol: "Cs", name: "Caesium", number: 55, weight: 132.91, period: 6, group: 1, category: "alkali" },
  { symbol: "Ba", name: "Barium", number: 56, weight: 137.33, period: 6, group: 2, category: "alkaline-earth" },
  { symbol: "La", name: "Lanthanum", number: 57, weight: 138.91, period: 8, group: 3, category: "lanthanide" },
  { symbol: "Ce", name: "Cerium", number: 58, weight: 140.12, period: 8, group: 4, category: "lanthanide" },
  { symbol: "Pr", name: "Praseodymium", number: 59, weight: 140.91, period: 8, group: 5, category: "lanthanide" },
  { symbol: "Nd", name: "Neodymium", number: 60, weight: 144.24, period: 8, group: 6, category: "lanthanide" },
  { symbol: "Pm", name: "Promethium", number: 61, weight: 145.00, period: 8, group: 7, category: "lanthanide" },
  { symbol: "Sm", name: "Samarium", number: 62, weight: 150.36, period: 8, group: 8, category: "lanthanide" },
  { symbol: "Eu", name: "Europium", number: 63, weight: 151.96, period: 8, group: 9, category: "lanthanide" },
  { symbol: "Gd", name: "Gadolinium", number: 64, weight: 157.25, period: 8, group: 10, category: "lanthanide" },
  { symbol: "Tb", name: "Terbium", number: 65, weight: 158.93, period: 8, group: 11, category: "lanthanide" },
  { symbol: "Dy", name: "Dysprosium", number: 66, weight: 162.50, period: 8, group: 12, category: "lanthanide" },
  { symbol: "Ho", name: "Holmium", number: 67, weight: 164.93, period: 8, group: 13, category: "lanthanide" },
  { symbol: "Er", name: "Erbium", number: 68, weight: 167.26, period: 8, group: 14, category: "lanthanide" },
  { symbol: "Tm", name: "Thulium", number: 69, weight: 168.93, period: 8, group: 15, category: "lanthanide" },
  { symbol: "Yb", name: "Ytterbium", number: 70, weight: 173.05, period: 8, group: 16, category: "lanthanide" },
  { symbol: "Lu", name: "Lutetium", number: 71, weight: 174.97, period: 8, group: 17, category: "lanthanide" },
  { symbol: "Hf", name: "Hafnium", number: 72, weight: 178.49, period: 6, group: 4, category: "transition" },
  { symbol: "Ta", name: "Tantalum", number: 73, weight: 180.95, period: 6, group: 5, category: "transition" },
  { symbol: "W", name: "Tungsten", number: 74, weight: 183.84, period: 6, group: 6, category: "transition" },
  { symbol: "Re", name: "Rhenium", number: 75, weight: 186.21, period: 6, group: 7, category: "transition" },
  { symbol: "Os", name: "Osmium", number: 76, weight: 190.23, period: 6, group: 8, category: "transition" },
  { symbol: "Ir", name: "Iridium", number: 77, weight: 192.22, period: 6, group: 9, category: "transition" },
  { symbol: "Pt", name: "Platinum", number: 78, weight: 195.08, period: 6, group: 10, category: "transition" },
  { symbol: "Au", name: "Gold", number: 79, weight: 196.97, period: 6, group: 11, category: "transition" },
  { symbol: "Hg", name: "Mercury", number: 80, weight: 200.59, period: 6, group: 12, category: "transition" },
  { symbol: "Tl", name: "Thallium", number: 81, weight: 204.38, period: 6, group: 13, category: "post-transition" },
  { symbol: "Pb", name: "Lead", number: 82, weight: 207.2, period: 6, group: 14, category: "post-transition" },
  { symbol: "Bi", name: "Bismuth", number: 83, weight: 208.98, period: 6, group: 15, category: "post-transition" },
  { symbol: "Po", name: "Polonium", number: 84, weight: 209.00, period: 6, group: 16, category: "metalloid" },
  { symbol: "At", name: "Astatine", number: 85, weight: 210.00, period: 6, group: 17, category: "halogen" },
  { symbol: "Rn", name: "Radon", number: 86, weight: 222.00, period: 6, group: 18, category: "noble-gas" },
  { symbol: "Fr", name: "Francium", number: 87, weight: 223.00, period: 7, group: 1, category: "alkali" },
  { symbol: "Ra", name: "Radium", number: 88, weight: 226.00, period: 7, group: 2, category: "alkaline-earth" },
  { symbol: "Ac", name: "Actinium", number: 89, weight: 227.00, period: 9, group: 3, category: "actinide" },
  { symbol: "Th", name: "Thorium", number: 90, weight: 232.04, period: 9, group: 4, category: "actinide" },
  { symbol: "Pa", name: "Protactinium", number: 91, weight: 231.04, period: 9, group: 5, category: "actinide" },
  { symbol: "U", name: "Uranium", number: 92, weight: 238.03, period: 9, group: 6, category: "actinide" },
  { symbol: "Np", name: "Neptunium", number: 93, weight: 237.00, period: 9, group: 7, category: "actinide" },
  { symbol: "Pu", name: "Plutonium", number: 94, weight: 244.00, period: 9, group: 8, category: "actinide" },
  { symbol: "Am", name: "Americium", number: 95, weight: 243.00, period: 9, group: 9, category: "actinide" },
  { symbol: "Cm", name: "Curium", number: 96, weight: 247.00, period: 9, group: 10, category: "actinide" },
  { symbol: "Bk", name: "Berkelium", number: 97, weight: 247.00, period: 9, group: 11, category: "actinide" },
  { symbol: "Cf", name: "Californium", number: 98, weight: 251.00, period: 9, group: 12, category: "actinide" },
  { symbol: "Es", name: "Einsteinium", number: 99, weight: 252.00, period: 9, group: 13, category: "actinide" },
  { symbol: "Fm", name: "Fermium", number: 100, weight: 257.00, period: 9, group: 14, category: "actinide" },
  { symbol: "Md", name: "Mendelevium", number: 101, weight: 258.00, period: 9, group: 15, category: "actinide" },
  { symbol: "No", name: "Nobelium", number: 102, weight: 259.00, period: 9, group: 16, category: "actinide" },
  { symbol: "Lr", name: "Lawrencium", number: 103, weight: 266.00, period: 9, group: 17, category: "actinide" },
  { symbol: "Rf", name: "Rutherfordium", number: 104, weight: 267.00, period: 7, group: 4, category: "transition" },
  { symbol: "Db", name: "Dubnium", number: 105, weight: 268.00, period: 7, group: 5, category: "transition" },
  { symbol: "Sg", name: "Seaborgium", number: 106, weight: 269.00, period: 7, group: 6, category: "transition" },
  { symbol: "Bh", name: "Bohrium", number: 107, weight: 270.00, period: 7, group: 7, category: "transition" },
  { symbol: "Hs", name: "Hassium", number: 108, weight: 269.00, period: 7, group: 8, category: "transition" },
  { symbol: "Mt", name: "Meitnerium", number: 109, weight: 278.00, period: 7, group: 9, category: "transition" },
  { symbol: "Ds", name: "Darmstadtium", number: 110, weight: 281.00, period: 7, group: 10, category: "transition" },
  { symbol: "Rg", name: "Roentgenium", number: 111, weight: 282.00, period: 7, group: 11, category: "transition" },
  { symbol: "Cn", name: "Copernicium", number: 112, weight: 285.00, period: 7, group: 12, category: "transition" },
  { symbol: "Nh", name: "Nihonium", number: 113, weight: 286.00, period: 7, group: 13, category: "post-transition" },
  { symbol: "Fl", name: "Flerovium", number: 114, weight: 289.00, period: 7, group: 14, category: "post-transition" },
  { symbol: "Mc", name: "Moscovium", number: 115, weight: 290.00, period: 7, group: 15, category: "post-transition" },
  { symbol: "Lv", name: "Livermorium", number: 116, weight: 293.00, period: 7, group: 16, category: "post-transition" },
  { symbol: "Ts", name: "Tennessine", number: 117, weight: 294.00, period: 7, group: 17, category: "halogen" },
  { symbol: "Og", name: "Oganesson", number: 118, weight: 294.00, period: 7, group: 18, category: "noble-gas" },
];

/** All elements the app can place on an atom, common ones first — used
 * wherever the full set is genuinely needed (e.g. isotopes, molfile
 * import). For the sidebar picker itself, see COMMON_ELEMENTS below plus
 * the full PeriodicTableModal opened from its "more" button. */
export const ELEMENTS: Element[] = [
  "C", "N", "O", "S", "P", "F", "Cl", "Br", "I", "H", "B", "Si",
  ...PERIODIC_TABLE.map((e) => e.symbol).filter((s) => !["C", "N", "O", "S", "P", "F", "Cl", "Br", "I", "H", "B", "Si"].includes(s)),
];

/** Shown directly in the sidebar's element picker, no expansion needed —
 * the handful of elements that come up in the overwhelming majority of
 * structures. */
export const COMMON_ELEMENTS: Element[] = ["C", "N", "O", "H", "Cl", "F", "Br"];

/** Everything else — opened via the picker's "more elements" button,
 * which now launches PeriodicTableModal (a real periodic-table layout,
 * searchable) instead of a flat overflow grid, since there are 118
 * possible elements rather than a handful. */
export const EXTENDED_ELEMENTS: Element[] = ELEMENTS.filter((el) => !COMMON_ELEMENTS.includes(el));

const CATEGORY_COLOR: Record<ElementCategory, string> = {
  nonmetal: "#5C7A29",
  halogen: "#2F9E44",
  "noble-gas": "#0C8599",
  alkali: "#9C3AAE",
  "alkaline-earth": "#7048B8",
  metalloid: "#9C7A44",
  "post-transition": "#4C6EF5",
  transition: "#E8590C",
  lanthanide: "#C2255C",
  actinide: "#AE3EC9",
};

/** Approximate CPK-style coloring for atom labels. The original twelve
 * (C, N, O, S, P, F, Cl, Br, I, H, B, Si) keep their individually-tuned
 * colors; every other element falls back to a shared color per
 * PERIODIC_TABLE category — a real per-element CPK palette isn't
 * something a teaching tool needs for, say, promethium. */
export const ELEMENT_COLOR: Record<Element, string> = Object.fromEntries(
  PERIODIC_TABLE.map((e) => [e.symbol, CATEGORY_COLOR[e.category]])
) as Record<Element, string>;
Object.assign(ELEMENT_COLOR, {
  C: "var(--ink)",
  N: "#3B5BDB",
  O: "#E03131",
  S: "#E8A100",
  P: "#E8590C",
  F: "#2F9E44",
  Cl: "#2F9E44",
  Br: "#9C3A1F",
  I: "#862E9C",
  H: "var(--ink)",
  B: "#D9822B",
  Si: "#9C7A44",
} satisfies Partial<Record<Element, string>>);

/** Full element name (English), for the periodic table picker's tooltips
 * and search. */
export const ELEMENT_NAME: Record<Element, string> = Object.fromEntries(
  PERIODIC_TABLE.map((e) => [e.symbol, e.name])
) as Record<Element, string>;

/** Standard atomic weights (g/mol), rounded to 2 decimals — enough
 * precision for a drawing tool's live MW readout, not an analytical one. */
export const ATOMIC_WEIGHT: Record<Element, number> = Object.fromEntries(
  PERIODIC_TABLE.map((e) => [e.symbol, e.weight])
) as Record<Element, number>;

/**
 * Baseline (neutral) valence for implicit-hydrogen and over-valence
 * calculations. This is intentionally a simplified organic-chemistry
 * approximation, not a full valence-electron model — see
 * `model/valence.ts` for how charge adjusts these.
 *
 * Deliberately a *partial* map, not a value for every element: it only
 * covers elements with one conventional, mostly-fixed valence (H, the
 * halogens, chalcogens, pnictogens, and the carbon/boron groups) —
 * exactly where "how many implicit hydrogens" is a well-defined question.
 * Transition metals, lanthanides, and actinides have genuinely variable
 * valence depending on oxidation state and ligands, so guessing one would
 * be actively misleading; model/valence.ts's implicitH/isOverValent treat
 * a missing entry here as "don't second-guess this atom's bonding" rather
 * than defaulting to 0.
 */
export const VALENCE: Partial<Record<Element, number>> = {
  H: 1,
  C: 4, Si: 4, Ge: 4, Sn: 4, Pb: 4,
  N: 3, P: 3, As: 3, Sb: 3, Bi: 3,
  O: 2, S: 2, Se: 2, Te: 2, Po: 2,
  F: 1, Cl: 1, Br: 1, I: 1, At: 1,
  B: 3, Al: 3, Ga: 3, In: 3, Tl: 3,
  Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Fr: 1,
  Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2, Ra: 2,
  He: 0, Ne: 0, Ar: 0, Kr: 0, Xe: 0, Rn: 0, Og: 0,
};

export interface IsotopePreset {
  id: string;
  element: Element;
  massNumber: number;
  /** What's shown on the canvas — deuterium/tritium get their conventional
   * single-letter symbols rather than "2H"/"3H". */
  label: string;
  /** Precise isotopic mass (g/mol) for the live MW readout — noticeably
   * different from the standard element's average atomic weight, which is
   * the whole point of labeling an isotope in the first place. */
  mass: number;
}

/**
 * A small set of isotopes actually common in organic chemistry teaching
 * and mechanism work — not a full nuclide table. Each entry's massNumber
 * is used both for the on-canvas label and for MDL's mass-difference
 * field on MOL export/import (see io/molfile.ts).
 */
export const ISOTOPE_PRESETS: IsotopePreset[] = [
  { id: "D", element: "H", massNumber: 2, label: "D", mass: 2.014 },
  { id: "T", element: "H", massNumber: 3, label: "T", mass: 3.016 },
  { id: "13C", element: "C", massNumber: 13, label: "13C", mass: 13.003 },
  { id: "14C", element: "C", massNumber: 14, label: "14C", mass: 14.003 },
  { id: "15N", element: "N", massNumber: 15, label: "15N", mass: 15.000 },
  { id: "17O", element: "O", massNumber: 17, label: "17O", mass: 16.999 },
  { id: "18O", element: "O", massNumber: 18, label: "18O", mass: 17.999 },
  // Radiolabeling/tracer isotopes routinely used in molecular biology
  // (metabolic labeling, pulse-chase, blotting) and the NMR-active
  // isotopes chemists reach for beyond 1H/13C.
  { id: "32P", element: "P", massNumber: 32, label: "32P", mass: 31.974 },
  { id: "35S", element: "S", massNumber: 35, label: "35S", mass: 34.969 },
  { id: "45Ca", element: "Ca", massNumber: 45, label: "45Ca", mass: 44.956 },
  { id: "57Fe", element: "Fe", massNumber: 57, label: "57Fe", mass: 56.935 },
  { id: "77Se", element: "Se", massNumber: 77, label: "77Se", mass: 76.919 },
  { id: "125I", element: "I", massNumber: 125, label: "125I", mass: 124.904 },
];

/** Standard (most abundant) mass number for each element — the reference
 * point for MDL's mass-difference field and for recognizing "this isotope
 * value is just the default, don't bother showing/exporting it". Partial —
 * only covers the elements ISOTOPE_PRESETS actually has entries for; every
 * consumer already treats a missing value as "no isotope info available"
 * (see io/molfile.ts). */
export const STANDARD_MASS_NUMBER: Partial<Record<Element, number>> = {
  H: 1, C: 12, N: 14, O: 16, S: 32, P: 31,
  F: 19, Cl: 35, Br: 79, I: 127, B: 11, Si: 28,
  Ca: 40, Fe: 56, Se: 80,
};

export interface AbbreviatedGroup {
  id: string;
  /** What's actually drawn on the canvas at that vertex. */
  label: string;
  /** Molecular formula of the group AS ATTACHED (i.e. the open valence is
   * already accounted for — this is the full substituent, not a fragment
   * missing an electron). Parsed by parseSimpleFormula for the live
   * formula/MW readout. */
  formula: string;
}

/**
 * Common substituent shorthands, placeable via the Groups tool as a single
 * labeled vertex instead of drawing out every atom. Each one is a single-
 * attachment (valence 1) substituent — there's no support here for
 * multi-attachment shorthands (e.g. a bridging group).
 */
export const ABBREVIATED_GROUPS: AbbreviatedGroup[] = [
  { id: "Me", label: "Me", formula: "CH3" },
  { id: "Et", label: "Et", formula: "C2H5" },
  { id: "tBu", label: "tBu", formula: "C4H9" },
  { id: "Ph", label: "Ph", formula: "C6H5" },
  { id: "Bn", label: "Bn", formula: "C7H7" },
  { id: "Ac", label: "Ac", formula: "C2H3O" },
  { id: "OMe", label: "OMe", formula: "CH3O" },
  { id: "Boc", label: "Boc", formula: "C5H9O2" },
  { id: "Ts", label: "Ts", formula: "C7H7O2S" },
];

export interface ReactiveSitePreset {
  id: string;
  /** What's actually drawn — a colon stands in for a shown lone pair and
   * a superscript sign for a shown charge, matching how organic chemistry
   * texts write these same generic placeholders by hand. */
  label: string;
  charge: number;
  lonePairs: number;
}

/**
 * Generic nucleophile/electrophile placeholders for mechanism-arrow
 * teaching diagrams — not real elements or formulas (so, unlike
 * ABBREVIATED_GROUPS, contribute nothing to formula/MW; see
 * valence.ts's isPlaceholderLabel), just a labeled vertex with whatever
 * charge/lone-pair mark the diagram calls for already set, in one click
 * instead of three (place atom, set charge, add lone pair).
 */
export const REACTIVE_SITE_PRESETS: ReactiveSitePreset[] = [
  { id: "Nu", label: "Nu", charge: 0, lonePairs: 0 },
  { id: "Nu-lp", label: "Nu", charge: 0, lonePairs: 1 },
  { id: "Nu-lp-neg", label: "Nu", charge: -1, lonePairs: 1 },
  { id: "E", label: "E", charge: 0, lonePairs: 0 },
  { id: "E-plus", label: "E", charge: 1, lonePairs: 0 },
];

export const RING_TEMPLATES: RingTemplate[] = [
  { id: "benzene", label: "Benzene", sides: 6, aromatic: true },
  { id: "cyclohexane", label: "Cyclohexane", sides: 6, aromatic: false },
  { id: "cyclopentane", label: "Cyclopentane", sides: 5, aromatic: false },
  { id: "cyclobutane", label: "Cyclobutane", sides: 4, aromatic: false },
  { id: "cyclopropane", label: "Cyclopropane", sides: 3, aromatic: false },
  { id: "cycloheptane", label: "Cycloheptane", sides: 7, aromatic: false },
  { id: "cyclooctane", label: "Cyclooctane", sides: 8, aromatic: false },
  {
    id: "pyridine", label: "Pyridine", sides: 6, aromatic: true,
    heteroatoms: [{ position: 0, element: "N" }],
  },
  {
    // Ring walk: O(0)-C(1)=C(2)-C(3)=C(4), closing bond 4 back to O(0).
    id: "furan", label: "Furan", sides: 5, aromatic: true,
    heteroatoms: [{ position: 0, element: "O" }],
    bondOrders: [1, 2, 1, 2, 1],
  },
  {
    id: "thiophene", label: "Thiophene", sides: 5, aromatic: true,
    heteroatoms: [{ position: 0, element: "S" }],
    bondOrders: [1, 2, 1, 2, 1],
  },
  {
    id: "pyrrole", label: "Pyrrole", sides: 5, aromatic: true,
    heteroatoms: [{ position: 0, element: "N" }],
    bondOrders: [1, 2, 1, 2, 1],
  },
  {
    // Ring walk: N1(0)-C2(1)=N3(2)-C4(3)=C5(4), closing bond 4 back to N1(0).
    id: "imidazole", label: "Imidazole", sides: 5, aromatic: true,
    heteroatoms: [{ position: 0, element: "N" }, { position: 2, element: "N" }],
    bondOrders: [1, 2, 1, 2, 1],
  },
  {
    // Ring walk: N1(0)-C2(1)-N3(2)-C4(3)-C5(4)-C6(5) — the generic
    // alternating-double-bond heuristic (see placeRing) already gives the
    // right Kekulé pattern for any 6-ring, aromatic or not, so unlike the
    // 5-membered heteroaromatics above this needs no bondOrders override.
    id: "pyrimidine", label: "Pyrimidine", sides: 6, aromatic: true,
    heteroatoms: [{ position: 0, element: "N" }, { position: 2, element: "N" }],
  },
  {
    id: "piperidine", label: "Piperidine", sides: 6, aromatic: false,
    heteroatoms: [{ position: 0, element: "N" }],
  },
  {
    id: "pyrrolidine", label: "Pyrrolidine", sides: 5, aromatic: false,
    heteroatoms: [{ position: 0, element: "N" }],
  },
  {
    id: "tetrahydrofuran", label: "Tetrahydrofuran", sides: 5, aromatic: false,
    heteroatoms: [{ position: 0, element: "O" }],
  },
  {
    id: "tetrahydropyran", label: "Tetrahydropyran", sides: 6, aromatic: false,
    heteroatoms: [{ position: 0, element: "O" }],
  },
  {
    // O and N directly across the ring from each other (a 1,4
    // relationship — position 0 and position 3 of 6 are opposite).
    id: "morpholine", label: "Morpholine", sides: 6, aromatic: false,
    heteroatoms: [{ position: 0, element: "O" }, { position: 3, element: "N" }],
  },
  {
    id: "piperazine", label: "Piperazine", sides: 6, aromatic: false,
    heteroatoms: [{ position: 0, element: "N" }, { position: 3, element: "N" }],
  },
  {
    // Two fused regular hexagons (10 C, 11 bonds) — not a single polygon,
    // so `sides` here is nominal/unused; see placeNaphthalene in
    // engine/ringPlacement.ts for its actual (fixed) geometry and Kekulé
    // pattern, and RingTemplate.fused's doc comment for why it needs its
    // own placement + icon code paths.
    id: "naphthalene", label: "Naphthalene", sides: 6, aromatic: true,
    fused: true,
  },
];

/** Default size for a lone bracket (placed via the store's addBracketAnnotation) and the starting point for a dragged pair (see bracketPairLayout). */
export const DEFAULT_BRACKET_WIDTH = 16;
export const DEFAULT_BRACKET_HEIGHT = 90;
