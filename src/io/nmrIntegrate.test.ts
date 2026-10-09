import { describe, expect, test } from "vitest";
import {
  formatProtons,
  integrateRegion,
  integrateRegions,
  type IntegrationRegion,
} from "./nmrIntegrate";
import type { SimulatedPeakGroup } from "./nmrSpectrum";

/**
 * Integration over a selected ppm window.
 *
 * The property that has to hold: integrating a signal whose proton count we
 * chose must come back as that count. That's what makes the tool a measurement
 * rather than decoration, so it's asserted against regions whose true area is
 * known exactly - a single unsplit line, whose integral IS its intensity.
 */

const LW = 0.05;

/** One signal at `ppm` with the given intensity, and no splitting. */
function sig(ppm: number, intensity: number, label = "S"): SimulatedPeakGroup {
  return {
    label,
    centerPpm: ppm,
    totalIntegration: intensity,
    lines: [{ ppm, intensity }],
    isIllustrative: false,
    splittingUnknown: false,
  };
}

const region = (id: string, lo: number, hi: number): IntegrationRegion => ({
  id,
  rangePpm: [lo, hi],
});

describe("integrateRegion", () => {
  test("a single line integrates to its intensity", () => {
    // A Lorentzian's total area is its peak height, so a lone line of known
    // intensity is the one case with an exactly known answer.
    //
    // 3% low, not exact, because a Lorentzian has infinite tails: the window
    // [2.5, 3.5] is only +/-20 linewidths, so it misses a sliver of area that
    // has genuinely spread beyond the region. That's the correct behaviour,
    // not integration error - it means a deliberately narrow window reports
    // proportionally less, which is what makes the number mean something.
    expect(integrateRegion([sig(3.0, 3)], [2.5, 3.5], LW)).toBeCloseTo(3, 0);
  });

  test("the missed area shrinks as the window widens", () => {
    // Convergence on the true value is the evidence that the short-fall above
    // is truncated tails rather than a miscalibrated scale factor. If it were
    // the latter, widening the window would never close the gap.
    const narrow = integrateRegion([sig(3.0, 3)], [2.9, 3.1], LW);
    const wide = integrateRegion([sig(3.0, 3)], [2.0, 4.0], LW);
    const veryWide = integrateRegion([sig(3.0, 3)], [0, 6], LW);
    expect(wide).toBeGreaterThan(narrow);
    expect(veryWide).toBeGreaterThan(wide);
    expect(3 - veryWide).toBeLessThan(3 - wide);
    // Within 1% once the window is +/-60 linewidths. Lorentzian tails decay
    // as 1/x^2, so the residual keeps shrinking - it just never reaches zero
    // at any finite width, which is the property being asserted.
    expect(veryWide).toBeGreaterThan(3 * 0.99);
    expect(veryWide).toBeLessThan(3);
  });

  test("a region in a gap between signals integrates to ~nothing", () => {
    // 3.7 is far from both 3.0 and 4.4 at this linewidth, so a window there
    // should catch almost no area. Guards against a bug that returns the whole
    // spectrum's area regardless of the window.
    expect(integrateRegion([sig(3.0, 3), sig(4.4, 3)], [3.7, 4.0], LW)).toBeLessThan(0.05);
  });

  test("a wider window over the same signal catches more area", () => {
    const narrow = integrateRegion([sig(3.0, 3)], [2.9, 3.1], LW);
    const wide = integrateRegion([sig(3.0, 3)], [2.0, 4.0], LW);
    expect(wide).toBeGreaterThan(narrow);
    // ...but never more than the whole line, which is the intensity.
    expect(wide).toBeLessThanOrEqual(3.01);
  });

  test("splitted lines sum to the group's proton count", () => {
    // A quartet of 0.75 each is 3H - the case the docstring claims this
    // handles by integrating the envelope rather than counting lines.
    const quartet: SimulatedPeakGroup = {
      ...sig(3.65, 0, "CH2"),
      lines: [3.57, 3.61, 3.65, 3.69].map((ppm) => ({ ppm, intensity: 0.75 })),
    };
    // Same tail effect as above: within a couple of percent of 3H.
    expect(integrateRegion([quartet], [3.3, 4.0], LW)).toBeCloseTo(3, 0);
  });

  test("degenerate ranges give 0 rather than NaN", () => {
    // The UI lets a region be drawn with zero width mid-drag; NaN here would
    // poison every downstream ratio.
    expect(integrateRegion([sig(3.0, 3)], [3.0, 3.0], LW)).toBe(0);
    expect(integrateRegion([sig(3.0, 3)], [3.0, 2.0], LW)).toBe(0);
    expect(integrateRegion([], [1, 2], LW)).toBe(0);
  });
});

describe("integrateRegions", () => {
  const spectrum = [sig(3.0, 3, "CH3"), sig(4.4, 6, "CH2")];

  test("ratios come back against the smallest region", () => {
    const out = integrateRegions(
      spectrum,
      [region("a", 2.5, 3.5), region("b", 3.9, 4.9)],
      LW,
    );
    // 3H vs 6H -> 1 : 2, normalized on the smaller. Both windows clip their
    // signal's tails by a similar fraction, so the ratio holds to ~1%.
    expect(out[0].ratio).toBeCloseTo(1, 1);
    expect(out[1].ratio).toBeCloseTo(2, 1);
  });

  test("a single region has no ratio to report", () => {
    const out = integrateRegions(spectrum, [region("a", 2.5, 3.5)], LW);
    expect(out[0].ratio).toBeNull();
  });

  test("absolute protons require a calibration, and stay null without one", () => {
    const regions = [region("a", 2.5, 3.5), region("b", 3.9, 4.9)];
    expect(integrateRegions(spectrum, regions, LW)[0].protons).toBeNull();
  });

  test("a calibrated reference scales every other region", () => {
    const regions = [region("a", 2.5, 3.5), region("b", 3.9, 4.9)];
    const out = integrateRegions(spectrum, regions, LW, "a", 3);
    expect(out[0].protons).toBeCloseTo(3, 2);
    expect(out[1].protons).toBeCloseTo(6, 1);
  });

  test("a nonsensical calibration is ignored rather than producing nonsense", () => {
    // Zero or negative "protons" would divide to garbage or invert every count.
    const regions = [region("a", 2.5, 3.5)];
    expect(integrateRegions(spectrum, regions, LW, "a", 0)[0].protons).toBeNull();
    expect(integrateRegions(spectrum, regions, LW, "a", -3)[0].protons).toBeNull();
    // A reference id that isn't in the set, too.
    expect(integrateRegions(spectrum, regions, LW, "nope", 3)[0].protons).toBeNull();
  });

  test("a zero-area region does not send every ratio to infinity", () => {
    // One region drawn entirely in a gap: it must not become the divisor.
    const out = integrateRegions(
      spectrum,
      [region("gap", 3.7, 4.0), region("a", 2.5, 3.5)],
      LW,
    );
    expect(Number.isFinite(out[1].ratio ?? NaN)).toBe(true);
    expect(Number.isFinite(out[0].ratio ?? NaN)).toBe(true);
  });
});

describe("formatProtons", () => {
  test("snaps to a readable half-integer", () => {
    // 1.97 is 2. Printing the float would imply precision the model lacks.
    expect(formatProtons(1.97)).toBe("2");
    expect(formatProtons(2.02)).toBe("2");
    expect(formatProtons(3.74)).toBe("3.5");
    expect(formatProtons(6)).toBe("6");
  });

  test("an uncalibrated count reads as a dash, not as zero", () => {
    // Zero would read as "no protons here" - a claim. A dash reads as "unknown".
    expect(formatProtons(null)).toBe("-");
    expect(formatProtons(NaN)).toBe("-");
  });
});