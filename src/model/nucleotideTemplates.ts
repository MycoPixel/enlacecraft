import type { Molecule, Annotation } from "../types/chemistry";
import { StructureTemplate } from "../model/structureTemplates";

/**
 * Nucleotides as StructureTemplates.
 * Each template includes the sugar (ribose/deoxyribose), nucleobase, and phosphate group.
 * Coordinates use BOND_LEN = 42 spacing. The ribose ring is connected as:
 *   C1'-C2'-C3'-C4'-O4'-C1' (5-membered ring), C4'-C5' bond
 * Phosphate attached to C3' (monophosphate) or C5' (nucleoside diphosphate/triphosphate)
 * Coordinates are re-centered so each template's bounding-box center sits at (0, 0).
 */

// Ribose sugar base template (shared atoms)
const riboseBase = {
  atoms: {
    "c1'": { id: "c1p", x: 0, y: -42, element: "C", charge: 0 },
    "c2'": { id: "c2p", x: 42, y: -42, element: "C", charge: 0 },
    "c3'": { id: "c3p", x: 63, y: 0, element: "C", charge: 0 },
    "c4'": { id: "c4p", x: 21, y: 42, element: "C", charge: 0 },
    "c5'": { id: "c5p", x: -21, y: 42, element: "C", charge: 0 },
    "o4'": { id: "o4p", x: -21, y: 0, element: "O", charge: 0 },
    "h2'a": { id: "h2pa", x: 56, y: -28, element: "H", charge: 0 },
    "h2'b": { id: "h2pb", x: 56, y: -56, element: "H", charge: 0 },
    "h3'": { id: "h3p", x: 81, y: -14, element: "H", charge: 0 },
    "h4'": { id: "h4p", x: 21, y: 70, element: "H", charge: 0 },
    "h5'a": { id: "h5pa", x: -36, y: 56, element: "H", charge: 0 },
    "h5'b": { id: "h5pb", x: -21, y: 70, element: "H", charge: 0 },
    "h1'": { id: "h1p", x: -21, y: -70, element: "H", charge: 0 },
  },
  bonds: {
    "b_c1_c2": { id: "b_c1c2", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c2_c3": { id: "b_c2c3", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c3_c4": { id: "b_c3c4", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c4_c5": { id: "b_c4c5", a1: "c4p", a2: "c5p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c4_o4": { id: "b_c4o4", a1: "c4p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_o4_c1": { id: "b_o4c1", a1: "o4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c2_h2a": { id: "b_c2h2a", a1: "c2p", a2: "h2pa", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c2_h2b": { id: "b_c2h2b", a1: "c2p", a2: "h2pb", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c3_h3": { id: "b_c3h3", a1: "c3p", a2: "h3p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c4_h4": { id: "b_c4h4", a1: "c4p", a2: "h4p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c5_h5a": { id: "b_c5h5a", a1: "c5p", a2: "h5pa", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c5_h5b": { id: "b_c5h5b", a1: "c5p", a2: "h5pb", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c1_h1": { id: "b_c1h1", a1: "c1p", a2: "h1p", order: 1, stereo: "none", doubleSide: "auto" },
  },
} as const;

// Deoxyribose base (no 2' OH - has 2 H on C2')
const deoxyriboseBase = {
  atoms: {
    "c1'": { id: "c1p", x: 0, y: -42, element: "C", charge: 0 },
    "c2'": { id: "c2p", x: 42, y: -42, element: "C", charge: 0 },
    "c3'": { id: "c3p", x: 63, y: 0, element: "C", charge: 0 },
    "c4'": { id: "c4p", x: 21, y: 42, element: "C", charge: 0 },
    "c5'": { id: "c5p", x: -21, y: 42, element: "C", charge: 0 },
    "o4'": { id: "o4p", x: -21, y: 0, element: "O", charge: 0 },
    "h2'a": { id: "h2pa", x: 56, y: -28, element: "H", charge: 0 },
    "h2'b": { id: "h2pb", x: 56, y: -56, element: "H", charge: 0 },
    "h3'": { id: "h3p", x: 81, y: -14, element: "H", charge: 0 },
    "h4'": { id: "h4p", x: 21, y: 70, element: "H", charge: 0 },
    "h5'a": { id: "h5pa", x: -36, y: 56, element: "H", charge: 0 },
    "h5'b": { id: "h5pb", x: -21, y: 70, element: "H", charge: 0 },
    "h1'": { id: "h1p", x: -21, y: -70, element: "H", charge: 0 },
  },
  bonds: {
    "b_c1_c2": { id: "b_c1c2", a1: "c1p", a2: "c2p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c2_c3": { id: "b_c2c3", a1: "c2p", a2: "c3p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c3_c4": { id: "b_c3c4", a1: "c3p", a2: "c4p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c4_c5": { id: "b_c4c5", a1: "c4p", a2: "c5p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c4_o4": { id: "b_c4o4", a1: "c4p", a2: "o4p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_o4_c1": { id: "b_o4c1", a1: "o4p", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c2_h2a": { id: "b_c2h2a", a1: "c2p", a2: "h2pa", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c2_h2b": { id: "b_c2h2b", a1: "c2p", a2: "h2pb", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c3_h3": { id: "b_c3h3", a1: "c3p", a2: "h3p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c4_h4": { id: "b_c4h4", a1: "c4p", a2: "h4p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c5_h5a": { id: "b_c5h5a", a1: "c5p", a2: "h5pa", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c5_h5b": { id: "b_c5h5b", a1: "c5p", a2: "h5pb", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c1_h1": { id: "b_c1h1", a1: "c1p", a2: "h1p", order: 1, stereo: "none", doubleSide: "auto" },
  },
} as const;

// Purine ring (shared base pattern)
const purineBase = {
  atoms: {
    "n1": { id: "n1", x: 50, y: -42, element: "N", charge: 0 },
    "c2": { id: "c2", x: 80, y: -62, element: "C", charge: 0 },
    "n3": { id: "n3", x: 110, y: -42, element: "N", charge: 0 },
    "c4": { id: "c4", x: 80, y: -42, element: "C", charge: 0 },
    "c5": { id: "c5", x: 50, y: -21, element: "C", charge: 0 },
    "c6": { id: "c6", x: 20, y: -42, element: "C", charge: 0 },
    "n7": { id: "n7", x: -20, y: -42, element: "N", charge: 0 },
    "c8": { id: "c8", x: -20, y: -62, element: "C", charge: 0 },
    "n9": { id: "n9", x: 0, y: -84, element: "N", charge: 0 },
  },
  bonds: {
    "b_n1_c2": { id: "b_n1c2", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c2_n3": { id: "b_c2n3", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
    "b_n3_c4": { id: "b_n3c4", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c4_c5": { id: "b_c4c5", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c5_c6": { id: "b_c5c6", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c6_n1": { id: "b_c6n1", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
    "b_n7_c8": { id: "b_n7c8", a1: "n7", a2: "c8", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c8_n9": { id: "b_c8n9", a1: "c8", a2: "n9", order: 1, stereo: "none", doubleSide: "auto" },
  },
} as const;

// Pyrimidine ring (shared base pattern)
const pyrimidineBase = {
  atoms: {
    "n1": { id: "n1", x: 50, y: -42, element: "N", charge: 0 },
    "c2": { id: "c2", x: 80, y: -62, element: "C", charge: 0 },
    "n3": { id: "n3", x: 110, y: -42, element: "N", charge: 0 },
    "c4": { id: "c4", x: 80, y: -42, element: "C", charge: 0 },
    "c5": { id: "c5", x: 50, y: -21, element: "C", charge: 0 },
    "c6": { id: "c6", x: 20, y: -42, element: "C", charge: 0 },
  },
  bonds: {
    "b_n1_c2": { id: "b_n1c2", a1: "n1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c2_n3": { id: "b_c2n3", a1: "c2", a2: "n3", order: 1, stereo: "none", doubleSide: "auto" },
    "b_n3_c4": { id: "b_n3c4", a1: "n3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c4_c5": { id: "b_c4c5", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c5_c6": { id: "b_c5c6", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c6_n1": { id: "b_c6n1", a1: "c6", a2: "n1", order: 1, stereo: "none", doubleSide: "auto" },
  },
} as const;

// Triphosphate chain (3 phosphates, used for GTP, CTP, UTP)
const triphosphateChain = {
  atoms: {
    "op1a": { id: "op1a", x: -21, y: 98, element: "O", charge: -1 },
    "op2a": { id: "op2a", x: -63, y: 84, element: "O", charge: -1 },
    "op3a": { id: "op3a", x: -63, y: 116, element: "O", charge: -1 },
    "p1": { id: "p1", x: -21, y: 70, element: "P", charge: -2 },
    "op1b": { id: "op1b", x: -63, y: 42, element: "O", charge: -1 },
    "op2b": { id: "op2b", x: -105, y: 70, element: "O", charge: -1 },
    "op3b": { id: "op3b", x: -105, y: 112, element: "O", charge: -1 },
    "p2": { id: "p2", x: -63, y: 70, element: "P", charge: -2 },
    "op1c": { id: "op1c", x: -105, y: 98, element: "O", charge: -1 },
    "op2c": { id: "op2c", x: -147, y: 70, element: "O", charge: -1 },
    "op3c": { id: "op3c", x: -147, y: 112, element: "O", charge: -1 },
    "p3": { id: "p3", x: -105, y: 98, element: "P", charge: -2 },
  },
  bonds: {
    "b_c5_p1": { id: "b_c5p1", a1: "c5p", a2: "p1", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p1_op1a": { id: "b_p1op1a", a1: "p1", a2: "op1a", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p1_op2a": { id: "b_p1op2a", a1: "p1", a2: "op2a", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p1_op3a": { id: "b_p1op3a", a1: "p1", a2: "op3a", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p1_p2": { id: "b_p1p2", a1: "p1", a2: "p2", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p2_op1b": { id: "b_p2op1b", a1: "p2", a2: "op1b", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p2_op2b": { id: "b_p2op2b", a1: "p2", a2: "op2b", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p2_op3b": { id: "b_p2op3b", a1: "p2", a2: "op3b", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p2_p3": { id: "b_p2p3", a1: "p2", a2: "p3", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p3_op1c": { id: "b_p3op1c", a1: "p3", a2: "op1c", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p3_op2c": { id: "b_p3op2c", a1: "p3", a2: "op2c", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p3_op3c": { id: "b_p3op3c", a1: "p3", a2: "op3c", order: 1, stereo: "none", doubleSide: "auto" },
  },
} as const;

// Monophosphate group (single phosphate)
const monophosphate = {
  atoms: {
    "op1": { id: "op1", x: -21, y: 98, element: "O", charge: -1 },
    "op2": { id: "op2", x: -63, y: 84, element: "O", charge: -1 },
    "op3": { id: "op3", x: -63, y: 116, element: "O", charge: -1 },
    "p": { id: "p", x: -21, y: 70, element: "P", charge: -2 },
    "hp": { id: "hp", x: -21, y: 56, element: "H", charge: 0 },
  },
  bonds: {
    "b_c5_p": { id: "b_c5p", a1: "c5p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p_op1": { id: "b_pop1", a1: "p", a2: "op1", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p_op2": { id: "b_pop2", a1: "p", a2: "op2", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p_op3": { id: "b_pop3", a1: "p", a2: "op3", order: 1, stereo: "none", doubleSide: "auto" },
    "b_p_hp": { id: "b_php", a1: "p", a2: "hp", order: 1, stereo: "none", doubleSide: "auto" },
  },
} as const;

// AMP (Adenosine Monophosphate) - adenine base, ribose sugar, one phosphate at C3'
export const amp: StructureTemplate = {
  id: "amp",
  label: "AMP (Adenosine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...riboseBase.atoms,
      ...purineBase.atoms,
      ...monophosphate.atoms,
    },
    bonds: {
      ...riboseBase.bonds,
      ...purineBase.bonds,
      ...monophosphate.bonds,
      "b_n9_c1": { id: "b_n9c1", a1: "n9", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c3_p": { id: "b_c3p", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// GMP (Guanosine Monophosphate) - guanine base, ribose sugar, one phosphate at C3'
export const gmp: StructureTemplate = {
  id: "gmp",
  label: "GMP (Guanosine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...riboseBase.atoms,
      ...purineBase.atoms,
      ...monophosphate.atoms,
      "o6": { id: "o6", x: 20, y: -21, element: "O", charge: 0 },
      "n2": { id: "n2", x: 80, y: -84, element: "N", charge: 0 },
      "h_n2a": { id: "h_n2a", x: 80, y: -102, element: "H", charge: 0 },
      "h_n2b": { id: "h_n2b", x: 95, y: -84, element: "H", charge: 0 },
      "h_c8": { id: "h_c8", x: -20, y: -80, element: "H", charge: 0 },
    },
    bonds: {
      ...riboseBase.bonds,
      ...purineBase.bonds,
      ...monophosphate.bonds,
      "b_n9_c1": { id: "b_n9c1", a1: "n9", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c3_p": { id: "b_c3p", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c6_o6": { id: "b_c6o6", a1: "c6", a2: "o6", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c2_n2": { id: "b_c2n2", a1: "c2", a2: "n2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n2_hn2a": { id: "b_n2hn2a", a1: "n2", a2: "h_n2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n2_hn2b": { id: "b_n2hn2b", a1: "n2", a2: "h_n2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c8_h": { id: "b_c8h", a1: "c8", a2: "h_c8", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// CMP (Cytidine Monophosphate) - cytosine base, ribose sugar, one phosphate at C3'
export const cmp: StructureTemplate = {
  id: "cmp",
  label: "CMP (Cytidine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...riboseBase.atoms,
      ...pyrimidineBase.atoms,
      ...monophosphate.atoms,
      "o2": { id: "o2", x: 80, y: -84, element: "O", charge: 0 },
      "n4": { id: "n4", x: 80, y: -21, element: "N", charge: 0 },
      "h_c5": { id: "h_c5", x: 50, y: -39, element: "H", charge: 0 },
      "h_c6": { id: "h_c6", x: 20, y: -60, element: "H", charge: 0 },
      "h_n4a": { id: "h_n4a", x: 80, y: -39, element: "H", charge: 0 },
      "h_n4b": { id: "h_n4b", x: 95, y: -21, element: "H", charge: 0 },
    },
    bonds: {
      ...riboseBase.bonds,
      ...pyrimidineBase.bonds,
      ...monophosphate.bonds,
      "b_n1_c1": { id: "b_n1c1", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c3_p": { id: "b_c3p", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c2_o2": { id: "b_c2o2", a1: "c2", a2: "o2", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c4_n4": { id: "b_c4n4", a1: "c4", a2: "n4", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n4_hn4a": { id: "b_n4hn4a", a1: "n4", a2: "h_n4a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n4_hn4b": { id: "b_n4hn4b", a1: "n4", a2: "h_n4b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c5_h": { id: "b_c5h", a1: "c5", a2: "h_c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c6_h": { id: "b_c6h", a1: "c6", a2: "h_c6", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// UMP (Uridine Monophosphate) - uracil base, ribose sugar, one phosphate at C3'
export const ump: StructureTemplate = {
  id: "ump",
  label: "UMP (Uridine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...riboseBase.atoms,
      ...pyrimidineBase.atoms,
      ...monophosphate.atoms,
      "o2": { id: "o2", x: 80, y: -84, element: "O", charge: 0 },
      "o4": { id: "o4", x: 80, y: -21, element: "O", charge: 0 },
      "h_c5": { id: "h_c5", x: 50, y: -39, element: "H", charge: 0 },
      "h_c6": { id: "h_c6", x: 20, y: -60, element: "H", charge: 0 },
      "h_n1": { id: "h_n1", x: 50, y: -60, element: "H", charge: 0 },
      "h_n3": { id: "h_n3", x: 110, y: -60, element: "H", charge: 0 },
    },
    bonds: {
      ...riboseBase.bonds,
      ...pyrimidineBase.bonds,
      ...monophosphate.bonds,
      "b_n1_c1": { id: "b_n1c1", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c3_p": { id: "b_c3p", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c2_o2": { id: "b_c2o2", a1: "c2", a2: "o2", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c4_o4": { id: "b_c4o4", a1: "c4", a2: "o4", order: 2, stereo: "none", doubleSide: "auto" },
      "b_n1_hn1": { id: "b_n1hn1", a1: "n1", a2: "h_n1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n3_hn3": { id: "b_n3hn3", a1: "n3", a2: "h_n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c5_h": { id: "b_c5h", a1: "c5", a2: "h_c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c6_h": { id: "b_c6h", a1: "c6", a2: "h_c6", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// TMP/dTMP (Thymidine Monophosphate) - thymine base, deoxyribose sugar, one phosphate at C3'
export const tmp: StructureTemplate = {
  id: "tmp",
  label: "TMP (Thymidine Monophosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...deoxyriboseBase.atoms,
      ...pyrimidineBase.atoms,
      ...monophosphate.atoms,
      "o2": { id: "o2", x: 80, y: -84, element: "O", charge: 0 },
      "o4": { id: "o4", x: 80, y: -21, element: "O", charge: 0 },
      "c7": { id: "c7", x: 50, y: -39, element: "C", charge: 0 },
      "h_c6": { id: "h_c6", x: 20, y: -60, element: "H", charge: 0 },
      "h_n1": { id: "h_n1", x: 50, y: -60, element: "H", charge: 0 },
      "h_n3": { id: "h_n3", x: 110, y: -60, element: "H", charge: 0 },
      "h_c7a": { id: "h_c7a", x: 50, y: -57, element: "H", charge: 0 },
      "h_c7b": { id: "h_c7b", x: 65, y: -34, element: "H", charge: 0 },
      "h_c7c": { id: "h_c7c", x: 35, y: -34, element: "H", charge: 0 },
    },
    bonds: {
      ...deoxyriboseBase.bonds,
      ...pyrimidineBase.bonds,
      ...monophosphate.bonds,
      "b_n1_c1": { id: "b_n1c1", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c3_p": { id: "b_c3p", a1: "c3p", a2: "p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c2_o2": { id: "b_c2o2", a1: "c2", a2: "o2", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c4_o4": { id: "b_c4o4", a1: "c4", a2: "o4", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c5_c7": { id: "b_c5c7", a1: "c5", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n1_hn1": { id: "b_n1hn1", a1: "n1", a2: "h_n1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n3_hn3": { id: "b_n3hn3", a1: "n3", a2: "h_n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c6_h": { id: "b_c6h", a1: "c6", a2: "h_c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c7_h1": { id: "b_c7h1", a1: "c7", a2: "h_c7a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c7_h2": { id: "b_c7h2", a1: "c7", a2: "h_c7b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c7_h3": { id: "b_c7h3", a1: "c7", a2: "h_c7c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// GTP (Guanosine Triphosphate) - guanine base, ribose sugar, three phosphates at C3'
export const gtp: StructureTemplate = {
  id: "gtp",
  label: "GTP (Guanosine Triphosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...riboseBase.atoms,
      ...purineBase.atoms,
      ...triphosphateChain.atoms,
      "o6": { id: "o6", x: 20, y: -21, element: "O", charge: 0 },
      "n2": { id: "n2", x: 80, y: -84, element: "N", charge: 0 },
      "h_n2a": { id: "h_n2a", x: 80, y: -102, element: "H", charge: 0 },
      "h_n2b": { id: "h_n2b", x: 95, y: -84, element: "H", charge: 0 },
      "h_c8": { id: "h_c8", x: -20, y: -80, element: "H", charge: 0 },
    },
    bonds: {
      ...riboseBase.bonds,
      ...purineBase.bonds,
      ...triphosphateChain.bonds,
      "b_n9_c1": { id: "b_n9c1", a1: "n9", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c6_o6": { id: "b_c6o6", a1: "c6", a2: "o6", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c2_n2": { id: "b_c2n2", a1: "c2", a2: "n2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n2_hn2a": { id: "b_n2hn2a", a1: "n2", a2: "h_n2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n2_hn2b": { id: "b_n2hn2b", a1: "n2", a2: "h_n2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c8_h": { id: "b_c8h", a1: "c8", a2: "h_c8", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// CTP (Cytidine Triphosphate) - cytosine base, ribose sugar, three phosphates at C3'
export const ctp: StructureTemplate = {
  id: "ctp",
  label: "CTP (Cytidine Triphosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...riboseBase.atoms,
      ...pyrimidineBase.atoms,
      ...triphosphateChain.atoms,
      "o2": { id: "o2", x: 80, y: -84, element: "O", charge: 0 },
      "n4": { id: "n4", x: 80, y: -21, element: "N", charge: 0 },
      "h_c5": { id: "h_c5", x: 50, y: -39, element: "H", charge: 0 },
      "h_c6": { id: "h_c6", x: 20, y: -60, element: "H", charge: 0 },
      "h_n4a": { id: "h_n4a", x: 80, y: -39, element: "H", charge: 0 },
      "h_n4b": { id: "h_n4b", x: 95, y: -21, element: "H", charge: 0 },
    },
    bonds: {
      ...riboseBase.bonds,
      ...pyrimidineBase.bonds,
      ...triphosphateChain.bonds,
      "b_n1_c1": { id: "b_n1c1", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c2_o2": { id: "b_c2o2", a1: "c2", a2: "o2", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c4_n4": { id: "b_c4n4", a1: "c4", a2: "n4", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n4_hn4a": { id: "b_n4hn4a", a1: "n4", a2: "h_n4a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n4_hn4b": { id: "b_n4hn4b", a1: "n4", a2: "h_n4b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c5_h": { id: "b_c5h", a1: "c5", a2: "h_c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c6_h": { id: "b_c6h", a1: "c6", a2: "h_c6", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// UTP (Uridine Triphosphate) - uracil base, ribose sugar, three phosphates at C3'
export const utp: StructureTemplate = {
  id: "utp",
  label: "UTP (Uridine Triphosphate)",
  category: "nucleotides",
  molecule: {
    atoms: {
      ...riboseBase.atoms,
      ...pyrimidineBase.atoms,
      ...triphosphateChain.atoms,
      "o2": { id: "o2", x: 80, y: -84, element: "O", charge: 0 },
      "o4": { id: "o4", x: 80, y: -21, element: "O", charge: 0 },
      "h_c5": { id: "h_c5", x: 50, y: -39, element: "H", charge: 0 },
      "h_c6": { id: "h_c6", x: 20, y: -60, element: "H", charge: 0 },
      "h_n1": { id: "h_n1", x: 50, y: -60, element: "H", charge: 0 },
      "h_n3": { id: "h_n3", x: 110, y: -60, element: "H", charge: 0 },
    },
    bonds: {
      ...riboseBase.bonds,
      ...pyrimidineBase.bonds,
      ...triphosphateChain.bonds,
      "b_n1_c1": { id: "b_n1c1", a1: "n1", a2: "c1p", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c2_o2": { id: "b_c2o2", a1: "c2", a2: "o2", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c4_o4": { id: "b_c4o4", a1: "c4", a2: "o4", order: 2, stereo: "none", doubleSide: "auto" },
      "b_n1_hn1": { id: "b_n1hn1", a1: "n1", a2: "h_n1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_n3_hn3": { id: "b_n3hn3", a1: "n3", a2: "h_n3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c5_h": { id: "b_c5h", a1: "c5", a2: "h_c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c6_h": { id: "b_c6h", a1: "c6", a2: "h_c6", order: 1, stereo: "none", doubleSide: "auto" },
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