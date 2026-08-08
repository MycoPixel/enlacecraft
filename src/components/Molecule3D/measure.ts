/**
 * Pure vector math for the 3D panel's measurement tool (see
 * Molecule3DView.tsx) — kept separate from any 3Dmol.js specifics so
 * it's trivial to reason about (and could be unit-tested) on its own.
 * Coordinates are plain {x,y,z} in Ångströms, matching whatever
 * embedMolecule3D/refineWithXtb produced.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export function distanceAngstrom(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Angle at `vertex`, between rays toward `a` and `b`, in degrees. */
export function angleDegrees(a: Point3, vertex: Point3, b: Point3): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y, z: a.z - vertex.z };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y, z: b.z - vertex.z };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z);
  const mag2 = Math.hypot(v2.x, v2.y, v2.z);
  if (mag1 === 0 || mag2 === 0) return NaN; // coincident atoms — shouldn't happen for real coordinates
  // Clamped against float error occasionally pushing |cos| a hair past 1,
  // which would otherwise make acos return NaN for a perfectly linear
  // (180°) or perfectly coincident-direction (0°) angle.
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}
