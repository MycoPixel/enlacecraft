import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Braces } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { fetchCompoundByName, fetchCompoundBySmiles, fetchCompoundSuggestions, PubChemError } from "../../io/pubchem";
import { useT } from "../../i18n/useT";

const SUGGESTION_DEBOUNCE_MS = 250;

export function CompoundSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"name" | "smiles">("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const importCompound = useMoleculeStore((s) => s.importCompound);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const t = useT();
  const errorTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suggestionDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suggestionRequestId = useRef(0);
  const blurCloseTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => {
    clearTimeout(errorTimeout.current);
    clearTimeout(suggestionDebounce.current);
    clearTimeout(blurCloseTimeout.current);
  }, []);

  // Live suggestions as you type (name mode only — a SMILES string isn't
  // looked up against PubChem's name dictionary). Debounced, and guarded
  // against out-of-order responses (a slow earlier request landing after a
  // newer one) via a simple request-id check. Never surfaces an error —
  // see fetchCompoundSuggestions's own doc comment for why.
  useEffect(() => {
    clearTimeout(suggestionDebounce.current);
    const q = query.trim();
    if (mode !== "name" || !q) {
      setSuggestions([]);
      return;
    }
    const requestId = ++suggestionRequestId.current;
    suggestionDebounce.current = setTimeout(async () => {
      const results = await fetchCompoundSuggestions(q);
      if (suggestionRequestId.current !== requestId) return; // a newer request already landed
      setSuggestions(results);
      setActiveIndex(-1);
      setSuggestionsOpen(true);
    }, SUGGESTION_DEBOUNCE_MS);
  }, [query, mode]);

  const showError = (message: string) => {
    setError(message);
    clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setError(null), 5000);
  };

  const messageForError = (err: unknown, forQuery: string): string => {
    if (err instanceof PubChemError) {
      switch (err.code) {
        case "EMPTY_QUERY": return t(mode === "smiles" ? "search.errorEmptyQuerySmiles" : "search.errorEmptyQuery");
        case "NOT_FOUND": return t(mode === "smiles" ? "search.errorNotFoundSmiles" : "search.errorNotFound", { name: String(err.params.name ?? forQuery) });
        case "NETWORK": return t("search.errorNetwork");
        case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
        case "NO_STRUCTURE": return t(mode === "smiles" ? "search.errorNoStructureSmiles" : "search.errorNoStructure", { name: String(err.params.name ?? forQuery) });
      }
    }
    return err instanceof Error ? err.message : "Lookup failed";
  };

  const runSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q || loading) return;
    setSuggestionsOpen(false);
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
      setSuggestions([]);
    } catch (err) {
      showError(messageForError(err, q));
    } finally {
      setLoading(false);
    }
  };

  const selectSuggestion = (name: string) => {
    setQuery(name);
    setSuggestions([]);
    setSuggestionsOpen(false);
    runSearch(name);
  };

  const showDropdown = mode === "name" && suggestionsOpen && suggestions.length > 0 && !loading;

  return (
    <form
      className="compound-search"
      onSubmit={(e) => {
        e.preventDefault();
        if (showDropdown && activeIndex >= 0) {
          selectSuggestion(suggestions[activeIndex]);
        } else {
          runSearch();
        }
      }}
    >
      <button
        type="button"
        className="compound-search__mode-toggle"
        onClick={() => { setMode((m) => (m === "name" ? "smiles" : "name")); setError(null); setSuggestions([]); }}
        title={t(mode === "name" ? "search.modeSwitchToSmiles" : "search.modeSwitchToName")}
      >
        {mode === "name" ? <Search size={14} /> : <Braces size={14} />}
      </button>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); if (error) setError(null); }}
        onFocus={() => { if (suggestions.length > 0) setSuggestionsOpen(true); }}
        onBlur={() => {
          // Delay so a click on a suggestion (which fires mousedown/click
          // right around this same moment) still registers before the
          // dropdown disappears.
          blurCloseTimeout.current = setTimeout(() => setSuggestionsOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
          } else if (e.key === "Escape") {
            setSuggestionsOpen(false);
          }
        }}
        placeholder={t(mode === "smiles" ? "search.placeholderSmiles" : "search.placeholder")}
        aria-label={t(mode === "smiles" ? "search.ariaLabelSmiles" : "search.ariaLabel")}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
      />
      {loading && <Loader2 size={14} className="compound-search__spinner" />}
      {error && <div className="compound-search__error">{error}</div>}
      {showDropdown && (
        <ul className="compound-search__suggestions" role="listbox">
          {suggestions.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={`compound-search__suggestion ${i === activeIndex ? "compound-search__suggestion--active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(name); }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
