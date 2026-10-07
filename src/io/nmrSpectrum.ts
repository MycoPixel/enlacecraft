/**
 * Client-side NMR spectrum simulation - turns predicted shifts plus
 * multiplicity/coupling data (io/nmrPredict.ts) into renderable peak
 * lines and a Lorentzian intensity curve, for NmrSpectrumView.tsx.
 *
 * This is illustrative, not a precision spectral simulator:
 *   - Linewidths are a fixed stylistic default, not measured.
 *   - Tier 1 atoms (acyclic/aromatic - see H1ShiftPrediction.couplingHz)
 *     have no real coupling magnitude at all, only a topological count
 *     (the n+1 rule doesn't estimate J). Those get a synthetic default
 *     J per implied coupling partner instead, so their line COUNT and
 *     relative intensities are correct but the SPACING is not measured
 *     - flagged via isIllustrative on the resulting peak group, and
 *     NmrSpectrumView marks these visually rather than presenting them
 *     as equally precise to tier 2's real J-derived peaks.
 *   - 13C is always rendered as clean singlets (proton-decoupled),
 *     matching how routine 13C spectra are actually run.
 */

import type { EquivalenceGroup, H1ShiftPrediction, ShiftPrediction } from "./nmrPredict";

/** Assumed 1H spectrometer frequency (MHz) - used only to convert a J
 * coupling in Hz into a ppm separation for plotting (ppm = Hz / MHz).
 * Shift positions themselves don't depend on this; only how far apart
 * split lines appear does. 400 MHz is a common teaching-lab instrument
 * and a reasonable illustrative default. */
export const ASSUMED_SPECTROMETER_MHZ = 400;

/** Default illustrative coupling constant (Hz) for tier 1 atoms, which
 * have no real J estimate - a typical open-chain vicinal (3-bond)
 * H-C-C-H coupling. */
export const DEFAULT_ILLUSTRATIVE_J_HZ = 7;

/** Fixed stylistic linewidths (ppm) for the simulated curve - not
 * measured values, just widths that render as legible, realistic-
 * looking peaks at typical 1H/13C shift ranges. 13C isn't derived from
 * a Hz value here since these peaks never carry coupling information
 * to convert (see module docstring - always singlets). */
export const DEFAULT_H1_LINEWIDTH_PPM = 1.5 / ASSUMED_SPECTROMETER_MHZ;
export const DEFAULT_C13_LINEWIDTH_PPM = 0.05;

export interface SimulatedLine {
  ppm: number;
  /** Relative intensity, already scaled by this group's total
   * integration - all of a group's lines sum back to that total. */
  intensity: number;
}

export interface SimulatedPeakGroup {
  /** Atom label(s) for this group, e.g. "C5, C6, C7". */
  label: string;
  centerPpm: number;
  totalIntegration: number;
  lines: SimulatedLine[];
  /** True if this group's splitting came from the tier 1 default J
   * rather than a real tier 2 estimate - callers should visually
   * distinguish these from measured-J peaks. */
  isIllustrative: boolean;
}

const MULTIPLICITY_N: Record<string, number> = {
  s: 0,
  d: 1,
  t: 2,
  q: 3,
  quint: 4,
  sext: 5,
  sept: 6,
};

/**
 * Number of synthetic tier-1 coupling partners implied by a
 * multiplicity label. Tier 1 labels are always a single component
 * (never compound like tier 2's "dd"/"tdq" - see multiplicity.py on
 * the backend). Unrecognized labels (e.g. "m") fall back to 0
 * (rendered as an unsplit line) rather than guessing a shape.
 */
function impliedCouplingCount(label: string): number {
  return MULTIPLICITY_N[label] ?? 0;
}

/**
 * Convolves a list of J values (Hz) into a stick pattern via
 * successive splitting - the same physics that produces a real
 * first-order multiplet: each coupling splits every existing line
 * into two, offset by ±J/2, each carrying half that line's
 * intensity. Equal J values naturally recombine into the correct
 * binomial pattern (1:2:1, 1:3:3:1, ...) this way, without needing to
 * special-case "these happen to be a triplet."
 */
export function convolveCouplings(couplingsHz: number[]): { offsetHz: number; weight: number }[] {
  let lines = [{ offsetHz: 0, weight: 1 }];
  for (const j of couplingsHz) {
    const next: { offsetHz: number; weight: number }[] = [];
    for (const line of lines) {
      next.push({ offsetHz: line.offsetHz - j / 2, weight: line.weight / 2 });
      next.push({ offsetHz: line.offsetHz + j / 2, weight: line.weight / 2 });
    }
    lines = mergeCloseLines(next, 0.01);
  }
  return lines;
}

/** Merges lines landing within `tolerance` Hz of each other, so equal
 * J's collapse into one taller line instead of near-duplicate ones. */
function mergeCloseLines(
  lines: { offsetHz: number; weight: number }[],
  tolerance: number,
): { offsetHz: number; weight: number }[] {
  const sorted = [...lines].sort((a, b) => a.offsetHz - b.offsetHz);
  const merged: { offsetHz: number; weight: number }[] = [];
  for (const line of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(line.offsetHz - last.offsetHz) <= tolerance) {
      const totalWeight = last.weight + line.weight;
      last.offsetHz = (last.offsetHz * last.weight + line.offsetHz * line.weight) / totalWeight;
      last.weight = totalWeight;
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

/**
 * Builds simulated peak groups for a set of equivalence-grouped 1H
 * predictions (see groupByEquivalence in nmrPredict.ts).
 */
export function simulateH1Spectrum(
  groups: EquivalenceGroup<H1ShiftPrediction>[],
  labelFor: (group: EquivalenceGroup<H1ShiftPrediction>) => string,
  spectrometerMHz: number = ASSUMED_SPECTROMETER_MHZ,
): SimulatedPeakGroup[] {
  return groups.map((group) => {
    const rep = group.representative;
    const totalIntegration = group.members.reduce((sum, m) => sum + m.numHs, 0);

    let couplingsHz = rep.couplingHz;
    let isIllustrative = false;
    if (!couplingsHz || couplingsHz.length === 0) {
      const n = impliedCouplingCount(rep.multiplicity);
      couplingsHz = Array.from({ length: n }, () => DEFAULT_ILLUSTRATIVE_J_HZ);
      isIllustrative = n > 0;
    }

    const convolved = convolveCouplings(couplingsHz);
    const lines: SimulatedLine[] = convolved.map((l) => ({
      ppm: rep.predictedShiftPpm + l.offsetHz / spectrometerMHz,
      intensity: l.weight * totalIntegration,
    }));

    return {
      label: labelFor(group),
      centerPpm: rep.predictedShiftPpm,
      totalIntegration,
      lines,
      isIllustrative,
    };
  });
}

/**
 * Builds simulated peak groups for 13C - always clean singlets (see
 * module docstring). Peak height is proportional to how many
 * equivalent carbons contribute, a reasonable teaching approximation
 * - real 13C peak heights aren't strictly proportional to carbon
 * count the way 1H integration is (relaxation/NOE effects).
 */
export function simulateC13Spectrum(
  groups: EquivalenceGroup<ShiftPrediction>[],
  labelFor: (group: EquivalenceGroup<ShiftPrediction>) => string,
): SimulatedPeakGroup[] {
  return groups.map((group) => ({
    label: labelFor(group),
    centerPpm: group.representative.predictedShiftPpm,
    totalIntegration: group.members.length,
    lines: [{ ppm: group.representative.predictedShiftPpm, intensity: group.members.length }],
    isIllustrative: false,
  }));
}

function lorentzian(x: number, center: number, height: number, widthPpm: number): number {
  const halfWidth = widthPpm / 2;
  return (height * (halfWidth * halfWidth)) / ((x - center) * (x - center) + halfWidth * halfWidth);
}

/**
 * Samples a continuous intensity curve across [minPpm, maxPpm] by
 * summing one Lorentzian per line across all peak groups - the
 * "realistic spectrometer output" rendering mode. Stick mode doesn't
 * need this; it draws peakGroups' lines directly.
 */
export function buildCurve(
  peakGroups: SimulatedPeakGroup[],
  minPpm: number,
  maxPpm: number,
  numPoints: number,
  linewidthPpm: number,
): { ppm: number; intensity: number }[] {
  const points: { ppm: number; intensity: number }[] = [];
  for (let i = 0; i < numPoints; i++) {
    const ppm = minPpm + ((maxPpm - minPpm) * i) / (numPoints - 1);
    let intensity = 0;
    for (const group of peakGroups) {
      for (const line of group.lines) {
        intensity += lorentzian(ppm, line.ppm, line.intensity, linewidthPpm);
      }
    }
    points.push({ ppm, intensity });
  }
  return points;
}

/** Suggested [minPpm, maxPpm] display range for a set of peak groups -
 * spans the data with fixed padding, then clamps to a sensible
 * absolute range per nucleus so a single peak near 0 ppm doesn't
 * render as a giant empty plot. */
export function suggestedRange(
  peakGroups: SimulatedPeakGroup[],
  nucleus: "h1" | "c13",
): [number, number] {
  const allPpm = peakGroups.flatMap((g) => g.lines.map((l) => l.ppm));
  const defaultRange: [number, number] = nucleus === "h1" ? [0, 10] : [0, 200];
  if (allPpm.length === 0) return defaultRange;

  const padding = nucleus === "h1" ? 0.5 : 10;
  const dataMin = Math.min(...allPpm) - padding;
  const dataMax = Math.max(...allPpm) + padding;

  const floor = nucleus === "h1" ? -0.5 : -5;
  const ceiling = nucleus === "h1" ? 12 : 220;

  return [Math.max(floor, Math.min(dataMin, 0)), Math.min(ceiling, Math.max(dataMax, nucleus === "h1" ? 7 : 100))];
}
