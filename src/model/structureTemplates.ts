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
  molecule: Molecule;
  annotations: Annotation[];
}

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
    id: "d-glucose-fischer",
    label: "D-Glucose (Fischer)",
    molecule: {
      atoms: {
      "145": { id: "145", x: -0.4491, y: -81.4948, element: "C", charge: 0 },
      "146": { id: "146", x: -0.4491, y: -39.4948, element: "C", charge: 0 },
      "147": { id: "147", x: -0.4491, y: 2.5052, element: "C", charge: 0 },
      "148": { id: "148", x: -0.4491, y: 44.5052, element: "C", charge: 0 },
      "149": { id: "149", x: -0.4491, y: 86.5052, element: "C", charge: 0 },
      "150": { id: "150", x: -0.4491, y: 128.5052, element: "C", charge: 0 },
      "151": { id: "151", x: 44.5509, y: -39.4948, element: "O", charge: 0 },
      "152": { id: "152", x: -44.5509, y: 2.9218, element: "O", charge: 0 },
      "153": { id: "153", x: 44.5509, y: 44.5052, element: "O", charge: 0 },
      "154": { id: "154", x: 44.3009, y: 86.0052, element: "O", charge: 0 },
      "155": { id: "155", x: -0.236, y: -128.5052, element: "O", charge: 0 },
      "156": { id: "156", x: 35.6746, y: 128.5052, element: "O", charge: 0 },
      "168": { id: "168", x: 41.5509, y: -81.4948, element: "H", charge: 0 },
      "242": { id: "242", x: -42.4491, y: -39.4948, element: "H", charge: 0 },
      "244": { id: "244", x: -42.4491, y: 44.5052, element: "H", charge: 0 },
      "246": { id: "246", x: -42.4491, y: 86.5052, element: "H", charge: 0 },
      "248": { id: "248", x: 41.5509, y: 2.5052, element: "H", charge: 0 },
      },
      bonds: {
      "157": { id: "157", a1: "145", a2: "146", order: 1, stereo: "none", doubleSide: "auto" },
      "158": { id: "158", a1: "146", a2: "147", order: 1, stereo: "none", doubleSide: "auto" },
      "159": { id: "159", a1: "147", a2: "148", order: 1, stereo: "none", doubleSide: "auto" },
      "160": { id: "160", a1: "148", a2: "149", order: 1, stereo: "none", doubleSide: "auto" },
      "161": { id: "161", a1: "149", a2: "150", order: 1, stereo: "none", doubleSide: "auto" },
      "162": { id: "162", a1: "146", a2: "151", order: 1, stereo: "none", doubleSide: "auto" },
      "163": { id: "163", a1: "147", a2: "152", order: 1, stereo: "none", doubleSide: "auto" },
      "164": { id: "164", a1: "148", a2: "153", order: 1, stereo: "none", doubleSide: "auto" },
      "165": { id: "165", a1: "149", a2: "154", order: 1, stereo: "none", doubleSide: "auto" },
      "166": { id: "166", a1: "145", a2: "155", order: 2, stereo: "none", doubleSide: "center" },
      "167": { id: "167", a1: "150", a2: "156", order: 1, stereo: "none", doubleSide: "auto" },
      "169": { id: "169", a1: "145", a2: "168", order: 1, stereo: "none", doubleSide: "auto" },
      "243": { id: "243", a1: "146", a2: "242", order: 1, stereo: "none", doubleSide: "auto" },
      "245": { id: "245", a1: "148", a2: "244", order: 1, stereo: "none", doubleSide: "auto" },
      "247": { id: "247", a1: "149", a2: "246", order: 1, stereo: "none", doubleSide: "auto" },
      "249": { id: "249", a1: "147", a2: "248", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "glycine",
    label: "Glycine",
    molecule: {
      atoms: {
      "1": { id: "1", x: -18.06, y: -16.8, element: "C", charge: 0 },
      "2": { id: "2", x: -54.6, y: 4.2, element: "N", charge: 0 },
      "3": { id: "3", x: 18.48, y: 4.2, element: "C", charge: 0 },
      "4": { id: "4", x: 18.48, y: 46.2, element: "O", charge: 0 },
      "5": { id: "5", x: 54.6, y: -16.8, element: "O", charge: 0 },
      "6": { id: "6", x: -47.46, y: -46.2, element: "H", charge: 0 },
      "7": { id: "7", x: 11.34, y: -46.2, element: "H", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      "6": { id: "6", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "alanine",
    label: "Alanine",
    molecule: {
      atoms: {
      "1": { id: "1", x: -18.06, y: -10.5, element: "C", charge: 0 },
      "2": { id: "2", x: -54.6, y: 10.5, element: "N", charge: 0 },
      "3": { id: "3", x: 18.48, y: 10.5, element: "C", charge: 0 },
      "4": { id: "4", x: 18.48, y: 52.5, element: "O", charge: 0 },
      "5": { id: "5", x: 54.6, y: -10.5, element: "O", charge: 0 },
      "6": { id: "6", x: -47.46, y: -39.9, element: "H", charge: 0 },
      "7": { id: "7", x: -18.06, y: -52.5, element: "C", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "cysteine",
    label: "Cysteine",
    molecule: {
      atoms: {
      "1": { id: "1", x: -18.06, y: 0, element: "C", charge: 0 },
      "2": { id: "2", x: -54.6, y: 21, element: "N", charge: 0 },
      "3": { id: "3", x: 18.48, y: 21, element: "C", charge: 0 },
      "4": { id: "4", x: 18.48, y: 63, element: "O", charge: 0 },
      "5": { id: "5", x: 54.6, y: 0, element: "O", charge: 0 },
      "6": { id: "6", x: -47.46, y: -29.4, element: "H", charge: 0 },
      "7": { id: "7", x: -18.06, y: -42, element: "C", charge: 0 },
      "8": { id: "8", x: -54.6, y: -63, element: "S", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "7", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "aspartic-acid",
    label: "Aspartic acid",
    molecule: {
      atoms: {
      "1": { id: "1", x: -18.06, y: 21, element: "C", charge: 0 },
      "2": { id: "2", x: -54.6, y: 42, element: "N", charge: 0 },
      "3": { id: "3", x: 18.48, y: 42, element: "C", charge: 0 },
      "4": { id: "4", x: 18.48, y: 84, element: "O", charge: 0 },
      "5": { id: "5", x: 54.6, y: 21, element: "O", charge: 0 },
      "6": { id: "6", x: -47.46, y: -8.4, element: "H", charge: 0 },
      "7": { id: "7", x: -18.06, y: -21, element: "C", charge: 0 },
      "8": { id: "8", x: 18.48, y: -42, element: "C", charge: 0 },
      "9": { id: "9", x: 18.48, y: -84, element: "O", charge: 0 },
      "10": { id: "10", x: 54.6, y: -21, element: "O", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "7", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "8": { id: "8", a1: "8", a2: "9", order: 2, stereo: "none", doubleSide: "auto" },
      "9": { id: "9", a1: "8", a2: "10", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "lysine",
    label: "Lysine",
    molecule: {
      atoms: {
      "1": { id: "1", x: -18.06, y: 31.5, element: "C", charge: 0 },
      "2": { id: "2", x: -54.6, y: 52.5, element: "N", charge: 0 },
      "3": { id: "3", x: 18.48, y: 52.5, element: "C", charge: 0 },
      "4": { id: "4", x: 18.48, y: 94.5, element: "O", charge: 0 },
      "5": { id: "5", x: 54.6, y: 31.5, element: "O", charge: 0 },
      "6": { id: "6", x: -47.46, y: 2.1, element: "H", charge: 0 },
      "7": { id: "7", x: -18.06, y: -10.5, element: "C", charge: 0 },
      "8": { id: "8", x: 18.48, y: -31.5, element: "C", charge: 0 },
      "9": { id: "9", x: -18.06, y: -52.5, element: "C", charge: 0 },
      "10": { id: "10", x: 18.48, y: -73.5, element: "C", charge: 0 },
      "11": { id: "11", x: -18.06, y: -94.5, element: "N", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "7", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "8": { id: "8", a1: "8", a2: "9", order: 1, stereo: "none", doubleSide: "auto" },
      "9": { id: "9", a1: "9", a2: "10", order: 1, stereo: "none", doubleSide: "auto" },
      "10": { id: "10", a1: "10", a2: "11", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "phenylalanine",
    label: "Phenylalanine",
    molecule: {
      atoms: {
      "1": { id: "1", x: -18.06, y: 26.04, element: "C", charge: 0 },
      "2": { id: "2", x: -54.6, y: 47.04, element: "N", charge: 0 },
      "3": { id: "3", x: 18.48, y: 47.04, element: "C", charge: 0 },
      "4": { id: "4", x: 18.48, y: 89.04, element: "O", charge: 0 },
      "5": { id: "5", x: 54.6, y: 26.04, element: "O", charge: 0 },
      "6": { id: "6", x: -47.46, y: -3.36, element: "H", charge: 0 },
      "7": { id: "7", x: -18.06, y: -15.96, element: "C", charge: 0 },
      "8": { id: "8", x: -18.06, y: -15.96, element: "C", charge: 0 },
      "9": { id: "9", x: -49.7, y: -34.23, element: "C", charge: 0 },
      "10": { id: "10", x: -49.7, y: -70.77, element: "C", charge: 0 },
      "11": { id: "11", x: -18.06, y: -89.04, element: "C", charge: 0 },
      "12": { id: "12", x: 13.58, y: -70.77, element: "C", charge: 0 },
      "13": { id: "13", x: 13.58, y: -34.23, element: "C", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "8", a2: "9", order: 2, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "9", a2: "10", order: 1, stereo: "none", doubleSide: "auto" },
      "8": { id: "8", a1: "10", a2: "11", order: 2, stereo: "none", doubleSide: "auto" },
      "9": { id: "9", a1: "11", a2: "12", order: 1, stereo: "none", doubleSide: "auto" },
      "10": { id: "10", a1: "12", a2: "13", order: 2, stereo: "none", doubleSide: "auto" },
      "11": { id: "11", a1: "13", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "12": { id: "12", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "13": { id: "13", a1: "7", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "histidine",
    label: "Histidine",
    molecule: {
      atoms: {
      "1": { id: "1", x: -18.06, y: 21.99, element: "C", charge: 0 },
      "2": { id: "2", x: -54.6, y: 42.99, element: "N", charge: 0 },
      "3": { id: "3", x: 18.48, y: 42.99, element: "C", charge: 0 },
      "4": { id: "4", x: 18.48, y: 84.99, element: "O", charge: 0 },
      "5": { id: "5", x: 54.6, y: 21.99, element: "O", charge: 0 },
      "6": { id: "6", x: -47.46, y: -7.41, element: "H", charge: 0 },
      "7": { id: "7", x: -18.06, y: -20.01, element: "C", charge: 0 },
      "8": { id: "8", x: -18.06, y: -24.21, element: "N", charge: 0 },
      "9": { id: "9", x: 13.9, y: -47.43, element: "C", charge: 0 },
      "10": { id: "10", x: 1.69, y: -84.99, element: "N", charge: 0 },
      "11": { id: "11", x: -37.81, y: -84.99, element: "C", charge: 0 },
      "12": { id: "12", x: -50.02, y: -47.43, element: "C", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "8", a2: "9", order: 1, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "9", a2: "10", order: 2, stereo: "none", doubleSide: "auto" },
      "8": { id: "8", a1: "10", a2: "11", order: 1, stereo: "none", doubleSide: "auto" },
      "9": { id: "9", a1: "11", a2: "12", order: 2, stereo: "none", doubleSide: "auto" },
      "10": { id: "10", a1: "12", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "11": { id: "11", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "12": { id: "12", a1: "7", a2: "11", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "tryptophan",
    label: "Tryptophan",
    molecule: {
      atoms: {
      "1": { id: "1", x: -29.19, y: 56.28, element: "C", charge: 0 },
      "2": { id: "2", x: -65.73, y: 77.28, element: "N", charge: 0 },
      "3": { id: "3", x: 7.35, y: 77.28, element: "C", charge: 0 },
      "4": { id: "4", x: 7.35, y: 119.28, element: "O", charge: 0 },
      "5": { id: "5", x: 43.47, y: 56.28, element: "O", charge: 0 },
      "6": { id: "6", x: -58.59, y: 26.88, element: "H", charge: 0 },
      "7": { id: "7", x: -29.19, y: 14.28, element: "C", charge: 0 },
      "8": { id: "8", x: -29.19, y: -23.52, element: "C", charge: 0 },
      "9": { id: "9", x: -61.11, y: -47.46, element: "C", charge: 0 },
      "10": { id: "10", x: -48.93, y: -85.68, element: "N", charge: 0 },
      "11": { id: "11", x: -9.45, y: -85.68, element: "C", charge: 0 },
      "12": { id: "12", x: 2.73, y: -47.46, element: "C", charge: 0 },
      "13": { id: "13", x: 44.73, y: -47.46, element: "C", charge: 0 },
      "14": { id: "14", x: 65.73, y: -83.16, element: "C", charge: 0 },
      "15": { id: "15", x: 44.73, y: -119.28, element: "C", charge: 0 },
      "16": { id: "16", x: 2.73, y: -119.28, element: "C", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "7", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "8": { id: "8", a1: "8", a2: "9", order: 2, stereo: "none", doubleSide: "auto" },
      "9": { id: "9", a1: "9", a2: "10", order: 1, stereo: "none", doubleSide: "auto" },
      "10": { id: "10", a1: "10", a2: "11", order: 1, stereo: "none", doubleSide: "auto" },
      "11": { id: "11", a1: "11", a2: "12", order: 2, stereo: "none", doubleSide: "auto" },
      "12": { id: "12", a1: "12", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "13": { id: "13", a1: "12", a2: "13", order: 1, stereo: "none", doubleSide: "auto" },
      "14": { id: "14", a1: "13", a2: "14", order: 2, stereo: "none", doubleSide: "auto" },
      "15": { id: "15", a1: "14", a2: "15", order: 1, stereo: "none", doubleSide: "auto" },
      "16": { id: "16", a1: "15", a2: "16", order: 2, stereo: "none", doubleSide: "auto" },
      "17": { id: "17", a1: "16", a2: "11", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
  {
    id: "proline",
    label: "Proline",
    molecule: {
      atoms: {
      "1": { id: "1", x: -4.2, y: -11.55, element: "C", charge: 0 },
      "2": { id: "2", x: -38.22, y: 13.23, element: "N", charge: 0 },
      "3": { id: "3", x: 32.34, y: 9.45, element: "C", charge: 0 },
      "4": { id: "4", x: 32.34, y: 51.45, element: "O", charge: 0 },
      "5": { id: "5", x: 68.46, y: -11.55, element: "O", charge: 0 },
      "6": { id: "6", x: 8.4, y: -51.45, element: "H", charge: 0 },
      "7": { id: "7", x: -25.2, y: -51.45, element: "C", charge: 0 },
      "8": { id: "8", x: -68.46, y: -36.33, element: "C", charge: 0 },
      "9": { id: "9", x: -68.46, y: 13.23, element: "C", charge: 0 },
      },
      bonds: {
      "1": { id: "1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "2": { id: "2", a1: "1", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "3": { id: "3", a1: "3", a2: "4", order: 2, stereo: "none", doubleSide: "auto" },
      "4": { id: "4", a1: "3", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "5": { id: "5", a1: "1", a2: "6", order: 1, stereo: "dash", doubleSide: "auto" },
      "6": { id: "6", a1: "1", a2: "7", order: 1, stereo: "none", doubleSide: "auto" },
      "7": { id: "7", a1: "7", a2: "8", order: 1, stereo: "none", doubleSide: "auto" },
      "8": { id: "8", a1: "8", a2: "9", order: 1, stereo: "none", doubleSide: "auto" },
      "9": { id: "9", a1: "9", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      },
    },
    annotations: [],
  },
];
