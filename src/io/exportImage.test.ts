// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildExportClone, exportSelectionSVGString } from "./exportImage";

/**
 * Cropping for export and copy-to-clipboard.
 *
 * The complaint these pin down is a pasted image arriving with a wide white
 * border, so that it had to be trimmed by hand before use in a document. Two
 * separate things produced that margin, and they are independent:
 *
 *  - The margin itself was a large fraction of the molecule rather than the
 *    handful of units that geometry actually needs.
 *  - The crop was measured on the LIVE canvas, which still contains transient
 *    UI — bond previews, hover rings — that the exported image never has. So
 *    the frame was partly drawn around a ghost.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Builds a canvas-shaped SVG.
 *
 * Each element carries a `data-bbox` of "x,y,w,h", and getBBox is stubbed to
 * union the visible descendants. Deriving the measurement from the tree it is
 * called on is what lets these tests tell the two bugs apart: called on the
 * live group the ghost is included, called on the stripped clone it is not.
 */
function canvas(markup: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "canvas");
  svg.innerHTML = markup;
  document.body.appendChild(svg);
  return svg as unknown as SVGSVGElement;
}

/** A content group holding the given children, inside the pan/zoom viewport. */
function content(...children: string[]): string {
  return `<g data-export-viewport="true" transform="translate(500,500) scale(3)">
    <g data-export-content="true">${children.join("")}</g>
  </g>`;
}

function atom(id: string, bbox: string): string {
  return `<g data-atom-id="${id}" data-bbox="${bbox}"><circle r="5"/></g>`;
}

function ghost(bbox: string): string {
  return `<g data-export-exclude="true" data-bbox="${bbox}"><circle r="5"/></g>`;
}

function box(s: string) {
  const [x, y, width, height] = s.split(",").map(Number);
  return { x, y, width, height };
}

/** The margin actually added around a measured box, per side. */
function marginOf(bounds: { x: number; y: number; width: number; height: number }, content: { x: number; y: number; width: number; height: number }) {
  return {
    left: content.x - bounds.x,
    top: content.y - bounds.y,
    right: bounds.x + bounds.width - (content.x + content.width),
    bottom: bounds.y + bounds.height - (content.y + content.height),
  };
}

beforeEach(() => {
  // jsdom implements no SVG geometry, so stand in a union-of-children getBBox
  // that ignores export-excluded elements the way a stripped export does.
  (SVGGraphicsElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = function (
    this: SVGGraphicsElement,
  ) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of this.querySelectorAll("[data-bbox]")) {
      if (el.closest("[data-export-exclude]")) continue;
      const b = box(el.getAttribute("data-bbox")!);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width);
      y1 = Math.max(y1, b.y + b.height);
    }
    if (!Number.isFinite(x0)) return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } as DOMRect;
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("export crop", () => {
  test("adds only a small margin, not a fraction of the molecule", () => {
    // A 120-unit-wide fragment used to export 168 units wide - 40% of the
    // image was white border, which is what had to be trimmed by hand.
    const svg = canvas(content(atom("a1", "0,0,40,40"), atom("a2", "80,0,40,40")));
    const { bounds } = buildExportClone(svg, null);
    const margin = marginOf(bounds, box("0,0,120,40"));
    expect(margin.left).toBeLessThanOrEqual(12);
    expect(margin.right).toBeLessThanOrEqual(12);
    expect(margin.top).toBeLessThanOrEqual(12);
    expect(margin.bottom).toBeLessThanOrEqual(12);
  });

  test("keeps a margin big enough not to clip strokes and arrowheads", () => {
    // Bonds are stroked ~2 units wide (invisible to getBBox) and the largest
    // arrowhead marker overhangs a bond end by ~3 units, so a zero margin would
    // shave the edges off the drawing.
    const svg = canvas(content(atom("a1", "0,0,40,40")));
    const { bounds } = buildExportClone(svg, null);
    const margin = marginOf(bounds, box("0,0,40,40"));
    expect(margin.left).toBeGreaterThanOrEqual(4);
  });

  test("a wide molecule does not accumulate margin proportional to its size", () => {
    // The old 18%-of-the-largest-dimension rule meant a 1000-unit molecule
    // carried 180 units of border on each side.
    const svg = canvas(content(atom("a1", "0,0,1000,40")));
    const { bounds } = buildExportClone(svg, null);
    expect(marginOf(bounds, box("0,0,1000,40")).left).toBeLessThanOrEqual(25);
  });

  test("transient UI on the live canvas does not inflate the frame", () => {
    // A hover ring or bond preview parked far from the molecule. It is removed
    // before rasterizing, so a frame measured around it is pure white border.
    const svg = canvas(content(atom("a1", "0,0,40,40"), ghost("900,900,60,60")));
    const { bounds } = buildExportClone(svg, null);
    expect(bounds.width).toBeLessThan(100);
    expect(bounds.height).toBeLessThan(100);
    expect(marginOf(bounds, box("0,0,40,40")).left).toBeLessThanOrEqual(12);
  });

  test("transient UI is gone from the exported markup", () => {
    const svg = canvas(content(atom("a1", "0,0,40,40"), ghost("900,900,60,60")));
    const { clone } = buildExportClone(svg, null);
    expect(clone.querySelectorAll("[data-export-exclude]")).toHaveLength(0);
  });

  test("the crop ignores the canvas pan and zoom", () => {
    // The viewport group carries a translate+scale; the frame must be in the
    // molecule's own coordinates or the drawing lands outside it entirely.
    const svg = canvas(content(atom("a1", "1000,1000,40,40")));
    const { bounds } = buildExportClone(svg, null);
    expect(bounds.x).toBeLessThan(1000);
    expect(bounds.y).toBeLessThan(1000);
  });

  test("an empty canvas falls back to a small frame rather than a huge one", () => {
    const svg = canvas(`<g data-export-viewport="true"><g data-export-content="true"></g></g>`);
    const { bounds } = buildExportClone(svg, null);
    expect(bounds.width).toBe(180);
    expect(bounds.height).toBe(180);
  });

  test("the frame is published as the viewBox", () => {
    const svg = canvas(content(atom("a1", "0,0,40,40")));
    const { clone, bounds } = buildExportClone(svg, null);
    expect(clone.getAttribute("viewBox")).toBe(
      `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
    );
  });

  test("a background rect, when asked for, fills exactly the frame", () => {
    const svg = canvas(content(atom("a1", "0,0,40,40")));
    const { clone, bounds } = buildExportClone(svg, "#ffffff");
    const rect = clone.querySelector("rect");
    expect(rect).toBeTruthy();
    expect(Number(rect!.getAttribute("width"))).toBeCloseTo(bounds.width, 6);
    expect(Number(rect!.getAttribute("height"))).toBeCloseTo(bounds.height, 6);
  });

  test("no measuring scaffolding is left on the exported SVG", () => {
    // The clone is attached off-screen to give getBBox real layout. That
    // positioning must not survive into the file, where it would move the
    // drawing off the page - printExport serializes the same clone.
    const svg = canvas(content(atom("a1", "0,0,40,40")));
    const { clone } = buildExportClone(svg, null);
    expect(clone.getAttribute("style")).toBeNull();
    expect(new XMLSerializer().serializeToString(clone)).not.toContain("-99999px");
  });

  test("the measuring clone does not stay in the document", () => {
    const before = document.body.childElementCount;
    const svg = canvas(content(atom("a1", "0,0,40,40")));
    buildExportClone(svg, null);
    // Only the original canvas should remain.
    expect(document.body.childElementCount).toBe(before + 1);
    expect(document.querySelectorAll("svg").length).toBe(1);
  });
});

describe("selection copy SVG (the rich copy's HTML flavor)", () => {
  test("frames only the selected fragment, not the whole canvas", () => {
    const svg = canvas(content(atom("a1", "0,0,40,40"), atom("a2", "80,0,40,40")));
    const markup = exportSelectionSVGString(svg, new Set(["a2"]), new Set(), new Set());
    expect(markup).not.toBeNull();
    // The unselected atom must be gone from the serialized markup...
    expect(markup).not.toContain('data-atom-id="a1"');
    expect(markup).toContain('data-atom-id="a2"');
    // ...and the frame must be the fragment's, not the full canvas's.
    expect(markup).toContain('viewBox="');
    const view = markup!.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
    expect(view[2]).toBeLessThan(100); // a2 alone spans 40 units + margin
  });

  test("keeps bonds and annotations that belong to the selection", () => {
    const svg = canvas(
      content(
        `<g data-atom-id="a1" data-bbox="0,0,40,40"><circle r="5"/></g>`,
        `<g data-bond-id="b1" data-bbox="10,10,20,20"><line/></g>`,
        `<g data-annotation-id="t1" data-bbox="50,50,10,10"><rect/></g>`,
      ),
    );
    const markup = exportSelectionSVGString(svg, new Set(["a1"]), new Set(["b1"]), new Set(["t1"]));
    expect(markup).toContain('data-bond-id="b1"');
    expect(markup).toContain('data-annotation-id="t1"');
    expect(markup).toContain('data-atom-id="a1"');
  });
});
