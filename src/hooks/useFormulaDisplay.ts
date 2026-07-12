import { useMemo } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { computeFormula, computeMolecularWeight, findConnectedFragments } from "../model/valence";

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
 *    anything) and show each fragment's own formula, left-to-right,
 *    separated with a dash — so a scheme reads like "C6H6 – HNO3" instead
 *    of one fused formula. A single molecule on the canvas is just the
 *    one-fragment case, so this looks identical to before.
 * The combined weight is still a plain sum across the whole canvas in the
 * multi-fragment case, since mass (unlike a formula string) is legitimately
 * additive regardless of connectivity.
 */
export function useFormulaDisplay(): { formula: string; mw: number } {
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);

  return useMemo(() => {
    if (selected.size > 0) {
      return { formula: computeFormula(molecule, selected), mw: computeMolecularWeight(molecule, selected) };
    }
    const fragments = findConnectedFragments(molecule);
    const formula = fragments.map((ids) => computeFormula(molecule, ids)).filter(Boolean).join(" \u2013 ");
    return { formula, mw: computeMolecularWeight(molecule) };
  }, [molecule, selected]);
}
