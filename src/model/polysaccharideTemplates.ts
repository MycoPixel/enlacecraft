import type { Annotation, BracketAnnotation, Molecule, TextAnnotation } from "../types/chemistry";
import type { StructureTemplate } from "./structureTemplates";
import { CARBOHYDRATE_TEMPLATES } from "./carbohydrateTemplates";
import { DEFAULT_BRACKET_WIDTH } from "./constants";
import { bracketPairLayout } from "./geometry";

/**
 * Polysaccharide repeating-unit templates. Each one is a disaccharide
 * repeat drawn with a square-bracket pair and an italic "n" (the standard
 * polymer notation), so it can be dropped into a scheme as a polymer
 * fragment rather than a single sugar.
 *
 * Cellulose and amylose reuse the existing cellobiose / maltose structures
 * (the β-1,4 and α-1,4 dimers are exactly their repeat units). Chitin's
 * repeat is N,N'-diacetylchitobiose, whose static 2D coordinates come from
 * PubChem CID 439544 (SMILES via OpenChemLib), same provenance as the other
 * carbohydrate templates.
 */

const BRACKET_PADDING = 18;
const POLYMER_LABEL_GAP = 2;

/** Deep-clones `mol` and translates every atom so its bounding-box centre
 * sits at the origin — the coordinate convention StructureTemplate
 * documents. */
function recenter(mol: Molecule): Molecule {
  const atoms = Object.values(mol.atoms);
  if (atoms.length === 0) return mol;
  const minX = Math.min(...atoms.map((a) => a.x));
  const maxX = Math.max(...atoms.map((a) => a.x));
  const minY = Math.min(...atoms.map((a) => a.y));
  const maxY = Math.max(...atoms.map((a) => a.y));
  const dx = (minX + maxX) / 2;
  const dy = (minY + maxY) / 2;

  const nextAtoms: Molecule["atoms"] = {};
  for (const [key, atom] of Object.entries(mol.atoms)) {
    nextAtoms[key] = { ...atom, x: atom.x - dx, y: atom.y - dy };
  }
  const nextBonds: Molecule["bonds"] = {};
  for (const [key, bond] of Object.entries(mol.bonds)) {
    nextBonds[key] = { ...bond };
  }
  return { ...mol, atoms: nextAtoms, bonds: nextBonds };
}

/** Wraps a recentered repeat-unit molecule in a square bracket pair plus an
 * italic "n" label at the bottom-right, returning the annotations. */
function polymerBrackets(mol: Molecule): Annotation[] {
  const atoms = Object.values(mol.atoms);
  if (atoms.length === 0) return [];

  const minX = Math.min(...atoms.map((a) => a.x));
  const maxX = Math.max(...atoms.map((a) => a.x));
  const minY = Math.min(...atoms.map((a) => a.y));
  const maxY = Math.max(...atoms.map((a) => a.y));

  const { left, right, top, height } = bracketPairLayout(
    { x: minX - BRACKET_PADDING, y: minY - BRACKET_PADDING },
    { x: maxX + BRACKET_PADDING, y: maxY + BRACKET_PADDING },
  );

  const open: BracketAnnotation = {
    id: "polymer-open",
    kind: "bracket",
    x: left - DEFAULT_BRACKET_WIDTH,
    y: top,
    width: DEFAULT_BRACKET_WIDTH,
    height,
    variant: "square",
    facing: "open",
  };
  const close: BracketAnnotation = {
    id: "polymer-close",
    kind: "bracket",
    x: right,
    y: top,
    width: DEFAULT_BRACKET_WIDTH,
    height,
    variant: "square",
    facing: "close",
  };
  const label: TextAnnotation = {
    id: "polymer-n",
    kind: "text",
    x: right + DEFAULT_BRACKET_WIDTH + POLYMER_LABEL_GAP,
    y: top + height - 24,
    width: 40,
    height: 24,
    html: "<i>n</i>",
    fontSize: 14,
  };
  return [open, close, label];
}

function carbohydrateMolecule(id: string): Molecule {
  const source = CARBOHYDRATE_TEMPLATES.find((t) => t.id === id);
  if (!source) throw new Error(`polysaccharide repeat source not found: ${id}`);
  return recenter(source.molecule);
}

function fromCarbohydrate(id: string, templateId: string, label: string): StructureTemplate {
  const molecule = carbohydrateMolecule(id);
  return {
    id: templateId,
    label,
    category: "carbohydrates",
    molecule,
    annotations: polymerBrackets(molecule),
  };
}

const CHITIN_MOLECULE: Molecule = {
  atoms: {
    "37": { id: "37", x: -109.12, y: 147, element: "C", charge: 0 },
    "38": { id: "38", x: -109.12, y: 105, element: "C", charge: 0 },
    "39": { id: "39", x: -145.492, y: 84, element: "O", charge: 0 },
    "40": { id: "40", x: -72.744, y: 84, element: "N", charge: 0 },
    "41": { id: "41", x: -72.744, y: 42, element: "C", charge: 0 },
    "42": { id: "42", x: -109.12, y: 21, element: "C", charge: 0 },
    "43": { id: "43", x: -109.12, y: -21, element: "C", charge: 0 },
    "44": { id: "44", x: -72.744, y: -42, element: "C", charge: 0 },
    "45": { id: "45", x: -36.372, y: -21, element: "O", charge: 0 },
    "46": { id: "46", x: -36.372, y: 21, element: "C", charge: 0 },
    "47": { id: "47", x: 0, y: 42, element: "O", charge: 0 },
    "48": { id: "48", x: 36.376, y: 21, element: "C", charge: 0 },
    "49": { id: "49", x: 72.748, y: 42, element: "C", charge: 0 },
    "50": { id: "50", x: 109.12, y: 21, element: "O", charge: 0 },
    "51": { id: "51", x: 109.12, y: -21, element: "C", charge: 0 },
    "52": { id: "52", x: 72.748, y: -42, element: "C", charge: 0 },
    "53": { id: "53", x: 36.376, y: -21, element: "C", charge: 0 },
    "54": { id: "54", x: 0, y: -42, element: "O", charge: 0 },
    "55": { id: "55", x: 72.748, y: -84, element: "N", charge: 0 },
    "56": { id: "56", x: 109.12, y: -105, element: "C", charge: 0 },
    "57": { id: "57", x: 145.492, y: -84, element: "O", charge: 0 },
    "58": { id: "58", x: 109.12, y: -147, element: "C", charge: 0 },
    "59": { id: "59", x: 145.492, y: -42, element: "O", charge: 0 },
    "60": { id: "60", x: 72.748, y: 84, element: "C", charge: 0 },
    "61": { id: "61", x: 109.12, y: 105, element: "O", charge: 0 },
    "62": { id: "62", x: -72.744, y: -84, element: "C", charge: 0 },
    "63": { id: "63", x: -36.372, y: -105, element: "O", charge: 0 },
    "64": { id: "64", x: -145.492, y: -42, element: "O", charge: 0 },
    "65": { id: "65", x: -145.492, y: 42, element: "O", charge: 0 },
  },
  bonds: {
    "66": { id: "66", a1: "37", a2: "38", order: 1, stereo: "none", doubleSide: "auto" },
    "67": { id: "67", a1: "38", a2: "39", order: 2, stereo: "none", doubleSide: "auto" },
    "68": { id: "68", a1: "38", a2: "40", order: 1, stereo: "none", doubleSide: "auto" },
    "69": { id: "69", a1: "41", a2: "40", order: 1, stereo: "dash", doubleSide: "auto" },
    "70": { id: "70", a1: "41", a2: "42", order: 1, stereo: "none", doubleSide: "auto" },
    "71": { id: "71", a1: "42", a2: "43", order: 1, stereo: "none", doubleSide: "auto" },
    "72": { id: "72", a1: "43", a2: "44", order: 1, stereo: "none", doubleSide: "auto" },
    "73": { id: "73", a1: "44", a2: "45", order: 1, stereo: "none", doubleSide: "auto" },
    "74": { id: "74", a1: "45", a2: "46", order: 1, stereo: "none", doubleSide: "auto" },
    "75": { id: "75", a1: "41", a2: "46", order: 1, stereo: "none", doubleSide: "auto" },
    "76": { id: "76", a1: "46", a2: "47", order: 1, stereo: "wedge", doubleSide: "auto" },
    "77": { id: "77", a1: "48", a2: "47", order: 1, stereo: "wedge", doubleSide: "auto" },
    "78": { id: "78", a1: "48", a2: "49", order: 1, stereo: "none", doubleSide: "auto" },
    "79": { id: "79", a1: "49", a2: "50", order: 1, stereo: "none", doubleSide: "auto" },
    "80": { id: "80", a1: "50", a2: "51", order: 1, stereo: "none", doubleSide: "auto" },
    "81": { id: "81", a1: "51", a2: "52", order: 1, stereo: "none", doubleSide: "auto" },
    "82": { id: "82", a1: "52", a2: "53", order: 1, stereo: "none", doubleSide: "auto" },
    "83": { id: "83", a1: "48", a2: "53", order: 1, stereo: "none", doubleSide: "auto" },
    "84": { id: "84", a1: "53", a2: "54", order: 1, stereo: "dash", doubleSide: "auto" },
    "85": { id: "85", a1: "52", a2: "55", order: 1, stereo: "wedge", doubleSide: "auto" },
    "86": { id: "86", a1: "55", a2: "56", order: 1, stereo: "none", doubleSide: "auto" },
    "87": { id: "87", a1: "56", a2: "57", order: 2, stereo: "none", doubleSide: "auto" },
    "88": { id: "88", a1: "56", a2: "58", order: 1, stereo: "none", doubleSide: "auto" },
    "89": { id: "89", a1: "51", a2: "59", order: 1, stereo: "none", doubleSide: "auto" },
    "90": { id: "90", a1: "49", a2: "60", order: 1, stereo: "dash", doubleSide: "auto" },
    "91": { id: "91", a1: "60", a2: "61", order: 1, stereo: "none", doubleSide: "auto" },
    "92": { id: "92", a1: "44", a2: "62", order: 1, stereo: "wedge", doubleSide: "auto" },
    "93": { id: "93", a1: "62", a2: "63", order: 1, stereo: "none", doubleSide: "auto" },
    "94": { id: "94", a1: "43", a2: "64", order: 1, stereo: "dash", doubleSide: "auto" },
    "95": { id: "95", a1: "42", a2: "65", order: 1, stereo: "wedge", doubleSide: "auto" },
  },
  hapticBonds: {},
  aromaticRingDisplays: {},
};

const chitinMolecule = recenter(CHITIN_MOLECULE);

export const POLYSACCHARIDE_TEMPLATES: StructureTemplate[] = [
  fromCarbohydrate("cellobiose", "cellulose-repeat", "Cellulose (repeating unit)"),
  fromCarbohydrate("maltose", "amylose-repeat", "Amylose (repeating unit)"),
  {
    id: "chitin-repeat",
    label: "Chitin (repeating unit)",
    category: "carbohydrates",
    molecule: chitinMolecule,
    annotations: polymerBrackets(chitinMolecule),
  },
];
