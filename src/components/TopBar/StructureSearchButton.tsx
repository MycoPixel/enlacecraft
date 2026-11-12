import { useState } from "react";
import { ScanSearch, Loader2 } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolDropdown, type ToolDropdownTriggerProps } from "../Sidebar/ToolDropdown";
import { exportSmiles } from "../../io/smiles";
import { extractFragment } from "../../model/molecule";
import { searchCompoundsBySubstructure, fetchCompoundByCid, PubChemError, type StructureSearchResult } from "../../io/pubchem";
import { useT } from "../../i18n/useT";

type SearchState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "results"; results: StructureSearchResult[] };

/**
 * The reverse of CompoundSearch: instead of typing a name/SMILES to fetch
 * one exact structure, this searches PubChem for real compounds that
 * *contain* whatever's currently drawn (or just selected, if there's a
 * selection) as a substructure. Lives in the top bar next to CompoundSearch
 * since it's the same "look this up in PubChem" idea, just structure-first
 * instead of text-first.
 */
export function StructureSearchButton({ variant, label, menuId }: ToolDropdownTriggerProps = {}) {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const importCompound = useMoleculeStore((s) => s.importCompound);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const [state, setState] = useState<SearchState | null>(null);
  const [insertingCid, setInsertingCid] = useState<number | null>(null);

  const hasContent = Object.keys(molecule.atoms).length > 0;

  const messageForError = (err: unknown): string => {
    if (err instanceof PubChemError) {
      switch (err.code) {
        case "EMPTY_QUERY": return t("structureSearch.errorEmpty");
        case "NOT_FOUND": return t("structureSearch.errorNotFound");
        case "NETWORK": return t("search.errorNetwork");
        case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
        case "NO_STRUCTURE": return t("structureSearch.errorNotFound");
      }
    }
    return err instanceof Error ? err.message : "Search failed";
  };

  const runSearch = async () => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    if (ids.length === 0) return;
    setState({ phase: "loading" });
    try {
      const smiles = exportSmiles(extractFragment(molecule, ids));
      const results = await searchCompoundsBySubstructure(smiles);
      setState({ phase: "results", results });
    } catch (err) {
      setState({ phase: "error", message: messageForError(err) });
    }
  };

  const pickResult = async (result: StructureSearchResult, close: () => void) => {
    setInsertingCid(result.cid);
    try {
      const full = await fetchCompoundByCid(result.cid);
      importCompound(full.molecule);
      const label = full.name ?? String(result.cid);
      setStatus(full.formula ? t("search.statusLoaded", { name: label, formula: full.formula }) : t("search.statusLoadedPlain", { name: label }));
      close();
      setState(null);
    } catch (err) {
      setState({ phase: "error", message: messageForError(err) });
    } finally {
      setInsertingCid(null);
    }
  };

  return (
    <ToolDropdown
      title={hasContent ? t("structureSearch.button") : t("structureSearch.buttonDisabled")}
      active={false}
      variant={variant}
      label={label}
      menuId={menuId}
      onOpen={hasContent ? runSearch : undefined}
      renderContent={(close) => (
        <div className="structure-search-menu">
          {!hasContent && <p className="align-menu__hint">{t("structureSearch.needStructure")}</p>}
          {hasContent && state?.phase === "loading" && (
            <div className="structure-search-menu__loading">
              <Loader2 size={14} className="compound-search__spinner" />
              {t("structureSearch.searching")}
            </div>
          )}
          {hasContent && state?.phase === "error" && <p className="align-menu__hint">{state.message}</p>}
          {hasContent && state?.phase === "results" && (
            <div className="structure-list">
              {state.results.map((r) => (
                <button
                  key={r.cid}
                  className="structure-list__item"
                  disabled={insertingCid !== null}
                  onClick={() => pickResult(r, close)}
                >
                  {insertingCid === r.cid ? t("structureSearch.inserting") : `${r.name ?? `CID ${r.cid}`}${r.formula ? ` \u2014 ${r.formula}` : ""}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    >
      <ScanSearch size={16} />
    </ToolDropdown>
  );
}
