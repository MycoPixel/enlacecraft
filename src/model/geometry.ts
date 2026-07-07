import type { Point } from "../types/chemistry";

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
