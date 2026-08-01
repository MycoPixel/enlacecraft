import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useT } from "../../i18n/useT";
import { groupByEquivalence, equivalenceGroupLabel, type ShiftPrediction, type H1ShiftPrediction } from "../../io/nmrPredict";
import {
  simulateH1Spectrum,
  simulateC13Spectrum,
  buildCurve,
  suggestedRange,
  DEFAULT_H1_LINEWIDTH_PPM,
  DEFAULT_C13_LINEWIDTH_PPM,
  type SimulatedLine,
  type SimulatedPeakGroup,
} from "../../io/nmrSpectrum";

const PLOT_WIDTH = 760;
const PLOT_HEIGHT = 240;
const PLOT_PADDING_TOP = 34; // room for group labels above the tallest peak
const AXIS_Y = PLOT_HEIGHT - 26;
const CURVE_SAMPLES = 480;

type PlotMode = "curve" | "sticks";
type Nucleus = "h1" | "c13";

const MIN_VERTICAL_ZOOM = 1;
const MAX_VERTICAL_ZOOM = 60;
const VERTICAL_ZOOM_STEP = 1.15; // multiplicative per wheel tick
const MIN_DRAG_PPM = 0.02; // shorter drags are treated as a click, not a zoom

// Label decluttering: rough per-character width for the 8.5px group-
// label font, used to estimate how wide a label's text will render
// without needing a real DOM measurement.
const LABEL_CHAR_WIDTH_PX = 5.3;
const LABEL_H_GAP_PX = 4; // minimum horizontal gap kept between two labels
const LABEL_LANE_HEIGHT_PX = 9; // vertical step between stacked label rows
const LABEL_MIN_Y = 9; // don't let stacked labels run off the top of the viewBox

function tallestLine(group: SimulatedPeakGroup): SimulatedLine | null {
  return group.lines.reduce<SimulatedLine | null>(
    (max, l) => (!max || l.intensity > max.intensity ? l : max),
    null
  );
}

/**
 * One nucleus's spectrum plot (shared by the 1H and 13C tabs below) -
 * an SVG panel with a ppm axis (decreasing left-to-right, standard
 * NMR convention), a curve/sticks toggle, and two independent zoom
 * interactions:
 *   - Mouse wheel over the plot: vertical (intensity) zoom - lets a
 *     small peak (e.g. 1H) grow visible even next to a much larger
 *     one (e.g. 9H) by raising the effective ceiling past the
 *     tallest peak, which then clips flat at the top rather than
 *     forcing everything to share one scale. Bound as a native,
 *     non-passive listener (see the effect below) so it can actually
 *     stop the wheel event from also scrolling the page - React's
 *     onWheel prop is attached passively and can't call
 *     preventDefault() reliably.
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
  nucleus: Nucleus;
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

  const clientXToPpm = (clientX: number, clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    // Map the mouse position through the SVG's actual screen->viewBox
    // transform rather than assuming clientX scales linearly across the
    // element's bounding box. With preserveAspectRatio="xMidYMid meet"
    // and a CSS box whose aspect ratio doesn't match the viewBox's
    // (e.g. width: 100%; height: 180px vs. viewBox 640x190), the SVG
    // is letterboxed/pillarboxed - the drawn content is centered inside
    // the box with padding on two sides. A rect.width-based fraction
    // includes that padding and drifts from the real cursor position.
    // getScreenCTM accounts for the letterboxing automatically.
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const svgPoint = point.matrixTransform(ctm.inverse());
    return xToPpm(svgPoint.x);
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

  // Group labels ("C2", "C4"...) are centered on their peak's x
  // position. When two groups sit at nearly the same shift, their
  // labels would otherwise be drawn on top of each other and become
  // unreadable. This assigns each label to the lowest vertical "lane"
  // that doesn't collide (by estimated text width) with a
  // narrower-x label already placed in that lane, sweeping left to
  // right, so close-together peaks stack their labels in a small
  // staircase instead of overlapping.
  const labelPlacements = useMemo(() => {
    const items = peakGroups
      .map((group) => {
        const line = tallestLine(group);
        if (!line) return null;
        const text = group.label + (group.isIllustrative ? "*" : "");
        const x = ppmToX(group.centerPpm);
        const width = text.length * LABEL_CHAR_WIDTH_PX;
        const baseY = Math.min(intensityToY(line.intensity) - 6, AXIS_Y - 8);
        const peakY = intensityToY(line.intensity);
        return { group, text, x, width, baseY, peakY };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.x - b.x);

    const laneRightEdge: number[] = [];
    return items.map((item) => {
      const left = item.x - item.width / 2;
      const right = item.x + item.width / 2;
      let lane = laneRightEdge.findIndex((edge) => left > edge + LABEL_H_GAP_PX);
      if (lane === -1) {
        lane = laneRightEdge.length;
        laneRightEdge.push(right);
      } else {
        laneRightEdge[lane] = right;
      }
      const y = Math.max(LABEL_MIN_Y, item.baseY - lane * LABEL_LANE_HEIGHT_PX);
      return { ...item, lane, y };
    });
  }, [peakGroups, minPpm, maxPpm, effectiveMaxIntensity]);

  const resetZoom = () => {
    setVerticalZoom(1);
    setZoomRangePpm(null);
  };

  // Bound as a native listener with { passive: false } instead of
  // React's onWheel prop: React attaches wheel listeners passively by
  // default, so calling preventDefault() from onWheel doesn't
  // actually stop the browser from also scrolling the page - which is
  // what made zooming here feel inconsistent (the plot zoomed *and*
  // the page scrolled under the cursor at the same time).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!hasData) return;
      e.preventDefault();
      setVerticalZoom((current) => {
        const next = e.deltaY < 0 ? current * VERTICAL_ZOOM_STEP : current / VERTICAL_ZOOM_STEP;
        return Math.min(MAX_VERTICAL_ZOOM, Math.max(MIN_VERTICAL_ZOOM, next));
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [hasData]);

  const handleMouseDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const ppm = clientXToPpm(e.clientX, e.clientY);
    if (ppm === null) return;
    dragStartPpm.current = ppm;
    setDragCurrentPpm(ppm);
  };

  const handleMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (dragStartPpm.current === null) return;
    const ppm = clientXToPpm(e.clientX, e.clientY);
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

          {labelPlacements.map((placement, gi) => (
            <g key={gi}>
              {placement.lane > 0 && (
                <line
                  x1={placement.x}
                  y1={placement.y + 2}
                  x2={placement.x}
                  y2={placement.peakY}
                  className="nmr-spectrum-plot__label-leader"
                />
              )}
              <text x={placement.x} y={placement.y} className="nmr-spectrum-plot__group-label">
                {placement.text}
              </text>
            </g>
          ))}

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
 * Full simulated-spectrum tab: 1H and 13C panels shown one at a time
 * via a nucleus switcher (rather than both stacked), each with its
 * own curve/sticks toggle. Rendered inside NmrReportView.tsx as a
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
  const [activeNucleus, setActiveNucleus] = useState<Nucleus>("h1");

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
      <div
        className="nmr-report-shift-toggle nmr-spectrum-view__nucleus-toggle"
        role="group"
        aria-label={t("nmr.spectrumNucleusLabel")}
      >
        {(["h1", "c13"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={
              "nmr-report-shift-toggle__btn" + (activeNucleus === option ? " nmr-report-shift-toggle__btn--active" : "")
            }
            aria-pressed={activeNucleus === option}
            onClick={() => setActiveNucleus(option)}
          >
            {t(option === "h1" ? "nmr.section1h" : "nmr.section13c")}
          </button>
        ))}
      </div>

      {activeNucleus === "h1" ? (
        <SpectrumPlot peakGroups={h1PeakGroups} nucleus="h1" linewidthPpm={DEFAULT_H1_LINEWIDTH_PPM} />
      ) : (
        <SpectrumPlot peakGroups={c13PeakGroups} nucleus="c13" linewidthPpm={DEFAULT_C13_LINEWIDTH_PPM} />
      )}

      <p className="nmr-report-dialog__caveat">{t("nmr.spectrumCaveat")}</p>
    </div>
  );
}
