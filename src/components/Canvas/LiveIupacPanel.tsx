import { Zap, Loader2 } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useAutoIupacName } from "../../hooks/useAutoIupacName";
import { useT } from "../../i18n/useT";

/**
 * The always-visible counterpart to IupacNameButton's click-to-look-up
 * dropdown: docked under the canvas, it shows the name for whatever's
 * selected (or the whole molecule, with nothing selected) and — when the
 * user has opted into auto-naming (off by default; see
 * autoIupacName's doc comment in the store) — keeps it in sync as the
 * structure changes, via useAutoIupacName's debounced lookup.
 */
export function LiveIupacPanel() {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const language = useMoleculeStore((s) => s.language);
  const autoIupacName = useMoleculeStore((s) => s.autoIupacName);
  const toggleAutoIupacName = useMoleculeStore((s) => s.toggleAutoIupacName);
  const setStatus = useMoleculeStore((s) => s.setStatus);

  const state = useAutoIupacName(molecule, [...selected], language, autoIupacName);

  const errorMessage = (code: string, params: Record<string, string | number>): string => {
    switch (code) {
      case "NOT_FOUND":
      case "NO_STRUCTURE":
        return t("iupac.errorNotFound");
      case "NETWORK":
        return t("search.errorNetwork");
      case "HTTP":
        return t("search.errorHttp", { status: String(params.status ?? "") });
      default:
        return t("iupac.errorNotFound");
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
    <div className="live-iupac-panel">
      <button
        type="button"
        className={`live-iupac-panel__toggle ${autoIupacName ? "live-iupac-panel__toggle--active" : ""}`}
        onClick={toggleAutoIupacName}
        title={autoIupacName ? t("iupac.liveToggleOn") : t("iupac.liveToggleOff")}
        aria-pressed={autoIupacName}
      >
        <Zap size={13} />
      </button>

      <div className="live-iupac-panel__content">
        {!autoIupacName && <span className="live-iupac-panel__hint">{t("iupac.liveEmpty")}</span>}
        {autoIupacName && state.phase === "idle" && <span className="live-iupac-panel__hint">{t("iupac.needStructure")}</span>}
        {autoIupacName && state.phase === "pending" && <span className="live-iupac-panel__hint">{t("iupac.livePending")}</span>}
        {autoIupacName && state.phase === "loading" && (
          <span className="live-iupac-panel__hint">
            <Loader2 size={12} className="compound-search__spinner" />
            {t("iupac.loading")}
          </span>
        )}
        {autoIupacName && state.phase === "error" && <span className="live-iupac-panel__hint">{errorMessage(state.code, state.params)}</span>}
        {autoIupacName && state.phase === "result" && (
          <button type="button" className="live-iupac-panel__name" onClick={() => copy(state.english)} title={t("iupac.copy")}>
            {state.english}
            {state.spanish && <span className="live-iupac-panel__name--es"> · {state.spanish}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
