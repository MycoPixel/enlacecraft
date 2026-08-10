import { ConformerGenerator, ForceFieldMMFF94, Molecule as OCLMolecule, Resources } from "openchemlib";
import type { Molecule } from "../types/chemistry";
import { exportMol } from "./molfile";
import { refineWithXtb } from "./xtbRefine";

// OpenChemLib's force-field/conformer-generation code (but not basic
// molfile parsing — see the PARSED_OK check during development) needs its
// static parameter tables (MMFF94 atom/bond/angle terms, torsion
// preferences, etc. — the "resources.json" data file Vite emits as a
// build asset automatically, since OpenChemLib locates it via a
// bundler-friendly `new URL("resources.json", import.meta.url)`) loaded
// before first use. Fetched once and memoized — every embed call after
// the first reuses the same resolved promise instead of re-registering.
let resourcesReady: Promise<void> | null = null;
function ensureResourcesLoaded(): Promise<void> {
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

/**
 * The three 3D generation methods offered in the 3D panel — see
 * Molecule3DView.tsx for the UI. All three start from the same
 * embedMolecule3D conformer/optimization below; "xtb" is handled one
 * level up, in Molecule3DView, since it's a network refinement step
 * chained onto this module's "mmff94" result rather than something
 * embedMolecule3D itself produces — see io/xtbRefine.ts.
 */
export type Embed3DMethod = "quick" | "mmff94" | "xtb";

export class Embed3DError extends Error {
  code: "EMPTY" | "ABBREVIATED_GROUP" | "DISCONNECTED_OR_UNSUPPORTED" | "EMBED_FAILED";
  constructor(code: Embed3DError["code"], message: string) {
    super(message);
    this.name = "Embed3DError";
    this.code = code;
  }
}

export interface Embed3DResult {
  /** V2000 molfile with 3D atom coordinates and explicit hydrogens — feed
   * directly to 3Dmol.js via viewer.addModel(molfile, "mol"). */
  molfile: string;
  /** MMFF94s total energy in kcal/mol after minimisation — only present
   * for method "mmff94" (a "quick" conformer was never scored against a
   * force field, so there's no energy to report). Lower is more stable;
   * mainly useful for comparing conformers of the *same* molecule against
   * each other, not as an absolute quality number on its own. */
  energyKcalMol?: number;
}

export interface Embed3DWithMethodResult {
  molfile: string;
  energyKcalMol?: number;
  converged?: boolean;
}

/**
 * Runs the full embedding pipeline for a given method, including the
 * "xtb" two-step chain: first a real MMFF94-optimized starting
 * geometry entirely client-side (fast, no network dependency), then
 * that starting molfile sent to structure3d_server for GFN2-xTB
 * refinement (see io/xtbRefine.ts). Starting xtb from an already-sane
 * geometry converges faster and more reliably than handing it a bare
 * distance-geometry guess would.
 *
 * Shared between Molecule3DView (the 3D panel) and
 * NmrPredictionButton (the "use a real 3D structure" NMR prediction
 * option) - originally lived only in the former as a private
 * function, moved here once a second caller needed the exact same
 * chaining logic rather than reimplementing it.
 */
export async function embedMolecule3DWithMethod(
  molecule: Molecule,
  method: Embed3DMethod,
): Promise<Embed3DWithMethodResult> {
  if (method !== "xtb") {
    return embedMolecule3D(molecule, method);
  }

  const starting = await embedMolecule3D(molecule, "mmff94");
  const totalCharge = Object.values(molecule.atoms).reduce((sum, a) => sum + a.charge, 0);
  const refined = await refineWithXtb(starting.molfile, totalCharge);
  return { molfile: refined.molfile, energyKcalMol: refined.energyKcalMol, converged: refined.converged };
}

/**
 * Generates 3D atom coordinates for `mol` and, for method "mmff94",
 * energy-minimises them.
 *
 * Deliberately reuses the app's own exportMol (io/molfile.ts) as the
 * entry point rather than taking a raw molfile — this way the 3D panel
 * always sees exactly the same structure (abbreviated-group expansion,
 * isotopes, charges, wedge/dash stereo) that every other export format
 * already agrees on, instead of a second, possibly-drifting reimplementation.
 *
 * Async because OpenChemLib's force-field data has to be fetched once
 * before first use (see ensureResourcesLoaded above) — after that first
 * call it resolves on the next microtask. The actual embedding/
 * minimisation work is synchronous CPU work (openchemlib is plain JS, no
 * worker), so callers should still treat this as "possibly slow" for
 * larger molecules and lean on debouncing rather than expecting it to
 * yield mid-computation — see Molecule3DView's debounce.
 */
export async function embedMolecule3D(
  mol: Molecule,
  method: Exclude<Embed3DMethod, "xtb">,
  seed = 1,
): Promise<Embed3DResult> {
  if (Object.keys(mol.atoms).length === 0) {
    throw new Embed3DError("EMPTY", "Nothing drawn yet");
  }

  // Abbreviated groups (Ph, Boc, ...) exist in this app only as a single
  // labeled vertex with no real stored substructure (see exportSmiles's
  // doc comment in io/smiles.ts for the same limitation) — there's no
  // atomic structure here for a 3D method to place. Caught up front with
  // a specific message rather than left to surface as a confusing parse
  // failure from OpenChemLib.
  if (Object.values(mol.atoms).some((a) => a.group)) {
    throw new Embed3DError("ABBREVIATED_GROUP", "Abbreviated groups aren't supported in the 3D view yet");
  }

  await ensureResourcesLoaded();

  const molblock = exportMol(mol);
  let oclMol: OCLMolecule;
  try {
    oclMol = OCLMolecule.fromMolfile(molblock);
  } catch {
    throw new Embed3DError("DISCONNECTED_OR_UNSUPPORTED", "Could not parse this structure for 3D generation");
  }

  // getOneConformerAsMolecule saturates open valences with explicit H
  // atoms and searches likely torsion sets (starting from the most
  // probable, based on OpenChemLib's torsion-preference statistics) for
  // one that's free of atom collisions. Deterministic per seed, so
  // re-running on an unchanged molecule doesn't make the 3D view jitter
  // between unrelated conformers on every re-render.
  const generator = new ConformerGenerator(seed);
  const conformer = generator.getOneConformerAsMolecule(oclMol);
  if (!conformer) {
    throw new Embed3DError("EMBED_FAILED", "Could not generate a collision-free 3D conformer for this structure");
  }

  if (method === "quick") {
    return { molfile: conformer.toMolfile() };
  }

  // MMFF94s ("static", the variant recommended for energy comparisons /
  // minimisation rather than dynamics) — a real, published molecular
  // mechanics force field, same family used by mainstream cheminformatics
  // tools for this exact "sketch -> plausible 3D structure" step.
  const ff = new ForceFieldMMFF94(conformer, ForceFieldMMFF94.MMFF94S);
  ff.minimise({ maxIts: 2000 });
  const energyKcalMol = ff.getTotalEnergy();

  return { molfile: conformer.toMolfile(), energyKcalMol };
}
