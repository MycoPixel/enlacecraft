import type { Molecule, Point } from "../types/chemistry";
import { angleOf, dist, polar, snapAngle } from "../model/geometry";
import { neighborAngles } from "../model/valence";
import { BOND_LEN } from "../model/constants";

// Half of the zig-zag's interior "kink" — each bond leans this far off the
// chain's overall direction, alternating side to side, matching the 120°
// interior-angle convention used everywhere else in the app (bestNewAngle's
// 120° chain continuation, hexagon ring templates, etc: 180° - 120° = 60°
// total swing = ±30° off-axis per bond).
const ZIGZAG_HALF_ANGLE = Math.PI / 6; // 30°

// Projected length, along the chain's overall direction, of one zig-zag
// bond — used to convert a drag distance into a whole number of bonds so
// the last preview atom tracks the cursor as closely as a kinked chain can.
const STEP = BOND_LEN * Math.cos(ZIGZAG_HALF_ANGLE);

/** How far the cursor has to move from the start point before it counts as
 * a drag rather than a click — same threshold the bond tool's drag uses. */
const DRAG_THRESHOLD = 12;

/**
 * Computes the live preview points for the chain tool: the positions of
 * each new bonded carbon growing from `fromPoint` toward `toPoint`, zig-
 * zagging ±30° off the straight line between them so the chain reads as a
 * normal skeletal zig-zag instead of a straight rod. The count comes from
 * the drag distance — about one more bond every `STEP` px.
 *
 * A drag that hasn't moved past the click threshold yet returns an empty
 * array: "press" alone commits no bonded atoms (see the chain tool in
 * useCanvasInteractions.ts, which drops a single unbonded carbon at the
 * anchor for a plain click instead), and only once the drag is real does a
 * chain start growing out of it.
 *
 * `fromAtomId` is used only to check for that atom's existing bonds, so
 * the first zig-zag kink doesn't double back over one of them — pass ""
 * when there's no real atom yet (a fresh anchor).
 *
 * `snapMainAngle` (held Shift) snaps the chain's overall direction to 15°
 * steps, for laying out a straight-ish backbone at a clean angle.
 */
export function computeChainPoints(
  mol: Molecule,
  fromAtomId: string,
  fromPoint: Point,
  toPoint: Point,
  snapMainAngle: boolean = false,
  // Snap step in radians for the backbone's main angle; 0 means "don't
  // snap". Threaded in (rather than read from the store) to keep this module
  // pure — the caller passes the user's snap-angle preference.
  snapStep: number = Math.PI / 12
): Point[] {
  const d = dist(fromPoint, toPoint);
  if (d <= DRAG_THRESHOLD) return [];

  let mainAngle = angleOf(fromPoint, toPoint);
  if (snapMainAngle) mainAngle = snapAngle(mainAngle, snapStep);
  const numSegments = Math.max(1, Math.round(d / STEP));

  // Which side the zig-zag starts on: whichever of the two candidate first
  // bond angles sits farther from this atom's existing bonds, so a chain
  // grown off an existing atom doesn't start out doubling back on itself.
  const existing = neighborAngles(mol, fromAtomId);
  const candidateA = mainAngle - ZIGZAG_HALF_ANGLE;
  const candidateB = mainAngle + ZIGZAG_HALF_ANGLE;
  const firstSign =
    existing.length === 0 || minAngleDistance(candidateA, existing) >= minAngleDistance(candidateB, existing) ? -1 : 1;

  const points: Point[] = [];
  let cur = fromPoint;
  for (let i = 0; i < numSegments; i++) {
    const sign = i % 2 === 0 ? firstSign : -firstSign;
    cur = polar(cur.x, cur.y, BOND_LEN, mainAngle + sign * ZIGZAG_HALF_ANGLE);
    points.push(cur);
  }
  return points;
}

/** Smallest absolute angular distance (radians) between `angle` and any angle in `others`. */
function minAngleDistance(angle: number, others: number[]): number {
  let min = Infinity;
  for (const o of others) {
    let diff = Math.abs(angle - o) % (2 * Math.PI);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    min = Math.min(min, diff);
  }
  return min;
}
