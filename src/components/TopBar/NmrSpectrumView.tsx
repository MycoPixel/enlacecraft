import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useT } from "../../i18n/useT";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { niceTickStep, decimalsForStep, ticksForRange } from "../../io/nmrAxisTicks";
import type { Nucleus, PeakListRow } from "../../io/nmrExport";
import { compareSpectrum, classifyMatch, DEFAULT_TOLERANCE_PPM, type ComparisonResult } from "../../io/nmrCompare";
import {
  buildPeakList,
  peakListToCsv,
  peakListToJcamp,
  peakListFilename,
  pickStructureFilename,
  parsePeakList,
  describeExperimentalSpread,
} from "../../io/nmrExport";
import { downloadBlob } from "../../io/exportImage";
import { spectrumToSvg } from "../../io/nmrSvg";
import {
  formatProtons,
  integrateRegions,
  type IntegrationRegion,
} from "../../io/nmrIntegrate";
import { computeFormula } from "../../model/valence";
import { NmrStructureDiagram } from "./NmrStructureDiagram";
import type { Molecule } from "../../types/chemistry";
import type { AtomShifts } from "./nmrReportTypes";
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

/**
 * What a horizontal drag does.
 *
 * "zoom" narrows the ppm window. "integrate" draws a region and measures it -
 * the drag gesture is deliberately the same in both, so switching tools changes
 * what the gesture MEANS rather than making the user learn a second gesture.
 */
type DragTool = "zoom" | "integrate";

/**
 * Shared empty shift map for the inline structure diagram.
 *
 * The diagram beside the plot is there to answer "which atoms is this
 * signal?", and printing shift numbers on it as well would duplicate the
 * Structure tab inside a view whose job is the spectrum - and would compete
 * with the highlight for the reader's attention. An empty map (rather than a
 * flag on the component) keeps "no shifts here" a normal input, so the
 * component has no special case for this caller.
 */
const NO_SHIFTS: Map<string, AtomShifts> = new Map();


/**
 * Vertical zoom is a SCALE factor applied to the tallest peak: effectiveMax =
 * naturalMax / zoom, so zooming in shrinks the ceiling and grows the small
 * peaks toward it.
 *
 * The floor is below 1 on purpose. Zooming in alone only ever works by
 * clipping the tallest peak flat against the top, so the biggest signal stays
 * pinned there and the plot can never show the whole set at a scale where
 * nothing is clipped - which is what you need to compare two signals' real
 * heights side by side, or just to see the spectrum without a hard ceiling.
 * Going below 1 raises the ceiling above the tallest peak, shrinking
 * everything and leaving headroom above it.
 */
/**
 * Floor for zooming out. 0.25 puts the tallest peak at a quarter of the plot
 * height, which is enough headroom to compare two signals' real relative
 * heights - and the reason it's not lower is that at 0.1 the tallest signal
 * was only ~18px tall, so a few clicks of the shrink button turned the whole
 * spectrum into a flat line along the baseline. Anything you can't read is
 * past the point of the control.
 */
const MIN_VERTICAL_ZOOM = 0.25;
/** 60x up - enough to separate a small peak from a dominant neighbour. */
const MAX_VERTICAL_ZOOM = 60;
const VERTICAL_ZOOM_STEP = 1.15; // multiplicative per wheel tick / button press

/**
 * Clamps the vertical zoom to its allowed range.
 *
 * Extracted rather than inlined at each use site so the wheel handler and the
 * touch buttons cannot drift apart - two copies of the same clamp is how one
 * of them ends up letting you zoom past the ceiling.
 */
function clampVerticalZoom(value: number): number {
  return Math.min(MAX_VERTICAL_ZOOM, Math.max(MIN_VERTICAL_ZOOM, value));
}
const MIN_DRAG_PPM = 0.02; // shorter drags are treated as a click, not a zoom

/** How far the pointer may travel during a press and still count as a click
 *  rather than a zoom drag, in CSS pixels. Comfortably under the ~8px slop
 *  used elsewhere in the app for click-vs-drag, and small enough that an
 *  accidental nudge while aiming at a peak doesn't zoom instead. */
const CLICK_SLOP_PX = 6;

/**
 * How close (in plot x units) a click has to be to a peak's own line to count
 * as selecting it.
 *
 * The tallest line of the group is used rather than any line, so clicking the
 * envelope of a multiplet still resolves to the right signal instead of
 * depending on which splitting line happened to be under the cursor. Scaled
 * off LABEL_H_GAP_PX so it tracks the same visual density as the labels.
 */
const PICK_TOLERANCE_PX = 14;

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

// Rounds a ppm value to a friendly 2-decimal string for pre-filling the
// range inputs — the raw natural-range numbers can carry long float
// tails (e.g. 7.834521...) that would look odd sitting in a text box
// the user is expected to edit.
function formatPpmForInput(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// How many decimal places a tick step needs so labels don't round a
// custom interval like 0.05 down to indistinguishable values (a fixed
// 1-decimal display would print "0.1" for every tick of a 0.05 step).
// Reads it straight off how the step itself prints, since that's
// already exactly as precise as the number needs to be.
/**
 * Rounds a raw tick interval to the nearest "nice" value from the 1/2/5 ladder
 * (…, 0.1, 0.2, 0.5, 1, 2, 5, 10, …).
 *
 * Standard chart practice, and the same reason software uses it generally: a
 * reader can count in halves and thirds of a labelled interval far more
 * easily than in thirds of 1.67. It also keeps the axis readable across the
 * very different windows this plot gets - a zoomed 0.2 ppm slice and a full
 * 0-12 ppm 13C range both come out with round, guessable intervals.
 */

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
/**
 * The quantitative side of the comparison: which signals agreed, by how much,
 * and what each side has that the other doesn't.
 *
 * The overlay already let the user judge agreement by eye. This is the part
 * that can't be eyeballed - the residual per signal, and the two lists that
 * matter most when the model is wrong: signals it predicted but nobody
 * observed, and measured signals it failed to predict at all.
 */
function SpectrumComparison({
  result,
  tolerancePpm,
  onToleranceChange,
}: {
  result: ComparisonResult;
  tolerancePpm: number;
  onToleranceChange: (value: number) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const formatDelta = (delta: number) => `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;

  return (
    <div className="nmr-spectrum-view__comparison">
      <div className="nmr-spectrum-view__comparison-head">
        {result.meanAbsErrorPpm !== null ? (
          <p className="nmr-spectrum-view__compare-stat">
            <strong>{t("nmr.compareMeanError", { value: result.meanAbsErrorPpm.toFixed(3) })}</strong>
            <span className="nmr-spectrum-view__compare-stat-sub">
              {t("nmr.compareWorst", { value: result.maxAbsErrorPpm!.toFixed(3) })}
            </span>
          </p>
        ) : (
          <p className="nmr-spectrum-view__compare-stat nmr-spectrum-view__compare-stat--none">
            {t("nmr.compareNoMatches")}
          </p>
        )}

        {/* Tolerance is user-facing because it decides the answer. Hiding it
            would mean a user staring at "0 matched" with no way to tell
            whether the model is wrong or the window is too tight. */}
        <label className="nmr-spectrum-view__tolerance">
          <span>{t("nmr.compareTolerance", { value: tolerancePpm.toFixed(2) })}</span>
          <input
            type="range"
            min={0.02}
            max={0.5}
            step={0.01}
            value={tolerancePpm}
            onChange={(e) => onToleranceChange(Number(e.target.value))}
          />
        </label>
      </div>

      {result.matchedFraction !== null && (
        <p className="nmr-spectrum-view__compare-fractions">
          {t("nmr.compareMatched", {
            value: Math.round(result.matchedFraction * 100),
            count: result.matches.length,
            total: result.predictedCount,
          })}
        </p>
      )}

      <button
        type="button"
        className="nmr-spectrum-view__comparison-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? t("nmr.compareHideTable") : t("nmr.compareShowTable")}
      </button>

      {expanded && (
        <div className="nmr-spectrum-view__comparison-detail">
          <table className="nmr-spectrum-view__comparison-table">
            <thead>
              <tr>
                <th>{t("nmr.compareColAtoms")}</th>
                <th>{t("nmr.comparePredicted")}</th>
                <th>{t("nmr.compareMeasured")}</th>
                <th>&Delta;</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.map((m, i) => (
                <tr key={`m-${i}-${m.label}`} className={`nmr-spectrum-view__match--${classifyMatch(m.deltaPpm)}`}>
                  <td>{m.label}</td>
                  <td>{m.predictedPpm.toFixed(2)}</td>
                  <td>{m.measuredPpm.toFixed(2)}</td>
                  <td className="nmr-spectrum-view__delta">{formatDelta(m.deltaPpm)}</td>
                </tr>
              ))}

              {/* Predicted but never observed. Listed because a signal the
                  model invented where there is nothing is the clearest
                  failure mode to investigate. */}
              {result.unmatchedPredictions.map((p, i) => (
                <tr key={`p-${i}-${p.label}`} className="nmr-spectrum-view__match--missing">
                  <td>{p.label}</td>
                  <td>{p.predictedPpm.toFixed(2)}</td>
                  <td className="nmr-spectrum-view__delta">&mdash;</td>
                  <td className="nmr-spectrum-view__delta">{t("nmr.compareNotSeen")}</td>
                </tr>
              ))}

              {/* Measured but not predicted. An unexplained measured peak is
                  the most actionable row in the table: the model missed a
                  signal that demonstrably exists. */}
              {result.unmatchedMeasurements.map((m, i) => (
                <tr key={`x-${i}-${m.measuredPpm}`} className="nmr-spectrum-view__match--extra">
                  <td>{m.atoms || t("nmr.compareUnassigned")}</td>
                  <td className="nmr-spectrum-view__delta">&mdash;</td>
                  <td>{m.measuredPpm.toFixed(2)}</td>
                  <td className="nmr-spectrum-view__delta">{t("nmr.compareUnexpected")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SpectrumPlot({
  peakGroups,
  nucleus,
  linewidthPpm,
  onSelectGroup,
  experimental,
  matchedLabels,
  mode,
  onModeChange,
  onHoverGroup,
}: {
  peakGroups: SimulatedPeakGroup[];
  nucleus: Nucleus;
  linewidthPpm: number;
  /** Called with the group whose peak/label was clicked - lets the plot act
   *  as a peak picker rather than a purely decorative graph. */
  onSelectGroup: ((group: SimulatedPeakGroup) => void) | undefined;
  /** Called with the signal under the pointer, or null on leave. Drives the
   *  highlight on the structure diagram beside the plot, so hovering a peak
   *  answers "which atoms are this?" without a click. */
  onHoverGroup: ((group: SimulatedPeakGroup | null) => void) | undefined;
  /** Measured peaks to overlay, or null when no comparison is loaded. */
  experimental: PeakListRow[] | null;
  /** Labels of predicted signals that matched a measured peak. Rendered as
   *  connector lines so a good match is visible on the plot itself, not only
   *  as a number in a table. */
  matchedLabels: Set<string> | null;
  /** Which shape to draw - "curve" or "sticks".
   *
   *  Owned by the parent rather than locally, because the SVG export has to
   *  reproduce whichever of the two the user was looking at, and the export
   *  handler lives above this component. Lifting it also makes the 1H and 13C
   *  plots share one setting, so switching nucleus doesn't silently change the
   *  representation - the toggle then reads as a property of the report, not
   *  of whichever tab happens to be on screen. */
  mode: PlotMode;
  onModeChange: (mode: PlotMode) => void;
}) {
  const t = useT();
  const [verticalZoom, setVerticalZoom] = useState(1);
  const [zoomRangePpm, setZoomRangePpm] = useState<[number, number] | null>(null);

  // --- integration regions --------------------------------------------
  // User-drawn windows to measure. Persisted per nucleus by the parent so
  // switching tabs and back doesn't silently discard measurements the user
  // took - losing a measurement because you looked at the other nucleus would
  // be its own bug, and the regions are cheap to keep.
  const [regions, setRegions] = useState<IntegrationRegion[]>([]);
  // The region the user calibrated to a known H count, plus that count. Null
  // until set, which is what keeps absolute protons honestly null rather than
  // invented (see nmrIntegrate.ts).
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [referenceProtons, setReferenceProtons] = useState<string>("");
  const [dragTool, setDragTool] = useState<DragTool>("zoom");
  // Region index being re-dragged; its stored range is updated live so the
  // readout tracks the pointer.
  const draggingRegionRef = useRef<string | null>(null);

  const integrationResults = useMemo(
    () =>
      integrateRegions(
        peakGroups,
        regions,
        linewidthPpm,
        referenceId,
        referenceProtons === "" ? null : Number(referenceProtons),
      ),
    [peakGroups, regions, linewidthPpm, referenceId, referenceProtons],
  );

  const regionById = useMemo(
    () => new Map(integrationResults.map((r) => [r.region.id, r])),
    [integrationResults],
  );

  const addRegion = useCallback((rangePpm: [number, number]) => {
    setRegions((prev) => [
      ...prev,
      { id: `int-${Date.now()}-${prev.length}`, rangePpm },
    ]);
  }, []);

  const updateRegion = useCallback((id: string, rangePpm: [number, number]) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, rangePpm } : r)));
  }, []);

  const removeRegion = useCallback((id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
    // Dropping the calibrated region drops its calibration too, or the
    // remaining regions would keep scaling against a region that no longer
    // exists and silently report nonsense.
    setReferenceId((cur) => (cur === id ? null : cur));
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartPpm = useRef<number | null>(null);
  const [dragCurrentPpm, setDragCurrentPpm] = useState<number | null>(null);
  // Screen-space position the press started at, so a release that never moved
  // can be told apart from the end of a zoom drag. endDrag already discards
  // sub-threshold ppm movement, but a horizontal drag and a click can span the
  // same ppm range, so the test has to be in screen space to be meaningful.
  const dragStartClient = useRef<{ x: number; y: number } | null>(null);
  // Which pointer is driving the drag. Pinch-to-zoom on a phone sends several
  // pointers at once, and without pinning one, each finger's move would fight
  // the others over the same range selection.
  const dragPointerId = useRef<number | null>(null);

  const naturalRange = useMemo(() => suggestedRange(peakGroups, nucleus), [peakGroups, nucleus]);
  const [minPpm, maxPpm] = zoomRangePpm ?? naturalRange;

  // Manual range inputs (start/finish ppm) — a text-editable alternative
  // to drag-to-zoom, for typing an exact window (e.g. "0 to 10") rather
  // than eyeballing a drag. Committing a valid range reuses the same
  // zoomRangePpm state as drag-zoom, so "Reset zoom" clears either one,
  // and the two stay interchangeable. Local text state so a value being
  // actively typed isn't clobbered mid-edit by the sync effect below.
  const [rangeFromText, setRangeFromText] = useState(() => formatPpmForInput(minPpm));
  const [rangeToText, setRangeToText] = useState(() => formatPpmForInput(maxPpm));
  useEffect(() => {
    setRangeFromText(formatPpmForInput(minPpm));
    setRangeToText(formatPpmForInput(maxPpm));
    // Only re-sync when the actual displayed range changes (drag-zoom,
    // reset, or a just-committed manual edit) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minPpm, maxPpm]);

  const applyRange = () => {
    const from = parseFloat(rangeFromText);
    const to = parseFloat(rangeToText);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
      // Invalid or empty — snap the inputs back to whatever's currently
      // shown instead of leaving unparseable text sitting there.
      setRangeFromText(formatPpmForInput(minPpm));
      setRangeToText(formatPpmForInput(maxPpm));
      return;
    }
    setZoomRangePpm([Math.min(from, to), Math.max(from, to)]);
  };

  // Tick interval (e.g. "every 0.5 ppm") — an explicit alternative to the
  // default fixed-count axis division, so gridlines land on the same
  // absolute ppm values (0, 0.5, 1.0, ...) no matter what range is
  // showing. That's what makes two different spectra visually
  // comparable: matching step + matching range lines their ticks up
  // exactly. Empty text means "auto" (current fixed-count behavior).
  const [tickStepText, setTickStepText] = useState("");
  const [tickStep, setTickStep] = useState<number | null>(null);
  const applyTickStep = () => {
    const trimmed = tickStepText.trim();
    if (trimmed === "") {
      setTickStep(null);
      return;
    }
    const val = parseFloat(trimmed);
    if (!Number.isFinite(val) || val <= 0) {
      setTickStepText(tickStep !== null ? tickStep.toString() : "");
      return;
    }
    setTickStep(val);
  };

  // Shows each peak/group's ppm value right on its label (e.g. "H3
  // (2.34)") instead of just the atom label — handy for reading exact
  // shifts off the plot itself rather than cross-referencing the table.
  const [showShiftValues, setShowShiftValues] = useState(false);

  const ppmToX = (ppm: number) => (PLOT_WIDTH * (maxPpm - ppm)) / (maxPpm - minPpm);
  const xToPpm = (x: number) => maxPpm - (x / PLOT_WIDTH) * (maxPpm - minPpm);

  /**
   * The peak group whose tallest line is nearest a click at plot-x `x`, or
   * null if nothing is close enough.
   *
   * Comparing in plot-x units rather than ppm means the tolerance is a fixed
   * on-screen distance, so picking feels the same whether the window is 12 ppm
   * wide or zoomed into a 0.2 ppm slice.
   */
  const pickGroupAtX = (x: number): SimulatedPeakGroup | null => {
    let best: SimulatedPeakGroup | null = null;
    let bestDist = Infinity;
    for (const group of peakGroups) {
      const line = tallestLine(group);
      if (!line) continue;
      const d = Math.abs(ppmToX(line.ppm) - x);
      if (d < bestDist) {
        best = group;
        bestDist = d;
      }
    }
    return bestDist <= PICK_TOLERANCE_PX ? best : null;
  };

  const pickGroupAtClientX = (clientX: number, clientY: number): SimulatedPeakGroup | null => {
    // Route through the existing client->ppm conversion rather than a second
    // screen->viewBox transform: clientXToPpm already handles the SVG's
    // letterboxing correctly (see its comment), and a second implementation
    // would be a second thing to keep in sync.
    const ppm = clientXToPpm(clientX, clientY);
    return ppm === null ? null : pickGroupAtX(ppmToX(ppm));
  };

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
    if (tickStep !== null) {
      // Anchored to absolute multiples of the step (not to minPpm), so
      // the same step always produces the same gridlines regardless of
      // which window is currently showing — the whole point of a
      // manual interval is for two different plots to line up.
      const result = ticksForRange(minPpm, maxPpm, tickStep);
      return result;
    }
    // No manual step set: pick one from the NMR-conventional 1/2/5 ladder,
    // targeting ~8 divisions.
    //
    // The previous code divided the range into exactly 6 equal parts, which on
    // a typical 1H window (say 0-10 ppm) put ticks 1.67 ppm apart - too coarse
    // to read anything in the aromatic region, where signals routinely sit
    // 0.1 ppm from their neighbours. Snapping to a round number also means the
    // labels read 1 / 2 / 5 rather than 1.67 / 3.33, so a reader can estimate
    // an unknown peak between two labelled lines.
    const step = niceTickStep((maxPpm - minPpm) / 8);
    return ticksForRange(minPpm, maxPpm, step);
  }, [minPpm, maxPpm, tickStep]);

  /**
   * Whether 0 ppm falls inside the current window - the TMS reference point,
   * and the one landmark every NMR reader looks for first.
   */
  const hasZeroReference = minPpm <= 0 && maxPpm >= 0;

  const hasIllustrative = peakGroups.some((g) => g.isIllustrative);
  // Counted separately because these peaks need a DIFFERENT explanation: not
  // "our spacing is approximate" but "we don't know the shape".
  const splittingUnknownCount = peakGroups.filter((g) => g.splittingUnknown).length;
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
        // Two distinct markers, because two distinct things are true. "*" means
        // the shape came from a 7 Hz stand-in; "?" means we were told the
        // multiplicity but could not translate it into a shape at all. Sharing a
        // marker made the caveat describe the second case wrongly.
        const marker = group.splittingUnknown ? "?" : group.isIllustrative ? "*" : "";
        const text = group.label + (showShiftValues ? ` (${group.centerPpm.toFixed(nucleus === "h1" ? 2 : 1)})` : "") + marker;
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
  }, [peakGroups, minPpm, maxPpm, effectiveMaxIntensity, showShiftValues]);

  const resetZoom = () => {
    setVerticalZoom(1);
    setZoomRangePpm(null);
  };

  /**
   * Nudges the vertical (intensity) zoom by one step.
   *
   * Vertical zoom was reachable only via the mouse wheel, which on a phone
   * does nothing at all - so a small peak sitting next to a large one (a 1H
   * signal beside a solvent peak, say) simply couldn't be grown into view.
   * These buttons are the touch-reachable equivalent, using the same clamping
   * and step as the wheel handler so both inputs behave identically.
   */
  const stepVerticalZoom = (direction: 1 | -1) => {
    setVerticalZoom((prev) => clampVerticalZoom(prev * (direction === 1 ? VERTICAL_ZOOM_STEP : 1 / VERTICAL_ZOOM_STEP)));
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
      setVerticalZoom((current) =>
        clampVerticalZoom(e.deltaY < 0 ? current * VERTICAL_ZOOM_STEP : current / VERTICAL_ZOOM_STEP),
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [hasData]);

  /**
   * Starts a range-selection drag.
   *
   * Pointer events rather than mouse events: this used to be onMouseDown /
   * onMouseMove, which a finger never fires, so touch could not zoom the
   * horizontal axis at all. React's pointer events cover mouse, pen and touch
   * through one path, which is also why the canvas's own gestures use them.
   *
   * A second simultaneous pointer is ignored (left to the browser, which
   * treats a two-finger gesture as a pinch rather than a selection), and the
   * pointer is captured so a drag that leaves the plot still tracks.
   */
  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!hasData) return;
    if (e.pointerType === "touch" && dragPointerId.current !== null) return;
    // A mouse other than the primary button (e.g. right-click opening the
    // browser menu, or middle-click autoscroll) shouldn't start a zoom.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ppm = clientXToPpm(e.clientX, e.clientY);
    if (ppm === null) return;
    dragPointerId.current = e.pointerId;
    dragStartPpm.current = ppm;
    dragStartClient.current = { x: e.clientX, y: e.clientY };
    setDragCurrentPpm(ppm);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointerId.current !== e.pointerId) return;
    const ppm = clientXToPpm(e.clientX, e.clientY);
    if (ppm !== null) setDragCurrentPpm(ppm);
  };

  const endDrag = (e?: ReactPointerEvent<SVGSVGElement>) => {
    const start = dragStartPpm.current;
    const startClient = dragStartClient.current;
    if (start !== null && dragCurrentPpm !== null) {
      const lo = Math.min(start, dragCurrentPpm);
      const hi = Math.max(start, dragCurrentPpm);

      // Re-dragging an existing region updates it in place instead of adding a
      // second overlapping one - otherwise adjusting a boundary is impossible
      // and the plot fills up with duplicates.
      if (draggingRegionRef.current) {
        if (hi - lo >= MIN_DRAG_PPM) updateRegion(draggingRegionRef.current, [lo, hi]);
        draggingRegionRef.current = null;
      } else if (hi - lo >= MIN_DRAG_PPM) {
        if (dragTool === "integrate") {
          addRegion([lo, hi]);
        } else {
          setZoomRangePpm([lo, hi]);
        }
      } else if (onSelectGroup && e && startClient) {
        // Not a zoom drag, so treat it as a click and pick the nearest peak.
        // This branch is the reason a click was previously swallowed outright:
        // endDrag used to discard anything under MIN_DRAG_PPM and do nothing
        // else, so a deliberate click on a peak produced no feedback at all.
        // Screen-space distance decides the click (see pickGroupAtClientX), but
        // this screen-space check only decides click-vs-drag.
        const moved = Math.hypot(e.clientX - startClient.x, e.clientY - startClient.y);
        if (moved <= CLICK_SLOP_PX) {
          const group = pickGroupAtClientX(e.clientX, e.clientY);
          if (group) onSelectGroup(group);
        }
      }
    }
    if (e && dragPointerId.current === e.pointerId) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    dragStartPpm.current = null;
    dragStartClient.current = null;
    dragPointerId.current = null;
    setDragCurrentPpm(null);
  };

  const isDragging = dragStartPpm.current !== null && dragCurrentPpm !== null;

  /**
   * Ends the drag when a pointer is cancelled or released outside the plot.
   *
   * Pointer capture means a normal release is always delivered here, but a
   * cancel (an OS gesture stealing the pointer, the window losing focus) needs
   * this path or the drag would stay latched - leaving the selection rectangle
   * stuck on screen with no way to clear it.
   */
  const handlePointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragPointerId.current !== e.pointerId) return;
    endDrag();
  };

  /**
   * Press on an existing region to redraw it.
   *
   * Stopped from reaching the plot's own drag handler, which would otherwise
   * interpret the press as a fresh zoom/integrate drag starting from the same
   * point - so grabbing a boundary you wanted to move would create a second
   * region instead of moving the first.
   */
  const handleRegionPointerDown = (e: ReactPointerEvent<SVGGElement>, id: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    draggingRegionRef.current = id;
  };

  return (
    <div className="nmr-spectrum-plot">
      <div className="nmr-spectrum-plot__toolbar">
        {/*
          What a horizontal drag does. Placed before the curve/sticks toggle
          because it's the coarser decision - "am I measuring or just looking?"
          - and it changes how the gesture under the pointer behaves.
        */}
        <div className="nmr-report-shift-toggle" role="group" aria-label={t("nmr.spectrumToolLabel")}>
          {(["zoom", "integrate"] as const).map((tool) => (
            <button
              key={tool}
              type="button"
              className={
                "nmr-report-shift-toggle__btn" + (dragTool === tool ? " nmr-report-shift-toggle__btn--active" : "")
              }
              aria-pressed={dragTool === tool}
              onClick={() => setDragTool(tool)}
            >
              {t(tool === "zoom" ? "nmr.spectrumToolZoom" : "nmr.spectrumToolIntegrate")}
            </button>
          ))}
        </div>
        <div className="nmr-report-shift-toggle" role="group" aria-label={t("nmr.spectrumModeLabel")}>
          {(["curve", "sticks"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={
                "nmr-report-shift-toggle__btn" + (mode === option ? " nmr-report-shift-toggle__btn--active" : "")
              }
              aria-pressed={mode === option}
              onClick={() => onModeChange(option)}
            >
              {t(option === "curve" ? "nmr.spectrumModeCurve" : "nmr.spectrumModeSticks")}
            </button>
          ))}
        </div>
        {/*
          Vertical zoom was wheel-only, which a finger can't do. Without these
          a small peak next to a large one was unreachable on touch. Buttons
          rather than a pinch gesture because the plot's two-finger gesture is
          already spent on browser page zoom, and adding a custom one would
          fight it.
        */}
        <div className="nmr-spectrum-plot__intensity-controls">
          <button
            type="button"
            className="nmr-spectrum-plot__intensity-btn"
            onClick={() => stepVerticalZoom(1)}
            disabled={verticalZoom >= MAX_VERTICAL_ZOOM}
            aria-label={t("nmr.spectrumIntensityUp")}
            title={t("nmr.spectrumIntensityUp")}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className="nmr-spectrum-plot__intensity-btn"
            onClick={() => stepVerticalZoom(-1)}
            disabled={verticalZoom <= MIN_VERTICAL_ZOOM}
            aria-label={t("nmr.spectrumIntensityDown")}
            title={t("nmr.spectrumIntensityDown")}
          >
            <ChevronDown size={14} />
          </button>
        </div>
        {isZoomed && (
          <button type="button" className="nmr-spectrum-plot__reset-zoom" onClick={resetZoom}>
            {t("nmr.spectrumResetZoom")}
          </button>
        )}
      </div>

      {hasData && (
        <div className="nmr-spectrum-plot__controls">
          <label className="nmr-spectrum-plot__control">
            <span>{t("nmr.spectrumRangeLabel")}</span>
            <input
              type="text"
              inputMode="decimal"
              className="nmr-spectrum-plot__control-input nmr-spectrum-plot__control-input--narrow"
              value={rangeFromText}
              onChange={(e) => setRangeFromText(e.target.value)}
              onBlur={applyRange}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label={t("nmr.spectrumRangeFrom")}
            />
            <span className="nmr-spectrum-plot__control-sep">–</span>
            <input
              type="text"
              inputMode="decimal"
              className="nmr-spectrum-plot__control-input nmr-spectrum-plot__control-input--narrow"
              value={rangeToText}
              onChange={(e) => setRangeToText(e.target.value)}
              onBlur={applyRange}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label={t("nmr.spectrumRangeTo")}
            />
            <span className="nmr-spectrum-plot__control-unit">ppm</span>
          </label>

          <label className="nmr-spectrum-plot__control">
            <span>{t("nmr.spectrumTickIntervalLabel")}</span>
            <input
              type="text"
              inputMode="decimal"
              className="nmr-spectrum-plot__control-input nmr-spectrum-plot__control-input--narrow"
              value={tickStepText}
              placeholder={t("nmr.spectrumTickIntervalAuto")}
              onChange={(e) => setTickStepText(e.target.value)}
              onBlur={applyTickStep}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label={t("nmr.spectrumTickIntervalLabel")}
            />
            <span className="nmr-spectrum-plot__control-unit">ppm</span>
          </label>

          <label className="nmr-spectrum-plot__control nmr-spectrum-plot__control--checkbox">
            <input
              type="checkbox"
              checked={showShiftValues}
              onChange={(e) => setShowShiftValues(e.target.checked)}
            />
            <span>{t("nmr.spectrumShowShiftsLabel")}</span>
          </label>
        </div>
      )}

      {!hasData ? (
        <p className="align-menu__hint">{t("nmr.spectrumNoPeaks")}</p>
      ) : (
        <svg
          ref={svgRef}
          className="nmr-spectrum-plot__svg"
          viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={handlePointerCancel}
          // Deliberately NOT onPointerLeave: pointer capture keeps events
          // flowing to this element after the pointer leaves it, so a drag that
          // runs off the plot still updates and still ends. Leaving here would
          // end the drag mid-gesture and then re-fire on re-entry.
          onPointerLeave={(e) => {
            // Only if capture was never taken (e.g. the press started outside).
            if (dragPointerId.current === null) endDrag(e);
          }}
        >
          <line x1={0} y1={AXIS_Y} x2={PLOT_WIDTH} y2={AXIS_Y} className="nmr-spectrum-plot__axis" />

          {/*
            Gridlines run the full height of the plot, not just the 4px tick
            stub below the axis. Without them the only way to read an
            unlabelled peak is to eyeball it against the baseline, which is
            exactly the estimate the axis is supposed to support. Drawn behind
            the peaks so they never obscure a signal.
          */}
          {ticks.map((tick, i) => {
            const x = ppmToX(tick);
            return (
              <g key={i}>
                <line x1={x} y1={PLOT_PADDING_TOP} x2={x} y2={AXIS_Y} className="nmr-spectrum-plot__gridline" />
                <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 4} className="nmr-spectrum-plot__tick" />
                <text x={x} y={AXIS_Y + 15} className="nmr-spectrum-plot__tick-label">
                  {tick.toFixed(tickStep !== null ? decimalsForStep(tickStep) : decimalsForStep((maxPpm - minPpm) / 8))}
                </text>
              </g>
            );
          })}

          {/*
            0 ppm - the TMS reference - gets a distinct full-height marker
            and its own label, because it is the one line every NMR reader
            looks for first and it is frequently not one of the interval
            ticks (a 0-10 ppm window at a 1 ppm step happens to include it, a
            zoomed window usually does not).
          */}
          {hasZeroReference && (
            <g className="nmr-spectrum-plot__reference">
              <line
                x1={ppmToX(0)}
                y1={PLOT_PADDING_TOP}
                x2={ppmToX(0)}
                y2={AXIS_Y + 4}
                className="nmr-spectrum-plot__reference-line"
              />
              <text x={ppmToX(0)} y={AXIS_Y + 27} className="nmr-spectrum-plot__reference-label">
                {t("nmr.spectrumReference")}
              </text>
            </g>
          )}

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
                    (group.isIllustrative ? " nmr-spectrum-plot__stick--illustrative" : "") +
                    (onSelectGroup ? " nmr-spectrum-plot__stick--clickable" : "")
                  }
                  onClick={onSelectGroup ? () => onSelectGroup(group) : undefined}
                />
              ))
            )
          )}

          {/* Connectors from each predicted signal to the measured peak it matched.
              This is what turns "two sets of lines, look at them" into "this
              one is 0.02 off and that one is 0.4 off" - visible on the plot
              itself rather than only in the table below it. Drawn under the
              experimental markers so they never obscure a peak. */}
          {experimental &&
            matchedLabels &&
            peakGroups
              .filter((g) => matchedLabels.has(g.label))
              .map((g, i) => {
                const best = experimental.reduce(
                  (acc, r) => {
                    const d = Math.abs(r.shiftPpm - g.centerPpm);
                    return d < acc.d ? { d, ppm: r.shiftPpm } : acc;
                  },
                  { d: Infinity, ppm: NaN },
                );
                if (!Number.isFinite(best.ppm)) return null;
                const fromX = ppmToX(g.centerPpm);
                const toX = ppmToX(best.ppm);
                return (
                  <line
                    key={`conn-${i}-${g.label}`}
                    x1={fromX}
                    y1={AXIS_Y - 3}
                    x2={toX}
                    y2={AXIS_Y - 3}
                    className="nmr-spectrum-plot__connector"
                  />
                );
              })}

          {/* Measured peaks, as presence markers only.
              Deliberately EQUAL height rather than scaled by their integral or
              any intensity. A pasted peak list reports positions, and its
              integrals are only comparable to each other, not to the simulated
              absolute intensity on the same axis - drawing them at varying
              heights would imply a quantitative agreement that doesn't exist.
              Uniform full-height lines say exactly what they mean: a signal was
              reported at this shift. */}
          {experimental &&
            experimental
              .filter((r) => r.shiftPpm >= minPpm && r.shiftPpm <= maxPpm)
              .map((r, i) => (
                <line
                  key={`exp-${i}-${r.shiftPpm}`}
                  x1={ppmToX(r.shiftPpm)}
                  y1={AXIS_Y}
                  x2={ppmToX(r.shiftPpm)}
                  y2={2}
                  className="nmr-spectrum-plot__experimental"
                />
              ))}

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
              {/* The label is the one per-peak element present in both curve
                  and sticks mode, so it's the hover AND click target that
                  works regardless of which mode is showing. cursor:pointer and
                  the hover treatment are in app.css.
                  Hovering the label is the signal->structure link: the label
                  names the signal ("C1"), so hovering it is unambiguous even
                  where two signals' peaks nearly overlap. The curve itself is
                  deliberately NOT a hover target - it is one continuous path,
                  so "which peak is under the pointer" is not well defined on
                  it, and guessing would highlight the wrong atoms. */}
              <text
                x={placement.x}
                y={placement.y}
                onMouseEnter={onHoverGroup ? () => onHoverGroup(placement.group) : undefined}
                onMouseLeave={onHoverGroup ? () => onHoverGroup(null) : undefined}
                className={
                  "nmr-spectrum-plot__group-label" +
                  (onSelectGroup ? " nmr-spectrum-plot__group-label--clickable" : "")
                }
                onClick={onSelectGroup ? () => onSelectGroup(placement.group) : undefined}
                role={onSelectGroup ? "button" : undefined}
                tabIndex={onSelectGroup ? 0 : undefined}
                onKeyDown={
                  onSelectGroup
                    ? (ev) => {
                        // Keyboard parity with a clickable thing - Enter/Space,
                        // since a spectrum peak is otherwise unreachable without
                        // a pointer.
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          onSelectGroup(placement.group);
                        }
                      }
                    : undefined
                }
              >
                {placement.text}
              </text>
            </g>
          ))}

          {/*
            Measured regions, drawn over the plot they cover. The shaded band
            plus its two boundaries make it obvious which signal a number in
            the table belongs to - the region is the row's identity, so it has
            to be selectable on the plot and not just listed below it.
          */}
          {regions.map((region) => {
            const x1 = ppmToX(region.rangePpm[1]);
            const x2 = ppmToX(region.rangePpm[0]);
            const result = regionById.get(region.id);
            const isReference = referenceId === region.id;
            return (
              <g
                key={region.id}
                className={
                  "nmr-spectrum-plot__region" + (isReference ? " nmr-spectrum-plot__region--reference" : "")
                }
                onPointerDown={(e) => handleRegionPointerDown(e, region.id)}
              >
                <rect
                  x={Math.min(x1, x2)}
                  y={PLOT_PADDING_TOP}
                  width={Math.abs(x2 - x1)}
                  height={AXIS_Y - PLOT_PADDING_TOP}
                  className="nmr-spectrum-plot__region-fill"
                />
                {/* The proton count sits at the top of its own region, so
                    several regions can be read without cross-referencing. */}
                {result && (
                  <text
                    x={(x1 + x2) / 2}
                    y={PLOT_PADDING_TOP - 4}
                    className="nmr-spectrum-plot__region-value"
                    textAnchor="middle"
                  >
                    {formatProtons(result.protons)}
                  </text>
                )}
              </g>
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

      {regions.length > 0 && (
        <div className="nmr-spectrum-plot__regions">
          <p className="nmr-spectrum-plot__regions-title">{t("nmr.spectrumRegionsTitle")}</p>
          <table className="nmr-spectrum-plot__regions-table">
            <thead>
              <tr>
                <th>{t("nmr.spectrumRegionsRange")}</th>
                <th>{t("nmr.spectrumRegionsProtons")}</th>
                <th>{t("nmr.spectrumRegionsRatio")}</th>
                <th>{t("nmr.spectrumRegionsRef")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {integrationResults.map((result) => (
                <tr key={result.region.id}>
                  <td>
                    {result.region.rangePpm[1].toFixed(2)} &ndash; {result.region.rangePpm[0].toFixed(2)} ppm
                  </td>
                  <td>
                    {result.protons === null ? (
                      // Not "0" - an uncalibrated integration is unknown, and
                      // 0 would read as "no protons in this signal".
                      <span className="nmr-spectrum-plot__region-uncalibrated">
                        {t("nmr.spectrumRegionsUncalibrated")}
                      </span>
                    ) : (
                      formatProtons(result.protons)
                    )}
                  </td>
                  <td>
                    {result.ratio === null
                      ? "-"
                      : `${result.ratio.toFixed(result.ratio < 10 ? 1 : 0)}`}
                  </td>
                  <td>
                    <label className="nmr-spectrum-plot__region-calibrate">
                      <input
                        type="checkbox"
                        checked={referenceId === result.region.id}
                        onChange={(e) => {
                          if (e.target.checked) setReferenceId(result.region.id);
                          else {
                            setReferenceId(null);
                            setReferenceProtons("");
                          }
                        }}
                        aria-label={t("nmr.spectrumRegionsRef")}
                      />
                      {referenceId === result.region.id && (
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          className="nmr-spectrum-plot__control-input nmr-spectrum-plot__control-input--narrow"
                          value={referenceProtons}
                          onChange={(e) => setReferenceProtons(e.target.value)}
                          placeholder="H"
                          aria-label={t("nmr.spectrumRegionsRefCount")}
                        />
                      )}
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="nmr-spectrum-plot__region-remove"
                      onClick={() => removeRegion(result.region.id)}
                      aria-label={t("nmr.spectrumRegionsRemove")}
                      title={t("nmr.spectrumRegionsRemove")}
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="nmr-spectrum-plot__regions-note">{t("nmr.spectrumRegionsNote")}</p>
        </div>
      )}

      {hasIllustrative && <p className="nmr-spectrum-plot__caveat">{t("nmr.spectrumIllustrativeCaveat")}</p>}
      {splittingUnknownCount > 0 && (
        <p className="nmr-spectrum-plot__caveat">
          {t("nmr.spectrumSplittingUnknownCaveat", { count: splittingUnknownCount })}
        </p>
      )}
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
  fragment,
}: {
  predictions: ShiftPrediction[];
  predictionsH1: H1ShiftPrediction[];
  atomOrder: string[];
  atomLabels: Map<string, string>;
  /** The structure the predictions were made from - needed to draw the
   *  structure beside the plot. Passed in rather than rebuilt from the atom
   *  order, because only the caller holds the real drawn molecule. */
  fragment: Molecule;
}) {
    const t = useT();
  const [activeNucleus, setActiveNucleus] = useState<Nucleus>("h1");
  // Structure diagram shown beside the plot. Off by default: the spectrum is
  // the thing being read, and a permanent diagram would shrink the plot on a
  // screen that's already narrow.
  const [showStructure, setShowStructure] = useState(false);
  // The signal currently hovered on the plot, so its atoms can be highlighted
  // on the diagram. null means nothing hovered - deliberately an explicit
  // "nothing is linked" rather than defaulting to the first peak, which would
  // highlight an arbitrary atom the moment the diagram appeared.
  const [hoveredGroup, setHoveredGroup] = useState<{ nucleus: Nucleus; group: SimulatedPeakGroup } | null>(null);
  // Curve vs sticks. Shared by both plots and read by the SVG export, so an
  // exported figure shows the same representation the user was looking at.
  const [plotMode, setPlotMode] = useState<PlotMode>("curve");
  const setSelected = useMoleculeStore((s) => s.setSelected);
  const activeTabTitle = useMoleculeStore(
    (s) => s.tabs.find((tb) => tb.id === s.activeTabId)?.title ?? "",
  );
  const molecule = useMoleculeStore((s) => s.molecule);

  // --- getting the data out, and putting real data in -------------------
  // The spectrum could be read and nothing could be done with it. Export makes
  // the numbers reusable; the comparison overlay makes a measured spectrum
  // checkable against the prediction, which is the entire point of predicting.
  const [experimental, setExperimental] = useState<PeakListRow[] | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  const rowsFor = useCallback(
    (nucleus: Nucleus) =>
      buildPeakList(predictions, predictionsH1, nucleus, (i) =>
        // Same fallback rule equivalenceGroupLabel uses, so an exported atom
        // name matches the one shown in the report rather than differing
        // between the two views of the same data.
        atomLabels.get(atomOrder[i] ?? "") ?? String(i),
      ),
    [predictions, predictionsH1, atomOrder, atomLabels],
  );

  // Predicted proton counts keyed by the same label the plot shows, so the
  // comparison table can report an integral that matches what's on screen.
  const integralsByLabel = useCallback(
    (nucleus: Nucleus) => {
      const map = new Map<string, number>();
      for (const r of rowsFor(nucleus)) if (r.atoms) map.set(r.atoms, r.integral);
      return map;
    },
    [rowsFor],
  );

  const h1Groups = useMemo(() => groupByEquivalence(predictionsH1), [predictionsH1]);
  const c13Groups = useMemo(() => groupByEquivalence(predictions), [predictions]);

  const h1PeakGroups = useMemo(() => {
    return simulateH1Spectrum(h1Groups, (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels));
  }, [h1Groups, atomOrder, atomLabels]);

  const c13PeakGroups = useMemo(() => {
    return simulateC13Spectrum(c13Groups, (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels));
  }, [c13Groups, atomOrder, atomLabels]);

  const doExport = useCallback(
    (kind: "csv" | "jdx" | "svg") => {
      // A named tab wins; otherwise identify the structure by formula, so a
      // download is never "nmr-structure-1H.csv" when the formula was sitting
      // right there and needed no network to compute.
      const formula = Object.keys(molecule.atoms).length > 0 ? computeFormula(molecule) : null;
      const stem = pickStructureFilename(activeTabTitle, formula);
      const groups = activeNucleus === "h1" ? h1PeakGroups : c13PeakGroups;
      if (kind === "svg") {
        // Always the FULL natural range, never the on-screen zoom: this is a
        // figure for a report, and whoever made the export was last looking at
        // some 0.3 ppm window they happened to be interested in.
        const svg = spectrumToSvg(
          groups,
          activeNucleus,
          stem,
          suggestedRange(groups, activeNucleus),
          plotMode,
        );
        downloadBlob(new Blob([svg], { type: "image/svg+xml" }), peakListFilename(stem, activeNucleus, "svg"));
        return;
      }
      const name = peakListFilename(stem, activeNucleus, kind === "csv" ? "csv" : "jdx");
      const rows = rowsFor(activeNucleus);
      const text =
        kind === "csv"
          ? peakListToCsv(rows)
          : peakListToJcamp(rows, activeNucleus, stem || "predicted spectrum");
      downloadBlob(
        new Blob([text], { type: kind === "csv" ? "text/csv" : "chemical/x-jcamp-dx" }),
        name,
      );
    },
    [activeNucleus, activeTabTitle, rowsFor, molecule, h1PeakGroups, c13PeakGroups, plotMode],
  );

  const applyPastedPeaks = useCallback(() => {
    const { rows, skippedLines } = parsePeakList(pasteText);
    if (rows.length === 0) {
      setPasteNotice(t("nmr.compareNothingParsed"));
      return;
    }
    setExperimental(rows);
    setShowPasteBox(false);
    // Say what was ignored. A partially-imported list that looks complete is
    // worse than one that admits it dropped lines, because the user has no
    // other way to know something went missing.
    setPasteNotice(
      skippedLines > 0
        ? t("nmr.comparePartial", { count: rows.length, skipped: skippedLines })
        : t("nmr.compareLoaded", { count: rows.length }),
    );
  }, [pasteText, t]);

  const clearComparison = useCallback(() => {
    setExperimental(null);
    setPasteText("");
    setPasteNotice(null);
    setShowPasteBox(false);
  }, []);

  // Agreement window, editable because 0.15 ppm suits a clean reference
  // spectrum and is far too tight for a low-resolution one. Comparing against
  // the wrong window silently reports every signal as unmatched, which reads
  // as "the model is terrible" when it's really the tolerance.

  const [tolerancePpm, setTolerancePpm] = useState(DEFAULT_TOLERANCE_PPM);

  // Computed once here rather than inside the panel, because the plot needs
  // the same result to draw its connectors. Two independent comparisons could
  // in principle disagree, and the plot would then show connectors the table
  // doesn't have.
  const comparison = useMemo(
    () =>
      experimental
        ? compareSpectrum(
            activeNucleus === "h1" ? h1PeakGroups : c13PeakGroups,
            experimental,
            tolerancePpm,
            integralsByLabel(activeNucleus),
          )
        : null,
    [experimental, activeNucleus, h1PeakGroups, c13PeakGroups, tolerancePpm, integralsByLabel],
  );
  const matchedLabels = useMemo(
    () => (comparison ? new Set(comparison.matches.map((m) => m.label)) : null),
    [comparison],
  );

  // Predicted proton counts keyed by the same label the plot shows, so the
  // comparison table can report an integral that matches what's on screen.

  /**
   * The atom ids behind a peak group, resolved through the equivalence group
   * the peak was built from.
   *
   * Shared by click-to-select and hover-to-highlight because both must answer
   * the same question - "which atoms are this signal?" - and two copies of
   * that mapping is exactly how a click and a hover end up pointing at
   * different atoms, which the reader would reasonably read as a bug in the
   * chemistry rather than in the lookup.
   *
   * Matching goes through equivalence_group rather than position in the peak
   * list: the simulated groups are derived from the same equivalence grouping,
   * so the label is the stable link between "this peak" and "these atoms".
   */
  const atomsForGroup = useCallback(
    (nucleus: Nucleus, group: SimulatedPeakGroup): Set<string> => {
      const groups = nucleus === "h1" ? h1Groups : c13Groups;
      const match = groups.find(
        (g) => equivalenceGroupLabel(g.members, atomOrder, atomLabels) === group.label,
      );
      if (!match) return new Set();
      return new Set(
        match.members.map((m) => atomOrder[m.atomIndex]).filter((id): id is string => Boolean(id)),
      );
    },
    [h1Groups, c13Groups, atomOrder, atomLabels],
  );

  /**
   * Selects the atoms behind a clicked peak on the canvas.
   *
   * Replaces rather than extends the selection: clicking a peak is a statement
   * about that signal, and leaving an unrelated previous selection in place
   * would make a following drag move atoms the user wasn't looking at.
   */
  const handleSelectGroup = useCallback(
    (nucleus: Nucleus) => (group: SimulatedPeakGroup) => {
      const ids = atomsForGroup(nucleus, group);
      if (ids.size > 0) setSelected(ids);
    },
    [atomsForGroup, setSelected],
  );

  /** Highlights a hovered peak's atoms on the structure diagram. */
  const handleHoverGroup = useCallback(
    (nucleus: Nucleus) => (group: SimulatedPeakGroup | null) => {
      setHoveredGroup(group ? { nucleus, group } : null);
    },
    [],
  );

  // Atom ids the diagram should highlight, resolved from whatever is hovered.
  const highlightedAtomIds = useMemo(() => {
    if (!hoveredGroup) return new Set<string>();
    return atomsForGroup(hoveredGroup.nucleus, hoveredGroup.group);
  }, [hoveredGroup, atomsForGroup]);

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
        {/* Show/hide the structure beside the plot. Separate from the nucleus
            switch above: that chooses which spectrum, this chooses how much
            context to show while reading it. */}
        <button
          type="button"
          className={
            "nmr-report-shift-toggle__btn" +
            (showStructure ? " nmr-report-shift-toggle__btn--active" : "")
          }
          aria-pressed={showStructure}
          onClick={() => setShowStructure((v) => !v)}
        >
          {t("nmr.spectrumShowStructure")}
        </button>
      </div>

      {activeNucleus === "h1" ? (
        <SpectrumPlot peakGroups={h1PeakGroups} nucleus="h1" linewidthPpm={DEFAULT_H1_LINEWIDTH_PPM} onSelectGroup={handleSelectGroup("h1")} onHoverGroup={handleHoverGroup("h1")} experimental={experimental} matchedLabels={matchedLabels} mode={plotMode} onModeChange={setPlotMode} />
      ) : (
        <SpectrumPlot peakGroups={c13PeakGroups} nucleus="c13" linewidthPpm={DEFAULT_C13_LINEWIDTH_PPM} onSelectGroup={handleSelectGroup("c13")} onHoverGroup={handleHoverGroup("c13")} experimental={experimental} matchedLabels={matchedLabels} mode={plotMode} onModeChange={setPlotMode} />
      )}

      {/* The structure, beside the spectrum rather than on the other tab.
          Hovering a signal label above highlights the atoms that produced it,
          which is the question a predicted spectrum actually raises: "which
          protons is this multiplet?". The diagram shows no shift numbers here
          - those are on the Structure tab - so the highlight is the only
          thing pointing back, and it points unambiguously at one signal. */}
      {showStructure && (
        <div className="nmr-spectrum-view__structure">
          <NmrStructureDiagram
            fragment={fragment}
            labelOf={atomLabels}
            shiftsByAtom={NO_SHIFTS}
            showC={false}
            showH={false}
            showExplicitHydrogens={false}
            highlightedAtomIds={highlightedAtomIds}
          />
          <p className="nmr-spectrum-view__structure-hint">{t("nmr.spectrumStructureHint")}</p>
        </div>
      )}

      <p className="nmr-report-dialog__caveat">{t("nmr.spectrumCaveat")}</p>

      {/* Export and comparison. The spectrum was the one part of the app you
          could read but not use: no way to get the numbers out, and no way to
          check the prediction against a real spectrum - which is the entire
          reason to predict one. */}
      <div className="nmr-spectrum-view__data-bar">
        <button type="button" className="nmr-report-dialog__btn" onClick={() => doExport("csv")}>
          {t("nmr.exportCsv")}
        </button>
        <button type="button" className="nmr-report-dialog__btn" onClick={() => doExport("jdx")}>
          {t("nmr.exportJdx")}
        </button>
        <button type="button" className="nmr-report-dialog__btn" onClick={() => doExport("svg")}>
          {t("nmr.exportSvg")}
        </button>
        <button
          type="button"
          className="nmr-report-dialog__btn"
          onClick={() => {
            setShowPasteBox((v) => !v);
            setPasteNotice(null);
          }}
        >
          {t("nmr.compareButton")}
        </button>
        {experimental && (
          <button type="button" className="nmr-report-dialog__btn" onClick={clearComparison}>
            {t("nmr.compareClear")}
          </button>
        )}
      </div>

      {experimental && (
        <p className="nmr-spectrum-view__compare-summary">
          {(() => {
            const s = describeExperimentalSpread(experimental);
            return t("nmr.compareSummary", { count: s.count, min: s.min.toFixed(2), max: s.max.toFixed(2) });
          })()}
        </p>
      )}

      {experimental && comparison && (
        <SpectrumComparison
          result={comparison}
          tolerancePpm={tolerancePpm}
          onToleranceChange={setTolerancePpm}
        />
      )}

      {pasteNotice && <p className="nmr-spectrum-view__compare-notice">{pasteNotice}</p>}

      {showPasteBox && (
        <div className="nmr-spectrum-view__paste">
          <label className="nmr-spectrum-view__paste-label" htmlFor="nmr-compare-paste">
            {t("nmr.compareHelp")}
          </label>
          <textarea
            id="nmr-compare-paste"
            className="nmr-spectrum-view__paste-text"
            value={pasteText}
            rows={4}
            placeholder={"7.26, 2, t\n3.74, 3, s\n1.20, 6, s"}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="nmr-spectrum-view__paste-actions">
            <button type="button" className="nmr-report-dialog__btn" onClick={applyPastedPeaks}>
              {t("nmr.compareOverlay")}
            </button>
            <button type="button" className="nmr-report-dialog__btn" onClick={() => setShowPasteBox(false)}>
              {t("confirm.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
