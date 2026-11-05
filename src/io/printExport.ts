import { buildExportClone } from "./exportImage";
import { computePagePlacement } from "../model/pageSetup";
import type { PageSetup } from "../types/chemistry";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Prints the current drawing (or hands it to the OS "Save as PDF" printer,
 * which is what this doubles as — there's no separate PDF code path,
 * because every desktop OS's print dialog already includes one). Reuses
 * buildExportClone so the printed page matches exportPNG/exportSVG exactly:
 * same tight crop, same inlined colors/fonts, same stripped editor-only
 * chrome (grid, selection highlights, marquee).
 *
 * Implementation: writes the cropped SVG into a hidden same-page iframe and
 * calls print() on *that* window, rather than the app's own — printing the
 * app's own window would print the whole UI (sidebar, top bar, whatever
 * panel happens to be open), and a hidden iframe avoids the popup-blocker
 * issues a new `window.open()` tab would risk. Only the iframe's isolated
 * document (which contains nothing but this one drawing) goes to the
 * printer/PDF.
 *
 * `window.print()` is synchronous/blocking in Chromium (which both the
 * Electron app and any Chromium-based browser install of the PWA use) —
 * script execution pauses for as long as the native print dialog is open,
 * so cleanup scheduled immediately after the call only actually runs once
 * the user closes that dialog. `onafterprint` is wired too, belt-and-
 * suspenders, in case that assumption ever doesn't hold in some
 * environment.
 */
export function printMolecule(
  svg: SVGSVGElement,
  backgroundColor: string | null,
  title: string,
  page?: PageSetup
): void {
  const { clone, bounds } = buildExportClone(svg, backgroundColor);
  const placement = page ? computePagePlacement(bounds.width, bounds.height, page) : null;

  if (placement) {
    // Exact physical page: the preset page size becomes @page's size with no
    // printer margin, and the drawing is placed at the same centred box the
    // direct PDF export uses. This is what makes "print to PDF" match
    // "Export PDF" rather than merely being roughly similar.
    clone.setAttribute("width", `${placement.widthPt}pt`);
    clone.setAttribute("height", `${placement.heightPt}pt`);
  } else {
    clone.setAttribute("width", "100%");
    clone.setAttribute("height", "100%");
  }
  const svgMarkup = new XMLSerializer().serializeToString(clone);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const cleanup = () => iframe.remove();
  // Fallback in case afterprint never fires (e.g. the user's OS/browser
  // combination doesn't support it, or the dialog is dismissed in a way
  // that skips it) — generous enough to never cut off an in-progress
  // print, since by the time this fires window.print() has long since
  // returned either way.
  const fallbackCleanup = window.setTimeout(cleanup, 5 * 60 * 1000);

  const doc = iframe.contentDocument;
  if (!doc) {
    cleanup();
    return;
  }
  doc.open();
  // Aspect ratio comes from the SVG's own viewBox (set by
  // buildExportClone to the drawing's bounds), not hardcoded — a wide
  // reaction scheme and a tall single molecule should each fill the page
  // width appropriately rather than one of them being squeezed or
  // leaving most of the page blank.
  //
  // With a publication preset, the page itself is physical: @page gets the
  // preset's exact size and no printer margin, and the SVG is absolutely
  // positioned at the same centred box computePublicationPlacement gives the
  // PDF exporter. Without one, the original "fill the printable width"
  // layout is kept for a quick print.
  const pageCss = placement
    ? `@page { size: ${placement.pageWidthPt}pt ${placement.pageHeightPt}pt; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${placement.pageWidthPt}pt; height: ${placement.pageHeightPt}pt; }
  body { position: relative; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  .print-svg-wrap { position: absolute; left: ${placement.xPt}pt; top: ${placement.yPt}pt; width: ${placement.widthPt}pt; height: ${placement.heightPt}pt; }`
    : `@page { margin: 16mm; }
  html, body { margin: 0; padding: 0; }
  body { display: flex; flex-direction: column; align-items: center; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  h1 { font-size: 13px; font-weight: 600; color: #444; margin: 0 0 10mm; align-self: flex-start; }
  .print-svg-wrap { width: 100%; aspect-ratio: ${bounds.width} / ${bounds.height}; max-height: 250mm; }`;
  const titleHtml = !placement && title ? `<h1>${escapeHtml(title)}</h1>` : "";
  doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  ${pageCss}
</style>
</head>
<body>
${titleHtml}
<div class="print-svg-wrap">${svgMarkup}</div>
</body>
</html>`);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    cleanup();
    return;
  }
  win.onafterprint = () => {
    window.clearTimeout(fallbackCleanup);
    cleanup();
  };
  // Inline SVG markup needs no async asset loading, but a rAF still lets
  // the iframe complete one layout/paint pass first — printing on the
  // same tick as document.write() has produced a blank page in some
  // Chromium versions.
  requestAnimationFrame(() => {
    win.focus();
    win.print();
  });
}
