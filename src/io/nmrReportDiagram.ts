import type { Molecule } from "../types/chemistry";

/**
 * The NMR report's diagram *annotation* rules: which atom a predicted signal
 * belongs to.
 *
 * The layout, fitting and hydrogen-handling half of this used to live here too,
 * but none of it is NMR-specific and the IR report needs the same rules for the
 * same reasons, so it now lives in structureDiagram.ts. Everything below is
 * re-exported from there so the four NMR callers (and their tests) keep
 * importing from here unchanged.
 */

export {
  diagramBoxSize,
  diagramExtent,
  diagramSourceFragment,
  filterForReportDiagram,
  hydrogenParent,
  hydrogenSuffixForLabel,
  moleculeWithDisplayHydrogens,
} from "./structureDiagram";
export type { DiagramExtent, VisibleAtomsAndBonds } from "./structureDiagram";

/**
 * The subset of an exported SMILES atom order that the prediction backend's
 * `atom_index` actually refers to: every atom that is not a hydrogen.
 *
 * This exists because the two index spaces are NOT the same, and assuming they
 * are silently mislabels every shift on any structure drawn with explicit
 * hydrogens. Verified against the running backend: `CCC` and
 * `[H]C([H])([H])C([H])([H])C([H])([H])[H]` return byte-identical predictions
 * numbered 0,1,2 with numHs 3,2,3 - the explicit hydrogens are dropped before
 * the model sees the molecule, and the surviving heavy atoms are renumbered
 * from zero. Deuterium is dropped too (`C[2H]` yields a single prediction, for
 * the carbon), so this filters on the element rather than on the drawn-hydrogen
 * test used elsewhere for display.
 *
 * Meanwhile the app's own `atomOrder` DOES contain those hydrogens, because the
 * SMILES writer emits them as real `[H]` atoms. So mapping `atom_index` through
 * the unfiltered order hands atom 0's shift to a hydrogen and shifts every
 * subsequent atom by however many hydrogens precede it - which is what the
 * `implausible` warning was built to catch, though the underlying cause is an
 * index mismatch rather than a chemistry problem.
 *
 * Note this must be used ONLY to resolve prediction indices. Atom LABELS still
 * want the full order, so hydrogens get their own "H1", "H2" numbering.
 */
export function heavyAtomOrder(fragment: Molecule, atomOrder: readonly string[]): string[] {
  return atomOrder.filter((atomId) => {
    const atom = fragment.atoms[atomId];
    // An id the fragment doesn't have can't be classified; keep it, so a
    // missing atom shows up as a missing label rather than shifting the rest.
    return !atom || atom.element !== "H";
  });
}
