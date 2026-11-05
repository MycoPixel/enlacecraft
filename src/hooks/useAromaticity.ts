import { useMemo } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { findConnectedFragments } from "../model/valence";
import { subMolecule } from "../model/molecule";
import type { Molecule } from "../types/chemistry";
import { analyzeAromaticity, type AromaticitySystem } from "../engine/aromaticity";

export interface AromaticityFragmentResult {
  /** Ring systems found, or an empty array when the fragment has none. */
  systems: AromaticitySystem[];
  /** Atom ids of the fragment, so the UI can tell "no rings" from "no
   *  fragment at all" and not report an empty molecule as a clean result. */
  atomCount: number;
}

/**
 * Selection, else each connected fragment separately — the same scoping
 * useMoleculeDescriptors and useFormulaDisplay use, and for the same reason:
 * a verdict of "aromatic" over a whole drawing that holds a reactant and a
 * product either side of a reaction arrow would be describing a molecule
 * nobody drew. Rings can't span two fragments (a ring is a connected cycle),
 * so splitting here never separates a ring from its own fused system.
 */
export function getAromaticityFragments(molecule: Molecule, selected: Set<string>): Molecule[] {
  const idGroups = selected.size > 0 ? [[...selected]] : findConnectedFragments(molecule);
  return idGroups.map((ids) => subMolecule(molecule, ids)).filter((frag) => Object.keys(frag.atoms).length > 0);
}

/**
 * Aromatic / antiaromatic / non-aromatic verdicts for every ring system in
 * the current selection (or the whole drawing), recomputed as the structure
 * changes.
 *
 * Pure structure analysis — no network, no backend, nothing to wait for — so
 * unlike the NMR and spectra panels this is correct to render the instant the
 * dropdown opens, on the web build as well as the desktop one.
 */
export function useAromaticity(): AromaticityFragmentResult[] {
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);

  return useMemo(() => {
    return getAromaticityFragments(molecule, selected).map((frag): AromaticityFragmentResult => ({
      systems: analyzeAromaticity(frag),
      atomCount: Object.keys(frag.atoms).length,
    }));
  }, [molecule, selected]);
}