import { useCallback, useMemo, useRef, useState } from "react";
import type { IrBandHit, WaveRange } from "./irPlot";
import { NATURAL_RANGE, axisTicks, buildPlot, draggedRange } from "./irPlot";
import { useT } from "../../i18n/useT";

/**
 * The spectrum itself as an SVG, drawn the way an IR spectrum is drawn —
 * transmittance against a descending wavenumber axis — with the textbook
 * diagnostic ranges for whichever functional groups this molecule actually has
 * shaded behind it.
 *
 * Sized by the caller rather than fixed: the dropdown panel gets something
 * small enough to sit under the toolbar button, and the full-screen report gets
 * one large enough to actually read a peak off.
 *
 * Zoom is drag-to-select, the same gesture the NMR report's spectrum uses: drag
 * across the region you care about and it becomes the whole plot. Only the
 * report view enables it — in a 360px dropdown there is nothing to drag towards.
 */
export function IrSpectrumPlot({
  modes,
  bands,
  width = 360,
  height = 110,
  /** Report view draws real axis ticks; the panel just needs the shape, since
   *  it has no room for them. */
  detailed = false,
  zoomable = false,
}: {
  modes: { wavenumber: number; intensityKmMol: number }[];
  bands: IrBandHit[];
  width?: number;
  height?: number;
  detailed?: boolean;
  zoomable?: boolean;
}) {
  const t = useT();
  const [range, setRange] = useState<WaveRange>(NATURAL_RANGE);
  // The in-flight selection, already converted to viewBox units. Held as state
  // rather than derived during render because converting it needs the SVG's
  // measured rect, which is only knowable from an event handler.
  const [sel, setSel] = useState<{ x: number; width: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [lo, hi] = range;
  const span = hi - lo || 1;
  const zoomed = range[0] !== NATURAL_RANGE[0] || range[1] !== NATURAL_RANGE[1];

  // Gutters for the axis furniture, only where there is room for them. The
  // report's plot is big enough to name both axes and label the transmittance
  // scale; the dropdown's 360px is not, and pretending otherwise would mean
  // drawing tick numbers on top of the curve.
  const gutterLeft = detailed ? 40 : 0;
  const gutterBottom = detailed ? 20 : 0;
  const right = width;
  const top = 6;
  const floor = height - 10 - gutterBottom;

  // More samples for a bigger plot, or the curve visibly facets at large sizes.
  const plot = useMemo(
    () => buildPlot(modes, Math.max(360, Math.round(width * 1.6)), range),
    [modes, width, range],
  );

  const plotWidth = right - gutterLeft;
  const wnToX = (wn: number) => gutterLeft + ((hi - wn) / span) * plotWidth;
  const tToY = (transmittance: number) => top + (1 - transmittance) * (floor - top);

  // The whole coordinate is rounded as a NUMBER, then stringified. Adding a
  // numeric gutter to the already-stringified value would concatenate instead
  // ("40" + "0.6" -> "400.6") and silently draw the curve in the wrong place.
  const path = plot.transmittance
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(gutterLeft + (i / (plot.transmittance.length - 1)) * plotWidth).toFixed(1)},${tToY(v).toFixed(1)}`,
    )
    .join(" ");

  const ticks = detailed ? axisTicks(range) : [NATURAL_RANGE[0], (NATURAL_RANGE[0] + NATURAL_RANGE[1]) / 2, NATURAL_RANGE[1]];
  // Transmittance is 0-1; the axis is quoted in percent, which is what an IR
  // spectrum is labelled with on a real one.
  const yTicks = detailed ? [0, 25, 50, 75, 100] : [];

  /** The drawn plot AREA within the element, in CSS px.
 *
   * Not the same as the element's own rect once the axis gutter is in play:
   * the element spans the full viewBox but the curve only occupies
   * gutterLeft..width. Zoom arithmetic done against the element box would
   * silently disagree with the axis drawn against the plot box, which is the
   * same class of bug as using viewport coordinates for a plot-relative one. */
  const plotArea = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return { leftPx: 0, widthPx: 0, ok: false };
    const leftPx = rect.left + (gutterLeft / width) * rect.width;
    const widthPx = (plotWidth / width) * rect.width;
    return { leftPx, widthPx, ok: true };
  };

  /** Client pixels to viewBox units. Event-handler only, never during render. */
  const clientXToViewX = (clientX: number) => {
    const { leftPx, widthPx, ok } = plotArea();
    if (!ok || widthPx <= 0) return gutterLeft;
    return gutterLeft + ((clientX - leftPx) / widthPx) * plotWidth;
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!zoomable || e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragFrom(e.clientX);
    },
    [zoomable],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragFrom === null) return;
      const a = clientXToViewX(dragFrom);
      const b = clientXToViewX(e.clientX);
      setSel({ x: Math.min(a, b), width: Math.abs(b - a) });
    },
    // clientXToViewX closes over `width` only, and is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragFrom, width],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragFrom === null) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const area = plotArea();
      if (area.ok && area.widthPx > 0) {
        // Plot-relative, to match the selection rectangle drawn on screen AND
        // to exclude the axis gutter - see draggedRange and plotArea.
        const next = draggedRange(dragFrom - area.leftPx, e.clientX - area.leftPx, area.widthPx, range);
        // A drag too short to be a zoom leaves the range alone — see
        // draggedRange for why that is a click rather than an error.
        if (next) setRange(next);
      }
      setDragFrom(null);
      setSel(null);
    },
    // plotArea closes over width/gutterLeft/plotWidth, all stable for a given
    // render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragFrom, range, width, gutterLeft, plotWidth],
  );

  const resetZoom = useCallback(() => setRange(NATURAL_RANGE), []);

  return (
    <div className="ir-plot-wrap">
      <svg
        ref={svgRef}
        className={`ir-plot${zoomable ? " ir-plot--zoomable" : ""}`}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("ir.plotLabel")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Shaded diagnostic ranges, one lane each so overlapping ranges stay legible. */}
        {bands.map(({ band }, index) => {
          const left = wnToX(band.max);
          const right = wnToX(band.min);
          if (right < gutterLeft || left > right) return null;
          return (
            <g key={band.key}>
              <rect
                x={Math.max(gutterLeft, left)}
                y={top}
                width={Math.max(1, Math.min(right, right) - Math.max(gutterLeft, left))}
                height={floor - top}
                className={`ir-plot__band${band.broad ? " is-broad" : ""}`}
              />
              <text
                x={Math.min(right - 2, Math.max(gutterLeft + 2, (left + right) / 2))}
                y={top + 9 + index * 9}
                className="ir-plot__bandLabel"
              >
                {t(`ir.band.${band.key}`)}
              </text>
            </g>
          );
        })}

        {/* Transmittance axis, labelled in percent as a real IR spectrum is. */}
        {yTicks.map((pct) => (
          <g key={pct}>
            <line
              x1={gutterLeft - 4}
              y1={tToY(pct / 100)}
              x2={gutterLeft}
              y2={tToY(pct / 100)}
              className="ir-plot__axis"
            />
            <text
              x={gutterLeft - 6}
              y={tToY(pct / 100) + 2.5}
              className="ir-plot__tick ir-plot__tick--y"
              textAnchor="end"
            >
              {pct}
            </text>
          </g>
        ))}

        <line x1={gutterLeft} y1={floor} x2={width} y2={floor} className="ir-plot__axis" />
        <line x1={gutterLeft} y1={top} x2={width} y2={top} className="ir-plot__axis" />
        {ticks.map((wn) => {
          const x = wnToX(wn);
          if (x < gutterLeft - 1 || x > width + 1) return null;
          return (
            <text
              key={wn}
              x={x}
              y={floor + 9}
              className="ir-plot__tick ir-plot__tick--x"
              textAnchor={x < gutterLeft + 2 ? "start" : x > width - 2 ? "end" : "middle"}
            >
              {wn}
            </text>
          );
        })}

        {/* Axis titles, so the numbers are never left to be guessed at. */}
        {detailed && (
          <>
            <text x={width} y={height - 2} className="ir-plot__axisTitle" textAnchor="end">
              {t("ir.axisWavenumber")}
            </text>
            <text
              x={-(top + (floor - top) / 2)}
              y={11}
              className="ir-plot__axisTitle"
              textAnchor="middle"
              transform="rotate(-90)"
            >
              {t("ir.axisTransmittance")}
            </text>
          </>
        )}

        {sel && (
          <rect x={sel.x} y={top} width={sel.width} height={floor - top} className="ir-plot__selection" />
        )}

        <path d={`${path} L${right},${floor} L${gutterLeft},${floor} Z`} className="ir-plot__fill" />
        <path d={path} className="ir-plot__line" />
      </svg>

      {zoomed && (
        <button type="button" className="ir-plot__reset" onClick={resetZoom}>
          {t("ir.resetZoom")}
        </button>
      )}
    </div>
  );
}