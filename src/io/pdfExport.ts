import { buildExportClone, type ExportBounds } from "./exportImage";
import { computePagePlacement } from "../model/pageSetup";
import type { PageSetup } from "../types/chemistry";

const SVG_NS = "http://www.w3.org/2000/svg";

interface TextPiece {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  fill: string;
}

/**
 * `svg2pdf.js` cannot render SVG `<foreignObject>` content, but that is how
 * every reaction-condition/annotation text box is drawn on the canvas. Left
 * alone, a PDF would show arrows and structures with blank gaps where the
 * conditions should be.
 *
 * This rewrites each annotation box as ordinary SVG `<text>` elements. Word
 * positions are measured from the browser's actual layout (one Range per
 * word, exactly like the PNG path's drawAnnotationText), so wrapping, bold/
 * italic runs, superscripts and the box's own font size all come across
 * without reimplementing text layout. Measuring is done on a temporary
 * off-screen copy at 1:1 with the export's viewBox, then the copy is removed
 * before serialization/rendering.
 *
 * If layout is unavailable (or every word measures as zero, as in jsdom), a
 * single plain-text fallback line is emitted rather than dropping the
 * annotation entirely.
 */
export function foreignObjectsToSvgText(root: SVGSVGElement, bounds: ExportBounds): void {
  const foreignObjects = Array.from(root.querySelectorAll("foreignObject"));
  if (foreignObjects.length === 0) return;

  const wasAttached = root.isConnected;
  const previousStyle = root.getAttribute("style");
  if (!wasAttached) {
    root.setAttribute("width", String(bounds.width));
    root.setAttribute("height", String(bounds.height));
    root.style.position = "fixed";
    root.style.left = "-99999px";
    root.style.top = "0";
    root.style.width = `${bounds.width}px`;
    root.style.height = `${bounds.height}px`;
    root.style.pointerEvents = "none";
    document.body.appendChild(root);
  }

  const svgRect = root.getBoundingClientRect();
  const measureScale = svgRect.width > 0 ? bounds.width / svgRect.width : 1;

  try {
    for (const fo of foreignObjects) {
      const box = fo.querySelector<HTMLElement>(".annotation-text");
      const pieces: TextPiece[] = [];

      if (box) {
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        // eslint-disable-next-line no-cond-assign
        while ((node = walker.nextNode())) {
          const textNode = node as Text;
          const data = textNode.data;
          if (!data.trim() || !textNode.parentElement) continue;
          const style = window.getComputedStyle(textNode.parentElement);
          const fontFamily = style.fontFamily || "sans-serif";
          const fontSize = (parseFloat(style.fontSize) || 14) * measureScale;
          const fontWeight = style.fontWeight || "400";
          const fontStyle = style.fontStyle || "normal";
          const fill = style.color || "#000000";

          let offset = 0;
          for (const token of data.split(/(\s+)/)) {
            const length = token.length;
            if (token.trim().length === 0) {
              offset += length;
              continue;
            }
            const range = document.createRange();
            range.setStart(textNode, offset);
            range.setEnd(textNode, offset + length);
            offset += length;
            // Range.getBoundingClientRect is a browser layout API; some
            // embedded environments (and jsdom) do not implement it. Treat
            // that exactly like a zero-sized measure and use the fallback
            // below, rather than throwing away the whole annotation.
            if (typeof range.getBoundingClientRect !== "function") continue;
            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            pieces.push({
              text: token,
              x: bounds.x + (rect.left - svgRect.left) * measureScale,
              y:
                bounds.y +
                (rect.top - svgRect.top) * measureScale +
                rect.height * measureScale * 0.82,
              fontSize,
              fontFamily,
              fontWeight,
              fontStyle,
              fill,
            });
          }
        }
      }

      // No measurable layout (or an empty box): keep the text, even if its
      // exact position has to be approximated from the foreignObject itself.
      if (pieces.length === 0) {
        const fallback = box?.textContent?.trim();
        if (fallback) {
          const style = box ? window.getComputedStyle(box) : null;
          const fontSize = (parseFloat(style?.fontSize ?? "") || 14) * measureScale;
          pieces.push({
            text: fallback,
            x: parseFloat(fo.getAttribute("x") ?? "0") + 5,
            y: parseFloat(fo.getAttribute("y") ?? "0") + fontSize + 3,
            fontSize,
            fontFamily: style?.fontFamily || "sans-serif",
            fontWeight: style?.fontWeight || "400",
            fontStyle: style?.fontStyle || "normal",
            fill: style?.color || "#000000",
          });
        }
      }

      if (pieces.length === 0) {
        fo.remove();
        continue;
      }

      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("data-pdf-annotation", "true");
      for (const piece of pieces) {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", piece.x.toFixed(3));
        text.setAttribute("y", piece.y.toFixed(3));
        text.setAttribute("font-size", piece.fontSize.toFixed(3));
        text.setAttribute("font-family", piece.fontFamily);
        text.setAttribute("font-weight", piece.fontWeight);
        text.setAttribute("font-style", piece.fontStyle);
        text.setAttribute("fill", piece.fill);
        text.textContent = piece.text;
        group.appendChild(text);
      }
      fo.replaceWith(group);
    }
  } finally {
    if (!wasAttached) {
      root.remove();
      if (previousStyle !== null) root.setAttribute("style", previousStyle);
      else root.removeAttribute("style");
    }
  }
}

/**
 * Exports the current drawing as a real PDF file on the active tab's page
 * setup, rather than relying on the browser/OS print dialog.
 *
 * The clone is built before the dynamic imports resolve: selection clearing
 * in the caller's `withDeselected` is synchronous, so the PDF must capture
 * the deselected drawing before the first `await` yields control.
 *
 * jsPDF and svg2pdf.js are imported lazily so their combined size stays out
 * of the main bundle for everyone who never exports a PDF.
 */
export async function exportPDF(
  svg: SVGSVGElement,
  backgroundColor: string | null,
  page: PageSetup,
  filename = "molecule.pdf",
  title?: string
): Promise<void> {
  const { clone, bounds } = buildExportClone(svg, backgroundColor);
  const placement = computePagePlacement(bounds.width, bounds.height, page);

  foreignObjectsToSvgText(clone, bounds);

  clone.setAttribute("width", String(bounds.width));
  clone.setAttribute("height", String(bounds.height));

  const [{ jsPDF }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);

  const orientation = placement.pageWidthPt > placement.pageHeightPt ? "landscape" : "portrait";
  const doc = new jsPDF({
    unit: "pt",
    orientation,
    format: [placement.pageWidthPt, placement.pageHeightPt],
    compress: true,
  });
  if (title) doc.setProperties({ title });

  await doc.svg(clone, {
    x: placement.xPt,
    y: placement.yPt,
    width: placement.widthPt,
    height: placement.heightPt,
  });

  doc.save(filename);
}

/** Re-exported so the export menu and print path can share one page model. */
export { computePagePlacement };
