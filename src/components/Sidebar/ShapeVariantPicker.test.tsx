// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MiniShape, ShapeVariantPicker } from "./ShapeVariantPicker";
import { useMoleculeStore } from "../../store/useMoleculeStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The shape tool's variant grid grew the lab-glassware set in the Phase-10
 * template-library expansion. These tests pin the picker contract: the
 * three original primitives stay first, the four glassware buttons render
 * with their translated titles, clicking reports the right variant id, and
 * MiniShape can draw every variant (the collapsed tool button renders a
 * MiniShape for whatever is selected, glassware included).
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useMoleculeStore.setState({ language: "en" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderPicker(variant: Parameters<typeof ShapeVariantPicker>[0]["variant"] = "rectangle") {
  const onChange = vi.fn();
  act(() => {
    root.render(
      <ShapeVariantPicker variant={variant} filled={false} onChange={onChange} onFilledChange={() => {}} active />,
    );
  });
  return onChange;
}

describe("ShapeVariantPicker", () => {
  test("renders the primitives and the glassware set with translated titles", () => {
    renderPicker();
    // Variant buttons only — the filled/outline toggle below the grid
    // shares their button class.
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".arrow-variant-btn:not(.shape-fill-toggle)")];
    const titles = buttons.map((b) => b.title);
    expect(titles).toEqual([
      "Rectangle",
      "Ellipse",
      "Line",
      "Beaker",
      "Erlenmeyer flask",
      "Round-bottom flask",
      "Test tube",
    ]);
  });

  test("reports the clicked variant id", () => {
    const onChange = renderPicker();
    const beaker = [...container.querySelectorAll<HTMLButtonElement>(".arrow-variant-btn")]
      .find((b) => b.title === "Beaker")!;
    act(() => beaker.click());
    expect(onChange).toHaveBeenCalledWith("beaker");
  });

  test("highlights the active variant", () => {
    renderPicker("testTube");
    const active = container.querySelector<HTMLButtonElement>(".arrow-variant-btn--active")!;
    expect(active.title).toBe("Test tube");
  });

  test("MiniShape renders line art for every variant, glassware included", () => {
    for (const variant of [
      "rectangle",
      "ellipse",
      "line",
      "beaker",
      "erlenmeyerFlask",
      "roundBottomFlask",
      "testTube",
    ] as const) {
      // root.render replaces the previous tree, so successive renders need
      // no manual DOM cleanup.
      act(() => {
        root.render(<MiniShape variant={variant} />);
      });
      const svg = container.querySelector("svg")!;
      // Every glyph draws something: primitives + glassware paths/circles.
      const drawn = svg.querySelectorAll("rect, ellipse, line, path, circle");
      expect(drawn.length, `MiniShape(${variant}) draws`).toBeGreaterThan(0);
      if (variant === "roundBottomFlask") {
        // The flask's bulb is a real circle element.
        expect(svg.querySelector("circle")).not.toBeNull();
      }
    }
  });
});
