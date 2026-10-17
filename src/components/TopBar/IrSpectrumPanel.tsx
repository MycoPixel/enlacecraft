import { Expand, Info, Loader2, TriangleAlert } from "lucide-react";
import { useT } from "../../i18n/useT";
import type { IrMode } from "../../io/irSpectrum";
import type { IrState } from "./useIrSpectrum";
import { bandsAt, formatBand, type IrBandHit } from "./irPlot";
import { IrSpectrumPlot } from "./IrSpectrumPlot";

/**
 * The compact dropdown under the top-bar button: enough of the spectrum to
 * recognise it, with a route to the full view.
 *
 * Deliberately not where the peak list lives in full — this is a ~360px
 * toolbar dropdown, which comfortably holds the plot and the strongest dozen
 * bands but nothing more. `onExpand` opens IrReportView for every mode, the
 * shaded-range legend, and a peak list sorted by wavenumber rather than by
 * intensity.
 */
export function IrSpectrumPanel({
  state,
  run,
  bands,
  onExpand,
}: {
  state: IrState;
  run: () => void;
  /** Diagnostic ranges this structure actually has, shared with the report. */
  bands: IrBandHit[];
  onExpand: () => void;
}) {
  const t = useT();

  return (
    <div className="ir-panel">
      <button
        type="button"
        className="ir-panel__run"
        onClick={run}
        disabled={state.phase === "loading"}
      >
        {state.phase === "loading" ? (
          <>
            <Loader2 size={13} className="ir-panel__spin" /> {t("ir.calculating")}
          </>
        ) : state.phase === "idle" ? (
          t("ir.calculate")
        ) : (
          t("ir.recalculate")
        )}
      </button>

      {state.phase === "error" && <p className="ir-panel__error">{state.message}</p>}

      {state.phase === "done" && (
        <>
          {state.imaginaryCount > 0 && (
            <p className="ir-panel__warn">
              <TriangleAlert size={12} /> {t("ir.warnImaginary", { count: state.imaginaryCount })}
            </p>
          )}

          <IrSpectrumPlot modes={state.modes} bands={bands} />

          <p className="ir-panel__note">
            <Info size={12} /> {t("ir.gasPhaseNote")}
          </p>

          <PeakTable modes={state.modes} bands={bands} limit={12} />

          <button type="button" className="ir-panel__expand" onClick={onExpand}>
            <Expand size={13} />
            {t("ir.viewReport")}
          </button>
        </>
      )}

      {state.phase === "idle" && (
        <p className="ir-panel__note">
          <Info size={12} /> {t("ir.intro")}
        </p>
      )}
    </div>
  );
}

/**
 * The peak list. `limit` is deliberately NOT defaulted here: an omitted limit
 * has to mean "every mode", because the report relies on that, and a default
 * parameter would quietly hand it the panel's cut of the strongest dozen
 * instead. The panel passes its limit explicitly.
 */
export function PeakTable({
  modes,
  bands,
  limit,
  detailed = false,
}: {
  modes: IrMode[];
  bands: IrBandHit[];
  /** Keeps only the strongest N, which is the useful cut for a dropdown. */
  limit?: number;
  detailed?: boolean;
}) {
  const t = useT();
  const strongest = modes.reduce((max, m) => Math.max(max, m.intensityKmMol), 0) || 1;
  const ordered = limit
    ? [...modes].sort((a, b) => b.intensityKmMol - a.intensityKmMol).slice(0, limit)
    : [...modes].sort((a, b) => a.wavenumber - b.wavenumber);

  return (
    <div className={`ir-table${detailed ? " ir-table--detailed" : ""}`}>
      <div className="ir-table__head">
        <span>{t("ir.colWavenumber")}</span>
        <span>{t("ir.colIntensity")}</span>
        <span>{t("ir.colAssignment")}</span>
      </div>
      {ordered.map((mode) => {
        const hits = bandsAt(bands, mode.wavenumber);
        return (
          <div key={mode.wavenumber} className="ir-table__row">
            <span className="ir-table__wn">{Math.round(mode.wavenumber)}</span>
            <span className="ir-table__intensity">
              <span className="ir-table__bar" style={{ width: `${(mode.intensityKmMol / strongest) * 100}%` }} />
            </span>
            <span className="ir-table__assignment">
              {hits.length ? hits.map((hit) => formatBand(hit, t)).join(", ") : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}