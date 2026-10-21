import type { Point } from "../types/chemistry";
import { DEFAULT_BRACKET_HEIGHT } from "./constants";

export const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const angleOf = (a: Point, b: Point): number =>
  Math.atan2(b.y - a.y, b.x - a.x);

/** Snap an angle (radians) to the nearest multiple of `step` (default 30°). */
/**
 * Rounds `rad` to the nearest multiple of `step`.
 *
 * A `step` of 0 (or any non-positive value) means "no snapping" and returns
 * the angle untouched — that's what the user's "Off" snap preference maps to.
 * Guarding here rather than at every call site means callers can pass a
 * possibly-zero step straight through without each one re-checking it.
 */
export const snapAngle = (rad: number, step: number = Math.PI / 6): number =>
  step > 0 ? Math.round(rad / step) * step : rad;

/**
 * Shortest signed angular difference `to - from`, normalized to
 * (-π, π] — e.g. the "naive" `to - from` for angles just past 0 and just
 * before 2π would come out close to a full turn instead of close to
 * zero; this picks whichever direction is actually shorter around the
 * circle. Used anywhere two angles need comparing by how close they
 * are rather than by raw subtraction (choosing the zigzag side in
 * cleanUpAtoms that best matches a chain's original drawn direction).
 */
export const angleDelta = (from: number, to: number): number => {
  const twoPi = 2 * Math.PI;
  return ((to - from + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
};

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

// --- TLC plate geometry -----------------------------------------------------
// Fractions-of-height where a TLC plate's baseline (near the bottom, where
// samples are spotted) and solvent front (near the top, how far the solvent
// climbed) sit. Shared by the store (converting click points to spot
// fractions) and the view (drawing and hit areas), so both always agree.

export const TLC_BASELINE_FRACTION = 0.88;
export const TLC_FRONT_FRACTION = 0.1;

/** A TLC spot's absolute pixel position on the canvas, from its fractional
 * spot coordinates: fx is simply across the plate's width; fy maps the
 * baseline(0)-to-front(1) interval between the two fixed lines. */
export function tlcSpotPosition(
  plate: { x: number; y: number; width: number; height: number },
  spot: { fx: number; fy: number }
): Point {
  const span = TLC_BASELINE_FRACTION - TLC_FRONT_FRACTION;
  return {
    x: plate.x + spot.fx * plate.width,
    y: plate.y + plate.height * (TLC_BASELINE_FRACTION - span * spot.fy),
  };
}

/** Inverse of tlcSpotPosition: a canvas point inside (or near) the plate
 * becomes fractional spot coordinates, clamped to 0..1 on both axes. */
export function tlcPointToFractions(
  plate: { x: number; y: number; width: number; height: number },
  p: Point
): { fx: number; fy: number } {
  const span = TLC_BASELINE_FRACTION - TLC_FRONT_FRACTION;
  const fx = plate.width > 0 ? (p.x - plate.x) / plate.width : 0;
  const fy = plate.height > 0 ? (TLC_BASELINE_FRACTION - (p.y - plate.y) / plate.height) / span : 0;
  return {
    fx: Math.min(1, Math.max(0, fx)),
    fy: Math.min(1, Math.max(0, fy)),
  };
}

/** Whether a point is inside the plate rectangle (spots can't be placed on
 * the bench top, so to speak). */
export function pointInRect(
  p: Point,
  rect: { x: number; y: number; width: number; height: number },
  pad = 0
): boolean {
  return (
    p.x >= rect.x - pad &&
    p.x <= rect.x + rect.width + pad &&
    p.y >= rect.y - pad &&
    p.y <= rect.y + rect.height + pad
  );
}
