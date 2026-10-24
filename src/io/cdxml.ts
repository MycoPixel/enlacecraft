import type {
  Annotation,
  ArrowAnnotation,
  ArrowHeadSize,
  BondOrder,
  BondStereo,
  BracketAnnotation,
  Element as ChemElement,
  Molecule,
  OrbitalAnnotation,
  ShapeAnnotation,
  ShapeVariant,
  TextAnnotation,
  TlcPlateAnnotation,
  TlcSpot,
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
 * font-size and color runs), square/curly/paren brackets, the plain graphics
 * primitives (rectangles, ovals, headless lines — imported as this app's
 * shape annotations), orbital glyphs, and TLC plates with their lanes/spots.
 * See importCdxmlDocument's doc comment for the honest list of
 * approximations the arrow/text mapping makes, and
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
 * the atom symbol).
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
  // ChemDraw writes bare "Half"/"Full" on <arrow> elements (ArrowheadHead,
  // ArrowheadTail) and the longer "...Head" names on legacy line graphics.
  if (v === "half" || v === "halfhead") return "half";
  if (v === "full" || v.includes("head") || v.includes("retro")) return "full";
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
  /** CDX color index: 0 = black (the default), 1 = white, 2+ = the file's
   * colortable entries in order. */
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

/** The colortable shared by one exported document. CDX reserves color
 * indexes 0 (black) and 1 (white); the saved table's entries are indexes
 * 2, 3, 4... in order (see the CDX ColorTable property: "Color indexes 0
 * and 1 always correspond to black and white and are not saved in the
 * color table"). Entry 0 is white and entry 1 black, matching what
 * ChemDraw itself writes, so any non-black text color the annotation
 * toolbar produced gets appended on first use. */
let exportPalette: string[] = [];

function colorPaletteIndex(cssColor: string): number {
  const color = cssColor.toLowerCase();
  const idx = exportPalette.indexOf(color);
  if (idx >= 0) return idx + 2;
  exportPalette.push(color);
  return exportPalette.length + 1;
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
    if (b.stereo === "wedge") {
      attrs += b.hollow ? ` Display="HollowWedgeBegin"` : ` Display="WedgeBegin"`;
    } else if (b.stereo === "dash") {
      attrs += ` Display="WedgedHashBegin"`;
    } else if (b.stereo === "boldHash") {
      attrs += ` Display="WedgedHashBegin"`;
    } else if (b.stereo === "wavy") {
      attrs += ` Display="Wavy"`;
    } else if (b.stereo === "bold") {
      attrs += ` Display="Bold"`;
    } else if (b.stereo === "dashed") {
      attrs += ` Display="Dash"`;
    } else if (b.stereo === "boldDouble") {
      attrs += ` Display="BoldDouble"`;
    } else if (b.stereo === "dashedDouble") {
      attrs += ` Display="DashedDouble"`;
    } else if (b.stereo === "hollowWedge") {
      attrs += ` Display="HollowWedgeBegin"`;
    }
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
      const x1 = u(ann.x1), y1 = u(ann.y1), x2 = u(ann.x2), y2 = u(ann.y2);
      // Map head style to CDX head class
      const headStyle = ann.headStyle ?? (ann.barb === "single" ? "half" : "full");
      const headMap: Record<string, string> = {
        "full": "FullHalfHead",
        "half": "HalfHead",
        "open": "OpenHead",
        "circle": "Circle",
        "diamond": "Diamond",
        "retro": "RetroSynthetic",
      };
      const tailStyle = ann.tailStyle ?? "none";
      const tailMap: Record<string, string> = {
        "none": "None",
        "full": "FullHalfHead",
        "half": "HalfHead",
        "open": "OpenHead",
      };
      const shaftStyle = ann.shaftStyle ?? (ann.dashed ? "dashed" : "solid");
      const lineStyleMap: Record<string, string> = {
        "solid": "",
        "dashed": "Dashed",
        "bold": "Bold",
        "double": "Double",
      };
      const lineStyleAttr = lineStyleMap[shaftStyle] ? ` LineStyle="${lineStyleMap[shaftStyle]}"` : "";
      const headAttr = headMap[headStyle] ?? "FullHalfHead";
      const tailAttr = tailMap[tailStyle] ?? "None";

      if (ann.variant === "curved" || ann.variant === "curvedReverse") {
        // Export curved arrows as <arrow> elements with AngularSize
        const px1 = ann.x1 * scale, py1 = ann.y1 * scale, px2 = ann.x2 * scale, py2 = ann.y2 * scale;
        const curvature = ann.curvature ?? Math.hypot(px2 - px1, py2 - py1) * 0.22;
        const len = Math.hypot(px2 - px1, py2 - py1) || 1;
        const angular = (curvature / len) * 270; // Approximate angular size
        const angularSign = ann.variant === "curved" ? -1 : 1;
        out += `<arrow id="${nextId()}" Head3D="${x1} ${y1} 0" Tail3D="${x2} ${y2} 0" AngularSize="${angularSign * Number(angular.toFixed(1))}" ArrowheadHead="${headStyle === "half" ? "Half" : "Full"}" ArrowheadTail="${tailStyle === "half" ? "Half" : tailStyle === "full" ? "Full" : "None"}" ArrowheadType="${headStyle === "open" ? "Open" : headStyle === "circle" ? "Circle" : headStyle === "diamond" ? "Diamond" : "Solid"}"${lineStyleAttr}${ann.headSize ? ` HeadSize="${({ small: 1000, medium: 2250, large: 3500 } as Record<ArrowHeadSize, number>)[ann.headSize!]}"` : ""}/>\n`;
      } else if (ann.variant === "forward") {
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="${headAttr}" Tail="${tailAttr}"${lineStyleAttr}${ann.headSize ? ` HeadSize="${({ small: 1000, medium: 2250, large: 3500 } as Record<ArrowHeadSize, number>)[ann.headSize!]}"` : ""}/>\n`;
      } else if (ann.variant === "resonance") {
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="${headAttr}" Tail="${tailAttr}"${lineStyleAttr}${ann.headSize ? ` HeadSize="${({ small: 1000, medium: 2250, large: 3500 } as Record<ArrowHeadSize, number>)[ann.headSize!]}"` : ""}/>\n`;
      } else if (ann.variant === "retrosynthetic") {
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="RetroSynthetic" Tail="${tailAttr}"${lineStyleAttr}${ann.headSize ? ` HeadSize="${({ small: 1000, medium: 2250, large: 3500 } as Record<ArrowHeadSize, number>)[ann.headSize!]}"` : ""}/>\n`;
      } else if (ann.variant === "equilibrium") {
        // Equilibrium: two offset harpoons
        const px1 = ann.x1 * scale, py1 = ann.y1 * scale, px2 = ann.x2 * scale, py2 = ann.y2 * scale;
        const len = Math.hypot(px2 - px1, py2 - py1) || 1;
        const nx = -(py2 - py1) / len, ny = (px2 - px1) / len;
        const o = 3;
        out += `<graphic id="${nextId()}" BoundingBox="${f4(px1 + nx * o)} ${f4(py1 + ny * o)} ${f4(px2 + nx * o)} ${f4(py2 + ny * o)}" GraphicType="Line" Head="HalfHead" Tail="None"${lineStyleAttr}/>\n`;
        out += `<graphic id="${nextId()}" BoundingBox="${f4(px2 - nx * o)} ${f4(py2 - ny * o)} ${f4(px1 - nx * o)} ${f4(py1 - ny * o)}" GraphicType="Line" Head="HalfHead" Tail="None"${lineStyleAttr}/>\n`;
      } else if (ann.variant === "dashed" || ann.variant === "bold" || ann.variant === "double") {
        // New variants that map to line style
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="${headAttr}" Tail="${tailAttr}"${lineStyleAttr}${ann.headSize ? ` HeadSize="${({ small: 1000, medium: 2250, large: 3500 } as Record<ArrowHeadSize, number>)[ann.headSize!]}"` : ""}/>\n`;
      } else if (ann.variant === "openHead" || ann.variant === "circleHead" || ann.variant === "diamondHead" || ann.variant === "tailed") {
        // Variants that are primarily about head/tail style
        out += `<graphic id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Line" Head="${headAttr}" Tail="${tailAttr}"${lineStyleAttr}${ann.headSize ? ` HeadSize="${({ small: 1000, medium: 2250, large: 3500 } as Record<ArrowHeadSize, number>)[ann.headSize!]}"` : ""}/>\n`;
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
      const graphicTypeMap: Record<ShapeAnnotation["variant"], string> = {
        rectangle: "Rectangle",
        ellipse: "Oval",
        line: "Line",
        polygon: "Polygon",
        arc: "Arc",
        curve: "Curve",
        polyline: "Polyline",
        roundedRect: "RoundRect",
        triangle: "Triangle",
        hexagon: "Hexagon",
      };
      const graphicType = graphicTypeMap[ann.variant] ?? "Rectangle";
      let attrs = `id="${nextId()}" BoundingBox="${u(ann.x)} ${u(ann.y)} ${u(ann.x + ann.width)} ${u(ann.y + ann.height)}" GraphicType="${graphicType}"`;
      if (ann.filled) attrs += ` FillType="Solid"`;
      if (ann.fillPattern && ann.fillPattern !== "solid") {
        const patternMap: Record<string, string> = { hatch: "Hatch", crosshatch: "CrossHatch", dots: "Dots" };
        attrs += ` FillPattern="${patternMap[ann.fillPattern] ?? "Solid"}"`;
      }
      if (ann.lineStyle && ann.lineStyle !== "solid") {
        const styleMap: Record<string, string> = { dashed: "Dashed", dotted: "Dotted", dashdot: "DashDot" };
        attrs += ` LineStyle="${styleMap[ann.lineStyle] ?? "Solid"}"`;
      }
      if (ann.lineCap && ann.lineCap !== "round") {
        const capMap: Record<string, string> = { round: "Round", square: "Square", butt: "Butt" };
        attrs += ` LineCap="${capMap[ann.lineCap] ?? "Round"}"`;
      }
      if (ann.lineJoin && ann.lineJoin !== "miter") {
        const joinMap: Record<string, string> = { miter: "Miter", round: "Round", bevel: "Bevel" };
        attrs += ` LineJoin="${joinMap[ann.lineJoin] ?? "Miter"}"`;
      }
      if (ann.sides) attrs += ` NumSides="${ann.sides}"`;
      if (ann.startAngle != null) attrs += ` StartAngle="${ann.startAngle.toFixed(1)}"`;
      if (ann.points && ann.points.length > 0) {
        const pts = ann.points.map(p => `${f4(p.x)} ${f4(p.y)}`).join(" ");
        attrs += ` Points="${pts}"`;
      }
      out += `<graphic ${attrs}/>\n`;
    } else if (ann.kind === "orbital") {
      // Orbital glyphs export as CDX Orbital graphics
      const orbitalTypeMap: Record<OrbitalAnnotation["variant"], string> = {
        s: "s",
        p: "p",
        d: "d",
        sp: "sp",
        sp2: "sp2",
        sp3: "sp3",
        lobe: "lobe",
        hybrid: "hybrid",
      };
      const orbitalType = orbitalTypeMap[ann.variant] ?? "p";
      const size = ann.size * 2; // diameter
      const halfSize = ann.size;
      const angleRad = (ann.angle * Math.PI) / 180;
      const dx = Math.cos(angleRad) * halfSize;
      const dy = Math.sin(angleRad) * halfSize;
      const x1 = u(ann.x - dx), y1 = u(ann.y - dy);
      const x2 = u(ann.x + dx), y2 = u(ann.y + dy);
      let attrs = `id="${nextId()}" BoundingBox="${x1} ${y1} ${x2} ${y2}" GraphicType="Orbital" OrbitalType="${orbitalType}"`;
      if (ann.filled) attrs += ` FillType="Solid"`;
      out += `<graphic ${attrs}/>\n`;
    } else if (ann.kind === "tlc") {
      // TLC plate export
      const spotsXml = ann.spots.map(spot => {
        let spotAttrs = `Rf="${spot.fy.toFixed(6)}"`;
        if (spot.color) {
          const colorIdx = colorPaletteIndex(spot.color);
          spotAttrs += ` color="${colorIdx}"`;
        }
        if (spot.label) spotAttrs += ` Label="${escapeXml(spot.label)}"`;
        if (spot.uv) spotAttrs += ` UV="${spot.uv}"`;
        if (spot.stain) spotAttrs += ` Stain="${spot.stain}"`;
        return `<tlcspot ${spotAttrs}/>`;
      }).join("");
      const lanesXml = ann.laneCount && ann.laneCount > 1
        ? Array.from({ length: ann.laneCount }, (_, i) => `<tlclane>${spotsXml}</tlclane>`).join("")
        : `<tlclane>${spotsXml}</tlclane>`;
      let plateAttrs = `id="${nextId()}" TopLeft="${u(ann.x)} ${u(ann.y)}" TopRight="${u(ann.x + ann.width)} ${u(ann.y)}" BottomRight="${u(ann.x + ann.width)} ${u(ann.y + ann.height)}" BottomLeft="${u(ann.x)} ${u(ann.y + ann.height)}" ShowOrigin="yes" ShowSolventFront="yes" ShowBorders="yes"`;
      if (ann.baselineFraction != null) plateAttrs += ` OriginFraction="${ann.baselineFraction.toFixed(3)}"`;
      if (ann.solventFrontFractions && ann.solventFrontFractions[0] != null) plateAttrs += ` SolventFrontFraction="${ann.solventFrontFractions[0].toFixed(3)}"`;
      if (ann.showUV) plateAttrs += ` ShowUV="yes"`;
      if (ann.uvWavelengths && ann.uvWavelengths.length > 0) plateAttrs += ` UVWavelengths="${ann.uvWavelengths.join(",")}"`;
      if (ann.stainType) plateAttrs += ` StainType="${ann.stainType}"`;
      if (ann.laneLabels && ann.laneLabels.length > 0) plateAttrs += ` LaneLabels="${ann.laneLabels.join("|")}"`;
      if (ann.plateSize && ann.plateSize !== "custom") plateAttrs += ` PlateSize="${ann.plateSize}"`;
      if (ann.showRfValues) plateAttrs += ` ShowRfValues="yes"`;
      out += `<tlcplate ${plateAttrs}>${lanesXml}</tlcplate>\n`;
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
        // 3 is the index of the reserved black entry; default ink needs no
        // color attribute at all.
        if (run.colorIdx != null && run.colorIdx !== 3) attrs += ` color="${run.colorIdx}"`;
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

function cdxDisplayToStereo(raw: string | null): { stereo: BondStereo; swapped: boolean; hollow?: boolean } {
  const v = (raw ?? "").trim();
  // Handle hollow wedge variants first (they combine display + hollow attribute)
  if (v === "WedgeBegin" || v === "Wedge") {
    return { stereo: "wedge", swapped: false };
  }
  if (v === "WedgeEnd") {
    return { stereo: "wedge", swapped: true };
  }
  if (v === "WedgedHashBegin" || v === "Hash") {
    return { stereo: "dash", swapped: false };
  }
  if (v === "WedgedHashEnd") {
    return { stereo: "dash", swapped: true };
  }
  if (v === "Wavy") {
    return { stereo: "wavy", swapped: false };
  }
  // CDX's own emphasis styles: Bold is the heavy solid bond, Dash the
  // plain non-stereochemical broken line — exactly the two styles this
  // app's annotation layer now has. (CDX's "Dash" is the dashed LINE;
  // the hashed wedge is "WedgedHash…" above, so the two never collide.)
  if (v === "Bold") {
    return { stereo: "bold", swapped: false };
  }
  if (v === "Dash") {
    return { stereo: "dashed", swapped: false };
  }
  // New bond types for ChemDraw compatibility
  if (v === "BoldDouble") {
    return { stereo: "boldDouble", swapped: false };
  }
  if (v === "DashedDouble") {
    return { stereo: "dashedDouble", swapped: false };
  }
  if (v === "HollowWedgeBegin" || v === "HollowWedge") {
    return { stereo: "hollowWedge", swapped: false, hollow: true };
  }
  if (v === "HollowWedgeEnd") {
    return { stereo: "hollowWedge", swapped: true, hollow: true };
  }
  return { stereo: "none", swapped: false };
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

/** Parses one of ChemDraw's 2D/3D point attributes ("x y" or "x y z") into
 * its two drawing coordinates. Z is irrelevant here — this app's canvas is
 * purely 2D. */
function parsePoint(el: Element, attr: string): { x: number; y: number } | null {
  const parts = (el.getAttribute(attr) ?? "").trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { x: parts[0], y: parts[1] };
}

/** Maps CDX's HeadSize (a width in 1/1000 drawing units) onto the app's
 * three arrowhead sizes. Unknown/absent values keep the renderer's default
 * ("medium"), so the common case writes nothing. */
function cdxHeadSize(raw: string | null): ArrowHeadSize | undefined {
  const v = parseFloat(raw ?? "");
  if (!Number.isFinite(v) || v <= 0) return undefined;
  if (v < 1400) return "small";
  if (v <= 2600) return "medium";
  return "large";
}

/**
 * Works out which way a CDX arc bulges, from the arc's bounding box. The
 * file gives us the two endpoints and the bounding box the arc sweeps out;
 * if the box's centre sits to the left of the straight tail→head chord, the
 * arc bows one way, otherwise the other. (CDX's AngularSize angle is not
 * enough on its own — ChemDraw writes -270° for arcs that visually sweep a
 * quarter turn, and the exact convention is undocumented.)
 *
 * Returns the app's "curved"/"curvedReverse" variant plus the curvature to
 * store (the quadratic control-point offset, so twice the arc's sagitta).
 */
function arcBow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bbox: [number, number, number, number] | null
): { variant: "curved" | "curvedReverse"; curvature: number } {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  if (!bbox) return { variant: "curved", curvature: len * 0.22 };
  const nx = -dy / len, ny = dx / len;
  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  const boxX = (bbox[0] + bbox[2]) / 2, boxY = (bbox[1] + bbox[3]) / 2;
  const side = (boxX - midX) * nx + (boxY - midY) * ny;
  // Twice the distance from the chord to the box centre approximates the
  // arc's sagitta well for the shallow arcs mechanism arrows use; longer
  // (near-circular) sweeps are capped at the chord length so the resulting
  // quadratic stays a useable single bulge rather than an enormous loop.
  const sagitta = Math.hypot(boxX - midX, boxY - midY) * 2;
  return {
    variant: side >= 0 ? "curved" : "curvedReverse",
    curvature: clamp(sagitta * 2, len * 0.08, len),
  };
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
  barb?: ArrowAnnotation["barb"],
  curvature?: number,
  headSize?: ArrowAnnotation["headSize"],
  headStyle?: ArrowAnnotation["headStyle"],
  tailStyle?: ArrowAnnotation["tailStyle"],
  shaftStyle?: ArrowAnnotation["shaftStyle"]
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
  if (variant === "curved" || variant === "curvedReverse") {
    ann.curvature = curvature ?? Math.hypot(px2 - px1, py2 - py1) * 0.22;
    if (barb) ann.barb = barb;
  }
  if (headSize) ann.headSize = headSize;
  if (headStyle) ann.headStyle = headStyle;
  if (tailStyle) ann.tailStyle = tailStyle;
  if (shaftStyle) ann.shaftStyle = shaftStyle;
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
  // Bounding boxes in ChemDraw files are not normalized: either corner may
  // come first. Normalize before deriving the glyph's box — a y1 > y2 box
  // (which ChemDraw writes for brackets drawn bottom-up) used to collapse
  // to the 10px minimum height.
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const px = left * scale, py = top * scale;
  const pw = (right - left) * scale, ph = (Math.max(y1, y2) - top) * scale;
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
  variant: ShapeVariant,
  scale: number
): ShapeAnnotation {
  // Same corner-order normalization as makeBracket: a shape's width/height
  // must not go negative just because ChemDraw wrote the far corner first.
  const px = Math.min(x1, x2) * scale, py = Math.min(y1, y2) * scale;
  const pw = Math.abs(x2 - x1) * scale, ph = Math.abs(y2 - y1) * scale;
  const thin = Math.max(pw, ph) > 2 && Math.min(pw, ph) <= 2;
  const isLine = variant === "line" || thin;
  return {
    id: nextId(),
    kind: "shape",
    x: px,
    y: py,
    width: isLine ? pw : Math.max(pw, 4),
    height: isLine ? ph : Math.max(ph, 4),
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
  /** CDX's color indexes are 0=black, 1=white, and the file's <color>
   * entries start at index 2 (see the ColorTable property spec). Index 0
   * means "default ink", not "first entry of the table" — treating it as
   * the table's white made TLC plates and spots vanish. */
  const colorAt = (idx: number): string | undefined => {
    if (!Number.isFinite(idx) || idx === 0) return undefined;
    if (idx === 1) return "#ffffff";
    return colortable[idx - 2];
  };

  // --- Bracket attachments. A <bracketedgroup> names the graphics forming
  // its open and close glyphs (GraphicID), which is the only reliable way
  // to tell two otherwise identical narrow glyphs apart. Sorting the
  // attachments left-to-right gives the facings: left opens, right closes.
  const graphicById = new Map<string, Element>();
  for (const g of Array.from(doc.querySelectorAll("graphic"))) {
    const id = g.getAttribute("id");
    if (id) graphicById.set(id, g);
  }
  const bracketFacing = new Map<string, BracketAnnotation["facing"]>();
  for (const group of Array.from(doc.querySelectorAll("bracketedgroup"))) {
    const attached = Array.from(group.querySelectorAll("bracketattachment"))
      .map((a) => {
        const id = a.getAttribute("GraphicID");
        const g = id ? graphicById.get(id) : undefined;
        const bbox = g ? parseBBox(g) : null;
        return g && bbox ? { id, x: Math.min(bbox[0], bbox[2]) } : null;
      })
      .filter((v): v is { id: string; x: number } => v !== null && !!v.id)
      .sort((a, b) => a.x - b.x);
    if (attached.length === 2) {
      bracketFacing.set(attached[0].id, "open");
      bracketFacing.set(attached[1].id, "close");
    }
  }

  // --- Straight-line graphics: reaction / resonance / equilibrium arrows.
  const harpoons: HarpoonLine[] = [];
  for (const g of Array.from(doc.querySelectorAll("graphic"))) {
    // ChemDraw "upgrades" an old graphic in place and leaves the original
    // behind with SupersededBy pointing at its replacement. Reading both
    // would draw the arrow twice (and the stale line graphic usually has no
    // Head/Tail, so it would also arrive as a stray plain line).
    if (g.getAttribute("SupersededBy")) continue;
    const type = (g.getAttribute("GraphicType") ?? "").trim().toLowerCase();
    const bbox = parseBBox(g);
    if (!bbox) continue;
    const [rx1, ry1, rx2, ry2] = bbox;

    if (type === "line") {
      // Older ChemDraw files name the head class in ArrowType instead of
      // Head ("FullHead", "HalfHead", ...). Only use it when Head is
      // genuinely absent — it describes the same pointed end.
      const headRaw = (g.getAttribute("Head") ?? g.getAttribute("ArrowType") ?? "").trim().toLowerCase();
      const tailRaw = (g.getAttribute("Tail") ?? "").trim().toLowerCase();
      const head = cdxHeadClass(headRaw);
      const tail = cdxHeadClass(tailRaw);
      // The retrosynthetic arrow is CDX's own head class on a plain line
      // graphic — check the raw attribute before collapsing to the generic
      // head classes, so the disconnection arrow keeps its meaning.
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
      // whose two first corners stand in for the arc's endpoints. The
      // bounding box's centre tells which side the arc bulges toward (see
      // arcBow), so the imported curve at least bows the same way.
      const head = cdxHeadClass(g.getAttribute("Head"));
      const tail = cdxHeadClass(g.getAttribute("Tail"));
      if (head === "none" && tail === "none") continue;
      const bow = arcBow(rx1, ry1, rx2, ry2, bbox);
      const headEnd = head !== "none" ? head : tail;
      const barb = headEnd === "half" ? "single" : "full";
      const hx = cdxHeadSize(g.getAttribute("HeadSize"));
      room();
      if (head !== "none" || tail === "none") {
        annotations.push(makeArrow(rx1, ry1, rx2, ry2, bow.variant, scale, barb, bow.curvature, hx));
      } else {
        annotations.push(makeArrow(rx2, ry2, rx1, ry1, bow.variant, scale, barb, bow.curvature, hx));
      }
    } else if (type === "rectangle" || type === "rect" || type === "oval" || type === "ellipse" || type === "circle" || type === "polygon" || type === "arc" || type === "curve" || type === "polyline" || type === "roundedrect" || type === "roundrect" || type === "triangle" || type === "hexagon") {
      // ChemDraw's graphics-primitive tools: import as this app's shape
      // annotations (see makeShape — a degenerate sliver becomes a line,
      // since ChemDraw draws thin rules as Rectangles).
      const shapeVariant: ShapeAnnotation["variant"] =
        type === "oval" || type === "ellipse" || type === "circle" ? "ellipse" :
        type === "polygon" ? "polygon" :
        type === "arc" ? "arc" :
        type === "curve" ? "curve" :
        type === "polyline" ? "polyline" :
        type === "roundedrect" || type === "roundrect" ? "roundedRect" :
        type === "triangle" ? "triangle" :
        type === "hexagon" ? "hexagon" :
        "rectangle";
      room();
      const shapeAnn = makeShape(rx1, ry1, rx2, ry2, shapeVariant, scale);
      // Parse additional attributes
      const fillType = (g.getAttribute("FillType") ?? "").toLowerCase();
      const fillPattern = (g.getAttribute("FillPattern") ?? "").toLowerCase();
      const lineStyle = (g.getAttribute("LineStyle") ?? "").toLowerCase();
      const lineCap = (g.getAttribute("LineCap") ?? "").toLowerCase();
      const lineJoin = (g.getAttribute("LineJoin") ?? "").toLowerCase();
      if (fillType === "solid" || fillType === "patterned") shapeAnn.filled = true;
      if (fillPattern === "hatch" || fillPattern === "crosshatch" || fillPattern === "dots") shapeAnn.fillPattern = fillPattern as ShapeAnnotation["fillPattern"];
      if (lineStyle === "dashed" || lineStyle === "dotted" || lineStyle === "dashdot") shapeAnn.lineStyle = lineStyle as ShapeAnnotation["lineStyle"];
      if (lineCap === "round" || lineCap === "square" || lineCap === "butt") shapeAnn.lineCap = lineCap as ShapeAnnotation["lineCap"];
      if (lineJoin === "miter" || lineJoin === "round" || lineJoin === "bevel") shapeAnn.lineJoin = lineJoin as ShapeAnnotation["lineJoin"];
      // Polygon sides
      const sides = parseInt(g.getAttribute("NumSides") ?? "0", 10);
      if (Number.isFinite(sides) && sides >= 3) shapeAnn.sides = sides;
      // Arc start angle
      const startAngle = parseFloat(g.getAttribute("StartAngle") ?? "NaN");
      if (Number.isFinite(startAngle)) shapeAnn.startAngle = startAngle;
      // Polyline points
      const pointsAttr = g.getAttribute("Points");
      if (pointsAttr) {
        const pts = pointsAttr.trim().split(/\s+/).map(Number);
        if (pts.length >= 4 && pts.length % 2 === 0) {
          shapeAnn.points = [];
          for (let i = 0; i < pts.length; i += 2) {
            shapeAnn.points.push({ x: pts[i], y: pts[i + 1] });
          }
        }
      }
      annotations.push(shapeAnn);
    } else if (type === "bracket" || type === "brace") {
      // BracketType distinguishes the glyph shapes on a Bracket graphic:
      // "Curly" is ChemDraw's brace, "Round" its parenthesis.
      const bracketType = (g.getAttribute("BracketType") ?? "").trim().toLowerCase();
      const variant: BracketAnnotation["variant"] =
        type === "brace" || bracketType === "curly"
          ? "curly"
          : bracketType === "round" || bracketType === "paren"
            ? "paren"
            : "square";
      const left = Math.min(rx1, rx2), right = Math.max(rx1, rx2);
      const top = Math.min(ry1, ry2), bottom = Math.max(ry1, ry2);
      const w = (right - left) * scale;
      room();
      if (w > 60) {
        // A bracket graphic whose bounding box spans the enclosed region
        // is ChemDraw's single two-sided bracket object: import both
        // halves so the pair reads the same way it did there.
        annotations.push(makeBracket(left, top, left + 12 / scale, bottom, variant, "open", scale));
        annotations.push(makeBracket(right - 12 / scale, top, right, bottom, variant, "close", scale));
      } else {
        // A narrow graphic is one glyph. Its facing is only recorded when
        // it belongs to a <bracketedgroup>; otherwise default to open (the
        // common case for a lone bracket, and trivially flippable in-app).
        const id = g.getAttribute("id");
        const facing = (id ? bracketFacing.get(id) : undefined) ?? "open";
        annotations.push(makeBracket(left, top, right, bottom, variant, facing, scale));
      }
    } else if (type === "orbital") {
      // ChemDraw's orbital glyphs map onto this app's own orbital tool:
      // "s" is the circle, "p" the dumbbell, "d" the cloverleaf, "sp"/"sp2"/"sp3"
      // hybrids, and the single-lobe kinds (lobe/hybrid) the teardrop.
      const rawType = (g.getAttribute("OrbitalType") ?? "").trim().toLowerCase();
      const variant: OrbitalAnnotation["variant"] =
        rawType === "s" ? "s" :
        rawType === "p" ? "p" :
        rawType === "d" ? "d" :
        rawType === "sp" ? "sp" :
        rawType === "sp2" ? "sp2" :
        rawType === "sp3" ? "sp3" :
        rawType === "lobe" || rawType.includes("hybrid") ? "lobe" : "p";
      const left = Math.min(rx1, rx2), right = Math.max(rx1, rx2);
      const top = Math.min(ry1, ry2), bottom = Math.max(ry1, ry2);
      const w = (right - left) * scale, h = (bottom - top) * scale;
      const cx = ((left + right) / 2) * scale, cy = ((top + bottom) / 2) * scale;
      // The long axis is the orbital's axis (0° = pointing right; the app's
      // y grows downward, so a vertical glyph points up at -90°).
      const vertical = h >= w;
      const angle = variant === "s" ? 0 : vertical ? -90 : 0;
      // An "s" circle's radius is 0.55 × size in the renderer; p lobes reach
      // `size` each way from the nucleus.
      const size = variant === "s" ? Math.max(w, h) / 1.1 : variant === "p" || variant === "d" ? Math.max(w, h) / 2 : Math.max(w, h);
      if (size < 1) continue;
      room();
      annotations.push({
        id: nextId(),
        kind: "orbital",
        x: cx,
        y: cy,
        size: clamp(size, 6, 400),
        angle,
        variant,
        filled: (g.getAttribute("FillType") ?? "").trim().toLowerCase() === "solid" || undefined,
      });
    }
    // Anything else (Quad, symbols, ...) has no annotation equivalent —
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

  // --- <arrow> elements: ChemDraw's dedicated reaction-arrow object in
  // newer files. Real ChemDraw writes the geometry as Head3D/Tail3D (and
  // Center3D/MajorAxisEnd3D for arcs), not the x1/y1/x2/y2 form this
  // importer originally assumed — which is why every arrow from a current
  // ChemDraw file used to vanish. Older/hand-written x1/y1/x2/y2 files are
  // still accepted.
  for (const el of Array.from(doc.querySelectorAll("arrow"))) {
    const legacy = ["x1", "y1", "x2", "y2"].map((a) => parseFloat(el.getAttribute(a) ?? ""));
    const legacyOk = legacy.every((v) => Number.isFinite(v));
    const bbox = parseBBox(el);
    const tailPt = parsePoint(el, "Tail3D") ?? (legacyOk ? { x: legacy[0], y: legacy[1] } : bbox ? { x: bbox[0], y: bbox[1] } : null);
    const headPt = parsePoint(el, "Head3D") ?? (legacyOk ? { x: legacy[2], y: legacy[3] } : bbox ? { x: bbox[2], y: bbox[3] } : null);
    if (!tailPt || !headPt) continue;

    // ArrowheadHead/ArrowheadTail carry bare "Full"/"Half"/"None"; fall
    // back to Head/Tail for hand-written files, and to a plain full head
    // when the file says nothing at all (the old x1/y1/x2/y2 behavior).
    const hasHeadAttrs = el.hasAttribute("ArrowheadHead") || el.hasAttribute("ArrowheadTail") || el.hasAttribute("Head") || el.hasAttribute("Tail");
    const head = hasHeadAttrs ? cdxHeadClass(el.getAttribute("ArrowheadHead") ?? el.getAttribute("Head")) : "full";
    const tail = hasHeadAttrs ? cdxHeadClass(el.getAttribute("ArrowheadTail") ?? el.getAttribute("Tail")) : "none";
    if (head === "none" && tail === "none") continue;

    // Parse shaft style attributes
    const shaftStyle = (el.getAttribute("LineStyle") ?? "").toLowerCase();
    const shaftStyleMap: Record<string, ArrowAnnotation["shaftStyle"]> = {
      "dashed": "dashed",
      "bold": "bold",
      "double": "double",
      "solid": "solid",
    };
    const parsedShaftStyle = shaftStyleMap[shaftStyle];

    // Parse head/tail style attributes
    const headType = (el.getAttribute("ArrowheadType") ?? "").toLowerCase();
    const tailType = (el.getAttribute("ArrowheadTailType") ?? "").toLowerCase();
    const headStyleMap: Record<string, ArrowAnnotation["headStyle"]> = {
      "solid": "full",
      "open": "open",
      "circle": "circle",
      "diamond": "diamond",
      "retrosynthetic": "retro",
      "half": "half",
    };
    const tailStyleMap: Record<string, ArrowAnnotation["tailStyle"]> = {
      "none": "none",
      "full": "full",
      "half": "half",
      "open": "open",
    };
    const parsedHeadStyle = headStyleMap[headType];
    const parsedTailStyle = tailStyleMap[tailType];

    // A non-zero AngularSize is how ChemDraw marks a curved arrow (it is
    // absent on straight ones); the bounding box then supplies the bulge
    // side, exactly like legacy Arc graphics.
    const angular = parseFloat(el.getAttribute("AngularSize") ?? "");
    const curved = Number.isFinite(angular) && Math.abs(angular) > 0.5;
    const headSize = cdxHeadSize(el.getAttribute("HeadSize"));
    room();
    if (curved) {
      const points = head !== "none" ? { x1: tailPt.x, y1: tailPt.y, x2: headPt.x, y2: headPt.y } : { x1: headPt.x, y1: headPt.y, x2: tailPt.x, y2: tailPt.y };
      const bow = arcBow(points.x1, points.y1, points.x2, points.y2, bbox);
      const endClass = head !== "none" ? head : tail;
      annotations.push(makeArrow(points.x1, points.y1, points.x2, points.y2, bow.variant, scale, endClass === "half" ? "single" : "full", bow.curvature, headSize, parsedHeadStyle, parsedTailStyle, parsedShaftStyle));
    } else if (head === "full" && tail === "full") {
      annotations.push(makeArrow(tailPt.x, tailPt.y, headPt.x, headPt.y, "resonance", scale, "full", undefined, headSize, parsedHeadStyle, parsedTailStyle, parsedShaftStyle));
    } else if (head === "half" && tail === "half") {
      annotations.push(makeArrow(tailPt.x, tailPt.y, headPt.x, headPt.y, "equilibrium", scale, undefined, undefined, headSize, parsedHeadStyle, parsedTailStyle, parsedShaftStyle));
    } else if (head !== "none") {
      annotations.push(makeArrow(tailPt.x, tailPt.y, headPt.x, headPt.y, "forward", scale, tail === "half" ? "single" : "full", undefined, headSize, parsedHeadStyle, parsedTailStyle, parsedShaftStyle));
    } else {
      annotations.push(makeArrow(headPt.x, headPt.y, tailPt.x, tailPt.y, "forward", scale, undefined, undefined, headSize, parsedHeadStyle, parsedTailStyle, parsedShaftStyle));
    }
  }

  // --- TLC plates. A CDXML plate's frame is its bounding box; each lane
  // holds the spots of one sample, and Rf is already the 0(baseline)-1
  // (solvent front) fraction this app stores as TlcSpot.fy.
  // Enhanced with multiple solvent fronts, UV visualization, staining, lane labels.
  for (const plate of Array.from(doc.querySelectorAll("tlcplate"))) {
    const bbox = parseBBox(plate);
    const tl = parsePoint(plate, "TopLeft");
    const br = parsePoint(plate, "BottomRight");
    let rx1: number, ry1: number, rx2: number, ry2: number;
    if (bbox) [rx1, ry1, rx2, ry2] = bbox;
    else if (tl && br) [rx1, ry1, rx2, ry2] = [tl.x, tl.y, br.x, br.y];
    else continue;
    const x = Math.min(rx1, rx2) * scale, y = Math.min(ry1, ry2) * scale;
    const width = Math.abs(rx2 - rx1) * scale, height = Math.abs(ry2 - ry1) * scale;
    if (width < 10 || height < 10) continue;

    const lanes = Array.from(plate.children).filter((c) => c.tagName.toLowerCase() === "tlclane");
    const spots: TlcSpot[] = [];
    const spotEls: { el: Element; lane: number }[] = [];
    if (lanes.length > 0) {
      lanes.forEach((lane, i) => {
        for (const spot of Array.from(lane.querySelectorAll("tlcspot"))) spotEls.push({ el: spot, lane: i });
      });
    } else {
      for (const spot of Array.from(plate.querySelectorAll("tlcspot"))) spotEls.push({ el: spot, lane: 0 });
    }
    const laneCount = Math.max(1, lanes.length);
    for (const { el, lane } of spotEls) {
      const rf = parseFloat(el.getAttribute("Rf") ?? "");
      if (!Number.isFinite(rf)) continue;
      const colorAttr = el.getAttribute("color");
      const colorIdx = colorAttr != null ? parseInt(colorAttr, 10) || 0 : -1;
      const color = colorIdx >= 0 ? colorAt(colorIdx) : undefined;
      const label = el.getAttribute("Label") ?? undefined;
      const uv = (el.getAttribute("UV") ?? "").toLowerCase();
      const stain = (el.getAttribute("Stain") ?? "").toLowerCase();
      spots.push({
        fx: (lane + 0.5) / laneCount,
        fy: clamp(rf, 0, 1),
        r: clamp(Math.min(width, height) * 0.035, 2.5, 7),
        ...(color && !isBlack(color) ? { color } : {}),
        ...(label ? { label } : {}),
        ...(uv === "254" || uv === "365" || uv === "both" ? { uv: uv as TlcSpot["uv"] } : {}),
        ...(stain ? { stain: stain as TlcSpot["stain"] } : {}),
      });
    }
    room();

    // Parse enhanced plate attributes
    const baselineFraction = parseFloat(plate.getAttribute("OriginFraction") ?? "0.1");
    const solventFrontFraction = parseFloat(plate.getAttribute("SolventFrontFraction") ?? "0.9");
    const showUV = (plate.getAttribute("ShowUV") ?? "no").toLowerCase() === "yes";
    const uvWavelengths = (plate.getAttribute("UVWavelengths") ?? "").split(",").map(s => s.trim()).filter(s => s === "254" || s === "365") as ("254" | "365")[];
    const stainType = (plate.getAttribute("StainType") ?? "").toLowerCase();
    const laneLabels = (plate.getAttribute("LaneLabels") ?? "").split("|").map(s => s.trim()).filter(Boolean);
    const plateSize = (plate.getAttribute("PlateSize") ?? "custom").toLowerCase();
    const showRfValues = (plate.getAttribute("ShowRfValues") ?? "no").toLowerCase() === "yes";

    const ann: TlcPlateAnnotation = {
      id: nextId(),
      kind: "tlc",
      x, y, width, height, spots,
      baselineFraction: Number.isFinite(baselineFraction) ? baselineFraction : undefined,
      solventFrontFractions: Number.isFinite(solventFrontFraction) ? [solventFrontFraction] : undefined,
      showUV: showUV || undefined,
      uvWavelengths: uvWavelengths.length > 0 ? uvWavelengths : undefined,
      stainType: stainType ? stainType as TlcPlateAnnotation["stainType"] : undefined,
      laneLabels: laneLabels.length > 0 ? laneLabels : undefined,
      laneCount: laneCount > 1 ? laneCount : undefined,
      plateSize: plateSize as TlcPlateAnnotation["plateSize"],
      showRfValues: showRfValues || undefined,
    };
    annotations.push(ann);
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
      // A missing color attribute means default ink (CDX index 0) — the
      // file's colortable starts at index 2, so a literal color="0" is
      // default black, not the table's first entry.
      const colorAttr = s.getAttribute("color");
      const colorIdx = colorAttr != null ? parseInt(colorAttr, 10) || 0 : -1;
      const color = colorIdx >= 0 ? colorAt(colorIdx) : undefined;
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
 * the code: curved-arrow curvature is derived from the arc's bounding box,
 * so a near-circular ChemDraw sweep imports as the closest single bulge
 * (drag the curvature handle to reshape it); a lone harpoon line imports as
 * a forward arrow (the closest thing the app has); unknown exotic heads
 * import as plain full heads; text justification and fonts are normalized
 * to the app's own; shapes import as outlines (CDX fill attributes live in
 * the undocumented corner of the format). Retrosynthetic arrows,
 * Bold/Dash bonds, rectangles/ovals, plain lines, orbitals and TLC plates
 * all map onto real annotation kinds now. Atom labels (<t> inside <n>) are
 * correctly treated as part of their atom, not as captions. Orbital glyphs
 * and TLC plates are import-only — CDXML export leaves them out (the app's
 * own project format is the lossless round trip for those).
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
    const [x, y, z] = p.length >= 3 ? p : p.length >= 2 ? p : [0, 0];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("CDXML atom has invalid coordinates");
    const atomicNumber = n.getAttribute("Element") ? parseInt(n.getAttribute("Element")!, 10) : 6;
    const element = ATOMIC_NUMBER_TO_ELEMENT[atomicNumber] ?? "C";
    const charge = parseInt(n.getAttribute("Charge") || "0", 10) || 0;

    const id = nextId();
    idByCdxId.set(cdxId, id);
    rawX.set(id, x);
    rawY.set(id, y);
    mol.atoms[id] = { id, x: 0, y: 0, element, charge, ...(Number.isFinite(z) ? { z } : {}) };
  }

  const bondPairs: { a1: string; a2: string; order: BondOrder; stereo: BondStereo; hollow?: boolean }[] = [];
  for (const b of Array.from(doc.querySelectorAll("b"))) {
    const bCdx = b.getAttribute("B");
    const eCdx = b.getAttribute("E");
    if (!bCdx || !eCdx) continue;
    const beginId = idByCdxId.get(bCdx);
    const endId = idByCdxId.get(eCdx);
    if (!beginId || !endId) continue;
    const order = cdxOrderToOrder(b.getAttribute("Order"));
    const { stereo, swapped, hollow } = cdxDisplayToStereo(b.getAttribute("Display"));
    // Our model always has a1 as the wedge/hash's narrow end; if CDX marked
    // the *other* node as narrow ("...End"), swap so a1 stays narrow.
    bondPairs.push(swapped ? { a1: endId, a2: beginId, order, stereo, hollow } : { a1: beginId, a2: endId, order, stereo, hollow });
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

  for (const { a1, a2, order, stereo, hollow } of bondPairs) {
    const id = nextId();
    mol.bonds[id] = { id, a1, a2, order: stereo === "none" ? order : 1, stereo, doubleSide: "auto", hollow };
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
