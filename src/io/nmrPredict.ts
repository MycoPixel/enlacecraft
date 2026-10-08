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

/**
 * How long to wait before giving up on the NMR backend.
 *
 * Generous on purpose: one request runs up to 8 isomers x 30 MMFF conformers
 * (NMRGraph api/main.py, coupling_karplus.py), so a legitimately heavy tier-2
 * prediction is slow. This exists to turn an INDEFINITE spinner into an error,
 * not to enforce a latency budget.
 */
const FETCH_TIMEOUT_MS = 120_000;

export type NmrPredictErrorCode =
  | "EMPTY_QUERY"
  | "INVALID_SMILES"
  | "NETWORK"
  | "HTTP"
  /** We waited FETCH_TIMEOUT_MS and gave up. */
  | "TIMEOUT"
  /** A 2xx response that wasn't the JSON we expect - a proxy error page, HTML
   *  from the wrong port, or schema drift between app and backend. */
  | "MALFORMED";

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
  /** Index into an atom ordering that depends on which request path
   * produced this result:
   *
   * - Plain SMILES request (no molfile) - RDKit's atom ordering of
   *   the SMILES that was sent, NOT this app's own atom ids. Resolve
   *   back to a real atom id via atomOrder from
   *   exportSmilesWithAtomOrder (io/smiles.ts).
   * - Molfile request (real 3D geometry supplied - see
   *   predictNmrSpectrum's molfile parameter) - the SAME order
   *   Object.keys(fragment.atoms) already gives you for that exact
   *   fragment, since the molfile sent to the API was built from
   *   that same key order (see embed3d.ts's exportMol) and the API
   *   parses connectivity+geometry from the molfile directly rather
   *   than a separately-parsed SMILES string.
   *
   * Either way, buildAtomLabels/equivalenceGroupLabel below just need
   * *an* atomOrder array consistent with whichever path was used -
   * they don't care which one it is. See NmrPredictionButton.tsx for
   * where that choice is made. */
  atomIndex: number;
  predictedShiftPpm: number;
  /** Atoms sharing this value are constitutionally symmetry-equivalent
   * (RDKit canonical ranking, stereo not considered) - e.g. a
   * tert-butyl group's 3 methyl carbons. Same value for a given atom
   * across both ShiftPrediction and H1ShiftPrediction, and stable
   * across different isomers of the same molecule. Purely a display
   * grouping hint - see groupByEquivalence below. */
  equivalenceGroup: number;
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
  /** Raw, unclustered J values (Hz) behind the multiplicity label -
   * only ever populated for tier 2 atoms (ring/stereocenter
   * geometry); empty for tier 1, which has no real coupling
   * magnitude, only a topological count. See io/nmrSpectrum.ts for
   * where this feeds a simulated spectrum (falls back to a default
   * illustrative J when empty). */
  couplingHz: number[];
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

export interface EquivalenceGroup<T> {
  /** First member by atomIndex - stands in for the whole group's
   * shift/multiplicity, since constitutionally equivalent atoms
   * should already predict near-identical values (this is a display
   * convenience, not an average - see the group's `members` for the
   * individual per-atom values if they ever need to be compared). */
  representative: T;
  /** All members of this equivalence group, sorted by atomIndex. */
  members: T[];
}

/**
 * Groups predictions that share an equivalenceGroup value into one
 * entry each - the display-side counterpart to NMRGraph's
 * equivalence_group field, so e.g. a tert-butyl group's 3 methyl
 * carbons render as one combined row ("C5, C6, C7 — 9H, 0.90 ppm (s)")
 * instead of three separate ones, the way a real NMR report would.
 * Order of the returned groups follows first-occurrence order in
 * `items` (typically already sorted by shift before calling this).
 */
export function groupByEquivalence<T extends { atomIndex: number; equivalenceGroup: number }>(
  items: T[],
): EquivalenceGroup<T>[] {
  const byGroup = new Map<number, T[]>();
  for (const item of items) {
    const arr = byGroup.get(item.equivalenceGroup);
    if (arr) arr.push(item);
    else byGroup.set(item.equivalenceGroup, [item]);
  }
  return [...byGroup.values()].map((members) => ({
    representative: members[0],
    members: [...members].sort((a, b) => a.atomIndex - b.atomIndex),
  }));
}

/**
 * Joins an equivalence group's member atom labels into one string
 * ("C5, C6, C7") using the same atomOrder/atomLabels convention as
 * a single atom's label elsewhere in this file.
 */
export function equivalenceGroupLabel(
  members: { atomIndex: number }[],
  atomOrder: string[],
  atomLabels: Map<string, string>,
): string {
  return members
    .map((m) => atomLabels.get(atomOrder[m.atomIndex]) ?? String(m.atomIndex))
    .join(", ");
}

/**
 * molfile : optional
 *   A V2000 molfile with explicit Hs and real 3D coordinates (e.g.
 *   from embed3d.ts's embedMolecule3DWithMethod - see
 *   NmrPredictionButton.tsx for the "use a real 3D structure" option)
 *   - when present, the API uses this as the source of BOTH
 *   connectivity and geometry for shift prediction (real quantum-
 *   refined or force-field-optimized geometry rather than NMRGraph
 *   re-embedding its own cruder MMFF conformer blind), and `smiles`
 *   is only used for the unusual-elements/carbon-count warnings and
 *   tier 2 multiplicity's separate conformer generation. Since real
 *   3D coordinates already fully determine stereochemistry, the
 *   response always has exactly one `results` entry for this path -
 *   no stereoisomer enumeration, nothing ambiguous left to resolve.
 */
export async function predictNmrSpectrum(smiles: string, molfile?: string): Promise<NmrPredictResult> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new NmrPredictError("EMPTY_QUERY");

  // A timeout, matching xtbRefine.ts's pattern. Without one the dropdown could
  // spin forever: the backend runs up to 8 isomers x 30 MMFF conformers per
  // request (see NMRGraph api/main.py and coupling_karplus.py), so a wedged or
  // merely very slow service left the user with an indefinite spinner and no
  // cancel.
  //
  // 120s for the same reason xtbRefine uses it: generous enough not to fire
  // during a legitimately heavy tier-2 request.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${NMR_API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(molfile ? { smiles: trimmed, molfile } : { smiles: trimmed }),
      signal: controller.signal,
    });
  } catch (err) {
    // Distinguish "we gave up" from "the request never got there" - the user
    // can act differently on the two, and lumping them together is what made
    // this indistinguishable from a genuine network failure.
    if (err instanceof Error && err.name === "AbortError") {
      throw new NmrPredictError("TIMEOUT");
    }
    throw new NmrPredictError("NETWORK");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 400) throw new NmrPredictError("INVALID_SMILES", { smiles: trimmed });
    throw new NmrPredictError("HTTP", { status: res.status });
  }

  // Inside try: a non-JSON body (a proxy error page, HTML from the wrong port,
  // schema drift) otherwise escaped as a raw SyntaxError, and the caller's
  // final fallback returned err.message verbatim - so the user could be shown
  // `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new NmrPredictError("MALFORMED");
  }

  // Shape check. `results` in particular is dereferenced immediately by the
  // report and spectrum views, so a missing field would crash the dropdown
  // rather than degrade. Validate the frame, not every element - the per-row
  // fields are cast below exactly as before.
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { results?: unknown }).results) ||
    !Array.isArray((data as { warnings?: unknown }).warnings)
  ) {
    throw new NmrPredictError("MALFORMED");
  }

  const typed = data as {
    smiles: string;
    results: {
      smiles: string;
      predictions: { atom_index: number; predicted_shift_ppm: number; equivalence_group: number }[];
      predictions_h1: {
        atom_index: number;
        predicted_shift_ppm: number;
        num_hs: number;
        multiplicity: string;
        multiplicity_detail: string;
        coupling_hz: number[];
        equivalence_group: number;
      }[];
    }[];
    warnings: string[];
  };

  return {
    smiles: typed.smiles,
    // Defaulted rather than left undefined: state.warnings.map(...) in the
    // dropdown would have thrown on a response that omitted it, and an empty
    // list is the honest reading of "no warnings".
    warnings: typed.warnings ?? [],
    results: typed.results.map((r) => ({
      smiles: r.smiles,
      predictions: r.predictions.map((p) => ({
        atomIndex: p.atom_index,
        predictedShiftPpm: p.predicted_shift_ppm,
        equivalenceGroup: p.equivalence_group,
      })),
      predictionsH1: r.predictions_h1.map((p) => ({
        atomIndex: p.atom_index,
        predictedShiftPpm: p.predicted_shift_ppm,
        numHs: p.num_hs,
        multiplicity: p.multiplicity,
        multiplicityDetail: p.multiplicity_detail ?? "",
        couplingHz: p.coupling_hz ?? [],
        equivalenceGroup: p.equivalence_group,
      })),
    })),
  };
}
