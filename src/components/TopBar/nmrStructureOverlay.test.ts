import { describe, expect, test } from "vitest";
import { clampStructureOffset } from "./NmrSpectrumView";

/**
 * Repositioning the structure overlay on the spectrum.
 *
 * The panel is draggable because which corner it belongs in depends on the
 * spectrum being read - a window whose signals cluster at one end leaves the
 * other free. Being draggable means it can also be dragged somewhere useless
 * (off the plot, off the screen), and every one of those outcomes reads as "the
 * diagram disappeared", so the clamping below is the part that actually has to
 * hold.
 */

/** A plot area with a 340x260 panel resting in its top-right corner. */
const LAYOUT = {
  containerWidth: 760,
  containerHeight: 400,
  panelWidth: 356,
  panelHeight: 300,
};

describe("clampStructureOffset", () => {
  test("leaves the default top-right position alone", () => {
    expect(clampStructureOffset({ x: 0, y: 0 }, LAYOUT)).toEqual({ x: 0, y: 0 });
  });

  test("allows moving to the middle and to the left", () => {
    // The two positions asked for: enough travel to reach the centre, and all
    // the way over to the left edge.
    const middle = clampStructureOffset({ x: -200, y: 0 }, LAYOUT);
    expect(middle.x).toBe(-200);

    const left = clampStructureOffset({ x: -500, y: 0 }, LAYOUT);
    // baseLeft = 760 - 8 - 356 = 396, so -396 puts the panel flush left.
    expect(left.x).toBe(-396);
  });

  test("stops the panel being dragged past the right edge", () => {
    expect(clampStructureOffset({ x: 400, y: 0 }, LAYOUT).x).toBe(8);
  });

  test("stops the panel being dragged above the plot", () => {
    expect(clampStructureOffset({ x: 0, y: -300 }, LAYOUT).y).toBe(-8);
  });

  test("stops the panel being dragged below the plot", () => {
    // maxY = 400 - 8 - 300 = 92.
    expect(clampStructureOffset({ x: 0, y: 500 }, LAYOUT).y).toBe(92);
  });

  test("never lets the panel escape the plot in either axis", () => {
    // Fuzzed rather than enumerated: the invariant is what matters, and it has
    // to hold for offsets in any order, not just the ones someone thought of.
    for (let i = -600; i <= 600; i += 37) {
      for (let j = -600; j <= 600; j += 41) {
        const { x, y } = clampStructureOffset({ x: i, y: j }, LAYOUT);
        const left = LAYOUT.containerWidth - 8 - LAYOUT.panelWidth + x;
        const top = 8 + y;
        expect(left).toBeGreaterThanOrEqual(-0.001);
        expect(left + LAYOUT.panelWidth).toBeLessThanOrEqual(LAYOUT.containerWidth + 0.001);
        expect(top).toBeGreaterThanOrEqual(-0.001);
        expect(top + LAYOUT.panelHeight).toBeLessThanOrEqual(LAYOUT.containerHeight + 0.001);
      }
    }
  });

  test("a panel bigger than the plot collapses to the top-left rather than inverting", () => {
    // maxY goes negative here, so the vertical range inverts. The result has to
    // still be a real position rather than a nonsense one.
    const oversized = { ...LAYOUT, panelWidth: 900, panelHeight: 700 };
    const { x, y } = clampStructureOffset({ x: 500, y: 500 }, oversized);
    expect(x).toBe(8);
    expect(y).toBe(-8);
  });

  test("honours a caller-supplied inset", () => {
    const noInset = { ...LAYOUT, inset: 0 };
    // x is pinned to the right edge, and y may travel the full height because
    // there is no gap left above or below to stop it.
    expect(clampStructureOffset({ x: 0, y: 0 }, noInset)).toEqual({ x: 0, y: 0 });
    expect(clampStructureOffset({ x: 50, y: 50 }, noInset)).toEqual({ x: 0, y: 50 });
    expect(clampStructureOffset({ x: 0, y: 400 }, noInset).y).toBe(100);
  });

  test("is idempotent, so a settled position stays settled", () => {
    // The re-clamp effect runs on every resize; if clamping moved the panel,
    // each pass would nudge it further and it would creep across the plot.
    const once = clampStructureOffset({ x: -9999, y: -9999 }, LAYOUT);
    expect(clampStructureOffset(once, LAYOUT)).toEqual(once);
  });
});
