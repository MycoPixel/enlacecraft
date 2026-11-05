// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { IrSpectrumPlot } from "./IrSpectrumPlot";
import { IR_BANDS } from "../../model/irBands";

/**
 * Zooming by dragging across the spectrum.
 *
 * The plot is never flush to the viewport's left edge - it sits inside a padded
 * dialog - so the pointer coordinates it receives have to be brought into the
 * plot's own space before they mean anything. It went wrong once exactly there:
 * the selection rectangle was drawn in plot-relative space and the zoom was
 * committed in viewport space, so the app zoomed somewhere other than where the
 * user dragged. These tests hold the plot deliberately far from the left edge,
 * because a test with `left: 0` cannot see that class of bug at all.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** Where the plot's left edge sits in the viewport. Deliberately not 0. */
const RECT_LEFT = 340;
const RECT_WIDTH = 1000;
const VIEW_WIDTH = 1000;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const bands = IR_BANDS.map((band) => ({ band, count: 1 }));
const modes = [
  { wavenumber: 1000, intensityKmMol: 100 },
  { wavenumber: 1700, intensityKmMol: 60 },
  { wavenumber: 3000, intensityKmMol: 90 },
];

function render() {
  act(() =>
    root.render(
      <IrSpectrumPlot modes={modes} bands={bands} width={VIEW_WIDTH} height={300} detailed zoomable />,
    ),
  );
  const svg = container.querySelector(".ir-plot") as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ left: RECT_LEFT, width: RECT_WIDTH, height: 300 }) as DOMRect;
  return svg;
}

function pointer(svg: SVGSVGElement, type: string, clientX: number) {
  act(() => {
    svg.dispatchEvent(new PointerEvent(type, { clientX, clientY: 50, bubbles: true, button: 0 }));
  });
}

/** Drag a viewport x range across the plot. */
function drag(fromClientX: number, toClientX: number) {
  const svg = render();
  pointer(svg, "pointerdown", fromClientX);
  pointer(svg, "pointermove", toClientX);
  pointer(svg, "pointerup", toClientX);
}

/** The x-axis tick labels currently drawn, high to low (descending axis). */
function tickLabels(): number[] {
  return [...container.querySelectorAll(".ir-plot__tick--x")]
    .map((n) => Number(n.textContent))
    .filter((n) => Number.isFinite(n));
}

describe("IR spectrum zoom", () => {
  test("zooms to the region dragged, even though the plot is inset in the dialog", () => {
    render();
    // Drag the left quarter of the plot. That is x 0..250 within the plot, which
    // on a descending 400-4000 axis is the 3600..3100 region. If the viewport
    // offset leaked in, this would land somewhere else entirely.
    drag(RECT_LEFT, RECT_LEFT + 250);
    const ticks = tickLabels();
    // Every tick must sit inside the top quarter of the original range.
    for (const tick of ticks) expect(tick).toBeGreaterThan(3000);
  });

  test("the selection rectangle and the committed window agree", () => {
    // The bug in one assertion: the rect drawn while dragging and the window
    // committed on release were computed in two different coordinate spaces.
    const svg = render();
    pointer(svg, "pointerdown", RECT_LEFT + 100);
    pointer(svg, "pointermove", RECT_LEFT + 600);
    const sel = container.querySelector(".ir-plot__selection") as SVGRectElement;
    // In viewBox units (viewBox is 1:1 with the mocked rect here), the drawn
    // selection starts 100 units in.
    expect(Number(sel.getAttribute("x"))).toBeCloseTo(100, 0);
    pointer(svg, "pointerup", RECT_LEFT + 600);
    // 100..600 of 1000 across a descending 3600 range: 4000-360 = 3640 at the
    // left edge down to 4000-2160 = 1840 at the right.
    for (const tick of tickLabels()) {
      expect(tick).toBeGreaterThanOrEqual(1840);
      expect(tick).toBeLessThanOrEqual(3640);
    }
  });

  test("offers no reset until something is zoomed", () => {
    render();
    expect(container.querySelector(".ir-plot__reset")).toBeNull();
    drag(RECT_LEFT, RECT_LEFT + 300);
    expect(container.querySelector(".ir-plot__reset")).not.toBeNull();
  });

  test("reset restores the whole range", () => {
    render();
    drag(RECT_LEFT, RECT_LEFT + 300);
    act(() => (container.querySelector(".ir-plot__reset") as HTMLButtonElement).click());
    const ticks = tickLabels();
    // Back to spanning the full axis.
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(4000);
    expect(Math.min(...ticks)).toBeLessThanOrEqual(500);
  });

  test("a click does not zoom", () => {
    render();
    drag(RECT_LEFT + 400, RECT_LEFT + 403);
    expect(container.querySelector(".ir-plot__reset")).toBeNull();
  });

  test("zooming in twice narrows further rather than resetting", () => {
    render();
    drag(RECT_LEFT + 200, RECT_LEFT + 600);
    const first = Math.max(...tickLabels()) - Math.min(...tickLabels());
    drag(RECT_LEFT + 300, RECT_LEFT + 500);
    const second = Math.max(...tickLabels()) - Math.min(...tickLabels());
    expect(second).toBeLessThan(first);
  });

  test("the zoomed spectrum still shows the peaks inside the window", () => {
    render();
    // Window around the 1700 band.
    drag(RECT_LEFT, RECT_LEFT + 500);
    const path = container.querySelector(".ir-plot__line")!.getAttribute("d")!;
    // A flat line would mean the zoom landed on empty spectrum and reads as
    // broken; the curve must actually vary.
    const ys = [...path.matchAll(/[,]([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
  });
});
describe("IR spectrum axis labels", () => {
  test("names both axes in the full view", () => {
    render();
    const titles = [...container.querySelectorAll(".ir-plot__axisTitle")].map((n) => n.textContent);
    // A bare number is ambiguous: the reader should not have to know out of
    // band that the horizontal one is cm⁻¹ and the vertical one a percentage.
    expect(titles).toContain("Wavenumber (cm⁻¹)");
    expect(titles).toContain("Transmittance (%)");
  });

  test("labels transmittance as a percentage, from 0 to 100", () => {
    render();
    const y = [...container.querySelectorAll(".ir-plot__tick--y")].map((n) => n.textContent);
    expect(y).toEqual(["0", "25", "50", "75", "100"]);
  });

  test("labels the compact panel plot with neither, having no room", () => {
    act(() => root.render(<IrSpectrumPlot modes={modes} bands={bands} />));
    expect(container.querySelectorAll(".ir-plot__axisTitle")).toHaveLength(0);
    expect(container.querySelectorAll(".ir-plot__tick--y")).toHaveLength(0);
  });

  test("the curve sits inside the axis gutters, not under them", () => {
    render();
    const path = container.querySelector(".ir-plot__line")!.getAttribute("d")!;
    const xs = [...path.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    // Detailed view reserves a left gutter for the transmittance scale; the
    // curve starting at x=0 would run underneath those numbers.
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(VIEW_WIDTH);
  });

  test("the diagnostic lanes do not run under the transmittance labels", () => {
    render();
    for (const lane of container.querySelectorAll(".ir-plot__band")) {
      expect(Number(lane.getAttribute("x"))).toBeGreaterThan(0);
    }
  });
});
