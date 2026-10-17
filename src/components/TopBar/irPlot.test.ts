import { describe, expect, test } from "vitest";
import { bandsAt, buildPlot, draggedRange, axisTicks, formatBand, WAVE_MAX, WAVE_MIN } from "./irPlot";
import { IR_BANDS, type IrBand } from "../../model/irBands";

/** A t() stand-in that returns the key, so assertions read as the lookup made. */
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${JSON.stringify(vars)})` : key;

function band(key: string): IrBand {
  const found = IR_BANDS.find((b) => b.key === key);
  if (!found) throw new Error(`no band ${key}`);
  return found;
}

describe("buildPlot", () => {
  const mode = { wavenumber: 1700, intensityKmMol: 100 };

  test("is transmittance, so it dips at a band and returns to 1 away from it", () => {
    const { transmittance } = buildPlot([mode]);
    const dip = Math.min(...transmittance);
    // Lorentzian centred on the band, so the lowest point is the band itself
    // and everything far from it is back to full transmittance.
    expect(dip).toBeLessThan(0.2);
    expect(transmittance[0]).toBeCloseTo(1, 3);
    expect(transmittance[transmittance.length - 1]).toBeCloseTo(1, 3);
  });

  test("never leaves the 0-1 range transmittance is defined on", () => {
    const { transmittance } = buildPlot([
      mode,
      { wavenumber: 1100, intensityKmMol: 100 },
      { wavenumber: 3400, intensityKmMol: 100 },
    ]);
    for (const value of transmittance) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test("scales against the strongest band, so relative heights are readable", () => {
    const weak = buildPlot([{ wavenumber: 1000, intensityKmMol: 10 }]).transmittance;
    const strong = buildPlot([{ wavenumber: 1000, intensityKmMol: 100 }]).transmittance;
    // A lone band is always the strongest one, so both normalise to the same
    // depth - this is what stops one weak band flattening everything else.
    expect(Math.min(...weak)).toBeCloseTo(Math.min(...strong), 5);
  });

  test("an empty spectrum is flat rather than NaN", () => {
    const { transmittance } = buildPlot([]);
    expect(transmittance.every((v) => v === 1)).toBe(true);
  });

  test("samples left at WAVE_MAX and right at WAVE_MIN", () => {
    // The axis is drawn descending, 4000 on the left, so a sample count has to
    // match the sample loop or the curve is drawn against the wrong axis.
    const { transmittance } = buildPlot([{ wavenumber: WAVE_MAX - 5, intensityKmMol: 50 }], 200);
    expect(transmittance[0]).toBeLessThan(transmittance[transmittance.length - 1]);
    expect(WAVE_MAX).toBeGreaterThan(WAVE_MIN);
  });
});

describe("bandsAt", () => {
  const bands = [
    { band: band("bond.cDoubleO.ketone"), count: 1 },
    { band: band("bond.cSingleO"), count: 2 },
  ];

  test("matches a wavenumber inside the range", () => {
    expect(bandsAt(bands, 1715).map((h) => h.band.key)).toEqual(["bond.cDoubleO.ketone"]);
  });

  test("keeps the group count, so a diketone can say 2x", () => {
    expect(bandsAt(bands, 1100)[0].count).toBe(2);
  });

  test("returns nothing outside every range", () => {
    expect(bandsAt(bands, 3200)).toEqual([]);
  });

  test("treats both range edges as inside", () => {
    const b = band("bond.cSingleO");
    expect(bandsAt([{ band: b, count: 1 }], b.min)).toHaveLength(1);
    expect(bandsAt([{ band: b, count: 1 }], b.max)).toHaveLength(1);
  });
});

describe("formatBand", () => {
  test("appends the motion word for a stretching band", () => {
    expect(formatBand({ band: band("bond.cSingleO"), count: 1 }, t)).toBe(
      "ir.band.bond.cSingleO ir.motion.stretch",
    );
  });

  test("leaves bend bands alone, since their label already names the motion", () => {
    // "CH3 bend" + " bend" would read as a stutter; the bend bands are the ones
    // deliberately left without a motion field.
    for (const key of ["band.ch3Bend", "band.ch2Scissor", "band.aromaticOop"]) {
      expect(formatBand({ band: band(key), count: 1 }, t)).toBe(`ir.band.${key}`);
    }
  });

  test("prefixes the count only when the group appears more than once", () => {
    expect(formatBand({ band: band("bond.cDoubleO.ketone"), count: 1 }, t)).not.toContain("timesCount");
    expect(formatBand({ band: band("bond.cDoubleO.ketone"), count: 2 }, t)).toContain("timesCount");
  });

  test("names the kind of vibration without claiming it is this bond", () => {
    // The header of irBands.ts is explicit that a per-peak per-bond assignment
    // is not something the data supports; the label must not drift into one.
    const label = formatBand({ band: band("bond.cSingleO"), count: 2 }, t);
    expect(label).toContain("ir.motion.stretch");
    expect(label).not.toMatch(/a[0-9]|atom/i);
  });
});
describe("axisTicks", () => {
  test("stays inside the window and starts above the low end", () => {
    const ticks = axisTicks([WAVE_MIN, WAVE_MAX]);
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(WAVE_MIN);
      expect(tick).toBeLessThanOrEqual(WAVE_MAX);
    }
  });

  test("uses round numbers, so a zoomed window stays readable", () => {
    // A step derived straight from the span would label ticks 1043, 2086, ...
    // which are numbers nobody recognises.
    for (const tick of axisTicks([980, 1120])) expect(Number.isInteger(tick)).toBe(true);
  });

  test("keeps a readable number of labels at any zoom", () => {
    // Both windows land on the target of ~8 labels: what matters is that a deep
    // zoom doesn't collapse to one tick or explode into fifty.
    for (const range of [[1690, 1760], [WAVE_MIN, WAVE_MAX]] as [number, number][]) {
      const ticks = axisTicks(range);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(12);
    }
  });

  test("a window narrower than one step still gets labels", () => {
    // Otherwise a deep zoom comes back with a blank axis.
    expect(axisTicks([1700, 1702]).length).toBeGreaterThan(0);
  });
});

describe("draggedRange", () => {
  // Coordinates are px from the plot's LEFT EDGE - the pointer events give
  // viewport coordinates and subtracting rect.left is the caller's job.
  const setup = { rectWidth: 1000, current: [WAVE_MIN, WAVE_MAX] as [number, number] };

  test("a drag too short to mean anything is a click, not a zoom", () => {
    // Someone aiming at a peak on a touchscreen moves a few px before lifting;
    // treating that as a window would collapse the spectrum to a sliver.
    expect(draggedRange(100, 104, setup.rectWidth, setup.current)).toBeNull();
    expect(draggedRange(100, 100, setup.rectWidth, setup.current)).toBeNull();
  });

  test("selects a window, always ordered low-to-high", () => {
    const left = draggedRange(100, 600, setup.rectWidth, setup.current)!;
    const right = draggedRange(600, 100, setup.rectWidth, setup.current)!;
    expect(left[0]).toBeLessThan(left[1]);
    // Dragging either direction must give the same window, or the axis flips.
    expect(right).toEqual(left);
  });

  test("reads the axis backwards: the left of the plot is the high wavenumber", () => {
    // The IR convention is descending, so x=0 is WAVE_MAX. Getting this
    // backwards would zoom to the mirror image of the region dragged.
    const nearLeft = draggedRange(0, 250, setup.rectWidth, setup.current)!;
    expect(nearLeft[1]).toBeGreaterThan(3000);
  });

  test("depends only on the offset within the plot, not where the plot sits", () => {
    // The contract this pins: coordinates are measured from the plot's left
    // edge, so the caller's rect.left subtraction has already happened. It was
    // once taken as a viewport position, which put the zoom on a different part
    // of the spectrum than the one dragged whenever the plot was inset - which
    // it always is, inside a dialog.
    const withinPlot = draggedRange(100, 600, setup.rectWidth, setup.current)!;
    expect(withinPlot[0]).toBeLessThan(withinPlot[1]);
    // 100..600 of a 1000px plot is the left quarter, i.e. the top quarter of a
    // descending 400-4000 axis.
    expect(withinPlot[1]).toBeCloseTo(WAVE_MAX - 360, 5);
  });

  test("refuses a zero-width view rather than dividing by it", () => {
    expect(draggedRange(10, 400, 0, setup.current)).toBeNull();
  });

  test("refuses a window narrower than a wavenumber, which has no readable axis", () => {
    // 9px of travel across a 40,000px-wide plot is well under one cm⁻¹ of the
    // 3600 range, so accepting it would produce an axis with nothing on it.
    expect(draggedRange(0, 9, 40_000, setup.current)).toBeNull();
  });
});

describe("buildPlot over a zoomed range", () => {
  test("a peak inside the window still dips, one outside it does not", () => {
    const modes = [
      { wavenumber: 1000, intensityKmMol: 100 },
      { wavenumber: 3000, intensityKmMol: 100 },
    ];
    const inside = buildPlot(modes, 200, [800, 1200]).transmittance;
    // 1500-1600 sits between the two bands, so there is genuinely nothing to
    // show here - which is what makes it the "outside" control.
    const empty = buildPlot(modes, 200, [1500, 1600]).transmittance;
    // Zooming to the window that CONTAINS the peak has to actually reveal it,
    // otherwise the zoom is showing an empty strip and reading as broken.
    expect(Math.min(...inside)).toBeLessThan(0.5);
    expect(Math.min(...empty)).toBeGreaterThan(0.9);
  });
});
