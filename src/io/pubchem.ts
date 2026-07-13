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

async function fetchSDFRaw(identifier: string, namespace: "name" | "smiles"): Promise<string> {
  let res: Response;
  try {
    if (namespace === "smiles") {
      // POST (with the SMILES in the body, not the URL) rather than GET —
      // PubChem's own docs call out that some SMILES characters (notably
      // "/", used for cis/trans double-bond geometry) can break a GET
      // even when percent-encoded, since some routing along the way
      // decodes the URL before PubChem's own parser sees it. POSTing the
      // identifier as a form field sidesteps that entirely.
      res = await fetch(`${PUG_REST_BASE}/compound/smiles/record/SDF?record_type=2d`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `smiles=${encodeURIComponent(identifier)}`,
      });
    } else {
      res = await fetch(`${PUG_REST_BASE}/compound/${namespace}/${encodeURIComponent(identifier)}/record/SDF?record_type=2d`);
    }
  } catch {
    throw new PubChemError("NETWORK");
  }
  if (!res.ok) {
    // PubChem returns 400 (not 404) for a SMILES it can't parse/standardize
    // at all — from the user's point of view that's the same "this wasn't
    // found/recognized" outcome as a real 404, so both map to NOT_FOUND.
    if (res.status === 404 || res.status === 400) throw new PubChemError("NOT_FOUND", { name: identifier });
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
    sdf = await fetchSDFRaw(trimmed, "name");
  } catch (err) {
    // Only retry-via-translation on a genuine "not found" — network/HTTP
    // errors should surface immediately rather than triggering more requests.
    if (!(err instanceof PubChemError) || err.code !== "NOT_FOUND") throw err;

    const guess = lookupSpanishDictionary(trimmed) ?? (await translateSpanishToEnglish(trimmed).catch(() => null));
    if (!guess || normalizeText(guess) === normalizeText(trimmed)) throw err;

    try {
      sdf = await fetchSDFRaw(guess, "name");
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

/**
 * Looks up a compound by SMILES string, the same way fetchCompoundByName
 * looks one up by name — PubChem's PUG REST accepts a SMILES identifier
 * directly (no Spanish-name-translation retry needed here, since a SMILES
 * string isn't a natural-language name). This is how SMILES *import* is
 * supported: rather than writing our own SMILES parser plus a 2D
 * coordinate-generation algorithm (a substantial project on its own, and
 * the 2D-layout half of it doesn't even have a "right answer" the way
 * parsing does), PubChem is asked to resolve the SMILES to a structure and
 * hand back the same 2D SDF format fetchCompoundByName already parses —
 * SMILES *export* (Molecule -> string) is handled separately and locally,
 * see io/smiles.ts, since that direction doesn't need coordinate
 * generation at all.
 */
export async function fetchCompoundBySmiles(smiles: string): Promise<CompoundLookupResult> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new PubChemError("EMPTY_QUERY");

  const sdf = await fetchSDFRaw(trimmed, "smiles");
  const molecule = importMol(sdf);
  if (Object.keys(molecule.atoms).length === 0) {
    throw new PubChemError("NO_STRUCTURE", { name: trimmed });
  }

  return {
    molecule,
    query: trimmed,
    resolvedName: trimmed,
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
