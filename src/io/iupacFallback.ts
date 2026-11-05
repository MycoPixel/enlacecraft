/**
 * Client for iupac_fallback_server's two endpoints (see
 * python/iupac_fallback_server/main.py) — a small local companion
 * service, not PubChem. Mirrors io/nmrPredict.ts's and io/xtbRefine.ts's
 * fetch/error-handling shape for consistency with the rest of the
 * app's network calls, including the same "hardcoded localhost, no
 * env-var wiring yet" caveat those files document.
 *
 * Two call sites:
 *
 *  - io/iupacLookup.ts, for structure → name: as a fallback after
 *    PubChem's own compound/smiles/property/IUPACName lookup has already
 *    failed — PubChem only reliably names structures that already exist
 *    as an indexed Compound in its ~120M-record database (see that
 *    file's lookupIupacName doc comment), so a genuinely novel structure
 *    someone draws can have no PubChem name at all despite being
 *    perfectly valid chemistry. This service closes that gap locally: it
 *    generates a name with NISPO (a rule-based, RDKit-driven namer) and
 *    then independently re-parses that name back to a structure with
 *    OPSIN, only returning the name if that round-trip reproduces the
 *    exact input structure. A name that doesn't round-trip is a failure
 *    on the server side (see main.py), not a best-effort guess — this
 *    client never has to second-guess whether a name it got back is
 *    trustworthy.
 *
 *  - TopBar/CompoundSearch.tsx, for name → structure: as a fallback when
 *    PubChem has no compound for a searched *name* — same root cause as
 *    above, other direction. OPSIN parses the name into canonical SMILES
 *    (see /name-to-structure in main.py), which this client imports
 *    through the same importSmiles path a pasted SMILES takes.
 *
 * Optional and silently unavailable by default: unless this service is
 * actually running (`uvicorn main:app --port 8002`, see the README
 * next to it), every call here fails with NETWORK and callers fall back
 * to PubChem's original error message, exactly as if this file didn't
 * exist. Availability is decided by attempting the call and treating
 * failure as "unavailable" — no up-front health probe — the same policy
 * io/iupacLookup.ts has always used for this service.
 */

import type { Molecule } from "../types/chemistry";
import { importSmiles } from "./smilesImport";

const IUPAC_FALLBACK_API_BASE = "http://localhost:8002";

export type IupacFallbackErrorCode = "EMPTY_QUERY" | "NOT_FOUND" | "NETWORK" | "HTTP";

export class IupacFallbackError extends Error {
  code: IupacFallbackErrorCode;
  params: Record<string, string | number>;
  constructor(code: IupacFallbackErrorCode, params: Record<string, string | number> = {}) {
    super(code);
    this.name = "IupacFallbackError";
    this.code = code;
    this.params = params;
  }
}

export interface IupacFallbackResult {
  /** Canonical SMILES the server actually verified the name against —
   * not necessarily byte-identical to what was sent (RDKit
   * canonicalization), but the same structure. */
  smiles: string;
  name: string;
}

/**
 * Looks up a verified, locally-generated IUPAC-style name for `smiles`.
 * Throws IupacFallbackError on anything short of a verified name —
 * including a reachable server that simply couldn't produce or verify
 * one (NOT_FOUND) — so a caller never has to separately check a
 * "verified" flag on the result; getting a result back at all means
 * it's verified.
 */
export async function fetchLocalIupacName(smiles: string): Promise<IupacFallbackResult> {
  const trimmed = smiles.trim();
  if (!trimmed) throw new IupacFallbackError("EMPTY_QUERY");

  let res: Response;
  try {
    res = await fetch(`${IUPAC_FALLBACK_API_BASE}/name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smiles: trimmed }),
    });
  } catch {
    throw new IupacFallbackError("NETWORK");
  }

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) throw new IupacFallbackError("NOT_FOUND", { smiles: trimmed });
    throw new IupacFallbackError("HTTP", { status: res.status });
  }

  const data = (await res.json()) as { smiles: string; name: string };
  if (!data.name) throw new IupacFallbackError("NOT_FOUND", { smiles: trimmed });
  return { smiles: data.smiles, name: data.name };
}

/** Mirrors the server's own input cap (MAX_NAME_CHARS in
 * python/iupac_fallback_server/naming.py) so an over-long "name" —
 * really a pasted paragraph — fails fast locally instead of paying a
 * round trip to be told 400. */
const MAX_NAME_CHARS = 512;

/** The service is on loopback, so a failure is instant in practice; the
 * cap exists so a wedged server process can't hang a search. Generous
 * relative to OPSIN itself, which answers in single-digit milliseconds
 * once its JVM is warm (same rationale as io/localChem.ts's
 * LOCAL_TIMEOUT_MS for the other local backend). */
const NAME_TO_STRUCTURE_TIMEOUT_MS = 2500;

/**
 * Resolves a chemical *name* to a structure via the local fallback
 * service's /name-to-structure (OPSIN), parsed into a Molecule through
 * the same importSmiles path a pasted SMILES takes — so whatever lands
 * on the canvas has been through exactly the same validation and
 * sanitization as every other SMILES import.
 *
 * Deliberately fails soft, unlike fetchLocalIupacName above: returns
 * null for every outcome that isn't a usable molecule — service not
 * running, timed out, 4xx/5xx (including the server's own 404 "OPSIN
 * couldn't parse this name"), malformed JSON, or a SMILES that doesn't
 * survive import. The caller (CompoundSearch's name search) treats null
 * as "no local fallback" and keeps the original PubChem error, so the
 * service being absent changes nothing for anyone who hasn't set it up.
 */
export async function fetchNameToStructureLocal(name: string): Promise<Molecule | null> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_CHARS) return null;

  let res: Response;
  try {
    res = await fetch(`${IUPAC_FALLBACK_API_BASE}/name-to-structure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
      signal: AbortSignal.timeout(NAME_TO_STRUCTURE_TIMEOUT_MS),
    });
  } catch {
    // NETWORK or timeout — both mean "no local fallback available".
    return null;
  }
  if (!res.ok) return null; // includes the server's 404 "not parseable"

  try {
    const data = (await res.json()) as { smiles?: unknown };
    const smiles = typeof data.smiles === "string" ? data.smiles.trim() : "";
    if (!smiles) return null;
    return importSmiles(smiles).molecule;
  } catch {
    // Bad JSON or a SMILES importSmiles rejects — same fail-soft outcome.
    return null;
  }
}
