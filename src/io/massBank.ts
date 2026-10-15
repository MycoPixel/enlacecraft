/**
 * MassBank experimental spectrum lookup.
 *
 * MassBank records are contributed by many different labs under a range of
 * licences, and `license` is a field on each record — so anything displayed
 * here has to carry that record's attribution with it. There is no blanket
 * licence for the whole collection that would let us drop it.
 *
 * Two calls, deliberately kept separate:
 *   searchSpectra()  — /records/search, returns accessions only (~7 kB for
 *                      caffeine's 122 hits instead of the ~257 MB that an
 *                      unfiltered /records call returns)
 *   fetchSpectrum()  — /records/{accession}, one full record with peaks
 *
 * The obvious `?query=` / `?count=` params on /records are ignored by the
 * server and it answers with the entire database. Those are the params the
 * older documentation advertises, so they still look plausible — the working
 * filtered endpoint is /records/search with `inchi_key`.
 */

const MASSBANK_BASE = "https://massbank.eu/MassBank-api";
/**
 * Human-facing record page, for attribution links. Deliberately NOT
 * `MASSBANK_BASE + "/records/" + accession`: that path 404s, and the
 * `Search?query=` and `SpectrumDisplay.jsp` pages that look plausible both
 * return an app shell that renders "no results" because they resolve the
 * accession client-side from a bundle that doesn't have it. RecordDisplay is
 * the one that server-renders the actual record.
 */
const RECORD_PAGE_BASE = "https://massbank.eu/MassBank/RecordDisplay";

export type MassBankErrorCode = "NETWORK" | "HTTP" | "NOT_FOUND" | "EMPTY_QUERY" | "BAD_RESPONSE";

export class MassBankError extends Error {
  code: MassBankErrorCode;
  constructor(code: MassBankErrorCode) {
    super(code);
    this.name = "MassBankError";
    this.code = code;
  }
}

/**
 * InChIKeys are a fixed 27-character structure: a 14-character skeleton
 * block, a 10-character connectivity/protonation block, and a single
 * character for the remaining stereochemistry and protonation state,
 * separated by hyphens. Used to validate hand-entered keys before spending a
 * request on them — MassBank answers an unknown key with an empty result
 * rather than an error, so a typo would otherwise look exactly like a
 * molecule with no spectra.
 */
export function isValidInChIKey(value: string): boolean {
  return /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(value.trim());
}

/** One hit from /records/search — an accession, nothing else. */
export interface SpectrumRef {
  accession: string;
}

export interface SpectraSearchResult {
  refs: SpectrumRef[];
  /** True when the exact InChIKey found nothing and the 14-character skeleton
   * block was searched instead, so these hits may be other stereoisomers. */
  stereochemistryFallback: boolean;
}

export interface Peak {
  mz: number;
  intensity: number;
  /** Percentage relative to base peak, as MassBank records it. */
  rel?: number;
}

export interface MassBankSpectrum {
  accession: string;
  name: string;
  formula?: string;
  /** Per-record licence, e.g. "dl-de/by-2-0". Must be shown with the spectrum. */
  license: string;
  /** Server-rendered page for this record, for the attribution link. */
  recordUrl: string;
  copyright?: string;
  msType?: string;
  ionMode?: string;
  ionization?: string;
  fragmentationMode?: string;
  instrumentType?: string;
  instrument?: string;
  collisionEnergy?: string;
  precursorMz?: number;
  precursorType?: string;
  numPeaks?: number;
  peaks: Peak[];
}

/**
 * Finds measured spectra for an InChIKey. Returns accessions only — the
 * caller fetches whichever ones the user actually opens, since a single
 * hit list can run to a hundred records and each full record is ~50 kB.
 */
export async function searchSpectra(inchiKey: string): Promise<SpectraSearchResult> {
  const key = inchiKey.trim();
  if (!key) throw new MassBankError("EMPTY_QUERY");

  let res: Response;
  try {
    res = await fetch(`${MASSBANK_BASE}/records/search?inchi_key=${encodeURIComponent(key)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new MassBankError("NETWORK");
  }
  if (res.status === 404) return { refs: [], stereochemistryFallback: false };
  if (!res.ok) throw new MassBankError("HTTP");

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new MassBankError("BAD_RESPONSE");
  }

  // A structure drawn without stereochemistry hashes to a ...-UHFFFAOYSA-N
  // key, which matches no stereo-defined record: tryptophan returns 0 instead
  // of 81, glucose 0 instead of 18, sucrose 0 instead of 8. The 14-character
  // skeleton block is the same for all stereoisomers and MassBank accepts it
  // as a prefix, so it recovers those. It's only consulted when the exact key
  // finds nothing, and its results are flagged, because they then include other
  // stereoisomers -- for achiral compounds the two searches are identical.
  const skeleton = key.slice(0, 14);
  if (skeleton.length === 14 && skeleton !== key) {
    const exact = rowsOf(data);
    if (exact.length === 0) {
      const loose = await searchByInchiKey(skeleton);
      return { refs: loose, stereochemistryFallback: loose.length > 0 };
    }
    return { refs: exact, stereochemistryFallback: false };
  }
  return { refs: rowsOf(data), stereochemistryFallback: false };
}

/** Performs one search call and normalises its response shape. */
async function searchByInchiKey(inchiKey: string): Promise<SpectrumRef[]> {
  let res: Response;
  try {
    res = await fetch(`${MASSBANK_BASE}/records/search?inchi_key=${encodeURIComponent(inchiKey)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new MassBankError("NETWORK");
  }
  if (!res.ok && res.status !== 404) throw new MassBankError("HTTP");
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return [];
  }
  return rowsOf(data);
}

function rowsOf(data: unknown): SpectrumRef[] {
  const rows = (data as { data?: { accession?: string }[] })?.data;
  // An InChIKey with no hits comes back as HTTP 200 with a bare `{}` — no
  // `data` key at all. That's a legitimate "nothing found", not a malformed
  // response, so it must not become an error the user sees.
  if (rows === undefined || rows === null) return [];
  if (!Array.isArray(rows)) throw new MassBankError("BAD_RESPONSE");
  return rows
    .map((r) => r.accession)
    .filter((a): a is string => typeof a === "string" && a.length > 0)
    .map((accession) => ({ accession }));
}

/** Pulls the first named subtags out of a MassBank list-of-{subtag,value} block. */
function subtags(node: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(node)) return out;
  for (const t of node as { subtag?: string; value?: string }[]) {
    if (t.subtag && t.value !== undefined) out[t.subtag] = t.value;
  }
  return out;
}

/**
 * Fetches one full record and flattens MassBank's deeply nested shape down to
 * the fields a spectrum viewer needs.
 *
 * Peaks are returned as-is — no normalisation, no re-scaling, no
 * de-duplication. MassBank's `intensity` is already relative to base peak, and
 * the `rel` field carries its own percentages; anything this function did to
 * those numbers would be a second, disagreeing opinion about the same data.
 */
export async function fetchSpectrum(accession: string): Promise<MassBankSpectrum> {
  const acc = accession.trim();
  if (!acc) throw new MassBankError("EMPTY_QUERY");

  let res: Response;
  try {
    res = await fetch(`${MASSBANK_BASE}/records/${encodeURIComponent(acc)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new MassBankError("NETWORK");
  }
  if (res.status === 404) throw new MassBankError("NOT_FOUND");
  if (!res.ok) throw new MassBankError("HTTP");

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new MassBankError("BAD_RESPONSE");
  }
  // A well-formed accession that doesn't exist comes back as HTTP 200 with a
  // bare JSON *string* holding a SQL error (`"sql: no rows in result set"`).
  // Anything that isn't an object with peak data is therefore a miss, not a
  // record — checking this before reading fields is what stops that string
  // from being rendered to the user as a spectrum.
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new MassBankError("NOT_FOUND");
  }

  const compound = (data.compound ?? {}) as {
    names?: string[];
    formula?: string;
  };
  // `license` is a top-level record field, NOT under `compound` — `compound`
  // only carries names/formula/inchi/smiles/mass/classes. Reading it from the
  // wrong place yields undefined and renders every attribution as
  // "(unknown)", which is exactly the kind of silent failure that would let a
  // non-redistributable record ship with no credit attached.
  const license = typeof data.license === "string" ? data.license : "";
  const acquisition = (data.acquisition ?? {}) as { instrument_type?: string; instrument?: Record<string, unknown> };
  const ms = (data.mass_spectrometry ?? {}) as { focused_ion?: unknown };
  const msSub = subtags((acquisition as Record<string, unknown>).mass_spectrometry);
  const focused = subtags(ms.focused_ion);
  const peakBlock = data.peak as { numPeak?: number; peak?: { values?: Peak[] } };

  const peaks = Array.isArray(peakBlock?.peak?.values) ? peakBlock.peak.values : [];
  if (peaks.length === 0) throw new MassBankError("NOT_FOUND");

  const precursorMzRaw = focused["PRECURSOR_M/Z"];
  const numPeaksRaw = peakBlock?.numPeak;

  return {
    accession: typeof data.accession === "string" ? data.accession : acc,
    name: compound.names?.[0] ?? acc,
    formula: compound.formula,
    license,
    copyright: typeof data.copyright === "string" ? data.copyright : undefined,
    /** Server-rendered page for this record, for the attribution link. */
    recordUrl: `${RECORD_PAGE_BASE}?id=${encodeURIComponent(acc)}`,
    msType: msSub.MS_TYPE,
    ionMode: msSub.ION_MODE,
    ionization: msSub.IONIZATION,
    fragmentationMode: msSub.FRAGMENTATION_MODE,
    instrumentType: acquisition.instrument_type,
    instrument: typeof acquisition.instrument?.name === "string" ? acquisition.instrument.name : undefined,
    collisionEnergy: msSub.COLLISION_ENERGY,
    precursorMz: precursorMzRaw === undefined ? undefined : Number(precursorMzRaw),
    precursorType: focused.PRECURSOR_TYPE,
    numPeaks: numPeaksRaw === undefined ? undefined : Number(numPeaksRaw),
    peaks,
  };
}