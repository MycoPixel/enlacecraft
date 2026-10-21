import type { Annotation, Molecule, Point } from "../types/chemistry";
import { dist } from "../model/geometry";

/**
 * Hit radii are stored in *world* units, so they shrink on screen as you zoom
 * out — which is backwards for touch. At the minimum zoom (0.25) the default
 * 16-unit atom radius is 4 screen px and the 8-unit bond tolerance is 2px,
 * both far below anything a fingertip can reliably hit, and precisely when
 * the structure is largest and hardest to work with.
 *
 * `hitRadius` converts a world-space radius into one that never renders
 * smaller than `minScreenPx` on screen, by dividing the pixel floor by the
 * current zoom. At normal zoom the world radius wins and nothing changes; zoom
 * out and the floor takes over, growing the target to stay finger-sized.
 */

/** Floor for a mouse/trackpad pointer — a generous target, but the pointer is
 *  precise enough that a huge radius would start stealing neighbouring atoms. */
export const MIN_HIT_PX_PRECISE = 10;

/** Floor for touch. Sized against the ~44px accessibility guideline but not
 *  all the way there: this is a *radius*, so the target is twice this across,
 *  and going the full 44 would make small rings unclickable in crowded
 *  structures. */
export const MIN_HIT_PX_TOUCH = 22;

/**
 * Converts a world-space hit radius to one with an on-screen size floor.
 *
 * `scale` is view.scale (1 = 100%). `minScreenPx` is the smallest acceptable
 * on-screen radius.
 */
export function hitRadius(worldRadius: number, scale: number, minScreenPx: number): number {
  // Guard the division: scale is clamped to >= 0.1 in the viewport, but a
  // zero/NaN would otherwise produce Infinity and match every atom.
  const s = Number.isFinite(scale) && scale > 0.001 ? scale : 1;
  return Math.max(worldRadius, minScreenPx / s);
}

export function atomAt(
  mol: Molecule,
  pt: Point,
  radius = 16,
  excludeId: string | null = null,
  scale = 1,
  minScreenPx = MIN_HIT_PX_PRECISE,
): string | null {
  const r = hitRadius(radius, scale, minScreenPx);
  let best: string | null = null;
  let bestD = Infinity;
  for (const id in mol.atoms) {
    if (id === excludeId) continue;
    const a = mol.atoms[id];
    const d = dist(a, pt);
    if (d < r && d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

export function bondAt(
  mol: Molecule,
  pt: Point,
  tolerance = 8,
  scale = 1,
  minScreenPx = MIN_HIT_PX_PRECISE,
): string | null {
  const tol = hitRadius(tolerance, scale, minScreenPx);
  for (const id in mol.bonds) {
    const b = mol.bonds[id];
    const a1 = mol.atoms[b.a1];
    const a2 = mol.atoms[b.a2];
    if (!a1 || !a2) continue;
    const len = dist(a1, a2);
    if (len === 0) continue;
    const t = Math.max(
      0,
      Math.min(1, ((pt.x - a1.x) * (a2.x - a1.x) + (pt.y - a1.y) * (a2.y - a1.y)) / (len * len))
    );
    const proj = { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
    if (dist(pt, proj) < tol) return id;
  }
  return null;
}

/** All atom ids whose position falls within the rectangle spanned by two corner points. */
export function atomsInRect(mol: Molecule, corner1: Point, corner2: Point): Set<string> {
  const xmin = Math.min(corner1.x, corner2.x);
  const xmax = Math.max(corner1.x, corner2.x);
  const ymin = Math.min(corner1.y, corner2.y);
  const ymax = Math.max(corner1.y, corner2.y);
  const result = new Set<string>();
  for (const id in mol.atoms) {
    const a = mol.atoms[id];
    if (a.x >= xmin && a.x <= xmax && a.y >= ymin && a.y <= ymax) result.add(id);
  }
  return result;
}

/** Standard ray-casting point-in-polygon test, used by the freeform
 * ("lasso") selection tool below — works for the arbitrary, possibly
 * concave/self-crossing path a finger or mouse actually draws, which a
 * simple bounding-box check (as the rectangle marquee above gets away
 * with) can't handle. */
export function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const crosses = yi > pt.y !== yj > pt.y;
    if (crosses && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Lasso equivalent of atomsInRect — an atom counts as enclosed once the
 * path drawn so far has at least 3 points (a real polygon) and the atom's
 * position is inside it. */
export function atomsInPolygon(mol: Molecule, polygon: Point[]): Set<string> {
  const result = new Set<string>();
  if (polygon.length < 3) return result;
  for (const id in mol.atoms) {
    if (pointInPolygon(mol.atoms[id], polygon)) result.add(id);
  }
  return result;
}

/** The axis-aligned bounding box an annotation occupies, in the shape every
 * marquee/lasso check wants: x/y/width/height. Arrows are anchored at two
 * points, orbitals at a center + radius — everything else already carries
 * its own box. */
function annotationBox(ann: Annotation): { x: number; y: number; width: number; height: number } {
  if (ann.kind === "arrow") {
    return {
      x: Math.min(ann.x1, ann.x2),
      y: Math.min(ann.y1, ann.y2),
      width: Math.abs(ann.x2 - ann.x1),
      height: Math.abs(ann.y2 - ann.y1),
    };
  }
  if (ann.kind === "orbital") {
    // Nucleus ± the lobe length — generous for the lobes' width, which is
    // the right bias for selection (grabbing a bit of empty air near an
    // orbital beats failing to enclose a rotated lobe).
    return { x: ann.x - ann.size, y: ann.y - ann.size, width: ann.size * 2, height: ann.size * 2 };
  }
  return { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
}

/** Lasso equivalent of annotationsInRect — same "fully enclosed, not just
 * touched" spirit, approximated (since exactly clipping a rectangle
 * against an arbitrary polygon is overkill here) by requiring every
 * corner of the annotation's own bounding box to fall inside the lasso
 * path. */
export function annotationsInPolygon(annotations: Record<string, Annotation>, polygon: Point[]): Set<string> {
  const result = new Set<string>();
  if (polygon.length < 3) return result;
  for (const id in annotations) {
    const ann = annotations[id];
    const box = annotationBox(ann);
    const corners: Point[] = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x, y: box.y + box.height },
      { x: box.x + box.width, y: box.y + box.height },
    ];
    if (corners.every((c) => pointInPolygon(c, polygon))) result.add(id);
  }
  return result;
}

/**
 * Annotation ids whose full bounding box (both endpoints for an arrow, the
 * x/y/width/height box for text and brackets) lies within the rectangle
 * spanned by two corner points — a marquee only picks up an annotation once
 * it's entirely enclosed, matching common drawing-app marquee behavior.
 */
export function annotationsInRect(annotations: Record<string, Annotation>, corner1: Point, corner2: Point): Set<string> {
  const xmin = Math.min(corner1.x, corner2.x);
  const xmax = Math.max(corner1.x, corner2.x);
  const ymin = Math.min(corner1.y, corner2.y);
  const ymax = Math.max(corner1.y, corner2.y);
  const result = new Set<string>();
  for (const id in annotations) {
    const ann = annotations[id];
    const box = annotationBox(ann);
    if (box.x >= xmin && box.x + box.width <= xmax && box.y >= ymin && box.y + box.height <= ymax) result.add(id);
  }
  return result;
}
