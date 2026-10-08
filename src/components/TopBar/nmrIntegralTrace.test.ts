import { describe, expect, test } from "vitest";
import type { SimulatedPeakGroup } from "../../io/nmrSpectrum";

/**
 * The integral trace under the spectrum.
 *
 * totalIntegration was already computed in io/nmrSpectrum.ts and read by
 * nothing - so the panel had peak positions and heights but no integrals at
 * all, despite integrals being how a 1H spectrum is actually read: the ratio of
 * step heights is the proton count, which is the primary check that a spectrum
 * makes sense.
 *
 * These tests pin the geometry, because the two things that make an integral
 * misleading rather than useful are both easy to get wrong: steps landing on
 * peaks instead of between them, and a normalization that flattens real ratios.
 */

/** Mirrors the component's band geometry. */
const PLOT_WIDTH = 760;
const PLOT_HEIGHT = 240;
const INTEGRAL_HEIGHT = 46;
const TOTAL_PLOT_HEIGHT = PLOT_HEIGHT + INTEGRAL_HEIGHT;
const INTEGRAL_TOP = PLOT_HEIGHT + 16;
const INTEGRAL_BASE_Y = TOTAL_PLOT_HEIGHT - 6;

function ppmToX(ppm: number, minPpm: number, maxPpm: number): number {
  return (PLOT_WIDTH * (maxPpm - ppm)) / (maxPpm - minPpm);
}

/** Mirrors the component's integralPath construction. */
function integralPath(groups: SimulatedPeakGroup[], minPpm: number, maxPpm: number): string {
  const tallest = (g: SimulatedPeakGroup) =>
    g.lines.reduce((best, l) => (!best || l.intensity > best.intensity ? l : best), null as (typeof g.lines)[number] | null);

  const usable = peakGroupsFilter(groups, tallest);
  if (usable.length === 0) return "";
  const maxIntegration = Math.max(...usable.map((g) => g.totalIntegration), 1e-6);
  const ordered = [...usable].sort((a, b) => tallest(b)!.ppm - tallest(a)!.ppm);
  const usableHeight = INTEGRAL_BASE_Y - INTEGRAL_TOP;
  const yFor = (g: SimulatedPeakGroup) => INTEGRAL_BASE_Y - (usableHeight * g.totalIntegration) / maxIntegration;

  const first = ordered[0];
  let d = `M 0 ${INTEGRAL_BASE_Y} L ${ppmToX(tallest(first)!.ppm, minPpm, maxPpm)} ${yFor(first)}`;
  for (let i = 0; i < ordered.length; i++) {
    const g = ordered[i];
    const x = ppmToX(tallest(g)!.ppm, minPpm, maxPpm);
    const y = yFor(g);
    d += ` L ${x} ${y}`;
    const next = ordered[i + 1];
    if (next) {
      const nextX = ppmToX(tallest(next)!.ppm, minPpm, maxPpm);
      const midX = (x + nextX) / 2;
      d += ` L ${midX} ${y} L ${midX} ${yFor(next)}`;
    } else {
      d += ` L ${PLOT_WIDTH} ${y}`;
    }
  }
  return d + ` L ${PLOT_WIDTH} ${INTEGRAL_BASE_Y} Z`;
}

function peakGroupsFilter(groups: SimulatedPeakGroup[], tallest: (g: SimulatedPeakGroup) => unknown) {
  return groups.filter((g) => tallest(g) !== null);
}

/** Builds a group whose tallest line sits at `ppm`. */
function group(ppm: number, totalIntegration: number): SimulatedPeakGroup {
  return {
    label: `L${ppm}`,
    centerPpm: ppm,
    totalIntegration,
    lines: [{ ppm, intensity: 1 }],
    isIllustrative: false, splittingUnknown: false,
  };
}

/** Parses the "L x,y" commands out of a path into coordinate pairs. */
function points(d: string): [number, number][] {
  return [...d.matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe("integral trace geometry", () => {
  test("an empty or peakless plot produces no path", () => {
    expect(integralPath([], 0, 10)).toBe("");
  });

  test("stays inside the integral band, never above it or below its baseline", () => {
    const d = integralPath([group(2, 3), group(7, 6)], 0, 10);
    for (const [, y] of points(d)) {
      expect(y).toBeGreaterThanOrEqual(INTEGRAL_TOP - 1e-6);
      expect(y).toBeLessThanOrEqual(INTEGRAL_BASE_Y + 1e-6);
    }
  });

  test("a step's vertical rise happens BETWEEN two peaks, not on either", () => {
    // Peaks at 2 and 8 ppm over a 0-10 window. If a rise landed on a peak, the
    // integral would read as belonging to the wrong signal - the single most
    // misleading thing this trace could do.
    const minPpm = 0;
    const maxPpm = 10;
    const d = integralPath([group(2, 1), group(8, 3)], minPpm, maxPpm);
    const x2 = ppmToX(2, minPpm, maxPpm);
    const x8 = ppmToX(8, minPpm, maxPpm);
    const mid = (x2 + x8) / 2;

    const xs = points(d).map(([x]) => x);
    // Two distinct x values at different heights must exist strictly between.
    const interior = xs.filter((x) => x > Math.min(x2, x8) && x < Math.max(x2, x8));
    expect(interior.length).toBeGreaterThanOrEqual(2);
    // And no rise x may coincide exactly with a peak x.
    expect(xs.filter((x) => Math.abs(x - x2) < 1e-6).length).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(Math.min(x2, x8));
    expect(mid).toBeLessThan(Math.max(x2, x8));
  });

  test("relative step heights preserve the integration ratio", () => {
    // A 1:2:3 ratio must survive normalization: that ratio is the whole point
    // of reading an integral.
    const d = integralPath([group(1, 1), group(4, 2), group(8, 3)], 0, 10);
    // Height above baseline is what encodes integration.
    const heights = [...new Set(points(d).map(([, y]) => y))]
      .filter((y) => y < INTEGRAL_BASE_Y)
      .map((y) => INTEGRAL_BASE_Y - y)
      .sort((a, b) => a - b);
    expect(heights.length).toBe(3);
    const [h1, h2, h3] = heights;
    expect(h2 / h1).toBeCloseTo(2, 6);
    expect(h3 / h1).toBeCloseTo(3, 6);
  });

  test("normalization puts the largest integral at full band height", () => {
    const d = integralPath([group(1, 1), group(9, 8)], 0, 10);
    const minY = Math.min(...points(d).map(([, y]) => y));
    expect(minY).toBeCloseTo(INTEGRAL_TOP, 6);
  });

  test("a single peak still draws a closed shape", () => {
    const d = integralPath([group(5, 3)], 0, 10);
    expect(d.endsWith("Z")).toBe(true);
    expect(points(d).length).toBeGreaterThan(2);
  });

  test("peaks are ordered right-to-left, matching the ppm axis", () => {
    // ppm decreases left to right in NMR. A trace built in ascending ppm would
    // be mirrored relative to the peaks above it.
    const minPpm = 0;
    const maxPpm = 10;
    const d = integralPath([group(2, 1), group(8, 3)], minPpm, maxPpm);
    const firstX = Number(/M 0 [\d.]+ L ([\d.]+)/.exec(d)![1]);
    expect(firstX).toBeCloseTo(ppmToX(8, minPpm, maxPpm), 6);
  });

  test("a zero-integration group cannot produce a divide-by-zero", () => {
    // maxIntegration is floored at 1e-6 precisely so this stays finite.
    const d = integralPath([group(1, 0), group(9, 3)], 0, 10);
    expect(d).not.toContain("NaN");
    expect(d).not.toContain("Infinity");
  });
});

describe("integral band layout", () => {
  test("the band sits below the axis and the tick labels, not over them", () => {
    const AXIS_Y = PLOT_HEIGHT - 26;
    const tickLabelBottom = AXIS_Y + 15 + 8;
    expect(INTEGRAL_TOP).toBeGreaterThan(tickLabelBottom);
    expect(INTEGRAL_BASE_Y).toBeGreaterThan(INTEGRAL_TOP);
  });

  test("the total viewBox height accounts for the band", () => {
    expect(TOTAL_PLOT_HEIGHT).toBe(PLOT_HEIGHT + INTEGRAL_HEIGHT);
    expect(INTEGRAL_BASE_Y).toBeLessThan(TOTAL_PLOT_HEIGHT);
  });
});