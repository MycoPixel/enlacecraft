import { useCallback, useRef } from "react";
import type { Annotation, BracketAnnotation, Molecule, Point } from "../../types/chemistry";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { snapAnnotationMove } from "./annotationSnap";

interface BracketAnnotationViewProps {
  annotation: BracketAnnotation;
  selected: boolean;
  viewScale: number;
}

type Snapshot = { molecule: Molecule; annotations: Record<string, Annotation> };

const MIN_SIZE = 10;

/**
 * Builds a vertical curly-brace path whose two straight-line anchor points
 * sit at (anchorX, yTop) and (anchorX, yBottom), with the brace's pointed
 * tip at (anchorX + protrude, midY). Classic 2-cubic construction adapted
 * from the well-known "makeCurlyBrace" formula.
 */
function curlyBracePath(anchorX: number, yTop: number, yBottom: number, protrude: number, q = 0.6): string {
  const len = yBottom - yTop;
  const w = -protrude;
  const dy = -1;
  const qx1 = anchorX + q * w * dy;
  const qy1 = yTop;
  const qx2 = anchorX + (1 - q) * w * dy;
  const qy2 = yTop + 0.25 * len;
  const tx = anchorX + w * dy;
  const ty = yTop + 0.5 * len;
  const qx3 = anchorX + q * w * dy;
  const qy3 = yBottom;
  const qx4 = anchorX + (1 - q) * w * dy;
  const qy4 = yTop + 0.75 * len;
  return `M ${anchorX} ${yTop} Q ${qx1} ${qy1} ${qx2} ${qy2} T ${tx} ${ty} M ${anchorX} ${yBottom} Q ${qx3} ${qy3} ${qx4} ${qy4} T ${tx} ${ty}`;
}

export function bracketPath(ann: BracketAnnotation): string {
  const { x, y, width: w, height: h, variant, facing } = ann;
  const open = facing === "open";

  if (variant === "square") {
    const strokeX = open ? x : x + w;
    const tickToX = open ? x + w : x;
    return `M ${tickToX},${y} L ${strokeX},${y} L ${strokeX},${y + h} L ${tickToX},${y + h}`;
  }

  if (variant === "paren") {
    const anchorX = open ? x + w : x;
    const peakX = open ? x : x + w;
    return `M ${anchorX},${y} C ${peakX},${y + h * 0.15} ${peakX},${y + h * 0.85} ${anchorX},${y + h}`;
  }

  // curly — anchor sits on the edge that abuts the enclosed content and the
  // brace curls inward (toward the other glyph), so "open" on the left of a
  // pair faces right and "close" on the right faces left. The protrusion is
  // deliberately inverted relative to anchorX so the tip lands on the far
  // side of the anchor.
  const anchorX = open ? x + w : x;
  const protrude = open ? -w : w;
  return curlyBracePath(anchorX, y, y + h, protrude);
}

/**
 * A single resizable bracket glyph: "(", ")", "[", "]", "{", or "}". Place
 * one "open" and one "close" facing on either side of a fragment to enclose
 * it. Drag the body to move; drag the bottom-right handle (shown once
 * selected) to resize both width (curve thickness) and height.
 */
export function BracketAnnotationView({ annotation, selected, viewScale }: BracketAnnotationViewProps) {
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);
  const moveAnnotationTransient = useMoleculeStore((s) => s.moveAnnotationTransient);
  const moveAnnotationsTransient = useMoleculeStore((s) => s.moveAnnotationsTransient);
  const updateBracketSize = useMoleculeStore((s) => s.updateBracketSize);
  const commitCheckpoint = useMoleculeStore((s) => s.commitCheckpoint);
  const deleteAnnotation = useMoleculeStore((s) => s.deleteAnnotation);

  const dragRef = useRef<
    | { kind: "move"; startClient: Point; origin: Point; before: Snapshot }
    | { kind: "group"; startClient: Point; origins: Record<string, Annotation>; before: Snapshot }
    | { kind: "resize"; startClient: Point; startSize: { width: number; height: number }; before: Snapshot }
    | null
  >(null);

  const onBodyPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const store = useMoleculeStore.getState();
    if (store.tool === "erase") {
      deleteAnnotation(annotation.id);
      return;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    let nextIds: Set<string>;
    if (e.shiftKey) {
      nextIds = new Set(store.selectedAnnotationIds);
      if (nextIds.has(annotation.id)) nextIds.delete(annotation.id);
      else nextIds.add(annotation.id);
    } else if (store.selectedAnnotationIds.has(annotation.id) && store.selectedAnnotationIds.size > 1) {
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
      kind: "move",
      startClient: { x: e.clientX, y: e.clientY },
      origin: { x: annotation.x, y: annotation.y },
      before: store.snapshotBefore(),
    };
  }, [annotation.id, annotation.x, annotation.y, deleteAnnotation, setSelectedAnnotationIds]);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const store = useMoleculeStore.getState();
    dragRef.current = {
      kind: "resize",
      startClient: { x: e.clientX, y: e.clientY },
      startSize: { width: annotation.width, height: annotation.height },
      before: store.snapshotBefore(),
    };
  }, [annotation.width, annotation.height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "move") {
      const dx = (e.clientX - drag.startClient.x) / viewScale;
      const dy = (e.clientY - drag.startClient.y) / viewScale;
      moveAnnotationTransient(
        annotation.id,
        snapAnnotationMove(annotation.id, { x: drag.origin.x + dx, y: drag.origin.y + dy }, e.shiftKey),
      );
      return;
    }
    if (drag.kind === "group") {
      const dx = (e.clientX - drag.startClient.x) / viewScale;
      const dy = (e.clientY - drag.startClient.y) / viewScale;
      moveAnnotationsTransient(drag.origins, dx, dy);
      return;
    }
    const dw = (e.clientX - drag.startClient.x) / viewScale;
    const dh = (e.clientY - drag.startClient.y) / viewScale;
    updateBracketSize(annotation.id, Math.max(MIN_SIZE, drag.startSize.width + dw), Math.max(MIN_SIZE, drag.startSize.height + dh));
  }, [annotation.id, moveAnnotationTransient, moveAnnotationsTransient, updateBracketSize, viewScale]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    commitCheckpoint(drag.before);
  }, [commitCheckpoint]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteAnnotation(annotation.id);
    }
  }, [annotation.id, deleteAnnotation]);

  // Always the bracket's real color — selection is shown via the separate,
  // export-excluded resize handle below, never by recoloring the glyph
  // itself (which would otherwise bake the selection color into any
  // copy/export made while it's selected — the normal case for a copy).
  const color = "var(--ink)";
  const { x, y, width, height } = annotation;
  const strokeWidth = Math.max(1.4, Math.min(2.2, width * 0.14));

  return (
    <g tabIndex={selected ? 0 : -1} onKeyDown={onKeyDown} style={{ outline: "none" }} data-annotation-id={annotation.id}>
      {/* Wide invisible hit-area so the glyph is easy to grab even though the stroke itself is thin. */}
      <rect
        x={x - 6} y={y - 6} width={width + 12} height={height + 12}
        fill="transparent"
        onPointerDown={onBodyPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: "move" }}
      />
      <path d={bracketPath(annotation)} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />

      {selected && (
        <rect
          x={x + width - 4} y={y + height - 4} width={10} height={10}
          fill="var(--accent)"
          data-export-exclude="true"
          onPointerDown={onResizePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: "nwse-resize" }}
        />
      )}
    </g>
  );
}
