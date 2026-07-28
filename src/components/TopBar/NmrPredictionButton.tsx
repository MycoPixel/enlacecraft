import { useState, useMemo } from "react";
import { Activity, Loader2, Expand } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { exportSmilesWithAtomOrder } from "../../io/smiles";
import { extractFragment } from "../../model/molecule";
import { predictNmrSpectrum, NmrPredictError, buildAtomLabels, type ShiftPrediction, type H1ShiftPrediction } from "../../io/nmrPredict";
import { useT } from "../../i18n/useT";
import { NmrReportView } from "./NmrReportView";
import type { Molecule } from "../../types/chemistry";

type PredictState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "result";
      smiles: string;
      fragment: Molecule;
      atomOrder: string[];
      predictions: ShiftPrediction[];
      predictionsH1: H1ShiftPrediction[];
      warnings: string[];
    };

/**
 * Predicts 13C and 1H NMR shifts for the drawn structure (or
 * selection), via the separate NMRGraph model API (io/nmrPredict.ts) —
 * a different backend from PubChem, so this can fail in ways
 * IupacNameButton's PubChem calls can't (most notably: the API just
 * isn't running). Structurally this mirrors IupacNameButton.tsx
 * closely (same loading/error/result dropdown shape, same "export
 * current selection or whole molecule to SMILES first" approach)
 * since it's the same shape of feature: structure -> external
 * service -> read-only result.
 *
 * Atom identification: each returned atomIndex is the position of
 * that atom in the RDKit parsing of the exported SMILES string - NOT
 * this app's own atom ids, and the two orderings are usually
 * different (SMILES export writes atoms via a DFS spanning tree - see
 * writeFragment in io/smiles.ts). exportSmilesWithAtomOrder returns
 * that DFS order alongside the SMILES, which is exactly the order
 * RDKit assigns atom indices when it parses the string with no
 * canonicalization in between - so atomOrder[atomIndex] recovers the
 * real atom id. That mapping is what NmrReportView uses to draw each
 * result next to the actual atom instead of an opaque index.
 */
export function NmrPredictionButton() {
  const t = useT();
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const [state, setState] = useState<PredictState | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const atomLabels = useMemo(() => {
    if (state?.phase !== "result") return new Map<string, string>();
    return buildAtomLabels(state.fragment, state.atomOrder);
  }, [state]);

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
      const fragment = extractFragment(molecule, ids);
      const { smiles, atomOrder } = exportSmilesWithAtomOrder(fragment);
      const result = await predictNmrSpectrum(smiles);
      setState({
        phase: "result",
        smiles: result.smiles,
        fragment,
        atomOrder,
        predictions: result.predictions,
        predictionsH1: result.predictionsH1,
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

              <p className="nmr-result__section">{t("nmr.section13c")}</p>
              {state.predictions.length === 0 ? (
                <p className="align-menu__hint">{t("nmr.noCarbons")}</p>
              ) : (
                <ul className="nmr-result__list">
                  {[...state.predictions]
                    .sort((a, b) => b.predictedShiftPpm - a.predictedShiftPpm)
                    .map((p) => (
                      <li key={p.atomIndex} className="nmr-result__row">
                        <span className="nmr-result__atom">
                          {atomLabels.get(state.atomOrder[p.atomIndex]) ?? t("nmr.atomLabel", { index: String(p.atomIndex) })}
                        </span>
                        <span className="nmr-result__shift">{p.predictedShiftPpm.toFixed(2)} ppm</span>
                      </li>
                    ))}
                </ul>
              )}

              <p className="nmr-result__section">{t("nmr.section1h")}</p>
              {state.predictionsH1.length === 0 ? (
                <p className="align-menu__hint">{t("nmr.noProtons")}</p>
              ) : (
                <ul className="nmr-result__list">
                  {[...state.predictionsH1]
                    .sort((a, b) => b.predictedShiftPpm - a.predictedShiftPpm)
                    .map((p) => (
                      <li key={p.atomIndex} className="nmr-result__row">
                        <span className="nmr-result__atom">
                          {t("nmr.atomLabelH", {
                            label: atomLabels.get(state.atomOrder[p.atomIndex]) ?? String(p.atomIndex),
                            count: String(p.numHs),
                          })}
                        </span>
                        <span className="nmr-result__shift">{p.predictedShiftPpm.toFixed(2)} ppm</span>
                      </li>
                    ))}
                </ul>
              )}

              <button type="button" className="nmr-result__view-report" onClick={() => setReportOpen(true)}>
                <Expand size={13} />
                {t("nmr.viewReport")}
              </button>

              <p className="nmr-result__caveat">{t("nmr.caveat")}</p>
            </div>
          )}
        </div>
      )}
    >
      <Activity size={16} />
      {state?.phase === "result" && (
        <NmrReportView
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          fragment={state.fragment}
          atomOrder={state.atomOrder}
          predictions={state.predictions}
          predictionsH1={state.predictionsH1}
        />
      )}
    </ToolDropdown>
  );
}
