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
}

export interface NmrPredictResult {
  smiles: string;
  predictions: ShiftPrediction[];
  predictionsH1: H1ShiftPrediction[];
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
    predictions: { atom_index: number; predicted_shift_ppm: number }[];
    predictions_h1: { atom_index: number; predicted_shift_ppm: number; num_hs: number }[];
    warnings: string[];
  };

  return {
    smiles: data.smiles,
    predictions: data.predictions.map((p) => ({
      atomIndex: p.atom_index,
      predictedShiftPpm: p.predicted_shift_ppm,
    })),
    predictionsH1: (data.predictions_h1 ?? []).map((p) => ({
      atomIndex: p.atom_index,
      predictedShiftPpm: p.predicted_shift_ppm,
      numHs: p.num_hs,
    })),
    warnings: data.warnings,
  };
}
