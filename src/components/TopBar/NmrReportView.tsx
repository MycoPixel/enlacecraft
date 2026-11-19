import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import type { Molecule } from "../../types/chemistry";
import { useT } from "../../i18n/useT";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { translateNmrWarning } from "../../io/nmrWarnings";
import type { NmrIsomerResult } from "../../io/nmrPredict";
import { buildAtomLabels } from "../../io/nmrPredict";
import { totalHydrogenCount } from "../../model/valence";
import { NmrSpectrumView } from "./NmrSpectrumView";
import { NmrStructureDiagram } from "./NmrStructureDiagram";
import {
  diagramBoxSize,
  diagramExtent,
  filterForReportDiagram,
  heavyAtomOrder,
  diagramSourceFragment,
} from "../../io/nmrReportDiagram";
import type { AtomShifts } from "./nmrReportTypes";

/**
 * Full-screen, read-only view showing predicted NMR shifts labeled
 * directly on the structure — separate from the canvas (which stays
 * editable and shouldn't get temporary prediction labels baked into
 * it) and separate from NmrPredictionButton's compact dropdown list
 * (too small a space to also show a diagram).
 *
 * Atom identification: `atomOrder[i]` is the atom id that ended up at
 * RDKit atom-index i when the exported SMILES was parsed (see
 * exportSmilesWithAtomOrder in io/smiles.ts) — that's what lets each
 * prediction's atomIndex be resolved back to an actual atom in
 * `fragment` here, rather than shown as a meaningless bare number.
 * Display labels (e.g. "C3") use a fresh 1-based position in that same
 * order, per element, purely for a short, readable, stable label — not
 * IUPAC numbering.
 */
export function NmrReportView({
  open,
  onClose,
  fragment,
  atomOrder,
  results,
  warnings,
  selectedIsomer,
  onSelectIsomer,
}: {
  open: boolean;
  onClose: () => void;
  fragment: Molecule;
  atomOrder: string[];
  /** One entry normally, more than one when the source molecule had
   * unassigned ring stereocenters - see NmrPredictResult.results in
   * io/nmrPredict.ts. */
  results: NmrIsomerResult[];
  /**
   * Caveats the prediction service returned alongside the shifts (unusual
   * elements, unassigned ring stereochemistry, and so on) - the same strings
   * the compact dropdown shows. Passed in rather than re-fetched so the two
   * views can't disagree, and so a caveat can't be lost by opening this:
   * these are exactly the "treat this result with suspicion" notes, and the
   * full-screen view is where someone is most likely be reading a shift
   * value off the spectrum and acting on it.
   */
  warnings: string[];
  selectedIsomer: number;
  onSelectIsomer: (index: number) => void;
}) {
  const t = useT();
  // Which atom's coupling detail is expanded in the table, if any. One at a
  // time: expanding several would reflow the whole table and make it harder to
  // line a row up with its peak.
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  // Keyed by the row's own `key` (see the rows memo below), not by atom id:
  // a grouped row spans several equivalent atoms, so there is no single
  // atomId to hang the toggle off.
  const toggleDetail = (rowKey: string) =>
    setExpandedDetail((prev) => (prev === rowKey ? null : rowKey));
  // The prediction service emits warnings as fixed English strings; the
  // translator maps the known ones to localized text and passes anything
  // unmatched through unchanged (see nmrWarnings.ts for why that's the
  // chosen fallback). Same call the compact dropdown makes, so both views
  // render identical wording.
  const language = useMoleculeStore((s) => s.language);
  const current = results[selectedIsomer] ?? results[0];
  const predictions = current?.predictions ?? [];
  const predictionsH1 = current?.predictionsH1 ?? [];

  // Which shift badges are drawn on the structure. The table below
  // always shows both columns regardless of this - it's just the
  // on-structure labels that can get crowded on a busy molecule, so
  // this lets the user thin them out to whichever one they're
  // currently reading off.
  const [activeTab, setActiveTab] = useState<"structure" | "spectrum">("structure");
  const [visibleShifts, setVisibleShifts] = useState<"both" | "c13" | "h1" | "none">("both");
  const showC = visibleShifts === "both" || visibleShifts === "c13";
  const showH = visibleShifts === "both" || visibleShifts === "h1";

  // Whether hydrogens are drawn on the structure diagram. This is what answers
  // "where are the hydrogens?", and it decides one thing: whether the proton
  // signal is drawn on the hydrogen or on the carbon it hangs off.
  //
  //  - ON: each hydrogen is drawn as its own vertex carrying the 1H signal it
  //    produced, and its carbon drops that badge - one signal in one place, so
  //    a carbon can't appear to have a proton shift of its own. Hydrogens are
  //    laid out for display even when the structure is skeletal, so this works
  //    on the structure people normally draw.
  //  - OFF: the hydrogens are collapsed into a count on the carbon's label
  //    ("C1" -> "C1H3"), and the carbon carries the 1H badge, because that is
  //    then the only place the signal can be shown.
  //
  // Defaults to OFF so the default diagram stays as compact as it was. The
  // button reads "H" to match the canvas's equivalent control.
  const [showExplicitHydrogens, setShowExplicitHydrogens] = useState(false);

  // Pixel box for the Structure tab's diagram.
  //
  // This tab gives the drawing a whole column to itself, so it can afford far
  // more room than the overlay on the Spectrum tab - which is the point: the
  // diagram is what ties the table's numbers to positions on the molecule, and
  // on a large structure the old fixed height shrank the atom labels until
  // they were smaller than the table text beside them. diagramBoxSize grows
  // the box with the drawing instead.
  //
  // The scale ceiling is higher here (3x rather than the overlay's 1.5x)
  // because a small molecule should fill the column it has; the overlay has to
  // stay modest or it buries the peaks it is annotating. The width stays under
  // the grid column so the drawing can never spill over the table beside it.
  const structureBoxSize = useMemo(() => {
    // Same molecule the diagram draws, so the box fits what is on screen.
    const drawn = diagramSourceFragment(fragment, showExplicitHydrogens);
    const atoms = Object.values(filterForReportDiagram(drawn, showExplicitHydrogens).atoms);
    return diagramBoxSize(diagramExtent(atoms), 560, 760, 3);
  }, [fragment, showExplicitHydrogens]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Per-element running counter, in atomOrder's traversal order, so
  // labels read like "C1, C2, C3..." / "O1, O2..." - shared with
  // NmrPredictionButton's compact list so the same atom shows the
  // same label in both places. Built from the FULL order, so drawn
  // hydrogens get their own "H1, H2..." numbering.
  const labelOf = useMemo(() => buildAtomLabels(fragment, atomOrder), [atomOrder, fragment]);

  // Predictions are indexed by the backend's heavy-atom numbering, which is a
  // different list from atomOrder whenever the structure carries explicit
  // hydrogens - see heavyAtomOrder for why, and for what goes wrong without it.
  const predictionOrder = useMemo(() => heavyAtomOrder(fragment, atomOrder), [atomOrder, fragment]);

  const shiftsByAtom = useMemo(() => {
    const map = new Map<string, AtomShifts>();
    for (const p of predictions) {
      const atomId = predictionOrder[p.atomIndex];
      if (!atomId) continue;
      const entry = map.get(atomId) ?? {};
      entry.c13 = p.predictedShiftPpm;
      entry.equivalenceGroup = p.equivalenceGroup;
      map.set(atomId, entry);
    }
    for (const p of predictionsH1) {
      const atomId = predictionOrder[p.atomIndex];
      if (!atomId) continue;
      const entry = map.get(atomId) ?? {};
      entry.h1 = {
        shift: p.predictedShiftPpm,
        numHs: p.numHs,
        multiplicity: p.multiplicity,
        multiplicityDetail: p.multiplicityDetail,
      };
      entry.equivalenceGroup = p.equivalenceGroup;
      entry.implausible = totalHydrogenCount(fragment, atomId) <= 0;
      map.set(atomId, entry);
    }
    return map;
  }, [predictions, predictionsH1, predictionOrder, fragment]);

  if (!open) return null;

  const rows = [...labelOf.entries()]
    .map(([atomId, label]) => ({ atomId, label, shifts: shiftsByAtom.get(atomId) }))
    .filter((r) => r.shifts?.c13 !== undefined || r.shifts?.h1 !== undefined);

  // Combine rows for constitutionally equivalent atoms (e.g. a
  // tert-butyl group's 3 methyl carbons) into one table row, the way
  // a real NMR report would ("C5, C6, C7 — 0.90 ppm (s), 9H") rather
  // than one line per atom. Atoms without an equivalence_group (only
  // happens if a row somehow has neither c13 nor h1 - filtered out
  // above already) fall back to their own atomId as a unique key.
  const groupedRows = (() => {
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.shifts?.equivalenceGroup !== undefined ? `g${r.shifts.equivalenceGroup}` : `atom-${r.atomId}`;
      const arr = byGroup.get(key);
      if (arr) arr.push(r);
      else byGroup.set(key, [r]);
    }
    return [...byGroup.values()].map((members) => ({
      key: members[0].atomId,
      label: members.map((m) => m.label).join(", "),
      shifts: members[0].shifts,
      totalHs: members.reduce((sum, m) => sum + (m.shifts?.h1?.numHs ?? 0), 0),
      implausible: members.some((m) => m.shifts?.implausible),
    }));
  })();

  return createPortal(
    <div
      className="nmr-report-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="nmr-report-dialog" role="dialog" aria-modal="true" aria-label={t("nmr.reportTitle")}>
        <div className="nmr-report-dialog__header">
          <h2>{t("nmr.reportTitle")}</h2>
          <button type="button" className="nmr-report-dialog__close" onClick={onClose} aria-label={t("nmr.reportClose")}>
            <X size={18} />
          </button>
        </div>

        <p className="nmr-report-dialog__hint">{t("nmr.reportHint")}</p>

        {warnings.length > 0 && (
          <div className="nmr-report-warnings">
            {warnings.map((warning, i) => (
              <p key={i} className="nmr-result__warning">
                {translateNmrWarning(warning, language)}
              </p>
            ))}
          </div>
        )}

        <div className="nmr-report-main-tabs" role="tablist">
          {(["structure", "spectrum"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={
                "nmr-report-main-tabs__btn" + (activeTab === tab ? " nmr-report-main-tabs__btn--active" : "")
              }
              onClick={() => setActiveTab(tab)}
            >
              {t(tab === "structure" ? "nmr.tabStructure" : "nmr.tabSpectrum")}
            </button>
          ))}
        </div>

        {results.length > 1 && (
          <>
            <div className="nmr-result__isomer-tabs" role="tablist">
              {results.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={selectedIsomer === i}
                  className={
                    "nmr-result__isomer-tab" +
                    (selectedIsomer === i ? " nmr-result__isomer-tab--active" : "")
                  }
                  onClick={() => onSelectIsomer(i)}
                >
                  {t("nmr.isomerTab", { index: String(i + 1) })}
                </button>
              ))}
            </div>
            {current && (
              <p className="nmr-result__isomer-smiles">
                {t("nmr.isomerSmiles", { smiles: current.smiles })}
              </p>
            )}
          </>
        )}

        {activeTab === "structure" && (
        <div className="nmr-report-shift-toggle" role="group" aria-label={t("nmr.reportShiftToggleLabel")}>
          {(["both", "c13", "h1", "none"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={
                "nmr-report-shift-toggle__btn" +
                (visibleShifts === option ? " nmr-report-shift-toggle__btn--active" : "")
              }
              aria-pressed={visibleShifts === option}
              onClick={() => setVisibleShifts(option)}
            >
              {t(
                option === "both"
                  ? "nmr.reportShiftBoth"
                  : option === "c13"
                    ? "nmr.reportShiftC"
                    : option === "h1"
                      ? "nmr.reportShiftH"
                      : "nmr.reportShiftNone"
              )}
            </button>
          ))}
          {/*
            Separate from the shift toggle above: that chooses which isotope's
            numbers to annotate with, this chooses whether H atoms are drawn at
            all. Same control type for familiarity, different question.
          */}
          <button
            type="button"
            title={t("nmr.reportShowHydrogensTitle")}
            // aria-label, not just title: the button's own text is "H", and
            // text content wins over title when a screen reader computes the
            // accessible name — so without this the descriptive wording is
            // sighted-mouse-only and the control announces as a bare "H".
            aria-label={t("nmr.reportShowHydrogensTitle")}
            className={
              "nmr-report-shift-toggle__btn" +
              (showExplicitHydrogens ? " nmr-report-shift-toggle__btn--active" : "")
            }
            aria-pressed={showExplicitHydrogens}
            onClick={() => setShowExplicitHydrogens((v) => !v)}
          >
            {t("nmr.reportShowHydrogens")}
          </button>
        </div>
        )}

        {activeTab === "structure" && (
        <div className="nmr-report-dialog__body">
          <NmrStructureDiagram
            fragment={fragment}
            labelOf={labelOf}
            shiftsByAtom={shiftsByAtom}
            showC={showC}
            showH={showH}
            showExplicitHydrogens={showExplicitHydrogens}
            boxSize={structureBoxSize}
          />

          <table className="nmr-report-table">
            <thead>
              <tr>
                <th>{t("nmr.reportColAtom")}</th>
                <th>{t("nmr.section13c")}</th>
                <th>{t("nmr.section1h")}</th>
                <th>{t("nmr.reportColMultiplicity")}</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((r) => (
                <tr key={r.key} className={r.implausible ? "nmr-report-table__row--implausible" : undefined}>
                  <td>{r.label}</td>
                  <td>{r.shifts?.c13 !== undefined ? `${r.shifts.c13.toFixed(2)} ppm` : "\u2014"}</td>
                  <td>
                    {r.shifts?.h1 !== undefined ? `${r.shifts.h1.shift.toFixed(2)} ppm (${r.totalHs}H)` : "\u2014"}
                    {r.implausible && (
                      <span className="nmr-report-table__warning" title={t("nmr.implausibleHint")}>
                        <AlertTriangle size={12} />
                      </span>
                    )}
                  </td>
                  {/*
                    The J-value detail (t, d, dd, coupling magnitudes) is the
                    only place the tier-2 real coupling estimates surface, and it
                    was reachable only through a title= tooltip - which needs a
                    hover, so it was unreachable by touch entirely.

                    Now shown inline beneath the multiplicity label, and the
                    whole cell is also a button that toggles it. Inline is the
                    important part: on a touch device a title tooltip never
                    appears at all, so the detail has to be visible in the table
                    rather than discovered.
                  */}
                  <td className={r.shifts?.h1?.multiplicityDetail ? "nmr-report-table__mult-cell--hasdetail" : undefined}>
                    {r.shifts?.h1?.multiplicityDetail ? (
                      <button
                        type="button"
                        className="nmr-report-table__mult-toggle"
                        onClick={() => toggleDetail(r.key)}
                        aria-expanded={expandedDetail === r.key}
                      >
                        <span>{r.shifts.h1.multiplicity}</span>
                        {expandedDetail === r.key && (
                          <span className="nmr-report-table__mult-detail">
                            {r.shifts.h1.multiplicityDetail}
                          </span>
                        )}
                      </button>
                    ) : (
                      r.shifts?.h1?.multiplicity || "\u2014"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {activeTab === "spectrum" && current && (
          <NmrSpectrumView
            predictions={current.predictions}
            predictionsH1={current.predictionsH1}
            atomOrder={atomOrder}
            atomLabels={labelOf}
            fragment={fragment}
          />
        )}

        <p className="nmr-report-dialog__caveat">
          {t("nmr.caveat")} {t("nmr.credit")}
        </p>
      </div>
    </div>,
    document.body
  );
}
