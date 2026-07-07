import type { Molecule } from "../types/chemistry";
import { importMol } from "./molfile";
import { lookupSpanishDictionary, normalizeText, translateSpanishToEnglish } from "./compoundTranslate";

/**
 * Looks up a compound by name against PubChem's public PUG REST API and
 * returns it as a Molecule with 2D layout coordinates already assigned by
 * PubChem — no SMILES parsing or coordinate-generation needed on our end,
 * since PubChem can hand back a 2D SDF (structure-data file) directly, and
 * an SDF's structure block is the same MDL V2000 format our MOL importer
 * already reads (an SDF is just a MOL block plus extra tagged data fields).
 *
 * Docs: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
 *
 * If the name doesn't resolve as given, this retries once against a
 * Spanish -> English translation of the query (see ./compoundTranslate),
 * so "cafeína" finds the same compound as "caffeine".
 *
 * Note: this calls pubchem.ncbi.nlm.nih.gov directly from the browser. NCBI
 * asks that clients keep requests under ~5/second; a single lookup here is
 * well within that.
 */

export type PubChemErrorCode = "EMPTY_QUERY" | "NOT_FOUND" | "NETWORK" | "HTTP" | "NO_STRUCTURE";

export class PubChemError extends Error {
  code: PubChemErrorCode;
  params: Record<string, string | number>;
  constructor(code: PubChemErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = "PubChemError";
    this.code = code;
    this.params = params;
  }
}

export interface CompoundLookupResult {
  molecule: Molecule;
  /** Exactly what the user typed. */
  query: string;
  /** The name actually sent to PubChem (may equal `query`, or be its English translation). */
  resolvedName: string;
  /** Set only when a Spanish -> English translation was needed to find a match. */
  translatedFrom?: string;
  /** PubChem's display name for the compound, when available. */
  name?: string;
  formula?: string;
  cid?: number;
}

const PUG_REST_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

async function fetchSDFRaw(name: string): Promise<string> {
  const url = `${PUG_REST_BASE}/compound/name/${encodeURIComponent(name)}/record/SDF?record_type=2d`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new PubChemError("NETWORK");
  }
  if (!res.ok) {
    if (res.status === 404) throw new PubChemError("NOT_FOUND", { name });
    throw new PubChemError("HTTP", { status: res.status });
  }
  return res.text();
}

export async function fetchCompoundByName(query: string): Promise<CompoundLookupResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new PubChemError("EMPTY_QUERY");

  let sdf: string;
  let translatedFrom: string | undefined;
  let resolvedName = trimmed;

  try {
    sdf = await fetchSDFRaw(trimmed);
  } catch (err) {
    // Only retry-via-translation on a genuine "not found" — network/HTTP
    // errors should surface immediately rather than triggering more requests.
    if (!(err instanceof PubChemError) || err.code !== "NOT_FOUND") throw err;

    const guess = lookupSpanishDictionary(trimmed) ?? (await translateSpanishToEnglish(trimmed).catch(() => null));
    if (!guess || normalizeText(guess) === normalizeText(trimmed)) throw err;

    try {
      sdf = await fetchSDFRaw(guess);
      translatedFrom = trimmed;
      resolvedName = guess;
    } catch {
      throw err; // surface the original not-found rather than the retry's error
    }
  }

  const molecule = importMol(sdf);
  if (Object.keys(molecule.atoms).length === 0) {
    throw new PubChemError("NO_STRUCTURE", { name: resolvedName });
  }

  return {
    molecule,
    query: trimmed,
    resolvedName,
    translatedFrom,
    name: extractSdfField(sdf, "PUBCHEM_IUPAC_NAME") ?? undefined,
    formula: extractSdfField(sdf, "PUBCHEM_MOLECULAR_FORMULA") ?? undefined,
    cid: toInt(extractSdfField(sdf, "PUBCHEM_COMPOUND_CID")),
  };
}

function extractSdfField(sdf: string, tag: string): string | null {
  const match = sdf.match(new RegExp(`> +<${tag}>\\r?\\n(.*)\\r?\\n`));
  return match ? match[1].trim() : null;
}

function toInt(s: string | null): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}
