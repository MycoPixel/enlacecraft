import type { BondOrder, BondStereo, Element, Molecule } from "../types/chemistry";
import { emptyMolecule, stripExplicitHydrogens } from "../model/molecule";
import { BOND_LEN, ABBREVIATED_GROUPS, STANDARD_MASS_NUMBER } from "../model/constants";
import { calibrateImportScale } from "./importScale";
import { nextId } from "../model/id";

const GROUP_BY_ID = Object.fromEntries(ABBREVIATED_GROUPS.map((g) => [g.id, g]));
const GROUP_BY_LABEL = Object.fromEntries(ABBREVIATED_GROUPS.map((g) => [g.label, g.id]));

/**
 * Basic MDL MOL (V2000) reader/writer.
 * Supports: atom block (element, x/y, charge, isotope mass-difference,
 * abbreviated-group labels), bond block (order, wedge/dash/wavy).
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
 * types (5-8: single-or-double, single-or-aromatic, etc.) fall back to a
 * single bond rather than being misinterpreted as something they're not.
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
    const stereoCode = b.stereo === "wedge" ? 1 : b.stereo === "dash" ? 6 : b.stereo === "wavy" ? 4 : 0;
    out += `${String(index[b.a1]).padStart(3)}${String(index[b.a2]).padStart(3)}`;
    out += `${String(b.order).padStart(3)}${String(stereoCode).padStart(3)}  0  0  0\n`;
  }

  out += "M  END\n";
  return out;
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
    const id = nextId();
    ids.push(id);
    rawX.push(x);
    rawY.push(y);

    const groupId = GROUP_BY_LABEL[symbol];
    if (groupId) {
      mol.atoms[id] = { id, x: 0, y: 0, element: "C", charge: molCodeToCharge(chgCode), group: groupId };
    } else {
      const element = (symbol || "C") as Element;
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

  const bondPairs: { a1: string; a2: string; order: BondOrder; stereo: BondStereo }[] = [];
  for (let i = 0; i < nbonds; i++) {
    const line = lines[4 + natoms + i] || "";
    const a1 = ids[parseInt(line.slice(0, 3), 10) - 1];
    const a2 = ids[parseInt(line.slice(3, 6), 10) - 1];
    const order = mdlBondOrderToOrder(parseInt(line.slice(6, 9), 10) || 1);
    const stereoCode = parseInt(line.slice(9, 12), 10) || 0;
    const stereo: BondStereo = stereoCode === 1 ? "wedge" : stereoCode === 6 ? "dash" : stereoCode === 4 ? "wavy" : "none";
    if (a1 && a2) bondPairs.push({ a1, a2, order, stereo });
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

  for (const { a1, a2, order, stereo } of bondPairs) {
    const id = nextId();
    mol.bonds[id] = { id, a1, a2, order: stereo === "none" ? order : 1, stereo, doubleSide: "auto" };
  }

  // "M  CHG" property lines are the modern, unbounded way to specify formal
  // charges and take precedence over the inline atom-block charge column
  // (which only encodes a handful of preset values). Many real-world MOL/SDF
  // writers — including PubChem's — use this instead of the inline column.
  for (let i = 4 + natoms + nbonds; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("M  END")) break;
    if (!line.startsWith("M  CHG")) continue;
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
  }

  // Many real-world MOL/SDF files — including PubChem's — list every hydrogen
  // as an explicit atom with its own bond, rather than leaving them implicit.
  // Our display convention is skeletal (implicit H, shown only via the "Show
  // Hydrogens" toggle), so strip simple terminal hydrogens back out here;
  // implicitH() will correctly re-derive the same H count from valence for
  // display, without needing real atom/bond nodes for each one.
  return stripExplicitHydrogens(mol);
}
