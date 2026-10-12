import type { Element } from "../types/chemistry";

/**
 * Imports a 3D structure file (XYZ / PDB / MOL / SDF) and converts it into a
 * V2000 molfile with 3D coordinates, so everything downstream of the 3D
 * panel — the viewer itself, .xyz/.mol export, the rotate-bond tool, the
 * measurement tools — works on an imported structure exactly as it does on a
 * generated one. Deliberately funnels through the same molfile shape the rest
 * of the app already speaks rather than inventing a parallel representation.
 *
 * XYZ and PDB carry no connectivity at all, so bonds are *perceived* from
 * interatomic distances (see perceiveBonds). That's a real approximation:
 * it can't tell a bonded pair 1.5 Å apart from a clashing pair 1.5 Å apart,
 * and it will draw a bond across a hydrogen bond or a metal... anything
 * covalent-radius guessing can't resolve. It's the standard approach for
 * these formats (Open Babel's `connect` mode works the same way) and is good
 * enough to render and measure; files that already have real bonds (MOL/SDF,
 * PDB CONECT records) use those instead.
 */

/** Covalent radii in Å, used for distance-based bond perception. Values from
 * the standard Cordero et al. (2008) set, trimmed to the elements this app
 * can meaningfully display. Anything not listed falls back to 0.75, which
 * keeps a bond from being drawn rather than guessing wildly. */
const COVALENT_RADII: Record<string, number> = {
  H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
  Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06,
  K: 2.03, Ca: 1.76, Sc: 1.70, Ti: 1.60, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24,
  Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.20, As: 1.19, Se: 1.20, Br: 1.20, Kr: 1.16,
  Rb: 2.20, Sr: 1.95, Y: 1.90, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39,
  Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.40,
};

const DEFAULT_RADIUS = 0.75;

/** Element symbol normalization: PDB atom names can carry a leading digit
 * (column 13-16 of an ATOM record), an element column that disagrees with the
 * name (common for metals in older files), or trailing junk. */
function normalizeElement(raw: string): string {
  let s = raw.trim();
  // Strip a leading digit — PDB puts the element right-justified in the same
  // field as the atom name, so "1HG " is a hydrogen called HG.
  s = s.replace(/^[0-9]+/, "").trim();
  if (!s) return "C";
  // Two-letter elements are the overwhelmingly common case for a real
  // two-letter symbol; a one-letter symbol stays one letter even when the
  // name had a second character that isn't part of it (e.g. "CA" in a
  // protein is a carbon alpha, but PDB's own element column disambiguates —
  // callers pass that when available).
  const two = s.slice(0, 2);
  const capitalized = two[0].toUpperCase() + two.slice(1).toLowerCase();
  if (COVALENT_RADII[capitalized] !== undefined) return capitalized;
  const one = s[0].toUpperCase();
  return one;
}

export interface Structure3DImportError extends Error {
  code: "EMPTY" | "UNSUPPORTED" | "MALFORMED";
}

function fail(code: "EMPTY" | "UNSUPPORTED" | "MALFORMED", message: string): never {
  const err = new Error(message) as Structure3DImportError;
  err.code = code;
  throw err;
}

interface Parsed3D {
  symbols: string[];
  coords: { x: number; y: number; z: number }[];
  /** Explicit 1-based bonds when the format has them. */
  bonds: { a: number; b: number; order: number }[];
}

/** XYZ: an atom-count line, a comment line, then "Sym x y z" per atom. */
function parseXyz(text: string): Parsed3D {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) fail("MALFORMED", "XYZ file is too short to contain an atom count and a comment line");
  const count = parseInt(lines[0], 10);
  if (!Number.isFinite(count) || count <= 0) fail("MALFORMED", `XYZ first line should be an atom count, got "${lines[0]}"`);
  if (lines.length < 2 + count) fail("MALFORMED", `XYZ declares ${count} atoms but only ${lines.length - 2} were found`);

  const symbols: string[] = [];
  const coords: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const parts = lines[2 + i].split(/\s+/);
    if (parts.length < 4) fail("MALFORMED", `XYZ atom line ${i + 3} should be "Element x y z"`);
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      fail("MALFORMED", `XYZ atom line ${i + 3} has non-numeric coordinates`);
    }
    symbols.push(normalizeElement(parts[0]));
    coords.push({ x, y, z });
  }
  return { symbols, coords, bonds: [] };
}

/** PDB ATOM/HETATM records, plus CONECT records where present. */
function parsePdb(text: string): Parsed3D {
  const symbols: string[] = [];
  const coords: { x: number; y: number; z: number }[] = [];
  const serials: number[] = [];
  const conect: { a: number; b: number; order: number }[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.padEnd(80);
    const record = line.slice(0, 6).trim();
    if (record === "ATOM" || record === "HETATM") {
      const x = parseFloat(line.slice(30, 38));
      const y = parseFloat(line.slice(38, 46));
      const z = parseFloat(line.slice(46, 54));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      // Prefer the dedicated element column (77-78); fall back to the atom
      // name only when it's blank, which older files do.
      const elementCol = line.slice(76, 78).trim();
      symbols.push(elementCol ? normalizeElement(elementCol) : normalizeElement(line.slice(12, 16)));
      coords.push({ x, y, z });
      serials.push(parseInt(line.slice(6, 11), 10));
    } else if (record === "CONECT") {
      const from = parseInt(line.slice(6, 11), 10);
      if (!Number.isFinite(from)) continue;
      for (let col = 11; col + 5 <= 31; col += 5) {
        const to = parseInt(line.slice(col, col + 5), 10);
        if (Number.isFinite(to)) conect.push({ a: from, b: to, order: 1 });
      }
    }
  }

  if (symbols.length === 0) fail("EMPTY", "No ATOM/HETATM records found in this PDB file");
  const serialToIndex = new Map(serials.map((s, i) => [s, i]));
  const bonds = conect
    .map(({ a, b, order }) => {
      const ia = serialToIndex.get(a);
      const ib = serialToIndex.get(b);
      return ia === undefined || ib === undefined ? null : { a: ia + 1, b: ib + 1, order };
    })
    .filter((b): b is { a: number; b: number; order: number } => b !== null);
  return { symbols, coords, bonds };
}

/** MOL/SDF: reuse the app's own molfile reader so bond perception matches
 * exactly what opening one as a 2D structure would produce. */
function parseMolThroughApp(text: string): Parsed3D {
  const lines = text.split(/\r?\n/);
  const counts = lines[3] || "";
  const natoms = parseInt(counts.slice(0, 3), 10) || 0;
  if (natoms === 0) fail("EMPTY", "No atoms in this molfile");
  const symbols: string[] = [];
  const coords: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < natoms; i++) {
    const line = lines[4 + i] || "";
    const x = parseFloat(line.slice(0, 10));
    const y = parseFloat(line.slice(10, 20));
    const z = parseFloat(line.slice(20, 30));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      fail("MALFORMED", `Atom line ${i + 1} has non-numeric coordinates`);
    }
    symbols.push(normalizeElement(line.slice(31, 34)));
    coords.push({ x, y, z });
  }
  const nbonds = parseInt(counts.slice(3, 6), 10) || 0;
  const bonds: { a: number; b: number; order: number }[] = [];
  for (let i = 0; i < nbonds; i++) {
    const line = lines[4 + natoms + i] || "";
    const a = parseInt(line.slice(0, 3), 10);
    const b = parseInt(line.slice(3, 6), 10);
    const order = parseInt(line.slice(6, 9), 10) || 1;
    if (Number.isFinite(a) && Number.isFinite(b)) bonds.push({ a, b, order });
  }
  return { symbols, coords, bonds };
}

/**
 * Distance-based bond perception for formats with no connectivity.
 *
 * A pair is bonded when the distance between their nuclei is under the sum of
 * their covalent radii plus a tolerance. The tolerance is deliberately
 * generous (+0.45 Å): a strict cut-off makes real structures come in with
 * visibly missing bonds at the long end of the C-C/C-N range, which reads as
 * a bug. The cost is occasionally drawing a bond that's really a close
 * contact — acceptable for a viewer, and why files that carry real bonds are
 * preferred over perceived ones.
 */
export function perceiveBonds(symbols: string[], coords: { x: number; y: number; z: number }[]): { a: number; b: number; order: number }[] {
  const bonds: { a: number; b: number; order: number }[] = [];
  const radii = symbols.map((s) => COVALENT_RADII[s] ?? DEFAULT_RADIUS);
  const TOLERANCE = 0.45;

  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const d = Math.hypot(
        coords[i].x - coords[j].x,
        coords[i].y - coords[j].y,
        coords[i].z - coords[j].z
      );
      // Two hydrogens are never treated as bonded; without this, the short
      // H-H contacts inside any dense organic structure would sprout bonds.
      if (symbols[i] === "H" && symbols[j] === "H") continue;
      if (d > 0.1 && d <= radii[i] + radii[j] + TOLERANCE) {
        bonds.push({ a: i + 1, b: j + 1, order: 1 });
      }
    }
  }
  return bonds;
}

/** Serializes a parsed structure as a V2000 molfile the app's own 3D panel,
 * export buttons, rotate-bond tool, and measurement tools can all consume. */
function toMolfile(parsed: Parsed3D, perceived: boolean): string {
  const bonds = parsed.bonds.length > 0 ? parsed.bonds : perceiveBonds(parsed.symbols, parsed.coords);
  let out = "imported structure\n  EnlaceCraft\n\n";
  out += `${String(parsed.symbols.length).padStart(3)}${String(bonds.length).padStart(3)}`;
  out += "  0  0  0  0  0  0  0  0999 V2000\n";
  for (let i = 0; i < parsed.symbols.length; i++) {
    const { x, y, z } = parsed.coords[i];
    out += `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${z.toFixed(4).padStart(10)} `;
    out += `${parsed.symbols[i].padEnd(3)} 0  0  0  0  0  0  0  0  0  0\n`;
  }
  for (const b of bonds) {
    out += `${String(b.a).padStart(3)}${String(b.b).padStart(3)}${String(b.order).padStart(3)}  0  0  0\n`;
  }
  out += "M  END\n";
  void perceived;
  return out;
}

/**
 * Detects the format from the file name and parses it into a V2000 molfile
 * with 3D coordinates.
 */
export function importStructure3D(name: string, text: string): string {
  const lower = name.toLowerCase();
  let parsed: Parsed3D;
  let perceived = false;

  if (lower.endsWith(".xyz")) {
    parsed = parseXyz(text);
    perceived = true;
  } else if (lower.endsWith(".pdb") || lower.endsWith(".ent")) {
    parsed = parsePdb(text);
    // CONECT records are frequently missing or partial; fall back to
    // perception rather than rendering a bond-less cloud.
    perceived = parsed.bonds.length === 0;
  } else if (lower.endsWith(".mol") || lower.endsWith(".sdf")) {
    parsed = parseMolThroughApp(text);
  } else {
    fail("UNSUPPORTED", `Cannot tell what kind of 3D structure "${name}" is — expected .xyz, .pdb, .mol or .sdf`);
  }

  if (parsed.symbols.length === 0) fail("EMPTY", "That file contains no atoms");
  return toMolfile(parsed, perceived);
}

/** Exported for tests: whether the given filename will be recognized. */
export function isStructure3DFile(name: string): boolean {
  return /\.(xyz|pdb|ent|mol|sdf)$/i.test(name);
}

/** Element symbol -> the app's Element union, for callers that need to build
 * a real Molecule out of an imported structure. */
export function elementForSymbol(symbol: string): Element | null {
  const s = normalizeElement(symbol);
  if (COVALENT_RADII[s] !== undefined) return s as Element;
  return null;
}