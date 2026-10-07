/**
 * Quantitative comparison of the predicted spectrum against measured peaks.
 *
 * WHY THIS EXISTS
 * ---------------
 * The overlay let you put a measured spectrum next to the prediction and judge
 * agreement with your eyes. That is a weak instrument: it can't tell you the
 * prediction is off by 0.02 ppm on one signal versus 0.8 ppm on another, and
 * it makes you eyeball a number that is exactly measurable. The interesting
 * question is not "do these line up" but "by how much, and which signals did
 * the model get wrong" - and that needs a number.
 *
 * WHAT IS MATCHED, AND WHY
 * ------------------------
 * Predicted SIGNALS (a group's centre) against measured peaks - not predicted
 * LINES against measured peaks. That distinction is the whole ballgame:
 *
 * A group's splitting into a multiplet is simulated from an assumed 400 MHz
 * field with a default J when no real coupling is available. Measured
 * splitting carries real instrument parameters. Comparing them line-for-line
 * would report a large "error" on every multiplet that isn't even a shift
 * error at all, burying the shift accuracy - the only thing a predicted
 * centre shift can actually be judged on - under noise from the part of the
 * spectrum that was never a prediction.
 *
 * So a match here means "the predicted position of this signal agrees with a
 * measured peak", which is the one claim the prediction is entitled to make.
 *
 * MATCHING IS ONE-TO-ONE AND GREEDY
 * ----------------------------------
 * Each predicted signal and each measured peak is used at most once. Without
 * that, a cluster of predicted signals could all claim the same measured peak
 * and the error would look excellent while three signals went unaccounted for.
 *
 * Greedy on nearest-first rather than optimal: for the size of a real peak
 * list (tens of peaks, not hundreds) the two agree almost always, and greedy
 * is explainable - "each peak was assigned to its closest prediction, in
 * order of closeness". An optimal assignment would be marginally better on
 * adversarial inputs and would need explaining; the summary reports what was
 * actually done so nobody has to trust it.
 */

import type { PeakListRow } from "./nmrExport";
import type { SimulatedPeakGroup } from "./nmrSpectrum";

/** One predicted signal matched to one measured peak. */
export interface PeakMatch {
  /** Label of the predicted signal group, e.g. "H1, H2, H3". */
  label: string;
  /** Predicted centre shift, ppm. */
  predictedPpm: number;
  /** Measured shift, ppm. */
  measuredPpm: number;
  /**
   * measured - predicted, in ppm.
   *
   * Sign is meaningful and consistent: NEGATIVE means the prediction is too far
   * upfield / too high a shift (it sits to the left of a real peak); POSITIVE
   * means too far downfield. Stated that way because "error" alone invites
   * reading a signed number as a magnitude.
   */
  deltaPpm: number;
  /** Predicted integral, from the peak list rather than the plot. */
  predictedIntegral: number;
  /** Measured integral as supplied in the pasted list. */
  measuredIntegral: number;
}

/** A predicted signal with no measured peak within tolerance. */
export interface UnmatchedPrediction {
  label: string;
  predictedPpm: number;
  predictedIntegral: number;
}

/** A measured peak with no predicted signal within tolerance. */
export interface UnmatchedMeasurement {
  measuredPpm: number;
  measuredIntegral: number;
  atoms: string;
}

/** Whole-comparison summary. */
export interface ComparisonResult {
  matches: PeakMatch[];
  unmatchedPredictions: UnmatchedPrediction[];
  unmatchedMeasurements: UnmatchedMeasurement[];
  /**
   * Mean absolute error, ppm. The headline number.
   *
   * Mean ABSOLUTE error deliberately, not signed mean. A signed mean would let
   * two large opposite errors cancel toward zero and look like a good
   * prediction - the exact failure that makes an average misleading.
   */
  meanAbsErrorPpm: number | null;
  /** Largest absolute error among the matches, ppm. */
  maxAbsErrorPpm: number | null;
  /** Fraction of predicted signals that found a peak, 0-1. Null when nothing
   *  was predicted, so callers can't divide by zero or render "100% matched"
   *  against an empty list. */
  matchedFraction: number | null;
  /** Fraction of measured peaks explained, 0-1. Null when nothing measured. */
  explainedFraction: number | null;
  /** How many measured peaks were offered. */
  measuredCount: number;
  /** How many predicted signals were offered. */
  predictedCount: number;
}

/**
 * Default agreement window, ppm.
 *
 * 0.15 is a conventional figure of merit for 1H - a prediction inside this
 * window is treated as "this is the right signal", and the residual is what
 * remains to explain. It is a judgement call, not a law, so it is a parameter
 * with a default rather than a constant baked in: a user comparing against a
 * sloppy low-resolution spectrum needs a looser window than one against a
 * clean reference, and there is no single right value for both.
 */
export const DEFAULT_TOLERANCE_PPM = 0.15;

/**
 * Matches predicted signals to measured peaks.
 *
 * @param peakGroups predicted signals, from the simulation
 * @param measured   parsed measured peak list
 * @param tolerancePpm agreement window; signals further apart are unmatched
 *   rather than force-fitted
 * @param labelFor integral lookup by group label, so matches report the
 *   predicted proton count. Passed in rather than recomputed because the
 *   proton count lives in the predictions, not the simulated groups.
 */
export function compareSpectrum(
  peakGroups: SimulatedPeakGroup[],
  measured: PeakListRow[],
  tolerancePpm: number,
  integralsByLabel?: Map<string, number>,
): ComparisonResult {
  const predictedCount = peakGroups.length;
  const measuredCount = measured.length;

  // Every candidate pair within tolerance, nearest first. Building the whole
  // list then consuming it in order is what makes the assignment greedy on
  // distance rather than on list order - a peak listed before its neighbour
  // still claims whichever is genuinely closer.
  const candidates: { gi: number; mi: number; delta: number }[] = [];
  peakGroups.forEach((group, gi) => {
    measured.forEach((row, mi) => {
      const delta = row.shiftPpm - group.centerPpm;
      if (Math.abs(delta) <= tolerancePpm) candidates.push({ gi, mi, delta });
    });
  });
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

  const matches: PeakMatch[] = [];
  const usedGroups = new Set<number>();
  const usedMeasured = new Set<number>();
  for (const c of candidates) {
    if (usedGroups.has(c.gi) || usedMeasured.has(c.mi)) continue;
    usedGroups.add(c.gi);
    usedMeasured.add(c.mi);
    const group = peakGroups[c.gi];
    const row = measured[c.mi];
    matches.push({
      label: group.label,
      predictedPpm: group.centerPpm,
      measuredPpm: row.shiftPpm,
      deltaPpm: c.delta,
      predictedIntegral: integralsByLabel?.get(group.label) ?? group.totalIntegration,
      measuredIntegral: row.integral,
    });
  }
  // Sorted by shift so the result reads top-to-bottom like a spectrum.
  matches.sort((a, b) => b.predictedPpm - a.predictedPpm);

  const unmatchedPredictions: UnmatchedPrediction[] = peakGroups
    .map((group, gi) => ({ group, gi }))
    .filter(({ gi }) => !usedGroups.has(gi))
    .map(({ group }) => ({
      label: group.label,
      predictedPpm: group.centerPpm,
      predictedIntegral: integralsByLabel?.get(group.label) ?? group.totalIntegration,
    }))
    .sort((a, b) => b.predictedPpm - a.predictedPpm);

  const unmatchedMeasurements: UnmatchedMeasurement[] = measured
    .map((row, mi) => ({ row, mi }))
    .filter(({ mi }) => !usedMeasured.has(mi))
    .map(({ row }) => ({
      measuredPpm: row.shiftPpm,
      measuredIntegral: row.integral,
      atoms: row.atoms,
    }))
    .sort((a, b) => b.measuredPpm - a.measuredPpm);

  let meanAbsErrorPpm: number | null = null;
  let maxAbsErrorPpm: number | null = null;
  if (matches.length > 0) {
    let sum = 0;
    let worst = 0;
    for (const m of matches) {
      const abs = Math.abs(m.deltaPpm);
      sum += abs;
      if (abs > worst) worst = abs;
    }
    meanAbsErrorPpm = sum / matches.length;
    maxAbsErrorPpm = worst;
  }

  return {
    matches,
    unmatchedPredictions,
    unmatchedMeasurements,
    meanAbsErrorPpm,
    maxAbsErrorPpm,
    matchedFraction: predictedCount > 0 ? matches.length / predictedCount : null,
    explainedFraction: measuredCount > 0 ? matches.length / measuredCount : null,
    measuredCount,
    predictedCount,
  };
}

/** Result classes, for colour-coding a match row in the UI. */
export type MatchQuality = "close" | "usable" | "poor";

/**
 * Classifies a single match.
 *
 * Thresholds are on |delta| only, and deliberately not derived from the
 * tolerance the caller passed: a match is inside tolerance by definition, so
 * colouring by the same number would make every row look the same. These are
 * fixed bands that mean the same thing regardless of the window chosen.
 */
export function classifyMatch(deltaPpm: number): MatchQuality {
  const abs = Math.abs(deltaPpm);
  if (abs <= 0.05) return "close";
  if (abs <= 0.15) return "usable";
  return "poor";
}