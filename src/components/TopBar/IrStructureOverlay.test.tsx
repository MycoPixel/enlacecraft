// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { emptyMolecule, addAtom, addBond } from "../../model/molecule";
import {
  IrStructureOverlay,
  clampStructureOffset,
  STRUCTURE_DEFAULT_SIZE,
  STRUCTURE_MIN_SIZE,
  STRUCTURE_MAX_SIZE,
  STRUCTURE_CHROME,
} from "./IrStructureOverlay";

/**
 * The structure window over the spectrum.
 *
 * The clamping arithmetic is unit-tested separately below because it is pure
 * layout logic. What can only be checked through the real handlers is the
 * wiring: that a press and move actually moves the window, that the H toggle
 * inside the panel is not swallowed as the start of a drag, and that the resize
 * grip grows the window leftwards (the direction the window actually widens).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let plot: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  plot = document.createElement("div");
  document.body.appendChild(plot);
  // jsdom reports zero-sized rects, and the clamp reads the container's, so
  // give it a real one.
  plot.getBoundingClientRect = () => ({ width: 1000, height: 400 }) as DOMRect;
  // jsdom implements none of the pointer-capture API. Without these the very
  // first line of the drag handlers throws and every drag silently does nothing,
  // which would make the wiring tests below pass for the wrong reason.
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  Element.prototype.hasPointerCapture = function () {
    return false;
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  plot.remove();
});

function ethanolSkeletal() {
  let mol = emptyMolecule();
  ["C", "C", "O", "C"].forEach((el, i) => {
    mol = addAtom(mol, `a${i}`, { x: i * 40, y: 0 }, el as never);
  });
  mol = addBond(mol, "b0", "a0", "a1", 1);
  mol = addBond(mol, "b1", "a1", "a2", 1);
  mol = addBond(mol, "b2", "a1", "a3", 1);
  return mol;
}

function render(mol = ethanolSkeletal()) {
  act(() => root.render(<IrStructureOverlay molecule={mol} containerRef={{ current: plot }} />));
}

function openWindow() {
  act(() => {
    (container.querySelector(".ir-report-toggle-btn") as HTMLButtonElement).click();
  });
}

function windowEl(): HTMLElement | null {
  return container.querySelector(".ir-structure-overlay");
}

function offset(): { x: number; y: number } {
  const style = windowEl()!.style.transform;
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(style);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
}

function panelWidth(): number {
  return parseFloat(windowEl()!.style.width);
}

function pointer(el: Element, type: string, clientX: number, clientY: number, button = 0) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true, button }));
  });
}

describe("clampStructureOffset", () => {
  const layout = { containerWidth: 1000, containerHeight: 400, panelWidth: 300, panelHeight: 250 };

  test("leaves a modest offset alone", () => {
    expect(clampStructureOffset({ x: -50, y: 40 }, layout)).toEqual({ x: -50, y: 40 });
  });

  test("upward travel stops at the inset, since the window rests there", () => {
    // It rests 8px from the top, so 8px of upward travel puts its top edge on
    // the plot's edge and no further would take it off.
    expect(clampStructureOffset({ x: 0, y: -40 }, layout).y).toBe(-8);
  });

  test("stops the window at the left edge instead of letting it vanish", () => {
    // The window's resting place is inset from the RIGHT, so travel to the left
    // is negative and is bounded by its own width.
    const out = clampStructureOffset({ x: -5000, y: 0 }, layout);
    expect(out.x).toBe(-(1000 - 8 - 300));
  });

  test("stops it at the bottom edge", () => {
    expect(clampStructureOffset({ x: 0, y: 5000 }, layout).y).toBe(400 - 8 - 250);
  });

  test("does not allow travel back past its resting place", () => {
    // Otherwise it could be dragged out over the dialog's own chrome with no
    // way to get it back.
    const out = clampStructureOffset({ x: 5000, y: -5000 }, layout);
    expect(out.x).toBeLessThanOrEqual(8);
    expect(out.y).toBeLessThanOrEqual(0);
  });

  test("a window bigger than the plot collapses to the top-left rather than inverting", () => {
    // The allowed range would be empty, so min/max must collapse to one value
    // instead of producing a range that reads as upside-down.
    const out = clampStructureOffset({ x: 40, y: 40 }, {
      containerWidth: 200,
      containerHeight: 150,
      panelWidth: 400,
      panelHeight: 300,
    });
    expect(out.x).toBe(8);
    expect(out.y).toBe(-8);
  });
});

describe("floating structure window", () => {
  test("is hidden until asked for, so it cannot bury the spectrum", () => {
    render(ethanolSkeletal());
    expect(windowEl()).toBeNull();
  });

  test("opens and closes from the toggle", () => {
    render(ethanolSkeletal());
    openWindow();
    expect(windowEl()).not.toBeNull();
    act(() => (container.querySelector(".ir-report-toggle-btn") as HTMLButtonElement).click());
    expect(windowEl()).toBeNull();
  });

  test("a drag moves the window", () => {
    render(ethanolSkeletal());
    openWindow();
    const el = windowEl()!;
    pointer(el, "pointerdown", 100, 100);
    pointer(el, "pointermove", 40, 130);
    expect(offset()).toEqual({ x: -60, y: 30 });
    pointer(el, "pointerup", 40, 130);
  });

  test("rightward travel is bounded, because it already rests flush right", () => {
    render(ethanolSkeletal());
    openWindow();
    const el = windowEl()!;
    pointer(el, "pointerdown", 100, 100);
    pointer(el, "pointermove", 400, 100);
    // There is nowhere to the right of the plot edge for it to go.
    expect(offset().x).toBe(8);
    pointer(el, "pointerup", 400, 100);
  });

  test("a drag cannot push the window out of the plot", () => {
    render(ethanolSkeletal());
    openWindow();
    const el = windowEl()!;
    pointer(el, "pointerdown", 100, 100);
    pointer(el, "pointermove", -5000, 5000);
    expect(offset().x).toBeGreaterThanOrEqual(-1000);
    expect(offset().y).toBeLessThanOrEqual(400);
    pointer(el, "pointerup", -5000, 5000);
  });

  test("the arrow keys nudge it, so it is reachable without a pointer", () => {
    render(ethanolSkeletal());
    openWindow();
    const el = windowEl()!;
    act(() => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(offset().x).toBeLessThan(0);
  });

  test("Escape is left alone so it still closes the report", () => {
    render(ethanolSkeletal());
    openWindow();
    const el = windowEl()!;
    act(() => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    // Nothing here handles Escape; the report's own listener does.
    expect(windowEl()).not.toBeNull();
  });
});

describe("floating structure window: the H toggle", () => {
  test("adds hydrogens to a skeletal structure", () => {
    render(ethanolSkeletal());
    openWindow();
    const before = container.querySelectorAll(".ir-structure__svg > g").length;
    act(() => (container.querySelector(".ir-structure-overlay__btn") as HTMLButtonElement).click());
    const after = container.querySelectorAll(".ir-structure__svg > g").length;
    expect(after).toBeGreaterThan(before);
  });

  test("is not swallowed as the start of a drag", () => {
    // The control row sits inside the draggable panel, so without an explicit
    // guard the pointerdown on the button starts a move instead of a click.
    render(ethanolSkeletal());
    openWindow();
    const btn = container.querySelector(".ir-structure-overlay__btn") as HTMLButtonElement;
    pointer(btn, "pointerdown", 100, 100);
    expect(offset()).toEqual({ x: 0, y: 0 });
  });
});

describe("floating structure window: resizing", () => {
  function grip(): HTMLElement {
    return container.querySelector(".ir-structure-overlay__resize") as HTMLElement;
  }

  test("dragging the grip LEFT grows the window", () => {
    render(ethanolSkeletal());
    openWindow();
    const before = panelWidth();
    pointer(grip(), "pointerdown", 100, 100);
    pointer(grip(), "pointermove", 40, 100);
    expect(panelWidth()).toBeGreaterThan(before);
    pointer(grip(), "pointerup", 40, 100);
  });

  test("dragging it RIGHT shrinks the window", () => {
    render(ethanolSkeletal());
    openWindow();
    const before = panelWidth();
    pointer(grip(), "pointerdown", 100, 100);
    pointer(grip(), "pointermove", 160, 100);
    expect(panelWidth()).toBeLessThan(before);
    pointer(grip(), "pointerup", 160, 100);
  });

  test("growing the window grows the drawing, rather than adding padding", () => {
    render(ethanolSkeletal());
    openWindow();
    const svg = () => container.querySelector(".ir-structure__svg") as SVGElement;
    const before = parseFloat(svg().style.width);
    pointer(grip(), "pointerdown", 100, 100);
    pointer(grip(), "pointermove", 0, 100);
    expect(parseFloat(svg().style.width)).toBeGreaterThan(before);
    pointer(grip(), "pointerup", 0, 100);
  });

  test("will not shrink below the floor, where the drawing stops being information", () => {
    render(ethanolSkeletal());
    openWindow();
    pointer(grip(), "pointerdown", 100, 100);
    pointer(grip(), "pointermove", 100, 100000);
    // Bottom-left grip: up shrinks the height, so the floor is what matters.
    expect(panelWidth()).toBeGreaterThanOrEqual(STRUCTURE_MIN_SIZE.width);
    pointer(grip(), "pointerup", 100, 100000);
  });

  test("will not grow past the ceiling, which would strand it off the dialog", () => {
    render(ethanolSkeletal());
    openWindow();
    pointer(grip(), "pointerdown", 100, 100);
    pointer(grip(), "pointermove", -100000, 100000);
    // The panel is the drawing box plus its own padding and border, so the
    // ceiling applies to the box the drawing is fitted into, not the panel.
    expect(panelWidth()).toBeLessThanOrEqual(STRUCTURE_MAX_SIZE.width + STRUCTURE_CHROME);
    pointer(grip(), "pointerup", -100000, 100000);
  });

  test("double-clicking the grip restores the default size", () => {
    render(ethanolSkeletal());
    openWindow();
    pointer(grip(), "pointerdown", 100, 100);
    pointer(grip(), "pointermove", 0, 100);
    pointer(grip(), "pointerup", 0, 100);
    const grown = panelWidth();
    expect(grown).toBeGreaterThan(STRUCTURE_DEFAULT_SIZE.width);
    act(() => grip().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    // Back to the size it had before the grip was dragged, i.e. the default
    // allowance plus the window's own chrome.
    expect(panelWidth()).toBeLessThan(grown);
  });

  test("resizing does not also drag the window", () => {
    render(ethanolSkeletal());
    openWindow();
    pointer(grip(), "pointerdown", 100, 100);
    pointer(grip(), "pointermove", 60, 100);
    expect(offset()).toEqual({ x: 0, y: 0 });
    pointer(grip(), "pointerup", 60, 100);
  });
});