/**
 * Support code for the 3D panel's "Scan rotation" action (see
 * Molecule3DView.tsx) — sweeps the rotate-bond tool's axis through a full
 * 360°, scoring each rigid rotamer along the way with
 * mmff94SinglePointEnergy (io/embed3d.ts), and summarizes the result as
 * "conformation A is N kcal/mol less stable than conformation B".
 *
 * Deliberately separate from rotateBond.ts (pure rigid-body geometry,
 * no energy) and from embed3d.ts (single-structure embedding/scoring,
 * no notion of a sweep) — this module's only job is chaining the two
 * across a range of angles.
 */

import { mmff94SinglePointEnergy } from "../../io/embed3d";
import { rotateHalf, serializeV2000, type XyzAtom, type XyzBond } from "./rotateBond";

export interface TorsionPoint {
  angle: number;
  /** null if MMFF94 couldn't score this particular rotamer (see
   * mmff94SinglePointEnergy) — kept in the series rather than dropped,
   * so the caller can decide how to render a gap. */
  energyKcalMol: number | null;
}

export interface TorsionSummary {
  mostStable: TorsionPoint & { energyKcalMol: number };
  leastStable: TorsionPoint & { energyKcalMol: number };
  /** leastStable.energyKcalMol - mostStable.energyKcalMol, i.e. how much
   * less stable the worst rotamer in the scan is than the best one.
   * Always >= 0. */
  barrierKcalMol: number;
}

/**
 * Rotates `half` around `axisOrigin`→`axisTarget` in `stepDeg` increments
 * from 0° up to (not including) 360° — 360° would just repeat 0° — and
 * scores each resulting rigid geometry. Runs the scoring calls in
 * sequence (not Promise.all) since ForceFieldMMFF94 does real synchronous
 * CPU work per call; sequencing keeps the browser responsive between
 * steps instead of blocking on all of them at once.
 */
export async function scanTorsion(
  baseAtoms: XyzAtom[],
  half: number[],
  axisOrigin: XyzAtom,
  axisTarget: XyzAtom,
  bonds: XyzBond[],
  stepDeg = 10,
): Promise<TorsionPoint[]> {
  const points: TorsionPoint[] = [];
  for (let angle = 0; angle < 360; angle += stepDeg) {
    const rotated = rotateHalf(baseAtoms, half, axisOrigin, axisTarget, angle);
    const molfile = serializeV2000(rotated, bonds);
    const energyKcalMol = await mmff94SinglePointEnergy(molfile);
    points.push({ angle, energyKcalMol });
  }
  return points;
}

/** Finds the best/worst scored points in a scan and the gap between them.
 * Returns null if fewer than two points came back with a real energy
 * (nothing meaningful to compare). */
export function summarizeTorsionScan(points: TorsionPoint[]): TorsionSummary | null {
  const scored = points.filter(
    (p): p is TorsionPoint & { energyKcalMol: number } => p.energyKcalMol !== null,
  );
  if (scored.length < 2) return null;

  let mostStable = scored[0];
  let leastStable = scored[0];
  for (const p of scored) {
    if (p.energyKcalMol < mostStable.energyKcalMol) mostStable = p;
    if (p.energyKcalMol > leastStable.energyKcalMol) leastStable = p;
  }

  return { mostStable, leastStable, barrierKcalMol: leastStable.energyKcalMol - mostStable.energyKcalMol };
}
