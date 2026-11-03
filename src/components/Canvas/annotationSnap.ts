import { useMoleculeStore } from "../../store/useMoleculeStore";
import { snapPoint } from "../../model/geometry";
import {
  ALIGNMENT_GUIDE_THRESHOLD,
  alignBounds,
  annotationBoundsAt,
  collectAlignmentTargets,
  pointBounds,
  type Bounds,
} from "../../model/alignmentGuides";
import type { Point } from "../../types/chemistry";

/**
 * The two kinds of smart snapping an annotation drag can use:
 *
 * - `snapAnnotationMove` moves a whole annotation, so its *bounds* are what
 *   line up with neighbouring objects.
 * - `snapAnnotationEndpoint` moves an arrow's start/end, so the endpoint
 *   itself is the thing that aligns.
 *
 * Both prefer smart guides over the square grid: if an edge or centre has
 * found a neighbour within the guide threshold, that axis is pinned to the
 * neighbour and only the free axis falls back to the grid. Shift bypasses
 * both for the current gesture, the same momentary escape hatch it already
 * provides while drawing bonds and chains.
 */
function snapWithGuides(
  excludeId: string,
  raw: Point,
  movingBounds: Bounds,
  shiftKey: boolean,
): Point {
  const state = useMoleculeStore.getState();
  if (shiftKey) {
    state.setAlignmentGuides([]);
    return raw;
  }

  const threshold = ALIGNMENT_GUIDE_THRESHOLD / Math.max(state.view.scale, 0.0001);
  const targets = collectAlignmentTargets(state.molecule, state.annotations, new Set([excludeId]));
  const result = alignBounds(movingBounds, targets, threshold);
  const snapped: Point = { x: raw.x + result.dx, y: raw.y + result.dy };

  // Grid snapping is the fallback only for axes the guides did not claim.
  // Doing it per-axis (rather than skipping the grid entirely whenever any
  // guide matched) means one axis can follow a neighbour while the other
  // still lands on the visible grid.
  if (state.showGrid) {
    const grid = snapPoint(raw);
    const hasGuideX = result.guides.some((g) => g.axis === "x");
    const hasGuideY = result.guides.some((g) => g.axis === "y");
    if (!hasGuideX) snapped.x = grid.x;
    if (!hasGuideY) snapped.y = grid.y;
  }

  state.setAlignmentGuides(result.guides);
  return snapped;
}

/** Snap a whole annotation being dragged, with `p` as its new origin (or,
 * for an arrow, its new start point). The annotation is looked up from the
 * store by id rather than passed in, because drag callbacks are memoized and
 * would otherwise keep measuring the annotation as it was when the callback
 * was created. */
export function snapAnnotationMove(annotationId: string, p: Point, shiftKey: boolean): Point {
  const annotation = useMoleculeStore.getState().annotations[annotationId];
  if (!annotation) return p;
  return snapWithGuides(annotation.id, p, annotationBoundsAt(annotation, p), shiftKey);
}

/** Snap one arrow endpoint to nearby edges/centres (and, secondarily, the
 * grid) while it is dragged. */
export function snapAnnotationEndpoint(annotationId: string, p: Point, shiftKey: boolean): Point {
  return snapWithGuides(annotationId, p, pointBounds(p), shiftKey);
}
