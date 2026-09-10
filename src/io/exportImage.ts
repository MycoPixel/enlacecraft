export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const EXPORT_PADDING_MIN = 24;
const EXPORT_PADDING_RATIO = 0.18;
/** World units to raster pixels. Fixed, so export quality never depends on
 * the current on-screen zoom level (a molecule zoomed out to look tiny on
 * screen still exports at full resolution). */
const PIXELS_PER_UNIT = 8;
/** Hard ceiling on raster dimensions so a very spread-out drawing can't blow
 * past browser canvas size limits. */
const MAX_RASTER_DIMENSION = 8000;

export interface ExportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tight bounding box of the actual drawing (atoms, bonds, annotations) in
 * molecule-space, read straight off the live `[data-export-content]` group.
 * Because that group carries the pan/zoom transform rather than being
 * affected by it, this box is the same regardless of how far the user has
 * panned or zoomed the canvas — which is what lets export crop closely
 * around a small molecule sitting in a huge canvas instead of exporting
 * whatever empty region the viewport currently shows.
 */
function getExportBounds(svg: SVGSVGElement): ExportBounds {
  const content = svg.querySelector<SVGGraphicsElement>("[data-export-content]");
  let box: { x: number; y: number; width: number; height: number } | null = null;
  if (content) {
    try {
      const b = content.getBBox();
      if (b.width > 0 || b.height > 0) box = b;
    } catch {
      // getBBox can throw if the element isn't rendered; fall through.
    }
  }
  if (!box) {
    // Nothing drawn yet — export a small fixed square rather than the
    // enormous offscreen background rect.
    return { x: -90, y: -90, width: 180, height: 180 };
  }
  const padding = Math.max(EXPORT_PADDING_MIN, Math.max(box.width, box.height) * EXPORT_PADDING_RATIO);
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
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
 * Builds a standalone, tightly-cropped export clone of the canvas SVG:
 * dynamic colors resolved to literal values, editor-only UI stripped (grid
 * background, selection highlights, hover previews, marquee — anything
 * marked data-export-exclude), and the viewBox set to the molecule's actual
 * content instead of whatever the on-screen canvas happens to measure.
 *
 * `backgroundColor` of `null` means transparent (no background rect added).
 */
export function buildExportClone(
  svg: SVGSVGElement,
  backgroundColor: string | null
): { clone: SVGSVGElement; bounds: ExportBounds } {
  const bounds = getExportBounds(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineDynamicColors(svg, clone);
  inlineFonts(svg, clone);
  clone.querySelectorAll("[data-export-exclude]").forEach((el) => el.remove());
  // The bounding box above is measured in the molecule's own untransformed
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
  const measureSvg = svg.cloneNode(true) as SVGSVGElement;
  inlineDynamicColors(svg, measureSvg);
  inlineFonts(svg, measureSvg);
  measureSvg.querySelectorAll("[data-export-exclude]").forEach((el) => el.remove());
  measureSvg.querySelectorAll("[data-export-viewport]").forEach((el) => el.removeAttribute("transform"));
  measureSvg.removeAttribute("style");
  measureSvg.removeAttribute("class");
  measureSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

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

  // Attach off-screen at a generous fixed viewBox so the filtered content's
  // true rendered extent (label text, wedge widths, annotation boxes, etc.)
  // can be measured with getBBox — the same technique buildExportClone's
  // caller relies on, just applied to this filtered subset.
  measureSvg.setAttribute("width", "2000");
  measureSvg.setAttribute("height", "2000");
  measureSvg.setAttribute("viewBox", "-1000 -1000 2000 2000");
  measureSvg.style.position = "fixed";
  measureSvg.style.left = "-99999px";
  measureSvg.style.top = "0";
  document.body.appendChild(measureSvg);

  let bounds: ExportBounds;
  try {
    const box = content ? (content as SVGGraphicsElement).getBBox() : null;
    if (box && (box.width > 0 || box.height > 0)) {
      const padding = Math.max(EXPORT_PADDING_MIN, Math.max(box.width, box.height) * EXPORT_PADDING_RATIO);
      bounds = { x: box.x - padding, y: box.y - padding, width: box.width + padding * 2, height: box.height + padding * 2 };
    } else {
      bounds = { x: -90, y: -90, width: 180, height: 180 };
    }
  } catch {
    bounds = { x: -90, y: -90, width: 180, height: 180 };
  }

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
