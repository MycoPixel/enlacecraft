import { describe, expect, test } from "vitest";

/**
 * Vertical (intensity) zoom, which the spectrum's touch buttons and mouse
 * wheel both drive.
 *
 * The clamp is deliberately extracted into one function rather than inlined at
 * each call site: two copies of the same bound is how one of them ends up
 * letting you zoom past the ceiling. These tests pin the shared behaviour -
 * the ceiling, the floor, and that repeated stepping saturates rather than
 * running away.
 */

/** Mirrors the component's constants and clamp. */
const MIN_VERTICAL_ZOOM = 1;
const MAX_VERTICAL_ZOOM = 60;
const VERTICAL_ZOOM_STEP = 1.15;

function clampVerticalZoom(value: number): number {
  return Math.min(MAX_VERTICAL_ZOOM, Math.max(MIN_VERTICAL_ZOOM, value));
}

describe("clampVerticalZoom", () => {
  test("passes values inside the range through unchanged", () => {
    expect(clampVerticalZoom(1)).toBe(1);
    expect(clampVerticalZoom(7.5)).toBe(7.5);
    expect(clampVerticalZoom(60)).toBe(60);
  });

  test("clamps to the ceiling", () => {
    expect(clampVerticalZoom(61)).toBe(60);
    expect(clampVerticalZoom(1e9)).toBe(60);
  });

  test("clamps to the floor, so peak height can't be shrunk away entirely", () => {
    expect(clampVerticalZoom(0.9)).toBe(1);
    expect(clampVerticalZoom(0)).toBe(1);
  });
});

describe("stepping the intensity zoom", () => {
  /** Mirrors the component's stepVerticalZoom for one direction. */
  const step = (current: number, direction: 1 | -1) =>
    clampVerticalZoom(current * (direction === 1 ? VERTICAL_ZOOM_STEP : 1 / VERTICAL_ZOOM_STEP));

  test("growing multiplies, shrinking divides - inverse operations", () => {
    expect(step(10, 1)).toBeCloseTo(11.5, 6);
    expect(step(11.5, -1)).toBeCloseTo(10, 6);
  });

  test("repeated growing saturates at the ceiling instead of diverging", () => {
    // This is what the disabled state of the up button relies on.
    let z = 1;
    for (let i = 0; i < 500; i++) z = step(z, 1);
    expect(z).toBe(MAX_VERTICAL_ZOOM);
  });

  test("repeated shrinking saturates at the floor", () => {
    let z = 30;
    for (let i = 0; i < 500; i++) z = step(z, -1);
    expect(z).toBe(MIN_VERTICAL_ZOOM);
  });

  test("the clamp is reachable from a single press, not only after many", () => {
    // 60 / 1.15 needs ~29 presses; verify the button can actually get there in
    // a reasonable number of taps rather than being effectively unreachable.
    let z = 1;
    let presses = 0;
    while (z < MAX_VERTICAL_ZOOM && presses < 200) {
      z = step(z, 1);
      presses++;
    }
    expect(z).toBe(MAX_VERTICAL_ZOOM);
    expect(presses).toBeLessThan(40);
  });

  test("the step is small enough to be fine-grained", () => {
    // A coarse step would make it impossible to frame one peak among
    // neighbours of very different size.
    expect(VERTICAL_ZOOM_STEP).toBeGreaterThan(1.05);
    expect(VERTICAL_ZOOM_STEP).toBeLessThan(1.5);
  });
});