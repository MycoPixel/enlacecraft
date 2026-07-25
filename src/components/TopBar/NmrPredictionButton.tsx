import { useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { exportSmiles } from "../../io/smiles";
import { extractFragment } from "../../model/molecule";
import { predictNmrSpectrum, NmrPredictError, type ShiftPrediction } from "../../io/nmrPredict";
import { useT } from "../../i18n/useT";

type PredictState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "result"; smiles: string; predictions: ShiftPrediction[]; warnings: string[] };

/**
 * Predicts 13C NMR shifts for the drawn structure (or selection), via
 * the separate NMRGraph model API (io/nmrPredict.ts) — a different
 * backend from PubChem, so this can fail in ways IupacNameButton's
 * PubChem calls can't (most notably: the API just isn't running).
 * Structurally this mirrors IupacNameButton.tsx closely (same
 * loading/error/result dropdown shape, same "export current selection
 * or whole molecule to SMILES first" approach) since it's the same
 * shape of feature: structure -> external service -> read-only result.
 *
 * IMPORTANT LIMITATION, worth understanding before extending this:
 * each returned atomIndex refers to the position of that atom in the
 * RDKit parsing of the exported SMILES string - NOT this app's own
 * atom ids. Those two orderings are usually different (SMILES export
 * here writes atoms via a DFS spanning tree - see writeFragment in
 * io/smiles.ts - which very rarely matches this app's internal
 * insertion-order atom ids). That's why results are shown as a plain
 * list rather than labels drawn next to each atom on the canvas: doing
 * that safely needs a real index -> atom id mapping returned alongside
 * each prediction (e.g. by threading atom ids through as SMILES atom
 * map numbers, or walking the same DFS order client-side to reconstruct
 * the correspondence), which doesn't exist yet. Labeling the wrong atom
 * with the wrong shift would be worse than not labeling at all, so this
 * intentionally stays a list until that mapping is built.
 */
export function NmrPredictionButton() {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const [state, setState] = useState<PredictState | null>(null);

  const hasContent = Object.keys(molecule.atoms).length > 0;

  const messageForError = (err: unknown): string => {
    if (err instanceof NmrPredictError) {
      switch (err.code) {
        case "EMPTY_QUERY":
          return t("nmr.errorEmpty");
        case "INVALID_SMILES":
          return t("nmr.errorInvalid");
        case "NETWORK":
          return t("nmr.errorNetwork");
        case "HTTP":
          return t("nmr.errorHttp", { status: String(err.params.status) });
      }
    }
    return err instanceof Error ? err.message : "Prediction failed";
  };

  const runPrediction = async () => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    if (ids.length === 0) return;
    setState({ phase: "loading" });
    try {
      const smiles = exportSmiles(extractFragment(molecule, ids));
      const result = await predictNmrSpectrum(smiles);
      setState({
        phase: "result",
        smiles: result.smiles,
        predictions: result.predictions,
        warnings: result.warnings,
      });
    } catch (err) {
      setState({ phase: "error", message: messageForError(err) });
    }
  };

  return (
    <ToolDropdown
      title={hasContent ? t("nmr.button") : t("nmr.buttonDisabled")}
      active={false}
      onOpen={hasContent ? runPrediction : undefined}
      renderContent={() => (
        <div className="nmr-menu">
          {!hasContent && <p className="align-menu__hint">{t("nmr.needStructure")}</p>}

          {hasContent && state?.phase === "loading" && (
            <div className="structure-search-menu__loading">
              <Loader2 size={14} className="compound-search__spinner" />
              {t("nmr.loading")}
            </div>
          )}

          {hasContent && state?.phase === "error" && (
            <p className="align-menu__hint">{state.message}</p>
          )}

          {hasContent && state?.phase === "result" && (
            <div className="nmr-result">
              {state.warnings.map((warning, i) => (
                <p key={i} className="nmr-result__warning">
                  {warning}
                </p>
              ))}

              {state.predictions.length === 0 ? (
                <p className="align-menu__hint">{t("nmr.noCarbons")}</p>
              ) : (
                <ul className="nmr-result__list">
                  {[...state.predictions]
                    .sort((a, b) => b.predictedShiftPpm - a.predictedShiftPpm)
                    .map((p) => (
                      <li key={p.atomIndex} className="nmr-result__row">
                        <span className="nmr-result__atom">
                          {t("nmr.atomLabel", { index: String(p.atomIndex) })}
                        </span>
                        <span className="nmr-result__shift">{p.predictedShiftPpm.toFixed(2)} ppm</span>
                      </li>
                    ))}
                </ul>
              )}

              <p className="nmr-result__caveat">{t("nmr.caveat")}</p>
            </div>
          )}
        </div>
      )}
    >
      <Activity size={16} />
    </ToolDropdown>
  );
}
