// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { TlcPlateAnnotationView } from "./TlcPlateAnnotationView";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import type { TlcPlateAnnotation } from "../../types/chemistry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Placing a TLC plate returns the tool to select (so the new plate can be
 * moved/resized), which used to leave no way to start spotting without
 * going back to the sidebar. Double-clicking the plate is the shortcut back
 * into the TLC tool; these tests pin that down, and make sure it doesn't
 * hijack a double-click while some other drawing tool is active.
 */
const PLATE: TlcPlateAnnotation = { id: "plate", kind: "tlc", x: 0, y: 0, width: 90, height: 130, spots: [] };
const SPOTTED: TlcPlateAnnotation = {
  ...PLATE,
  spots: [
    { fx: 0.5, fy: 0.5, r: 4 },
    { fx: 0.25, fy: 0.75, r: 4 },
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMoleculeStore.setState({
    annotations: { plate: PLATE },
    selectedAnnotationIds: new Set(["plate"]),
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(selected = true, annotation: TlcPlateAnnotation = PLATE) {
  act(() => {
    root.render(
      <svg>
        <TlcPlateAnnotationView annotation={annotation} selected={selected} viewScale={1} />
      </svg>,
    );
  });
  const hit = container.querySelector<SVGRectElement>('[data-annotation-id="plate"] rect');
  expect(hit).not.toBeNull();
  return hit!;
}

function doubleClick(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
}

function pointerDown(target: Element, opts: { clientX: number; clientY: number; shiftKey?: boolean }) {
  act(() => {
    target.dispatchEvent(new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: opts.clientX,
      clientY: opts.clientY,
      shiftKey: opts.shiftKey ?? false,
    }));
  });
}

describe("TLC plate double-click", () => {
  test("switches from select to the TLC tool and keeps the plate selected for resizing", () => {
    useMoleculeStore.setState({ tool: "select" });
    doubleClick(render());
    expect(useMoleculeStore.getState().tool).toBe("tlc");
    expect(useMoleculeStore.getState().selectedAnnotationIds.has("plate")).toBe(true);
  });

  test("also works from the lasso tool", () => {
    useMoleculeStore.setState({ tool: "lasso" });
    doubleClick(render());
    expect(useMoleculeStore.getState().tool).toBe("tlc");
  });

  test("does not steal a double-click while another drawing tool is active", () => {
    useMoleculeStore.setState({ tool: "bond-1" });
    doubleClick(render());
    expect(useMoleculeStore.getState().tool).toBe("bond-1");
  });

  test("is a no-op when the TLC tool is already active", () => {
    useMoleculeStore.setState({ tool: "tlc" });
    doubleClick(render());
    expect(useMoleculeStore.getState().tool).toBe("tlc");
  });
});

describe("TLC spot deletion", () => {
  beforeEach(() => {
    useMoleculeStore.setState({ tool: "tlc", view: { tx: 0, ty: 0, scale: 1 }, annotations: { plate: SPOTTED } });
  });

  test("Shift+click directly on a spot removes that spot (not drags it)", () => {
    const hit = render(true, SPOTTED);
    // Spot 0 is at fractional (0.5, 0.5) on a 90×130 plate.
    pointerDown(hit, { clientX: 45, clientY: 65, shiftKey: true });
    const spots = (useMoleculeStore.getState().annotations.plate as TlcPlateAnnotation).spots;
    expect(spots).toHaveLength(1);
    expect(spots[0].fx).toBeCloseTo(0.25);
  });

  test("each spot gets a × button that removes it", () => {
    render(true, SPOTTED);
    const buttons = container.querySelectorAll(".tlc-spot-delete");
    expect(buttons).toHaveLength(2);
    pointerDown(buttons[0], { clientX: 0, clientY: 0 });
    const spots = (useMoleculeStore.getState().annotations.plate as TlcPlateAnnotation).spots;
    expect(spots).toHaveLength(1);
    expect(spots[0].fx).toBeCloseTo(0.25);
  });

  test("× buttons are hidden when the plate is neither selected nor in TLC mode", () => {
    useMoleculeStore.setState({ tool: "select" });
    render(false, SPOTTED);
    expect(container.querySelectorAll(".tlc-spot-delete")).toHaveLength(0);
  });
});
