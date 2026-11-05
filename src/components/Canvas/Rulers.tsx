import { useMoleculeStore } from "../../store/useMoleculeStore";
import { worldUnitsPerRulerUnit, type RulerUnit } from "../../model/pageSetup";
import { useT } from "../../i18n/useT";

const RULER_SIZE = 22;
/** Minimum on-screen spacing between labelled ticks, in CSS pixels. */
const MIN_LABEL_GAP = 48;
const STEP_CANDIDATES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 5_000, 10_000];

/** Picks the smallest "nice" step (in ruler units) that keeps labels apart. */
export function rulerStep(pxPerUnit: number): number {
  for (const step of STEP_CANDIDATES) {
    if (step * pxPerUnit >= MIN_LABEL_GAP) return step;
  }
  return STEP_CANDIDATES[STEP_CANDIDATES.length - 1];
}

/** Formats a tick value without trailing zeros. */
export function formatRulerValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

interface Tick {
  /** Screen position along the ruler, in CSS pixels. */
  position: number;
  major: boolean;
  label?: string;
}

/**
 * Builds the ticks for one ruler axis.
 *
 * `worldStart`/`worldEnd` are the visible world coordinates at the ruler's
 * two ends; screen = world * scale + offset. Minor ticks subdivide each
 * labelled step into five, which is enough to read a position without
 * turning the ruler into a solid band of lines.
 */
export function rulerTicks(
  worldStart: number,
  worldEnd: number,
  scale: number,
  offset: number,
  unitsPerWorld: number,
  pxPerUnit: number
): Tick[] {
  const stepUnits = rulerStep(pxPerUnit);
  const stepWorld = stepUnits * unitsPerWorld;
  const minorWorld = stepWorld / 5;
  if (!Number.isFinite(minorWorld) || minorWorld <= 0) return [];

  const firstIndex = Math.ceil(Math.min(worldStart, worldEnd) / minorWorld);
  const lastIndex = Math.floor(Math.max(worldStart, worldEnd) / minorWorld);
  const ticks: Tick[] = [];
  // A runaway loop here would lock the UI; the visible span divided by a
  // positive minor step can't legitimately need more than a few thousand.
  if (lastIndex - firstIndex > 5_000) return [];
  for (let index = firstIndex; index <= lastIndex; index++) {
    const world = index * minorWorld;
    const major = index % 5 === 0;
    ticks.push({
      position: world * scale + offset,
      major,
      label: major ? formatRulerValue(world / unitsPerWorld) : undefined,
    });
  }
  return ticks;
}

function unitLabel(t: ReturnType<typeof useT>, unit: RulerUnit): string {
  return unit === "mm" ? t("ruler.mm") : unit === "in" ? t("ruler.in") : t("ruler.bond");
}

/**
 * Millimetre/inch/bond rulers plus an optional crosshair, overlaid on the
 * canvas. Everything here is a view aid: it is rendered outside the canvas
 * SVG (so `buildExportClone` never sees it) and has `pointer-events: none`,
 * so it can't interfere with drawing or selection.
 *
 * The ruler is physical rather than screen-relative: it uses the page's own
 * bond length (see worldUnitsPerRulerUnit), which is the same scale CDXML
 * and PDF export use. Zooming the canvas therefore zooms the ruler with the
 * drawing, as expected.
 */
export function Rulers() {
  const t = useT();
  const showRulers = useMoleculeStore((s) => s.showRulers);
  const showCrosshair = useMoleculeStore((s) => s.showCrosshair);
  const unit = useMoleculeStore((s) => s.rulerUnit);
  const page = useMoleculeStore((s) => s.page);
  const view = useMoleculeStore((s) => s.view);
  const hoverPoint = useMoleculeStore((s) => s.hoverPoint);
  const canvasSize = useMoleculeStore((s) => s.canvasSize);

  if (!showRulers && !showCrosshair) return null;

  const unitsPerWorld = worldUnitsPerRulerUnit(page, unit);
  const pxPerUnit = view.scale / unitsPerWorld;
  const width = canvasSize.width;
  const height = canvasSize.height;

  const startWorldX = (0 - view.tx) / view.scale;
  const endWorldX = (width - view.tx) / view.scale;
  const startWorldY = (0 - view.ty) / view.scale;
  const endWorldY = (height - view.ty) / view.scale;
  const xTicks = showRulers ? rulerTicks(startWorldX, endWorldX, view.scale, view.tx, unitsPerWorld, pxPerUnit) : [];
  const yTicks = showRulers ? rulerTicks(startWorldY, endWorldY, view.scale, view.ty, unitsPerWorld, pxPerUnit) : [];

  const crosshairX = hoverPoint ? hoverPoint.x * view.scale + view.tx : null;
  const crosshairY = hoverPoint ? hoverPoint.y * view.scale + view.ty : null;

  return (
    <svg className="canvas-rulers" width={width} height={height} aria-hidden="true" focusable="false">
      {showCrosshair && crosshairX !== null && crosshairY !== null && (
        <g className="canvas-crosshair" pointerEvents="none">
          <line x1={crosshairX} y1={0} x2={crosshairX} y2={height} />
          <line x1={0} y1={crosshairY} x2={width} y2={crosshairY} />
        </g>
      )}

      {showRulers && (
        <>
          <g className="canvas-ruler canvas-ruler--top">
            <rect x={0} y={0} width={width} height={RULER_SIZE} />
            {xTicks.map((tick, index) => (
              <g key={`x-${index}`}>
                <line
                  x1={tick.position}
                  y1={RULER_SIZE}
                  x2={tick.position}
                  y2={tick.major ? RULER_SIZE - 9 : RULER_SIZE - 4}
                />
                {tick.label !== undefined && (
                  <text x={tick.position + 3} y={RULER_SIZE - 11}>{tick.label}</text>
                )}
              </g>
            ))}
            <line x1={0} y1={RULER_SIZE - 0.5} x2={width} y2={RULER_SIZE - 0.5} className="canvas-ruler__edge" />
          </g>

          <g className="canvas-ruler canvas-ruler--left">
            <rect x={0} y={0} width={RULER_SIZE} height={height} />
            {yTicks.map((tick, index) => (
              <g key={`y-${index}`}>
                <line
                  x1={RULER_SIZE}
                  y1={tick.position}
                  x2={tick.major ? RULER_SIZE - 9 : RULER_SIZE - 4}
                  y2={tick.position}
                />
                {tick.label !== undefined && (
                  <text
                    x={RULER_SIZE - 11}
                    y={tick.position + 3}
                    transform={`rotate(-90 ${RULER_SIZE - 11} ${tick.position + 3})`}
                  >
                    {tick.label}
                  </text>
                )}
              </g>
            ))}
            <line x1={RULER_SIZE - 0.5} y1={0} x2={RULER_SIZE - 0.5} y2={height} className="canvas-ruler__edge" />
          </g>

          <g className="canvas-ruler canvas-ruler--corner">
            <rect x={0} y={0} width={RULER_SIZE} height={RULER_SIZE} />
            <text x={RULER_SIZE / 2} y={RULER_SIZE / 2 + 3} textAnchor="middle">{unitLabel(t, unit)}</text>
          </g>
        </>
      )}
    </svg>
  );
}
