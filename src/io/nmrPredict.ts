/**
 * Client for the NMRGraph prediction API (see src/api/main.py in the
 * NMRGraph project) — a separate small Python service, not PubChem.
 * Mirrors io/pubchem.ts's fetch/error-handling pattern for consistency
 * with the rest of the app's network calls.
 *
 * Unlike PubChem, this service isn't a public third party — it needs
 * to actually be running (`uvicorn src.api.main:app`) and reachable at
 * NMR_API_BASE below. There's no bundler env-var wiring here yet, so
 * for now this is a hardcoded localhost default; before deploying
 * EnlaceCraft anywhere real, this needs to become configurable (a
 * build-time env var, same as any other frontend/backend split) rather
 * than pointing at localhost.
 */

import type { Molecule } from "../types/chemistry";

const NMR_API_BASE = "http://localhost:8000";

export type NmrPredictErrorCode = "EMPTY_QUERY" | "INVALID_SMILES" | "NETWORK" | "HTTP";

export class NmrPredictError extends Error {
  code: NmrPredictErrorCode;
  params: Record<string, string | number>;
  constructor(code: NmrPredictErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = "NmrPredictError";
    this.code = code;
    this.params = params;
  }
}

export interface ShiftPrediction {
  /** Index into the RDKit atom ordering of the SMILES that was sent -
   * NOT the same as this app's own atom ids. Resolve back to a real
   * atom id via atomOrder from exportSmilesWithAtomOrder (io/smiles.ts)
   * - see buildAtomLabels below, or NmrReportView.tsx for the diagram
   * that does this. */
  atomIndex: number;
  predictedShiftPpm: number;
}

export interface H1ShiftPrediction extends ShiftPrediction {
  /** Number of protons this one shift represents - equivalent
   * protons on the same heavy atom are averaged into a single value,
   * so a CH2/CH3 group is one row here, not two/three. */
  numHs: number;
  /** s/d/t/dd/td/... - tier 1 (topology n+1 rule) for acyclic and
   * aromatic atoms, tier 2 (conformer + Karplus) automatically for
   * non-aromatic ring atoms and atoms near a defined stereocenter.
   * See NMRGraph's src/models/predict_multiplicity.py for the full
   * routing rule and validation notes. */
  multiplicity: string;
  /** Human-readable detail behind the label - e.g. tier 2's
   * per-neighbor J values in Hz, or a tier 1 caveat note. Empty
   * string when there's nothing extra to say. */
  multiplicityDetail: string;
}

export interface NmrIsomerResult {
  /** The fully-defined isomer SMILES this result was computed from -
   * same as the top-level request when nothing was ambiguous,
   * otherwise one specific resolved stereoisomer (see
   * NmrPredictResult.results). */
  smiles: string;
  predictions: ShiftPrediction[];
  predictionsH1: H1ShiftPrediction[];
}

export interface NmrPredictResult {
  /** The SMILES that was actually sent - may have unassigned ring
   * stereocenters, in which case `results` has more than one entry
   * (see below) rather than one ambiguous blended result. */
  smiles: string;
  /** One entry normally. More than one when the input had unassigned
   * ring stereocenters (no @/@@ tags) - each entry is then a
   * distinct, fully-defined stereoisomer (e.g. cis and trans)
   * predicted separately, rather than blending them into one
   * meaningless averaged number. All entries share the same
   * atom_index numbering (enumeration only changes stereo tags, not
   * atom order) - see warnings for the human-readable explanation. */
  results: NmrIsomerResult[];
  warnings: string[];
}

/**
 * Builds short, stable display labels ("C1", "C2", "O1"...) for each
 * atom in atomOrder, one per element, counted in traversal order.
 * Shared between NmrPredictionButton's compact list and
 * NmrReportView's diagram so the same atom gets the same label in
 * both places. Not IUPAC numbering - just a readable, deterministic
 * tag for cross-referencing a prediction back to a drawn atom.
 */
export function buildAtomLabels(fragment: Molecule, atomOrder: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const atomId of atomOrder) {
    const atom = fragment.atoms[atomId];
    if (!atom) continue;
    const n = (counts.get(atom.element) ?? 0) + 1;
    counts.set(atom.element, n);
    labels.set(atomId, `${atom.element}${n}`);
  }
  return labels;
}

export async function predictNmrSpectrum(smiles: string): Promise<NmrPredictResult> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new NmrPredictError("EMPTY_QUERY");

  let res: Response;
  try {
    res = await fetch(`${NMR_API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smiles: trimmed }),
    });
  } catch {
    throw new NmrPredictError("NETWORK");
  }

  if (!res.ok) {
    if (res.status === 400) throw new NmrPredictError("INVALID_SMILES", { smiles: trimmed });
    throw new NmrPredictError("HTTP", { status: res.status });
  }

  const data = (await res.json()) as {
    smiles: string;
    results: {
      smiles: string;
      predictions: { atom_index: number; predicted_shift_ppm: number }[];
      predictions_h1: {
        atom_index: number;
        predicted_shift_ppm: number;
        num_hs: number;
        multiplicity: string;
        multiplicity_detail: string;
      }[];
    }[];
    warnings: string[];
  };

  return {
    smiles: data.smiles,
    results: data.results.map((r) => ({
      smiles: r.smiles,
      predictions: r.predictions.map((p) => ({
        atomIndex: p.atom_index,
        predictedShiftPpm: p.predicted_shift_ppm,
      })),
      predictionsH1: r.predictions_h1.map((p) => ({
        atomIndex: p.atom_index,
        predictedShiftPpm: p.predicted_shift_ppm,
        numHs: p.num_hs,
        multiplicity: p.multiplicity,
        multiplicityDetail: p.multiplicity_detail ?? "",
      })),
    })),
    warnings: data.warnings,
  };
}
