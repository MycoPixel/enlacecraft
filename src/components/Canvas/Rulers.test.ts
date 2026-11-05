// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { formatRulerValue, rulerStep, rulerTicks } from "./Rulers";

describe("rulerStep", () => {
  test("picks the smallest nice step that keeps labels apart", () => {
    // 10 px per unit: 5 units = 50 px, just over the 48 px floor.
    expect(rulerStep(10)).toBe(5);
    expect(rulerStep(100)).toBe(1);
    // 1 px per unit: 50 units = 50 px.
    expect(rulerStep(1)).toBe(50);
    // Very zoomed out: fall back to the largest candidate.
    expect(rulerStep(0.0001)).toBe(10_000);
  });
});

describe("rulerTicks", () => {
  test("places minor ticks every fifth of a labelled step", () => {
    const ticks = rulerTicks(0, 20, 1, 0, 1, 10);
    expect(ticks.map((tick) => tick.position)).toEqual([...Array(21).keys()]);
    const major = ticks.filter((tick) => tick.major);
    expect(major.map((tick) => tick.label)).toEqual(["0", "5", "10", "15", "20"]);
    expect(ticks.filter((tick) => !tick.major).every((tick) => tick.label === undefined)).toBe(true);
  });

  test("accounts for pan and zoom", () => {
    const ticks = rulerTicks(0, 20, 2, 100, 1, 10);
    expect(ticks[0].position).toBe(100);
    expect(ticks[1].position).toBe(102);
    // Zooming doubles the pixel distance between the same world ticks.
    const zoomed = rulerTicks(0, 20, 4, 100, 1, 20);
    expect(zoomed[1].position - zoomed[0].position).toBe(4);
  });

  test("subdivides physical units using the supplied conversion", () => {
    // 10 world units per mm, 2 px per world unit -> 20 px per mm, so the
    // labelled step is 5 mm and ticks subdivide it into 1 mm.
    const ticks = rulerTicks(0, 100, 2, 0, 10, 20);
    expect(ticks[0]).toMatchObject({ position: 0, major: true, label: "0" });
    expect(ticks[1]).toMatchObject({ position: 20, major: false });
    expect(ticks[5]).toMatchObject({ position: 100, major: true, label: "5" });
  });

  test("an inverted or empty span produces no ticks", () => {
    expect(rulerTicks(0, 0, 1, 0, 1, 10)).toHaveLength(1);
    expect(rulerTicks(Number.NaN, 10, 1, 0, 1, 10)).toEqual([]);
  });
});

describe("formatRulerValue", () => {
  test("trims whole numbers and keeps one decimal", () => {
    expect(formatRulerValue(3)).toBe("3");
    expect(formatRulerValue(3.04)).toBe("3");
    expect(formatRulerValue(3.16)).toBe("3.2");
  });
});
