import { useMemo } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { findConnectedFragments, hasIgnoredValenceAtoms } from "../model/valence";
import { subMolecule } from "../model/molecule";
import type { Molecule } from "../types/chemistry";
import {
  computeMoleculeDescriptors,
  MoleculeDescriptorsError,
  type DescriptorUnavailableReason,
  type MoleculeDescriptors,
} from "../io/moleculeDescriptors";

export type { DescriptorUnavailableReason };

export interface DescriptorFragmentResult {
  descriptors: MoleculeDescriptors | null;
  /** Set (instead of descriptors) when this fragment couldn't be
   * computed, so the UI can say why rather than showing a silent blank. */
  unavailable: DescriptorUnavailableReason | null;
}

/**
 * Selection, else each connected fragment separately — the same
 * scoping useFormulaDisplay uses, and for the same reason: summing/
 * averaging descriptors across unrelated fragments (e.g. reactant and
 * product either side of a reaction arrow) would be as chemically
 * meaningless as summing their formulas would be. Exported so
 * useAdvancedMoleculeDescriptors (the async "show more" section) scopes
 * to the exact same set of fragments rather than reimplementing this.
 */
export function getDescriptorFragments(molecule: Molecule, selected: Set<string>): Molecule[] {
  const idGroups = selected.size > 0 ? [[...selected]] : findConnectedFragments(molecule);
  return idGroups.map((ids) => subMolecule(molecule, ids)).filter((frag) => Object.keys(frag.atoms).length > 0);
}

/**
 * Molecular descriptors (logP, logS, H-bond donor/acceptor counts, TPSA,
 * rotatable bonds, stereocenters) for display in MoleculeInfoButton, one
 * result per getDescriptorFragments fragment.
 *
 * hasIgnoredValenceAtoms is checked here rather than inside
 * computeMoleculeDescriptors itself — same layering NmrPredictionButton
 * already uses for its own blockedByIgnoredValence check — since it's
 * a UI-facing "should we even try" gate, not something the underlying
 * io/ computation needs to know about.
 */
export function useMoleculeDescriptors(): DescriptorFragmentResult[] {
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);

  return useMemo(() => {
    return getDescriptorFragments(molecule, selected).map((frag): DescriptorFragmentResult => {
      if (hasIgnoredValenceAtoms(frag)) {
        return { descriptors: null, unavailable: "IGNORED_VALENCE" };
      }
      try {
        return { descriptors: computeMoleculeDescriptors(frag), unavailable: null };
      } catch (err) {
        const reason = err instanceof MoleculeDescriptorsError ? err.code : "UNSUPPORTED";
        return { descriptors: null, unavailable: reason };
      }
    });
  }, [molecule, selected]);
}
