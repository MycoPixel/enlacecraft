import { describe, expect, test } from "vitest";
import { spectrumToSvg } from "./nmrSvg";
import { niceTickStep, ticksForRange, decimalsForStep } from "./nmrAxisTicks";
import type { SimulatedPeakGroup } from "./nmrSpectrum";

/**
 * Standalone SVG of the predicted spectrum.
 *
 * This was on the original export list and got dropped without saying so.
 *
 * The point of building the figure from the DATA rather than serialising the
 * live <svg> node is that the on-screen plot gets its appearance entirely from
 * app.css - a serialised DOM carries class names and nothing else, so it
 * renders unstyled in Word or Illustrator. Plus it would capture whatever was on
 * screen (drag-zoom, intensity zoom, the experimental overlay) rather than the
 * full spectrum, and it has no axis units.
 *
 * So the assertions below are mostly about SELF-CONTAINMENT: that the output
 * doesn't depend on anything external, and that it stays well-formed XML, since
 * malformed output renders as a blank box with no error anywhere.
 */

const grp = (label: string, centerPpm: number, lines: number[], illustrative = false): SimulatedPeakGroup => ({
  label,
  centerPpm,
  totalIntegration: 1,
  lines: lines.map((ppm) => ({ ppm, intensity: 1 })),
  isIllustrative: illustrative,
});

const aspirinish = [
  grp("H1", 7.83, [7.83]),
  grp("H2, H6", 7.55, [7.55]),
  grp("H5", 4.35, [4.35], true),
  grp("H9", 3.74, [3.74]),
  grp("H8", 2.36, [2.36], true),
  grp("H7", 2.31, [2.31], true),
  grp("CH3", 2.08, [2.08]),
  grp("CH3", 1.2, [1.2]),
];

/**
 * The vertical peak lines in an SVG, split into solid and dashed.
 *
 * Parsed by geometry rather than matched with one big regex: gridlines and tick
 * marks share the peak stroke colour, so "the #1b2027 lines" is not a peak set.
 * A peak is distinguished by being vertical (x1 === x2) and rising from the
 * baseline (y2 above y1).
 */
function peakLines(svg: string): { solid: string[]; dashed: string[] } {
  const solid: string[] = [];
  const dashed: string[] = [];
  for (const m of svg.match(/<line[^>]*\/>/g) ?? []) {
    const x1 = /x1="([\d.-]+)"/.exec(m)?.[1];
    const x2 = /x2="([\d.-]+)"/.exec(m)?.[1];
    const y1 = Number(/y1="([\d.-]+)"/.exec(m)?.[1]);
    const y2 = Number(/y2="([\d.-]+)"/.exec(m)?.[1]);
    if (x1 !== x2 || !Number.isFinite(y1) || !Number.isFinite(y2) || y2 >= y1) continue;
    (m.includes("dasharray") ? dashed : solid).push(m);
  }
  return { solid, dashed };
}

describe("spectrumToSvg", () => {
  test("is a complete, self-contained SVG document", () => {
    const out = spectrumToSvg(aspirinish, "h1", "Aspirin", [0, 8.5]);
    expect(out.startsWith("<svg")).toBe(true);
    expect(out.trimEnd().endsWith("</svg>")).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain("viewBox=");
  });

  test("carries no class names, so it cannot depend on app.css", () => {
    // The whole reason this builds from data. A class="nmr-spectrum-plot__stick"
    // would render as nothing in a document editor.
    const out = spectrumToSvg(aspirinish, "h1", "Aspirin", [0, 8.5]);
    expect(out).not.toMatch(/class=/);
    expect(out).not.toContain("<style");
    expect(out).not.toContain("style=");
  });

  test("every stroke and fill is an explicit presentation attribute", () => {
    const out = spectrumToSvg(aspirinish, "h1", "Aspirin", [0, 8.5]);
    const painted = out.match(/<(line|text|path|rect)\b[^>]*>/g) ?? [];
    expect(painted.length).toBeGreaterThan(10);
    for (const el of painted) {
      expect(el).toMatch(/stroke=|fill=/);
    }
  });

  test("is well-formed XML - a parse error would render as a blank box", () => {
    const out = spectrumToSvg(aspirinish, "h1", "Aspirin", [0, 8.5]);
    // Bracket balance is the cheap structural check; the tag names below pin
    // that every opened element is also closed.
    const opens = (out.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
    const closes = (out.match(/<\//g) ?? []).length + (out.match(/\/>/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  test("escapes a title containing XML metacharacters", () => {
    // A structure named "Benzo[a]pyrene <isomer> & salts" would otherwise
    // produce an unparseable document.
    const out = spectrumToSvg(aspirinish, "h1", 'Benzo[a]pyrene <x> & "y"', [0, 8.5]);
    expect(out).toContain("&lt;x&gt;");
    expect(out).toContain("&amp;");
    expect(out).not.toMatch(/<x>/);
    const opens = (out.match(/<(?!\/)[a-zA-Z]/g) ?? []).length;
    const closes = (out.match(/<\//g) ?? []).length + (out.match(/\/>/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  test("axis runs right-to-left, as an NMR axis must", () => {
    // ppm decreases left to right. Getting this backwards is the classic
    // way an exported figure ends up mirrored relative to the app.
    const out = spectrumToSvg(aspirinish, "h1", "", [0, 8]);
    const leftmostLabel = />0</.test(out);
    expect(leftmostLabel).toBe(true);
  });

  test("draws a TMS marker only when the range includes 0", () => {
    const withZero = spectrumToSvg(aspirinish, "h1", "", [0, 8]);
    expect(withZero).toContain("TMS");
    // A zoomed 7-8 ppm window has no 0 ppm in it, so claiming TMS would be a lie.
    const zoomed = spectrumToSvg(aspirinish, "h1", "", [7, 8]);
    expect(zoomed).not.toContain("TMS");
  });

  test("labels the axis with ppm and the right nucleus", () => {
    expect(spectrumToSvg(aspirinish, "h1", "", [0, 8])).toContain("\u03b4 (ppm)");
    expect(spectrumToSvg(aspirinish, "h1", "", [0, 8])).toContain("\u00b9H");
    expect(spectrumToSvg(aspirinish, "c13", "", [0, 200])).toContain("\u00b9\u00b3C");
  });

  test("a 13C figure says it is proton-decoupled, matching the app", () => {
    const out = spectrumToSvg(aspirinish, "c13", "", [0, 200]);
    expect(out).toContain("proton-decoupled");
  });

  test("carries a caveat, since a figure pasted into a report loses the UI's", () => {
    // Every caveat in the app lives in surrounding chrome. Lift the image out and
    // all of it is gone, so the honesty has to travel with the pixels.
    const out = spectrumToSvg(aspirinish, "h1", "", [0, 8]);
    expect(out).toContain("Not a measured spectrum");
  });

  test("dashes illustrative-splitting peaks and leaves real ones solid", () => {
    const out = spectrumToSvg(
      [grp("real", 3.7, [3.7], false), grp("illustrative", 4.3, [4.3], true)],
      "h1",
      "",
      [0, 8],
    );
    const { solid, dashed } = peakLines(out);
    expect(solid).toHaveLength(1);
    expect(dashed).toHaveLength(1);
    // A dashed peak must be marked, never silently drawn as if it were a
    // measurement - the whole point of isIllustrative.
    for (const el of dashed) expect(el).toContain('stroke-dasharray="2 2"');
    for (const el of solid) expect(el).not.toContain("dasharray");
  });

  test("draws the integral trace", () => {
    const out = spectrumToSvg(aspirinish, "h1", "", [0, 8]);
    expect(out).toContain("<path");
    expect(out).toContain("integral");
  });

  test("survives an empty prediction without throwing or emitting NaN", () => {
    const out = spectrumToSvg([], "h1", "Nothing", [0, 10]);
    expect(out).toContain("</svg>");
    expect(out).not.toMatch(/NaN|Infinity/);
  });

  test("survives a degenerate range", () => {
    expect(spectrumToSvg(aspirinish, "h1", "", [5, 5])).not.toMatch(/NaN|Infinity/);
  });

  test("size is fixed, so output does not vary with the browser or zoom", () => {
    const out = spectrumToSvg(aspirinish, "h1", "", [0, 8]);
    expect(out).toContain('width="760"');
    expect(out).toContain('height="420"');
  });
});

describe("ticksForRange", () => {
  test("produces the 1/2/5 ladder", () => {
    expect(ticksForRange(0, 10, 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ticksForRange(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticksForRange(0, 10, 5)).toEqual([0, 5, 10]);
  });

  test("snaps away float drift", () => {
    // 0.1 + 0.1 + 0.1 !== 0.3, which would otherwise label a tick 0.30000000004.
    expect(ticksForRange(0, 1, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  test("anchors to absolute multiples so two windows line up", () => {
    // The point is that a tick labelled "2" is at the same absolute value in
    // both windows, which is what lets two plots be compared by eye. The arrays
    // need not be equal - each only covers its own range.
    const a = ticksForRange(0.4, 4.6, 1);
    const b = ticksForRange(0, 4, 1);
    expect(a.filter((t) => b.includes(t))).toEqual([1, 2, 3, 4]);
  });

  test("guards a tiny step over a wide range", () => {
    expect(ticksForRange(0, 200, 0.01).length).toBeLessThanOrEqual(60);
  });

  test("degenerate input yields no ticks rather than throwing", () => {
    expect(ticksForRange(0, 10, 0)).toEqual([]);
    expect(ticksForRange(0, 10, NaN)).toEqual([]);
    expect(ticksForRange(0, 10, -1)).toEqual([]);
  });
});

describe("decimalsForStep", () => {
  test("reports the precision a label needs and no more", () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(0.1)).toBe(1);
    expect(decimalsForStep(0.02)).toBe(2);
  });

  test("a round step labels with no decimals, so a reader can count in halves", () => {
    expect(decimalsForStep(niceTickStep(1.25))).toBe(0);
  });
});