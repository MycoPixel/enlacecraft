import { LIMITS } from "./validate";

/**
 * CDXML-in-SVG metadata round-trip.
 *
 * An exported SVG carries the drawing's CDXML inside a `<metadata>` block,
 * so the file that lands in Inkscape/Illustrator (or any text editor) still
 * *is* the editable chemistry — re-importing it here (or pasting an SVG
 * copied from here) rebuilds the live structure instead of a dead picture.
 * No new format is invented: the SVG stays a perfectly ordinary SVG, the
 * metadata is inert to every other consumer, and CDXML remains the one
 * interchange chemistry format this app already reads and writes.
 *
 * Embedding uses a `data-format` attribute so future formats can ride the
 * same block, and the payload is XML-escaped like any other text node —
 * a CDXML string can never break out of the metadata element.
 *
 * On read, untrusted SVG is parsed with DOMParser (never innerHTML — no
 * script execution, no resource loads) and the extracted CDXML is handed
 * to the same sanitizing importer as a .cdxml file. The block size is
 * capped at the file-import limit before parsing, so a hostile megabyte
 * of "metadata" is rejected before it costs a parse.
 */

/** The `data-format` value identifying an embedded CDXML payload. */
export const SVG_METADATA_CDXML = "chemical/x-cdxml";

const MAX_METADATA_CHARS = LIMITS.maxFileChars;

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Injects (or replaces) the CDXML metadata block just before the SVG root's
 * close tag. Accepts and returns the full serialized SVG text. If the root
 * element isn't an `<svg ...>...</svg>` document the payload is returned
 * unchanged — an unparseable SVG has no business gaining metadata.
 */
export function embedCdxmlInSvg(svgText: string, cdxml: string): string {
  if (!cdxml || cdxml.length > MAX_METADATA_CHARS) return svgText;
  const closeIndex = svgText.lastIndexOf("</svg>");
  if (closeIndex === -1) return svgText;
  // Drop any block from a previous embed first — re-exporting an SVG that
  // was itself imported (metadata and all) must not stack up stale copies
  // of the payload. Non-greedy through the payload, which contains no
  // "</metadata>" of its own because XML escaping turned every '<' into
  // "&lt;" on write.
  const stripped = svgText.replace(
    /<metadata data-format="chemical\/x-cdxml">[\s\S]*?<\/metadata>/g,
    "",
  );
  const block = `<metadata data-format="${SVG_METADATA_CDXML}">${escapeXmlText(cdxml)}</metadata>`;
  const strippedClose = stripped.lastIndexOf("</svg>");
  if (strippedClose === -1) return svgText;
  return `${stripped.slice(0, strippedClose)}${block}${stripped.slice(strippedClose)}`;
}

/**
 * Extracts the CDXML payload from an SVG's metadata block, or null when the
 * SVG carries none (an ordinary SVG from anywhere else) or when the block is
 * too large to trust. Parsing is DOMParser-based and therefore never
 * executes anything; a malformed SVG simply yields null.
 */
export function extractCdxmlFromSvg(svgText: string): string | null {
  if (!svgText || svgText.length > MAX_METADATA_CHARS) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  for (const meta of Array.from(doc.getElementsByTagName("metadata"))) {
    if (meta.getAttribute("data-format") !== SVG_METADATA_CDXML) continue;
    // textContent is already entity-decoded by the XML parser (the payload
    // was escaped exactly once on write), so no second unescape happens
    // here — a CDXML attribute legitimately containing "&amp;" must survive
    // the round-trip byte-faithfully.
    const cdxml = (meta.textContent ?? "").trim();
    if (cdxml.length === 0 || cdxml.length > MAX_METADATA_CHARS) continue;
    // Sanity check that the payload actually looks like CDXML before
    // callers spend a parse on it — the metadata element could contain
    // anything, and this file's escaping round-trips are not proof the
    // *content* was written by us.
    if (cdxml.startsWith("<?xml") || /<CDXML[\s>]/.test(cdxml)) return cdxml;
  }
  return null;
}
