export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Margin left around the drawing, in molecule units.
 *
 * Small, deliberately. getBBox() already returns the geometry's own extent —
 * atom circles, bond endpoints, laid-out text boxes — so this margin only has
 * to cover what geometry does NOT include:
 *
 *  - Half a stroke width. getBBox ignores stroke, and bonds are drawn at about
 *    1.6-1.8 units, so ~1 unit per side.
 *  - Arrowhead markers, sized in stroke-width units, which overhang a bond's
 *    endpoint by roughly 3 units at the largest size.
 *  - A highlighted bond's underlay, stroked 7 units with round caps and so
 *    reaching 3.5 units past each end. This is the largest overhang in the
 *    drawing, and unlike the previews it is deliberately exported, so the
 *    margin has to cover it.
 *  - The occasional glyph that pokes past its text box (italic serifs, a
 *    superscript isotope mass number) - a unit or two.
 *
 * Six units clears all of that. The previous values (a 24-unit floor, and 18%
 * of the larger dimension) were what put a visible white border around every
 * pasted image: a 100-unit molecule exported at 148 units wide — half again as
 * much image as drawing — and a large one carried 36% of its width as margin.
 * Pasting that into a document meant trimming it by hand every time. Note the
 * margin is a fixed number of units precisely so that it stays negligible next
 * to a molecule, instead of scaling with one and re-creating the problem.
 */
const EXPORT_PADDING_MIN = 6;
/** Fraction of the larger dimension, so a very spread-out drawing keeps a
 *  proportional safety margin without the margin dominating the image. */
const EXPORT_PADDING_RATIO = 0.02;

/** World units to raster pixels. Fixed, so export quality never depends on
 *  the current on-screen zoom level (a molecule zoomed out to look tiny on
 *  screen still exports at full resolution). */
const PIXELS_PER_UNIT = 8;
/** Hard ceiling on raster dimensions so a very spread-out drawing can't blow
 *  past browser canvas size limits. */
const MAX_RASTER_DIMENSION = 8000;

/** Used when there is nothing measurable to export, rather than an empty or
 *  zero-sized frame. */
const EMPTY_BOUNDS: ExportBounds = { x: -90, y: -90, width: 180, height: 180 };

export interface ExportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Grows a measured box by the export margin on every side. */
function padBounds(box: { x: number; y: number; width: number; height: number }): ExportBounds {
  const padding = Math.max(EXPORT_PADDING_MIN, Math.max(box.width, box.height) * EXPORT_PADDING_RATIO);
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

/**
 * Clones the canvas SVG into a standalone, export-ready copy: dynamic colors
 * and fonts resolved to literal values, editor-only UI stripped (grid
 * background, selection highlights, hover previews, marquee — anything marked
 * data-export-exclude), the pan/zoom transform dropped, and the app's own
 * styling attributes removed.
 *
 * The bounding box is measured on THIS clone rather than on the live canvas,
 * and that ordering is the point. Transient UI — bond and chain previews, hover
 * rings — sits inside `[data-export-content]` and is removed above, but it is
 * very much present on the live canvas. Measuring the live group therefore
 * framed the export around a ghost the user could see and the exported image
 * never contained, padding the picture with white space that grew with wherever
 * the pointer happened to be resting. Measuring after the strip means the frame
 * is derived from exactly the pixels that get written.
 */
function prepareExportClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Both inlining passes index-align against the live tree, so they must run
  // before anything is removed (see their own doc comments).
  inlineDynamicColors(svg, clone);
  inlineFonts(svg, clone);
  clone.querySelectorAll("[data-export-exclude]").forEach((el) => el.remove());
  // The bounding box is measured in the molecule's own untransformed
  // coordinate space, but the cloned markup still carries the live canvas's
  // pan/zoom transform on its ancestor group. Left in place, that transform
  // would shift and rescale the content relative to a viewBox that assumes
  // no pan/zoom at all — at typical zoom levels this pushes the molecule
  // outside the cropped frame entirely, exporting a blank image. Resetting
  // it to identity makes the export always reflect the molecule's natural
  // layout regardless of how the canvas happens to be panned/zoomed on screen.
  clone.querySelectorAll("[data-export-viewport]").forEach((el) => el.removeAttribute("transform"));
  clone.removeAttribute("style");
  clone.removeAttribute("class");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return clone;
}

/**
 * Measures the clone's `[data-export-content]` box, attaching it off-screen for
 * the duration because getBBox() needs real layout to resolve text.
 *
 * The generous fixed viewBox is only there to give the clone a sane coordinate
 * space to lay text out in; it cannot clip the measurement, since getBBox
 * reports geometry rather than the visible region.
 *
 * Always detaches, including on throw — a measuring clone left in the document
 * would be a full-size invisible duplicate of the canvas sitting in the page.
 */
function measureContentBox(clone: SVGSVGElement): { x: number; y: number; width: number; height: number } | null {
  const content = clone.querySelector<SVGGraphicsElement>("[data-export-content]");
  if (!content) return null;
  clone.setAttribute("width", "2000");
  clone.setAttribute("height", "2000");
  clone.setAttribute("viewBox", "-1000 -1000 2000 2000");
  clone.style.position = "fixed";
  clone.style.left = "-99999px";
  clone.style.top = "0";
  clone.style.pointerEvents = "none";
  document.body.appendChild(clone);
  try {
    const b = content.getBBox();
    if (b.width > 0 || b.height > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
    return null;
  } catch {
    // getBBox can throw if the element isn't rendered; treat as unmeasurable.
    return null;
  } finally {
    clone.remove();
    // The positioning above is only for measuring. Leaving it on would
    // serialize `position: fixed; left: -99999px` straight into an exported
    // .svg file, where it would shift the drawing off the page. prepareExportClone
    // already cleared the clone's own styling, so dropping the attribute here
    // restores exactly the state callers expect to receive.
    clone.removeAttribute("style");
  }
}

/**
 * Copies computed fill/stroke colors from the live, on-screen SVG onto the
 * (structurally identical) clone for any element whose fill/stroke is a CSS
 * custom property (var(--...)) or `currentColor`. Exported SVG/PNG files are
 * read back as their own standalone document with no access to the app's
 * stylesheet, so those values would otherwise resolve to nothing usable —
 * e.g. a selection highlight meant to be a translucent blue circle turning
 * into an opaque black one.
 *
 * Must run immediately after cloneNode(true) and before anything is removed
 * from the clone, so the two node lists stay index-aligned.
 */
function inlineDynamicColors(liveSvg: SVGSVGElement, clone: SVGSVGElement): void {
  const liveEls = liveSvg.querySelectorAll<SVGElement>("*");
  const cloneEls = clone.querySelectorAll<SVGElement>("*");
  liveEls.forEach((liveEl, i) => {
    const cloneEl = cloneEls[i];
    if (!cloneEl) return;
    (["fill", "stroke"] as const).forEach((prop) => {
      const raw = liveEl.getAttribute(prop);
      if (!raw || (!raw.includes("var(") && raw !== "currentColor")) return;
      const resolved = getComputedStyle(liveEl).getPropertyValue(prop);
      if (resolved) cloneEl.setAttribute(prop, resolved);
    });
  });
}

/**
 * Copies each live `<text>` element's computed font-family onto its
 * (index-aligned) clone counterpart. All the app's on-canvas text — atom
 * labels, charge/stereo labels, isotope prefixes — gets its font purely
 * from the `.atom-label` CSS class, never an inline attribute. That's
 * fine on-screen where the app's stylesheet is loaded, but an exported
 * SVG/PNG is read back as its own standalone document with no access to
 * that stylesheet (a class selector with nothing to match resolves to
 * nothing), so without this every exported label silently fell back to
 * the renderer's default font instead of matching what was drawn on
 * screen. Must run for the same reason and at the same point as
 * inlineDynamicColors — before anything is removed from the clone, so
 * the two node lists stay index-aligned.
 */
function inlineFonts(liveSvg: SVGSVGElement, clone: SVGSVGElement): void {
  const liveTexts = liveSvg.querySelectorAll<SVGTextElement>("text");
  const cloneTexts = clone.querySelectorAll<SVGTextElement>("text");
  liveTexts.forEach((liveEl, i) => {
    const cloneEl = cloneTexts[i];
    if (!cloneEl) return;
    const fontFamily = getComputedStyle(liveEl).fontFamily;
    if (fontFamily) cloneEl.setAttribute("font-family", fontFamily);
  });
}

/**
 * Builds a standalone, tightly-cropped export clone of the canvas SVG: editor-
 * only UI stripped, dynamic colors and fonts resolved, and the viewBox set to
 * the drawing's actual content rather than whatever the on-screen canvas
 * happens to measure.
 *
 * `backgroundColor` of `null` means transparent (no background rect added).
 */
export function buildExportClone(
  svg: SVGSVGElement,
  backgroundColor: string | null
): { clone: SVGSVGElement; bounds: ExportBounds } {
  const clone = prepareExportClone(svg);
  // Measured on the stripped clone, so transient UI still on the live canvas
  // can't inflate the frame — see prepareExportClone's doc comment.
  const box = measureContentBox(clone);
  const bounds = box ? padBounds(box) : { ...EMPTY_BOUNDS };
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  if (backgroundColor) {
    clone.insertAdjacentHTML(
      "afterbegin",
      `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${backgroundColor}"/>`
    );
  }
  return { clone, bounds };
}

export function exportSVG(svg: SVGSVGElement, backgroundColor: string | null, filename = "molecule.svg"): void {
  const { clone, bounds } = buildExportClone(svg, backgroundColor);
  clone.setAttribute("width", String(Math.round(bounds.width)));
  clone.setAttribute("height", String(Math.round(bounds.height)));
  const data = new XMLSerializer().serializeToString(clone);
  downloadBlob(new Blob([data], { type: "image/svg+xml" }), filename);
}

/**
 * Redraws the text from each `.annotation-text` box directly onto the canvas
 * using canvas fillText, word by word. Position for each word is read
 * straight off the live, already-laid-out DOM via Range.getBoundingClientRect
 * (one Range per word), so wrapping, bold/italic, and sub/superscript are all
 * reproduced automatically from whatever the browser actually rendered,
 * without us reimplementing text layout.
 *
 * `getBoundingClientRect()` already reports final, on-page pixels — it
 * accounts for the SVG's own viewBox-to-CSS-size magnification the same way
 * it accounts for any other ancestor transform — so those coordinates need
 * no further scaling and are used as-is. `getComputedStyle().fontSize`,
 * however, reports the font's *local* (un-magnified) used value, the same
 * way it would ignore an ancestor `transform: scale(...)`, so it must be
 * multiplied by `fontScaleFactor` (the SVG's magnification ratio) to match
 * the scale that the positions are already in. Passing the two mismatched —
 * multiplying position by the same factor meant for font size, or leaving
 * font size unscaled — is what previously made annotation text render far
 * too small relative to where it was actually placed.
 */
function drawAnnotationText(ctx: CanvasRenderingContext2D, svg: SVGSVGElement, svgRect: DOMRect, fontScaleFactor: number): void {
  const textBoxes = svg.querySelectorAll<HTMLElement>(".annotation-text");
  textBoxes.forEach((box) => {
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    // eslint-disable-next-line no-cond-assign
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const data = textNode.data;
      const parentEl = textNode.parentElement;
      if (!parentEl || data.length === 0) continue;
      const cs = window.getComputedStyle(parentEl);
      const sizePx = parseFloat(cs.fontSize) || 14;
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const italic = cs.fontStyle === "italic" ? "italic " : "";
      const bold = weight >= 600 ? "bold " : "";
      ctx.font = `${italic}${bold}${sizePx * fontScaleFactor}px ${cs.fontFamily || "sans-serif"}`;
      ctx.fillStyle = cs.color || "#000";
      ctx.textBaseline = "alphabetic";

      let offset = 0;
      for (const token of data.split(/(\s+)/)) {
        const len = token.length;
        if (token.trim().length === 0) { offset += len; continue; }
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + len);
        offset += len;
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const x = rect.left - svgRect.left;
        const baselineY = rect.top - svgRect.top + rect.height * 0.82;
        ctx.fillText(token, x, baselineY);
      }
    }
  });
}

/**
 * Rasterizes just the given atoms/bonds (not the whole canvas) to a PNG
 * blob, for copy-to-clipboard. Unlike exportPNG, this filters the cloned
 * `[data-export-content]` group down to only the matching `data-atom-id`/
 * `data-bond-id` children (everything else, including annotations, is
 * dropped) before measuring bounds, since a selection copy is just the
 * chosen structure fragment.
 */
/**
 * Rasterizes just the given atoms/bonds/annotations (not the whole canvas)
 * to a PNG blob, for copy-to-clipboard. Filters the cloned
 * `[data-export-content]` group down to only matching `data-atom-id`/
 * `data-bond-id`/`data-annotation-id` children before measuring bounds,
 * since a selection copy is just the chosen fragment, not the full drawing.
 *
 * Mirrors exportPNG's two-clone approach (a foreignObject-intact clone for
 * measuring text, a foreignObject-stripped clone for rasterizing) since a
 * selection can include a text annotation just as easily as the full canvas.
 */
export function exportSelectionPNGBlob(
  svg: SVGSVGElement,
  atomIds: Set<string>,
  bondIds: Set<string>,
  annotationIds: Set<string>,
  backgroundColor: string | null = null,
  pixelsPerUnit = PIXELS_PER_UNIT
): Promise<Blob | null> {
  const measureSvg = prepareExportClone(svg);

  const content = measureSvg.querySelector("[data-export-content]");
  if (content) {
    Array.from(content.children).forEach((child) => {
      const atomId = child.getAttribute("data-atom-id");
      const bondId = child.getAttribute("data-bond-id");
      const annotationId = child.getAttribute("data-annotation-id");
      const keep =
        (atomId !== null && atomIds.has(atomId)) ||
        (bondId !== null && bondIds.has(bondId)) ||
        (annotationId !== null && annotationIds.has(annotationId));
      if (!keep) child.remove();
    });
  }

  // Measured only after the selection filter above, so the frame is derived
  // from the fragment being copied and nothing else — the same reason
  // prepareExportClone measures a stripped clone.
  const box = measureContentBox(measureSvg);
  const bounds = box ? padBounds(box) : { ...EMPTY_BOUNDS };

  const rawWidth = Math.max(1, Math.round(bounds.width * pixelsPerUnit));
  const rawHeight = Math.max(1, Math.round(bounds.height * pixelsPerUnit));
  const scaleDown = Math.min(1, MAX_RASTER_DIMENSION / rawWidth, MAX_RASTER_DIMENSION / rawHeight);
  const finalWidth = Math.max(1, Math.round(rawWidth * scaleDown));
  const finalHeight = Math.max(1, Math.round(rawHeight * scaleDown));

  // Resize measureSvg (still attached) to the export's final pixel size so
  // annotation-text layout/measurement below reflects the export's own
  // coordinate space, matching exportPNG's approach.
  measureSvg.setAttribute("width", String(bounds.width));
  measureSvg.setAttribute("height", String(bounds.height));
  measureSvg.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  measureSvg.style.width = `${finalWidth}px`;
  measureSvg.style.height = `${finalHeight}px`;
  measureSvg.style.pointerEvents = "none";
  if (backgroundColor) {
    measureSvg.insertAdjacentHTML(
      "afterbegin",
      `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${backgroundColor}"/>`
    );
  }

  // Second clone used only for rasterizing the vector artwork — Chromium
  // taints the destination canvas if the source image contains ANY
  // foreignObject (a copied text annotation), even an empty one, so those
  // are dropped here and their text redrawn afterwards with real canvas
  // text APIs, measured against the still-attached measureSvg above.
  const rasterSvg = measureSvg.cloneNode(true) as SVGSVGElement;
  rasterSvg.removeAttribute("style");
  rasterSvg.setAttribute("width", String(finalWidth));
  rasterSvg.setAttribute("height", String(finalHeight));
  rasterSvg.querySelectorAll("foreignObject").forEach((fo) => fo.remove());
  const data = new XMLSerializer().serializeToString(rasterSvg);

  const img = new Image();
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const cleanup = () => {
    URL.revokeObjectURL(url);
    measureSvg.remove();
  };

  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // measureSvg's CSS size (finalWidth/finalHeight) is larger than its
      // own viewBox units by this ratio — see drawAnnotationText's doc
      // comment for why that ratio needs to be applied to font size only.
      const textScaleFactor = finalWidth / bounds.width;
      drawAnnotationText(ctx, measureSvg, measureSvg.getBoundingClientRect(), textScaleFactor);
      canvas.toBlob((pngBlob) => {
        cleanup();
        resolve(pngBlob);
      });
    };
    img.onerror = () => {
      cleanup();
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Core rasterization shared by exportPNG (downloads the result) and
 * exportPNGBlob (hands back the Blob instead — used for the version-history
 * panel's checkpoint thumbnails, which obviously shouldn't trigger a file
 * download every time one's generated). See exportPNG's original doc
 * comments below for why the foreignObject-stripping/two-clone approach is
 * necessary; this function is exactly that logic, just returning instead of
 * downloading.
 *
 * `maxDimension` overrides MAX_RASTER_DIMENSION's ceiling — the version-
 * history thumbnail call site passes a much smaller one, since a checkpoint
 * preview has no reason to rasterize at full export resolution.
 */
function renderPNGBlob(
  svg: SVGSVGElement,
  backgroundColor: string | null,
  pixelsPerUnit: number,
  maxDimension = MAX_RASTER_DIMENSION
): Promise<Blob | null> {
  const { clone: measureSvg, bounds } = buildExportClone(svg, backgroundColor);

  const rawWidth = Math.max(1, Math.round(bounds.width * pixelsPerUnit));
  const rawHeight = Math.max(1, Math.round(bounds.height * pixelsPerUnit));
  const scaleDown = Math.min(1, maxDimension / rawWidth, maxDimension / rawHeight);
  const finalWidth = Math.max(1, Math.round(rawWidth * scaleDown));
  const finalHeight = Math.max(1, Math.round(rawHeight * scaleDown));

  // Attach the (foreignObject-intact) clone off-screen, sized to the exact
  // final export resolution, so `.annotation-text` layout/measurement below
  // reflects the export's own coordinate space rather than whatever the
  // visible, possibly panned/zoomed canvas currently shows.
  measureSvg.setAttribute("width", String(bounds.width));
  measureSvg.setAttribute("height", String(bounds.height));
  measureSvg.style.position = "fixed";
  measureSvg.style.left = "-99999px";
  measureSvg.style.top = "0";
  measureSvg.style.width = `${finalWidth}px`;
  measureSvg.style.height = `${finalHeight}px`;
  measureSvg.style.pointerEvents = "none";
  document.body.appendChild(measureSvg);

  // Chromium taints the whole destination canvas if the source image is an
  // SVG containing ANY <foreignObject> (our text annotations), even empty
  // ones — regardless of same-origin blob URLs. There's no way around that
  // for a canvas-based raster export, so we drop them from a separate copy
  // used only for rasterizing the vector artwork, and redraw their text
  // afterwards with real canvas text APIs (see drawAnnotationText above),
  // measured against the still-attached, foreignObject-intact `measureSvg`.
  const rasterSvg = measureSvg.cloneNode(true) as SVGSVGElement;
  // measureSvg's inline style (position/left/top/pointer-events, used only to
  // keep it out of view while attached for text measurement) would otherwise
  // get serialized right along with it — strip it so the image used for
  // rasterization carries no positioning baggage, just its width/height/viewBox.
  rasterSvg.removeAttribute("style");
  rasterSvg.setAttribute("width", String(finalWidth));
  rasterSvg.setAttribute("height", String(finalHeight));
  rasterSvg.querySelectorAll("foreignObject").forEach((fo) => fo.remove());
  const data = new XMLSerializer().serializeToString(rasterSvg);

  const img = new Image();
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const cleanup = () => {
    URL.revokeObjectURL(url);
    measureSvg.remove();
  };

  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // See drawAnnotationText's doc comment: font size (unlike position) needs
      // to be scaled up by measureSvg's magnification ratio to match.
      const textScaleFactor = finalWidth / bounds.width;
      drawAnnotationText(ctx, measureSvg, measureSvg.getBoundingClientRect(), textScaleFactor);
      canvas.toBlob((pngBlob) => {
        cleanup();
        resolve(pngBlob);
      });
    };
    img.onerror = () => {
      cleanup();
      resolve(null);
    };
    img.src = url;
  });
}

export function exportPNG(
  svg: SVGSVGElement,
  backgroundColor: string | null,
  filename = "molecule.png",
  pixelsPerUnit = PIXELS_PER_UNIT
): void {
  renderPNGBlob(svg, backgroundColor, pixelsPerUnit).then((blob) => {
    if (blob) downloadBlob(blob, filename);
  });
}

/** Same rasterization as exportPNG, without the download — the caller gets
 * the Blob directly. See renderPNGBlob's doc comment for why this exists
 * (checkpoint thumbnails). */
export function exportPNGBlob(
  svg: SVGSVGElement,
  backgroundColor: string | null,
  pixelsPerUnit = PIXELS_PER_UNIT,
  maxDimension = MAX_RASTER_DIMENSION
): Promise<Blob | null> {
  return renderPNGBlob(svg, backgroundColor, pixelsPerUnit, maxDimension);
}
