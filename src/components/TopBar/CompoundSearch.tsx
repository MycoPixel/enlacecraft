import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import {
  detectIdentifierKind,
  fetchCompoundByIdentifier,
  fetchCompoundSuggestions,
  PubChemError,
  type CompoundIdentifierKind,
} from "../../io/pubchem";
import { fetchNameToStructureLocal } from "../../io/iupacFallback";
import { useT } from "../../i18n/useT";

const SUGGESTION_DEBOUNCE_MS = 250;

const MODE_OPTIONS: { value: CompoundIdentifierKind; labelKey: string }[] = [
  { value: "auto", labelKey: "search.modeAuto" },
  { value: "name", labelKey: "search.modeName" },
  { value: "smiles", labelKey: "search.modeSmiles" },
  { value: "inchi", labelKey: "search.modeInchi" },
  { value: "inchikey", labelKey: "search.modeInchikey" },
  { value: "cid", labelKey: "search.modeCid" },
  { value: "cas", labelKey: "search.modeCas" },
  { value: "formula", labelKey: "search.modeFormula" },
];

/**
 * Compound lookup across PubChem's identifier namespaces.
 *
 * Auto-detect is the default because the input is usually pasted, and the
 * shape of an InChIKey/CAS/CID/SMILES value is unambiguous enough to route
 * without asking. The explicit selector remains available for the ambiguous
 * cases — a formula such as CO2 and a SMILES such as CCO are impossible to
 * distinguish from a drawing tool's point of view without a convention, and
 * a person may also want to force a name lookup for something that looks
 * like a formula.
 */
export function CompoundSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<CompoundIdentifierKind>("auto");
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

  const effectiveKind = (value: string): CompoundIdentifierKind =>
    mode === "auto" ? detectIdentifierKind(value) : mode;

  const modeLabel = (value: CompoundIdentifierKind): string => {
    const option = MODE_OPTIONS.find((o) => o.value === value);
    return t(option?.labelKey ?? "search.modeAuto");
  };

  // Live suggestions as you type. Only name searches have a dictionary to
  // suggest from; SMILES/InChI/CID/etc. are exact identifiers. In auto mode
  // the current value is classified first, so pasting an InChIKey doesn't
  // fire a pointless name-autocomplete request on every keystroke.
  // Debounced, and guarded against out-of-order responses (a slow earlier
  // request landing after a newer one) via a simple request-id check. Never
  // surfaces an error — see fetchCompoundSuggestions's own doc comment.
  useEffect(() => {
    clearTimeout(suggestionDebounce.current);
    const q = query.trim();
    if (effectiveKind(q) !== "name" || !q) {
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
    // effectiveKind is derived from mode; listing mode and query is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode]);

  const showError = (message: string) => {
    setError(message);
    clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setError(null), 5000);
  };

  const messageForError = (err: unknown, forQuery: string): string => {
    if (err instanceof PubChemError) {
      const kind = effectiveKind(forQuery);
      if (kind === "name") {
        switch (err.code) {
          case "EMPTY_QUERY": return t("search.errorEmptyQuery");
          case "NOT_FOUND": return t("search.errorNotFound", { name: String(err.params.name ?? forQuery) });
          case "NETWORK": return t("search.errorNetwork");
          case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
          case "NO_STRUCTURE": return t("search.errorNoStructure", { name: String(err.params.name ?? forQuery) });
        }
      } else if (kind === "smiles") {
        switch (err.code) {
          case "EMPTY_QUERY": return t("search.errorEmptyQuerySmiles");
          case "NOT_FOUND": return t("search.errorNotFoundSmiles", { name: String(err.params.name ?? forQuery) });
          case "NETWORK": return t("search.errorNetwork");
          case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
          case "NO_STRUCTURE": return t("search.errorNoStructureSmiles");
        }
      } else {
        switch (err.code) {
          case "EMPTY_QUERY": return t("search.errorEmptyQueryAny");
          case "NOT_FOUND": return t("search.errorNotFoundAny", { name: String(err.params.name ?? forQuery), kind: modeLabel(kind) });
          case "NETWORK": return t("search.errorNetwork");
          case "HTTP": return t("search.errorHttp", { status: String(err.params.status) });
          case "NO_STRUCTURE": return t("search.errorNoStructureAny", { name: String(err.params.name ?? forQuery) });
        }
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
      const result = await fetchCompoundByIdentifier(q, mode);
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
      // Name → structure has a second, local chance before giving up:
      // when PubChem has no compound for a *name* (NOT_FOUND only —
      // network/HTTP failures aren't evidence the name is unresolvable),
      // the optional OPSIN companion service may still parse it into a
      // structure (see io/iupacFallback.ts). Availability is decided by
      // just attempting the call and treating null as "unavailable" —
      // the same no-probe policy iupacLookup uses for this service — so
      // nothing changes when it isn't running and the original error
      // below stays exactly as it was.
      const isNameNotFound =
        err instanceof PubChemError && err.code === "NOT_FOUND" && effectiveKind(q) === "name";
      if (isNameNotFound) {
        const local = await fetchNameToStructureLocal(q);
        if (local) {
          // Same insertion path as a PubChem hit, with a status that
          // says where the structure actually came from.
          importCompound(local);
          setStatus(t("search.statusResolvedLocally", { name: q }));
          setQuery("");
          setSuggestions([]);
          return;
        }
      }
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

  const isNameSearch = effectiveKind(query.trim()) === "name";
  const showDropdown = isNameSearch && suggestionsOpen && suggestions.length > 0 && !loading;
  const placeholder =
    mode === "auto"
      ? t("search.placeholderAuto")
      : mode === "name"
        ? t("search.placeholder")
        : mode === "smiles"
          ? t("search.placeholderSmiles")
          : t("search.placeholderExplicit", { kind: modeLabel(mode) });
  const ariaLabel =
    mode === "auto"
      ? t("search.ariaLabelAuto")
      : mode === "name"
        ? t("search.ariaLabel")
        : mode === "smiles"
          ? t("search.ariaLabelSmiles")
          : t("search.ariaLabelExplicit", { kind: modeLabel(mode) });

  return (
    <div className="compound-search-wrapper">
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
      <Search size={14} className="compound-search__mode-icon" aria-hidden="true" />
      <select
        className="compound-search__mode-select"
        value={mode}
        onChange={(e) => {
          setMode(e.target.value as CompoundIdentifierKind);
          setError(null);
          setSuggestions([]);
        }}
        title={t("search.modeLabel")}
        aria-label={t("search.modeLabel")}
      >
        {MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
        ))}
      </select>
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
        placeholder={placeholder}
        aria-label={ariaLabel}
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
    <div className="compound-search__privacy">{t("search.privacyNotice")}</div>
    </div>
  );
}
