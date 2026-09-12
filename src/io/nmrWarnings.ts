import { translate } from "../i18n/translate";
import type { Lang } from "../i18n/translations";

/**
 * The NMR prediction server (see nmrPredict.ts's doc comment — a separate,
 * vendored service; its source isn't part of this repo) returns warning
 * strings as plain English text with no i18n of its own, and
 * NmrPredictionButton.tsx used to render them verbatim — which is exactly
 * why they stayed in English even with the UI set to Spanish.
 *
 * There are exactly three warnings the server can produce (see its
 * src/api/main.py — NMRGraph-main/src/api/main.py as of the version this
 * was checked against): a fixed one (no carbons), and two with one
 * dynamic part each (the unusual-elements list; the stereoisomer count).
 * Each is matched here by reconstructing its exact template as a regex and
 * capturing the dynamic part, then re-rendered through this app's own
 * translation table (nmr.warning.* in translations.ts) with that part
 * substituted back in.
 *
 * Anything that doesn't match one of these three patterns — the server
 * wording changes in some future version, or a warning gets added — is
 * shown exactly as the server sent it, in English, rather than silently
 * dropped or garbled. That's a deliberate fallback, not a gap to "complete
 * later": there's no way to localize text from a service that doesn't
 * send a language hint, other than recognizing the specific strings it's
 * known to send today.
 */

const NO_CARBON_ATOMS = "No carbon atoms in this molecule - nothing to predict.";

const UNUSUAL_ELEMENTS_RE =
  /^Contains (.+) - rarely seen in training data \(organometallics and unusual elements are a known weak spot\)\. Treat these predictions with extra skepticism\.$/;

const RING_STEREOCHEMISTRY_RE =
  /^This structure has ring stereochemistry that isn't fully specified \(e\.g\. cis\/trans not indicated\) - showing all (\d+) possible stereoisomer\(s\) below instead of one ambiguous averaged result\. Draw the specific stereochemistry instead if you already know which one you want\.$/;

export function translateNmrWarning(warning: string, lang: Lang): string {
  if (warning === NO_CARBON_ATOMS) return translate(lang, "nmr.warning.noCarbon");

  const elementsMatch = UNUSUAL_ELEMENTS_RE.exec(warning);
  if (elementsMatch) return translate(lang, "nmr.warning.unusualElements", { elements: elementsMatch[1] });

  const stereoMatch = RING_STEREOCHEMISTRY_RE.exec(warning);
  if (stereoMatch) return translate(lang, "nmr.warning.ringStereochemistry", { count: stereoMatch[1] });

  return warning;
}
