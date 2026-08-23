import type { Annotation, Molecule } from "../types/chemistry";

/**
 * A pre-made structure insertable via the "Structures" button next to the
 * ring templates — for things too specific/non-regular to express as a
 * RingTemplate (a Fischer projection's vertical carbon chain, a Haworth
 * ring's particular slant, a chair conformation's alternating up/down
 * ring vertices with explicit axial/equatorial wedges), where getting the
 * exact conventional layout right matters more than generating it
 * procedurally. Each one is drawn once, by hand, in EnlaceCraft itself —
 * see the .enlacecraft project workflow — then lifted out of that file
 * as-is into one of these entries; nothing here is auto-generated.
 *
 * Insertion reuses the exact same placement logic as a clipboard paste
 * (see pasteFragment in the store): dropped just to the right of whatever
 * is already on the canvas, or centered in view if the canvas is empty.
 * Every atom/bond id below is arbitrary and gets freshly remapped at
 * insertion time (see insertMolecule), so these only need to be unique
 * *within* one template, not across templates or against whatever's
 * already drawn.
 *
 * Coordinates are re-centered so each template's own bounding-box center
 * sits at (0, 0) — where it was originally drawn on its source canvas
 * doesn't matter and isn't preserved.
 */
export interface StructureTemplate {
  id: string;
  label: string;
  /** Groups related templates together in the picker (e.g. every sugar
   * under one heading, every nucleobase under another) instead of one
   * long undifferentiated list — see StructureTemplatePicker.tsx. Purely
   * a display grouping; has no effect on insertion. */
  category: string;
  molecule: Molecule;
  annotations: Annotation[];
}

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
    id: "d-glucose-fischer",
    label: "D-Glucose (Fischer)",
    category: "sugars",
    molecule: {
      atoms: {
      "2": { id: "2", x: 0, y: -84, element: "C", charge: 0 },
      "3": { id: "3", x: 0, y: -42, element: "C", charge: 0 },
      "4": { id: "4", x: 0, y: 0, element: "C", charge: 0 },
      "5": { id: "5", x: 0, y: 42, element: "C", charge: 0 },
      "6": { id: "6", x: 0, y: 84, element: "C", charge: 0 },
      "7": { id: "7", x: 0, y: 126, element: "C", charge: 0 },
      "8": { id: "8", x: 42, y: -42, element: "O", charge: 0 },
      "9": { id: "9", x: -42, y: 0, element: "O", charge: 0 },
      "10": { id: "10", x: 42, y: 42, element: "O", charge: 0 },
      "11": { id: "11", x: 42, y: 84, element: "O", charge: 0 },
      "12": { id: "12", x: 0, y: -126, element: "O", charge: 0 },
      "13": { id: "13", x: 42, y: 126, element: "O", charge: 0 },
      "14": { id: "14", x: 42, y: -84, element: "H", charge: 0 },
      "15": { id: "15", x: -42, y: -42, element: "H", charge: 0 },
      "16": { id: "16", x: -42, y: 42, element: "H", charge: 0 },
      "17": { id: "17", x: -42, y: 84, element: "H", charge: 0 },
      "18": { id: "18", x: 42, y: 0, element: "H", charge: 0 },
      },
      bonds: {
      "19": { id: "19", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "20": { id: "20", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "21": { id: "21", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "22": { id: "22", a1: "5", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      "23": { id: "23", a1: "6", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "24": { id: "24", a1: "3", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "25": { id: "25", a1: "4", a2: "9", order: 1, stereo: "none", doubleSide: "auto" },
      "26": { id: "26", a1: "5", a2: "10", order: 1, stereo: "none", doubleSide: "auto" },
      "27": { id: "27", a1: "6", a2: "11", order: 1, stereo: "none", doubleSide: "auto" },
      "28": { id: "28", a1: "2", a2: "12", order: 2, stereo: "none", doubleSide: "center" },
      "29": { id: "29", a1: "7", a2: "13", order: 1, stereo: "none", doubleSide: "auto" },
      "30": { id: "30", a1: "2", a2: "14", order: 1, stereo: "none", doubleSide: "auto" },
      "31": { id: "31", a1: "3", a2: "15", order: 1, stereo: "none", doubleSide: "auto" },
      "32": { id: "32", a1: "5", a2: "16", order: 1, stereo: "none", doubleSide: "auto" },
      "33": { id: "33", a1: "6", a2: "17", order: 1, stereo: "none", doubleSide: "auto" },
      "34": { id: "34", a1: "4", a2: "18", order: 1, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },
  {
    id: "l-glucose-fischer",
    label: "L-Glucose (Fischer)",
    category: "sugars",
    molecule: {
      atoms: {
      "36": { id: "36", x: 0, y: -84, element: "C", charge: 0 },
      "37": { id: "37", x: 0, y: -42, element: "C", charge: 0 },
      "38": { id: "38", x: 0, y: 0, element: "C", charge: 0 },
      "39": { id: "39", x: 0, y: 42, element: "C", charge: 0 },
      "40": { id: "40", x: 0, y: 84, element: "C", charge: 0 },
      "41": { id: "41", x: 0, y: 126, element: "C", charge: 0 },
      "42": { id: "42", x: 42, y: -42, element: "H", charge: 0 },
      "43": { id: "43", x: -42, y: 0, element: "H", charge: 0 },
      "44": { id: "44", x: 42, y: 42, element: "H", charge: 0 },
      "45": { id: "45", x: 42, y: 84, element: "H", charge: 0 },
      "46": { id: "46", x: 0, y: -126, element: "O", charge: 0 },
      "47": { id: "47", x: 42, y: 126, element: "O", charge: 0 },
      "48": { id: "48", x: 42, y: -84, element: "H", charge: 0 },
      "49": { id: "49", x: -42, y: -42, element: "O", charge: 0 },
      "50": { id: "50", x: -42, y: 42, element: "O", charge: 0 },
      "51": { id: "51", x: -42, y: 84, element: "O", charge: 0 },
      "52": { id: "52", x: 42, y: 0, element: "O", charge: 0 },
      },
      bonds: {
      "53": { id: "53", a1: "36", a2: "37", order: 1, stereo: "none", doubleSide: "auto" },
      "54": { id: "54", a1: "37", a2: "38", order: 1, stereo: "none", doubleSide: "auto" },
      "55": { id: "55", a1: "38", a2: "39", order: 1, stereo: "none", doubleSide: "auto" },
      "56": { id: "56", a1: "39", a2: "40", order: 1, stereo: "none", doubleSide: "auto" },
      "57": { id: "57", a1: "40", a2: "41", order: 1, stereo: "none", doubleSide: "auto" },
      "58": { id: "58", a1: "37", a2: "42", order: 1, stereo: "none", doubleSide: "auto" },
      "59": { id: "59", a1: "38", a2: "43", order: 1, stereo: "none", doubleSide: "auto" },
      "60": { id: "60", a1: "39", a2: "44", order: 1, stereo: "none", doubleSide: "auto" },
      "61": { id: "61", a1: "40", a2: "45", order: 1, stereo: "none", doubleSide: "auto" },
      "62": { id: "62", a1: "36", a2: "46", order: 2, stereo: "none", doubleSide: "center" },
      "63": { id: "63", a1: "41", a2: "47", order: 1, stereo: "none", doubleSide: "auto" },
      "64": { id: "64", a1: "36", a2: "48", order: 1, stereo: "none", doubleSide: "auto" },
      "65": { id: "65", a1: "37", a2: "49", order: 1, stereo: "none", doubleSide: "auto" },
      "66": { id: "66", a1: "39", a2: "50", order: 1, stereo: "none", doubleSide: "auto" },
      "67": { id: "67", a1: "40", a2: "51", order: 1, stereo: "none", doubleSide: "auto" },
      "68": { id: "68", a1: "38", a2: "52", order: 1, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },  {
    id: "cyclopentadienyl",
    label: "Cyclopentadienyl (Cp⁻)",
    category: "ligands",
    molecule: {
      atoms: {
      "1": { id: "1", x: 0.0, y: -35.73, element: "C", charge: -1 },
      "2": { id: "2", x: 33.98, y: -11.04, element: "C", charge: 0 },
      "3": { id: "3", x: 21.0, y: 28.9, element: "C", charge: 0 },
      "4": { id: "4", x: -21.0, y: 28.9, element: "C", charge: 0 },
      "5": { id: "5", x: -33.98, y: -11.04, element: "C", charge: 0 },
      },
      bonds: {
      "6": { id: "6", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "2", a2: "3", order: 2, stereo: "none", doubleSide: "auto" },
      "8": { id: "8", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "9": { id: "9", a1: "4", a2: "5", order: 2, stereo: "none", doubleSide: "auto" },
      "10": { id: "10", a1: "5", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },
  {
    id: "adenine",
    label: "Adenine",
    category: "nucleobases",
    molecule: {
      atoms: {
      "1": { id: "1", x: 0.0, y: -42.0, element: "C", charge: 0 },
      "2": { id: "2", x: 36.37, y: -21.0, element: "N", charge: 0 },
      "3": { id: "3", x: 36.37, y: 21.0, element: "C", charge: 0 },
      "4": { id: "4", x: 0.0, y: 42.0, element: "N", charge: 0 },
      "5": { id: "5", x: -36.37, y: 21.0, element: "C", charge: 0 },
      "9": { id: "9", x: -36.37, y: -21.0, element: "C", charge: 0 },
      "6": { id: "6", x: -76.32, y: 33.98, element: "N", charge: 0 },
      "7": { id: "7", x: -101.0, y: 0.0, element: "C", charge: 0 },
      "8": { id: "8", x: -76.32, y: -33.98, element: "N", charge: 0 },
      "0": { id: "0", x: 0.0, y: -84.0, element: "N", charge: 0 },
      },
      bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 2, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 2, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "5", a2: "9", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "9", a2: "1", order: 2, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "5", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "6", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "7", a2: "8", order: 2, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "8", a2: "9", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "0", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },
  {
    id: "guanine",
    label: "Guanine",
    category: "nucleobases",
    molecule: {
      atoms: {
      "8": { id: "8", x: 0.0, y: -42.0, element: "C", charge: 0 },
      "10": { id: "10", x: 36.37, y: -21.0, element: "N", charge: 0 },
      "1": { id: "1", x: 36.37, y: 21.0, element: "C", charge: 0 },
      "2": { id: "2", x: 0.0, y: 42.0, element: "N", charge: 0 },
      "3": { id: "3", x: -36.37, y: 21.0, element: "C", charge: 0 },
      "7": { id: "7", x: -36.37, y: -21.0, element: "C", charge: 0 },
      "4": { id: "4", x: -76.32, y: 33.98, element: "N", charge: 0 },
      "5": { id: "5", x: -101.0, y: 0.0, element: "C", charge: 0 },
      "6": { id: "6", x: -76.32, y: -33.98, element: "N", charge: 0 },
      "0": { id: "0", x: 72.75, y: 42.0, element: "N", charge: 0 },
      "9": { id: "9", x: 0.0, y: -84.0, element: "O", charge: 0 },
      },
      bonds: {
      "b1": { id: "b1", a1: "8", a2: "10", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "10", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "1", a2: "2", order: 2, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "3", a2: "7", order: 2, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "7", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "5", a2: "6", order: 2, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "6", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "0", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "8", a2: "9", order: 2, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },
  {
    id: "cytosine",
    label: "Cytosine",
    category: "nucleobases",
    molecule: {
      atoms: {
      "1": { id: "1", x: 0.0, y: -42.0, element: "C", charge: 0 },
      "2": { id: "2", x: 36.37, y: -21.0, element: "C", charge: 0 },
      "3": { id: "3", x: 36.37, y: 21.0, element: "C", charge: 0 },
      "4": { id: "4", x: 0.0, y: 42.0, element: "N", charge: 0 },
      "5": { id: "5", x: -36.37, y: 21.0, element: "C", charge: 0 },
      "7": { id: "7", x: -36.37, y: -21.0, element: "N", charge: 0 },
      "0": { id: "0", x: 0.0, y: -84.0, element: "N", charge: 0 },
      "6": { id: "6", x: -72.75, y: 42.0, element: "O", charge: 0 },
      },
      bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 2, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "5", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "7", a2: "1", order: 2, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "0", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "5", a2: "6", order: 2, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },
  {
    id: "thymine",
    label: "Thymine",
    category: "nucleobases",
    molecule: {
      atoms: {
      "1": { id: "1", x: 0.0, y: -42.0, element: "C", charge: 0 },
      "2": { id: "2", x: 36.37, y: -21.0, element: "C", charge: 0 },
      "3": { id: "3", x: 36.37, y: 21.0, element: "N", charge: 0 },
      "4": { id: "4", x: 0.0, y: 42.0, element: "C", charge: 0 },
      "6": { id: "6", x: -36.37, y: 21.0, element: "N", charge: 0 },
      "7": { id: "7", x: -36.37, y: -21.0, element: "C", charge: 0 },
      "0": { id: "0", x: 0.0, y: -84.0, element: "C", charge: 0 },
      "5": { id: "5", x: 0.0, y: 84.0, element: "O", charge: 0 },
      "8": { id: "8", x: -72.75, y: -42.0, element: "O", charge: 0 },
      },
      bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 2, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "6", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "7", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "0", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "4", a2: "5", order: 2, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "7", a2: "8", order: 2, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },
  {
    id: "uracil",
    label: "Uracil",
    category: "nucleobases",
    molecule: {
      atoms: {
      "1": { id: "1", x: 0.0, y: -42.0, element: "C", charge: 0 },
      "2": { id: "2", x: 36.37, y: -21.0, element: "C", charge: 0 },
      "3": { id: "3", x: 36.37, y: 21.0, element: "C", charge: 0 },
      "4": { id: "4", x: 0.0, y: 42.0, element: "N", charge: 0 },
      "5": { id: "5", x: -36.37, y: 21.0, element: "C", charge: 0 },
      "7": { id: "7", x: -36.37, y: -21.0, element: "N", charge: 0 },
      "0": { id: "0", x: 0.0, y: -84.0, element: "O", charge: 0 },
      "6": { id: "6", x: -72.75, y: 42.0, element: "O", charge: 0 },
      },
      bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 2, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "5", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "7", a2: "1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "0", a2: "1", order: 2, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "5", a2: "6", order: 2, stereo: "none", doubleSide: "auto" },
      },
      hapticBonds: {},
    },
    annotations: [],
  },

];
