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

function render(selected = true) {
  act(() => {
    root.render(
      <svg>
        <TlcPlateAnnotationView annotation={PLATE} selected={selected} viewScale={1} />
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
