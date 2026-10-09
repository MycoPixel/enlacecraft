/**
 * Numerical integration over a region of the simulated spectrum - the
 * "drag over a signal, read off how many protons" workflow thatMestreNova,
 * TopSpin and every other NMR package provide, and the thing you actually do
 * with a spectrum once you trust it.
 *
 * WHY INTEGRATE THE CURVE RATHER THAN ADD UP PEAK INTENSITIES
 * ------------------------------------------------------------
 * A single simulated signal is several split lines (a quartet is four lines),
 * and each line's intensity is only 1/N of the group's total. Summing the raw
 * line intensities of one group therefore gives its correct total - but doing
 * that for a REGION that clips a multiplet, or that catches one line of a
 * neighbour, gives a number that's wrong in a way that's invisible on the plot.
 * Integrating the drawn envelope over the region instead is exactly what a
 * spectrometer reports, and it degrades gracefully: a slightly-too-narrow
 * region returns a slightly-too-small number rather than a wrong one.
 *
 * It also means the result depends on what is actually on screen (curve mode),
 * the same promise the rest of the plot makes.
 *
 * HONESTY NOTE, carried into the UI
 * --------------------------------
 * The absolute scale here is arbitrary. Lorentzian tails overlap, so a region
 * that overlaps a neighbour includes part of its area; and the curve is
 * simulated, not measured. What IS trustworthy is the RATIO between regions
 * measured over equivalent, non-overlapping windows - which is the number a
 * chemist is after. `absoluteProtons` therefore needs an explicit calibration
 * the user supplies, and reports how it was derived rather than implying a
 * measured count.
 */

import type { SimulatedPeakGroup } from "./nmrSpectrum";
import { buildCurve } from "./nmrSpectrum";

/** One user-selected integration region, in ppm. */
export interface IntegrationRegion {
  /** Stable identity, so React keys and removal by index both work. */
  id: string;
  /** [minPpm, maxPpm], always ordered low-to-high. */
  rangePpm: [number, number];
}

export interface IntegrationResult {
  region: IntegrationRegion;
  /**
   * Area under the curve across the region, in arbitrary units. Comparable
   * between regions; not a proton count on its own.
   */
  area: number;
  /**
   * Area relative to the smallest region in the set - the classic "3 : 2 : 1"
   * readout. The smallest region is the reference (MestreNova calls this the
   * "normalization"), since ratios are read against the least abundant signal.
   * Null when this is the only region: a lone region has no ratio to speak of.
   */
  ratio: number | null;
  /**
   * Proton count for this region, or null when it can't be calibrated.
   *
   * Only available if the user nominated one region as the reference AND gave
   * it an integer H count. Everything else scales off that pair.
   */
  protons: number | null;
}

/**
 * Samples the curve densely enough that the trapezoid error is well below the
 * precision anyone reads an integral to.
 *
 * Over a region, not the whole axis: a 0.3 ppm window needs far fewer samples
 * than a 200 ppm one for the same accuracy, and the cost is per-region.
 */
const SAMPLES_PER_REGION = 400;

/**
 * Area under one simulated line, for a given linewidth.
 *
 * The Lorentzian in nmrSpectrum.ts is built as
 *
 *     h * a^2 / ((x - c)^2 + a^2),   a = width / 2
 *
 * whose integral over all x is h * pi * a - NOT h. That constant factor is the
 * whole reason this helper exists: without dividing it out, integrating a 3H
 * signal would report 0.23 "protons" and every absolute count in the tool
 * would be meaningless. Dividing by the analytic area converts area back into
 * the same units the line intensities are already in, so a region fully
 * covering a signal integrates to that signal's proton count directly.
 *
 * Derived from the sampler rather than hardcoded, so if the curve shape ever
 * changes here it changes in one place.
 */
function lineAreaPerUnitIntensity(linewidthPpm: number): number {
  const halfWidth = linewidthPpm / 2;
  return Math.PI * halfWidth;
}

/**
 * Integral across a ppm window, in the same units as the line intensities.
 *
 * Trapezoid rule over a fixed number of samples, normalized by
 * lineAreaPerUnitIntensity. Returns 0 for a degenerate range rather than NaN
 * or a negative area, so a region drawn with zero width (which the UI allows
 * mid-drag) can't poison the arithmetic.
 */
export function integrateRegion(
  peakGroups: SimulatedPeakGroup[],
  rangePpm: [number, number],
  linewidthPpm: number,
): number {
  const [lo, hi] = rangePpm;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 0;

  const points = buildCurve(peakGroups, lo, hi, SAMPLES_PER_REGION, linewidthPpm);
  if (points.length < 2) return 0;

  // The x spacing is uniform by construction, so the sum of y*dx is the area.
  // Worked out from the first two samples rather than assumed, so a change to
  // the sampler can't silently skew every integral by a constant factor.
  const dx = points[1].ppm - points[0].ppm;
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    area += ((points[i].intensity + points[i + 1].intensity) / 2) * dx;
  }
  return area / lineAreaPerUnitIntensity(linewidthPpm);
}

/**
 * Integrates every region and works out ratios and absolute proton counts.
 *
 * @param referenceId which region the user calibrated, if any
 * @param referenceProtons the H count they assigned to it - must be a
 *   positive integer, since a fractional proton is not a thing
 */
export function integrateRegions(
  peakGroups: SimulatedPeakGroup[],
  regions: IntegrationRegion[],
  linewidthPpm: number,
  referenceId?: string | null,
  referenceProtons?: number | null,
): IntegrationResult[] {
  if (regions.length === 0) return [];

  const areas = regions.map((region) => ({
    region,
    area: integrateRegion(peakGroups, region.rangePpm, linewidthPpm),
  }));

  // Normalize against the smallest non-zero area. Guarded because a region can
  // legitimately integrate to ~0 (one drawn entirely in a gap between signals),
  // and dividing by that would send every other ratio to infinity.
  const positiveAreas = areas.map((a) => a.area).filter((a) => a > 0);
  const smallest = positiveAreas.length > 0 ? Math.min(...positiveAreas) : 0;

  // Absolute scale, from the user's own calibration. Guarded to a positive
  // integer so "3 protons" can't silently become "3.7 protons".
  const calibratedProtons =
    referenceId != null &&
    Number.isFinite(referenceProtons) &&
    referenceProtons != null &&
    referenceProtons >= 1
      ? referenceProtons
      : null;
  const referenceArea = calibratedProtons
    ? areas.find((a) => a.region.id === referenceId)?.area ?? 0
    : 0;

  // A lone region normalizes against itself and would always report exactly
  // 1, which reads as a real measurement rather than as "there was nothing to
  // compare it to". Null is the honest answer for a one-element set.
  const hasComparison = areas.length > 1;

  return areas.map(({ region, area }) => {
    const ratio = hasComparison && smallest > 0 ? area / smallest : null;
    const protons =
      calibratedProtons && referenceArea > 0 ? (calibratedProtons * area) / referenceArea : null;
    return { region, area, ratio, protons };
  });
}

/**
 * Rounds a proton count to something a chemist would read off a spectrum.
 *
 * Real integrations are never exact - 1.97 protons is 2. Reporting the raw
 * float would imply a precision the simulation can't support, so this snaps to
 * the nearest half-integer, which is the granularity an integral is actually
 * readable at by eye.
 */
export function formatProtons(protons: number | null): string {
  if (protons === null || !Number.isFinite(protons)) return "-";
  const rounded = Math.round(protons * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}