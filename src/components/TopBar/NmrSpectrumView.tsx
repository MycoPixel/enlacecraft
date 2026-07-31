import { useMemo, useState } from "react";
import { useT } from "../../i18n/useT";
import { groupByEquivalence, equivalenceGroupLabel, type ShiftPrediction, type H1ShiftPrediction } from "../../io/nmrPredict";
import {
  simulateH1Spectrum,
  simulateC13Spectrum,
  buildCurve,
  suggestedRange,
  DEFAULT_H1_LINEWIDTH_PPM,
  DEFAULT_C13_LINEWIDTH_PPM,
  type SimulatedPeakGroup,
} from "../../io/nmrSpectrum";

const PLOT_WIDTH = 640;
const PLOT_HEIGHT = 190;
const PLOT_PADDING_TOP = 28; // room for group labels above the tallest peak
const AXIS_Y = PLOT_HEIGHT - 22;
const CURVE_SAMPLES = 400;

type PlotMode = "curve" | "sticks";

/**
 * One nucleus's spectrum plot (shared by the 1H and 13C sections
 * below) - an SVG panel with a ppm axis (decreasing left-to-right,
 * standard NMR convention) and a curve/sticks toggle. Illustrative,
 * not measurement-grade - see io/nmrSpectrum.ts's module docstring
 * for exactly what's simulated vs. real per peak.
 */
function SpectrumPlot({
  peakGroups,
  nucleus,
  linewidthPpm,
}: {
  peakGroups: SimulatedPeakGroup[];
  nucleus: "h1" | "c13";
  linewidthPpm: number;
}) {
  const t = useT();
  const [mode, setMode] = useState<PlotMode>("curve");

  const [minPpm, maxPpm] = useMemo(() => suggestedRange(peakGroups, nucleus), [peakGroups, nucleus]);

  const ppmToX = (ppm: number) => (PLOT_WIDTH * (maxPpm - ppm)) / (maxPpm - minPpm);

  const curvePoints = useMemo(() => {
    if (mode !== "curve") return [];
    return buildCurve(peakGroups, minPpm, maxPpm, CURVE_SAMPLES, linewidthPpm);
  }, [mode, peakGroups, minPpm, maxPpm, linewidthPpm]);

  const maxIntensity = useMemo(() => {
    if (mode === "curve") {
      return Math.max(1e-6, ...curvePoints.map((p) => p.intensity));
    }
    return Math.max(1e-6, ...peakGroups.flatMap((g) => g.lines.map((l) => l.intensity)));
  }, [mode, curvePoints, peakGroups]);

  const intensityToY = (intensity: number) =>
    AXIS_Y - ((AXIS_Y - PLOT_PADDING_TOP) * intensity) / maxIntensity;

  const ticks = useMemo(() => {
    const count = 6;
    const step = (maxPpm - minPpm) / count;
    return Array.from({ length: count + 1 }, (_, i) => minPpm + step * i);
  }, [minPpm, maxPpm]);

  const hasIllustrative = peakGroups.some((g) => g.isIllustrative);
  const hasData = peakGroups.some((g) => g.lines.length > 0);

  return (
    <div className="nmr-spectrum-plot">
      <div className="nmr-spectrum-plot__toolbar">
        <div className="nmr-report-shift-toggle" role="group" aria-label={t("nmr.spectrumModeLabel")}>
          {(["curve", "sticks"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={
                "nmr-report-shift-toggle__btn" + (mode === option ? " nmr-report-shift-toggle__btn--active" : "")
              }
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
            >
              {t(option === "curve" ? "nmr.spectrumModeCurve" : "nmr.spectrumModeSticks")}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="align-menu__hint">{t("nmr.spectrumNoPeaks")}</p>
      ) : (
        <svg
          className="nmr-spectrum-plot__svg"
          viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <line x1={0} y1={AXIS_Y} x2={PLOT_WIDTH} y2={AXIS_Y} className="nmr-spectrum-plot__axis" />

          {ticks.map((tick, i) => {
            const x = ppmToX(tick);
            return (
              <g key={i}>
                <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 4} className="nmr-spectrum-plot__tick" />
                <text x={x} y={AXIS_Y + 15} className="nmr-spectrum-plot__tick-label">
                  {tick.toFixed(nucleus === "h1" ? 1 : 0)}
                </text>
              </g>
            );
          })}

          {mode === "curve" ? (
            <polyline
              className="nmr-spectrum-plot__curve"
              points={curvePoints.map((p) => `${ppmToX(p.ppm)},${intensityToY(p.intensity)}`).join(" ")}
            />
          ) : (
            peakGroups.map((group, gi) =>
              group.lines.map((line, li) => (
                <line
                  key={`${gi}-${li}`}
                  x1={ppmToX(line.ppm)}
                  y1={AXIS_Y}
                  x2={ppmToX(line.ppm)}
                  y2={intensityToY(line.intensity)}
                  className={
                    "nmr-spectrum-plot__stick" +
                    (group.isIllustrative ? " nmr-spectrum-plot__stick--illustrative" : "")
                  }
                />
              ))
            )
          )}

          {peakGroups.map((group, gi) => {
            const tallestLine = group.lines.reduce(
              (max, l) => (l.intensity > max.intensity ? l : max),
              group.lines[0]
            );
            if (!tallestLine) return null;
            const y = Math.min(intensityToY(tallestLine.intensity) - 6, AXIS_Y - 8);
            return (
              <text key={gi} x={ppmToX(group.centerPpm)} y={y} className="nmr-spectrum-plot__group-label">
                {group.label}
                {group.isIllustrative ? "*" : ""}
              </text>
            );
          })}
        </svg>
      )}

      <p className="nmr-spectrum-plot__axis-label">{t(nucleus === "h1" ? "nmr.spectrumAxisH1" : "nmr.spectrumAxisC13")}</p>

      {hasIllustrative && <p className="nmr-spectrum-plot__caveat">{t("nmr.spectrumIllustrativeCaveat")}</p>}
    </div>
  );
}

/**
 * Full simulated-spectrum tab: 1H and 13C panels stacked, each with
 * its own curve/sticks toggle. Rendered inside NmrReportView.tsx as a
 * sibling tab to the structure diagram - see that file's tab switcher.
 */
export function NmrSpectrumView({
  predictions,
  predictionsH1,
  atomOrder,
  atomLabels,
}: {
  predictions: ShiftPrediction[];
  predictionsH1: H1ShiftPrediction[];
  atomOrder: string[];
  atomLabels: Map<string, string>;
}) {
  const t = useT();

  const h1PeakGroups = useMemo(() => {
    const groups = groupByEquivalence(predictionsH1);
    return simulateH1Spectrum(groups, (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels));
  }, [predictionsH1, atomOrder, atomLabels]);

  const c13PeakGroups = useMemo(() => {
    const groups = groupByEquivalence(predictions);
    return simulateC13Spectrum(groups, (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels));
  }, [predictions, atomOrder, atomLabels]);

  return (
    <div className="nmr-spectrum-view">
      <p className="nmr-spectrum-view__section-title">{t("nmr.section1h")}</p>
      <SpectrumPlot peakGroups={h1PeakGroups} nucleus="h1" linewidthPpm={DEFAULT_H1_LINEWIDTH_PPM} />

      <p className="nmr-spectrum-view__section-title">{t("nmr.section13c")}</p>
      <SpectrumPlot peakGroups={c13PeakGroups} nucleus="c13" linewidthPpm={DEFAULT_C13_LINEWIDTH_PPM} />

      <p className="nmr-report-dialog__caveat">{t("nmr.spectrumCaveat")}</p>
    </div>
  );
}
