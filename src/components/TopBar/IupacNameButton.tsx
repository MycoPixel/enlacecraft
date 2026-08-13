import { useMemo, useState } from "react";
import { Tag, Loader2 } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { exportSmiles } from "../../io/smiles";
import { extractFragment } from "../../model/molecule";
import { fetchIupacName, PubChemError } from "../../io/pubchem";
import { approximateSpanishIupacName } from "../../io/compoundTranslate";
import { hasIgnoredValenceAtoms } from "../../model/valence";
import { useT } from "../../i18n/useT";

type NameState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "result"; english: string; spanish?: string; stereoOmitted?: boolean };

/**
 * The naming counterpart to StructureSearchButton and CompoundSearch: those
 * two go name/structure -> structure (fetch or find a compound), this one
 * goes structure -> name, via the same PubChem PUG REST service (see
 * fetchIupacName's doc comment in io/pubchem.ts).
 *
 * PubChem only names things in English. When the app's UI language is
 * Spanish, this also shows a best-effort Spanish transliteration
 * underneath via approximateSpanishIupacName — see that function's doc
 * comment in io/compoundTranslate.ts for exactly what it can and can't be
 * trusted for. The English name is always shown too, and is the one to
 * treat as authoritative.
 */
export function IupacNameButton() {
  const t = useT();
  const language = useMoleculeStore((s) => s.language);
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const [state, setState] = useState<NameState | null>(null);

  const hasContent = Object.keys(molecule.atoms).length > 0;
  // PubChem's naming service parses a real SMILES with normal valence
  // assumptions baked in — an atom that was deliberately drawn "wrong"
  // (see Atom.ignoreValence's doc comment) doesn't have a well-defined
  // name to look up, so this is disabled outright rather than risking a
  // silently-wrong or nonsensical result. Checked against exactly the
  // same atoms runLookup below would actually send (the selection, or —
  // with nothing selected — the whole canvas): a flagged atom sitting in
  // some other, unselected structure on the same canvas shouldn't block
  // naming a normal one you've selected next to it.
  const blockedByIgnoredValence = useMemo(() => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    return hasIgnoredValenceAtoms(extractFragment(molecule, ids));
  }, [molecule, selected]);
  const canRun = hasContent && !blockedByIgnoredValence;

  const messageForError = (err: unknown): string => {
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
  };

  const runLookup = async () => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    if (ids.length === 0) return;
    setState({ phase: "loading" });
    const fragment = extractFragment(molecule, ids);
    const smiles = exportSmiles(fragment);
    try {
      const english = await fetchIupacName(smiles);
      const spanish = language === "es" ? approximateSpanishIupacName(english) : undefined;
      setState({ phase: "result", english, spanish });
    } catch (err) {
      // PubChem's naming service can fail on a *specific* stereoisomer
      // that isn't itself indexed, even when the flat skeleton (and even
      // other stereoisomers of the same skeleton) resolve fine. Rather
      // than surface that as a dead end, retry once with stereochemistry
      // stripped and show that name with a caveat — a less precise result
      // beats none. Only worth trying when the SMILES actually had stereo
      // markers to strip, and only on the "couldn't resolve this" errors
      // (not network/HTTP failures, which stripping stereo won't fix).
      const isUnresolved = err instanceof PubChemError && (err.code === "NOT_FOUND" || err.code === "NO_STRUCTURE");
      const hadStereo = /[@/\\]/.test(smiles);
      if (isUnresolved && hadStereo) {
        try {
          const flatSmiles = exportSmiles(fragment, { includeStereo: false });
          const english = await fetchIupacName(flatSmiles);
          const spanish = language === "es" ? approximateSpanishIupacName(english) : undefined;
          setState({ phase: "result", english, spanish, stereoOmitted: true });
          return;
        } catch {
          // Fall through to surfacing the original error below.
        }
      }
      setState({ phase: "error", message: messageForError(err) });
    }
  };

  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard API");
      await navigator.clipboard.writeText(text);
      setStatus(t("iupac.copied"));
    } catch {
      // Copying is a convenience on top of just reading the name, not core
      // to the feature — a failure here shouldn't surface as an error.
    }
  };

  return (
    <ToolDropdown
      title={!hasContent ? t("iupac.buttonDisabled") : blockedByIgnoredValence ? t("iupac.blockedByIgnoredValence") : t("iupac.button")}
      active={false}
      onOpen={canRun ? runLookup : undefined}
      renderContent={() => (
        <div className="iupac-menu">
          {!hasContent && <p className="align-menu__hint">{t("iupac.needStructure")}</p>}
          {hasContent && blockedByIgnoredValence && <p className="align-menu__hint">{t("iupac.blockedByIgnoredValence")}</p>}
          {canRun && state?.phase === "loading" && (
            <div className="structure-search-menu__loading">
              <Loader2 size={14} className="compound-search__spinner" />
              {t("iupac.loading")}
            </div>
          )}
          {canRun && state?.phase === "error" && <p className="align-menu__hint">{state.message}</p>}
          {canRun && state?.phase === "result" && (
            <div className="iupac-result">
              <button type="button" className="iupac-result__name" onClick={() => copy(state.english)} title={t("iupac.copy")}>
                {state.english}
              </button>
              {state.stereoOmitted && <p className="iupac-result__caveat">{t("iupac.stereoOmitted")}</p>}
              {state.spanish && (
                <>
                  <div className="iupac-result__label">{t("iupac.spanishLabel")}</div>
                  <button
                    type="button"
                    className="iupac-result__name iupac-result__name--es"
                    onClick={() => copy(state.spanish!)}
                    title={t("iupac.copy")}
                  >
                    {state.spanish}
                  </button>
                  <p className="iupac-result__caveat">{t("iupac.spanishCaveat")}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    >
      <Tag size={16} />
    </ToolDropdown>
  );
}
