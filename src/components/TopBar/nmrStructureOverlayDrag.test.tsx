// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { emptyMolecule, addAtom, addBond } from "../../model/molecule";
import { BOND_LEN } from "../../model/constants";
import { NmrSpectrumView } from "./NmrSpectrumView";
import type { ShiftPrediction, H1ShiftPrediction } from "../../io/nmrPredict";

/**
 * Dragging the structure overlay, driven through the real handlers.
 *
 * The clamping arithmetic is unit-tested separately (nmrStructureOverlay.test.ts)
 * because it is pure. What can only be checked here is the wiring: that a press
 * and move actually move the panel, that the diagram's own hover link survives
 * being dragged across, and - the one that would be easy to get wrong - that
 * the H toggle inside the panel still works rather than being swallowed as the
 * start of a drag.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const PREDICTIONS: ShiftPrediction[] = [
  { atomIndex: 0, predictedShiftPpm: 20.1, equivalenceGroup: 0 },
];
const PREDICTIONS_H1: H1ShiftPrediction[] = [
  {
    atomIndex: 0,
    predictedShiftPpm: 1.2,
    numHs: 3,
    equivalenceGroup: 0,
    multiplicity: "t",
    multiplicityDetail: "",
    couplingHz: [],
  },
];

function seedMolecule() {
  let mol = addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 42, y: 0 }, "C");
  mol = addBond(mol, "b1", "a1", "a2", 1, "none");
  useMoleculeStore.setState({ molecule: mol, selected: new Set(), language: "en" });
}

/** Renders with the structure overlay switched on. */
function renderOverlay() {
  act(() => {
    root.render(
      <NmrSpectrumView
        predictions={PREDICTIONS}
        predictionsH1={PREDICTIONS_H1}
        atomOrder={["a1", "a2"]}
        atomLabels={new Map([["a1", "C1"], ["a2", "C2"]])}
        fragment={useMoleculeStore.getState().molecule}
      />,
    );
  });
  const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.trim() === "Structure",
  ) as HTMLButtonElement | undefined;
  expect(toggle, "the Structure toggle should be present").toBeTruthy();
  act(() => {
    toggle!.click();
  });
}

function panel() {
  return container.querySelector(".nmr-spectrum-view__structure") as HTMLElement;
}

/** Current translate() offset of the panel, in pixels. */
function offset(): { x: number; y: number } {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(panel().style.transform);
  expect(m, `expected a translate() transform, got "${panel().style.transform}"`).toBeTruthy();
  return { x: Number(m![1]), y: Number(m![2]) };
}

/**
 * Gives the panel and its container a real size.
 *
 * jsdom performs no layout, so every rect is 0x0 - which would make the clamp
 * collapse to the origin and quietly turn these assertions into no-ops. Stubbing
 * the two rects is what makes the drag test mean anything.
 */
function stubLayout(containerW = 760, containerH = 400, panelW = 300, panelH = 260) {
  const area = container.querySelector(".nmr-spectrum-view__plot-area") as HTMLElement;
  area.getBoundingClientRect = () =>
    ({ width: containerW, height: containerH, top: 0, left: 0, right: containerW, bottom: containerH }) as DOMRect;
  panel().getBoundingClientRect = () =>
    ({ width: panelW, height: panelH, top: 0, left: 0, right: panelW, bottom: panelH }) as DOMRect;
}

function drag(from: { x: number; y: number }, to: { x: number; y: number }, target?: Element) {
  const el = (target ?? panel()) as HTMLElement;
  const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0 } as const;
  act(() => {
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: from.x, clientY: from.y }));
    el.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: to.x, clientY: to.y }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: to.x, clientY: to.y }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  seedMolecule();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("structure overlay drag", () => {
  test("is not shown until the Structure toggle is used", () => {
    act(() => {
      root.render(
        <NmrSpectrumView
          predictions={PREDICTIONS}
          predictionsH1={PREDICTIONS_H1}
          atomOrder={["a1", "a2"]}
          atomLabels={new Map([["a1", "C1"], ["a2", "C2"]])}
          fragment={useMoleculeStore.getState().molecule}
        />,
      );
    });
    expect(panel()).toBeNull();
  });

  test("starts in the top-right corner", () => {
    renderOverlay();
    expect(panel()).toBeTruthy();
    expect(offset()).toEqual({ x: 0, y: 0 });
  });

  test("a drag moves the panel", () => {
    renderOverlay();
    stubLayout();
    drag({ x: 700, y: 20 }, { x: 620, y: 90 });
    expect(offset()).toEqual({ x: -80, y: 70 });
  });

  test("a drag to the left edge is allowed, and no further", () => {
    renderOverlay();
    stubLayout();
    drag({ x: 700, y: 20 }, { x: 0, y: 20 });
    // baseLeft = 760 - 8 - 300 = 452, so it lands flush against the left edge.
    expect(offset().x).toBe(-452);
    expect(offset().x).toBeGreaterThanOrEqual(-452);
  });

  test("cannot be dragged off the right edge", () => {
    renderOverlay();
    stubLayout();
    drag({ x: 400, y: 20 }, { x: 900, y: 20 });
    expect(offset().x).toBe(8);
  });

  test("cannot be dragged below the plot", () => {
    renderOverlay();
    stubLayout();
    drag({ x: 400, y: 20 }, { x: 400, y: 900 });
    expect(offset().y).toBe(132);
  });

  test("a second drag continues from where the panel already is", () => {
    renderOverlay();
    stubLayout();
    drag({ x: 700, y: 20 }, { x: 600, y: 20 });
    expect(offset().x).toBe(-100);
    drag({ x: 600, y: 20 }, { x: 560, y: 20 });
    // Accumulated, not restarted from the corner: -100 then a further -40.
    expect(offset().x).toBe(-140);
  });

  test("the H toggle still works - a press on it is not eaten as a drag", () => {
    renderOverlay();
    stubLayout();
    const hToggle = Array.from(panel().querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "H",
    ) as HTMLButtonElement | undefined;
    expect(hToggle, "the H toggle should be inside the panel").toBeTruthy();

    const before = hToggle!.getAttribute("aria-pressed");
    // Press and release ON the button: this is a click, not a drag.
    drag({ x: 0, y: 0 }, { x: 0, y: 0 }, hToggle!);
    act(() => {
      hToggle!.click();
    });
    expect(hToggle!.getAttribute("aria-pressed")).not.toBe(before);
    // And the panel must not have budged.
    expect(offset()).toEqual({ x: 0, y: 0 });
  });

  test("a position survives the layout being unavailable", () => {
    // Showing hydrogens resizes the panel, which re-runs the clamp. If the
    // rects read as zero-area at that moment - first render, or a hidden
    // report - the clamp must decline to act rather than compute a negative
    // travel range and snap the panel into a corner nobody chose.
    renderOverlay();
    stubLayout();
    drag({ x: 700, y: 20 }, { x: 500, y: 20 });
    const chosen = offset();
    expect(chosen.x).toBe(-200);

    // Layout goes away (zero-area rects, as before the first paint).
    const area = container.querySelector(".nmr-spectrum-view__plot-area") as HTMLElement;
    area.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
    const hToggle = Array.from(panel().querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "H",
    ) as HTMLButtonElement;
    act(() => {
      hToggle.click();
    });
    expect(offset()).toEqual(chosen);
  });

  test("arrow keys nudge the panel, so it is not mouse-only", () => {
    renderOverlay();
    stubLayout();
    const p = panel();
    expect(p.tabIndex).toBe(0);
    expect(p.getAttribute("aria-label")).toBeTruthy();

    act(() => {
      p.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });
    expect(offset().x).toBe(-16);

    act(() => {
      p.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(offset().y).toBe(16);
  });

  test("Shift makes the keyboard nudge a coarse jump", () => {
    renderOverlay();
    stubLayout();
    act(() => {
      panel().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(offset().x).toBe(-40);
  });

  test("Home returns the panel to its corner", () => {
    renderOverlay();
    stubLayout();
    drag({ x: 700, y: 20 }, { x: 300, y: 200 });
    expect(offset()).not.toEqual({ x: 0, y: 0 });
    act(() => {
      panel().dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    });
    expect(offset()).toEqual({ x: 0, y: 0 });
  });

  test("Escape is left alone, so it can still close the report", () => {
    renderOverlay();
    stubLayout();
    const onKeyDown = vi.fn();
    document.addEventListener("keydown", onKeyDown);
    act(() => {
      panel().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    document.removeEventListener("keydown", onKeyDown);
    expect(onKeyDown).toHaveBeenCalled();
  });

  test("a right-click does not start a drag", () => {
    renderOverlay();
    stubLayout();
    const p = panel();
    act(() => {
      p.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: 2,
          pointerType: "mouse",
          button: 2,
          clientX: 700,
          clientY: 20,
        }),
      );
      p.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          pointerId: 2,
          pointerType: "mouse",
          clientX: 300,
          clientY: 200,
        }),
      );
    });
    expect(offset()).toEqual({ x: 0, y: 0 });
  });

  test("a cancelled drag settles instead of sticking to the cursor", () => {
    renderOverlay();
    stubLayout();
    const p = panel();
    act(() => {
      p.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: 3,
          pointerType: "mouse",
          button: 0,
          clientX: 700,
          clientY: 20,
        }),
      );
      p.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          cancelable: true,
          pointerId: 3,
          pointerType: "mouse",
          clientX: 700,
          clientY: 20,
        }),
      );
    });
    // Latched drags are the classic way an overlay ends up glued to the cursor
    // after an OS gesture steals the pointer.
    act(() => {
      p.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          pointerId: 3,
          pointerType: "mouse",
          clientX: 200,
          clientY: 200,
        }),
      );
    });
    expect(offset()).toEqual({ x: 0, y: 0 });
  });
});

describe("plot gestures are unaffected by the draggable panel", () => {
  test("dragging on the plot still zooms the ppm range", () => {
    // The panel is a sibling of the plot, not a child of the SVG, so a press on
    // the plot must not be mistaken for the start of a panel drag - otherwise
    // the diagram's drag would quietly disable the spectrum's own zoom.
    renderOverlay();
    stubLayout();
    const svg = container.querySelector(".nmr-spectrum-plot__svg") as SVGSVGElement;
    expect(svg).toBeTruthy();

    // jsdom implements neither getScreenCTM nor createSVGPoint, so without
    // these the client->ppm conversion bails out and no zoom can happen. That
    // is why this test used to pass while asserting nothing about zoom, and
    // why every run ended in an unhandled TypeError. The stub passes viewBox
    // coordinates straight through.
    svg.getScreenCTM = () => ({ inverse: () => ({}) }) as unknown as DOMMatrix;
    svg.createSVGPoint = () => {
      const point = { x: 0, y: 0 };
      return {
        get x() {
          return point.x;
        },
        set x(v: number) {
          point.x = v;
        },
        get y() {
          return point.y;
        },
        set y(v: number) {
          point.y = v;
        },
        matrixTransform: () => ({ x: point.x, y: point.y }),
      } as unknown as DOMPoint;
    };

    const [fromInput, toInput] = [...container.querySelectorAll(".nmr-spectrum-plot__control-input")] as HTMLInputElement[];
    const before = { from: fromInput.value, to: toInput.value };
    expect(before.from).not.toBe("");

    const opts = { bubbles: true, cancelable: true, pointerId: 9, pointerType: "mouse", button: 0 } as const;
    // One act() per event: the drag position lives in React state, so batching
    // down/move/up together would let endDrag read a stale (still-null) value
    // and discard the zoom.
    act(() => {
      svg.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: 300, clientY: 100 }));
    });
    act(() => {
      svg.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: 340, clientY: 100 }));
    });
    act(() => {
      svg.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: 340, clientY: 100 }));
    });

    // The zoom actually happened: the ppm window narrowed to the dragged
    // range, and the draggable panel was never involved.
    expect(Number(toInput.value) - Number(fromInput.value)).toBeGreaterThan(0);
    expect(Number(fromInput.value)).toBeGreaterThan(Number(before.from));
    expect(Number(toInput.value)).toBeLessThan(Number(before.to));
    expect(offset()).toEqual({ x: 0, y: 0 });
  });
});

/**
 * Resizing the overlay.
 *
 * The overlay's size IS the diagram's zoom - the drawing is fitted to whatever
 * box the panel allows, so there is no separate magnification. That makes the
 * grip load-bearing for large structures, which are width-bound and whose atom
 * labels otherwise shrink to a couple of pixels.
 *
 * The fixtures below are deliberately oversized. A small molecule is already at
 * the scale ceiling (MAX_DIAGRAM_SCALE), so for it a bigger box changes nothing
 * at all - correctly, but uselessly for testing. Only a structure too big for
 * the box is actually governed by the box.
 */
describe("structure overlay resize", () => {
  /** An n x n grid of carbons, one bond length apart. */
  function seedGrid(cols: number, rows: number) {
    let mol = emptyMolecule();
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `g${n++}`;
        const at = { x: c * BOND_LEN, y: r * BOND_LEN };
        mol = addBond(addAtom(mol, id, at, "C"), `gb${id}`, id, n > cols ? `g${n - cols - 1}` : id, 1, "none");
      }
    }
    useMoleculeStore.setState({ molecule: mol, selected: new Set(), language: "en" });
  }

  function grip() {
    return container.querySelector(".nmr-spectrum-view__structure-resize") as HTMLElement;
  }

  /** The drawing box the diagram was handed, in pixels. */
  function drawingBox() {
    const svg = panel().querySelector("svg") as SVGSVGElement;
    return {
      width: Number(/([\d.]+)px/.exec(svg.style.width)?.[1]),
      height: Number(/([\d.]+)px/.exec(svg.style.height)?.[1]),
    };
  }

  /** The panel's own inline width, which tracks the allowance directly. */
  function panelWidth() {
    return Number(/([\d.]+)px/.exec(panel().style.width)?.[1]);
  }

  function resizeGrip(from: { x: number; y: number }, to: { x: number; y: number }) {
    const el = grip();
    const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "mouse", button: 0 } as const;
    act(() => {
      el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: from.x, clientY: from.y }));
      el.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: to.x, clientY: to.y }));
      el.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: to.x, clientY: to.y }));
    });
  }

  test("the grip is present and reachable by keyboard", () => {
    renderOverlay();
    stubLayout();
    expect(grip()).toBeTruthy();
    expect(grip().tabIndex).toBe(0);
    expect(grip().getAttribute("aria-label")).toBeTruthy();
  });

  test("dragging the grip left makes the drawing bigger", () => {
    // Wide and larger than the box, so the width is what governs it.
    seedGrid(16, 3);
    renderOverlay();
    stubLayout();
    const before = drawingBox();
    // Width is the governing axis here: the drawing fills the allowed width
    // while leaving the height allowance mostly unused.
    expect(before.width).toBe(340);
    expect(before.height).toBeLessThan(260);
    // The panel is anchored top-right, so the bottom-left grip moving LEFT
    // widens it - the opposite sign from a normal bottom-right grip.
    resizeGrip({ x: 400, y: 300 }, { x: 200, y: 300 });
    expect(drawingBox().width).toBeGreaterThan(before.width);
    expect(offset()).toEqual({ x: 0, y: 0 });
  });

  test("dragging the grip down makes it taller", () => {
    // Taller than it is wide, so the height is what governs it.
    seedGrid(2, 16);
    renderOverlay();
    stubLayout();
    const before = drawingBox();
    // Height governs this fixture: the drawing fills the allowed height while
    // the width allowance is mostly unused, which is what makes a taller box
    // the thing that helps here.
    expect(before.height).toBe(260);
    expect(before.width).toBeLessThan(340);
    resizeGrip({ x: 400, y: 300 }, { x: 400, y: 360 });
    expect(drawingBox().height).toBeGreaterThan(before.height);
  });

  test("resizing does not also drag the panel", () => {
    seedGrid(16, 3);
    renderOverlay();
    stubLayout();
    resizeGrip({ x: 400, y: 300 }, { x: 200, y: 360 });
    expect(offset()).toEqual({ x: 0, y: 0 });
  });

  test("dragging the panel body still moves it, grip or no grip", () => {
    renderOverlay();
    stubLayout();
    drag({ x: 700, y: 20 }, { x: 600, y: 20 });
    expect(offset().x).toBe(-100);
  });

  test("cannot be resized past the plot", () => {
    // A spectrum is the thing being read, so the overlay may not grow until it
    // covers the signals it annotates.
    seedGrid(16, 3);
    renderOverlay();
    stubLayout(760, 400);
    resizeGrip({ x: 700, y: 380 }, { x: 0, y: 900 });
    expect(panelWidth()).toBeLessThanOrEqual(760 * 0.9 + 16);
    expect(drawingBox().height).toBeLessThanOrEqual(400 * 0.9);
  });

  test("the grip still resizes a small molecule, whose drawing cannot grow", () => {
    // A two-carbon structure is already at the scale ceiling, so the drawing
    // is as big as it usefully gets. The panel must still respond, or the grip
    // reads as broken on exactly the structures where a user is most likely to
    // try it out of curiosity.
    renderOverlay();
    stubLayout();
    const beforePanel = panelWidth();
    const beforeDrawing = drawingBox();
    resizeGrip({ x: 400, y: 300 }, { x: 250, y: 300 });
    expect(panelWidth()).toBeGreaterThan(beforePanel);
    expect(drawingBox()).toEqual(beforeDrawing);
  });

  test("cannot be resized below a legible floor", () => {
    seedGrid(16, 3);
    renderOverlay();
    stubLayout();
    const before = drawingBox();
    resizeGrip({ x: 0, y: 0 }, { x: 900, y: -900 });
    // Shrinking is bounded too, so the drawing cannot be collapsed away.
    expect(drawingBox().width).toBeLessThan(before.width);
    expect(drawingBox().width).toBeGreaterThan(0);
    expect(drawingBox().height).toBeGreaterThan(0);
  });

  test("arrow keys resize without moving the panel", () => {
    seedGrid(16, 3);
    renderOverlay();
    stubLayout();
    const before = drawingBox();
    act(() => {
      grip().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });
    expect(drawingBox().width).toBeGreaterThan(before.width);
    // The panel's own arrow keys move it; the grip's must not also do so.
    expect(offset()).toEqual({ x: 0, y: 0 });
  });

  test("Home restores the default size", () => {
    seedGrid(16, 3);
    renderOverlay();
    stubLayout();
    const original = panelWidth();
    resizeGrip({ x: 400, y: 300 }, { x: 200, y: 380 });
    expect(panelWidth()).not.toBe(original);

    act(() => {
      grip().dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    });
    expect(panelWidth()).toBe(original);
  });

  test("double-clicking the grip restores the default size", () => {
    seedGrid(16, 3);
    renderOverlay();
    stubLayout();
    const original = panelWidth();
    resizeGrip({ x: 400, y: 300 }, { x: 200, y: 380 });
    act(() => {
      grip().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    expect(panelWidth()).toBe(original);
  });

  test("a cancelled resize settles instead of sticking to the cursor", () => {
    seedGrid(16, 3);
    renderOverlay();
    stubLayout();
    const original = panelWidth();
    const el = grip();
    const opts = { bubbles: true, cancelable: true, pointerId: 8, pointerType: "mouse", button: 0 } as const;
    act(() => {
      el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: 400, clientY: 300 }));
      el.dispatchEvent(new PointerEvent("pointercancel", { ...opts, clientX: 400, clientY: 300 }));
      el.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: 100, clientY: 380 }));
    });
    expect(panelWidth()).toBe(original);
  });
});
