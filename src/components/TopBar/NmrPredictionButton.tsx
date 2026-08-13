import { useState, useMemo } from "react";
import { Activity, Loader2, Expand } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolDropdown } from "../Sidebar/ToolDropdown";
import { exportSmilesWithAtomOrder } from "../../io/smiles";
import { extractFragment } from "../../model/molecule";
import { embedMolecule3DWithMethod, Embed3DError } from "../../io/embed3d";
import { XtbRefineError } from "../../io/xtbRefine";
import {
  predictNmrSpectrum,
  NmrPredictError,
  buildAtomLabels,
  groupByEquivalence,
  equivalenceGroupLabel,
  type NmrIsomerResult,
} from "../../io/nmrPredict";
import { hasIgnoredValenceAtoms } from "../../model/valence";
import { useT } from "../../i18n/useT";
import { NmrReportView } from "./NmrReportView";
import type { Molecule } from "../../types/chemistry";

// Whether to send the backend a real 3D structure (see
// embedMolecule3DWithMethod, io/embed3d.ts) instead of letting it
// re-embed its own MMFF conformer blind from the bare SMILES. "fast"
// is today's original behavior, unchanged; "xtb" trades real wait
// time (a network round trip to structure3d_server, potentially many
// seconds - see xtbRefine.ts's own generous timeout) for
// quantum-refined geometry, which is genuinely more accurate input to
// the shift-prediction model than the backend's own plain MMFF embed.
// Deliberately just these two tiers rather than also exposing
// "mmff94" as a third middle option - a locally-embedded-but-not-xtb-
// refined structure doesn't have a clear accuracy edge over what the
// backend already computes for itself by default, so a 3rd choice
// there would mostly just be confusing without a clear reason to pick
// it. (An "exactly match what's in the 3D panel right now" option
// would be a reasonable follow-up if that specific need comes up.)
type StructureQuality = "fast" | "xtb";

type PredictState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "result";
      smiles: string;
      fragment: Molecule;
      atomOrder: string[];
      results: NmrIsomerResult[];
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
  const [structureQuality, setStructureQuality] = useState<StructureQuality>("fast");
  // Which entry of state.results is currently shown - almost always
  // just [0], but can have multiple entries when the input had
  // unassigned ring stereocenters (see NmrPredictResult.results).
  // Reset to 0 on every new prediction, below.
  const [selectedIsomer, setSelectedIsomer] = useState(0);

  const atomLabels = useMemo(() => {
    if (state?.phase !== "result") return new Map<string, string>();
    return buildAtomLabels(state.fragment, state.atomOrder);
  }, [state]);

  const current: NmrIsomerResult | undefined =
    state?.phase === "result" ? state.results[selectedIsomer] ?? state.results[0] : undefined;

  const hasContent = Object.keys(molecule.atoms).length > 0;
  // Same reasoning as IupacNameButton's identical check: an atom with
  // valence checking deliberately turned off doesn't correspond to a
  // real molecule the shift-prediction model (or the MMFF94 embedding
  // step feeding it) has any meaningful input for. Checked against
  // exactly the same atoms runPrediction below would actually send (the
  // selection, or — with nothing selected — the whole canvas).
  const blockedByIgnoredValence = useMemo(() => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    return hasIgnoredValenceAtoms(extractFragment(molecule, ids));
  }, [molecule, selected]);
  const canRun = hasContent && !blockedByIgnoredValence;

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
    if (err instanceof Embed3DError || err instanceof XtbRefineError) {
      // Reuses the message text directly rather than a translated
      // key - these are the same error classes Molecule3DView already
      // surfaces, but this button doesn't have that view's
      // per-code translation table wired up; the Error subclasses'
      // own messages are already reasonably descriptive on their own
      // (see embed3d.ts/xtbRefine.ts for what each code means).
      return err.message || "Could not generate a 3D structure";
    }
    return err instanceof Error ? err.message : "Prediction failed";
  };

  const runPrediction = async (quality: StructureQuality = structureQuality) => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    if (ids.length === 0) return;
    setStructureQuality(quality);
    setState({ phase: "loading" });
    try {
      const fragment = extractFragment(molecule, ids);
      const { smiles, atomOrder: smilesAtomOrder } = exportSmilesWithAtomOrder(fragment);

      let molfile: string | undefined;
      // Object.keys(fragment.atoms) is the SAME order embed3d.ts's
      // exportMol uses internally to build the molfile it sends off
      // for embedding/refinement - so as long as OpenChemLib's H-
      // saturation step preserves heavy-atom order and only appends
      // new H atoms after (the standard convention this project
      // already relies on elsewhere for RDKit), this is exactly the
      // order the backend's molfile-parsing path uses for its
      // response's atomIndex values too. No separate export step
      // needed - just read the same fragment object's own key order.
      let atomOrder = smilesAtomOrder;

      if (quality === "xtb") {
        const embedResult = await embedMolecule3DWithMethod(fragment, "xtb");
        molfile = embedResult.molfile;
        atomOrder = Object.keys(fragment.atoms);
      }

      const result = await predictNmrSpectrum(smiles, molfile);
      setSelectedIsomer(0);
      setState({
        phase: "result",
        smiles: result.smiles,
        fragment,
        atomOrder,
        results: result.results,
        warnings: result.warnings,
      });
    } catch (err) {
      setState({ phase: "error", message: messageForError(err) });
    }
  };

  return (
    <ToolDropdown
      title={!hasContent ? t("nmr.buttonDisabled") : blockedByIgnoredValence ? t("nmr.blockedByIgnoredValence") : t("nmr.button")}
      active={false}
      onOpen={canRun ? runPrediction : undefined}
      renderContent={(close) => (
        <div className="nmr-menu">
          {!hasContent && <p className="align-menu__hint">{t("nmr.needStructure")}</p>}
          {hasContent && blockedByIgnoredValence && <p className="align-menu__hint">{t("nmr.blockedByIgnoredValence")}</p>}

          {canRun && (
            <div className="nmr-result__isomer-tabs" role="tablist" aria-label={t("nmr.structureQuality")}>
              <button
                type="button"
                role="tab"
                aria-selected={structureQuality === "fast"}
                className={
                  "nmr-result__isomer-tab" +
                  (structureQuality === "fast" ? " nmr-result__isomer-tab--active" : "")
                }
                onClick={() => runPrediction("fast")}
              >
                {t("nmr.qualityFast")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={structureQuality === "xtb"}
                className={
                  "nmr-result__isomer-tab" +
                  (structureQuality === "xtb" ? " nmr-result__isomer-tab--active" : "")
                }
                onClick={() => runPrediction("xtb")}
                title={t("nmr.qualityXtbHint")}
              >
                {t("nmr.qualityXtb")}
              </button>
            </div>
          )}

          {canRun && state?.phase === "loading" && (
            <div className="structure-search-menu__loading">
              <Loader2 size={14} className="compound-search__spinner" />
              {t("nmr.loading")}
            </div>
          )}

          {canRun && state?.phase === "error" && (
            <p className="align-menu__hint">{state.message}</p>
          )}

          {canRun && state?.phase === "result" && current && (
            <div className="nmr-result">
              {state.warnings.map((warning, i) => (
                <p key={i} className="nmr-result__warning">
                  {warning}
                </p>
              ))}

              {state.results.length > 1 && (
                <>
                  <div className="nmr-result__isomer-tabs" role="tablist">
                    {state.results.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        role="tab"
                        aria-selected={selectedIsomer === i}
                        className={
                          "nmr-result__isomer-tab" +
                          (selectedIsomer === i ? " nmr-result__isomer-tab--active" : "")
                        }
                        onClick={() => setSelectedIsomer(i)}
                      >
                        {t("nmr.isomerTab", { index: String(i + 1) })}
                      </button>
                    ))}
                  </div>
                  <p className="nmr-result__isomer-smiles">
                    {t("nmr.isomerSmiles", { smiles: current.smiles })}
                  </p>
                </>
              )}

              <p className="nmr-result__section">{t("nmr.section13c")}</p>
              {current.predictions.length === 0 ? (
                <p className="align-menu__hint">{t("nmr.noCarbons")}</p>
              ) : (
                <ul className="nmr-result__list">
                  {groupByEquivalence(current.predictions)
                    .sort((a, b) => b.representative.predictedShiftPpm - a.representative.predictedShiftPpm)
                    .map((group) => (
                      <li key={group.representative.equivalenceGroup} className="nmr-result__row">
                        <span className="nmr-result__atom">
                          {equivalenceGroupLabel(group.members, state.atomOrder, atomLabels) ||
                            t("nmr.atomLabel", { index: String(group.representative.atomIndex) })}
                        </span>
                        <span className="nmr-result__shift">
                          {group.representative.predictedShiftPpm.toFixed(2)} ppm
                        </span>
                      </li>
                    ))}
                </ul>
              )}

              <p className="nmr-result__section">{t("nmr.section1h")}</p>
              {current.predictionsH1.length === 0 ? (
                <p className="align-menu__hint">{t("nmr.noProtons")}</p>
              ) : (
                <ul className="nmr-result__list">
                  {groupByEquivalence(current.predictionsH1)
                    .sort((a, b) => b.representative.predictedShiftPpm - a.representative.predictedShiftPpm)
                    .map((group) => {
                      const totalHs = group.members.reduce((sum, m) => sum + m.numHs, 0);
                      const rep = group.representative;
                      return (
                        <li key={rep.equivalenceGroup} className="nmr-result__row">
                          <span className="nmr-result__atom">
                            {t("nmr.atomLabelH", {
                              label:
                                equivalenceGroupLabel(group.members, state.atomOrder, atomLabels) ||
                                String(rep.atomIndex),
                              count: String(totalHs),
                            })}
                          </span>
                          <span className="nmr-result__shift">
                            {rep.predictedShiftPpm.toFixed(2)} ppm
                            {rep.multiplicity && (
                              <span
                                className="nmr-result__multiplicity"
                                title={rep.multiplicityDetail || undefined}
                              >
                                {" "}
                                ({rep.multiplicity})
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              )}

              <button
                type="button"
                className="nmr-result__view-report"
                onClick={() => {
                  // Close the dropdown itself, not just open the report -
                  // otherwise the dropdown (z-index 1000) stays mounted on
                  // top of the report overlay and hides it.
                  setReportOpen(true);
                  close();
                }}
              >
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
          results={state.results}
          selectedIsomer={selectedIsomer}
          onSelectIsomer={setSelectedIsomer}
        />
      )}
    </ToolDropdown>
  );
}
