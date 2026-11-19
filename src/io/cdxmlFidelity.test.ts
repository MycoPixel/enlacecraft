// @vitest-environment jsdom
//
// CDXML fidelity matrix (Octet Draw plan, Phase 9): a
// table-driven import → export → import matrix over the whole fixture
// corpus, a hostile-input fuzz suite for the importer, and a unicode
// round-trip check.
//
// Round trips assert *fidelity of structure*, not whole-object equality:
// ids are regenerated on every import and a few documented approximations
// (see each row's `checks`) mean geometry/exact text styles can drift, so
// the matrix compares multisets and counts via the `fidelity()` helper.
import { describe, expect, test } from "vitest";
import { emptyMolecule } from "../model/molecule";
import { exportCdxmlDocument, importCdxmlDocument } from "./cdxml";
import type { Annotation, ArrowAnnotation, BracketAnnotation, TlcPlateAnnotation, TextAnnotation } from "../types/chemistry";
import chemdrawScheme from "./fixtures/chemdraw-scheme.cdxml?raw";
import rdkitSgroups from "./fixtures/rdkit-sgroups.cdxml?raw";
import rdkitDative from "./fixtures/rdkit-dative.cdxml?raw";
import rdkitWavy from "./fixtures/rdkit-wavy.cdxml?raw";
import rdkitAromatic from "./fixtures/rdkit-aromatic.cdxml?raw";
import rdkitReactionBoc from "./fixtures/rdkit-reaction-boc.cdxml?raw";
import captionText from "./fixtures/caption-text.cdxml?raw";
import unicodeText from "./fixtures/unicode-text.cdxml?raw";
import largeCoordinates from "./fixtures/large-coordinates.cdxml?raw";
import truncated from "./fixtures/truncated.cdxml?raw";

type CdxmlDocument = ReturnType<typeof importCdxmlDocument>;

// --- Type guards -----------------------------------------------------------

const isText = (a: Annotation): a is TextAnnotation => a.kind === "text";
const isArrow = (a: Annotation): a is ArrowAnnotation => a.kind === "arrow";
const isBracket = (a: Annotation): a is BracketAnnotation => a.kind === "bracket";
const isTlc = (a: Annotation): a is TlcPlateAnnotation => a.kind === "tlc";

// --- Fidelity shape --------------------------------------------------------

/** Value → occurrence count, for multiset comparisons. */
function counts(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/**
 * The structure that must survive import → export → import. Tolerant by
 * design: nothing here compares ids, pixel positions or exact font sizes
 * (every import regenerates ids, and caption px sizes drift through the
 * pt round trip because export scales by page BondLength while import
 * self-calibrates from the drawing's own bond geometry).
 */
function fidelity(doc: CdxmlDocument) {
  const mol = doc.molecule;
  const atoms = Object.values(mol.atoms);
  const bonds = Object.values(mol.bonds);
  const arrows = doc.annotations.filter(isArrow);
  const brackets = doc.annotations.filter(isBracket);
  const plates = doc.annotations.filter(isTlc);
  const texts = doc.annotations.filter(isText);
  return {
    atomCount: atoms.length,
    bondCount: bonds.length,
    elements: counts(atoms.map((a) => a.element)),
    // "order:stereo" (or "dative") per bond — captures orders, wedge/hash/
    // wavy styles and dative bonds in one multiset.
    bondKinds: counts(bonds.map((b) => (b.dative ? "dative" : `${b.order}:${b.stereo}`))),
    // Abbreviated-group/nickname atoms ("Ph", "Boc", "COOH", ...).
    labeledAtoms: counts(atoms.map((a) => a.group ?? "")),
    annotationKinds: counts(doc.annotations.map((a) => a.kind)),
    // Curved arrows may flip curved ↔ curvedReverse across a round trip
    // (the bulge side is derived from the arc's bounding box, which the
    // writer does not re-emit), so both variants compare as one class.
    arrowVariants: counts(arrows.map((a) => (a.variant === "curved" || a.variant === "curvedReverse" ? "curved" : a.variant))),
    bracketVariants: counts(brackets.map((a) => a.variant)),
    plateCount: plates.length,
    schemeCount: mol.schemes?.length ?? 0,
    schemeStepCount: (mol.schemes ?? []).reduce((n, s) => n + s.steps.length, 0),
    sgroupTypes: counts(Object.values(mol.sgroups ?? {}).map((s) => s.type)),
    sgroupSubscripts: Object.values(mol.sgroups ?? {})
      .map((s) => s.subscript ?? "")
      .sort(),
    textStyles: counts(texts.flatMap((t) => (["<b>", "<i>", "<u>", "<sub>", "<sup>"].filter((m) => t.html.includes(m))))),
    // Page box rounded to whole points; null when the file had no usable box.
    pageBox: doc.page ? [doc.page.x, doc.page.y, doc.page.width, doc.page.height].map((v) => Math.round(v)) : null,
  };
}

/** The caption texts of a document, tag-stripped and entity-decoded, sorted. */
function plainTexts(doc: CdxmlDocument): string[] {
  return doc.annotations
    .filter(isText)
    .map((t) =>
      t.html
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    )
    .sort();
}

interface BBox { minX: number; maxX: number; minY: number; maxY: number }

function atomBBox(doc: CdxmlDocument): BBox {
  const xs = Object.values(doc.molecule.atoms).map((a) => a.x);
  const ys = Object.values(doc.molecule.atoms).map((a) => a.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function roundTrip(xml: string): { first: CdxmlDocument; second: CdxmlDocument; exported: string } {
  const first = importCdxmlDocument(xml);
  const exported = exportCdxmlDocument(first.molecule, first.annotations, "fidelity-matrix", first.page);
  const second = importCdxmlDocument(exported);
  return { first, second, exported };
}

// --- The matrix ------------------------------------------------------------

interface MatrixRow {
  label: string;
  xml: string;
  /** Which invariants this row checks (beyond the common fidelity shape). */
  checks: string[];
  extra?: (first: CdxmlDocument, second: CdxmlDocument) => void;
}

const MATRIX: MatrixRow[] = [
  {
    label: "chemdraw-scheme (arrows/orbital/TLC/brackets/scheme/page)",
    xml: chemdrawScheme,
    checks: [
      "atom/bond counts + element + bond-kind multisets (incl. WedgeBegin and Bold bonds)",
      "annotation-kind multiset: 4 brackets, 1 orbital, 2 arrows (forward + curved), 1 TLC plate",
      "curved arrow stays curved (curved/curvedReverse compared as one class)",
      "bracket variants: square pair and curly pair both survive",
      "scheme with 1 step survives (SupersededBy arrow indirection)",
      "page box dimensions survive",
      "plate count survives (per-spot counts excluded: multi-lane plates are a known writer gap, see the dedicated test below)",
    ],
  },
  {
    label: "rdkit-sgroups (MultipleGroup bracketed S-group)",
    xml: rdkitSgroups,
    checks: [
      "atom/bond counts + element + bond-kind multisets",
      "S-group type multiset keeps the MultipleGroup (MUL) entry",
      "S-group repeat-count subscript '2' survives",
      "bracket glyph count survives (the pair re-imports as open + close)",
    ],
  },
  {
    label: "rdkit-dative (Order=\"dative\" coordinate bonds)",
    xml: rdkitDative,
    checks: [
      "atom/bond counts + element multiset (includes the Os metal)",
      "all 4 dative bonds survive as dative, not plain singles",
    ],
    extra: (first, second) => {
      expect(Object.values(second.molecule.bonds).filter((b) => b.dative)).toHaveLength(4);
      expect(Object.values(second.molecule.atoms).some((a) => a.element === "Os")).toBe(true);
      expect(fidelity(second).bondKinds).toEqual(fidelity(first).bondKinds);
    },
  },
  {
    label: "rdkit-wavy (Wavy/unknown-stereo bonds)",
    xml: rdkitWavy,
    checks: [
      "atom/bond counts + element + bond-kind multisets (wavy stereo bonds survive as wavy)",
      "labeled-atom multiset survives (NH/O/N labels stay groups, not bare atoms)",
      "annotation multiset survives (arrows/brackets the drawing carries)",
    ],
  },
  {
    label: "rdkit-aromatic (Order=\"1.5\" delocalized bonds)",
    xml: rdkitAromatic,
    checks: [
      "atom count + element multiset survive",
      // This fixture pairs Order="1.5" with Display="Dash" (RDKit draws the
      // aromatic circle dashed); the importer's stereo-precedes-order rule
      // then imports them as dashed bonds, and that bond-kind multiset must
      // survive the round trip unchanged.
      "bond-kind multiset survives (six dashed-stereo bonds stay six dashed-stereo bonds)",
    ],
    extra: (first, second) => {
      expect(Object.values(second.molecule.bonds).map((b) => b.stereo).sort()).toEqual([
        "dashed",
        "dashed",
        "dashed",
        "dashed",
        "dashed",
        "dashed",
      ]);
      expect(fidelity(second).bondKinds).toEqual(fidelity(first).bondKinds);
    },
  },
  {
    label: "rdkit-reaction-boc (scheme/steps + Boc nickname groups)",
    xml: rdkitReactionBoc,
    checks: [
      "atom/bond counts + element + bond-kind multisets",
      "Boc nickname atoms survive as labeled atoms (labeled-atom multiset)",
      "scheme + step counts survive",
    ],
  },
  {
    label: "caption-text (rich caption: bold/italic/sub/superscript runs)",
    xml: captionText,
    checks: [
      "exactly one caption annotation survives",
      "style markers (b, i, sub, sup) survive into the rebuilt annotation HTML",
      "caption plain text is byte-identical across the round trip",
    ],
    extra: (first, second) => {
      expect(plainTexts(second)).toEqual(plainTexts(first));
      expect(plainTexts(second)[0]).toContain("The rate constant kobs = 3.2 × 10-4 s-1 (measured)at 25 °C.");
      for (const t of second.annotations.filter(isText)) expect(t.fontSize).toBeGreaterThan(0);
    },
  },
  {
    label: "unicode-text (Spanish + Greek/superscript characters)",
    xml: unicodeText,
    checks: [
      "both captions survive as text annotations",
      "Spanish/Greek text is byte-identical across the round trip (see the dedicated unicode tests below)",
      "page box dimensions survive",
    ],
    extra: (first, second) => {
      expect(plainTexts(second)).toEqual(plainTexts(first));
    },
  },
  {
    label: "large-coordinates (far-from-origin, negative positions)",
    xml: largeCoordinates,
    checks: [
      "atom/bond counts + element + bond-kind multisets",
      "atoms stay far from the origin and negative: the atom bbox keeps |x| > 80000 and y < -60000",
      "atom bbox width is preserved within 0.5% (self-calibration makes geometry, not absolute units, the contract)",
    ],
    extra: (first, second) => {
      const a = atomBBox(first);
      const b = atomBBox(second);
      expect(b.minX).toBeLessThan(-80000);
      expect(b.maxX).toBeGreaterThan(80000);
      expect(b.maxY).toBeLessThan(-60000);
      const widthA = a.maxX - a.minX;
      expect(Math.abs((b.maxX - b.minX) - widthA) / widthA).toBeLessThan(0.005);
    },
  },
];

describe("CDXML fidelity matrix: import → export → import", () => {
  test.each(MATRIX)("$label", ({ xml, checks, extra }) => {
    expect(checks.length).toBeGreaterThan(0);
    const { first, second } = roundTrip(xml);
    // The whole stable shape (counts + multisets) must be identical.
    expect(fidelity(second)).toEqual(fidelity(first));
    // …plus any row-specific invariants.
    extra?.(first, second);
  });

  test("the matrix covers the whole fixture corpus (9 importable + truncated)", () => {
    expect(MATRIX).toHaveLength(9);
    // truncated.cdxml is the tenth fixture; it cannot round trip (importing
    // it is the controlled-parse-error case in the malformed suite below).
    const truncatedDoc = () => importCdxmlDocument(truncated);
    expect(truncatedDoc).toThrow("Not a valid CDXML file");
  });
});

describe("CDXML fidelity matrix: TLC plate details", () => {
  const plate: TlcPlateAnnotation = {
    id: "tlc-1",
    kind: "tlc",
    x: 100,
    y: 100,
    width: 180,
    height: 260,
    baselineFraction: 0.12,
    laneLabels: ["start", "product"],
    spots: [
      { fx: 0.25, fy: 0.32, r: 4, color: "#cc2200", label: "SM" },
      { fx: 0.75, fy: 0.71, r: 4, label: "P" },
    ],
  };

  test("a single-lane plate round-trips spot-exact (Rf values, labels, colour, origin line)", () => {
    const first = importCdxmlDocument(exportCdxmlDocument(emptyMolecule(), [plate], "tlc", undefined));
    const second = importCdxmlDocument(exportCdxmlDocument(first.molecule, first.annotations, "tlc", first.page));
    const plates = second.annotations.filter(isTlc);
    expect(plates).toHaveLength(1);
    // Lane geometry (fx) is derived from lane position on import, but the
    // chemistry of the plate — one spot per lane, its Rf, label and colour —
    // must come back exactly.
    const fys = plates[0].spots.map((s) => s.fy).sort();
    expect(fys).toEqual([0.32, 0.71]);
    expect(plates[0].spots.map((s) => s.label).sort()).toEqual(["P", "SM"]);
    expect(plates[0].spots.find((s) => s.label === "SM")?.color).toBe("#cc2200");
    expect(plates[0].baselineFraction).toBeCloseTo(0.12, 3);
    expect(plates[0].laneLabels).toEqual(["start", "product"]);
  });

  test.fails(
    "multi-lane plates keep their spot count on round trip (known writer gap: export re-emits every spot into every lane)",
    () => {
      const multiLane: TlcPlateAnnotation = { ...plate, laneCount: 3 };
      const first = importCdxmlDocument(exportCdxmlDocument(emptyMolecule(), [multiLane], "tlc", undefined));
      const second = importCdxmlDocument(exportCdxmlDocument(first.molecule, first.annotations, "tlc", first.page));
      const spots = (d: CdxmlDocument) => d.annotations.filter(isTlc).reduce((n, p) => n + p.spots.length, 0);
      expect(spots(second)).toBe(spots(first)); // currently 6 → 18
    },
  );
});

// --- Unicode round trip ----------------------------------------------------

describe("unicode text round trip", () => {
  test("Spanish text survives export → import byte-faithfully", () => {
    const { first, second, exported } = roundTrip(unicodeText);
    expect(plainTexts(second)).toEqual(plainTexts(first));
    const all = plainTexts(second).join("\n");
    for (const ch of ["¿", "á", "é", "í", "ó", "ú", "ñ"]) {
      expect(all).toContain(ch);
    }
    // The writer's escaping scheme only escapes & < > " — non-ASCII goes
    // into the file literally as UTF-8, never as numeric entities.
    expect(exported).toContain("ñ");
    expect(exported).not.toContain("&#241;");
  });

  test("Greek and superscript-ish characters survive, and XML-special text is escaped per the writer's scheme", () => {
    const { second, exported } = roundTrip(unicodeText);
    const all = plainTexts(second).join("\n");
    for (const ch of ["Δ", "α", "β", "γ", "²", "⁺", "−"]) {
      expect(all).toContain(ch);
    }
    // "< 0" was escaped in the fixture and must come back as a literal "<".
    expect(all).toContain("ΔG = ΔH − TΔS < 0");
    // The raw file must not contain an unescaped "<" from that text.
    expect(exported).toContain("&lt; 0");
  });
});

// --- Malformed-input fuzz --------------------------------------------------

interface FuzzCase {
  name: string;
  xml: string;
  /**
   * Pinned message when the input deterministically takes the controlled
   * throw path; omitted when the input imports cleanly.
   */
  throws?: string;
}

const billionLaughs =
  `<?xml version="1.0"?>` +
  `<!DOCTYPE CDXML [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>` +
  `<CDXML Name="&c;&c;&c;"><page/></CDXML>`;

const deepNesting = `<?xml version="1.0"?><CDXML>${"<a>".repeat(400)}${"</a>".repeat(400)}</CDXML>`;
const hugeAttribute = `<?xml version="1.0"?><CDXML Name="${"A".repeat(64_000)}"><page/></CDXML>`;
const manyRectangles = Array.from({ length: 6_000 }, (_, i) => `<graphic id="g${i}" BoundingBox="0 0 10 10" GraphicType="Rectangle"/>`).join("");
const manyAtoms = Array.from({ length: 21_000 }, (_, i) => `<n id="n${i}" p="0 0"/>`).join("");

const FUZZ: FuzzCase[] = [
  { name: "empty string", xml: "", throws: "Not a valid CDXML file" },
  { name: "whitespace only", xml: "   \n\t  ", throws: "Not a valid CDXML file" },
  { name: "not xml", xml: "not xml at all", throws: "Not a valid CDXML file" },
  { name: "truncated fixture (cut mid-element)", xml: truncated, throws: "Not a valid CDXML file" },
  { name: "truncated inline (unclosed tag)", xml: `<CDXML><page><fragment><n id="1" p="0 0"`, throws: "Not a valid CDXML file" },
  { name: "deeply nested elements (400 levels)", xml: deepNesting },
  { name: "huge attribute value (64KB Name)", xml: hugeAttribute },
  { name: "billion-laughs-style entity expansion (small)", xml: billionLaughs },
  { name: "script tag inside a caption", xml: `<?xml version="1.0"?><CDXML><page><t id="1" p="0 0"><s>hello<script>alert(1)</script></s></t></page></CDXML>` },
  { name: "script tag at page level", xml: `<?xml version="1.0"?><CDXML><page><script>alert(1)</script></page></CDXML>` },
  { name: "CDXML root missing (molecule root)", xml: `<?xml version="1.0"?><molecule><atom id="1"/></molecule>` },
  { name: "CDXML root missing (page root)", xml: `<?xml version="1.0"?><page><fragment><n id="1" p="0 0" Element="6"/></fragment></page>` },
  { name: "wrong root element (html)", xml: `<?xml version="1.0"?><html><body><p>hi</p></body></html>` },
  // A single atom with no bonds takes the fallback scale, so this huge
  // position really does land outside the ±1e6 coordinate clamp and the
  // sanitized rebuild must refuse the atom (a controlled throw, not a
  // silent half-molecule).
  { name: "negative extreme coordinates", xml: `<?xml version="1.0"?><CDXML><page><fragment><n id="1" p="-999999999 -999999999" Element="6"/></fragment></page></CDXML>`, throws: "atoms with invalid data" },
  { name: "NaN coordinates", xml: `<?xml version="1.0"?><CDXML><page><fragment><n id="1" p="NaN NaN" Element="6"/></fragment></page></CDXML>`, throws: "invalid coordinates" },
  { name: "Infinity coordinate values", xml: `<?xml version="1.0"?><CDXML><page><fragment><n id="1" p="1e400 0" Element="6"/></fragment></page></CDXML>`, throws: "invalid coordinates" },
  { name: "Infinity in the page box", xml: `<?xml version="1.0"?><CDXML><page BoundingBox="0 0 1e400 720"><fragment><n id="1" p="0 0" Element="6"/><n id="2" p="42 0" Element="6"/><b id="3" B="1" E="2"/></fragment></page></CDXML>` },
  { name: "duplicate ids with a self-bond", xml: `<?xml version="1.0"?><CDXML><page><fragment><n id="1" p="0 0" Element="6"/><n id="1" p="42 0" Element="7"/><b id="2" B="1" E="1"/></fragment></page></CDXML>` },
  { name: "over the annotation limit", xml: `<?xml version="1.0"?><CDXML><page>${manyRectangles}</page></CDXML>`, throws: "too many annotations" },
  { name: "over the atom limit", xml: `<?xml version="1.0"?><CDXML><page><fragment>${manyAtoms}</fragment></page></CDXML>`, throws: "too many atoms" },
  { name: "undefined entity reference", xml: `<?xml version="1.0"?><CDXML><page><t id="1" p="0 0"><s>&notdefined;</s></t></page></CDXML>`, throws: "Not a valid CDXML file" },
];

/**
 * The fuzz contract: hostile input either imports into a usable document or
 * throws a *controlled* parse/validation Error — never an exotic runtime
 * failure (TypeError/RangeError/stack overflow), and never a crash that the
 * export → re-import path then amplifies.
 */
function expectControlledOutcome(label: string, xml: string): void {
  let doc: CdxmlDocument | undefined;
  let thrown: unknown;
  try {
    doc = importCdxmlDocument(xml);
  } catch (e) {
    thrown = e;
  }

  if (thrown !== undefined) {
    const err = thrown as Error;
    const controlled =
      err instanceof Error &&
      !(err instanceof TypeError) &&
      !(err instanceof RangeError) &&
      typeof err.message === "string" &&
      err.message.length > 0;
    expect(controlled, `${label}: expected a controlled Error, got ${err?.constructor?.name}: ${String(err)}`).toBe(true);
    return;
  }

  expect(doc, `${label}: neither a document nor a throw`).toBeDefined();
  expect(doc!.molecule).toBeDefined();

  // Whatever came back must survive the writer too: export → re-import is
  // itself fed hostile-shaped data here and must stay controlled.
  let again: CdxmlDocument | Error;
  try {
    const exported = exportCdxmlDocument(doc!.molecule, doc!.annotations, "fuzz", doc!.page);
    again = importCdxmlDocument(exported);
  } catch (e) {
    again = e as Error;
  }
  if (again instanceof Error) {
    expect(again).not.toBeInstanceOf(TypeError);
    expect(again).not.toBeInstanceOf(RangeError);
  } else {
    expect(again.molecule).toBeDefined();
  }
}

describe("CDXML fuzz: hostile input never escapes the controlled failure paths", () => {
  test.each(FUZZ)("$name", ({ name, xml, throws }) => {
    if (throws) {
      // Pinned deterministic path — still an Error with that message.
      expect(() => importCdxmlDocument(xml)).toThrow(throws);
    }
    // …and the general never-exotic property holds for every case either way.
    expectControlledOutcome(name, xml);
  });

  test("the corpus is a meaningful size", () => {
    expect(FUZZ.length).toBeGreaterThanOrEqual(20);
  });

  test("duplicate ids resolve to atoms without a self-bond (not a crash)", () => {
    const doc = importCdxmlDocument(FUZZ.find((c) => c.name === "duplicate ids with a self-bond")!.xml);
    expect(Object.keys(doc.molecule.atoms)).toHaveLength(2);
    expect(Object.keys(doc.molecule.bonds)).toHaveLength(0);
  });

  test("a script tag in a caption imports as inert text (DOMPurify-stripped)", () => {
    const doc = importCdxmlDocument(FUZZ.find((c) => c.name === "script tag inside a caption")!.xml);
    const texts = doc.annotations.filter(isText);
    expect(texts).toHaveLength(1);
    expect(texts[0].html).toContain("hello");
    expect(texts[0].html).not.toContain("<script");
    expect(texts[0].html).not.toContain("alert(1)<");
  });
});
