import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Braces } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { fetchCompoundByName, fetchCompoundBySmiles, PubChemError } from "../../io/pubchem";
import { useT } from "../../i18n/useT";

export function CompoundSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"name" | "smiles">("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importCompound = useMoleculeStore((s) => s.importCompound);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const t = useT();
  const errorTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(errorTimeout.current), []);

  const showError = (message: string) => {
    setError(message);
    clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setError(null), 5000);
  };

  const messageForError = (err: unknown): string => {
    if (err instanceof PubChemError) {
      switch (err.code) {
        case "EMPTY_QUERY": return t(mode === "smiles" ? "search.errorEmptyQuerySmiles" : "search.errorEmptyQuery");
        case "NOT_FOUND": return t(mode === "smiles" ? "search.errorNotFoundSmiles" : "search.errorNotFound", { name: String(err.params.name ?? query) });
        case "NETWORK": return t("search.errorNetwork");
        case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
        case "NO_STRUCTURE": return t(mode === "smiles" ? "search.errorNoStructureSmiles" : "search.errorNoStructure", { name: String(err.params.name ?? query) });
      }
    }
    return err instanceof Error ? err.message : "Lookup failed";
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = mode === "smiles" ? await fetchCompoundBySmiles(q) : await fetchCompoundByName(q);
      importCompound(result.molecule);

      const label = result.name ?? result.resolvedName;
      let statusMsg = result.formula
        ? t("search.statusLoaded", { name: label, formula: result.formula })
        : t("search.statusLoadedPlain", { name: label });
      if (result.translatedFrom) {
        statusMsg += ` (${t("search.statusTranslated", { original: result.translatedFrom, english: result.resolvedName })})`;
      }
      setStatus(statusMsg);
      setQuery("");
    } catch (err) {
      showError(messageForError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="compound-search"
      onSubmit={(e) => {
        e.preventDefault();
        runSearch();
      }}
    >
      <button
        type="button"
        className="compound-search__mode-toggle"
        onClick={() => { setMode((m) => (m === "name" ? "smiles" : "name")); setError(null); }}
        title={t(mode === "name" ? "search.modeSwitchToSmiles" : "search.modeSwitchToName")}
      >
        {mode === "name" ? <Search size={14} /> : <Braces size={14} />}
      </button>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); if (error) setError(null); }}
        placeholder={t(mode === "smiles" ? "search.placeholderSmiles" : "search.placeholder")}
        aria-label={t(mode === "smiles" ? "search.ariaLabelSmiles" : "search.ariaLabel")}
        spellCheck={false}
      />
      {loading && <Loader2 size={14} className="compound-search__spinner" />}
      {error && <div className="compound-search__error">{error}</div>}
    </form>
  );
}
