import type { CatalyticCycle, CycleSide, Molecule, Point } from "../types/chemistry";

/**
 * Geometry for a live catalytic cycle.
 *
 * The cycle stores only its membership and circle (see CatalyticCycle): the
 * arc spans are derived here from each intermediate's current atom
 * positions. That is what keeps the figure honest when an intermediate is
 * dragged — the arc that belongs to it moves with it instead of staying at
 * the coordinates it had when the cycle was placed.
 *
 * Pure and renderer-agnostic: angles are returned in radians, points in
 * drawing units, and the canvas layer turns them into SVG paths. Angles use
 * screen coordinates (y grows downward), so increasing angle is clockwise
 * on screen.
 */

export interface CycleBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CycleNodeGeometry {
  /** Index into cycle.nodes. */
  index: number;
  atomIds: string[];
  centre: Point;
  box: CycleBounds;
  /** Angle from the cycle centre, in radians. */
  angle: number;
  /** Angular half-gap kept clear around this node's ink. */
  halfGap: number;
}

export interface CycleArcGeometry {
  /** Index of the node the arc leaves. */
  fromNode: number;
  /** Index of the node the arc reaches. */
  toNode: number;
  startAngle: number;
  endAngle: number;
  /** Signed sweep: positive clockwise, negative anticlockwise. */
  sweep: number;
  start: Point;
  end: Point;
  mid: Point;
}

export interface CycleSideGeometry {
  id: string;
  direction: CycleSide["direction"];
  angle: number;
  start: Point;
  end: Point;
  /** Where a reagent/product label should be anchored (outer end). */
  labelAnchor: Point;
  label?: string;
}

export interface CycleLabelGeometry {
  text: string;
  x: number;
  y: number;
}

export interface CycleGeometry {
  cycleId: string;
  centre: Point;
  radius: number;
  clockwise: boolean;
  nodes: CycleNodeGeometry[];
  arcs: CycleArcGeometry[];
  sides: CycleSideGeometry[];
  label: CycleLabelGeometry | null;
  /** Point for the clockwise/anticlockwise toggle handle. */
  directionHandle: Point;
  /** Hit radius of the ring itself (centre distance). */
  ringRadius: number;
}

const DEFAULT_SCALE = 1;
/** Ink-free space kept between an intermediate and its arc. */
const NODE_PADDING = 15;
/** Smallest half-gap, so even a tiny node is not swallowed by an arrowhead. */
const MIN_HALF_GAP = 0.13;
/** A segment always keeps this fraction of its span as visible arc. */
const MAX_GAP_FRACTION = 0.34;
const SIDE_GAP = 16;
const SIDE_LENGTH = 46;
const LABEL_OFFSET = 30;
const DIRECTION_HANDLE_OFFSET = 30;

function scaleOf(cycle: CatalyticCycle): number {
  const s = cycle.scale;
  return Number.isFinite(s) && s !== undefined && s > 0 ? s : DEFAULT_SCALE;
}

function boxForAtoms(molecule: Molecule, atomIds: string[]): CycleBounds | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const id of atomIds) {
    const atom = molecule.atoms[id];
    if (!atom) continue;
    left = Math.min(left, atom.x);
    top = Math.min(top, atom.y);
    right = Math.max(right, atom.x);
    bottom = Math.max(bottom, atom.y);
  }
  if (left === Infinity) return null;
  return { left, top, right, bottom };
}

function centreOf(box: CycleBounds): Point {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

function angleOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Normalises an angle into [0, 2π). */
function normalise(angle: number): number {
  const twoPi = Math.PI * 2;
  const wrapped = angle % twoPi;
  return wrapped < 0 ? wrapped + twoPi : wrapped;
}

function pointOnCircle(centre: Point, radius: number, angle: number): Point {
  return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
}

/** Angular half-width of a node's ink at the cycle's radius. */
function desiredHalfGap(box: CycleBounds, radius: number): number {
  const halfWidth = Math.max(box.right - box.left, box.bottom - box.top) / 2 + NODE_PADDING;
  if (radius <= halfWidth) return Math.PI / 2;
  return Math.max(MIN_HALF_GAP, Math.atan2(halfWidth, radius));
}

function sideGeometry(
  cycle: CatalyticCycle,
  centre: Point,
  radius: number,
  side: CycleSide
): CycleSideGeometry {
  const scale = scaleOf(cycle);
  const gap = SIDE_GAP * scale;
  const length = SIDE_LENGTH * scale;
  const angle = Number.isFinite(side.angle) ? side.angle : 0;
  const inner = pointOnCircle(centre, radius + gap, angle);
  const outer = pointOnCircle(centre, radius + gap + length, angle);
  const labelAnchor = pointOnCircle(centre, radius + gap + length + 14 * scale, angle);
  return {
    id: side.id,
    direction: side.direction === "out" ? "out" : "in",
    angle,
    start: side.direction === "out" ? inner : outer,
    end: side.direction === "out" ? outer : inner,
    labelAnchor,
    ...(side.label ? { label: side.label } : {}),
  };
}

export function layoutCycle(cycle: CatalyticCycle, molecule: Molecule): CycleGeometry {
  const scale = scaleOf(cycle);
  const centre = cycle.centre;
  const radius = Math.max(1, Number.isFinite(cycle.radius) ? cycle.radius : 100);

  const nodes: CycleNodeGeometry[] = [];
  cycle.nodes.forEach((atomIds, index) => {
    const box = boxForAtoms(molecule, atomIds);
    if (!box) return;
    const nodeCentre = centreOf(box);
    const fallbackAngle = (index / Math.max(1, cycle.nodes.length)) * Math.PI * 2 - Math.PI / 2;
    const angle = Math.hypot(nodeCentre.x - centre.x, nodeCentre.y - centre.y) < 1e-6
      ? fallbackAngle
      : angleOf(centre, nodeCentre);
    nodes.push({
      index,
      atomIds,
      centre: nodeCentre,
      box,
      angle: normalise(angle),
      halfGap: desiredHalfGap(box, radius),
    });
  });

  // The traversal order follows the atoms, not the stored array order: a
  // node dragged past its neighbour should keep its arc adjacent rather than
  // sending an arc the long way round.
  const ordered = [...nodes].sort((a, b) => a.angle - b.angle || a.index - b.index);
  const arcs: CycleArcGeometry[] = [];

  if (ordered.length === 0) {
    const startAngle = -Math.PI / 2;
    const sweep = (cycle.clockwise ? 1 : -1) * (Math.PI * 2 - 0.06);
    const endAngle = startAngle + sweep;
    arcs.push({
      fromNode: -1,
      toNode: -1,
      startAngle,
      endAngle,
      sweep,
      start: pointOnCircle(centre, radius, startAngle),
      end: pointOnCircle(centre, radius, endAngle),
      mid: pointOnCircle(centre, radius, startAngle + sweep / 2),
    });
  } else {
    for (let i = 0; i < ordered.length; i++) {
      const from = ordered[i];
      const to = ordered[(i + 1) % ordered.length];
      const clockwise = cycle.clockwise !== false;
      const separation = ordered.length === 1
        ? Math.PI * 2
        : clockwise
          ? normalise(to.angle - from.angle) || Math.PI * 2
          : normalise(from.angle - to.angle) || Math.PI * 2;

      const maxHalfGap = separation * MAX_GAP_FRACTION;
      const fromGap = Math.min(from.halfGap, maxHalfGap);
      const toGap = Math.min(to.halfGap, maxHalfGap);

      let startAngle: number;
      let endAngle: number;
      if (clockwise) {
        startAngle = from.angle + fromGap;
        endAngle = from.angle + separation - toGap;
      } else {
        startAngle = from.angle - fromGap;
        endAngle = from.angle - separation + toGap;
      }
      const sweep = endAngle - startAngle;
      arcs.push({
        fromNode: from.index,
        toNode: to.index,
        startAngle,
        endAngle,
        sweep,
        start: pointOnCircle(centre, radius, startAngle),
        end: pointOnCircle(centre, radius, endAngle),
        mid: pointOnCircle(centre, radius, startAngle + sweep / 2),
      });
    }
  }

  const sides = (cycle.sides ?? []).map((side) => sideGeometry(cycle, centre, radius, side));
  const label = cycle.label
    ? {
        text: cycle.label,
        ...pointOnCircle(centre, radius + LABEL_OFFSET * scale + 24 * scale, -Math.PI / 2),
      }
    : null;
  const directionHandle = pointOnCircle(
    centre,
    radius + DIRECTION_HANDLE_OFFSET * scale,
    -Math.PI / 2
  );

  return {
    cycleId: cycle.id,
    centre,
    radius,
    clockwise: cycle.clockwise !== false,
    nodes,
    arcs,
    sides,
    label,
    directionHandle,
    ringRadius: radius,
  };
}

/** True when `pt` falls on the ring band (not on an intermediate). */
export function cycleRingAt(geometry: CycleGeometry, pt: Point, tolerance = 12): boolean {
  const d = Math.hypot(pt.x - geometry.centre.x, pt.y - geometry.centre.y);
  return Math.abs(d - geometry.ringRadius) <= tolerance;
}

/** True when `pt` is on the direction toggle handle. */
export function cycleDirectionHandleAt(geometry: CycleGeometry, pt: Point, tolerance = 12): boolean {
  return Math.hypot(pt.x - geometry.directionHandle.x, pt.y - geometry.directionHandle.y) <= tolerance;
}

/** True when `pt` is on one of the cycle's side arrows. */
export function cycleSideAt(geometry: CycleGeometry, pt: Point, tolerance = 10): string | null {
  for (const side of geometry.sides) {
    if (distanceToSegment(pt, side.start, side.end) <= tolerance) return side.id;
  }
  return null;
}

/** The first cycle whose ring or side arrow is under `pt`, or null. */
export function cycleAt(
  molecule: Molecule,
  pt: Point,
  tolerance = 12
): CatalyticCycle | null {
  for (const cycle of molecule.cycles ?? []) {
    const geometry = layoutCycle(cycle, molecule);
    if (cycleRingAt(geometry, pt, tolerance) || cycleSideAt(geometry, pt, tolerance)) return cycle;
  }
  return null;
}

/** The cycle whose direction/scale handle is under `pt`, or null. */
export function cycleHandleAt(
  molecule: Molecule,
  pt: Point,
  tolerance = 12
): { cycle: CatalyticCycle; handle: "direction" | "scale" } | null {
  for (const cycle of molecule.cycles ?? []) {
    const geometry = layoutCycle(cycle, molecule);
    const scaleHandle = {
      x: geometry.centre.x,
      y: geometry.centre.y + geometry.radius + 30 * (cycle.scale ?? 1),
    };
    if (Math.hypot(pt.x - geometry.directionHandle.x, pt.y - geometry.directionHandle.y) <= tolerance) {
      return { cycle, handle: "direction" };
    }
    if (Math.hypot(pt.x - scaleHandle.x, pt.y - scaleHandle.y) <= tolerance) {
      return { cycle, handle: "scale" };
    }
  }
  return null;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
