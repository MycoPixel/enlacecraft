// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { foreignObjectsToSvgText, computePagePlacement } from "./pdfExport";
import { BOND_LEN } from "../model/constants";
import { defaultPageSetup } from "../model/pageSetup";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgWithAnnotation(html: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 200 120");
  const fo = document.createElementNS(SVG_NS, "foreignObject");
  fo.setAttribute("x", "10");
  fo.setAttribute("y", "20");
  fo.setAttribute("width", "120");
  fo.setAttribute("height", "40");
  fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml"><div class="annotation-text" style="font-size:14px">${html}</div></div>`;
  svg.appendChild(fo);
  document.body.appendChild(svg);
  return svg;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("foreignObjectsToSvgText", () => {
  test("replaces an annotation box with real SVG text", () => {
    const svg = svgWithAnnotation("H<sub>2</sub>O, heat");
    foreignObjectsToSvgText(svg, { x: 0, y: 0, width: 200, height: 120 });

    expect(svg.querySelector("foreignObject")).toBeNull();
    const group = svg.querySelector("[data-pdf-annotation]");
    expect(group).not.toBeNull();
    expect(group?.textContent).toContain("H2O, heat");
  });

  test("keeps the text even when layout measurement is unavailable", () => {
    // jsdom returns zero-sized rects for every Range, which is exactly the
    // fallback path: drop the exact position, not the annotation itself.
    const svg = svgWithAnnotation("reflux, 4 h");
    foreignObjectsToSvgText(svg, { x: 0, y: 0, width: 200, height: 120 });

    const texts = svg.querySelectorAll("[data-pdf-annotation] text");
    expect(texts.length).toBeGreaterThan(0);
    expect(Number(texts[0].getAttribute("x"))).toBe(15);
    expect(Number(texts[0].getAttribute("y"))).toBe(37);
  });

  test("does nothing when there are no annotations", () => {
    const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    const rect = document.createElementNS(SVG_NS, "rect");
    svg.appendChild(rect);
    document.body.appendChild(svg);

    foreignObjectsToSvgText(svg, { x: 0, y: 0, width: 10, height: 10 });
    expect(svg.querySelector("rect")).toBe(rect);
  });
});

describe("PDF page placement", () => {
  test("uses the active page's size, bond length and margin", () => {
    const page = { ...defaultPageSetup(), width: 400, height: 500, bondLength: 21, margin: 20 };
    const placement = computePagePlacement(10 * BOND_LEN, 4 * BOND_LEN, page);
    expect(placement.pageWidthPt).toBe(400);
    expect(placement.pageHeightPt).toBe(500);
    // 21 pt bonds at 42 world units per bond -> 0.5 pt per world unit.
    expect(placement.scale).toBeCloseTo(0.5);
    // Centred horizontally and vertically.
    expect(placement.xPt).toBeCloseTo((400 - placement.widthPt) / 2);
    expect(placement.yPt).toBeCloseTo((500 - placement.heightPt) / 2);
  });

  test("shrinks a drawing that cannot fit inside the margins", () => {
    const page = { ...defaultPageSetup(), width: 200, height: 200, bondLength: 30, margin: 50 };
    const placement = computePagePlacement(10_000, 10_000, page);
    expect(placement.widthPt).toBeLessThanOrEqual(100);
    expect(placement.heightPt).toBeLessThanOrEqual(100);
  });

  test("an empty drawing still gets a finite placement", () => {
    const placement = computePagePlacement(0, 0, defaultPageSetup());
    expect(Number.isFinite(placement.widthPt)).toBe(true);
    expect(placement.widthPt).toBeGreaterThan(0);
  });
});
