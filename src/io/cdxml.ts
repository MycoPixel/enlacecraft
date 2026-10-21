import type {
  Annotation,
  ArrowAnnotation,
  BondOrder,
  BondStereo,
  BracketAnnotation,
  Element as ChemElement,
  Molecule,
  ShapeAnnotation,
  TextAnnotation,
} from "../types/chemistry";
import { emptyMolecule } from "../model/molecule";
import { BOND_LEN, PERIODIC_TABLE } from "../model/constants";
import { calibrateImportScale } from "./importScale";
import { nextId } from "../model/id";
import { LIMITS, finalizeImportedMolecule } from "./validate";
import { sanitizeAnnotationList } from "./sanitizeHtml";

/**
 * CDXML (ChemDraw's XML interchange format) reader/writer.
 *
 * ChemDraw's *native* file format is `.cdx`, a proprietary, undocumented
 * binary tag format — there's no public specification to implement it
 * against, so writing a `.cdx` encoder/decoder here would be guessing at a
 * byte layout with no way to verify it against real ChemDraw. `.cdxml` is
 * the format ChemDraw itself uses whenever it needs a documented, portable
 * representation of the same document: File > Open in ChemDraw accepts it
 * exactly like a `.cdx`, and it's the format ChemDraw's own "Save As" offers
 * alongside `.cdx`. Other cheminformatics tools (RDKit, OpenBabel, etc.)
 * that claim "ChemDraw support" are, in practice, reading/writing this same
 * XML format rather than the binary one. So `.cdxml` is what actually gets
 * you real ChemDraw interop here.
 *
 * Supports: atoms (element, position, charge), bonds (order, wedge/hash/wavy
 * plus the emphasis styles Bold and Dash), and — alongside the molecule —
 * this app's annotation layer: reaction and mechanism arrows (straight,
 * equilibrium, resonance, retrosynthetic, curved arcs with full or fishhook
 * heads), caption text (bold/italic/underline/sub/superscript plus inline
 * font-size and color runs), square/curly brackets, and the plain graphics
 * primitives (rectangles, ovals, headless lines — imported as this app's
 * shape annotations). See importCdxmlDocument's doc comment for the honest
 * list of approximations the arrow/text mapping makes, and
 * exportCdxmlDocument's for what is deliberately left out of the written
 * file.
 *
 * Does not support: CDX's stereo/query bond types beyond the Display values
 * mapped above (the bold wedged hash has no distinct CDX Display and
 * degrades to the ordinary wedged hash on export), dashed arrow shafts (no
 * portable CDX representation this writer can verify — app-only), CDX's
 * scheme/reaction-step *bookkeeping* (the arrows themselves import fine;
 * the grouping metadata around them is dropped), multi-fragment layout,
 * CDX's "nickname" node schema for abbreviated groups ("Boc", "Ph", ...
 * export as a plain carbon — CDX has its own nickname schema, but without a
 * confirmed spec to validate against, guessing at it risks writing a file
 * ChemDraw can't open, which is worse than the label simply not surviving
 * the round trip; MOL export (molfile.ts) preserves the label instead, via
 * the well-established convention of writing the abbreviation directly as
 * the atom symbol), and the annotation kinds CDXML has no concept of at all
 * (orbital glyphs, TLC plates — this app-only, preserved by the project
 * format).
 */

/** Atomic number <-> element symbol, derived from the full PERIODIC_TABLE
 * (model/constants.ts) rather than hand-listed here. */
const ATOMIC_NUMBER_TO_ELEMENT: Record<number, ChemElement> = Object.fromEntries(
  PERIODIC_TABLE.map((e) => [e.number, e.symbol])
);
const ELEMENT_TO_ATOMIC_NUMBER: Record<ChemElement, number> = Object.fromEntries(
  PERIODIC_TABLE.map((e) => [e.symbol, e.number])
) as Record<ChemElement, number>;

/**
 * CDXML mixes two unit systems: every *coordinate* is in drawing units
 * (anchored by the BondLength attribute's conventional value of 30), while
 * font `size` attributes are in *points*. The bridge between them is
 * ChemDraw's page convention: drawing coordinates behave as 1/100 inch per
 * unit (a default-length bond = 0.3 inch), and 1 pt = 1/72 inch, so
 * 1 pt = 100/72 ≈ 1.39 drawing units. That ratio is what makes a 10 pt
 * caption occupy the same proportion of a default bond length in this app
 * as it does in ChemDraw's own rendering.
 *
 * Notably, this constant drops out of any round trip through THIS app
 * entirely: export converts px → units → pt and import runs the exact
 * inverse chain, so a 14 px caption saved and reopened comes back 14 px
 * whatever the absolute convention turns out to be. It only affects how a
 * caption's size compares to bond lengths when the file is opened in
 * ChemDraw itself (or vice versa) — which is exactly what this constant is
 * for.
 */
const UNITS_PER_POINT = 100 / 72;

/** CDX arrowhead classes, collapsed to what this app's annotation model
 * can express. CDX names far more variants (FullHead, FullHalfHead,
 * DoubleHead, ConcaveHalfHead, RetroSynthetic, ...) than the three-way
 * none/half/full distinction the renderer needs: "half" is the single-barb
 * harpoon (a fishhook when curved, one half of an equilibrium pair when
 * straight), "full" is any solid two-barb head. Unknown values that at
 * least contain "Head" (or name the retrosynthetic arrow) are treated as
 * full — a generic solid arrowhead is closer to what the author drew than
 * dropping the arrow outright. */
type CdxHeadClass = "none" | "half" | "full";

function cdxHeadClass(raw: string | null): CdxHeadClass {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || v === "nohead" || v === "none") return "none";
  if (v === "halfhead") return "half";
  if (v.includes("head") || v.includes("retro")) return "full";
  return "none";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A parsed style run of an exported <t> caption: one contiguous stretch
 * of characters sharing the same face bits / size / color. */
interface CdxTextRun {
  text: string;
  /** CDX face bitmask: 1 = bold, 2 = italic, 4 = underline, 32 = subscript,
   * 64 = superscript. */
  face: number;
  /** Effective run size in points (already converted from the annotation's
   * px fontSize), or null to omit the size attribute entirely. */
  sizePt: number | null;
  /** Index into the file's colortable, or null for plain black. */
  colorIdx: number | null;
}

/** Face bit values of the <s> style runs of a <t> caption, as CDX defines
 * them (kCDXFace_*). Only the five bits this app's own toolbar can produce
 * are consumed; outlined/shadow etc. are dropped on import — a caption that
 * loses its shadow still says exactly what it said. */
const FACE_BOLD = 1;
const FACE_ITALIC = 2;
const FACE_UNDERLINE = 4;
const FACE_SUBSCRIPT = 32;
const FACE_SUPERSCRIPT = 64;

/**
 * Parses an annotation's (already-sanitized, app-produced) HTML into CDX
 * style runs for the <t> element's <s> children. The HTML is the small
 * subset the annotation toolbar writes (b/i/sub/sup, br, div, span with
 * inline font-size/color — see sanitizeHtml.ts's ALLOWED_TAGS), walked with
 * the DOM so the mapping can't be thrown off by attribute order or nesting
 * depth. Line boundaries (<br>, and <div> boundaries the way
 * contentEditable produces them) become literal \n characters, which is
 * how CDX itself represents multi-line captions inside one <t>.
 */
function htmlToTextRuns(html: string, baseFontSizePx: number, scale: number): CdxTextRun[] {
  const runs: CdxTextRun[] = [];
  const doc = new DOMParser().parseFromString(html, "text/html");

  const pxToPt = (px: number): number => (px * scale * 72) / 100;

  // Inline style state carried down the walk; a run is emitted whenever a
  // text node is reached with the style in effect there.
  interface Style {
    face: number;
    sizePx: number | null;
    color: string | null;
  }

  const pushText = (text: string, style: Style) => {
    if (!text) return;
    const sizePt = style.sizePx != null ? pxToPt(style.sizePx) : pxToPt(baseFontSizePx);
    let colorIdx: number | null = null;
    if (style.color) {
      colorIdx = colorPaletteIndex(style.color);
    }
    const last = runs[runs.length - 1];
    // Merge with the previous run when the style is identical — toolbar
    // markup often nests (b > span) without changing the effective style.
    if (last && last.face === style.face && last.sizePt != null && Math.abs(last.sizePt - sizePt) < 0.05 && last.colorIdx === colorIdx) {
      last.text += text;
      return;
    }
    runs.push({ text, face: style.face, sizePt, colorIdx });
  };

  const walk = (node: Node, style: Style, isFirstInParent: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.nodeValue ?? "", style);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    switch (el.tagName.toLowerCase()) {
      case "br":
        pushText("\n", style);
        return;
      case "div": {
        // contentEditable wraps each typed line in a <div>; a div that
        // isn't the first thing in its parent starts a new line.
        if (!isFirstInParent) pushText("\n", style);
        el.childNodes.forEach((child, i) => walk(child, style, i === 0));
        return;
      }
      case "b":
      case "strong":
        el.childNodes.forEach((child, i) => walk(child, { ...style, face: style.face | FACE_BOLD }, i === 0));
        return;
      case "i":
      case "em":
        el.childNodes.forEach((child, i) => walk(child, { ...style, face: style.face | FACE_ITALIC }, i === 0));
        return;
      case "u":
        el.childNodes.forEach((child, i) => walk(child, { ...style, face: style.face | FACE_UNDERLINE }, i === 0));
        return;
      case "sub":
        el.childNodes.forEach((child, i) => walk(child, { ...style, face: style.face | FACE_SUBSCRIPT }, i === 0));
        return;
      case "sup":
        el.childNodes.forEach((child, i) => walk(child, { ...style, face: style.face | FACE_SUPERSCRIPT }, i === 0));
        return;
      case "span": {
        const next: Style = { ...style };
        const fontSize = parseCssLength(el.getAttribute("style"), "font-size");
        if (fontSize != null) next.sizePx = fontSize;
        const color = parseCssColor(el.getAttribute("style"));
        if (color) next.color = color;
        el.childNodes.forEach((child, i) => walk(child, next, i === 0));
        return;
      }
      default:
        // Unknown (future) inline tag: descend transparently rather than
        // dropping its text on the floor.
        el.childNodes.forEach((child, i) => walk(child, style, i === 0));
    }
  };

  const body = doc.body;
  body.childNodes.forEach((child, i) => walk(child, { face: 0, sizePx: null, color: null }, i === 0));
  return runs;
}

/**
 * Finds `property: value` inside a style attribute string and returns the
 * value parsed as a px/pt/em/rem length, converted to px. Only the exact
 * patterns the annotation toolbar emits are matched; anything else returns
 * null and the run simply keeps the annotation's base size.
 */
function parseCssLength(styleAttr: string | null, property: string): number | null {
  if (!styleAttr) return null;
  const m = styleAttr.match(new RegExp(`${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)(px|pt|em|rem)`));
  if (!m) return null;
  const v = parseFloat(m[1]);
  switch (m[2]) {
    case "pt":
      return (v * 96) / 72;
    case "em":
    case "rem":
      return v * 14; // relative to the annotation's 14px base — best effort
    default:
      return v;
  }
}

/** Extracts a color from a style attribute as #rrggbb (lowercase), or null.
 * Only #hex and rgb() — the forms sanitizeHtml's SAFE_STYLE_DECLARATION
 * lets through — are understood; named colors are skipped (they'd need a
 * name→rgb table for no real-world benefit: the toolbar's color inputs
 * produce hex). */
function parseCssColor(styleAttr: string | null): string | null {
  if (!styleAttr) return null;
  const hex = styleAttr.match(/color\s*:\s*#([0-9a-fA-F]{3,8})/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (![r, g, b].some(Number.isNaN)) return `#${to2(r)}${to2(g)}${to2(b)}`;
    return null;
  }
  const rgb = styleAttr.match(/color\s*:\s*rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/);
  if (rgb) return `#${to2(+rgb[1])}${to2(+rgb[2])}${to2(+rgb[3])}`;
  return null;
}

function to2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

/** The colortable shared by one exported document. CDX references colors
 * by index; entry 0 is white and entry 1 is black by convention (matching
 * what ChemDraw itself writes), so any non-black text color the annotation
 * toolbar produced gets appended on first use. */
let exportPalette: string[] = [];

function colorPaletteIndex(cssColor: string): number {
  const idx = exportPalette.indexOf(cssColor.toLowerCase());
  if (idx >= 0) return idx;
  exportPalette.push(cssColor.toLowerCase());
  return exportPalette.length - 1;
}

export function exportCdxmlDocument(mol: Molecule, annotations: Annotation[], name = "molecule"): string {
  const atomIds = Object.keys(mol.atoms);
  const bondList = Object.values(mol.bonds);

  // ChemDraw's conventional default bond length is 30 drawing units;
  // scaling our pixel-based canvas onto that convention keeps the geometry
  // (and text/bond proportions ChemDraw derives from BondLength) sane.
  // Unlike MDL molfiles, CDXML's Y axis already increases downward — the
  // same convention this app's canvas uses — so no sign flip is needed here.
  const scale = 30 / BOND_LEN;
  const u = (v: number): string => (v * scale).toFixed(4);

  // Pre-scan text annotations so every color they use is already in the
  // colortable by the time the header is written.
  exportPalette = ["#ffffff", "#000000"];
  for (const ann of annotations) {
    if (ann.kind !== "text") continue;
    const doc = new DOMParser().parseFromString(ann.html, "text/html");
    for (const span of Array.from(doc.querySelectorAll("span"))) {
      const color = parseCssColor(span.getAttribute("style"));
      if (color) colorPaletteIndex(color);
    }
  }

  let out = `<?xml version="1.0" encoding="UTF-8" ?>\n`;
  out += `<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n`;
  out += `<CDXML CreationProgram="EnlaceCraft" Name="${escapeXml(name)}" BondLength="30" LabelFont="3" LabelSize="10" CaptionFont="3" CaptionSize="10" FractionalWidths="yes" InterpretChemically="yes">\n`;
  out += `<colortable>${exportPalette.map((c) => `<color r="${hexToCdxR(c, "r")}" g="${hexToCdxR(c, "g")}" b="${hexToCdxR(c, "b")}"/>`).join("")}</colortable>\n`;
  out += `<fonttable><font id="3" charset="iso-8859-1" name="Arial"/></fonttable>\n`;
  out += `<page>\n<fragment id="${nextId()}">\n`;

  const cdxIdOf: Record<string, string> = {};
  for (const id of atomIds) {
    const a = mol.atoms[id];
    const cdxId = nextId();
    cdxIdOf[id] = cdxId;
    const x = u(a.x);
    const y = u(a.y);
    const atomicNumber = ELEMENT_TO_ATOMIC_NUMBER[a.element] ?? 6;
    let attrs = `id="${cdxId}" p="${x} ${y}"`;
    // Carbon (6) is CDX's implicit default element — omitting the attribute
    // is what ChemDraw itself does for plain skeletal carbons — but writing
    // it explicitly is equally valid and simpler/more robust to round-trip.
    attrs += ` Element="${atomicNumber}"`;
    if (a.charge) attrs += ` Charge="${a.charge}"`;
    out += `<n ${attrs}/>\n`;
  }

  // Dative bonds (see Bond.dative's doc comment) and haptic bonds (see
  // HapticBond's doc comment) are both dropped here rather than written —
  // same choice molfile.ts makes and for the same reason: CDXML's plain
  // Order/Display attributes have no distinct dative-bond representation
  // this writer implements, so writing one out as a normal Order="1" bond
  // would silently relabel an M<-L donor bond as an ordinary covalent
  // bond, which is worse than omitting it. Chemically incomplete on
  // export, but not silently wrong — this app's own project format is
  // still the lossless round-trip for these.
  for (const b of bondList) {
    if (b.dative) continue;
    const bId = cdxIdOf[b.a1];
    const eId = cdxIdOf[b.a2];
    if (!bId || !eId) continue;
    let attrs = `id="${nextId()}" B="${bId}" E="${eId}" Order="${b.order}"`;
    // "Begin"/"End" in CDX's Display value names which node (B or E) is the
    // narrow/pointed end — our model always treats a1 (here, B) as that
    // narrow end (see BondView), so "...Begin" variants match directly.
    // The emphasis styles map onto CDX's own Display vocabulary where one
    // exists (Bold, Dash — the plain non-stereochemical dashed bond); the
    // bold wedged hash has no distinct CDX Display of its own and degrades
    // to the ordinary wedged hash, the same way it degrades in molfile
    // export (molfile.ts) — visible geometry survives, weight doesn't.
    if (b.stereo === "wedge") attrs += ` Display="WedgeBegin"`;
    else if (b.stereo === "dash") attrs += ` Display="WedgedHashBegin"`;
    else if (b.stereo === "boldHash") attrs += ` Display="WedgedHashBegin"`;
    else if (b.stereo === "wavy") attrs += ` Display="Wavy"`;
    else if (b.stereo === "bold") attrs += ` Display="Bold"`;
    else if (b.stereo === "dashed") attrs += ` Display="Dash"`;
    out += `<b ${attrs}/>\n`;
  }

  out += `</fragment>\n`;

  // Arrows, brackets and captions live as siblings of the <fragment>,
  // directly under the <page> — the same placement ChemDraw itself uses
  // for graphics and text that aren't part of a structure.
  //
  // Brackets get a small pre-pass: the app models a bracket pair as two
  // independent glyphs, while ChemDraw's bracket object is one thing
  // spanning the enclosed region. Writing a matched open+close pair as ONE
  // spanning graphic (with y-ranges overlapping and the open glyph to the
  // left of the close one) is what lets the pair's facings survive the
  // round trip — importCdxmlDocument splits spanning graphics back into an
  // open+close pair. Unpaired glyphs go over as the narrow single objects
  // they are; a lone glyph's facing isn't recoverable from the narrow form
  // and re-imports open-facing, the common case for a lone bracket.
  const bracketList = annotations.filter((a): a is BracketAnnotation => a.kind === "bracket");
  const bracketWritten = new Set<string>();
  const closePartnerOf = new Map<string, BracketAnnotation>();
  for (const open of bracketList) {
    if (open.facing !== "open") continue;
    const close = bracketList.find(
      (c) =>
        c.kind === "bracket" && c.id !== open.id && c.facing === "close" &&
        c.x >= open.x + open.width &&
        (Math.min(open.y + open.height, c.y + c.height) - Math.max(open.y, c.y)) >= 0.5 * Math.min(open.height, c.height),
    );
    if (close) closePartnerOf.set(open.id, close);
  }

  for (const ann of annotations) {
    if (ann.kind === "arrow") {
      if (ann.variant === "curved" || ann.variant === "curvedReverse") {
        // Curved (mechanism) arrows are deliberately not exported: CDX's
        // arc graphic geometry (which corner of the bounding box an arc
        // starts from, sweep direction, ...) is part of the undocumented
        // portion of the format, and writing a guessed-at arc risks a file
        // ChemDraw can't open — strictly worse than omitting the arrow,
        // per the same reasoning as the dative-bond note above. Straight
        // arrows, equilibrium pairs and resonance arrows all round-trip.
        continue;
      }
      const x1 = u(ann.x1), y1 = u(ann.y1), x2 = u(ann.x2), y2 = u(ann.y2);
      if (ann.variant === "forward") {
        // The bounding box holds the two endpoints in draw order (tail
        // first, head second) — NOT normalized left-to-right — which is
        // how direction survives the file.
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="FullHalfHead" Tail="None"/>\n`;
      } else if (ann.variant === "resonance") {
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="FullHalfHead" Tail="FullHalfHead"/>\n`;
      } else if (ann.variant === "retrosynthetic") {
        // RetroSynthetic is one of CDX's own head classes (it's in the same
        // family this importer already collapses — see cdxHeadClass), so
        // naming it is naming a real thing, not guessing at geometry.
        // ChemDraw renders it as its retrosynthetic arrow; an old reader
        // that doesn't know the class falls back to a generic head —
        // degraded, but never a file that won't open.
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="RetroSynthetic" Tail="None"/>\n`;
      } else {
        // Equilibrium: CDX has no single-object form this writer can
        // verify, so write what ChemDraw unambiguously renders — two
        // offset harpoons pointing at each other — separated perpendicular
        // to the arrow's direction by a small fixed offset (3 drawing
        // units, ~1/10 of a default bond, matching the visual gap
        // ChemDraw's own equilibrium arrows show).
        const px1 = ann.x1 * scale, py1 = ann.y1 * scale, px2 = ann.x2 * scale, py2 = ann.y2 * scale;
        const len = Math.hypot(px2 - px1, py2 - py1) || 1;
        const nx = -(py2 - py1) / len, ny = (px2 - px1) / len;
        const o = 3;
        out += `<graphic id="${nextId()}" BoundingBox="${f4(px1 + nx * o)} ${f4(py1 + ny * o)} ${f4(px2 + nx * o)} ${f4(py2 + ny * o)}" GraphicType="Line" Head="HalfHead" Tail="None"/>\n`;
        out += `<graphic id="${nextId()}" BoundingBox="${f4(px2 - nx * o)} ${f4(py2 - ny * o)} ${f4(px1 - nx * o)} ${f4(py1 - ny * o)}" GraphicType="Line" Head="HalfHead" Tail="None"/>\n`;
      }
    } else if (ann.kind === "bracket") {
      if (bracketWritten.has(ann.id)) continue;
      const partner = closePartnerOf.get(ann.id);
      if (partner) {
        bracketWritten.add(ann.id);
        bracketWritten.add(partner.id);
        const top = Math.min(ann.y, partner.y);
        const bottom = Math.max(ann.y + ann.height, partner.y + partner.height);
        // CDX has exactly two bracket graphic types: Bracket (square) and
        // Brace. Both curved glyphs — parens and curly braces — write as
        // Brace, the same way they both import from it; a paren drawn here
        // re-opens in ChemDraw as ChemDraw's brace/paren glyph.
        const variant = ann.variant === "square" ? "Bracket" : "Brace";
        out += `<graphic id="${nextId()}" BoundingBox="${u(ann.x)} ${u(top)} ${u(partner.x + partner.width)} ${u(bottom)}" GraphicType="${variant}"/>\n`;
      } else {
        // One bracket glyph = one narrow CDX bracket graphic.
        const variant = ann.variant === "square" ? "Bracket" : "Brace";
        out += `<graphic id="${nextId()}" BoundingBox="${u(ann.x)} ${u(ann.y)} ${u(ann.x + ann.width)} ${u(ann.y + ann.height)}" GraphicType="${variant}"/>\n`;
      }
    } else if (ann.kind === "shape") {
      // Graphics primitives write back as their CDX graphic types — the
      // same types the importer reads Rectangles/Ovals/headless lines from,
      // so a shape round-trips through this app unchanged. The filled flag
      // is this-app-only (CDX's fill attributes are part of the
      // undocumented corner of the format); an outline re-opens in
      // ChemDraw, which is the loss that matters least here.
      const graphicType = ann.variant === "rectangle" ? "Rectangle" : ann.variant === "ellipse" ? "Oval" : "Line";
      out += `<graphic id="${nextId()}" BoundingBox="${u(ann.x)} ${u(ann.y)} ${u(ann.x + ann.width)} ${u(ann.y + ann.height)}" GraphicType="${graphicType}"/>\n`;
    } else if (ann.kind === "text") {
      const runs = htmlToTextRuns(ann.html, ann.fontSize, scale);
      if (!runs.some((r) => r.text.trim())) continue;
      const sizePt = pxToPtAttr(ann.fontSize, scale);
      out += `<t id="${nextId()}" p="${u(ann.x)} ${u(ann.y)}" Justification="Left">`;
      for (const run of runs) {
        if (!run.text) continue;
        let attrs = ` font="3"`;
        if (run.sizePt != null) attrs += ` size="${run.sizePt.toFixed(2)}"`;
        else if (sizePt != null) attrs += ` size="${sizePt}"`;
        if (run.face) attrs += ` face="${run.face}"`;
        if (run.colorIdx != null && run.colorIdx !== 1) attrs += ` color="${run.colorIdx}"`;
        out += `<s${attrs}>${escapeXml(run.text)}</s>`;
      }
      out += `</t>\n`;
    }
  }

  out += `</page>\n</CDXML>\n`;
  return out;
}

function f4(v: number): string {
  return v.toFixed(4);
}

function pxToPtAttr(px: number, scale: number): number {
  return (px * scale * 72) / 100;
}

function hexToCdxR(hex: string, channel: "r" | "g" | "b"): string {
  const i = channel === "r" ? 1 : channel === "g" ? 3 : 5;
  return (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4);
}

/** Single-molecule convenience wrapper used by tests and callers that only
 * have a molecule and no annotations — writes the same file as
 * exportCdxmlDocument with an empty annotation list. */
export function exportCdxml(mol: Molecule, name = "molecule"): string {
  return exportCdxmlDocument(mol, [], name);
}

/**
 * Maps a CDX bond Order value to one of our supported orders. CDXML
 * expresses delocalized/aromatic ring bonds as "1.5" rather than Kekulizing
 * them — like this app's MOL/SDF import, that's rendered as a double bond
 * rather than left unsupported. Anything else non-numeric (query bond
 * order lists, e.g. "1 2") falls back to a single bond.
 */
function cdxOrderToOrder(raw: string | null): BondOrder {
  const v = parseFloat(raw ?? "1");
  if (!Number.isFinite(v)) return 1;
  if (v >= 2.5) return 3;
  if (v >= 1.5) return 2;
  return 1;
}

function cdxDisplayToStereo(raw: string | null): { stereo: BondStereo; swapped: boolean } {
  switch (raw) {
    case "WedgeBegin":
    case "Wedge": // ambiguous legacy value — assume Begin, same as this app's own default
      return { stereo: "wedge", swapped: false };
    case "WedgeEnd":
      return { stereo: "wedge", swapped: true };
    case "WedgedHashBegin":
    case "Hash":
      return { stereo: "dash", swapped: false };
    case "WedgedHashEnd":
      return { stereo: "dash", swapped: true };
    case "Wavy":
      return { stereo: "wavy", swapped: false };
    // CDX's own emphasis styles: Bold is the heavy solid bond, Dash the
    // plain non-stereochemical broken line — exactly the two styles this
    // app's annotation layer now has. (CDX's "Dash" is the dashed LINE;
    // the hashed wedge is "WedgedHash…" above, so the two never collide.)
    case "Bold":
      return { stereo: "bold", swapped: false };
    case "Dash":
      return { stereo: "dashed", swapped: false };
    default:
      return { stereo: "none", swapped: false };
  }
}

/** A molecule plus everything drawn around it — what a CDXML page actually
 * contains, and what importCdxmlDocument therefore returns. */
export interface CdxmlDocument {
  molecule: Molecule;
  annotations: Annotation[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Parses a graphic's BoundingBox ("x1 y1 x2 y2") into four finite numbers,
 * or null if absent/malformed. */
function parseBBox(el: Element): [number, number, number, number] | null {
  const parts = (el.getAttribute("BoundingBox") ?? "").trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  return parts as [number, number, number, number];
}

/** One single-barbed (HalfHead) straight line, oriented so (x2,y2) is the
 * harpoon's pointed end — the raw material equilibrium pairs are detected
 * from. */
interface HarpoonLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Detects equilibrium arrows among the file's harpoon lines: ChemDraw
 * draws (and writes) an equilibrium as two parallel, antiparallel-pointing
 * half-headed lines stacked a small perpendicular offset apart, so two
 * harpoons that point into each other, have similar lengths and nearly
 * coincident midpoints are one equilibrium arrow, not two loose ones.
 * Greedy nearest-pair matching is plenty — real files contain a handful of
 * arrows, not thousands.
 *
 * @returns the paired-off harpoons (each pair sharing one equilibrium
 * annotation, oriented by the first harpoon) and the leftovers, which
 * import as ordinary forward arrows rather than being dropped — a lone
 * harpoon is probably what the author meant, and a forward arrow is the
 * closest thing this app's annotation layer has to it.
 */
function pairHarpoons(harpoons: HarpoonLine[]): { paired: HarpoonLine[]; lone: HarpoonLine[] } {
  const used: boolean[] = Array.from({ length: harpoons.length }, () => false);
  const paired: HarpoonLine[] = [];
  const lone: HarpoonLine[] = [];
  for (let i = 0; i < harpoons.length; i++) {
    if (used[i]) continue;
    const a = harpoons[i];
    const lenA = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
    let match = -1;
    for (let j = i + 1; j < harpoons.length && match < 0; j++) {
      if (used[j]) continue;
      const b = harpoons[j];
      const lenB = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
      if (lenA < 1e-6 || lenB < 1e-6) continue;
      // Must point into each other (antiparallel)…
      const dot = ((a.x2 - a.x1) * (b.x2 - b.x1) + (a.y2 - a.y1) * (b.y2 - b.y1)) / (lenA * lenB);
      if (dot > -0.85) continue;
      // …be about the same length…
      if (Math.min(lenA, lenB) / Math.max(lenA, lenB) < 0.7) continue;
      // …and sit on top of each other, allowing for the perpendicular
      // offset between the two halves (measured midpoint-to-midpoint,
      // relative to the arrow's length so short arrows don't over-match).
      const midAx = (a.x1 + a.x2) / 2, midAy = (a.y1 + a.y2) / 2;
      const midBx = (b.x1 + b.x2) / 2, midBy = (b.y1 + b.y2) / 2;
      if (Math.hypot(midAx - midBx, midAy - midBy) > 0.3 * ((lenA + lenB) / 2)) continue;
      match = j;
    }
    if (match >= 0) {
      used[match] = true;
      paired.push(a);
    } else {
      lone.push(a);
    }
  }
  return { paired, lone };
}

/**
 * Builds the arrow annotation for one imported CDX graphic, mapping raw
 * CDXML coordinates through the same `scale` every atom went through.
 * Curvature defaults to the app's own arrow tool value (0.22 × length, see
 * addArrowAnnotation) so imported curved arrows handle like hand-drawn
 * ones; the perpendicular side the arc bulges toward is unknowable from
 * the file's bounding-box form, so arcs import as "curved" — if the bulge
 * is mirrored relative to the original, dragging the curvature handle (or
 * the variant) fixes it in one interaction.
 */
function makeArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  variant: ArrowAnnotation["variant"],
  scale: number,
  barb?: ArrowAnnotation["barb"]
): ArrowAnnotation {
  const px1 = x1 * scale, py1 = y1 * scale, px2 = x2 * scale, py2 = y2 * scale;
  const ann: ArrowAnnotation = {
    id: nextId(),
    kind: "arrow",
    x1: px1,
    y1: py1,
    x2: px2,
    y2: py2,
    variant,
  };
  if (variant === "curved") {
    ann.curvature = Math.hypot(px2 - px1, py2 - py1) * 0.22;
    if (barb) ann.barb = barb;
  }
  return ann;
}

function makeBracket(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  variant: BracketAnnotation["variant"],
  facing: BracketAnnotation["facing"],
  scale: number
): BracketAnnotation {
  const px = x1 * scale, py = y1 * scale;
  const pw = (x2 - x1) * scale, ph = (y2 - y1) * scale;
  // The glyph's own width is whatever the file says, kept inside the range
  // the app's bracket tool produces (a 0-width glyph would be unselectable).
  const width = clamp(pw, 6, 40);
  return {
    id: nextId(),
    kind: "bracket",
    x: facing === "close" ? px + clamp(pw - width, 0, 40) : px,
    y: py,
    width,
    height: clamp(ph, 10, 800),
    variant,
    facing,
  };
}

/** Builds a shape annotation (rectangle/ellipse/line) from a CDX graphic's
 * bounding box, mapped through the file's scale. A degenerate Rect (zero
 * width/height — ChemDraw writes a line as a thin Rectangle sometimes) is
 * upgraded to a line so it doesn't arrive as an invisible sliver. */
function makeShape(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  variant: "rectangle" | "ellipse" | "line",
  scale: number
): ShapeAnnotation {
  const px = x1 * scale, py = y1 * scale;
  const pw = Math.abs(x2 - x1) * scale, ph = Math.abs(y2 - y1) * scale;
  const thin = Math.max(pw, ph) > 2 && Math.min(pw, ph) <= 2;
  const isLine = variant === "line" || thin;
  return {
    id: nextId(),
    kind: "shape",
    x: px,
    y: py,
    width: isLine ? (x2 - x1) * scale : Math.max(pw, 4),
    height: isLine ? (y2 - y1) * scale : Math.max(ph, 4),
    variant: isLine ? "line" : variant,
  };
}

/**
 * Parses every non-molecule object on a CDXML page into this app's
 * annotation layer. Anything that can't be confidently mapped is skipped
 * rather than invented (plain headless lines, rectangles/ovals, and text
 * nested inside atom nodes — the latter is how CDXML writes atom *labels*,
 * which describe atoms this importer already reads and must not become a
 * second, floating copy of).
 */
function importAnnotations(
  doc: Document,
  scale: number
): Annotation[] {
  const annotations: Annotation[] = [];
  const room = () => {
    if (annotations.length >= LIMITS.maxAnnotations) {
      throw new Error(`CDXML has too many annotations (> ${LIMITS.maxAnnotations})`);
    }
  };

  const colortable = Array.from(doc.querySelectorAll("colortable color")).map((c) => {
    const r = Math.round(parseFloat(c.getAttribute("r") ?? "0") * 255);
    const g = Math.round(parseFloat(c.getAttribute("g") ?? "0") * 255);
    const b = Math.round(parseFloat(c.getAttribute("b") ?? "0") * 255);
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  });
  const isBlack = (css: string): boolean => {
    const r = parseInt(css.slice(1, 3), 16), g = parseInt(css.slice(3, 5), 16), b = parseInt(css.slice(5, 7), 16);
    return r + g + b < 30;
  };

  // --- Straight-line graphics: reaction / resonance / equilibrium arrows.
  const harpoons: HarpoonLine[] = [];
  for (const g of Array.from(doc.querySelectorAll("graphic"))) {
    const type = (g.getAttribute("GraphicType") ?? "").trim().toLowerCase();
    const bbox = parseBBox(g);
    if (!bbox) continue;
    const [rx1, ry1, rx2, ry2] = bbox;

    if (type === "line") {
      const head = cdxHeadClass(g.getAttribute("Head"));
      const tail = cdxHeadClass(g.getAttribute("Tail"));
      // The retrosynthetic arrow is CDX's own head class on a plain line
      // graphic — check the raw attribute before collapsing to the generic
      // head classes, so the disconnection arrow keeps its meaning.
      const headRaw = (g.getAttribute("Head") ?? "").trim().toLowerCase();
      const tailRaw = (g.getAttribute("Tail") ?? "").trim().toLowerCase();
      const retro = headRaw.includes("retro") || tailRaw.includes("retro");
      if (retro) {
        // Orient tail -> head like a forward arrow: if the HEAD attribute
        // names the retro head, the box's first corner is the tail; if the
        // TAIL does, the direction is reversed.
        room();
        if (headRaw.includes("retro")) annotations.push(makeArrow(rx1, ry1, rx2, ry2, "retrosynthetic", scale));
        else annotations.push(makeArrow(rx2, ry2, rx1, ry1, "retrosynthetic", scale));
      } else if (head === "none" && tail === "none") {
        // A plain headless line — ChemDraw's plain line tool, and now that
        // this app has a line shape, it imports as exactly that instead of
        // being dropped.
        room();
        annotations.push(makeShape(rx1, ry1, rx2, ry2, "line", scale));
      } else if (head === "full" && tail === "full") {
        room();
        annotations.push(makeArrow(rx1, ry1, rx2, ry2, "resonance", scale));
      } else if (head === "half" && tail === "half") {
        // Harpoons on both ends of one graphic: ChemDraw's two-sided
        // half-head arrow, i.e. equilibrium drawn as a single object.
        room();
        annotations.push(makeArrow(rx1, ry1, rx2, ry2, "equilibrium", scale));
      } else if (head === "half" || tail === "half") {
        // Exactly one harpoon end — collect for equilibrium pairing before
        // committing to an interpretation (see pairHarpoons).
        harpoons.push(tail === "none" ? { x1: rx1, y1: ry1, x2: rx2, y2: ry2 } : { x1: rx2, y1: ry2, x2: rx1, y2: ry1 });
      } else {
        // One full head, one end bare: the plain reaction arrow. Orient
        // tail -> head regardless of which bounding-box corner holds the
        // head.
        room();
        if (head === "full") annotations.push(makeArrow(rx1, ry1, rx2, ry2, "forward", scale));
        else annotations.push(makeArrow(rx2, ry2, rx1, ry1, "forward", scale));
      }
    } else if (type === "arc") {
      // Curved (mechanism) arrows: CDX stores the arc as a bounding box,
      // whose two first corners stand in for the arc's endpoints. Which
      // perpendicular side the arc bulges toward isn't recoverable from
      // the box, so the variant is always "curved" — see makeArrow.
      const head = cdxHeadClass(g.getAttribute("Head"));
      const tail = cdxHeadClass(g.getAttribute("Tail"));
      if (head === "none" && tail === "none") continue;
      const headEnd = head !== "none" ? head : tail;
      room();
      if (head !== "none" || tail === "none") {
        annotations.push(makeArrow(rx1, ry1, rx2, ry2, "curved", scale, headEnd === "half" ? "single" : "full"));
      } else {
        annotations.push(makeArrow(rx2, ry2, rx1, ry1, "curved", scale, headEnd === "half" ? "single" : "full"));
      }
    } else if (type === "rectangle" || type === "rect" || type === "oval" || type === "ellipse" || type === "circle") {
      // ChemDraw's graphics-primitive tools: import as this app's shape
      // annotations (see makeShape — a degenerate sliver becomes a line,
      // since ChemDraw draws thin rules as Rectangles).
      room();
      annotations.push(makeShape(rx1, ry1, rx2, ry2, type === "oval" || type === "ellipse" || type === "circle" ? "ellipse" : "rectangle", scale));
    } else if (type === "bracket" || type === "brace") {
      const variant: BracketAnnotation["variant"] = type === "bracket" ? "square" : "curly";
      const w = (rx2 - rx1) * scale;
      room();
      if (w > 60) {
        // A bracket graphic whose bounding box spans the enclosed region
        // is ChemDraw's single two-sided bracket object: import both
        // halves so the pair reads the same way it did there.
        annotations.push(makeBracket(rx1, ry1, rx1 + 12 / scale, ry2, variant, "open", scale));
        annotations.push(makeBracket(rx2 - 12 / scale, ry1, rx2, ry2, variant, "close", scale));
      } else {
        // A narrow graphic is one glyph; which side of a pair it sat on
        // isn't recorded, so default to an open-facing glyph — the common
        // case for a lone bracket, and trivially flippable in-app.
        annotations.push(makeBracket(rx1, ry1, rx2, ry2, variant, "open", scale));
      }
    }
    // Anything else (Quad, TLC plates, ...) has no annotation equivalent —
    // skipped rather than invented (see the file doc comment).
  }

  // Pair up the straight single-harpoon lines: two pointing into each
  // other are one equilibrium arrow; a leftover imports as a forward arrow.
  const { paired, lone } = pairHarpoons(harpoons);
  for (const h of paired) {
    room();
    annotations.push(makeArrow(h.x1, h.y1, h.x2, h.y2, "equilibrium", scale));
  }
  for (const h of lone) {
    room();
    annotations.push(makeArrow(h.x1, h.y1, h.x2, h.y2, "forward", scale));
  }

  // --- <arrow> elements (ChemDraw's dedicated reaction-arrow object in
  // newer versions; x1/y1/x2/y2 attributes instead of a bounding box).
  for (const el of Array.from(doc.querySelectorAll("arrow"))) {
    const nums = ["x1", "y1", "x2", "y2"].map((a) => parseFloat(el.getAttribute(a) ?? ""));
    if (nums.some((v) => !Number.isFinite(v))) continue;
    const [x1, y1, x2, y2] = nums;
    const head = cdxHeadClass(el.getAttribute("Head"));
    const tail = cdxHeadClass(el.getAttribute("Tail"));
    room();
    if (head === "none" && tail !== "none") annotations.push(makeArrow(x2, y2, x1, y1, "forward", scale));
    else annotations.push(makeArrow(x1, y1, x2, y2, "forward", scale));
  }

  // --- Caption text. Everything except atom labels (a <t> nested inside a
  // node — that's how CDXML writes the label drawn ON an atom, which the
  // node itself already carries) becomes a TextAnnotation.
  for (const t of Array.from(doc.querySelectorAll("t"))) {
    const parentTag = (t.parentElement?.tagName ?? "").toLowerCase();
    if (parentTag === "n") continue;

    const p = (t.getAttribute("p") ?? "").trim().split(/\s+/).map(Number);
    if (!p.length || p.some((v) => !Number.isFinite(v))) continue;

    // Caption size: CDXML writes it per style run in points; the
    // annotation's base size comes from the first run that names one
    // (falling back to CDX's conventional 10 pt caption).
    let baseSizePt = 10;
    for (const s of Array.from(t.querySelectorAll("s"))) {
      const v = parseFloat(s.getAttribute("size") ?? "");
      if (Number.isFinite(v) && v > 0) {
        baseSizePt = v;
        break;
      }
    }
    const fontSize = clamp(baseSizePt * UNITS_PER_POINT * scale, 8, 96);

    // Rebuild the caption as this app's annotation-HTML subset.
    let html = "";
    let plain = "";
    const runs = Array.from(t.querySelectorAll("s"));
    for (const s of runs.length > 0 ? runs : [t]) {
      const text = s.textContent ?? "";
      if (!text) continue;
      plain += text;
      const face = parseInt(s.getAttribute("face") ?? "0", 10) || 0;
      let inner = escapeXml(text).replace(/\r\n|\r|\n/g, "<br>");
      if (face & FACE_BOLD) inner = `<b>${inner}</b>`;
      if (face & FACE_ITALIC) inner = `<i>${inner}</i>`;
      if (face & FACE_UNDERLINE) inner = `<u>${inner}</u>`;
      if (face & FACE_SUPERSCRIPT) inner = `<sup>${inner}</sup>`;
      else if (face & FACE_SUBSCRIPT) inner = `<sub>${inner}</sub>`;
      const styles: string[] = [];
      const sizePt = parseFloat(s.getAttribute("size") ?? "");
      if (Number.isFinite(sizePt) && sizePt > 0 && Math.abs(sizePt - baseSizePt) > 0.25) {
        styles.push(`font-size:${(sizePt * UNITS_PER_POINT * scale).toFixed(1)}px`);
      }
      // A missing color attribute means default ink — NOT colortable
      // entry 0 (which is white in this app's own palette, black in
      // ChemDraw's). Only an explicitly present index gets a color.
      const colorAttr = s.getAttribute("color");
      const colorIdx = colorAttr != null ? parseInt(colorAttr, 10) || 0 : -1;
      const color = colorIdx >= 0 ? colortable[colorIdx] : undefined;
      if (color && !isBlack(color)) styles.push(`color:${color}`);
      if (styles.length) inner = `<span style="${styles.join("; ")}">${inner}</span>`;
      html += inner;
    }
    if (!plain.trim()) continue;
    if (html.length > LIMITS.maxHtmlChars) continue; // same cap the app enforces on its own annotations

    // Box size: from the caption's bounding box when the file provides
    // one ("x1 y1 x2 y2"), otherwise estimated from the text so the box is
    // visible/selectable — TextAnnotationView re-measures the real height
    // the moment it renders, so the estimate only needs to be roughly
    // right.
    let x: number, y: number, width: number, height: number;
    if (p.length >= 4) {
      x = Math.min(p[0], p[2]) * scale;
      y = Math.min(p[1], p[3]) * scale;
      width = clamp(Math.abs(p[2] - p[0]) * scale, 40, 2000);
      height = clamp(Math.abs(p[3] - p[1]) * scale, 24, 4000);
    } else {
      x = p[0] * scale;
      y = p[1] * scale;
      const lines = plain.split(/\r\n|\r|\n/);
      const longest = Math.max(...lines.map((l) => l.length));
      width = clamp(longest * fontSize * 0.62 + 24, 40, 2000);
      height = clamp(lines.length * fontSize * 1.55 + 10, 24, 4000);
    }

    room();
    const ann: TextAnnotation = { id: nextId(), kind: "text", x, y, width, height, html, fontSize };
    annotations.push(ann);
  }

  // Same untrusted-input rule as project files and clipboard fragments:
  // this HTML came off disk, so it goes through DOMPurify before it can
  // reach any innerHTML write.
  return sanitizeAnnotationList(annotations);
}

/**
 * Reads a whole CDXML page: the molecule (atoms + bonds, via the same
 * self-calibrating scale importCdxml has always used) plus every arrow,
 * bracket and caption around it, mapped onto this app's annotation layer.
 *
 * Deliberate approximations, so nobody has to reverse-engineer them from
 * the code: curved-arrow bulge *sides* are not recoverable from CDX's
 * bounding-box arc form (arrows import as "curved" — flip the variant if
 * the bulge mirrors the original); a lone harpoon line imports as a
 * forward arrow (the closest thing the app has); unknown exotic heads
 * import as plain full heads; text justification and fonts are normalized
 * to the app's own; shapes import as outlines (CDX fill attributes live in
 * the undocumented corner of the format). Retrosynthetic arrows,
 * Bold/Dash bonds, rectangles/ovals and plain lines all map onto real
 * annotation kinds now. Atom labels (<t> inside <n>) are correctly treated
 * as part of their atom, not as captions.
 */
export function importCdxmlDocument(text: string): CdxmlDocument {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Not a valid CDXML file");
  }

  const mol = emptyMolecule();
  const idByCdxId = new Map<string, string>();
  const rawX = new Map<string, number>();
  const rawY = new Map<string, number>();

  const nodes = Array.from(doc.querySelectorAll("n"));
  if (nodes.length > LIMITS.maxAtoms) {
    throw new Error(`CDXML has too many atoms (${nodes.length} > ${LIMITS.maxAtoms})`);
  }
  for (const n of nodes) {
    const cdxId = n.getAttribute("id");
    if (!cdxId) continue;
    const p = (n.getAttribute("p") || "0 0").trim().split(/\s+/).map(Number);
    const [x, y] = p.length >= 2 ? p : [0, 0];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("CDXML atom has invalid coordinates");
    const atomicNumber = n.getAttribute("Element") ? parseInt(n.getAttribute("Element")!, 10) : 6;
    const element = ATOMIC_NUMBER_TO_ELEMENT[atomicNumber] ?? "C";
    const charge = parseInt(n.getAttribute("Charge") || "0", 10) || 0;

    const id = nextId();
    idByCdxId.set(cdxId, id);
    rawX.set(id, x);
    rawY.set(id, y);
    mol.atoms[id] = { id, x: 0, y: 0, element, charge };
  }

  const bondPairs: { a1: string; a2: string; order: BondOrder; stereo: BondStereo }[] = [];
  for (const b of Array.from(doc.querySelectorAll("b"))) {
    const bCdx = b.getAttribute("B");
    const eCdx = b.getAttribute("E");
    if (!bCdx || !eCdx) continue;
    const beginId = idByCdxId.get(bCdx);
    const endId = idByCdxId.get(eCdx);
    if (!beginId || !endId) continue;
    const order = cdxOrderToOrder(b.getAttribute("Order"));
    const { stereo, swapped } = cdxDisplayToStereo(b.getAttribute("Display"));
    // Our model always has a1 as the wedge/hash's narrow end; if CDX marked
    // the *other* node as narrow ("...End"), swap so a1 stays narrow.
    bondPairs.push(swapped ? { a1: endId, a2: beginId, order, stereo } : { a1: beginId, a2: endId, order, stereo });
  }

  // Same self-calibration approach as the MOL/SDF importer: CDXML documents
  // don't reliably agree on what a "unit" is in practice (despite the
  // BondLength attribute's nominal meaning), so measure the file's actual
  // median bond length and scale that onto this app's own BOND_LEN. See
  // calibrateImportScale's doc comment for why heavy-heavy bonds are
  // measured separately from bonds involving explicit hydrogens.
  // Annotations share this scale so arrows/text land exactly where their
  // bonds say they should — including in annotation-only files (no bonds),
  // where calibrateImportScale falls back to the CDXML default bond length.
  const allLengths: number[] = [];
  const heavyLengths: number[] = [];
  for (const { a1, a2 } of bondPairs) {
    const x1 = rawX.get(a1), y1 = rawY.get(a1), x2 = rawX.get(a2), y2 = rawY.get(a2);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;
    const d = Math.hypot(x1 - x2, y1 - y2);
    if (d <= 1e-6) continue;
    allLengths.push(d);
    if (mol.atoms[a1].element !== "H" && mol.atoms[a2].element !== "H") heavyLengths.push(d);
  }
  const scale = calibrateImportScale(allLengths, heavyLengths, 30); // 30 = ChemDraw's conventional default bond length

  // CDXML's Y axis already increases downward, matching this app's own
  // canvas convention, so — unlike MOL/SDF import — no sign flip here.
  for (const id of Object.keys(mol.atoms)) {
    mol.atoms[id].x = (rawX.get(id) ?? 0) * scale;
    mol.atoms[id].y = (rawY.get(id) ?? 0) * scale;
  }

  for (const { a1, a2, order, stereo } of bondPairs) {
    const id = nextId();
    mol.bonds[id] = { id, a1, a2, order: stereo === "none" ? order : 1, stereo, doubleSide: "auto" };
  }

  const annotations = importAnnotations(doc, scale);

  return { molecule: finalizeImportedMolecule(mol), annotations };
}

/** Molecule-only convenience wrapper — the original entry point, kept for
 * callers (and tests) that only want the chemistry and don't care about
 * the annotations around it. */
export function importCdxml(text: string): Molecule {
  return importCdxmlDocument(text).molecule;
}
