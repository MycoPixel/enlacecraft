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
