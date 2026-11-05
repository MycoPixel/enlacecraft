import { describe, expect, test } from "vitest";
import { simulateH1Spectrum, simulateC13Spectrum } from "./nmrSpectrum";
import { groupByEquivalence } from "./nmrPredict";
import type { H1ShiftPrediction } from "./nmrPredict";

/**
 * An unrecognised multiplicity must be flagged, not rendered as a singlet.
 *
 * Tier 1 derives a coupling count from the multiplicity LABEL. When the label
 * wasn't in the table, `?? 0` produced zero partners - which draws a single
 * unsplit line - and because isIllustrative was derived from that count, the
 * line came out looking like the most precise thing on the plot: solid, no
 * asterisk, no caveat.
 *
 * So a proton the backend had explicitly called a multiplet ("m", emitted for
 * more than seven coupled neighbours) was displayed as a clean singlet, while
 * every tier-1 peak beside it was honestly marked as a 7 Hz stand-in. The one
 * peak we knew least about was presented most confidently - and the dropdown
 * and CSV still said "(m)", so the plot contradicted the table.
 *
 * Tier 2's compound labels ("dd", "ddd") are deliberately NOT the subject here:
 * they always arrive with real couplingHz values and take the measured path.
 */

const h1 = (
  atomIndex: number,
  ppm: number,
  multiplicity: string,
  couplingHz: number[] = [],
): H1ShiftPrediction => ({
  atomIndex,
  predictedShiftPpm: ppm,
  numHs: 1,
  multiplicity,
  multiplicityDetail: "",
  couplingHz,
  equivalenceGroup: atomIndex,
});

const simulateOne = (p: H1ShiftPrediction) =>
  simulateH1Spectrum(groupByEquivalence([p]), () => "H1")[0];

describe("unrecognised multiplicity", () => {
  test('"m" is flagged rather than drawn as a precise singlet', () => {
    const g = simulateOne(h1(0, 1.5, "m"));
    // Unsplit - we genuinely don't know the shape.
    expect(g.lines).toHaveLength(1);
    // But flagged, which is the entire point.
    expect(g.isIllustrative).toBe(true);
    expect(g.splittingUnknown).toBe(true);
  });

  test("a recognised label is NOT flagged as splitting-unknown", () => {
    for (const label of ["s", "d", "t", "q", "quint", "sext", "sept"]) {
      const g = simulateOne(h1(0, 1.5, label));
      expect(g.splittingUnknown).toBe(false);
    }
  });

  test("a genuine singlet is neither illustrative nor unknown-splitting", () => {
    // The regression risk of this fix: over-flagging would make a real singlet
    // look uncertain, which is its own kind of dishonesty.
    const g = simulateOne(h1(0, 1.5, "s"));
    expect(g.splittingUnknown).toBe(false);
    expect(g.isIllustrative).toBe(false);
  });

  test("a known tier-1 shape is illustrative but NOT unknown-splitting", () => {
    // "d" gets a 7 Hz stand-in, so the spacing is invented - but the SHAPE is
    // known, which is a different (and lesser) problem than not knowing it.
    const g = simulateOne(h1(0, 1.5, "d"));
    expect(g.isIllustrative).toBe(true);
    expect(g.splittingUnknown).toBe(false);
    expect(g.lines.length).toBeGreaterThan(1);
  });

  test("tier-2 real couplings take the measured path and are never flagged", () => {
    // A doublet of doublets with real J values. It must not be treated as an
    // unrecognised label: it has couplingHz, so its shape is measured.
    const g = simulateOne(h1(0, 2.1, "dd", [7.2, 1.9]));
    expect(g.splittingUnknown).toBe(false);
    expect(g.isIllustrative).toBe(false);
    expect(g.lines.length).toBeGreaterThan(2);
  });

  test("an unknown label with real couplings still counts as measured", () => {
    // Same reasoning for a label we don't know but whose couplings we do.
    const g = simulateOne(h1(0, 2.1, "weird", [6.0, 6.0]));
    expect(g.splittingUnknown).toBe(false);
    expect(g.isIllustrative).toBe(false);
  });

  test("the unsplit 'm' line still sits at the predicted shift", () => {
    const g = simulateOne(h1(0, 1.53, "m"));
    expect(g.lines[0].ppm).toBeCloseTo(1.53, 5);
    expect(g.centerPpm).toBeCloseTo(1.53, 5);
  });

  test("the integral is unaffected - we know how many protons, not how they split", () => {
    const many = h1(0, 1.53, "m");
    many.numHs = 3;
    const g = simulateH1Spectrum(groupByEquivalence([many]), () => "H1")[0];
    expect(g.totalIntegration).toBe(3);
    expect(g.splittingUnknown).toBe(true);
  });

  test("13C is never flagged - it is always a clean singlet", () => {
    // 13C has no splitting at all by convention, so "unknown splitting" cannot
    // apply to it. Guards against the flag leaking into the 13C path.
    const c13 = {
      atomIndex: 0,
      predictedShiftPpm: 30,
      equivalenceGroup: 0,
    };
    const groups = simulateC13ForTest([c13]);
    for (const g of groups) {
      expect(g.splittingUnknown).toBe(false);
      expect(g.isIllustrative).toBe(false);
    }
  });
});

/** The 13C path, which has no splitting at all by convention. */
function simulateC13ForTest(preds: { atomIndex: number; predictedShiftPpm: number; equivalenceGroup: number }[]) {
  return simulateC13Spectrum(groupByEquivalence(preds), () => "C1");
}