import { useMemo } from "react";
import type { Molecule } from "../types/chemistry";
import { analyzeStereochemistry, type StereoAnalysis } from "../engine/stereo";

/**
 * Computes (and by object identity caches) the R/S and E/Z descriptors for
 * `molecule`, but only while `enabled` is true.
 *
 * The gate matters: parsing the exported molfile through OpenChemLib is real
 * work, and both the canvas overlay and the info panel want the same answer.
 * The engine's WeakMap means whichever asks first pays for it and the other
 * gets the cached result back.
 */
export function useStereoAnalysis(molecule: Molecule, enabled: boolean): StereoAnalysis | null {
  return useMemo(() => (enabled ? analyzeStereochemistry(molecule) : null), [molecule, enabled]);
}
