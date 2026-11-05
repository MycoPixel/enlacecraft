import type { Annotation, Molecule, Point } from "../types/chemistry";
import { findConnectedFragments } from "./valence";

/**
 * Smart alignment guides.
 *
 * While an annotation is dragged, its edges and centre lines are compared
 * against the corresponding lines of every other annotation and of each
 * connected structure on the canvas. When one pair comes within a few
 * screen pixels, the drag is pulled onto that line and a guide is drawn so
 * the user can see what it lined up with. This is the free-form counterpart
 * to the square grid: the grid gives regular spacing, the guides give
 * intentional relationships (a caption's left edge flush with a bracket, a
 * label centred over a product, ...).
 */

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * One active guide line, already in world/canvas coordinates.
 *
 * `position` is the shared x (for a vertical guide) or y (for a horizontal
 * one); `start`/`end` span the other axis far enough to touch both the
 * dragged object and the object it aligned with, which is what makes the
 * guide read as a relationship rather than an arbitrary rule.
 */
export interface AlignmentGuide {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
}

/** How close, in *screen* pixels, an edge/centre must come before it snaps.
 * The caller divides by view.scale so the feel is zoom-independent. */
export const ALIGNMENT_GUIDE_THRESHOLD = 6;

const EMPTY_GUIDES: AlignmentGuide[] = [];

export function translateBounds(b: Bounds, dx: number, dy: number): Bounds {
  return { left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy };
}

/**
 * The box an annotation occupies, in the same world units the canvas draws
 * in. Kept here (rather than in the export layer that needs the same
 * measurement) so guide snapping and page setup always agree about where an
 * object actually is.
 */
export function annotationBounds(ann: Annotation): Bounds {
  if (ann.kind === "arrow") {
    return {
      left: Math.min(ann.x1, ann.x2),
      top: Math.min(ann.y1, ann.y2),
      right: Math.max(ann.x1, ann.x2),
      bottom: Math.max(ann.y1, ann.y2),
    };
  }
  if (ann.kind === "orbital") {
    // Orbitals are drawn around their nucleus, not from it like a text box.
    // The glyph's reach is at most one lobe length in any direction, which
    // is close enough for alignment purposes and keeps this independent of
    // the variant's exact silhouette.
    return { left: ann.x - ann.size, top: ann.y - ann.size, right: ann.x + ann.size, bottom: ann.y + ann.size };
  }
  return { left: ann.x, top: ann.y, right: ann.x + ann.width, bottom: ann.y + ann.height };
}

function atomsBounds(mol: Molecule, ids: string[]): Bounds | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const id of ids) {
    const atom = mol.atoms[id];
    if (!atom) continue;
    left = Math.min(left, atom.x);
    top = Math.min(top, atom.y);
    right = Math.max(right, atom.x);
    bottom = Math.max(bottom, atom.y);
  }
  return left === Infinity ? null : { left, top, right, bottom };
}

/**
 * Bounding boxes for each connected structure (not one box around the whole
 * drawing). A scheme normally has several reactants/products on the same
 * canvas; a single overall box would produce guides that pass through the
 * middle of nowhere and never line up with an individual structure.
 */
export function structureBounds(mol: Molecule): Bounds[] {
  const out: Bounds[] = [];
  for (const ids of findConnectedFragments(mol)) {
    const b = atomsBounds(mol, ids);
    if (b) out.push(b);
  }
  return out;
}

/**
 * Everything a drag can align to: each connected structure plus every
 * annotation except the ones being moved.
 */
export function collectAlignmentTargets(
  mol: Molecule,
  annotations: Record<string, Annotation>,
  excludeIds: ReadonlySet<string> = new Set(),
): Bounds[] {
  const out = structureBounds(mol);
  for (const ann of Object.values(annotations)) {
    if (!excludeIds.has(ann.id)) out.push(annotationBounds(ann));
  }
  return out;
}

function axisAnchors(b: Bounds, axis: "x" | "y"): [number, number, number] {
  return axis === "x"
    ? [b.left, (b.left + b.right) / 2, b.right]
    : [b.top, (b.top + b.bottom) / 2, b.bottom];
}

interface AxisMatch {
  delta: number;
  position: number;
  target: Bounds;
}

/** Closest edge/centre pair between `moving` and any target on one axis. */
function nearestAxisMatch(moving: Bounds, targets: Bounds[], axis: "x" | "y", threshold: number): AxisMatch | null {
  const movingAnchors = axisAnchors(moving, axis);
  let best: AxisMatch | null = null;
  let bestDistance = threshold;
  for (const target of targets) {
    const targetAnchors = axisAnchors(target, axis);
    for (const from of movingAnchors) {
      for (const to of targetAnchors) {
        const delta = to - from;
        const distance = Math.abs(delta);
        // Strictly smaller: on an exact tie the earlier (edge-before-centre)
        // candidate wins, which keeps the result stable and predictable.
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { delta, position: to, target };
        }
      }
    }
  }
  return best;
}

export interface AlignmentResult {
  /** Translation to add to the un-snapped drag position. */
  dx: number;
  dy: number;
  guides: AlignmentGuide[];
}

/**
 * Picks at most one vertical and one horizontal guide for `moving`, and
 * returns the translation that puts it on those lines. Axes are independent,
 * so an object can line up horizontally with one neighbour while its left
 * edge lines up vertically with another.
 */
export function alignBounds(moving: Bounds, targets: Bounds[], threshold: number): AlignmentResult {
  if (targets.length === 0 || threshold <= 0) return { dx: 0, dy: 0, guides: EMPTY_GUIDES };

  const x = nearestAxisMatch(moving, targets, "x", threshold);
  const y = nearestAxisMatch(moving, targets, "y", threshold);
  const dx = x?.delta ?? 0;
  const dy = y?.delta ?? 0;
  const moved = translateBounds(moving, dx, dy);

  const guides: AlignmentGuide[] = [];
  if (x) {
    guides.push({
      axis: "x",
      position: x.position,
      start: Math.min(moved.top, x.target.top),
      end: Math.max(moved.bottom, x.target.bottom),
    });
  }
  if (y) {
    guides.push({
      axis: "y",
      position: y.position,
      start: Math.min(moved.left, y.target.left),
      end: Math.max(moved.right, y.target.right),
    });
  }
  return { dx, dy, guides };
}

/** The moving annotation's bounds when its drag origin (or, for an arrow,
 * its start point) is at `p`. */
export function annotationBoundsAt(ann: Annotation, p: Point): Bounds {
  const base = annotationBounds(ann);
  return ann.kind === "arrow"
    ? translateBounds(base, p.x - ann.x1, p.y - ann.y1)
    : translateBounds(base, p.x - ann.x, p.y - ann.y);
}

/** A zero-size box at a single point, for aligning a dragged arrow endpoint. */
export function pointBounds(p: Point): Bounds {
  return { left: p.x, top: p.y, right: p.x, bottom: p.y };
}
