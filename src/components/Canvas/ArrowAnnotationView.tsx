import { useCallback, useRef } from "react";
import type { ArrowAnnotation, Annotation, Molecule, Point } from "../../types/chemistry";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { effectiveArrowHead, effectiveArrowShaft, effectiveArrowTail, type ArrowHeadStyle, type ArrowShaftStyle, type ArrowTailStyle } from "../../model/arrowStyle";

interface ArrowAnnotationViewProps {
  annotation: ArrowAnnotation;
  selected: boolean;
  viewScale: number;
}

type Snapshot = { molecule: Molecule; annotations: Record<string, Annotation> };

type ArrowHeadSize = NonNullable<ArrowAnnotation["headSize"]>;

const HEAD_LENGTH: Record<ArrowHeadSize, number> = { small: 8, medium: 12, large: 16 };
const HEAD_HALF: Record<ArrowHeadSize, number> = { small: 4, medium: 6, large: 8 };

/** One arrowhead, drawn explicitly rather than with an SVG marker so it
 * works the same on single, double, bold and dashed shafts (markers inherit
 * the stroke width, which made a bold arrow's head absurdly large). */
function ArrowHeadGlyph({
  style, tipX, tipY, ux, uy, nx, ny, size, color,
}: {
  style: ArrowHeadStyle; tipX: number; tipY: number;
  ux: number; uy: number; nx: number; ny: number;
  size: ArrowHeadSize; color: string;
}) {
  const headLen = HEAD_LENGTH[size];
  const headHalf = HEAD_HALF[size];
  if (style === "full") {
    return (
      <polygon
        points={`${tipX},${tipY} ${tipX - ux * headLen + nx * headHalf},${tipY - uy * headLen + ny * headHalf} ${tipX - ux * headLen - nx * headHalf},${tipY - uy * headLen - ny * headHalf}`}
        fill={color}
      />
    );
  }
  if (style === "open" || style === "retro") {
    const scale = style === "retro" ? 1.15 : 1;
    return (
      <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={tipX} y1={tipY} x2={tipX - ux * headLen * scale + nx * headHalf} y2={tipY - uy * headLen * scale + ny * headHalf} />
        <line x1={tipX} y1={tipY} x2={tipX - ux * headLen * scale - nx * headHalf} y2={tipY - uy * headLen * scale - ny * headHalf} />
      </g>
    );
  }
  if (style === "half") {
    // Single-electron fishhook: one barb curling in from the side.
    const baseX = tipX - ux * headLen * 0.75 - nx * headHalf * 0.9;
    const baseY = tipY - uy * headLen * 0.75 - ny * headHalf * 0.9;
    const ctrlX = tipX - ux * headLen * 0.25 - nx * headHalf * 0.45;
    const ctrlY = tipY - uy * headLen * 0.25 - ny * headHalf * 0.45;
    return (
      <path d={`M ${baseX},${baseY} Q ${ctrlX},${ctrlY} ${tipX},${tipY}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    );
  }
  if (style === "circle") {
    return <circle cx={tipX} cy={tipY} r={headHalf * 0.75} fill="none" stroke={color} strokeWidth={1.6} />;
  }
  // diamond
  const half = headHalf * 0.8;
  return (
    <polygon
      points={`${tipX},${tipY} ${tipX - ux * headLen * 0.5 + nx * half},${tipY - uy * headLen * 0.5 + ny * half} ${tipX - ux * headLen},${tipY - uy * headLen} ${tipX - ux * headLen * 0.5 - nx * half},${tipY - uy * headLen * 0.5 - ny * half}`}
      fill={color}
    />
  );
}

/** Tail feather at the arrow's start, pointing back away from the shaft. */
function ArrowTailGlyph({
  style, startX, startY, ux, uy, nx, ny, size, color,
}: {
  style: ArrowTailStyle; startX: number; startY: number;
  ux: number; uy: number; nx: number; ny: number;
  size: ArrowHeadSize; color: string;
}) {
  if (style === "none") return null;
  const headLen = HEAD_LENGTH[size];
  const headHalf = HEAD_HALF[size];
  if (style === "full") {
    return (
      <polygon
        points={`${startX},${startY} ${startX + ux * headLen + nx * headHalf},${startY + uy * headLen + ny * headHalf} ${startX + ux * headLen - nx * headHalf},${startY + uy * headLen - ny * headHalf}`}
        fill={color}
      />
    );
  }
  if (style === "open") {
    return (
      <g stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={startX} y1={startY} x2={startX + ux * headLen + nx * headHalf} y2={startY + uy * headLen + ny * headHalf} />
        <line x1={startX} y1={startY} x2={startX + ux * headLen - nx * headHalf} y2={startY + uy * headLen - ny * headHalf} />
      </g>
    );
  }
  // half
  const baseX = startX + ux * headLen * 0.75 + nx * headHalf * 0.9;
  const baseY = startY + uy * headLen * 0.75 + ny * headHalf * 0.9;
  const ctrlX = startX + ux * headLen * 0.25 + nx * headHalf * 0.45;
  const ctrlY = startY + uy * headLen * 0.25 + ny * headHalf * 0.45;
  return (
    <path d={`M ${baseX},${baseY} Q ${ctrlX},${ctrlY} ${startX},${startY}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  );
}

function arrowShaftWidth(shaft: ArrowShaftStyle): number {
  return shaft === "bold" ? 4 : 1.6;
}

/** A straight arrow assembled from the effective shaft/head/tail styles. */
function StraightArrow({
  fromX, fromY, toX, toY, shaft, head, tail, size, color,
}: {
  fromX: number; fromY: number; toX: number; toY: number;
  shaft: ArrowShaftStyle; head: ArrowHeadStyle; tail: ArrowTailStyle;
  size: ArrowHeadSize; color: string;
}) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const headLen = HEAD_LENGTH[size];
  // Circle and diamond termini are drawn at the very tip, so the shaft has
  // to stop short of them instead of poking through the glyph.
  const headInset = head === "circle" ? HEAD_HALF[size] * 0.75 : head === "diamond" ? headLen : 0;
  const tailInset = tail === "none" ? 0 : tail === "half" ? headLen * 0.75 : headLen;
  const beginX = fromX + ux * tailInset;
  const beginY = fromY + uy * tailInset;
  const endX = toX - ux * headInset;
  const endY = toY - uy * headInset;
  const offsets = shaft === "double" ? [-2.2, 2.2] : [0];
  return (
    <>
      <g stroke={color} strokeWidth={arrowShaftWidth(shaft)} strokeLinecap="round" fill="none">
        {offsets.map((o, i) => (
          <line
            key={i}
            x1={beginX + nx * o} y1={beginY + ny * o}
            x2={endX + nx * o} y2={endY + ny * o}
            strokeDasharray={shaft === "dashed" ? "6 4" : undefined}
          />
        ))}
      </g>
      <ArrowHeadGlyph style={head} tipX={toX} tipY={toY} ux={ux} uy={uy} nx={nx} ny={ny} size={size} color={color} />
      <ArrowTailGlyph style={tail} startX={fromX} startY={fromY} ux={ux} uy={uy} nx={nx} ny={ny} size={size} color={color} />
    </>
  );
}

/** Screen-space pointer delta converted to world units, given the current view scale. */
function worldDelta(e: React.PointerEvent, start: { x: number; y: number }, scale: number): Point {
  return { x: (e.clientX - start.x) / scale, y: (e.clientY - start.y) / scale };
}

/**
 * A draggable, editable reaction arrow. The body can be dragged to move the
 * whole arrow; the two endpoint handles (shown once selected) can be dragged
 * independently to resize/reorient it. For "curved"/"curvedReverse", a third
 * handle at the curve's control point can be dragged to increase or decrease
 * how much it bows. Style is changed via the sidebar's ArrowVariantPicker
 * while this arrow is selected.
 */
export function ArrowAnnotationView({ annotation, selected, viewScale }: ArrowAnnotationViewProps) {
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const moveAnnotationTransient = useMoleculeStore((s) => s.moveAnnotationTransient);
  const moveAnnotationsTransient = useMoleculeStore((s) => s.moveAnnotationsTransient);
  const updateArrowEndpointTransient = useMoleculeStore((s) => s.updateArrowEndpointTransient);
  const updateArrowCurvatureTransient = useMoleculeStore((s) => s.updateArrowCurvatureTransient);
  const commitCheckpoint = useMoleculeStore((s) => s.commitCheckpoint);
  const deleteAnnotation = useMoleculeStore((s) => s.deleteAnnotation);

  const dragRef = useRef<
    | { kind: "body"; startClient: Point; origin: { x1: number; y1: number; x2: number; y2: number }; before: Snapshot }
    | { kind: "group"; startClient: Point; origins: Record<string, Annotation>; before: Snapshot }
    | { kind: "start" | "end" | "curve"; before: Snapshot }
    | null
  >(null);

  const onBodyPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const store = useMoleculeStore.getState();
    if (store.tool === "erase") {
      deleteAnnotation(annotation.id);
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);

    let nextIds: Set<string>;
    if (e.shiftKey) {
      nextIds = new Set(store.selectedAnnotationIds);
      if (nextIds.has(annotation.id)) nextIds.delete(annotation.id);
      else nextIds.add(annotation.id);
    } else if (store.selectedAnnotationIds.has(annotation.id) && store.selectedAnnotationIds.size > 1) {
      // Clicking (without shift) on a member of an existing multi-selection
      // keeps the whole group selected, so it can be dragged as one unit.
      nextIds = new Set(store.selectedAnnotationIds);
    } else {
      nextIds = new Set([annotation.id]);
    }
    setSelectedAnnotationIds(nextIds);

    if (nextIds.size > 1 && nextIds.has(annotation.id)) {
      const origins: Record<string, Annotation> = {};
      nextIds.forEach((id) => {
        const ann = store.annotations[id];
        if (ann) origins[id] = ann;
      });
      dragRef.current = { kind: "group", startClient: { x: e.clientX, y: e.clientY }, origins, before: store.snapshotBefore() };
      return;
    }

    dragRef.current = {
      kind: "body",
      startClient: { x: e.clientX, y: e.clientY },
      origin: { x1: annotation.x1, y1: annotation.y1, x2: annotation.x2, y2: annotation.y2 },
      before: store.snapshotBefore(),
    };
  }, [annotation, deleteAnnotation, setSelectedAnnotationIds]);

  const onHandlePointerDown = useCallback((which: "start" | "end" | "curve") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const store = useMoleculeStore.getState();
    setSelectedAnnotationIds(new Set([annotation.id]));
    dragRef.current = { kind: which, before: store.snapshotBefore() };
  }, [annotation.id, setSelectedAnnotationIds]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const { view } = useMoleculeStore.getState();
    const pt: Point = { x: (e.clientX - rect.left - view.tx) / view.scale, y: (e.clientY - rect.top - view.ty) / view.scale };

    if (drag.kind === "body") {
      const d = worldDelta(e, drag.startClient, viewScale);
      moveAnnotationTransient(annotation.id, { x: drag.origin.x1 + d.x, y: drag.origin.y1 + d.y });
      return;
    }
    if (drag.kind === "group") {
      const d = worldDelta(e, drag.startClient, viewScale);
      moveAnnotationsTransient(drag.origins, d.x, d.y);
      return;
    }
    if (drag.kind === "curve") {
      const x1 = annotation.x1, y1 = annotation.y1, x2 = annotation.x2, y2 = annotation.y2;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len;
      const ny = (x2 - x1) / len;
      const midX0 = (x1 + x2) / 2;
      const midY0 = (y1 + y2) / 2;
      const proj = (pt.x - midX0) * nx + (pt.y - midY0) * ny;
      const nextCurvature = Math.max(4, Math.min(len * 1.5, Math.abs(proj)));
      updateArrowCurvatureTransient(annotation.id, nextCurvature);
      return;
    }
    updateArrowEndpointTransient(annotation.id, drag.kind, pt);
  }, [annotation.id, annotation.x1, annotation.y1, annotation.x2, annotation.y2, moveAnnotationTransient, moveAnnotationsTransient, updateArrowEndpointTransient, updateArrowCurvatureTransient, viewScale]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    commitCheckpoint(drag.before);
  }, [commitCheckpoint]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteAnnotation(annotation.id);
    }
  }, [annotation.id, deleteAnnotation]);

  // Always the arrow's real color — selection is shown with separate,
  // export-excluded handles below, never by recoloring the arrow itself.
  // Otherwise a copy/export made while the arrow happens to be selected
  // (the normal case, since that's how you select something to copy it)
  // would permanently bake the selection-highlight color into the result.
  const color = "var(--ink)";

  const { x1, y1, x2, y2, variant } = annotation;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const gap = 4; // half-spacing between the two lines of an equilibrium arrow
  const curveSign = variant === "curvedReverse" ? -1 : 1;
  const bow = (annotation.curvature ?? len * 0.22) * curveSign;
  const midX = (x1 + x2) / 2 + nx * bow;
  const midY = (y1 + y2) / 2 + ny * bow;
  const isCurved = variant === "curved" || variant === "curvedReverse";

  // The canvas honours the same effective styles CDXML export writes, so
  // head/tail/shaft overrides set from the picker (or imported from a real
  // ChemDraw file) actually change what is drawn.
  const shaft = effectiveArrowShaft(annotation);
  const head = effectiveArrowHead(annotation);
  const tail = effectiveArrowTail(annotation);
  const size = annotation.headSize ?? "medium";
  // An equilibrium arrow already has two shafts; a double shaft would draw
  // four. Fall back to one line per harpoon.
  const pairShaft = shaft === "double" ? "solid" : shaft;

  // The tangent at the end of a quadratic Bézier is (end - control); use
  // that to orient the head/tail on a curved arrow.
  const endTanLen = Math.hypot(x2 - midX, y2 - midY) || 1;
  const endUx = (x2 - midX) / endTanLen;
  const endUy = (y2 - midY) / endTanLen;
  const startTanLen = Math.hypot(midX - x1, midY - y1) || 1;
  const startUx = (midX - x1) / startTanLen;
  const startUy = (midY - y1) / startTanLen;

  return (
    <g
      tabIndex={selected ? 0 : -1}
      onKeyDown={onKeyDown}
      style={{ outline: "none" }}
      data-annotation-id={annotation.id}
    >
      {/* Wide invisible hit-area so the arrow is easy to grab. */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "move" }} />

      {isCurved && (
        <>
          {/* Wide invisible hit-area following the curve, so the arrow stays easy to grab even when heavily bowed. */}
          <path d={`M ${x1},${y1} Q ${midX},${midY} ${x2},${y2}`} stroke="transparent" strokeWidth={16} fill="none" onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "move" }} />
          <g pointerEvents="none">
            <path
              d={`M ${x1},${y1} Q ${midX},${midY} ${x2},${y2}`}
              stroke={color}
              strokeWidth={arrowShaftWidth(shaft)}
              strokeDasharray={shaft === "dashed" ? "6 4" : undefined}
              fill="none"
            />
            <ArrowHeadGlyph style={head} tipX={x2} tipY={y2} ux={endUx} uy={endUy} nx={-endUy} ny={endUx} size={size} color={color} />
            <ArrowTailGlyph style={tail} startX={x1} startY={y1} ux={startUx} uy={startUy} nx={-startUy} ny={startUx} size={size} color={color} />
          </g>
        </>
      )}

      {variant === "equilibrium" && (
        <g pointerEvents="none">
          {/* Top line points from start toward end (right, in the arrow's own direction). */}
          <StraightArrow
            fromX={x1 - nx * gap} fromY={y1 - ny * gap}
            toX={x2 - nx * gap} toY={y2 - ny * gap}
            shaft={pairShaft} head={head} tail="none" size={size} color={color}
          />
          {/* Bottom line points the opposite way (from end back toward start). */}
          <StraightArrow
            fromX={x2 + nx * gap} fromY={y2 + ny * gap}
            toX={x1 + nx * gap} toY={y1 + ny * gap}
            shaft={pairShaft} head={head} tail="none" size={size} color={color}
          />
        </g>
      )}

      {variant === "resonance" && (
        <g pointerEvents="none">
          <StraightArrow
            fromX={x1} fromY={y1} toX={x2} toY={y2}
            shaft={shaft} head={head}
            tail={head === "half" ? "half" : head === "open" ? "open" : "full"}
            size={size} color={color}
          />
        </g>
      )}

      {!isCurved && variant !== "equilibrium" && variant !== "resonance" && (
        <g pointerEvents="none">
          <StraightArrow
            fromX={x1} fromY={y1} toX={x2} toY={y2}
            shaft={shaft} head={head} tail={tail} size={size} color={color}
          />
        </g>
      )}

      {selected && (
        <>
          <circle cx={x1} cy={y1} r={5} fill="var(--panel)" stroke="var(--accent)" strokeWidth={1.6} data-export-exclude="true" onPointerDown={onHandlePointerDown("start")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "grab" }} />
          <circle cx={x2} cy={y2} r={5} fill="var(--panel)" stroke="var(--accent)" strokeWidth={1.6} data-export-exclude="true" onPointerDown={onHandlePointerDown("end")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "grab" }} />
          {isCurved && (
            <circle cx={midX} cy={midY} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={1.6} data-export-exclude="true" onPointerDown={onHandlePointerDown("curve")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "grab" }} />
          )}
        </>
      )}
    </g>
  );
}
