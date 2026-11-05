import { DrugScoreCalculator, DruglikenessPredictor, Molecule as OCLMolecule, MoleculeProperties, ToxicityPredictor } from "openchemlib";
import type { Molecule } from "../types/chemistry";
import { exportMol } from "./molfile";
import { ensureOclResourcesLoaded } from "./oclResources";

/** Every way computeMoleculeDescriptors / computeAdvancedMoleculeDescriptors
 * can decline to produce a result, shared with the hooks (useMoleculeDescriptors,
 * useAdvancedMoleculeDescriptors) that surface a reason to the UI instead of a
 * silent blank. IGNORED_VALENCE is thrown by neither function directly \u2014
 * it's checked at the hook layer, same as NmrPredictionButton's
 * blockedByIgnoredValence \u2014 but lives in this shared union so both hooks
 * can report it the same way as the codes this module does throw. */
export type DescriptorUnavailableReason = "IGNORED_VALENCE" | "ABBREVIATED_GROUP" | "UNSUPPORTED" | "TOO_SMALL";

export class MoleculeDescriptorsError extends Error {
  code: Exclude<DescriptorUnavailableReason, "IGNORED_VALENCE">;
  constructor(code: MoleculeDescriptorsError["code"], message: string) {
    super(message);
    this.name = "MoleculeDescriptorsError";
    this.code = code;
  }
}

export interface MoleculeDescriptors {
  /** Estimated octanol/water partition coefficient (cLogP), from
   * OpenChemLib's atom-type increment system — the same family of
   * method (Ertl-style fragment contributions) used by most
   * cheminformatics toolkits, not a proprietary model. */
  logP: number;
  /** Estimated aqueous solubility, log(mol/L), same increment approach as logP. */
  logS: number;
  hBondDonorCount: number;
  hBondAcceptorCount: number;
  /** Topological polar surface area, in \u00c5\u00b2 (Ertl TPSA). */
  polarSurfaceArea: number;
  rotatableBondCount: number;
  /** Tetrahedral stereocenters OpenChemLib's parity perception finds from
   * the molecule's wedge/dash bonds and 2D layout \u2014 same geometric
   * source the SMILES exporter's own @/@@ tagging uses (see
   * io/smiles.ts), just read back out of OpenChemLib here instead of
   * recomputed by hand. Not a CIP R/S assignment (see Atom.stereoLabel's
   * doc comment in types/chemistry.ts for why this app doesn't attempt
   * that) \u2014 just a count of *how many* stereocenters the drawing
   * currently defines.
   */
  stereoCenterCount: number;
}

/**
 * Computed molecular-property descriptors for `mol`, via OpenChemLib's
 * MoleculeProperties. Unlike embed3d.ts's conformer/force-field work,
 * none of this needs OpenChemLib's resources.json (MMFF94 parameter
 * tables) loaded first \u2014 the atom-type increment tables
 * MoleculeProperties uses are baked into the library itself \u2014 so this
 * stays fully synchronous, no ensureResourcesLoaded() call needed.
 *
 * Same ABBREVIATED_GROUP reasoning as embedMolecule3D (see its doc
 * comment in embed3d.ts): an abbreviated-group atom (Ph, Boc, ...) is
 * stored as a single labeled vertex with no real substructure, so
 * there's no atom environment for the increment system to read \u2014
 * caught up front with a specific message rather than left to surface
 * as a confusing parse failure. Reuses exportMol (io/molfile.ts) as the
 * entry point for the same reason embed3d.ts does: every export format
 * agrees on one interpretation of the drawing (abbreviated-group
 * expansion where applicable, isotopes, charges, wedge/dash stereo)
 * instead of a second, possibly-drifting reimplementation.
 *
 * Doesn't check hasIgnoredValenceAtoms itself \u2014 same layering as
 * NmrPredictionButton's blockedByIgnoredValence, that check lives at the
 * call site (see hooks/useMoleculeDescriptors.ts) so every caller
 * decides for itself whether to run this at all, rather than this
 * module reaching into model/valence.ts's UI-facing gating logic.
 */
export function computeMoleculeDescriptors(mol: Molecule): MoleculeDescriptors {
  if (Object.values(mol.atoms).some((a) => a.group)) {
    throw new MoleculeDescriptorsError(
      "ABBREVIATED_GROUP",
      "Abbreviated groups aren't supported by descriptor calculations yet",
    );
  }

  const molblock = exportMol(mol);
  let oclMol: OCLMolecule;
  try {
    oclMol = OCLMolecule.fromMolfile(molblock);
  } catch {
    throw new MoleculeDescriptorsError("UNSUPPORTED", "Could not parse this structure for descriptor calculation");
  }

  const props = new MoleculeProperties(oclMol);
  return {
    logP: props.logP,
    logS: props.logS,
    hBondDonorCount: props.donorCount,
    hBondAcceptorCount: props.acceptorCount,
    polarSurfaceArea: props.polarSurfaceArea,
    rotatableBondCount: props.rotatableBondCount,
    stereoCenterCount: props.stereoCenterCount,
  };
}

export type ToxicityRiskLevel = "unknown" | "no" | "low" | "high";

const RISK_LEVEL_BY_CODE: Record<number, ToxicityRiskLevel> = {
  [ToxicityPredictor.RISK_UNKNOWN]: "unknown",
  [ToxicityPredictor.RISK_NO]: "no",
  [ToxicityPredictor.RISK_LOW]: "low",
  [ToxicityPredictor.RISK_HIGH]: "high",
};

export interface AdvancedMoleculeDescriptors {
  /** OpenChemLib's fragment-complexity-based druglikeness score. An
   * arbitrary scale, not a probability \u2014 roughly, positive means
   * "more like known drugs", negative means "less like known drugs" \u2014
   * so it's only meaningful as a relative comparison, not a pass/fail
   * cutoff. */
  druglikeness: number;
  /** DrugScoreCalculator's single 0\u20131 composite of logP, logS, MW,
   * druglikeness, and the four toxicity risk codes below. Folds the same
   * toxicity-alert unreliability described on
   * MIN_HEAVY_ATOMS_FOR_ADVANCED_DESCRIPTORS into one number, so treat it
   * with the same caution as the toxicity risks themselves. */
  drugScore: number;
  mutagenicRisk: ToxicityRiskLevel;
  tumorigenicRisk: ToxicityRiskLevel;
  irritantRisk: ToxicityRiskLevel;
  reproductiveRisk: ToxicityRiskLevel;
}

/**
 * Below this many heavy (non-H) atoms, OpenChemLib's fragment-alert-based
 * ToxicityPredictor produces implausible results \u2014 hand-verified against
 * known-safe small molecules before shipping this: plain water comes back
 * "high risk" for mutagenicity, tumorigenicity, *and* reproductive
 * effects; methanol comes back "high risk" for mutagenicity, irritancy,
 * and reproductive effects; even methane is flagged "high risk" for
 * reproductive effects. It behaves far more sensibly on larger, more
 * drug-like structures (aspirin, caffeine, nitrobenzene all gave
 * plausible results in the same testing). DruglikenessPredictor is more
 * defensible on its own even for small molecules, but DrugScoreCalculator
 * folds the same unreliable toxicity codes in as an input \u2014 so all three
 * advanced descriptors are gated on this threshold together, rather than
 * only hiding the toxicity numbers and leaving druglikeness/drugScore
 * looking authoritative next to a structure too small for either to mean
 * much.
 */
export const MIN_HEAVY_ATOMS_FOR_ADVANCED_DESCRIPTORS = 8;

/**
 * Druglikeness, toxicity-risk, and drug-score estimates \u2014 the "show
 * more" section in MoleculeInfoButton, kept separate from
 * computeMoleculeDescriptors above because these need OpenChemLib's
 * resources.json fetched first (ensureOclResourcesLoaded, shared with
 * embed3d.ts's 3D pipeline \u2014 see io/oclResources.ts) and because of the
 * small-molecule reliability floor documented on
 * MIN_HEAVY_ATOMS_FOR_ADVANCED_DESCRIPTORS above, neither of which apply
 * to the base descriptors.
 */
export async function computeAdvancedMoleculeDescriptors(mol: Molecule): Promise<AdvancedMoleculeDescriptors> {
  if (Object.values(mol.atoms).some((a) => a.group)) {
    throw new MoleculeDescriptorsError(
      "ABBREVIATED_GROUP",
      "Abbreviated groups aren't supported by descriptor calculations yet",
    );
  }

  const heavyAtomCount = Object.values(mol.atoms).filter((a) => a.element !== "H").length;
  if (heavyAtomCount < MIN_HEAVY_ATOMS_FOR_ADVANCED_DESCRIPTORS) {
    throw new MoleculeDescriptorsError(
      "TOO_SMALL",
      `Druglikeness and toxicity estimates need at least ${MIN_HEAVY_ATOMS_FOR_ADVANCED_DESCRIPTORS} heavy atoms to be reliable`,
    );
  }

  await ensureOclResourcesLoaded();

  const molblock = exportMol(mol);
  let oclMol: OCLMolecule;
  try {
    oclMol = OCLMolecule.fromMolfile(molblock);
  } catch {
    throw new MoleculeDescriptorsError("UNSUPPORTED", "Could not parse this structure for descriptor calculation");
  }

  const props = new MoleculeProperties(oclMol);
  const druglikeness = new DruglikenessPredictor().assessDruglikeness(oclMol);

  const toxicityPredictor = new ToxicityPredictor();
  const mutagenicCode = toxicityPredictor.assessRisk(oclMol, ToxicityPredictor.TYPE_MUTAGENIC);
  const tumorigenicCode = toxicityPredictor.assessRisk(oclMol, ToxicityPredictor.TYPE_TUMORIGENIC);
  const irritantCode = toxicityPredictor.assessRisk(oclMol, ToxicityPredictor.TYPE_IRRITANT);
  const reproductiveCode = toxicityPredictor.assessRisk(oclMol, ToxicityPredictor.TYPE_REPRODUCTIVE_EFFECTIVE);

  const drugScore = DrugScoreCalculator.calculate(
    props.logP,
    props.logS,
    oclMol.getMolecularFormula().absoluteWeight,
    druglikeness,
    [mutagenicCode, tumorigenicCode, irritantCode, reproductiveCode],
  );

  return {
    druglikeness,
    drugScore,
    mutagenicRisk: RISK_LEVEL_BY_CODE[mutagenicCode] ?? "unknown",
    tumorigenicRisk: RISK_LEVEL_BY_CODE[tumorigenicCode] ?? "unknown",
    irritantRisk: RISK_LEVEL_BY_CODE[irritantCode] ?? "unknown",
    reproductiveRisk: RISK_LEVEL_BY_CODE[reproductiveCode] ?? "unknown",
  };
}
