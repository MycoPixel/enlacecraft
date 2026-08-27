/**
 * Client for iupac_fallback_server's naming endpoint (see
 * python/iupac_fallback_server/main.py) — a small local companion
 * service, not PubChem. Mirrors io/nmrPredict.ts's and io/xtbRefine.ts's
 * fetch/error-handling shape for consistency with the rest of the
 * app's network calls, including the same "hardcoded localhost, no
 * env-var wiring yet" caveat those files document.
 *
 * Only ever called from io/iupacLookup.ts, as a fallback after
 * PubChem's own compound/smiles/property/IUPACName lookup has already
 * failed — PubChem only reliably names structures that already exist
 * as an indexed Compound in its ~120M-record database (see that
 * file's lookupIupacName doc comment), so a genuinely novel structure
 * someone draws can have no PubChem name at all despite being
 * perfectly valid chemistry. This service closes that gap locally: it
 * generates a name with NISPO (a rule-based, RDKit-driven namer) and
 * then independently re-parses that name back to a structure with
 * OPSIN, only returning the name if that round-trip reproduces the
 * exact input structure. A name that doesn't round-trip is a failure
 * on the server side (see main.py), not a best-effort guess — this
 * client never has to second-guess whether a name it got back is
 * trustworthy.
 *
 * Optional and silently unavailable by default: unless this service is
 * actually running (`uvicorn main:app --port 8002`, see the README
 * next to it), every call here fails with NETWORK and iupacLookup.ts
 * falls back to PubChem's original error message, exactly as if this
 * file didn't exist.
 */

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
