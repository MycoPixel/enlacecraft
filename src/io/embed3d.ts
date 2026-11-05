import { ConformerGenerator, ForceFieldMMFF94, Molecule as OCLMolecule } from "openchemlib";
import type { Molecule } from "../types/chemistry";
import { exportMol } from "./molfile";
import { ensureOclResourcesLoaded } from "./oclResources";
import { refineWithXtb } from "./xtbRefine";

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
  /** Which conformer was produced — see Embed3DWithMethodResult's field of
   * the same name. */
  conformerIndexAchieved: number;
}

export interface Embed3DWithMethodResult {
  molfile: string;
  energyKcalMol?: number;
  converged?: boolean;
  /** The conformer actually produced. Normally equal to the requested index;
   * lower once the generator has run out of distinct torsion sets for this
   * structure, which it reports rather than erroring on. */
  conformerIndexAchieved: number;
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
 *
 * `conformerIndex` is forwarded to embedMolecule3D (including into the xtb
 * path's MMFF94 starting geometry). It defaults to 0 — the most likely
 * torsion set — so re-running on an unchanged molecule is stable and the 3D
 * view never jumps to an unrelated conformer on every re-render. The panel's
 * "new conformer" button is what advances it deliberately; see
 * embedMolecule3D's own comment for why this is an index rather than a
 * random seed.
 */
export async function embedMolecule3DWithMethod(
  molecule: Molecule,
  method: Embed3DMethod,
  conformerIndex = 0,
): Promise<Embed3DWithMethodResult> {
  if (method !== "xtb") {
    return embedMolecule3D(molecule, method, conformerIndex);
  }

  const starting = await embedMolecule3D(molecule, "mmff94", conformerIndex);
  const totalCharge = Object.values(molecule.atoms).reduce((sum, a) => sum + a.charge, 0);
  const refined = await refineWithXtb(starting.molfile, totalCharge);
  return {
    molfile: refined.molfile,
    energyKcalMol: refined.energyKcalMol,
    converged: refined.converged,
    conformerIndexAchieved: starting.conformerIndexAchieved,
  };
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
 * before first use (see ensureOclResourcesLoaded in io/oclResources.ts) — after that first
 * call it resolves on the next microtask. The actual embedding/
 * minimisation work is synchronous CPU work (openchemlib is plain JS, no
 * worker), so callers should still treat this as "possibly slow" for
 * larger molecules and lean on debouncing rather than expecting it to
 * yield mid-computation — see Molecule3DView's debounce.
 */
export async function embedMolecule3D(
  mol: Molecule,
  method: Exclude<Embed3DMethod, "xtb">,
  conformerIndex = 0,
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

  await ensureOclResourcesLoaded();

  const molblock = exportMol(mol);
  let oclMol: OCLMolecule;
  try {
    oclMol = OCLMolecule.fromMolfile(molblock);
  } catch {
    throw new Embed3DError("DISCONNECTED_OR_UNSUPPORTED", "Could not parse this structure for 3D generation");
  }

  // Conformer selection.
  //
  // An earlier version of this called getOneConformerAsMolecule(seed) and
  // treated the seed as "which conformer you get". That does not work:
  // measured over 10 seeds, butane through decane all returned the *same*
  // geometry every time, and so did hexane under MMFF94 — the seed is not a
  // conformer index, and for any molecule with real conformational freedom it
  // changes nothing at all. (Ethane and propane did vary, but only in the
  // methyl hydrogens' rotation about an axis that is degenerate anyway.)
  //
  // The proper API is the two-step one below: initializeConformers() builds a
  // generator that remembers which torsion combinations it has already
  // handed out, and each getNextConformerAsMolecule() then returns a genuinely
  // new one. conformerIndex 0 is the most likely torsion set — the same thing
  // the old one-shot call returned — and each further index walks on from
  // there.
  //
  // The generator is rebuilt from scratch on every call and the earlier
  // conformers re-walked, which is O(index). Fine for the handful of clicks
  // this supports, and simpler than caching a generator across edits, which
  // would have to be invalidated whenever the drawing changed.
  //
  // ONE generator, initialized once, then walked: getNextConformer only knows
  // which torsion combinations it has already handed out because they were
  // all taken from this same instance. Re-initializing inside the loop (an
  // earlier version of this did) restarts the enumeration every time and so
  // always returns conformer #0 — measured, that gave exactly one distinct
  // geometry for every molecule tried.
  const generator = new ConformerGenerator(1);
  let conformer: OCLMolecule | null = null;
  let conformerIndexAchieved = 0;
  if (generator.initializeConformers(oclMol)) {
    for (let i = 0; i <= conformerIndex; i++) {
      const next = generator.getNextConformerAsMolecule();
      // null means the strategy has no further torsion sets for this
      // structure; keep the last one we did get rather than failing.
      if (!next) break;
      conformer = next;
      conformerIndexAchieved = i;
    }
  }
  if (!conformer) {
    throw new Embed3DError("EMBED_FAILED", "Could not generate a collision-free 3D conformer for this structure");
  }

  if (method === "quick") {
    return { molfile: conformer.toMolfile(), conformerIndexAchieved };
  }

  // MMFF94s ("static", the variant recommended for energy comparisons /
  // minimisation rather than dynamics) — a real, published molecular
  // mechanics force field, same family used by mainstream cheminformatics
  // tools for this exact "sketch -> plausible 3D structure" step.
  const ff = new ForceFieldMMFF94(conformer, ForceFieldMMFF94.MMFF94S);
  ff.minimise({ maxIts: 2000 });

  return { molfile: conformer.toMolfile(), energyKcalMol: ff.getTotalEnergy(), conformerIndexAchieved };
}

/**
 * Scores a *fixed* geometry against MMFF94s without minimising it —
 * `ForceFieldMMFF94.getTotalEnergy()` is called right after construction,
 * before `minimise()` would get a chance to relax anything. That's the
 * point: a rigid conformer produced by the 3D panel's "Rotate bond" tool
 * (see Molecule3D/rotateBond.ts and torsionScan.ts) — e.g. eclipsed
 * ethane — is a torsional *maximum*, and minimising it would just slide
 * it straight back to a staggered minimum, defeating the purpose of
 * asking "how strained is *this exact* rotamer".
 *
 * Takes a ready-made V2000 molfile (explicit H, real 3D coordinates —
 * exactly what rotateBond.ts's serializeV2000 produces) rather than the
 * app's 2D Molecule model, for the same reason xtbRefine.ts does: this
 * needs the actual displayed 3D structure, not a fresh 2D-derived one.
 *
 * Resolves to `null` (rather than throwing) if MMFF94 can't score this
 * structure at all — e.g. an atom type or valence state outside MMFF94's
 * parameter set — since callers use this for a live, best-effort energy
 * readout while dragging a slider, not as something that should surface
 * a hard error mid-drag.
 */
export async function mmff94SinglePointEnergy(molfile: string): Promise<number | null> {
  await ensureOclResourcesLoaded();
  try {
    const oclMol = OCLMolecule.fromMolfile(molfile);
    const ff = new ForceFieldMMFF94(oclMol, ForceFieldMMFF94.MMFF94S);
    return ff.getTotalEnergy();
  } catch {
    return null;
  }
}

/**
 * Refines an *existing* 3D structure — one that came from an imported file
 * rather than from the 2D drawing.
 *
 * This is the same chemistry embedMolecule3D already runs for a drawn
 * structure, applied to coordinates that already exist. The distinction
 * matters: embedding invents a geometry, while this only relaxes the one you
 * brought. Bonds, bond orders and charges are read back out of the molfile by
 * OpenChemLib, so an imported structure's connectivity survives refinement
 * rather than being rebuilt from a formula.
 *
 * "quick" is a no-op and returns the input unchanged — the honest meaning of
 * "don't touch my coordinates", which is exactly what someone who imported a
 * file from a database wants to be able to ask for.
 */
export async function refineStructure3D(
  molfile: string,
  method: Embed3DMethod,
): Promise<{ molfile: string; energyKcalMol?: number; converged?: boolean }> {
  await ensureOclResourcesLoaded();

  if (method === "quick") return { molfile };

  let oclMol: OCLMolecule;
  try {
    oclMol = OCLMolecule.fromMolfile(molfile);
  } catch {
    throw new Embed3DError("DISCONNECTED_OR_UNSUPPORTED", "Could not read this structure for refinement");
  }

  if (method === "mmff94") {
    try {
      // MMFF94 has nothing to say about an atom with unfilled valences, and
      // imported files frequently omit hydrogens (a bare skeletal .mol, most
      // PDB entries' heavy-atom-only variants). Saturate first — this is what
      // the drawn-structure path gets for free, because the conformer
      // generator adds them itself, so without it the same molecule would
      // refine from a drawing but fail when imported.
      oclMol.addImplicitHydrogens();
      const ff = new ForceFieldMMFF94(oclMol, ForceFieldMMFF94.MMFF94S);
      ff.minimise({ maxIts: 2000 });
      return { molfile: oclMol.toMolfile(), energyKcalMol: ff.getTotalEnergy() };
    } catch {
      // Force-field parameters are missing for some elements (metals, some
      // main-group outliers). Say so plainly instead of surfacing a library
      // error, and suggest the other method rather than leaving the panel
      // stuck on a stale structure.
      throw new Embed3DError("DISCONNECTED_OR_UNSUPPORTED", "No force-field parameters for part of this structure — try GFN2-xTB instead");
    }
  }

  // xtb. Saturating valences here too, for the same reason — and xTB needs a
  // whole molecule to compute anything meaningful for.
  oclMol.addImplicitHydrogens();

  // The charge is read from the file rather than assumed to be zero: a
  // zwitterion or an ion pair imported from a database would otherwise be
  // refined as the neutral species and come back as a different molecule.
  let totalCharge = 0;
  for (let i = 0; i < oclMol.getAtoms(); i++) totalCharge += oclMol.getAtomCharge(i);
  const refined = await refineWithXtb(molfile, totalCharge);
  return { molfile: refined.molfile, energyKcalMol: refined.energyKcalMol, converged: refined.converged };
}
