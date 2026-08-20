import { useEffect, useState } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { getDescriptorFragments } from "./useMoleculeDescriptors";
import {
  computeAdvancedMoleculeDescriptors,
  MoleculeDescriptorsError,
  type AdvancedMoleculeDescriptors,
  type DescriptorUnavailableReason,
} from "../io/moleculeDescriptors";

export interface AdvancedDescriptorFragmentResult {
  status: "loading" | "ready" | "error";
  descriptors: AdvancedMoleculeDescriptors | null;
  unavailable: DescriptorUnavailableReason | null;
}

/**
 * Druglikeness/toxicity/drug-score estimates for MoleculeInfoButton's
 * "show more" section, one result per useMoleculeDescriptors'
 * getDescriptorFragments fragment (same selection-or-fragments scoping,
 * for the same reason \u2014 see that module's doc comment).
 *
 * Kept as a separate hook from useMoleculeDescriptors rather than folded
 * into it because this one is async (computeAdvancedMoleculeDescriptors
 * needs OpenChemLib's resources.json fetched first) and only runs when
 * `enabled` \u2014 i.e. the person actually opened "show more" \u2014 rather
 * than eagerly on every popover open like the base descriptors, since
 * the resources fetch and the extra computation aren't free and most
 * popover opens won't need them.
 */
export function useAdvancedMoleculeDescriptors(enabled: boolean): AdvancedDescriptorFragmentResult[] {
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const [results, setResults] = useState<AdvancedDescriptorFragmentResult[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const fragments = getDescriptorFragments(molecule, selected);
    let cancelled = false;
    setResults(fragments.map(() => ({ status: "loading", descriptors: null, unavailable: null })));

    fragments.forEach((frag, i) => {
      computeAdvancedMoleculeDescriptors(frag).then(
        (descriptors) => {
          if (cancelled) return;
          setResults((prev) => {
            const next = [...prev];
            next[i] = { status: "ready", descriptors, unavailable: null };
            return next;
          });
        },
        (err) => {
          if (cancelled) return;
          const reason = err instanceof MoleculeDescriptorsError ? err.code : "UNSUPPORTED";
          setResults((prev) => {
            const next = [...prev];
            next[i] = { status: "error", descriptors: null, unavailable: reason };
            return next;
          });
        },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, molecule, selected]);

  return enabled ? results : [];
}
