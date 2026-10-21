import { useCallback, useRef } from "react";
import type { ArrowAnnotation, Annotation, Molecule, Point } from "../../types/chemistry";
import { useMoleculeStore } from "../../store/useMoleculeStore";

interface ArrowAnnotationViewProps {
  annotation: ArrowAnnotation;
  selected: boolean;
  viewScale: number;
}

type Snapshot = { molecule: Molecule; annotations: Record<string, Annotation> };

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

  const markerId = annotation.barb === "single" ? "arrowhead-fishhook" : `arrowhead-${annotation.headSize ?? "medium"}`;
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
  // Dashed-shaft option (see ArrowAnnotation.dashed) — applies to the
  // straight variants only; curved arrows ignore it.
  const dashAttrs = annotation.dashed && !isCurved ? { strokeDasharray: "6 4" } : {};

  return (
    <g
      tabIndex={selected ? 0 : -1}
      onKeyDown={onKeyDown}
      style={{ outline: "none" }}
      data-annotation-id={annotation.id}
    >
      {/* Wide invisible hit-area so the arrow is easy to grab. */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "move" }} />

      {variant === "forward" && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.6} markerEnd={`url(#${markerId})`} pointerEvents="none" {...dashAttrs} />
      )}

      {isCurved && (
        <>
          {/* Wide invisible hit-area following the curve, so the arrow stays easy to grab even when heavily bowed. */}
          <path d={`M ${x1},${y1} Q ${midX},${midY} ${x2},${y2}`} stroke="transparent" strokeWidth={16} fill="none" onPointerDown={onBodyPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ cursor: "move" }} />
          <path d={`M ${x1},${y1} Q ${midX},${midY} ${x2},${y2}`} stroke={color} strokeWidth={1.6} fill="none" markerEnd={`url(#${markerId})`} pointerEvents="none" />
        </>
      )}

      {variant === "resonance" && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.6} markerEnd={`url(#${markerId})`} markerStart={`url(#${markerId})`} pointerEvents="none" {...dashAttrs} />
      )}

      {variant === "retrosynthetic" && (() => {
        // The disconnection arrow of retrosynthetic analysis: a double-shaft
        // arrow with a large OPEN (bar-only, unfilled) head pointing back at
        // the precursor. Drawn with plain strokes rather than the fill
        // markers the other variants use, so the head stays open and the
        // two shafts stay parallel regardless of zoom.
        const o = 2.6; // half-spacing between the two shafts
        const headLen = Math.min(16, len * 0.3); // shaft-to-tip distance of the open head
        const headHalf = Math.min(7, len * 0.16); // half-width of the open head's bar
        const ux = dx / len, uy = dy / len;
        const tipX = x2, tipY = y2;
        return (
          <g stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" {...dashAttrs}>
            <line x1={x1 + nx * o} y1={y1 + ny * o} x2={x2 + nx * o} y2={y2 + ny * o} />
            <line x1={x1 - nx * o} y1={y1 - ny * o} x2={x2 - nx * o} y2={y2 - ny * o} />
            {/* Open head: two bars from the tip, one hugging each shaft's side. */}
            <line
              x1={tipX} y1={tipY}
              x2={tipX - ux * headLen + nx * headHalf}
              y2={tipY - uy * headLen + ny * headHalf}
            />
            <line
              x1={tipX} y1={tipY}
              x2={tipX - ux * headLen - nx * headHalf}
              y2={tipY - uy * headLen - ny * headHalf}
            />
          </g>
        );
      })()}

      {variant === "equilibrium" && (
        <>
          {/* Top line points from start toward end (right, in the arrow's own direction). */}
          <line
            x1={x1 - nx * gap} y1={y1 - ny * gap} x2={x2 - nx * gap} y2={y2 - ny * gap}
            stroke={color} strokeWidth={1.4} markerEnd={`url(#${markerId})`} pointerEvents="none" {...dashAttrs}
          />
          {/* Bottom line points the opposite way (from end back toward start). */}
          <line
            x1={x2 + nx * gap} y1={y2 + ny * gap} x2={x1 + nx * gap} y2={y1 + ny * gap}
            stroke={color} strokeWidth={1.4} markerEnd={`url(#${markerId})`} pointerEvents="none" {...dashAttrs}
          />
        </>
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
