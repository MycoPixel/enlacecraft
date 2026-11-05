import { describe, expect, test } from "vitest";
import { BOND_LEN } from "./constants";
import {
  A4_PAGE_HEIGHT,
  A4_PAGE_WIDTH,
  DEFAULT_BOND_LENGTH,
  DEFAULT_PAGE_MARGIN,
  PAPER_PRESETS,
  computePagePlacement,
  defaultPageSetup,
  findPaperPreset,
  matchingPaperPreset,
  pageAsPlacementPreset,
  pageBoundsInWorld,
  pageOrientation,
  pageSetupFromPreset,
  pointsPerWorldUnit,
  rulerLabel,
  worldUnitsPerPoint,
  worldUnitsPerRulerUnit,
} from "./pageSetup";
import { computePublicationPlacement } from "./publicationPresets";

describe("page setup", () => {
  test("a fresh page is A4 portrait with ChemDraw defaults", () => {
    const page = defaultPageSetup();
    expect(page).toMatchObject({
      x: 0,
      y: 0,
      width: A4_PAGE_WIDTH,
      height: A4_PAGE_HEIGHT,
      bondLength: DEFAULT_BOND_LENGTH,
      marginWidth: 2,
      margin: DEFAULT_PAGE_MARGIN,
    });
    expect(pageOrientation(page)).toBe("portrait");
  });

  test("presets carry their bond length and margin and follow orientation", () => {
    const a4 = findPaperPreset("a4");
    const portrait = pageSetupFromPreset(a4, "portrait");
    const landscape = pageSetupFromPreset(a4, "landscape");
    expect(portrait.width).toBeLessThan(portrait.height);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(landscape.width).toBe(portrait.height);
    expect(landscape.height).toBe(portrait.width);
    expect(portrait.bondLength).toBe(a4.bondLengthPt);
    expect(portrait.margin).toBe(a4.marginPt);
  });

  test("matchingPaperPreset recognises the standard sizes and rejects custom ones", () => {
    expect(matchingPaperPreset(defaultPageSetup())?.id).toBe("a4");
    const letter = PAPER_PRESETS.find((preset) => preset.id === "letter")!;
    expect(matchingPaperPreset(pageSetupFromPreset(letter, "landscape"))?.id).toBe("letter");
    expect(matchingPaperPreset({ ...defaultPageSetup(), width: 400 })).toBeNull();
  });

  test("a page and its placement preset describe the same paper", () => {
    const page = { ...defaultPageSetup(), width: 500, height: 700, bondLength: 24, margin: 10 };
    expect(pageAsPlacementPreset(page)).toMatchObject({
      widthPt: 500,
      heightPt: 700,
      bondLengthPt: 24,
      marginPt: 10,
    });
  });

  test("computePagePlacement matches the preset placement maths", () => {
    const page = { ...defaultPageSetup(), width: 500, height: 700, bondLength: 24, margin: 10 };
    expect(computePagePlacement(10 * BOND_LEN, 4 * BOND_LEN, page)).toEqual(
      computePublicationPlacement(10 * BOND_LEN, 4 * BOND_LEN, pageAsPlacementPreset(page)),
    );
  });

  test("a wider margin shrinks the usable area but not the page", () => {
    const page = defaultPageSetup();
    const tight = computePagePlacement(10 * BOND_LEN, 10 * BOND_LEN, { ...page, margin: 10 });
    const wide = computePagePlacement(10 * BOND_LEN, 10 * BOND_LEN, { ...page, margin: 200 });
    expect(wide.pageWidthPt).toBe(tight.pageWidthPt);
    expect(wide.scale).toBeLessThan(tight.scale);
  });

  test("world/page conversions are inverses and follow the bond length", () => {
    const page = { ...defaultPageSetup(), bondLength: 21 };
    expect(pointsPerWorldUnit(page)).toBeCloseTo(21 / BOND_LEN);
    expect(worldUnitsPerPoint(page)).toBeCloseTo(BOND_LEN / 21);
    expect(pointsPerWorldUnit(page) * worldUnitsPerPoint(page)).toBeCloseTo(1);
  });

  test("pageBoundsInWorld scales the paper into canvas units", () => {
    const page = { ...defaultPageSetup(), bondLength: 42, width: 84, height: 168 };
    expect(pageBoundsInWorld(page)).toEqual({ x: 0, y: 0, width: 84, height: 168 });
  });

  test("ruler units follow the page's physical scale", () => {
    const page = { ...defaultPageSetup(), bondLength: 42 };
    expect(worldUnitsPerRulerUnit(page, "bond")).toBe(BOND_LEN);
    // 1 mm = 72/25.4 pt; with 42 world units per 42 pt that is the same
    // number of world units.
    expect(worldUnitsPerRulerUnit(page, "mm")).toBeCloseTo(72 / 25.4);
    expect(worldUnitsPerRulerUnit(page, "in")).toBeCloseTo(72);
  });

  test("ruler labels show the unit and trim trailing zeros", () => {
    const page = { ...defaultPageSetup(), bondLength: 42 };
    expect(rulerLabel(page, "mm", 72 / 25.4)).toBe("1 mm");
    expect(rulerLabel(page, "in", 72)).toBe("1 in");
    expect(rulerLabel(page, "bond", BOND_LEN)).toBe("1×");
    expect(rulerLabel(page, "bond", BOND_LEN / 2)).toBe("0.5×");
  });
});
