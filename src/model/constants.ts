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

export const RING_TEMPLATES: RingTemplate[] = [
  { id: "benzene", label: "Benzene", sides: 6, aromatic: true },
  { id: "cyclohexane", label: "Cyclohexane", sides: 6, aromatic: false },
  { id: "cyclopentane", label: "Cyclopentane", sides: 5, aromatic: false },
  { id: "cyclobutane", label: "Cyclobutane", sides: 4, aromatic: false },
  { id: "cyclopropane", label: "Cyclopropane", sides: 3, aromatic: false },
];
