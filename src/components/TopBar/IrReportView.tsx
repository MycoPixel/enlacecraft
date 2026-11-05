import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, TriangleAlert, Info } from "lucide-react";
import type { Molecule } from "../../types/chemistry";
import { useT } from "../../i18n/useT";
import type { IrMode } from "../../io/irSpectrum";
import type { IrBandHit } from "./irPlot";
import { formatBand } from "./irPlot";
import { IrSpectrumPlot } from "./IrSpectrumPlot";
import { IrStructureOverlay } from "./IrStructureOverlay";
import { PeakTable } from "./IrSpectrumPanel";

/**
 * Full-screen, read-only view of a computed IR spectrum — the counterpart to
 * NmrReportView, for the same reasons: the dropdown panel is too small to read
 * a peak off or to list every mode, and the spectrum needs more vertical room
 * than a toolbar dropdown can ever have.
 *
 * Reads the same `modes` the panel is showing rather than re-running the
 * calculation, so the two views can't disagree and opening this costs nothing.
 *
 * The structure is a floating window over the plot rather than a tab, so the
 * molecule and its spectrum can be read together. It is not linked to the peaks
 * the way the NMR report's is — there is no per-peak atom mapping to link to,
 * which is exactly why the peaks here are labelled by diagnostic range instead.
 */
export function IrReportView({
  open,
  onClose,
  molecule,
  modes,
  bands,
  imaginaryCount,
}: {
  open: boolean;
  onClose: () => void;
  molecule: Molecule;
  modes: IrMode[];
  bands: IrBandHit[];
  imaginaryCount: number;
}) {
  const t = useT();
  const plotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const strongest = modes.reduce((max, m) => Math.max(max, m.intensityKmMol), 0) || 1;

  return createPortal(
    <div
      className="ir-report-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ir-report-dialog" role="dialog" aria-modal="true" aria-label={t("ir.reportTitle")}>
        <div className="ir-report-dialog__header">
          <h2>{t("ir.reportTitle")}</h2>
          <button
            type="button"
            className="ir-report-dialog__close"
            onClick={onClose}
            aria-label={t("ir.reportClose")}
          >
            <X size={16} />
          </button>
        </div>

        <p className="ir-report-dialog__hint">{t("ir.reportHint")}</p>

        {imaginaryCount > 0 && (
          <div className="ir-report-warnings">
            <p>
              <TriangleAlert size={13} /> {t("ir.warnImaginary", { count: imaginaryCount })}
            </p>
          </div>
        )}

        <div className="ir-report-dialog__body">
          <div className="ir-report-plot" ref={plotRef}>
            <IrSpectrumPlot modes={modes} bands={bands} width={1100} height={300} detailed zoomable />
            <IrStructureOverlay molecule={molecule} containerRef={plotRef} />
          </div>

          <div className="ir-report-summary">
            <span>
              <strong>{modes.length}</strong> {t("ir.reportModeCount")}
            </span>
            <span>
              {t("ir.reportStrongest")}{" "}
              <strong>
                {Math.round(
                  modes.reduce((best, m) => (m.intensityKmMol > best.intensityKmMol ? m : best), modes[0])
                    .wavenumber,
                )}
              </strong>{" "}
              {t("ir.colWavenumber")} ({Math.round(strongest)} {t("ir.intensityUnit")})
            </span>
          </div>

          <div className="ir-report-columns">
            <section className="ir-report-section">
              <h3>{t("ir.reportBandsTitle")}</h3>
              {bands.length ? (
                <ul className="ir-report-bands">
                  {bands.map(({ band, count }) => (
                    <li key={band.key}>
                      <span className="ir-report-bands__label">{formatBand({ band, count }, t)}</span>
                      <span className="ir-report-bands__range">
                        {band.min}–{band.max} {t("ir.colWavenumber")}
                      </span>
                      {band.condensedPhase && (
                        <span className="ir-report-bands__flag">{t("ir.bandCondensedFlag")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ir-report-empty">{t("ir.reportNoBands")}</p>
              )}
            </section>

            <section className="ir-report-section">
              <h3>{t("ir.reportPeaksTitle")}</h3>
              <PeakTable modes={modes} bands={bands} detailed />
            </section>
          </div>

          <p className="ir-report-dialog__note">
            <Info size={13} /> {t("ir.gasPhaseNote")}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}