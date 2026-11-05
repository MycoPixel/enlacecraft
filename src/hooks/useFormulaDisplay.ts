import { useMemo } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { computeFormula, computeMolecularWeight, findConnectedFragments } from "../model/valence";

export interface FormulaFragment {
  formula: string;
  mw: number;
}

/**
 * Formula + molecular weight to display in the UI. A bare sum over every
 * atom on the canvas is only meaningful when there's a single molecule
 * there — a reaction scheme (or just a couple of unrelated molecules)
 * would get all their atoms mashed into one chemically-meaningless
 * combined formula. So instead:
 *  - If something's selected, show that selection's own formula/weight
 *    (handy for checking a substructure on its own).
 *  - Otherwise, split the canvas into its connected fragments (by bonds
 *    only — a reaction scheme's "+" or arrow annotation doesn't connect
 *    anything) and treat each fragment as its own molecule.
 * `fragments` carries each one's own formula and molar mass — the same
 * reasoning that keeps their formulas from being fused applies to their
 * masses too, so callers that want to display "C6H6 (78.11) – C6H14
 * (86.18)" rather than one combined number should use it instead of the
 * flat `mw`. `formula`/`mw` are still provided as the dash-joined string
 * and the plain sum, for callers that just want a single readout.
 */
export function useFormulaDisplay(): { formula: string; mw: number; fragments: FormulaFragment[] } {
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);

  return useMemo(() => {
    if (selected.size > 0) {
      const formula = computeFormula(molecule, selected);
      const mw = computeMolecularWeight(molecule, selected);
      return { formula, mw, fragments: formula ? [{ formula, mw }] : [] };
    }
    const fragmentAtomIds = findConnectedFragments(molecule);
    const fragments = fragmentAtomIds
      .map((ids) => ({ formula: computeFormula(molecule, ids), mw: computeMolecularWeight(molecule, ids) }))
      .filter((f) => f.formula);
    const formula = fragments.map((f) => f.formula).join(" \u2013 ");
    const mw = fragments.reduce((sum, f) => sum + f.mw, 0);
    return { formula, mw, fragments };
  }, [molecule, selected]);
}
