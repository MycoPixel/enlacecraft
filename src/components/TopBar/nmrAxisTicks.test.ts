import { describe, expect, test } from "vitest";

/**
 * Spectrum axis readability.
 *
 * The default axis divided the visible range into exactly six equal parts, so
 * a typical 0-10 ppm 1H window got ticks 1.67 ppm apart. That's too coarse to
 * read anything in the aromatic region, where signals routinely sit 0.1 ppm
 * apart, and it puts ugly fractional labels on the axis (1.67, 3.33, 5.00).
 *
 * These tests pin the replacement: a step snapped to the conventional 1/2/5
 * ladder, giving round numbers a reader can count in halves of.
 */

/** Mirror of the component's niceTickStep (kept local so this file has no React import). */
function niceTickStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const snapped = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return snapped * magnitude;
}

/** Mirror of the default branch that builds the tick list. */
function defaultTicks(minPpm: number, maxPpm: number): number[] {
  const step = niceTickStep((maxPpm - minPpm) / 8);
  const first = Math.ceil(minPpm / step) * step;
  const result: number[] = [];
  for (let i = 0, v = first; v <= maxPpm + 1e-9 && i < 60; i++, v = first + step * i) {
    result.push(Math.round(v / step) * step);
  }
  return result;
}

describe("niceTickStep", () => {
  test("snaps a raw 1.25 ppm interval to 1", () => {
    // A 0-10 ppm window targets (10 / 8) = 1.25.
    expect(niceTickStep(1.25)).toBe(1);
  });

  test("snaps to the 1/2/5 ladder across a decade", () => {
    expect(niceTickStep(0.11)).toBe(0.1);
    expect(niceTickStep(0.21)).toBe(0.2);
    expect(niceTickStep(0.51)).toBe(0.5);
    expect(niceTickStep(1.1)).toBe(1);
    expect(niceTickStep(2.1)).toBe(2);
    expect(niceTickStep(5.1)).toBe(5);
  });

  test("scales the ladder to any magnitude, not just 0-10", () => {
    // A wide 13C window, and a heavily zoomed 1H slice.
    expect(niceTickStep(20)).toBe(20);
    expect(niceTickStep(0.025)).toBe(0.02);
    expect(niceTickStep(250)).toBe(200);
  });

  test("degenerate input can't produce a zero or infinite step", () => {
    // A zero step would make the tick loop non-terminating.
    expect(niceTickStep(0)).toBe(1);
    expect(niceTickStep(-5)).toBe(1);
    expect(niceTickStep(NaN)).toBe(1);
    expect(niceTickStep(Infinity)).toBe(1);
  });
});

describe("default axis ticks", () => {
  test("a typical 1H window now divides by a whole number, not 1.67", () => {
    const ticks = defaultTicks(0, 10);
    // Step is 1 ppm, so these are integers - no 1.67 / 3.33 labels.
    for (const t of ticks) expect(Number.isInteger(t)).toBe(true);
    expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("a typical 13C window uses 2 ppm ticks", () => {
    const ticks = defaultTicks(0, 12);
    expect(ticks).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  test("a zoomed aromatic slice gets sub-ppm resolution", () => {
    // 7.0-8.0 ppm, where aromatic protons crowd. This is the case the old
    // 6-division default could not render at all: 1 ppm / 6 put ticks 0.167
    // apart *on average*, but they landed on unrepresentable fractions like
    // 7.17 and 7.33, so nothing could actually be read off them.
    const ticks = defaultTicks(7, 8);
    // Step snaps to 0.1 - ten intervals across the window.
    expect(ticks[1] - ticks[0]).toBeCloseTo(0.1, 10);
    expect(ticks.length).toBe(11);
    expect(ticks[0]).toBe(7);
    expect(ticks[ticks.length - 1]).toBe(8);
    // Every tick a clean tenth, i.e. no float drift left in the values that
    // get formatted for display.
    for (const t of ticks) expect(Math.abs(t * 10 - Math.round(t * 10))).toBeLessThan(1e-9);
  });

  test("ticks stay inside the window", () => {
    for (const [lo, hi] of [[0, 10], [7, 8], [-1, 1], [3.2, 9.7], [110, 160]]) {
      for (const t of defaultTicks(lo, hi)) {
        expect(t).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(t).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });

  test("every window produces a bounded number of ticks", () => {
    // The loop caps at 60, so a pathologically fine step can't hang the plot.
    for (const [lo, hi] of [[0, 10], [0, 220], [7, 7.01]]) {
      expect(defaultTicks(lo, hi).length).toBeLessThanOrEqual(60);
    }
  });

  test("negative ranges work (unusual, but possible after a manual zoom)", () => {
    // 4 ppm across 8 targets 0.5, which snaps to the 0.5 rung.
    const ticks = defaultTicks(-2, 2);
    expect(ticks[0]).toBe(-2);
    expect(ticks[ticks.length - 1]).toBe(2);
    expect(ticks).toContain(0);
    expect(ticks[1] - ticks[0]).toBeCloseTo(0.5, 10);
  });

  test("an empty range doesn't loop forever", () => {
    // min === max would make (range / 8) zero; the helper's guard handles it.
    expect(defaultTicks(5, 5).length).toBeLessThanOrEqual(1);
  });
});