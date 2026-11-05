import type { Molecule } from "../types/chemistry";
import type { Lang } from "../i18n/translations";
import { extractFragment } from "../model/molecule";
import { exportSmiles } from "./smiles";
import { fetchIupacName, PubChemError } from "./pubchem";
import { fetchLocalIupacName } from "./iupacFallback";
import { approximateSpanishIupacName } from "./compoundTranslate";

export interface IupacLookupResult {
  english: string;
  spanish?: string;
  stereoOmitted?: boolean;
  /** Set when PubChem had no name for this exact structure and the
   * name shown instead came from the local fallback service (see
   * io/iupacFallback.ts) — never set unless that service's own OPSIN
   * round-trip confirmed the name actually matches the structure, so
   * this means "different source," not "less certain." Absent (not
   * `false`) whenever PubChem itself supplied the name — same
   * omit-when-inapplicable convention as `stereoOmitted` above. */
  localFallback?: boolean;
}

/**
 * Resolves the IUPAC name for a fragment of `molecule` (the atoms in
 * `ids`), with the same behaviors both call sites (the manual
 * IupacNameButton and the auto-updating live panel) need to agree on:
 *
 *  - PubChem is tried first, since it's authoritative and already
 *    covers the vast majority of structures people actually draw;
 *  - if the exact stereoisomer doesn't resolve, retry once with
 *    stereochemistry stripped, flagging the result as `stereoOmitted`
 *    (see IupacNameButton's original doc comment for why this is worth
 *    doing rather than surfacing a dead end);
 *  - if PubChem still has nothing — which happens for structures that
 *    simply aren't already indexed as a PubChem Compound, not because
 *    anything is wrong with the drawing (see io/iupacFallback.ts's doc
 *    comment for why) — fall back to the optional local naming
 *    service, if it's running, flagging the result as `localFallback`;
 *  - when `language` is "es", attach a best-effort Spanish
 *    transliteration alongside the authoritative English name.
 *
 * Throws PubChemError (or a generic Error) on failure — callers decide
 * how to present that. When the local fallback is unavailable or also
 * can't produce a verified name, this throws PubChem's own error
 * exactly as it did before the fallback existed — nothing changes for
 * anyone who hasn't set up that optional companion service.
 */
export async function lookupIupacName(molecule: Molecule, ids: string[], language: Lang): Promise<IupacLookupResult> {
  const fragment = extractFragment(molecule, ids);
  const smiles = exportSmiles(fragment);

  const withSpanish = (english: string, extra: Partial<IupacLookupResult> = {}): IupacLookupResult => ({
    english,
    spanish: language === "es" ? approximateSpanishIupacName(english) : undefined,
    ...extra,
  });

  try {
    const english = await fetchIupacName(smiles);
    return withSpanish(english);
  } catch (err) {
    const isUnresolved = err instanceof PubChemError && (err.code === "NOT_FOUND" || err.code === "NO_STRUCTURE");
    const hadStereo = /[@/\\]/.test(smiles);

    if (isUnresolved && hadStereo) {
      const flatSmiles = exportSmiles(fragment, { includeStereo: false });
      try {
        const english = await fetchIupacName(flatSmiles);
        return withSpanish(english, { stereoOmitted: true });
      } catch (flatErr) {
        const local = await tryLocalFallback(smiles, flatSmiles);
        if (local) return withSpanish(local.name, { localFallback: true, stereoOmitted: local.usedFlat || undefined });
        throw flatErr;
      }
    }

    if (isUnresolved) {
      const local = await tryLocalFallback(smiles);
      if (local) return withSpanish(local.name, { localFallback: true });
    }

    throw err;
  }
}

/**
 * Tries the local fallback service against `smiles`, and — if that
 * fails and a flattened alternative is given — once more against
 * `flatSmiles`. Returns null (never throws) when neither attempt
 * produces a verified name, including when the service simply isn't
 * running, so callers can treat "no local fallback available" as a
 * plain fall-through rather than an error to handle.
 */
async function tryLocalFallback(
  smiles: string,
  flatSmiles?: string,
): Promise<{ name: string; usedFlat: boolean } | null> {
  try {
    const result = await fetchLocalIupacName(smiles);
    return { name: result.name, usedFlat: false };
  } catch {
    if (!flatSmiles) return null;
    try {
      const result = await fetchLocalIupacName(flatSmiles);
      return { name: result.name, usedFlat: true };
    } catch {
      return null;
    }
  }
}

/**
 * Renders whatever lookupIupacName can throw (a PubChemError, or some
 * other Error) into user-facing text. Shared between every UI surface
 * that calls lookupIupacName — IupacNameButton's dropdown and
 * ContextMenu's "Get IUPAC name" shortcut, at least — so the wording,
 * and which error code maps to which message, only has to be
 * maintained in one place rather than re-duplicated per call site.
 */
export function iupacErrorMessage(err: unknown, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (err instanceof PubChemError) {
    switch (err.code) {
      case "EMPTY_QUERY": return t("iupac.errorEmpty");
      case "NOT_FOUND":
      case "NO_STRUCTURE": return t("iupac.errorNotFound");
      case "NETWORK": return t("search.errorNetwork");
      case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
    }
  }
  return err instanceof Error ? err.message : "Lookup failed";
}
