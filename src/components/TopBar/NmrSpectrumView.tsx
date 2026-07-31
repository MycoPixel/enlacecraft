import { useMemo, useRef, useState, type WheelEvent as ReactWheelEvent, type MouseEvent as ReactMouseEvent } from "react";
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

const MIN_VERTICAL_ZOOM = 1;
const MAX_VERTICAL_ZOOM = 60;
const VERTICAL_ZOOM_STEP = 1.15; // multiplicative per wheel tick
const MIN_DRAG_PPM = 0.02; // shorter drags are treated as a click, not a zoom

/**
 * One nucleus's spectrum plot (shared by the 1H and 13C sections
 * below) - an SVG panel with a ppm axis (decreasing left-to-right,
 * standard NMR convention), a curve/sticks toggle, and two
 * independent zoom interactions:
 *   - Mouse wheel over the plot: vertical (intensity) zoom - lets a
 *     small peak (e.g. 1H) grow visible even next to a much larger
 *     one (e.g. 9H) by raising the effective ceiling past the
 *     tallest peak, which then clips flat at the top rather than
 *     forcing everything to share one scale.
 *   - Click-and-drag horizontally: selects a ppm range to zoom into,
 *     for separating peaks that sit close together. Reset via the
 *     button that appears once either zoom is active.
 * Illustrative, not measurement-grade - see io/nmrSpectrum.ts's
 * module docstring for exactly what's simulated vs. real per peak.
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
  const [verticalZoom, setVerticalZoom] = useState(1);
  const [zoomRangePpm, setZoomRangePpm] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartPpm = useRef<number | null>(null);
  const [dragCurrentPpm, setDragCurrentPpm] = useState<number | null>(null);

  const naturalRange = useMemo(() => suggestedRange(peakGroups, nucleus), [peakGroups, nucleus]);
  const [minPpm, maxPpm] = zoomRangePpm ?? naturalRange;

  const ppmToX = (ppm: number) => (PLOT_WIDTH * (maxPpm - ppm)) / (maxPpm - minPpm);
  const xToPpm = (x: number) => maxPpm - (x / PLOT_WIDTH) * (maxPpm - minPpm);

  const clientXToPpm = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const fraction = (clientX - rect.left) / rect.width;
    return xToPpm(fraction * PLOT_WIDTH);
  };

  const curvePoints = useMemo(() => {
    if (mode !== "curve") return [];
    return buildCurve(peakGroups, minPpm, maxPpm, CURVE_SAMPLES, linewidthPpm);
  }, [mode, peakGroups, minPpm, maxPpm, linewidthPpm]);

  const naturalMaxIntensity = useMemo(() => {
    if (mode === "curve") {
      return Math.max(1e-6, ...curvePoints.map((p) => p.intensity));
    }
    return Math.max(1e-6, ...peakGroups.flatMap((g) => g.lines.map((l) => l.intensity)));
  }, [mode, curvePoints, peakGroups]);

  // Raising verticalZoom lowers the effective ceiling below the
  // tallest peak's real intensity, so smaller peaks grow toward it -
  // anything taller than the ceiling clips flat at the top instead.
  const effectiveMaxIntensity = naturalMaxIntensity / verticalZoom;

  const intensityToY = (intensity: number) => {
    const y = AXIS_Y - ((AXIS_Y - PLOT_PADDING_TOP) * intensity) / effectiveMaxIntensity;
    return Math.max(PLOT_PADDING_TOP, y);
  };

  const ticks = useMemo(() => {
    const count = 6;
    const step = (maxPpm - minPpm) / count;
    return Array.from({ length: count + 1 }, (_, i) => minPpm + step * i);
  }, [minPpm, maxPpm]);

  const hasIllustrative = peakGroups.some((g) => g.isIllustrative);
  const hasData = peakGroups.some((g) => g.lines.length > 0);
  const isZoomed = verticalZoom !== 1 || zoomRangePpm !== null;

  const resetZoom = () => {
    setVerticalZoom(1);
    setZoomRangePpm(null);
  };

  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    if (!hasData) return;
    e.preventDefault();
    setVerticalZoom((current) => {
      const next = e.deltaY < 0 ? current * VERTICAL_ZOOM_STEP : current / VERTICAL_ZOOM_STEP;
      return Math.min(MAX_VERTICAL_ZOOM, Math.max(MIN_VERTICAL_ZOOM, next));
    });
  };

  const handleMouseDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const ppm = clientXToPpm(e.clientX);
    if (ppm === null) return;
    dragStartPpm.current = ppm;
    setDragCurrentPpm(ppm);
  };

  const handleMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (dragStartPpm.current === null) return;
    const ppm = clientXToPpm(e.clientX);
    if (ppm !== null) setDragCurrentPpm(ppm);
  };

  const endDrag = () => {
    if (dragStartPpm.current !== null && dragCurrentPpm !== null) {
      const lo = Math.min(dragStartPpm.current, dragCurrentPpm);
      const hi = Math.max(dragStartPpm.current, dragCurrentPpm);
      if (hi - lo >= MIN_DRAG_PPM) {
        setZoomRangePpm([lo, hi]);
      }
    }
    dragStartPpm.current = null;
    setDragCurrentPpm(null);
  };

  const isDragging = dragStartPpm.current !== null && dragCurrentPpm !== null;

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
        {isZoomed && (
          <button type="button" className="nmr-spectrum-plot__reset-zoom" onClick={resetZoom}>
            {t("nmr.spectrumResetZoom")}
          </button>
        )}
      </div>

      {!hasData ? (
        <p className="align-menu__hint">{t("nmr.spectrumNoPeaks")}</p>
      ) : (
        <svg
          ref={svgRef}
          className="nmr-spectrum-plot__svg"
          viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
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

          {isDragging && dragStartPpm.current !== null && dragCurrentPpm !== null && (
            <rect
              x={Math.min(ppmToX(dragStartPpm.current), ppmToX(dragCurrentPpm))}
              y={PLOT_PADDING_TOP}
              width={Math.abs(ppmToX(dragCurrentPpm) - ppmToX(dragStartPpm.current))}
              height={AXIS_Y - PLOT_PADDING_TOP}
              className="nmr-spectrum-plot__zoom-selection"
            />
          )}
        </svg>
      )}

      <p className="nmr-spectrum-plot__axis-label">{t(nucleus === "h1" ? "nmr.spectrumAxisH1" : "nmr.spectrumAxisC13")}</p>
      <p className="nmr-spectrum-plot__zoom-hint">{t("nmr.spectrumZoomHint")}</p>

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
