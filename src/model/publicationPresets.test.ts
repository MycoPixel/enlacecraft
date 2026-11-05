import { describe, expect, test } from "vitest";
import { BOND_LEN } from "./constants";
import {
  DEFAULT_PUBLICATION_PRESET_ID,
  PUBLICATION_PRESETS,
  computePublicationPlacement,
  findPublicationPreset,
  type PublicationPreset,
} from "./publicationPresets";

const preset = (overrides: Partial<PublicationPreset> = {}): PublicationPreset => ({
  id: "test",
  labelKey: "test",
  widthPt: 600,
  heightPt: 800,
  bondLengthPt: 21,
  marginPt: 50,
  ...overrides,
});

describe("publication presets", () => {
  test("every preset has a unique id and a default that exists", () => {
    const ids = PUBLICATION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_PUBLICATION_PRESET_ID);
    expect(findPublicationPreset(DEFAULT_PUBLICATION_PRESET_ID)).toBe(
      PUBLICATION_PRESETS.find((p) => p.id === DEFAULT_PUBLICATION_PRESET_ID)
    );
  });

  test("unknown ids fall back to the first preset", () => {
    expect(findPublicationPreset("missing")).toBe(PUBLICATION_PRESETS[0]);
  });

  test("uses the preset's bond length when the drawing fits", () => {
    const p = preset();
    const placement = computePublicationPlacement(10 * BOND_LEN, 4 * BOND_LEN, p);

    // 21 pt target / 42 units per bond = 0.5 pt per unit.
    expect(placement.scale).toBeCloseTo(0.5, 10);
    expect(placement.widthPt).toBeCloseTo(5 * BOND_LEN, 10);
    expect(placement.heightPt).toBeCloseTo(2 * BOND_LEN, 10);
    // 600 - 100 margin = 500 available; 420 wide fits.
    expect(placement.xPt).toBeCloseTo((600 - 210) / 2, 10);
    expect(placement.yPt).toBeCloseTo((800 - 84) / 2, 10);
  });

  test("shrinks proportionally only when the scaled drawing would overflow", () => {
    const p = preset({ widthPt: 300, marginPt: 50 }); // 200 pt printable
    const placement = computePublicationPlacement(1000, 100, p);

    expect(placement.widthPt).toBeCloseTo(200, 10);
    expect(placement.heightPt).toBeCloseTo(20, 10);
    expect(placement.scale).toBeCloseTo(0.2, 10);
    expect(placement.scale).toBeLessThan(p.bondLengthPt / BOND_LEN);
    expect(placement.xPt).toBeCloseTo(50, 10);
    expect(placement.yPt).toBeCloseTo((800 - 20) / 2, 10);
  });

  test("height can be the limiting dimension", () => {
    const p = preset({ widthPt: 1000, heightPt: 200, marginPt: 40 }); // 120 pt tall
    const placement = computePublicationPlacement(100, 1000, p);

    expect(placement.heightPt).toBeCloseTo(120, 10);
    expect(placement.widthPt).toBeCloseTo(12, 10);
    // Desired scale would make it 500 pt tall, so fitting wins.
    expect(placement.scale).toBeCloseTo(0.12, 10);
  });

  test("a margin larger than the page leaves a tiny but positive printable area", () => {
    const placement = computePublicationPlacement(100, 100, preset({ widthPt: 50, heightPt: 50, marginPt: 100 }));
    expect(placement.widthPt).toBeGreaterThan(0);
    expect(placement.heightPt).toBeGreaterThan(0);
    expect(placement.widthPt).toBeLessThanOrEqual(1);
  });

  test("zero or invalid content dimensions do not produce NaN coordinates", () => {
    for (const [w, h] of [[0, 0], [Number.NaN, 10], [-5, Number.POSITIVE_INFINITY]]) {
      const placement = computePublicationPlacement(w, h, preset());
      expect(Number.isFinite(placement.widthPt)).toBe(true);
      expect(Number.isFinite(placement.heightPt)).toBe(true);
      expect(Number.isFinite(placement.xPt)).toBe(true);
      expect(Number.isFinite(placement.yPt)).toBe(true);
      expect(placement.widthPt).toBeGreaterThan(0);
      expect(placement.heightPt).toBeGreaterThan(0);
    }
  });
});
