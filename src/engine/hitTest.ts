import type { Annotation, Molecule, Point } from "../types/chemistry";
import { dist } from "../model/geometry";

export function atomAt(mol: Molecule, pt: Point, radius = 16, excludeId: string | null = null): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const id in mol.atoms) {
    if (id === excludeId) continue;
    const a = mol.atoms[id];
    const d = dist(a, pt);
    if (d < radius && d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

export function bondAt(mol: Molecule, pt: Point, tolerance = 8): string | null {
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
    if (dist(pt, proj) < tolerance) return id;
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
    const corners: Point[] =
      ann.kind === "arrow"
        ? [{ x: ann.x1, y: ann.y1 }, { x: ann.x2, y: ann.y2 }]
        : [
            { x: ann.x, y: ann.y },
            { x: ann.x + ann.width, y: ann.y },
            { x: ann.x, y: ann.y + ann.height },
            { x: ann.x + ann.width, y: ann.y + ann.height },
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
    let boxMinX: number, boxMaxX: number, boxMinY: number, boxMaxY: number;
    if (ann.kind === "arrow") {
      boxMinX = Math.min(ann.x1, ann.x2);
      boxMaxX = Math.max(ann.x1, ann.x2);
      boxMinY = Math.min(ann.y1, ann.y2);
      boxMaxY = Math.max(ann.y1, ann.y2);
    } else {
      boxMinX = ann.x;
      boxMaxX = ann.x + ann.width;
      boxMinY = ann.y;
      boxMaxY = ann.y + ann.height;
    }
    if (boxMinX >= xmin && boxMaxX <= xmax && boxMinY >= ymin && boxMaxY <= ymax) result.add(id);
  }
  return result;
}
