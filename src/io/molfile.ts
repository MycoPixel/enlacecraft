import type { BondOrder, BondStereo, Element, Molecule } from "../types/chemistry";
import { emptyMolecule, stripExplicitHydrogens } from "../model/molecule";
import { BOND_LEN, ABBREVIATED_GROUPS, STANDARD_MASS_NUMBER } from "../model/constants";
import { calibrateImportScale } from "./importScale";
import { nextId } from "../model/id";
import { finalizeImportedMolecule, isKnownElement } from "./validate";

const GROUP_BY_ID = Object.fromEntries(ABBREVIATED_GROUPS.map((g) => [g.id, g]));
const GROUP_BY_LABEL = Object.fromEntries(ABBREVIATED_GROUPS.map((g) => [g.label, g.id]));

/**
 * Basic MDL MOL (V2000) reader/writer.
 * Supports: atom block (element, x/y, charge, isotope mass-difference,
 * abbreviated-group labels), bond block (order, wedge/dash/wavy), and the
 * `M  CHG` / `M  ISO` property lines (charges / absolute isotope mass
 * numbers — the modern, unbounded encodings most real writers use).
 * Does not support: 3D coordinates, SGroups, or extended (V3000) format.
 */

function chargeToMolCode(c: number): number {
  switch (c) {
    case 3: return 1;
    case 2: return 2;
    case 1: return 3;
    case -1: return 5;
    case -2: return 6;
    case -3: return 7;
    default: return 0;
  }
}

function molCodeToCharge(code: number): number {
  switch (code) {
    case 1: return 3;
    case 2: return 2;
    case 3: return 1;
    case 5: return -1;
    case 6: return -2;
    case 7: return -3;
    default: return 0;
  }
}

/**
 * Maps an MDL bond-type code to one of our supported orders. 1/2/3 pass
 * through unchanged. Real-world files (not just PubChem's) commonly use
 * type 4 for aromatic bonds instead of Kekulized alternating 1/2 — treating
 * that as a double bond is a reasonable display approximation. Query bond
 * types (5-7: single-or-double, single-or-aromatic, etc.) fall back to a
 * single bond rather than being misinterpreted as something they're not.
 * Type 8 ("any bond") is handled separately, not here — see its own
 * comment at the import call site — since it's the code both this app and
 * OpenChemLib use for a dative/metal-ligand bond, not a query type.
 */
function mdlBondOrderToOrder(code: number): BondOrder {
  if (code === 2) return 2;
  if (code === 3) return 3;
  if (code === 4) return 2; // aromatic
  return 1;
}

export function exportMol(mol: Molecule, name = "molecule"): string {
  const atomIds = Object.keys(mol.atoms);
  const bondList = Object.values(mol.bonds);
  const index: Record<string, number> = {};
  atomIds.forEach((id, i) => (index[id] = i + 1));

  // MOL files traditionally use angstrom-scale coordinates; convert from
  // our pixel-based canvas using an approximate 1.5 Å bond length.
  const scale = 1.5 / BOND_LEN;

  let out = `${name}\n  EnlaceCraft\n\n`;
  out += `${String(atomIds.length).padStart(3)}${String(bondList.length).padStart(3)}`;
  out += "  0  0  0  0  0  0  0  0999 V2000\n";

  for (const id of atomIds) {
    const a = mol.atoms[id];
    const x = (a.x * scale).toFixed(4);
    const y = (-a.y * scale).toFixed(4);
    out += `${x.padStart(10)}${y.padStart(10)}${"0.0000".padStart(10)} `;
    const symbol = a.group ? GROUP_BY_ID[a.group]?.label ?? a.element : a.element;
    // MDL's mass-difference field is the isotope's mass number minus the
    // standard/most-abundant one for that element (e.g. +1 for D relative
    // to H-1) — clamped to the format's single-digit range; anything more
    // exotic than that (not a concern for our own preset list) falls back
    // to 0 rather than writing a garbled value.
    const massDiff = a.isotope ? Math.max(-9, Math.min(9, a.isotope - (STANDARD_MASS_NUMBER[a.element] ?? a.isotope))) : 0;
    // Field widths match the V2000 spec exactly: symbol(3) + mass-diff(2)
    // + charge(3), then ten more unused 3-char fields (stereo parity, H
    // count, stereo-care, valence, ...). This app's own importer above
    // tokenizes by whitespace rather than fixed columns, so it never
    // noticed, but an earlier version of this line had a stray extra
    // space and a too-narrow charge field — harmless to this app, but a
    // stricter external reader (or, as found while validating stereo-
    // SMILES output, RDKit's own atom-map-number field alignment) could
    // misparse it.
    out += `${symbol.padEnd(3)}${String(massDiff).padStart(2)}${String(chargeToMolCode(a.charge)).padStart(3)}`;
    out += "  0  0  0  0  0  0  0  0  0  0\n";
  }

  for (const b of bondList) {
    // Dative bonds are written as MDL type 8 ("any bond") rather than
    // their own order — the same code OpenChemLib's own writer uses for
    // its native cBondTypeMetalLigand (verified against its output before
    // relying on it here), and its reader maps type 8 straight back to
    // that same bond type, order 0 for its own valence purposes — which
    // is exactly why usedValence() (see valence.ts) also excludes dative
    // bonds from its sum, independently arriving at the same convention
    // OpenChemLib already uses internally. Standard MDL V2000 has no
    // dedicated "dative bond" code, so type 8 is the closest compatible
    // choice, not a made-up one.
    const stereoCode = b.dative ? 0 : b.stereo === "wedge" ? 1 : b.stereo === "dash" ? 6 : b.stereo === "wavy" ? 4 : 0;
    const orderCode = b.dative ? 8 : b.order;
    out += `${String(index[b.a1]).padStart(3)}${String(index[b.a2]).padStart(3)}`;
    out += `${String(orderCode).padStart(3)}${String(stereoCode).padStart(3)}  0  0  0\n`;
  }

  // --- Optional properties -----------------------------------------
  // Written between the bond block and M  END, in the order a CTfile
  // reader expects (any order is legal, but grouping them keeps diffs of
  // two exports of the same molecule readable).

  // Atom map numbers, as "M  MAP": a count then 3-char (atom index, map
  // number) pairs. This is the legacy V2000 carrier for reaction atom
  // mapping. Worth being precise about its limits: the current BIOVIA spec
  // documents atom-atom mapping as a V3000 atom-block field (aamap), and
  // this M  MAP line is a widely-honoured-but-technically-V2000-era
  // convention — RDKit, for one, reads it but writes V3000. It is written
  // here because it's what most V2000 tooling in the wild understands, and
  // because our own importer reads it back, so an EnlaceCraft -> molfile ->
  // EnlaceCraft round trip preserves the numbers exactly.
  const mappedAtoms = atomIds
    .map((id, i) => ({ index: i + 1, mapNumber: mol.atoms[id].mapNumber }))
    .filter((a): a is { index: number; mapNumber: number } => typeof a.mapNumber === "number");
  if (mappedAtoms.length > 0) {
    out += `M  MAP${String(mappedAtoms.length).padStart(3)}`;
    for (const { index, mapNumber } of mappedAtoms) {
      out += `${String(index).padStart(3)}${String(mapNumber).padStart(3)}`;
    }
    out += "\n";
  }

  // Highlight colors, as "M  HIG" + "M  HCOL". HIG lists each highlighted
  // atom with a color index; HCOL defines what each index means. Same
  // caveat as M  MAP: highlighting is formally a V3000 collection block
  // (MDLV30/HILITE), and these two V2000 lines are the legacy carrier that
  // a fair amount of tooling still understands. Imported back below so the
  // round trip is lossless within this app.
  const highlightedAtoms = atomIds
    .map((id, i) => ({ index: i + 1, color: mol.atoms[id].highlightColor }))
    .filter((a): a is { index: number; color: string } => typeof a.color === "string" && !!a.color);
  if (highlightedAtoms.length > 0) {
    // Distinct colors in first-use order; HIG refers to them by 1-based
    // index into this list.
    const palette: string[] = [];
    for (const { color } of highlightedAtoms) {
      if (!palette.includes(color)) palette.push(color);
    }
    out += `M  HIG${String(highlightedAtoms.length).padStart(3)}`;
    for (const { index, color } of highlightedAtoms) {
      out += `${String(index).padStart(3)}${String(palette.indexOf(color) + 1).padStart(3)}`;
    }
    out += "\n";
    out += `M  HCOL${String(palette.length).padStart(3)}`;
    for (const color of palette) {
      const { r, g, b } = hexToRgb(color);
      out += `${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }
    out += "\n";
  }

  out += "M  END\n";
  return out;
}

/** "#rrggbb" -> integer components. Tolerates a missing leading # and
 * short hex; returns black for anything unparseable rather than throwing,
 * since a highlight color is decoration and shouldn't be able to fail an
 * export. */
function hexToRgb(color: string): { r: number; g: number; b: number } {
  const hex = color.replace(/^#/, "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function importMol(text: string): Molecule {
  const lines = text.split(/\r?\n/);
  const counts = lines[3] || "";
  const natoms = parseInt(counts.slice(0, 3), 10) || 0;
  const nbonds = parseInt(counts.slice(3, 6), 10) || 0;

  const mol = emptyMolecule();
  const ids: string[] = [];
  // Raw, unscaled coordinates as written in the file — bond lengths are
  // measured from these before we know what scale factor to apply.
  const rawX: number[] = [];
  const rawY: number[] = [];

  for (let i = 0; i < natoms; i++) {
    const line = lines[4 + i] || "";
    const x = parseFloat(line.slice(0, 10));
    const y = parseFloat(line.slice(10, 20));
    // Everything after the x/y/z coordinate block (columns 1-30) is
    // whitespace-separated fields: symbol, mass-diff, charge-code, ... —
    // tokenizing instead of fixed-slicing means this works whether the
    // symbol is a normal 1-2 character element or a longer abbreviated-
    // group label like "Boc" (which wouldn't fit a strict 3-column field).
    const rest = line.slice(30).trim().split(/\s+/);
    const symbol = (rest[0] || "C").trim();
    const massDiff = parseInt(rest[1], 10) || 0;
    const chgCode = parseInt(rest[2], 10) || 0;
    // A truncated file (fewer atom lines than the counts line promised) or
    // garbage coordinates used to produce NaN atoms that broke rendering
    // and export later; refuse it up front instead.
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Invalid or missing coordinates for atom ${i + 1}`);
    }
    const id = nextId();
    ids.push(id);
    rawX.push(x);
    rawY.push(y);

    const groupId = GROUP_BY_LABEL[symbol];
    if (groupId) {
      mol.atoms[id] = { id, x: 0, y: 0, element: "C", charge: molCodeToCharge(chgCode), group: groupId };
    } else if (symbol === "D" || symbol === "T") {
      // Some writers use D/T for hydrogen isotopes instead of a mass-diff.
      mol.atoms[id] = { id, x: 0, y: 0, element: "H", charge: molCodeToCharge(chgCode), isotope: symbol === "D" ? 2 : 3 };
    } else if (!isKnownElement(symbol)) {
      // Query/R-group/pseudo atoms ("R", "R#", "A", "*", "Xx"...) aren't
      // elements. Keep them as visible placeholder labels (the same
      // representation the app uses for an unrecognized abbreviation)
      // rather than smuggling a non-element string into `element`, which
      // has no valence/weight entry and breaks formula and MW math.
      mol.atoms[id] = { id, x: 0, y: 0, element: "C", charge: molCodeToCharge(chgCode), group: symbol.slice(0, 64) };
    } else {
      const element: Element = symbol;
      const isotope = massDiff !== 0 && STANDARD_MASS_NUMBER[element] ? STANDARD_MASS_NUMBER[element] + massDiff : undefined;
      mol.atoms[id] = {
        id,
        x: 0,
        y: 0,
        element,
        charge: molCodeToCharge(chgCode),
        isotope,
      };
    }
  }

  const bondPairs: { a1: string; a2: string; order: BondOrder; stereo: BondStereo; dative: boolean }[] = [];
  for (let i = 0; i < nbonds; i++) {
    const line = lines[4 + natoms + i] || "";
    const a1 = ids[parseInt(line.slice(0, 3), 10) - 1];
    const a2 = ids[parseInt(line.slice(3, 6), 10) - 1];
    const rawOrderCode = parseInt(line.slice(6, 9), 10) || 1;
    // Type 8 ("any bond") is how both this app and OpenChemLib write a
    // dative/metal-ligand bond (see exportMol's comment) — checked before
    // handing off to mdlBondOrderToOrder, which treats 8 as just another
    // unrecognized query type and falls back to a plain single bond. A
    // file written by some other tool that happens to use type 8 for an
    // actual query bond, rather than a coordination bond, will still just
    // come in as a plain single bond with the arrow rendering — order 1
    // either way, only the dative flag (and thus the arrowhead) differs.
    const dative = rawOrderCode === 8;
    const order = dative ? 1 : mdlBondOrderToOrder(rawOrderCode);
    const stereoCode = parseInt(line.slice(9, 12), 10) || 0;
    const stereo: BondStereo = dative ? "none" : stereoCode === 1 ? "wedge" : stereoCode === 6 ? "dash" : stereoCode === 4 ? "wavy" : "none";
    if (a1 && a2) bondPairs.push({ a1, a2, order, stereo, dative });
  }

  // Different sources (hand-authored files, various drawing programs,
  // PubChem, etc.) don't agree on a coordinate scale — some use angstroms
  // with a ~1.5 bond length, some use arbitrary drawing units, some are
  // already pixel-scale. Assuming any one fixed convention (as a flat
  // angstrom->pixel factor would) produces molecules that render at the
  // wrong size relative to our own drawing tools: bonds/rings come in
  // noticeably smaller (or larger) than BOND_LEN, and since our hit-testing
  // radii are calibrated to BOND_LEN, short bonds become impossible to
  // click without hitting an atom instead (so double bonds etc. can't be
  // edited). Instead, measure the file's *actual* median bond length and
  // scale so that maps onto our own BOND_LEN — this self-calibrates
  // regardless of the source's original units. See calibrateImportScale's
  // doc comment for why heavy-heavy bonds are measured separately.
  const idToIndex = new Map(ids.map((id, i) => [id, i]));
  const allLengths: number[] = [];
  const heavyLengths: number[] = [];
  for (const { a1, a2 } of bondPairs) {
    const i1 = idToIndex.get(a1);
    const i2 = idToIndex.get(a2);
    if (i1 === undefined || i2 === undefined) continue;
    const d = Math.hypot(rawX[i1] - rawX[i2], rawY[i1] - rawY[i2]);
    if (d <= 1e-6) continue;
    allLengths.push(d);
    if (mol.atoms[a1].element !== "H" && mol.atoms[a2].element !== "H") heavyLengths.push(d);
  }
  const scale = calibrateImportScale(allLengths, heavyLengths, 1.5);

  ids.forEach((id, i) => {
    mol.atoms[id].x = rawX[i] * scale;
    mol.atoms[id].y = -rawY[i] * scale;
  });

  for (const { a1, a2, order, stereo, dative } of bondPairs) {
    const id = nextId();
    mol.bonds[id] = { id, a1, a2, order: stereo === "none" ? order : 1, stereo, doubleSide: "auto", dative: dative || undefined };
  }

  // "M  CHG" property lines are the modern, unbounded way to specify formal
  // charges and take precedence over the inline atom-block charge column
  // (which only encodes a handful of preset values). Many real-world MOL/SDF
  // writers — including PubChem's — use this instead of the inline column.
  for (let i = 4 + natoms + nbonds; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("M  END")) break;
    if (line.startsWith("M  CHG")) {
      const count = parseInt(line.slice(6, 9), 10) || 0;
      for (let k = 0; k < count; k++) {
        const base = 9 + k * 8;
        const atomIndex = parseInt(line.slice(base, base + 4), 10);
        const chargeValue = parseInt(line.slice(base + 4, base + 8), 10);
        const atomId = ids[atomIndex - 1];
        if (atomId && mol.atoms[atomId] && Number.isFinite(chargeValue)) {
          mol.atoms[atomId] = { ...mol.atoms[atomId], charge: chargeValue };
        }
      }
      continue;
    }
    // "M  ISO" uses the exact same 8-char entry stride as "M  CHG" (count
    // field, then atom-index + value pairs), but the two isotope encodings
    // in V2000 differ in *semantics*, which is easy to get wrong: the atom
    // block's inline column holds a mass DIFFERENCE (13C is written as +1
    // relative to 12C, deuterium as +1 relative to 1H — see the atom loop
    // above), while "M  ISO" holds the ABSOLUTE mass number (13, 2, ...).
    // OpenChemLib, PubChem, and ChemDraw all write the absolute form, so
    // reading it as a difference would turn every 13C into 14C.
    // A value equal to the element's standard mass is stored as absent —
    // same meaning, but keeps Atom.isotope's "absent = standard" convention.
    if (line.startsWith("M  ISO")) {
      const isoCount = parseInt(line.slice(6, 9), 10) || 0;
      for (let k = 0; k < isoCount; k++) {
        const base = 9 + k * 8;
        const atomIndex = parseInt(line.slice(base, base + 4), 10);
        const massNumber = parseInt(line.slice(base + 4, base + 8), 10);
        const atomId = ids[atomIndex - 1];
        if (!atomId || !mol.atoms[atomId] || !Number.isFinite(massNumber) || massNumber <= 0) continue;
        const atom = mol.atoms[atomId];
        const standard = STANDARD_MASS_NUMBER[atom.element];
        const isotope = standard !== undefined && standard === massNumber ? undefined : massNumber;
        mol.atoms[atomId] = { ...atom, isotope };
      }
    }
  }

  // Atom map numbers ("M  MAP") and highlight colors ("M  HIG" + "M  HCOL"),
  // matching what exportMol writes. Both are collected first and applied
  // after the property scan, because HCOL defines the palette that HIG
  // indexes into and is therefore free to appear on either side of it in a
  // third-party file — resolving as we go would break that ordering.
  const mapNumbers: { atomId: string; mapNumber: number }[] = [];
  const highlights: { atomId: string; colorIndex: number }[] = [];
  let highlightPalette: string[] = [];

  for (let i = 4 + natoms + nbonds; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("M  END")) break;

    if (line.startsWith("M  MAP")) {
      const count = parseInt(line.slice(6, 9), 10) || 0;
      for (let k = 0; k < count; k++) {
        const base = 9 + k * 6;
        const atomIndex = parseInt(line.slice(base, base + 3), 10);
        const mapNumber = parseInt(line.slice(base + 3, base + 6), 10);
        const atomId = ids[atomIndex - 1];
        if (atomId && mol.atoms[atomId] && Number.isFinite(mapNumber)) {
          mapNumbers.push({ atomId, mapNumber });
        }
      }
    } else if (line.startsWith("M  HIG")) {
      const count = parseInt(line.slice(6, 9), 10) || 0;
      for (let k = 0; k < count; k++) {
        const base = 9 + k * 6;
        const atomIndex = parseInt(line.slice(base, base + 3), 10);
        const colorIndex = parseInt(line.slice(base + 3, base + 6), 10);
        const atomId = ids[atomIndex - 1];
        if (atomId && mol.atoms[atomId] && Number.isFinite(colorIndex)) {
          highlights.push({ atomId, colorIndex });
        }
      }
    } else if (line.startsWith("M  HCOL")) {
      // "M  HCOL" is seven characters, one longer than the other property
      // keywords, so its count field starts at column 7 rather than 6.
      const count = parseInt(line.slice(7, 10), 10) || 0;
      highlightPalette = [];
      for (let k = 0; k < count; k++) {
        const hex = line.slice(10 + k * 6, 10 + (k + 1) * 6).trim();
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          highlightPalette.push(`#${hex.toLowerCase()}`);
        } else {
          // Keep indices aligned with what HIG references rather than
          // shifting every later color by one.
          highlightPalette.push("#000000");
        }
      }
    }
  }

  for (const { atomId, mapNumber } of mapNumbers) {
    if (mol.atoms[atomId]) mol.atoms[atomId] = { ...mol.atoms[atomId], mapNumber };
  }
  for (const { atomId, colorIndex } of highlights) {
    const color = highlightPalette[colorIndex - 1];
    // A HIG entry with no matching HCOL definition can't be colored; leave
    // the atom alone rather than inventing black.
    if (color && mol.atoms[atomId]) mol.atoms[atomId] = { ...mol.atoms[atomId], highlightColor: color };
  }

  // Many real-world MOL/SDF files — including PubChem's — list every hydrogen
  // as an explicit atom with its own bond, rather than leaving them implicit.
  // Our display convention is skeletal (implicit H, shown only via the "Show
  // Hydrogens" toggle), so strip simple terminal hydrogens back out here;
  // implicitH() will correctly re-derive the same H count from valence for
  // display, without needing real atom/bond nodes for each one.
  return stripExplicitHydrogens(finalizeImportedMolecule(mol));
}
