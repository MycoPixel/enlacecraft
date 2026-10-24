import type { Molecule, Annotation } from "../types/chemistry";
import { StructureTemplate } from "../model/structureTemplates";

/**
 * Nucleotides as StructureTemplates.
 * Each template includes the sugar (ribose/deoxyribose), nucleobase, and phosphate group.
 * Available forms: nucleoside, nucleotide (mono/di/tri-phosphate).
 * Coordinates are re-centered so each template's bounding-box center sits at (0, 0).
 */

// Ribose sugar positions (approximate, for nucleoside layout)
function riboseSugar(): Record<string, { x: number; y: number }> {
  // Rough positions for ribose atoms in a nucleoside layout
  // C1' at (0, 0), C2', C3', C4', C5', O4', and the base attached at C1'
  return {
    c1p: { x: 0, y: 0 },     // anomeric carbon (attached to base)
    c2p: { x: 25, y: 30 },   // 2' carbon
    c3p: { x: 15, y: 70 },   // 3' carbon (has OH/phosphate)
    c4p: { x: -25, y: 30 },  // 4' carbon
    c5p: { x: -40, y: 0 },   // 5' carbon (has CH2OH/phosphate)
    o4p: { x: 0, y: -20 },   // ring oxygen
    // Base attached at c1p
    baseCenter: { x: 50, y: 0 }, // roughly where the base center sits
  };
}

// Deoxyribose sugar (missing 2' OH)
function deoxyriboseSugar(): Record<string, { x: number; y: number }> {
  return {
    c1p: { x: 0, y: 0 },
    c2p: { x: 25, y: 30 },
    c3p: { x: 15, y: 70 },
    c4p: { x: -25, y: 30 },
    c5p: { x: -40, y: 0 },
    o4p: { x: 0, y: -20 },
  };
}

// Purine ring atoms (A, G) - rough Kekulé layout
function purineRing(): Record<string, { x: number; y: number }> {
  return {
    n1: { x: 0, y: 0 },
    c2: { x: 30, y: -20 },
    n3: { x: 50, y: 0 },
    c4: { x: 30, y: 20 },
    c5: { x: 0, y: 40 },
    c6: { x: -30, y: 20 },
    n7: { x: -50, y: 0 },
    c8: { x: -30, y: -20 },
    n9: { x: 0, y: -40 },
  };
}

// Pyrimidine ring atoms (C, T, U) - rough Kekulé layout
function pyrimidineRing(): Record<string, { x: number; y: number }> {
  return {
    c1: { x: 0, y: 0 },
    n2: { x: 30, y: -20 },
    c3: { x: 50, y: 0 },
    c4: { x: 30, y: 20 },
    c5: { x: 0, y: 40 },
    n1: { x: -30, y: 20 },
  };
}

// Ribonucleotide (with ribose + base + phosphate)
export const amp: StructureTemplate = {
  id: "amp",
  label: "AMP (Adenosine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Ribose
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0, lonePairs: 1 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5'": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Phosphate
      "oP1": { id: "o1p", x: 15, y: 95, element: "O", charge: -1 },
      "oP2": { id: "o2p", x: -15, y: 95, element: "O", charge: -1 },
      "oP3": { id: "o3p", x: 0, y: 130, element: "O", charge: -1 },
      "p": { id: "p", x: 0, y: 70, element: "P", charge: -2 },
      "hP": { id: "hp", x: 0, y: 50, element: "H", charge: 0 },
      // Adenine base
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      "n7": { id: "n7", x: -20, y: 0, element: "N", charge: 0 },
      "c8": { id: "c8", x: -20, y: -20, element: "C", charge: 0 },
      "n9": { id: "n9", x: 0, y: -40, element: "N", charge: 0 },
      "h2": { id: "h2a", x: 80, y: -40, element: "H", charge: 0 },
      "h8": { id: "h8a", x: -20, y: -40, element: "H", charge: 0 },
    },
    bonds: {
      // Ribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Phosphate bonds
      "b8": { id: "b8", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "p", a2: "o1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "p", a2: "o2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p", a2: "o3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p", a2: "hp", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond (N9 of adenine to C1' of ribose)
      "b13": { id: "b13", a1: "n9", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Adenine internal bonds (Kekulé)
      "b14": { id: "b14", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "n7", a2: "c8", order: 2, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c8", a2: "n9", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// GMP (Guanosine Monophosphate) - guanine base, ribose sugar, one phosphate
export const gmp: StructureTemplate = {
  id: "gmp",
  label: "GMP (Guanosine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Ribose
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5'": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Phosphate
      "oP1": { id: "o1p", x: 15, y: 95, element: "O", charge: -1 },
      "oP2": { id: "o2p", x: -15, y: 95, element: "O", charge: -1 },
      "oP3": { id: "o3p", x: 0, y: 130, element: "O", charge: -1 },
      "p": { id: "p", x: 0, y: 70, element: "P", charge: -2 },
      "hP": { id: "hp", x: 0, y: 50, element: "H", charge: 0 },
      // Guanine base (purine with =O at C6, -NH2 at C2)
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      "n7": { id: "n7", x: -20, y: 0, element: "N", charge: 0 },
      "c8": { id: "c8", x: -20, y: -20, element: "C", charge: 0 },
      "n9": { id: "n9", x: 0, y: -40, element: "N", charge: 0 },
      // Guanine substituents
      "o6": { id: "o6", x: 20, y: 40, element: "O", charge: 0 },
      "n2": { id: "n2g", x: 80, y: -40, element: "N", charge: 0 },
      "h2a": { id: "h2a", x: 80, y: -60, element: "H", charge: 0 },
      "h2b": { id: "h2b", x: 95, y: -30, element: "H", charge: 0 },
      "h8": { id: "h8a", x: -20, y: -40, element: "H", charge: 0 },
    },
    bonds: {
      // Ribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Phosphate bonds
      "b8": { id: "b8", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "p", a2: "o1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "p", a2: "o2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p", a2: "o3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p", a2: "hp", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond (N9 of guanine to C1' of ribose)
      "b13": { id: "b13", a1: "n9", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Guanine internal bonds (Kekulé)
      "b14": { id: "b14", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "n7", a2: "c8", order: 2, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c8", a2: "n9", order: 1, stereo: "none", doubleSide: "auto" },
      // Guanine substituents: =O at C6, -NH2 at C2
      "b22": { id: "b22", a1: "c6", a2: "o6", order: 2, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c2", a2: "n2g", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "n2g", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "n2g", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c8", a2: "h8", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// CMP (Cytidine Monophosphate) - cytosine base, ribose sugar, one phosphate
export const cmp: StructureTemplate = {
  id: "cmp",
  label: "CMP (Cytidine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Ribose
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5'": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Phosphate
      "oP1": { id: "o1p", x: 15, y: 95, element: "O", charge: -1 },
      "oP2": { id: "o2p", x: -15, y: 95, element: "O", charge: -1 },
      "oP3": { id: "o3p", x: 0, y: 130, element: "O", charge: -1 },
      "p": { id: "p", x: 0, y: 70, element: "P", charge: -2 },
      "hP": { id: "hp", x: 0, y: 50, element: "H", charge: 0 },
      // Cytosine base (pyrimidine with =O at C2, -NH2 at C4)
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      // Cytosine substituents: =O at C2, -NH2 at C4, H at C5, H at C6
      "o2": { id: "o2c", x: 80, y: -40, element: "O", charge: 0 },
      "n4": { id: "n4c", x: 80, y: 40, element: "N", charge: 0 },
      "h4a": { id: "h4a", x: 80, y: 60, element: "H", charge: 0 },
      "h4b": { id: "h4b", x: 95, y: 30, element: "H", charge: 0 },
      "h5": { id: "h5c", x: 50, y: 60, element: "H", charge: 0 },
      "h6": { id: "h6c", x: 20, y: 40, element: "H", charge: 0 },
      "h1": { id: "h1c", x: 50, y: -20, element: "H", charge: 0 },
    },
    bonds: {
      // Ribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Phosphate bonds
      "b8": { id: "b8", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "p", a2: "o1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "p", a2: "o2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p", a2: "o3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p", a2: "hp", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond (N1 of cytosine to C1' of ribose)
      "b13": { id: "b13", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Cytosine internal bonds (Kekulé)
      "b14": { id: "b14", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      // Cytosine substituents: =O at C2, -NH2 at C4
      "b20": { id: "b20", a1: "c2", a2: "o2c", order: 2, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c4", a2: "n4c", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "n4c", a2: "h4a", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "n4c", a2: "h4b", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c5", a2: "h5c", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c6", a2: "h6c", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "n1", a2: "h1c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// UMP (Uridine Monophosphate) - uracil base, ribose sugar, one phosphate
export const ump: StructureTemplate = {
  id: "ump",
  label: "UMP (Uridine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Ribose
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5'": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Phosphate
      "oP1": { id: "o1p", x: 15, y: 95, element: "O", charge: -1 },
      "oP2": { id: "o2p", x: -15, y: 95, element: "O", charge: -1 },
      "oP3": { id: "o3p", x: 0, y: 130, element: "O", charge: -1 },
      "p": { id: "p", x: 0, y: 70, element: "P", charge: -2 },
      "hP": { id: "hp", x: 0, y: 50, element: "H", charge: 0 },
      // Uracil base (pyrimidine with =O at C2 and C4)
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      // Uracil substituents: =O at C2 and C4, H at C5 and C6
      "o2": { id: "o2u", x: 80, y: -40, element: "O", charge: 0 },
      "o4": { id: "o4u", x: 80, y: 40, element: "O", charge: 0 },
      "h5": { id: "h5u", x: 50, y: 60, element: "H", charge: 0 },
      "h6": { id: "h6u", x: 20, y: 40, element: "H", charge: 0 },
      "h1": { id: "h1u", x: 50, y: -20, element: "H", charge: 0 },
      "h3": { id: "h3u", x: 110, y: -20, element: "H", charge: 0 },
    },
    bonds: {
      // Ribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Phosphate bonds
      "b8": { id: "b8", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "p", a2: "o1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "p", a2: "o2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p", a2: "o3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p", a2: "hp", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond (N1 of uracil to C1' of ribose)
      "b13": { id: "b13", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Uracil internal bonds (Kekulé)
      "b14": { id: "b14", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      // Uracil substituents: =O at C2 and C4
      "b20": { id: "b20", a1: "c2", a2: "o2u", order: 2, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c4", a2: "o4u", order: 2, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c5", a2: "h5u", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c6", a2: "h6u", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "n1", a2: "h1u", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "n3", a2: "h3u", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// TMP/dTMP (Thymidine Monophosphate) - thymine base, deoxyribose sugar, one phosphate
export const tmp: StructureTemplate = {
  id: "tmp",
  label: "TMP (Thymidine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Deoxyribose (no 2' OH)
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h2a": { id: "h2a", x: 25, y: 10, element: "H", charge: 0 },
      "h2b": { id: "h2b", x: 40, y: 30, element: "H", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5a": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Phosphate
      "oP1": { id: "o1p", x: 15, y: 95, element: "O", charge: -1 },
      "oP2": { id: "o2p", x: -15, y: 95, element: "O", charge: -1 },
      "oP3": { id: "o3p", x: 0, y: 130, element: "O", charge: -1 },
      "p": { id: "p", x: 0, y: 70, element: "P", charge: -2 },
      "hP": { id: "hp", x: 0, y: 50, element: "H", charge: 0 },
      // Thymine base (pyrimidine with =O at C2 and C4, -CH3 at C5)
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      // Thymine substituents: =O at C2 and C4, -CH3 at C5, H at C6
      "o2": { id: "o2t", x: 80, y: -40, element: "O", charge: 0 },
      "o4": { id: "o4t", x: 80, y: 40, element: "O", charge: 0 },
      "c7": { id: "c7", x: 50, y: 60, element: "C", charge: 0 },
      "h6": { id: "h6t", x: 20, y: 40, element: "H", charge: 0 },
      "h1": { id: "h1t", x: 50, y: -20, element: "H", charge: 0 },
      "h3": { id: "h3t", x: 110, y: -20, element: "H", charge: 0 },
      "h7a": { id: "h7a", x: 50, y: 80, element: "H", charge: 0 },
      "h7b": { id: "h7b", x: 65, y: 55, element: "H", charge: 0 },
      "h7c": { id: "h7c", x: 35, y: 65, element: "H", charge: 0 },
    },
    bonds: {
      // Deoxyribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c2p", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c2p", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Phosphate bonds
      "b10": { id: "b10", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p", a2: "o1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p", a2: "o2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "p", a2: "o3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "p", a2: "hp", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond (N1 of thymine to C1' of deoxyribose)
      "b15": { id: "b15", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Thymine internal bonds (Kekulé)
      "b16": { id: "b16", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      // Thymine substituents: =O at C2 and C4, -CH3 at C5
      "b22": { id: "b22", a1: "c2", a2: "o2t", order: 2, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c4", a2: "o4t", order: 2, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c5", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c6", a2: "h6t", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "n1", a2: "h1t", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "n3", a2: "h3t", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c7", a2: "h7a", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c7", a2: "h7b", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c7", a2: "h7c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// GTP (Guanosine Triphosphate) - guanine base, ribose sugar, three phosphates
export const gtp: StructureTemplate = {
  id: "gtp",
  label: "GTP (Guanosine Triphosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Ribose
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5a": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Triphosphate chain
      "oP1a": { id: "o1pa", x: 15, y: 95, element: "O", charge: -1 },
      "oP2a": { id: "o2pa", x: -15, y: 95, element: "O", charge: -1 },
      "oP3a": { id: "o3pa", x: 0, y: 130, element: "O", charge: -1 },
      "p1": { id: "p1", x: 0, y: 70, element: "P", charge: -2 },
      "oP1b": { id: "o1pb", x: -40, y: 50, element: "O", charge: -1 },
      "oP2b": { id: "o2pb", x: -40, y: 90, element: "O", charge: -1 },
      "oP3b": { id: "o3pb", x: -70, y: 70, element: "O", charge: -1 },
      "p2": { id: "p2", x: -40, y: 70, element: "P", charge: -2 },
      "oP1c": { id: "o1pc", x: -90, y: 50, element: "O", charge: -1 },
      "oP2c": { id: "o2pc", x: -90, y: 90, element: "O", charge: -1 },
      "oP3c": { id: "o3pc", x: -120, y: 70, element: "O", charge: -1 },
      "p3": { id: "p3", x: -90, y: 70, element: "P", charge: -2 },
      // Guanine base
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      "n7": { id: "n7", x: -20, y: 0, element: "N", charge: 0 },
      "c8": { id: "c8", x: -20, y: -20, element: "C", charge: 0 },
      "n9": { id: "n9", x: 0, y: -40, element: "N", charge: 0 },
      "o6": { id: "o6", x: 20, y: 40, element: "O", charge: 0 },
      "n2g": { id: "n2g", x: 80, y: -40, element: "N", charge: 0 },
      "h2a": { id: "h2a", x: 80, y: -60, element: "H", charge: 0 },
      "h2b": { id: "h2b", x: 95, y: -30, element: "H", charge: 0 },
      "h8": { id: "h8a", x: -20, y: -40, element: "H", charge: 0 },
    },
    bonds: {
      // Ribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Triphosphate bonds (at C3')
      "b8": { id: "b8", a1: "c3p", a2: "p1", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "p1", a2: "oP1a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "p1", a2: "oP2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p1", a2: "oP3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p1", a2: "p2", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "p2", a2: "oP1b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "p2", a2: "oP2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "p2", a2: "oP3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "p2", a2: "p3", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "p3", a2: "oP1c", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "p3", a2: "oP2c", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "p3", a2: "oP3c", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond
      "b20": { id: "b20", a1: "n9", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Guanine internal bonds
      "b21": { id: "b21", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "n7", a2: "c8", order: 2, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c8", a2: "n9", order: 1, stereo: "none", doubleSide: "auto" },
      // Guanine substituents
      "b29": { id: "b29", a1: "c6", a2: "o6", order: 2, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c2", a2: "n2g", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "n2g", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "n2g", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b33": { id: "b33", a1: "c8", a2: "h8", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// CTP (Cytidine Triphosphate) - cytosine base, ribose sugar, three phosphates
export const ctp: StructureTemplate = {
  id: "ctp",
  label: "CTP (Cytidine Triphosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Ribose
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5a": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Triphosphate chain
      "oP1a": { id: "o1pa", x: 15, y: 95, element: "O", charge: -1 },
      "oP2a": { id: "o2pa", x: -15, y: 95, element: "O", charge: -1 },
      "oP3a": { id: "o3pa", x: 0, y: 130, element: "O", charge: -1 },
      "p1": { id: "p1", x: 0, y: 70, element: "P", charge: -2 },
      "oP1b": { id: "o1pb", x: -40, y: 50, element: "O", charge: -1 },
      "oP2b": { id: "o2pb", x: -40, y: 90, element: "O", charge: -1 },
      "oP3b": { id: "o3pb", x: -70, y: 70, element: "O", charge: -1 },
      "p2": { id: "p2", x: -40, y: 70, element: "P", charge: -2 },
      "oP1c": { id: "o1pc", x: -90, y: 50, element: "O", charge: -1 },
      "oP2c": { id: "o2pc", x: -90, y: 90, element: "O", charge: -1 },
      "oP3c": { id: "o3pc", x: -120, y: 70, element: "O", charge: -1 },
      "p3": { id: "p3", x: -90, y: 70, element: "P", charge: -2 },
      // Cytosine base
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      "o2c": { id: "o2c", x: 80, y: -40, element: "O", charge: 0 },
      "n4c": { id: "n4c", x: 80, y: 40, element: "N", charge: 0 },
      "h4a": { id: "h4a", x: 80, y: 60, element: "H", charge: 0 },
      "h4b": { id: "h4b", x: 95, y: 30, element: "H", charge: 0 },
      "h5c": { id: "h5c", x: 50, y: 60, element: "H", charge: 0 },
      "h6c": { id: "h6c", x: 20, y: 40, element: "H", charge: 0 },
      "h1c": { id: "h1c", x: 50, y: -20, element: "H", charge: 0 },
    },
    bonds: {
      // Ribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Triphosphate bonds
      "b8": { id: "b8", a1: "c3p", a2: "p1", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "p1", a2: "oP1a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "p1", a2: "oP2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p1", a2: "oP3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p1", a2: "p2", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "p2", a2: "oP1b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "p2", a2: "oP2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "p2", a2: "oP3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "p2", a2: "p3", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "p3", a2: "oP1c", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "p3", a2: "oP2c", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "p3", a2: "oP3c", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond
      "b20": { id: "b20", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Cytosine internal bonds
      "b21": { id: "b21", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      // Cytosine substituents
      "b27": { id: "b27", a1: "c2", a2: "o2c", order: 2, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c4", a2: "n4c", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "n4c", a2: "h4a", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "n4c", a2: "h4b", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "c5", a2: "h5c", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "c6", a2: "h6c", order: 1, stereo: "none", doubleSide: "auto" },
      "b33": { id: "b33", a1: "n1", a2: "h1c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// UTP (Uridine Triphosphate) - uracil base, ribose sugar, three phosphates
export const utp: StructureTemplate = {
  id: "utp",
  label: "UTP (Uridine Triphosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      // Ribose
      "c1'": { id: "c1p", x: 0, y: 0, element: "C", charge: 0 },
      "c2'": { id: "c2p", x: 25, y: 30, element: "C", charge: 0 },
      "c3'": { id: "c3p", x: 15, y: 70, element: "C", charge: 0 },
      "c4'": { id: "c4p", x: -25, y: 30, element: "C", charge: 0 },
      "c5'": { id: "c5p", x: -40, y: 0, element: "C", charge: 0 },
      "o4'": { id: "o4p", x: 0, y: -20, element: "O", charge: 0 },
      "h3'": { id: "h3a", x: 15, y: 90, element: "H", charge: 0 },
      "h5a": { id: "h5a", x: -40, y: 20, element: "H", charge: 0 },
      // Triphosphate chain
      "oP1a": { id: "o1pa", x: 15, y: 95, element: "O", charge: -1 },
      "oP2a": { id: "o2pa", x: -15, y: 95, element: "O", charge: -1 },
      "oP3a": { id: "o3pa", x: 0, y: 130, element: "O", charge: -1 },
      "p1": { id: "p1", x: 0, y: 70, element: "P", charge: -2 },
      "oP1b": { id: "o1pb", x: -40, y: 50, element: "O", charge: -1 },
      "oP2b": { id: "o2pb", x: -40, y: 90, element: "O", charge: -1 },
      "oP3b": { id: "o3pb", x: -70, y: 70, element: "O", charge: -1 },
      "p2": { id: "p2", x: -40, y: 70, element: "P", charge: -2 },
      "oP1c": { id: "o1pc", x: -90, y: 50, element: "O", charge: -1 },
      "oP2c": { id: "o2pc", x: -90, y: 90, element: "O", charge: -1 },
      "oP3c": { id: "o3pc", x: -120, y: 70, element: "O", charge: -1 },
      "p3": { id: "p3", x: -90, y: 70, element: "P", charge: -2 },
      // Uracil base
      "n1": { id: "n1", x: 50, y: 0, element: "N", charge: 0 },
      "c2": { id: "c2", x: 80, y: -20, element: "C", charge: 0 },
      "n3": { id: "n3", x: 110, y: 0, element: "N", charge: 0 },
      "c4": { id: "c4", x: 80, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: 40, element: "C", charge: 0 },
      "c6": { id: "c6", x: 20, y: 20, element: "C", charge: 0 },
      "o2u": { id: "o2u", x: 80, y: -40, element: "O", charge: 0 },
      "o4u": { id: "o4u", x: 80, y: 40, element: "O", charge: 0 },
      "h5u": { id: "h5u", x: 50, y: 60, element: "H", charge: 0 },
      "h6u": { id: "h6u", x: 20, y: 40, element: "H", charge: 0 },
      "h1u": { id: "h1u", x: 50, y: -20, element: "H", charge: 0 },
      "h3u": { id: "h3u", x: 110, y: -20, element: "H", charge: 0 },
    },
    bonds: {
      // Ribose ring
      "b1": { id: "b1", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c1p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c3p", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c5p", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      // Triphosphate bonds
      "b8": { id: "b8", a1: "c3p", a2: "p1", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "p1", a2: "oP1a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "p1", a2: "oP2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "p1", a2: "oP3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "p1", a2: "p2", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "p2", a2: "oP1b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "p2", a2: "oP2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "p2", a2: "oP3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "p2", a2: "p3", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "p3", a2: "oP1c", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "p3", a2: "oP2c", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "p3", a2: "oP3c", order: 1, stereo: "none", doubleSide: "auto" },
      // Base-sugar bond
      "b20": { id: "b20", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      // Uracil internal bonds
      "b21": { id: "b21", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
      // Uracil substituents
      "b27": { id: "b27", a1: "c2", a2: "o2u", order: 2, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c4", a2: "o4u", order: 2, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c5", a2: "h5u", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c6", a2: "h6u", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "n1", a2: "h1u", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "n3", a2: "h3u", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Export all nucleotide templates
export const NUCLEOTIDE_TEMPLATES = [
  amp,
  gmp,
  cmp,
  ump,
  tmp,
  gtp,
  ctp,
  utp,
];