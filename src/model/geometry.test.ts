import { describe, expect, test } from "vitest";
import { GRID_STEP } from "./constants";
import { snapPoint } from "./geometry";

describe("snapPoint", () => {
  test("rounds both axes to the nearest grid intersection", () => {
    expect(snapPoint({ x: 50, y: 5 })).toEqual({ x: GRID_STEP * 2, y: 0 });
    expect(snapPoint({ x: 49, y: 61 })).toEqual({ x: GRID_STEP * 2, y: GRID_STEP * 3 });
  });

  test("rounds negative coordinates toward the nearest intersection too", () => {
    expect(snapPoint({ x: -13, y: -37 })).toEqual({ x: -GRID_STEP, y: -GRID_STEP * 2 });
    expect(snapPoint({ x: -25, y: -12 })).toEqual({ x: -GRID_STEP, y: 0 });
  });

  test("a non-positive step means no snapping", () => {
    const p = { x: 13, y: -7 };
    expect(snapPoint(p, 0)).toBe(p);
    expect(snapPoint(p, -5)).toBe(p);
  });

  test("accepts an explicit step", () => {
    expect(snapPoint({ x: 11, y: 19 }, 10)).toEqual({ x: 10, y: 20 });
  });
});
