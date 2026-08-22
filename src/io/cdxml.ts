import type { BondOrder, BondStereo, Element, Molecule } from "../types/chemistry";
import { emptyMolecule } from "../model/molecule";
import { BOND_LEN, PERIODIC_TABLE } from "../model/constants";
import { calibrateImportScale } from "./importScale";
import { nextId } from "../model/id";

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
 * Supports: atoms (element, position, charge), bonds (order, wedge/hash/wavy).
 * Does not support: CDX's stereo/query bond types, reaction schemes,
 * multi-fragment layout, or any of ChemDraw's richer annotation objects
 * (those map to this app's own annotation layer, which is a separate
 * concept from CDX's text/graphic objects and isn't round-tripped here).
 * Abbreviated-group atoms ("Boc", "Ph", ...) export as a plain carbon —
 * CDX has its own "nickname" node schema for these, but without a
 * confirmed spec to validate against, guessing at it risks writing a file
 * ChemDraw can't open, which is worse than the label simply not surviving
 * the round trip. MOL export (molfile.ts) preserves the label instead,
 * via the well-established convention of writing the abbreviation
 * directly as the atom symbol.
 */

/** Atomic number <-> element symbol, derived from the full PERIODIC_TABLE
 * (model/constants.ts) rather than hand-listed here. */
const ATOMIC_NUMBER_TO_ELEMENT: Record<number, Element> = Object.fromEntries(
  PERIODIC_TABLE.map((e) => [e.number, e.symbol])
);
const ELEMENT_TO_ATOMIC_NUMBER: Record<Element, number> = Object.fromEntries(
  PERIODIC_TABLE.map((e) => [e.symbol, e.number])
) as Record<Element, number>;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function exportCdxml(mol: Molecule, name = "molecule"): string {
  const atomIds = Object.keys(mol.atoms);
  const bondList = Object.values(mol.bonds);

  // ChemDraw's conventional default bond length is 30 drawing units;
  // scaling our pixel-based canvas onto that convention keeps the geometry
  // (and text/bond proportions ChemDraw derives from BondLength) sane.
  // Unlike MDL molfiles, CDXML's Y axis already increases downward — the
  // same convention this app's canvas uses — so no sign flip is needed here.
  const scale = 30 / BOND_LEN;

  let out = `<?xml version="1.0" encoding="UTF-8" ?>\n`;
  out += `<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n`;
  out += `<CDXML CreationProgram="EnlaceCraft" Name="${escapeXml(name)}" BondLength="30" LabelFont="3" LabelSize="10" CaptionFont="3" CaptionSize="10" FractionalWidths="yes" InterpretChemically="yes">\n`;
  out += `<colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/></colortable>\n`;
  out += `<fonttable><font id="3" charset="iso-8859-1" name="Arial"/></fonttable>\n`;
  out += `<page>\n<fragment id="${nextId()}">\n`;

  const cdxIdOf: Record<string, string> = {};
  for (const id of atomIds) {
    const a = mol.atoms[id];
    const cdxId = nextId();
    cdxIdOf[id] = cdxId;
    const x = (a.x * scale).toFixed(4);
    const y = (a.y * scale).toFixed(4);
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
    if (b.stereo === "wedge") attrs += ` Display="WedgeBegin"`;
    else if (b.stereo === "dash") attrs += ` Display="WedgedHashBegin"`;
    else if (b.stereo === "wavy") attrs += ` Display="Wavy"`;
    out += `<b ${attrs}/>\n`;
  }

  out += `</fragment>\n</page>\n</CDXML>\n`;
  return out;
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
    default:
      return { stereo: "none", swapped: false };
  }
}

export function importCdxml(text: string): Molecule {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Not a valid CDXML file");
  }

  const mol = emptyMolecule();
  const idByCdxId = new Map<string, string>();
  const rawX = new Map<string, number>();
  const rawY = new Map<string, number>();

  for (const n of Array.from(doc.querySelectorAll("n"))) {
    const cdxId = n.getAttribute("id");
    if (!cdxId) continue;
    const p = (n.getAttribute("p") || "0 0").trim().split(/\s+/).map(Number);
    const [x, y] = p.length >= 2 ? p : [0, 0];
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

  return mol;
}
