import type { Molecule } from "../types/chemistry";
import { computeFormula, parseSimpleFormula } from "../model/valence";
import type { ReactionComponent } from "./reactionBuilder";

export interface ReactionElementDifference {
  element: string;
  reactants: number;
  products: number;
}

export type ReactionBalanceStatus = "balanced" | "unbalanced" | "unknown";

export interface ReactionBalance {
  /** "unknown" when a coefficient is not a positive number (e.g. the
   * generic "n"), so the atom count cannot be interpreted. */
  status: ReactionBalanceStatus;
  reactants: Record<string, number>;
  products: Record<string, number>;
  /** Only the elements whose totals disagree; empty when balanced. */
  differences: ReactionElementDifference[];
}

/**
 * Parses an optional stoichiometric coefficient.
 *
 * Empty means 1. Integers, decimals ("0.5") and fractions ("1/2") are
 * accepted; anything else returns null so the caller can report that the
 * balance could not be checked rather than pretending the coefficient was 1.
 */
export function parseStoichiometricCoefficient(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (!text) return 1;

  const fraction = /^(\d+(?:\.\d+)?|\.\d+)\s*\/\s*(\d+(?:\.\d+)?|\.\d+)$/.exec(text);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    const coefficient = numerator / denominator;
    return coefficient > 0 ? coefficient : null;
  }

  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const coefficient = Number(text);
  return Number.isFinite(coefficient) && coefficient > 0 ? coefficient : null;
}

/** Element counts for one structure, using the same implicit-hydrogen and
 * abbreviated-group accounting as the formula readout elsewhere. */
export function moleculeElementCounts(molecule: Molecule): Record<string, number> {
  return parseSimpleFormula(computeFormula(molecule));
}

function addScaled(target: Record<string, number>, source: Record<string, number>, scale: number): void {
  for (const element in source) {
    target[element] = (target[element] ?? 0) + source[element] * scale;
  }
}

const ELEMENT_ORDER = (element: string): number => (element === "C" ? 0 : element === "H" ? 1 : 2);

function compareElementNames(a: string, b: string): number {
  const order = ELEMENT_ORDER(a) - ELEMENT_ORDER(b);
  if (order !== 0) return order;
  return a.localeCompare(b);
}

const EPSILON = 1e-6;

/**
 * Checks whether a reaction row conserves atoms, taking each row's
 * stoichiometric coefficient into account. It compares element totals only —
 * charge and redox bookkeeping are intentionally out of scope.
 */
export function computeReactionBalance(
  reactants: ReactionComponent[],
  products: ReactionComponent[]
): ReactionBalance {
  const left: Record<string, number> = {};
  const right: Record<string, number> = {};
  let unknown = false;

  const accumulate = (components: ReactionComponent[], target: Record<string, number>) => {
    for (const component of components) {
      const coefficient = parseStoichiometricCoefficient(component.coefficient);
      if (coefficient === null) {
        unknown = true;
        continue;
      }
      addScaled(target, moleculeElementCounts(component.molecule), coefficient);
    }
  };
  accumulate(reactants, left);
  accumulate(products, right);

  const elements = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareElementNames);
  const differences: ReactionElementDifference[] = [];
  if (!unknown) {
    for (const element of elements) {
      const a = left[element] ?? 0;
      const b = right[element] ?? 0;
      if (Math.abs(a - b) > EPSILON) differences.push({ element, reactants: a, products: b });
    }
  }

  return {
    status: unknown ? "unknown" : differences.length === 0 ? "balanced" : "unbalanced",
    reactants: left,
    products: right,
    differences,
  };
}

/** Human-readable "C 2 → 3, H 6 → 4" summary for a status message. */
export function formatBalanceDifferences(differences: ReactionElementDifference[]): string {
  return differences
    .map((difference) => `${difference.element} ${formatCount(difference.reactants)} → ${formatCount(difference.products)}`)
    .join(", ");
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}
