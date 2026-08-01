import type { Point } from "../types/chemistry";
import { DEFAULT_BRACKET_HEIGHT } from "./constants";

export const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const angleOf = (a: Point, b: Point): number =>
  Math.atan2(b.y - a.y, b.x - a.x);

/** Snap an angle (radians) to the nearest multiple of `step` (default 30°). */
export const snapAngle = (rad: number, step: number = Math.PI / 6): number =>
  Math.round(rad / step) * step;

export const polar = (cx: number, cy: number, r: number, rad: number): Point => ({
  x: cx + r * Math.cos(rad),
  y: cy + r * Math.sin(rad),
});

/**
 * Pulls each end of a segment inward by r1/r2 along the segment's own
 * direction, so a bond line stops at the edge of an atom's label instead of
 * running underneath it. Insets are capped at 40% of the segment length so
 * a very short/zoomed-out bond can't be shortened into nothing.
 */
export function insetSegment(a1: Point, a2: Point, r1: number, r2: number): { p1: Point; p2: Point } {
  const len = dist(a1, a2);
  if (len === 0) return { p1: a1, p2: a2 };
  const maxInset = len * 0.4;
  const ins1 = Math.min(Math.max(r1, 0), maxInset);
  const ins2 = Math.min(Math.max(r2, 0), maxInset);
  const ux = (a2.x - a1.x) / len;
  const uy = (a2.y - a1.y) / len;
  return {
    p1: { x: a1.x + ux * ins1, y: a1.y + uy * ins1 },
    p2: { x: a2.x - ux * ins2, y: a2.y - uy * ins2 },
  };
}

/**
 * The angular midpoint of the largest gap between consecutive angles
 * (sorted, wrapping around the circle) - i.e. the direction with the most
 * open space around a point that already has things placed at `angles`
 * around it. Used anywhere something new needs to be placed in whatever
 * room is actually free (fanning out implicit hydrogens, deciding which
 * side an atom label suffix should render on, ...). Returns 0 (due east)
 * for a point with nothing around it yet, since every direction is
 * equally open.
 */
export function largestGapAngle(angles: number[]): number {
  if (angles.length === 0) return 0;
  const sorted = [...angles].sort((a, b) => a - b);
  let bestGap = -Infinity;
  let bestCenter = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI);
    const gap = b - a;
    if (gap > bestGap) {
      bestGap = gap;
      bestCenter = a + gap / 2;
    }
  }
  return bestCenter;
}

/**
 * Shared layout math for the bracket tool's drag-to-place-a-pair gesture:
 * the dragged rectangle (corner1 to corner2) becomes the enclosed region,
 * with an open bracket hugging its left edge and a close bracket hugging
 * its right edge. A near-zero drag (an effective click) falls back to a
 * reasonable default gap/height instead of a degenerate sliver — same
 * reasoning as the arrow tool's near-zero-drag fallback. Used by both the
 * store action that actually places the pair and the live drag preview, so
 * the preview always matches exactly what gets committed on release.
 */
export function bracketPairLayout(corner1: Point, corner2: Point): { left: number; right: number; top: number; height: number } {
  const rawGap = Math.abs(corner2.x - corner1.x);
  const rawHeight = Math.abs(corner2.y - corner1.y);
  const dragged = Math.max(rawGap, rawHeight) > 8;
  const gap = dragged ? Math.max(rawGap, 24) : 70;
  const height = dragged ? Math.max(rawHeight, 24) : DEFAULT_BRACKET_HEIGHT;
  const cx = (corner1.x + corner2.x) / 2;
  const cy = (corner1.y + corner2.y) / 2;
  return { left: cx - gap / 2, right: cx + gap / 2, top: cy - height / 2, height };
}
