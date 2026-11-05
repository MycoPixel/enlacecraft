import type { Molecule } from "../types/chemistry";
import { importMol } from "./molfile";
import { lookupSpanishDictionary, normalizeText, suggestSpanishDictionaryMatches, translateSpanishToEnglish } from "./compoundTranslate";

/**
 * Live "did you mean" suggestions for the compound-name search box, from
 * PubChem's separate auto-complete service (a fuzzy-match dictionary
 * lookup, not a structure lookup — much cheaper/faster than actually
 * resolving each candidate, so it's reasonable to call on every keystroke).
 * Docs: https://pubchem.ncbi.nlm.nih.gov/docs/autocomplete
 *
 * PubChem's autocomplete dictionary is English/IUPAC-only, so a Spanish
 * query like "cafe" or "acido" won't match anything there even though the
 * compound exists — this augments the raw results with the same curated
 * Spanish -> English dictionary fetchCompoundByName's search fallback
 * uses (matched by prefix), and, only if that still finds nothing, one
 * live translation of the whole query re-queried against PubChem. That
 * live-translation step is gated behind "found nothing yet" specifically
 * so it doesn't add a network round-trip to every keystroke — the curated
 * dictionary alone already covers most common names for free.
 *
 * Deliberately fails silently (returns []) on any error — network hiccups,
 * rate limiting, or a response shape that doesn't match what's expected.
 * This is a nice-to-have on top of the real search (which still runs on
 * Enter/click regardless), so a broken suggestion fetch should never
 * surface an error to the person or block typing/searching.
 */
export async function fetchCompoundSuggestions(query: string, limit = 8): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const suggestions = await fetchAutocomplete(trimmed, limit);
  const addUnique = (name: string) => {
    if (!suggestions.some((s) => s.toLowerCase() === name.toLowerCase())) suggestions.push(name);
  };

  for (const en of suggestSpanishDictionaryMatches(trimmed, limit)) {
    if (suggestions.length >= limit) break;
    addUnique(en);
  }

  if (suggestions.length === 0 && trimmed.length >= 3) {
    const translated = await translateSpanishToEnglish(trimmed).catch(() => null);
    if (translated && normalizeText(translated) !== normalizeText(trimmed)) {
      for (const name of await fetchAutocomplete(translated, limit)) addUnique(name);
    }
  }

  return suggestions.slice(0, limit);
}

async function fetchAutocomplete(query: string, limit: number): Promise<string[]> {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(query)}/json?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const terms = (data as { dictionary_terms?: { compound?: unknown } })?.dictionary_terms?.compound;
    if (!Array.isArray(terms)) return [];
    return terms.filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
}

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

export type PubChemErrorCode = "EMPTY_QUERY" | "NOT_FOUND" | "NETWORK" | "HTTP" | "NO_STRUCTURE" | "BUSY";

/**
 * What a pasted value actually is.
 *
 * `"auto"` is only a request mode — `detectIdentifierKind` always returns one
 * of the concrete kinds below. The user-facing search box uses the concrete
 * kind to choose the right PubChem namespace, and the resolved kind is also
 * recorded on the lookup result so callers can show what was interpreted.
 */
export type CompoundIdentifierKind = "auto" | "name" | "smiles" | "inchi" | "inchikey" | "cid" | "cas" | "formula";
export type ResolvedIdentifierKind = Exclude<CompoundIdentifierKind, "auto">;

const CAS_RE = /^\d{2,7}-\d{2}-\d$/;
const INCHIKEY_RE = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/i;
/** A compact molecular formula: element symbols with optional counts, and at
 * least one digit or lowercase second letter so a bare uppercase string like
 * "CCO" stays SMILES rather than being read as carbon-cobalt-oxygen. */
const FORMULA_RE = /^(?:[A-Z][a-z]?\d*)+$/;

function looksLikeFormula(value: string): boolean {
  if (!FORMULA_RE.test(value) || !(/\d/.test(value) || /[a-z]/.test(value))) return false;
  // A real molecular formula combines each element into one term ("C6H12O6"),
  // so a repeated symbol means this is much more likely ring-closure SMILES
  // ("C1CCCCC1") than a formula.
  const symbols = [...value.matchAll(/[A-Z][a-z]?/g)].map((match) => match[0]);
  return new Set(symbols).size === symbols.length;
}

function looksLikeSmiles(value: string): boolean {
  // Spaces, commas and a leading locant digit are how chemical *names* are
  // written ("2-propanol", "1,3-butadiene"), not SMILES. Pure digits were
  // already claimed by CID above.
  if (/[\s,]/.test(value) || /^[0-9]/.test(value)) return false;

  // Strong SMILES-only syntax. Hyphens are deliberately excluded: they are
  // far more common in names ("p-xylene", "alpha-tocopherol") than as the
  // single-bond symbol, and a user who really means "CC-N" can choose
  // SMILES mode explicitly.
  if (/[[\]()=#@+\\/%.*:]/.test(value)) return true;

  // No punctuation: a bare organic-subset string ("CCO", "CCN") or a
  // ring-closed aromatic/upper-case string ("c1ccccc1", "C1CCCCC1").
  if (/^[BCNOPSFI]+[0-9BCNOPSFI]*$/.test(value)) return true;
  return /^[bcnops]+[0-9bcnops]*$/.test(value);
}

/**
 * Guesses which PubChem namespace a pasted identifier belongs to.
 *
 * Order matters:
 *  - InChIKey before InChI (both contain dashes/slashes, but the key has a
 *    rigid shape);
 *  - CAS before plain CID (a CAS number contains dashes, a CID doesn't);
 *  - formula before SMILES, using the "contains a digit or a lowercase
 *    element symbol, and no repeated element" rule that keeps common
 *    all-uppercase SMILES such as "CCO" and ring SMILES such as "C1CCCCC1"
 *    on the SMILES side;
 *  - everything else is treated as a name, which is also what PubChem's
 *    most forgiving namespace expects.
 */
export function detectIdentifierKind(raw: string): ResolvedIdentifierKind {
  const value = raw.trim();
  if (!value) return "name";
  if (/^InChI=/i.test(value)) return "inchi";
  if (INCHIKEY_RE.test(value)) return "inchikey";
  if (CAS_RE.test(value)) return "cas";
  if (/^\d{1,9}$/.test(value)) return "cid";
  if (looksLikeFormula(value)) return "formula";
  if (looksLikeSmiles(value)) return "smiles";
  return "name";
}

/**
 * PubChem answers overload with HTTP 503 / "PUGREST.ServerBusy — Too many
 * requests or server too busy", and it does so for the whole endpoint rather
 * than one bad query. Left as a generic HTTP error, that surfaces to the user
 * as "couldn't resolve this structure", which blames their molecule for what
 * is a transient server condition — and retrying is the documented remedy.
 */
const BUSY_RETRY_DELAYS_MS = [400, 1200, 2500];

/** True for statuses PubChem uses to mean "try again", not "no such compound". */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

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
  /** How the query was interpreted, when the caller asked for auto-detection
   * or an explicit identifier namespace. Absent on the legacy name/SMILES/CID
   * entry points, which predate the identifier hub. */
  identifierKind?: ResolvedIdentifierKind;
}

const PUG_REST_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

async function fetchSDFRaw(
  identifier: string,
  namespace: "name" | "smiles" | "cid" | "inchi" | "inchikey"
): Promise<string> {
  let res: Response;
  try {
    if (namespace === "smiles" || namespace === "inchi") {
      // POST (with the identifier in the body, not the URL) rather than GET —
      // PubChem's own docs call out that some SMILES characters (notably "/",
      // used for cis/trans double-bond geometry) can break a GET even when
      // percent-encoded, since some routing along the way decodes the URL
      // before PubChem's own parser sees it. InChI has the same problem (its
      // layers are full of "/" and "="), and POSTing the identifier as a form
      // field sidesteps it entirely for both.
      const field = namespace === "smiles" ? "smiles" : "inchi";
      res = await fetch(`${PUG_REST_BASE}/compound/${namespace}/record/SDF?record_type=2d`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `${field}=${encodeURIComponent(identifier)}`,
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

/**
 * Looks up a compound PubChem already has a numeric CID for — the second
 * half of structure search's two-step flow: searchCompoundsBySubstructure
 * returns a list of candidate CIDs, and picking one of them calls this to
 * actually fetch its full 2D structure, the same way fetchCompoundByName
 * and fetchCompoundBySmiles do for their own identifiers.
 */
export async function fetchCompoundByCid(cid: number): Promise<CompoundLookupResult> {
  const sdf = await fetchSDFRaw(String(cid), "cid");
  const molecule = importMol(sdf);
  if (Object.keys(molecule.atoms).length === 0) {
    throw new PubChemError("NO_STRUCTURE", { name: String(cid) });
  }
  return {
    molecule,
    query: String(cid),
    resolvedName: String(cid),
    name: extractSdfField(sdf, "PUBCHEM_IUPAC_NAME") ?? undefined,
    formula: extractSdfField(sdf, "PUBCHEM_MOLECULAR_FORMULA") ?? undefined,
    cid,
  };
}

function resultFromSdf(
  sdf: string,
  query: string,
  resolvedName: string,
  identifierKind: ResolvedIdentifierKind
): CompoundLookupResult {
  const molecule = importMol(sdf);
  if (Object.keys(molecule.atoms).length === 0) {
    throw new PubChemError("NO_STRUCTURE", { name: resolvedName });
  }
  return {
    molecule,
    query,
    resolvedName,
    identifierKind,
    name: extractSdfField(sdf, "PUBCHEM_IUPAC_NAME") ?? undefined,
    formula: extractSdfField(sdf, "PUBCHEM_MOLECULAR_FORMULA") ?? undefined,
    cid: toInt(extractSdfField(sdf, "PUBCHEM_COMPOUND_CID")),
  };
}

async function fetchCompoundByNamespace(
  query: string,
  namespace: "name" | "inchi" | "inchikey",
  identifierKind: ResolvedIdentifierKind
): Promise<CompoundLookupResult> {
  const identifier = namespace === "inchikey" ? query.toUpperCase() : query;
  const sdf = await fetchSDFRaw(identifier, namespace);
  return resultFromSdf(sdf, query, identifier, identifierKind);
}

/** Resolves a molecular formula to one concrete PubChem compound. Formula
 * lookup is one-to-many by nature (C6H6 has many isomers), so the first CID
 * returned is used — the same "pick a representative" behaviour as the
 * formula search on PubChem's own site. The result's formula field still
 * comes from PubChem, so the caller can see exactly what was chosen. */
async function fetchFirstCidForFormula(formula: string): Promise<number> {
  let res: Response;
  try {
    res = await fetch(`${PUG_REST_BASE}/compound/formula/${encodeURIComponent(formula)}/cids/TXT`);
  } catch {
    throw new PubChemError("NETWORK");
  }
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) throw new PubChemError("NOT_FOUND", { name: formula });
    throw new PubChemError("HTTP", { status: res.status });
  }
  const text = await res.text();
  const first = text
    .split(/\s+/)
    .map((value) => parseInt(value, 10))
    .find((value) => Number.isFinite(value) && value > 0);
  if (!first) throw new PubChemError("NOT_FOUND", { name: formula });
  return first;
}

/**
 * One entry point for every identifier the search box accepts.
 *
 * `kind: "auto"` runs `detectIdentifierKind`; an explicit kind skips the
 * guess. Name lookup keeps the existing Spanish -> English retry, and CID /
 * formula resolution reuse `fetchCompoundByCid`, so all paths return the same
 * PubChem-derived 2D structure with the same metadata.
 */
export async function fetchCompoundByIdentifier(
  query: string,
  kind: CompoundIdentifierKind = "auto"
): Promise<CompoundLookupResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new PubChemError("EMPTY_QUERY");

  const resolvedKind = kind === "auto" ? detectIdentifierKind(trimmed) : kind;

  switch (resolvedKind) {
    case "name":
      return { ...(await fetchCompoundByName(trimmed)), identifierKind: resolvedKind };
    case "smiles":
      return { ...(await fetchCompoundBySmiles(trimmed)), identifierKind: resolvedKind };
    case "cas":
      return fetchCompoundByNamespace(trimmed, "name", resolvedKind);
    case "inchi":
      return fetchCompoundByNamespace(trimmed, "inchi", resolvedKind);
    case "inchikey":
      return fetchCompoundByNamespace(trimmed, "inchikey", resolvedKind);
    case "cid": {
      const cid = parseInt(trimmed, 10);
      if (!Number.isFinite(cid) || cid <= 0) throw new PubChemError("NOT_FOUND", { name: trimmed });
      return { ...(await fetchCompoundByCid(cid)), query: trimmed, identifierKind: resolvedKind };
    }
    case "formula": {
      const cid = await fetchFirstCidForFormula(trimmed);
      const result = await fetchCompoundByCid(cid);
      return { ...result, query: trimmed, resolvedName: result.name ?? trimmed, identifierKind: resolvedKind };
    }
  }
}

export interface StructureSearchResult {
  cid: number;
  name?: string;
  formula?: string;
}

/**
 * Finds compounds in PubChem that *contain* the given structure as a
 * substructure — as opposed to fetchCompoundBySmiles, which only finds an
 * exact identity match. This is what powers "draw a fragment, find
 * compounds that contain it": the fragment gets exported to SMILES (see
 * io/smiles.ts) and sent here.
 *
 * Uses PubChem's "fast" substructure search (fastsubstructure), which
 * runs synchronously and returns matching CIDs directly, rather than the
 * plain substructure endpoint, which is an asynchronous job you'd have to
 * poll for completion — fast search is exactly suited to the small,
 * simple fragments a person draws by hand in a sketch tool, and avoids
 * needing any polling logic here.
 *
 * Docs: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest#section=Fast-Search
 *
 * A fragment containing an abbreviated-group placeholder (Ph, Boc, ...)
 * exports as SMILES's `*` wildcard atom (see exportSmiles's doc comment) —
 * PubChem's search may not treat that the way a chemist would expect it
 * to, since it isn't a real substructure query wildcard in this context.
 * That's an inherent limit of what's actually in the drawing, not
 * something this function can compensate for.
 */
export async function searchCompoundsBySubstructure(smiles: string, maxResults = 20): Promise<StructureSearchResult[]> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new PubChemError("EMPTY_QUERY");

  let res: Response;
  try {
    // POST, not GET — same reasoning as fetchSDFRaw's identity lookup
    // just above: PubChem's own docs warn that some SMILES characters can
    // break a GET even when percent-encoded, since routing along the way
    // can decode the URL before PubChem's parser sees it. That's not a
    // rare edge case here — "=" appears in essentially every SMILES with
    // a double bond or an aromatic ring, i.e. most things anyone would
    // actually draw and search for. A mangled-in-transit SMILES doesn't
    // fail loudly; PubChem just searches for whatever the corrupted
    // string happened to parse as, which is how a search for "a benzene
    // ring" could silently come back with compounds that don't contain
    // one at all.
    res = await fetch(`${PUG_REST_BASE}/compound/fastsubstructure/smiles/cids/JSON?MaxRecords=${maxResults}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `smiles=${encodeURIComponent(trimmed)}`,
    });
  } catch {
    throw new PubChemError("NETWORK");
  }
  if (!res.ok) {
    // As with SMILES identity lookup, PubChem returns 400 (not 404) for a
    // query it can't parse at all, and 404 for "parsed fine, found
    // nothing" — both read as NOT_FOUND from here.
    if (res.status === 404 || res.status === 400) throw new PubChemError("NOT_FOUND", { name: trimmed });
    throw new PubChemError("HTTP", { status: res.status });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new PubChemError("NOT_FOUND", { name: trimmed });
  }
  const cids = (data as { IdentifierList?: { CID?: number[] } })?.IdentifierList?.CID;
  if (!Array.isArray(cids) || cids.length === 0) throw new PubChemError("NOT_FOUND", { name: trimmed });

  const capped = cids.slice(0, maxResults);
  return fetchCompoundSummaries(capped);
}

/**
 * Resolves the IUPAC name for a drawn structure (or selected fragment) via
 * PubChem's PUG REST property endpoint.
 *
 * Despite this being a "give me a property for this SMILES" endpoint
 * rather than a "look up this known compound" one, it does NOT reliably
 * name arbitrary valid structures on the fly. In practice it only
 * reliably returns a name once the exact structure is already indexed
 * as a Compound in PubChem's own ~120M-record database — for a SMILES
 * that isn't already a known compound, PubChem can auto-generate a
 * lightweight record with a few basic properties, but IUPAC naming
 * specifically needs its full Lexichem/OEChem toolkit, which is too
 * expensive to run on the fly for non-indexed structures, so this
 * throws NOT_FOUND for those even though the SMILES itself is perfectly
 * valid chemistry. See io/iupacLookup.ts's lookupIupacName, which is
 * this function's only caller: it tries an optional local fallback
 * service for exactly this case, rather than this function trying to
 * work around it itself.
 *
 * POSTs the SMILES rather than GETs it, for the same reason as
 * fetchSDFRaw and searchCompoundsBySubstructure above: some SMILES
 * characters don't survive URL encoding/decoding along the way intact.
 *
 * Docs: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest#section=Compound-Property-Tables
 */
export async function fetchIupacName(smiles: string): Promise<string> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new PubChemError("EMPTY_QUERY");

  let res: Response;
  try {
    res = await fetch(`${PUG_REST_BASE}/compound/smiles/property/IUPACName/JSON`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `smiles=${encodeURIComponent(trimmed)}`,
    });
  } catch {
    throw new PubChemError("NETWORK");
  }
  if (!res.ok) {
    // Same 400-vs-404 ambiguity as elsewhere in this file — both mean
    // "PubChem couldn't do anything useful with this" from here.
    if (res.status === 404 || res.status === 400) throw new PubChemError("NOT_FOUND", { name: trimmed });
    throw new PubChemError("HTTP", { status: res.status });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new PubChemError("NOT_FOUND", { name: trimmed });
  }
  const props = (data as { PropertyTable?: { Properties?: { IUPACName?: string }[] } })?.PropertyTable?.Properties;
  const name = props?.[0]?.IUPACName;
  if (!name) throw new PubChemError("NOT_FOUND", { name: trimmed });
  return name;
}

/**
 * Fetches InChI and InChIKey for a structure — the standardized,
 * algorithmically-canonical identifiers (unlike SMILES, which isn't
 * canonical unless the whole toolchain agrees on one) that PubChem,
 * ChemSpider, and Google Scholar all use as their own lookup key. Same
 * PUG REST property endpoint as fetchIupacName just above (a single
 * request can ask for multiple properties at once), so this shares its
 * error handling and POST-not-GET reasoning exactly — see that function's
 * doc comment for why POST matters here (SMILES's "/" characters).
 *
 * Deliberately not implemented locally: InChI generation is defined by
 * IUPAC's own reference algorithm (canonicalization, tautomer
 * normalization, layered formula/connection/charge/stereo encoding) and
 * every real implementation wraps that exact reference library rather
 * than reimplementing it — asking PubChem, which already computes this
 * from the same input this app already sends for naming, is the
 * appropriate approach rather than bundling a multi-megabyte WASM build
 * of the reference library for one feature.
 */
export async function fetchInChI(smiles: string): Promise<{ inchi: string; inchikey: string }> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new PubChemError("EMPTY_QUERY");

  // Retried on 503/429 because PubChem's overload response is transient and
  // endpoint-wide: without this, a momentary busy period makes a perfectly
  // valid structure report that its InChIKey could not be resolved. Gives up
  // after the last delay and reports BUSY so the caller can say so plainly.
  let res: Response | null = null;
  let lastError: "busy" | "network" = "busy";
  for (let attempt = 0; attempt <= BUSY_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, BUSY_RETRY_DELAYS_MS[attempt - 1]));
    try {
      res = await fetch(`${PUG_REST_BASE}/compound/smiles/property/InChI,InChIKey/JSON`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `smiles=${encodeURIComponent(trimmed)}`,
      });
    } catch {
      lastError = "network";
      res = null;
      continue;
    }
    // A definitive answer (success, or a status that means "no such
    // compound") ends the loop; only busy/overload is worth retrying.
    if (res.ok || !isRetryableStatus(res.status)) break;
    lastError = "busy";
    res = null;
  }

  if (res === null) {
    throw new PubChemError(lastError === "busy" ? "BUSY" : "NETWORK", { name: trimmed });
  }
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) throw new PubChemError("NOT_FOUND", { name: trimmed });
    throw new PubChemError("HTTP", { status: res.status });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new PubChemError("NOT_FOUND", { name: trimmed });
  }
  const props = (data as { PropertyTable?: { Properties?: { InChI?: string; InChIKey?: string }[] } })?.PropertyTable?.Properties;
  const inchi = props?.[0]?.InChI;
  const inchikey = props?.[0]?.InChIKey;
  if (!inchi || !inchikey) throw new PubChemError("NOT_FOUND", { name: trimmed });
  return { inchi, inchikey };
}

export interface CompoundIdentifiers {
  /** PubChem's own compound id. */
  cid?: number;
  /** PubChem's preferred IUPAC-style name, when it has one. */
  name?: string;
  /** The standard 27-character InChIKey, useful for cross-database lookup. */
  inchikey?: string;
}

/**
 * Lightweight identifier lookup for batch workflows (the properties table's
 * "enrich" action). Asks PubChem's property endpoint for only the three
 * fields a table needs, rather than downloading a full SDF per structure —
 * the identifier hub's structure lookup already exists for when the actual
 * drawing is wanted.
 *
 * Uses the same POST-not-GET form as fetchIupacName/fetchInChI: SMILES
 * characters such as "/" don't survive a GET reliably, even percent-encoded.
 * The caller is expected to space batch calls out (PubChem asks for no more
 * than about five requests per second); this function deliberately doesn't
 * sleep internally, so a single interactive lookup stays instant.
 */
export async function fetchCompoundIdentifiersBySmiles(smiles: string): Promise<CompoundIdentifiers> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new PubChemError("EMPTY_QUERY");

  let res: Response;
  try {
    res = await fetch(`${PUG_REST_BASE}/compound/smiles/property/IUPACName,InChIKey/JSON`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `smiles=${encodeURIComponent(trimmed)}`,
    });
  } catch {
    throw new PubChemError("NETWORK");
  }
  if (!res.ok) {
    // Same 400-vs-404 ambiguity as the rest of this file: both mean "PubChem
    // couldn't do anything useful with this structure".
    if (res.status === 404 || res.status === 400) throw new PubChemError("NOT_FOUND", { name: trimmed });
    throw new PubChemError("HTTP", { status: res.status });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new PubChemError("NOT_FOUND", { name: trimmed });
  }
  const props = (
    data as {
      PropertyTable?: {
        Properties?: { CID?: number; IUPACName?: string; InChIKey?: string }[];
      };
    }
  )?.PropertyTable?.Properties;
  const property = props?.[0];
  if (!property) throw new PubChemError("NOT_FOUND", { name: trimmed });

  return {
    cid: property.CID,
    name: property.IUPACName,
    inchikey: property.InChIKey,
  };
}

/**
 * Batch-fetches just the name/formula for a list of CIDs — used to give
 * search results a readable label without fetching each one's full
 * structure up front (that only happens once the person actually picks a
 * result, via fetchCompoundByCid). Falls back to bare CIDs (no name/
 * formula) on any failure here, rather than losing the whole result list
 * over what's ultimately just cosmetic labeling.
 */
async function fetchCompoundSummaries(cids: number[]): Promise<StructureSearchResult[]> {
  const bare = cids.map((cid) => ({ cid }));
  try {
    const url = `${PUG_REST_BASE}/compound/cid/${cids.join(",")}/property/IUPACName,MolecularFormula/JSON`;
    const res = await fetch(url);
    if (!res.ok) return bare;
    const data = await res.json();
    const props = (data as { PropertyTable?: { Properties?: { CID: number; IUPACName?: string; MolecularFormula?: string }[] } })?.PropertyTable?.Properties;
    if (!Array.isArray(props)) return bare;
    return cids.map((cid) => {
      const p = props.find((pr) => pr.CID === cid);
      return { cid, name: p?.IUPACName, formula: p?.MolecularFormula };
    });
  } catch {
    return bare;
  }
}
