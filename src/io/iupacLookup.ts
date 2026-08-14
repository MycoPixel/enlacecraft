import type { Molecule } from "../types/chemistry";
import type { Lang } from "../i18n/translations";
import { extractFragment } from "../model/molecule";
import { exportSmiles } from "./smiles";
import { fetchIupacName, PubChemError } from "./pubchem";
import { approximateSpanishIupacName } from "./compoundTranslate";

export interface IupacLookupResult {
  english: string;
  spanish?: string;
  stereoOmitted?: boolean;
}

/**
 * Resolves the IUPAC name for a fragment of `molecule` (the atoms in
 * `ids`) against PubChem, with the same two behaviors both call sites
 * (the manual IupacNameButton and the auto-updating live panel) need to
 * agree on:
 *
 *  - if the exact stereoisomer doesn't resolve, retry once with
 *    stereochemistry stripped, flagging the result as `stereoOmitted`
 *    (see IupacNameButton's original doc comment for why this is worth
 *    doing rather than surfacing a dead end);
 *  - when `language` is "es", attach a best-effort Spanish transliteration
 *    alongside the authoritative English name.
 *
 * Throws PubChemError (or a generic Error) on failure — callers decide
 * how to present that.
 */
export async function lookupIupacName(molecule: Molecule, ids: string[], language: Lang): Promise<IupacLookupResult> {
  const fragment = extractFragment(molecule, ids);
  const smiles = exportSmiles(fragment);
  try {
    const english = await fetchIupacName(smiles);
    const spanish = language === "es" ? approximateSpanishIupacName(english) : undefined;
    return { english, spanish };
  } catch (err) {
    const isUnresolved = err instanceof PubChemError && (err.code === "NOT_FOUND" || err.code === "NO_STRUCTURE");
    const hadStereo = /[@/\\]/.test(smiles);
    if (isUnresolved && hadStereo) {
      const flatSmiles = exportSmiles(fragment, { includeStereo: false });
      const english = await fetchIupacName(flatSmiles);
      const spanish = language === "es" ? approximateSpanishIupacName(english) : undefined;
      return { english, spanish, stereoOmitted: true };
    }
    throw err;
  }
}
