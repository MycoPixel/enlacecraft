import { Resources } from "openchemlib";

/**
 * OpenChemLib's force-field, druglikeness, and toxicity-prediction code
 * (but not basic molfile parsing, nor MoleculeProperties' logP/TPSA/etc.
 * increments \u2014 those work with zero setup) needs its static parameter
 * tables loaded before first use: MMFF94 atom/bond/angle terms and
 * torsion preferences for the 3D panel, but also \u2014 same resources.json,
 * same fetch \u2014 the druglikeness fragment index and toxicity
 * substructure-alert lists io/moleculeDescriptors.ts's "show more"
 * section uses. It's the "resources.json" data file Vite emits as a
 * build asset automatically, since OpenChemLib locates it via a
 * bundler-friendly `new URL("resources.json", import.meta.url)`.
 *
 * Fetched once and memoized here so every caller across the app (3D
 * embedding, xtb starting geometry, and the advanced descriptors panel)
 * reuses the same resolved promise instead of re-fetching the same
 * ~1.3MB file. Originally lived only inside embed3d.ts as a private
 * function; moved here once computeAdvancedMoleculeDescriptors needed
 * the exact same loaded-once guarantee rather than triggering a second,
 * redundant fetch.
 */
let resourcesReady: Promise<void> | null = null;
export function ensureOclResourcesLoaded(): Promise<void> {
  if (!resourcesReady) {
    resourcesReady = Resources.registerFromUrl().catch((err) => {
      // Let the next call retry rather than permanently caching a
      // failure (e.g. a transient network blip on first load).
      resourcesReady = null;
      throw err;
    });
  }
  return resourcesReady;
}
