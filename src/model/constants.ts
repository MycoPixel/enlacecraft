import type { Element, RingTemplate } from "../types/chemistry";

/** Canonical bond length in SVG user units at zoom = 1. */
export const BOND_LEN = 42;

export const ELEMENTS: Element[] = [
  "C", "N", "O", "S", "P", "F", "Cl", "Br", "I", "H", "B", "Si",
];

/** Approximate CPK-style coloring for atom labels. */
export const ELEMENT_COLOR: Record<Element, string> = {
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
};

/**
 * Baseline (neutral) valence for implicit-hydrogen and over-valence
 * calculations. This is intentionally a simplified organic-chemistry
 * subset — see `model/valence.ts` for how charge adjusts these.
 */
export const VALENCE: Record<Element, number> = {
  C: 4, N: 3, O: 2, S: 2, P: 3,
  F: 1, Cl: 1, Br: 1, I: 1, H: 1, B: 3, Si: 4,
};

/**
 * Standard atomic weights (g/mol), rounded to 2 decimals — enough
 * precision for a drawing tool's live MW readout, not an analytical one.
 */
export const ATOMIC_WEIGHT: Record<Element, number> = {
  C: 12.01, N: 14.01, O: 16.00, S: 32.07, P: 30.97,
  F: 19.00, Cl: 35.45, Br: 79.90, I: 126.90, H: 1.008, B: 10.81, Si: 28.09,
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
  { id: "18O", element: "O", massNumber: 18, label: "18O", mass: 17.999 },
];

/** Standard (most abundant) mass number for each element — the reference
 * point for MDL's mass-difference field and for recognizing "this isotope
 * value is just the default, don't bother showing/exporting it". */
export const STANDARD_MASS_NUMBER: Record<Element, number> = {
  H: 1, C: 12, N: 14, O: 16, S: 32, P: 31,
  F: 19, Cl: 35, Br: 79, I: 127, B: 11, Si: 28,
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

export const RING_TEMPLATES: RingTemplate[] = [
  { id: "benzene", label: "Benzene", sides: 6, aromatic: true },
  { id: "cyclohexane", label: "Cyclohexane", sides: 6, aromatic: false },
  { id: "cyclopentane", label: "Cyclopentane", sides: 5, aromatic: false },
  { id: "cyclobutane", label: "Cyclobutane", sides: 4, aromatic: false },
  { id: "cyclopropane", label: "Cyclopropane", sides: 3, aromatic: false },
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
];

/** Default size for a lone bracket (placed via the store's addBracketAnnotation) and the starting point for a dragged pair (see bracketPairLayout). */
export const DEFAULT_BRACKET_WIDTH = 16;
export const DEFAULT_BRACKET_HEIGHT = 90;
