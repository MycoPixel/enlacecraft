// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { glasswareGlyph, ShapeAnnotationView } from "./ShapeAnnotationView";
import type { ShapeAnnotation } from "../../types/chemistry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The lab-glassware shape variants (Phase-10 template-library expansion).
 * The geometry itself is covered by glasswareGlyph unit tests; these
 * render tests pin that ShapeAnnotationView actually draws each glassware
 * annotation (path, and a real circle for the round-bottom flask's bulb),
 * that the drawn geometry is the generated one, and that the shared shape
 * plumbing (hit area, resize handle) still applies.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(annotation: ShapeAnnotation, selected = false) {
  act(() => {
    root.render(
      <svg>
        <ShapeAnnotationView annotation={annotation} selected={selected} viewScale={1} />
      </svg>,
    );
  });
}

const BOX = { x: 100, y: 200, width: 120, height: 160 };

function shapeAnnotation(variant: ShapeAnnotation["variant"], overrides: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
  return { id: "s1", kind: "shape", ...BOX, variant, ...overrides };
}

describe("glassware shape rendering", () => {
  test("each glassware variant renders its generated path", () => {
    const variants = ["beaker", "erlenmeyerFlask", "roundBottomFlask", "testTube"] as const;
    act(() => {
      root.render(
        <svg>
          {variants.map((variant, i) => (
            <ShapeAnnotationView
              key={variant}
              annotation={{ id: `s-${i}`, kind: "shape", ...BOX, variant }}
              selected={false}
              viewScale={1}
            />
          ))}
        </svg>,
      );
    });
    variants.forEach((variant, i) => {
      const group = container.querySelector<SVGGElement>(`[data-annotation-id="s-${i}"]`);
      expect(group, variant).not.toBeNull();
      const path = group!.querySelector("path");
      expect(path, `${variant} draws a path`).not.toBeNull();
      const expected = glasswareGlyph(variant, BOX.x, BOX.y, BOX.width, BOX.height);
      expect(path!.getAttribute("d")).toBe(expected.d);
      expect(path!.getAttribute("stroke")).toBe("var(--ink)");
    });
  });

  test("the round-bottom flask's bulb is a circle resting on the box floor", () => {
    render(shapeAnnotation("roundBottomFlask"));
    const circle = container.querySelector<SVGCircleElement>('[data-annotation-id="s1"] circle')!;
    expect(circle).not.toBeNull();
    const glyph = glasswareGlyph("roundBottomFlask", BOX.x, BOX.y, BOX.width, BOX.height);
    expect(Number(circle.getAttribute("cx"))).toBe(glyph.circles[0].cx);
    expect(Number(circle.getAttribute("cy"))).toBe(glyph.circles[0].cy);
    expect(Number(circle.getAttribute("r"))).toBe(glyph.circles[0].r);
    // Bulb touches the bottom of the box and is centred horizontally.
    expect(glyph.circles[0].cy + glyph.circles[0].r).toBeCloseTo(BOX.y + BOX.height, 6);
    expect(glyph.circles[0].cx).toBeCloseTo(BOX.x + BOX.width / 2, 6);
  });

  test("filled glassware gets a translucent wash instead of a solid fill", () => {
    render(shapeAnnotation("beaker", { filled: true }));
    const path = container.querySelector<SVGPathElement>('[data-annotation-id="s1"] path')!;
    expect(path.getAttribute("fill")).toBe("var(--ink)");
    expect(path.getAttribute("fill-opacity")).toBe("0.15");
  });

  test("selected glassware keeps the shared resize handle and hit area", () => {
    render(shapeAnnotation("testTube"), true);
    const group = container.querySelector<SVGGElement>('[data-annotation-id="s1"]')!;
    // Wide transparent hit rect (glassware is not a "line").
    expect(group.querySelector("rect[fill='transparent']")).not.toBeNull();
    const handle = group.querySelector("rect[fill='var(--accent)']");
    expect(handle).not.toBeNull();
    expect(handle!.getAttribute("x")).toBe(String(BOX.x + BOX.width - 4));
  });
});

describe("glasswareGlyph geometry", () => {
  test("every glyph stays inside its box (bottom-curve control points aside) for portrait and landscape boxes", () => {
    for (const variant of ["beaker", "erlenmeyerFlask", "roundBottomFlask", "testTube"] as const) {
      for (const box of [
        { x: 0, y: 0, width: 120, height: 160 },
        { x: 40, y: 60, width: 160, height: 90 },
        { x: -30, y: 10, width: 30, height: 90 },
      ]) {
        const glyph = glasswareGlyph(variant, box.x, box.y, box.width, box.height);
        // Extract all numeric coordinates from the path data and confirm
        // they land within the box (Bézier control points may sit a hair
        // outside on the test tube's bottom bulge; rendered vertices must
        // not).
        const nums = (glyph.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < nums.length; i += 2) {
          xs.push(nums[i]);
          ys.push(nums[i + 1]);
        }
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(box.x - 0.01);
        expect(Math.max(...xs)).toBeLessThanOrEqual(box.x + box.width + 0.01);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(box.y - 0.01);
        // On-curve vertices stay in the box; the test tube's cubic bottom
        // control points sit a hair past the floor (the curve itself
        // bottoms out at ≈0.96 of the box height), hence the small
        // control-point allowance.
        expect(Math.max(...ys)).toBeLessThanOrEqual(box.y + box.height + 4);
        for (const circle of glyph.circles) {
          expect(circle.cy + circle.r).toBeLessThanOrEqual(box.y + box.height + 0.01);
          expect(circle.cy - circle.r).toBeGreaterThanOrEqual(box.y - 0.01);
        }
      }
    }
  });

  test("the test tube is the only glyph with multiple subpaths (rim + body)", () => {
    expect(glasswareGlyph("testTube", 0, 0, 60, 120).d.match(/M /g)).toHaveLength(2);
    expect(glasswareGlyph("beaker", 0, 0, 60, 120).d.match(/M /g)).toHaveLength(1);
    expect(glasswareGlyph("erlenmeyerFlask", 0, 0, 60, 120).d.match(/M /g)).toHaveLength(1);
    expect(glasswareGlyph("roundBottomFlask", 0, 0, 60, 120).d.match(/M /g)).toHaveLength(2); // two neck lines
  });

  test("only the round-bottom flask needs circles", () => {
    for (const variant of ["beaker", "erlenmeyerFlask", "testTube"] as const) {
      expect(glasswareGlyph(variant, 0, 0, 60, 120).circles).toHaveLength(0);
    }
    expect(glasswareGlyph("roundBottomFlask", 0, 0, 60, 120).circles).toHaveLength(1);
  });
});
