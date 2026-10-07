import { describe, expect, test } from "vitest";
import {
  compareSpectrum,
  classifyMatch,
  DEFAULT_TOLERANCE_PPM,
  type ComparisonResult,
} from "./nmrCompare";
import type { PeakListRow } from "./nmrExport";
import type { SimulatedPeakGroup } from "./nmrSpectrum";

/**
 * Quantitative prediction-vs-measurement comparison.
 *
 * The overlay made agreement a visual judgement. This makes it a number, which
 * is the only way to tell "off by 0.02 ppm on one signal" from "off by 0.8 on
 * another" - and to say which signals the model simply got wrong.
 *
 * The decisions most worth pinning are the ones where the obvious
 * implementation is quietly wrong:
 *  - a matched SIGNALS, not predicted multiplet LINES against measured peaks
 *  - one-to-one assignment, so one measured peak can't validate three signals
 *  - mean ABSOLUTE error, so opposite errors can't cancel to fake a good score
 *  - fractions are null (not 0 or 1) when there's nothing to divide by
 */

const grp = (label: string, centerPpm: number, totalIntegration = 1): SimulatedPeakGroup => ({
  label,
  centerPpm,
  totalIntegration,
  lines: [{ ppm: centerPpm, intensity: 1 }],
  isIllustrative: false,
});

const row = (shiftPpm: number, integral = 1, atoms = ""): PeakListRow => ({
  shiftPpm,
  integral,
  multiplicity: "",
  atoms,
  detail: "",
});

const TOL = DEFAULT_TOLERANCE_PPM;

describe("compareSpectrum matching", () => {
  test("matches a predicted signal to a nearby measured peak", () => {
    const r = compareSpectrum([grp("H1", 3.74)], [row(3.75)], TOL);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ label: "H1", predictedPpm: 3.74, measuredPpm: 3.75 });
  });

  test("records delta as measured minus predicted, with consistent sign", () => {
    // Negative = prediction too far upfield (sits left of the real peak).
    const high = compareSpectrum([grp("H1", 3.74)], [row(3.80)], TOL);
    expect(high.matches[0].deltaPpm).toBeCloseTo(0.06);
    const low = compareSpectrum([grp("H1", 3.80)], [row(3.74)], TOL);
    expect(low.matches[0].deltaPpm).toBeCloseTo(-0.06);
  });

  test("leaves signals further apart than tolerance unmatched rather than force-fitting", () => {
    // Forcing a bad match would hide exactly the discrepancy worth seeing.
    const r = compareSpectrum([grp("H1", 3.74)], [row(4.50)], TOL);
    expect(r.matches).toHaveLength(0);
    expect(r.unmatchedPredictions).toHaveLength(1);
    expect(r.unmatchedMeasurements).toHaveLength(1);
  });

  test("treats the tolerance boundary as inclusive", () => {
    const r = compareSpectrum([grp("H1", 3.74)], [row(3.74 + TOL)], TOL);
    expect(r.matches).toHaveLength(1);
  });

  test("uses one measured peak at most once", () => {
    // Without this, three predictions could all claim one peak and the error
    // would look fine while three signals went unaccounted for.
    const r = compareSpectrum([grp("A", 3.70), grp("B", 3.72), grp("C", 3.74)], [row(3.72)], TOL);
    expect(r.matches).toHaveLength(1);
    expect(r.unmatchedPredictions).toHaveLength(2);
  });

  test("uses one prediction at most once", () => {
    const r = compareSpectrum([grp("A", 3.72)], [row(3.70), row(3.74)], TOL);
    expect(r.matches).toHaveLength(1);
    expect(r.unmatchedMeasurements).toHaveLength(1);
  });

  test("assigns nearest-first, not in list order", () => {
    // The closer prediction wins even though its peak is listed second.
    const r = compareSpectrum([grp("far", 3.60), grp("near", 3.70)], [row(3.71), row(3.61)], TOL);
    expect(r.matches.find((m) => m.measuredPpm === 3.61)?.label).toBe("far");
    expect(r.matches.find((m) => m.measuredPpm === 3.71)?.label).toBe("near");
  });

  test("a greedy match beats the naive order-based one when peaks are ambiguous", () => {
    // Grouping order vs measurement order disagree here; nearest-first pairs
    // each signal with its actual counterpart.
    const r = compareSpectrum([grp("A", 2.00), grp("B", 2.10)], [row(2.11), row(2.01)], TOL);
    const byLabel = new Map(r.matches.map((m) => [m.label, m.measuredPpm]));
    expect(byLabel.get("A")).toBeCloseTo(2.01);
    expect(byLabel.get("B")).toBeCloseTo(2.11);
  });

  test("matches on the signal centre, ignoring simulated multiplet lines", () => {
    // A predicted doublet's two lines sit either side of the centre; measured
    // "peaks" here are single positions. Matching lines instead of centres
    // would report a spurious error on every multiplet.
    const doublet: SimulatedPeakGroup = {
      label: "H1",
      centerPpm: 3.74,
      totalIntegration: 1,
      lines: [
        { ppm: 3.68, intensity: 0.5 },
        { ppm: 3.80, intensity: 0.5 },
      ],
      isIllustrative: false,
    };
    const r = compareSpectrum([doublet], [row(3.74)], TOL);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].deltaPpm).toBe(0);
  });

  test("survives an empty measurement without dividing by zero", () => {
    const r = compareSpectrum([grp("H1", 3.74)], [], TOL);
    expect(r.matches).toHaveLength(0);
    expect(r.meanAbsErrorPpm).toBeNull();
    expect(r.explainedFraction).toBeNull();
    expect(r.matchedFraction).toBe(0);
  });

  test("survives an empty prediction without claiming a perfect score", () => {
    // The failure this guards: matchedFraction null, never 1. "100% matched"
    // against nothing predicted is a lie the UI would happily render.
    //
    // explainedFraction is deliberately NOT null here - one measured peak was
    // offered and none of it was explained, and "0% explained" is a true and
    // useful thing to say. Null is reserved for an empty denominator.
    const r = compareSpectrum([], [row(3.74)], TOL);
    expect(r.matches).toHaveLength(0);
    expect(r.matchedFraction).toBeNull();
    expect(r.explainedFraction).toBe(0);
    expect(r.meanAbsErrorPpm).toBeNull();
  });

  test("both empty inputs are handled", () => {
    const r: ComparisonResult = compareSpectrum([], [], TOL);
    expect(r.matches).toEqual([]);
    expect(r.meanAbsErrorPpm).toBeNull();
    expect(r.matchedFraction).toBeNull();
    expect(r.explainedFraction).toBeNull();
  });

  test("zero tolerance still matches coincident peaks exactly", () => {
    const r = compareSpectrum([grp("H1", 3.74)], [row(3.74)], 0);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].deltaPpm).toBe(0);
  });

  test("matches sort by descending shift, reading top-to-bottom like a spectrum", () => {
    const r = compareSpectrum([grp("low", 1.2), grp("high", 7.8), grp("mid", 3.7)], [
      row(1.21),
      row(7.81),
      row(3.71),
    ], TOL);
    expect(r.matches.map((m) => m.predictedPpm)).toEqual([7.8, 3.7, 1.2]);
  });

  test("reports predicted and measured integrals on each match", () => {
    const integrals = new Map([["H1, H2, H3", 3]]);
    const r = compareSpectrum([grp("H1, H2, H3", 3.74)], [row(3.75, 3)], TOL, integrals);
    expect(r.matches[0].predictedIntegral).toBe(3);
    expect(r.matches[0].measuredIntegral).toBe(3);
  });

  test("falls back to the group's own integration when no map is supplied", () => {
    const r = compareSpectrum([grp("H1", 3.74, 2)], [row(3.75, 1)], TOL);
    expect(r.matches[0].predictedIntegral).toBe(2);
  });
});

describe("summary statistics", () => {
  test("mean absolute error averages magnitudes", () => {
    const r = compareSpectrum([grp("A", 3.70), grp("B", 3.90)], [row(3.75), row(3.85)], TOL);
    expect(r.meanAbsErrorPpm).toBeCloseTo(0.05);
  });

  test("opposite errors cannot cancel into a falsely good score", () => {
    // +0.10 and -0.10 have a signed mean of 0. Reporting that as the error
    // would claim a perfect prediction from two mediocre ones.
    const r = compareSpectrum([grp("A", 3.70), grp("B", 3.90)], [row(3.80), row(3.80)], TOL);
    expect(r.meanAbsErrorPpm).toBeGreaterThan(0.05);
    expect(r.meanAbsErrorPpm).toBeCloseTo(0.1);
  });

  test("max error reports the single worst signal, not the average", () => {
    const r = compareSpectrum(
      [grp("A", 3.70), grp("B", 3.90), grp("C", 4.10)],
      [row(3.72), row(3.90), row(4.20)],
      TOL,
    );
    expect(r.meanAbsErrorPpm).toBeLessThan(r.maxAbsErrorPpm!);
    expect(r.maxAbsErrorPpm).toBeCloseTo(0.10);
  });

  test("matched and explained fractions reflect what was actually paired", () => {
    const r = compareSpectrum([grp("A", 3.70), grp("B", 3.90)], [row(3.71)], TOL);
    expect(r.matchedFraction).toBe(0.5);
    expect(r.explainedFraction).toBe(1);
  });

  test("counts reflect the inputs", () => {
    const r = compareSpectrum([grp("A", 3.70)], [row(3.71), row(9.9)], TOL);
    expect(r.predictedCount).toBe(1);
    expect(r.measuredCount).toBe(2);
  });

  test("unmeasured peaks are listed with their atom assignments when present", () => {
    // An unexplained measured peak with an assignment is the most actionable
    // thing in the whole comparison: the model missed a known signal.
    const r = compareSpectrum([grp("A", 3.70)], [row(3.71, 1, "H1"), row(7.26, 2, "H9")], TOL);
    expect(r.unmatchedMeasurements).toEqual([{ measuredPpm: 7.26, measuredIntegral: 2, atoms: "H9" }]);
  });
});

describe("classifyMatch", () => {
  test("bands are on magnitude, not sign", () => {
    expect(classifyMatch(0.04)).toBe("close");
    expect(classifyMatch(-0.04)).toBe("close");
  });

  test("crosses bands at the fixed thresholds", () => {
    expect(classifyMatch(0.05)).toBe("close");
    expect(classifyMatch(0.051)).toBe("usable");
    expect(classifyMatch(0.15)).toBe("usable");
    expect(classifyMatch(0.151)).toBe("poor");
  });

  test("an exact hit is the best possible band", () => {
    expect(classifyMatch(0)).toBe("close");
  });
});