import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Activity, Loader2, Expand, AlertTriangle } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolDropdown, type ToolDropdownTriggerProps } from "../Sidebar/ToolDropdown";
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
import { translateNmrWarning } from "../../io/nmrWarnings";
import { heavyAtomOrder } from "../../io/nmrReportDiagram";
import { hasIgnoredValenceAtoms, hasOrganometallicContent, totalHydrogenCount } from "../../model/valence";
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
export function NmrPredictionButton({ variant, label, menuId }: ToolDropdownTriggerProps = {}) {
  const t = useT();
  const language = useMoleculeStore((s) => s.language);
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const [state, setState] = useState<PredictState | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [structureQuality, setStructureQuality] = useState<StructureQuality>("fast");
  /**
   * Whether the NMR backend is actually up, as reported by the Electron main
   * process (which owns spawning it).
   *
   * The prediction API lives on localhost:8000 and only exists in a packaged
   * desktop build - there is no web equivalent and no client-side fallback.
   * Before this, a web user who clicked the button got "Couldn't reach the
   * NMR prediction server - is it running?", which asks them to start a
   * service they have no way to start. The bridge already exposed exactly the
   * answer (preload.cjs's own comment noted it was "not consumed by the UI
   * yet"), so this reads it and says something true instead.
   *
   * null = not checked yet, which is the only honest value on a web build
   * where window.electron doesn't exist at all.
   */
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  // Bumped every time the input structure or selection changes, and captured
  // by each in-flight runPrediction so a prediction that resolves *after* an
  // edit can't install its now-stale result. See the invalidation effect below.
  const inputGenerationRef = useRef(0);
  // Counts PREDICTION REQUESTS, which inputGenerationRef does not: that one
  // counts edits to the input. Two requests for the same unedited molecule
  // share a generation, so only this can tell them apart. See runPrediction.
  const requestSeqRef = useRef(0);
  // Which entry of state.results is currently shown - almost always
  // just [0], but can have multiple entries when the input had
  // unassigned ring stereocenters (see NmrPredictResult.results).
  // Reset to 0 on every new prediction, below.
  const [selectedIsomer, setSelectedIsomer] = useState(0);

  const atomLabels = useMemo(() => {
    if (state?.phase !== "result") return new Map<string, string>();
    return buildAtomLabels(state.fragment, state.atomOrder);
  }, [state]);

  // The order the backend's atomIndex refers to, which drops any explicit
  // hydrogens - see heavyAtomOrder. Kept apart from `atomLabels` above because
  // labels want the full order (hydrogens get their own "H1, H2..." numbering)
  // while prediction indices must not.
  const predictionOrder = useMemo(() => {
    if (state?.phase !== "result") return [];
    return heavyAtomOrder(state.fragment, state.atomOrder);
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
  // Same reasoning, but for dative/haptic bonds — see
  // hasOrganometallicContent's doc comment.
  const blockedByOrganometallic = useMemo(() => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    return hasOrganometallicContent(extractFragment(molecule, ids));
  }, [molecule, selected]);
  const canRun = hasContent && !blockedByIgnoredValence && !blockedByOrganometallic;

  /**
   * Discard a prediction the moment its input structure changes.
   *
   * A result here is a function of one specific fragment - the selection, or
   * the whole canvas when nothing is selected - and nothing else. Editing a
   * bond or picking a different selection makes that fragment a different
   * molecule, but the previous result stayed on screen regardless: the
   * dropdown kept its shift list and the full-screen report kept rendering,
   * both showing numbers for a structure that was no longer there. That is
   * actively misleading rather than merely stale, since the obvious use of
   * this panel is comparing a prediction against an experimental spectrum.
   *
   * Invalidating on the `molecule` and `selected` identities is the right
   * granularity: the store replaces both on every real edit, and neither
   * changes on hover, so the result survives incidental pointer movement.
   *
   * Bumping the generation counter here is also what makes the guards in
   * runPrediction work - an edit mid-flight has to invalidate the *pending*
   * request, not just the state that's already displayed.
   */
  useEffect(() => {
    inputGenerationRef.current++;
    setState(null);
    setReportOpen(false);
  }, [molecule, selected]);

  /**
   * Ask the main process whether the NMR backend came up.
   *
   * Electron-only: on a web deploy window.electron is undefined, and the
   * feature genuinely can't work there, so serverAvailable stays null and the
   * UI says so rather than pretending a probe failed.
   */
  const probeServer = useCallback(async () => {
    if (!window.electron?.getNmrServerStatus) {
      setServerAvailable(null);
      return;
    }
    try {
      const status = await window.electron.getNmrServerStatus();
      setServerAvailable(status.state === "ready");
    } catch {
      // A failed probe isn't proof the server is down, so don't claim it is.
      setServerAvailable(null);
    }
  }, []);

  // Probe once on mount, so the button's tooltip can be honest before the
  // user has clicked anything and waited for a failure.
  useEffect(() => {
    void probeServer();
  }, [probeServer]);

  // Re-probe after every attempt: the backend may have been started
  // externally since the last click, and a failure shouldn't be permanent.
  useEffect(() => {
    if (!state) return;
    if (state.phase === "loading") return;
    void probeServer();
  }, [state?.phase, probeServer]);

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
    if (err instanceof XtbRefineError) {
      // XtbRefineError's message IS its code string - the constructor is
      // super(code) with no sentence - so returning err.message rendered
      // literally "NETWORK", "TIMEOUT" or "HTTP" in the error banner. The
      // comment here used to claim these messages were "already reasonably
      // descriptive", which is true of Embed3DError (it takes a real sentence)
      // and false of this one.
      //
      // Molecule3DView already maps these per code (view3d.errorXtb*), and it
      // matters here for a specific reason: structure3d is a DIFFERENT backend
      // from the NMR service on 8000. Collapsing both failures to the same bare
      // token meant a user with structure3d down had no way to tell which
      // service was missing.
      switch (err.code) {
        case "NETWORK": return t("nmr.errorXtbNetwork");
        case "TIMEOUT": return t("nmr.errorXtbTimeout");
        case "HTTP": return t("nmr.errorXtbHttp", { status: String(err.params.status) });
      }
    }
    if (err instanceof Embed3DError) {
      // Unlike XtbRefineError, this one is constructed with a real sentence, so
      // its message is genuinely user-facing. Nothing to translate.
      return err.message || t("nmr.errorEmbedGeneric");
    }
    return err instanceof Error ? err.message : "Prediction failed";
  };

  const runPrediction = async (quality: StructureQuality = structureQuality) => {
    const ids = selected.size > 0 ? [...selected] : Object.keys(molecule.atoms);
    if (ids.length === 0) return;
    const generation = inputGenerationRef.current;
    // A second, independent sequence number.
    //
    // inputGenerationRef only bumps when the MOLECULE changes, so two requests
    // for the same input share a generation and neither guard below can tell
    // them apart - whichever await resolves last wins, regardless of which the
    // user asked for last. Clicking "XTB" and then "Fast" (the xtb path allows
    // 120s, so impatience is realistic) could therefore display MMFF shifts
    // under an xTB tab label, or vice versa: a 0.3-0.5 ppm difference on a value
    // the user then measures off the plot, with the tab disagreeing with the
    // numbers underneath it.
    //
    // This counts REQUESTS rather than edits, which is exactly the axis the
    // generation counter does not cover.
    const requestId = ++requestSeqRef.current;
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
      // The structure may have been edited while this was in flight (and the
      // xtb path can take many seconds). If so, drop the result rather than
      // showing shifts for a molecule that is no longer on the canvas.
      if (generation !== inputGenerationRef.current) return;
      // A newer request was started while this one was in flight; its result
      // (or its error) is the one the user is waiting for.
      if (requestId !== requestSeqRef.current) return;
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
      if (generation !== inputGenerationRef.current) return;
      if (requestId !== requestSeqRef.current) return;
      setState({ phase: "error", message: messageForError(err) });
    }
  };

  return (
    <ToolDropdown
      title={
        !hasContent
          ? t("nmr.buttonDisabled")
          : blockedByIgnoredValence
            ? t("nmr.blockedByIgnoredValence")
            : blockedByOrganometallic
              ? t("nmr.blockedByOrganometallic")
              : serverAvailable === false
                ? t("nmr.serverUnavailable")
                : t("nmr.button")
      }
      active={false}
      variant={variant}
      label={label}
      menuId={menuId}
      onOpen={canRun ? runPrediction : undefined}
      renderContent={(close) => (
        <div className="nmr-menu">
          {!hasContent && <p className="align-menu__hint">{t("nmr.needStructure")}</p>}
          {hasContent && blockedByIgnoredValence && <p className="align-menu__hint">{t("nmr.blockedByIgnoredValence")}</p>}
          {hasContent && !blockedByIgnoredValence && blockedByOrganometallic && <p className="align-menu__hint">{t("nmr.blockedByOrganometallic")}</p>}

          {canRun && serverAvailable === false && (
            <p className="align-menu__hint">{t("nmr.serverUnavailableDetail")}</p>
          )}

          {canRun && serverAvailable !== false && (
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
                  {translateNmrWarning(warning, language)}
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
                          {equivalenceGroupLabel(group.members, predictionOrder, atomLabels) ||
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
                      // A reliable sign of an atom-index mismatch from
                      // the prediction service (see totalHydrogenCount's
                      // doc comment) rather than a real chemistry
                      // result - the atom this shift landed on simply
                      // can't have that many (or any) hydrogens as
                      // actually drawn.
                      const implausible = group.members.some((m) => {
                        const atomId = predictionOrder[m.atomIndex];
                        return !atomId || totalHydrogenCount(state.fragment, atomId) <= 0;
                      });
                      return (
                        <li key={rep.equivalenceGroup} className="nmr-result__row">
                          <span className="nmr-result__atom">
                            {t("nmr.atomLabelH", {
                              label:
                                equivalenceGroupLabel(group.members, predictionOrder, atomLabels) ||
                                String(rep.atomIndex),
                              count: String(totalHs),
                            })}
                            {implausible && (
                              <span className="nmr-result__implausible-icon" title={t("nmr.implausibleHint")}>
                                <AlertTriangle size={12} />
                              </span>
                            )}
                          </span>
                          <span className="nmr-result__shift">
                            {rep.predictedShiftPpm.toFixed(2)} ppm
                            {rep.multiplicity && (
                              // Detail kept as a title here on purpose: this is
                              // the compact dropdown, with rows 28px tall and
                              // ten of them on screen. Inlining the J values
                              // would roughly double its height and push the
                              // rest of the list out of view. The full report's
                              // table shows them properly; here the tooltip is
                              // an extra for pointer users, not the only way -
                              // which was the real defect before.
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
          warnings={state.warnings}
          selectedIsomer={selectedIsomer}
          onSelectIsomer={setSelectedIsomer}
        />
      )}
    </ToolDropdown>
  );
}
