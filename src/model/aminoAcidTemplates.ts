import type { Molecule, Annotation } from "../types/chemistry";
import { StructureTemplate } from "../model/structureTemplates";

/**
 * 20 standard L-amino acids as StructureTemplates.
 * Each template includes the full atom/bond layout:
 *   H2N-CH(R)-COOH backbone with correct connectivity:
 *     N-CA (single), CA-C (single), C=O (double), C-OH (single), OH-H (single)
 *   Side chain attached to CA via CB (or directly for Glycine).
 *   Coordinates use BOND_LEN = 42 spacing.
 *   Insertion uses store/pasteFragment logic; atom IDs are remapped at insertion.
 *   Coordinates are re-centered so each template's bounding-box center sits at (0, 0).
 */

/** Backbone atoms shared by all amino acids (except Glycine which has no CB). */
const BACKBONE = {
  atoms: {
    "ca": { id: "ca", x: 0, y: 0, element: "C", charge: 0 },
    "n": { id: "n", x: -42, y: 0, element: "N", charge: 0 },
    "c": { id: "c", x: 42, y: 0, element: "C", charge: 0 },
    "o": { id: "o", x: 72, y: -36, element: "O", charge: 0 },
    "oh": { id: "oh", x: 72, y: 36, element: "O", charge: 0 },
    "h_oh": { id: "h_oh", x: 72, y: 72, element: "H", charge: 0 },
    "h_ca": { id: "h_ca", x: 0, y: -42, element: "H", charge: 0 },
  },
  bonds: {
    "b_ca_n": { id: "b_ca_n", a1: "ca", a2: "n", order: 1, stereo: "none", doubleSide: "auto" },
    "b_ca_c": { id: "b_ca_c", a1: "ca", a2: "c", order: 1, stereo: "none", doubleSide: "auto" },
    "b_c_o": { id: "b_c_o", a1: "c", a2: "o", order: 2, stereo: "none", doubleSide: "auto" },
    "b_c_oh": { id: "b_c_oh", a1: "c", a2: "oh", order: 1, stereo: "none", doubleSide: "auto" },
    "b_oh_h": { id: "b_oh_h", a1: "oh", a2: "h_oh", order: 1, stereo: "none", doubleSide: "auto" },
    "b_ca_h": { id: "b_ca_h", a1: "ca", a2: "h_ca", order: 1, stereo: "none", doubleSide: "auto" },
  },
} as const;

// Alanine (Ala, A) - CH3 side chain
export const ala: StructureTemplate = {
  id: "ala",
  label: "Alanine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 72, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 72, element: "H", charge: 0 },
      "h_cb3": { id: "h_cb3", x: 0, y: 42, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h3": { id: "b_cb_h3", a1: "cb", a2: "h_cb3", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Glycine (Gly, G) - H side chain (no CB carbon)
export const gly: StructureTemplate = {
  id: "gly",
  label: "Glycine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "h_ca2": { id: "h_ca2", x: 0, y: 42, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_h2": { id: "b_ca_h2", a1: "ca", a2: "h_ca2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Arginine (Arg, R) - guanidinium side chain: -CH2-CH2-CH2-NH-C(=NH)-NH2
export const arg: StructureTemplate = {
  id: "arg",
  label: "Arginine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cd": { id: "cd", x: 0, y: 84, element: "C", charge: 0 },
      "ce": { id: "ce", x: 0, y: 126, element: "C", charge: 0 },
      "nz1": { id: "nz1", x: -20, y: 156, element: "N", charge: 0 },
      "nz2": { id: "nz2", x: 20, y: 156, element: "N", charge: 0 },
      "nz3": { id: "nz3", x: 0, y: 186, element: "N", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_cd1": { id: "h_cd1", x: -15, y: 98, element: "H", charge: 0 },
      "h_cd2": { id: "h_cd2", x: 15, y: 98, element: "H", charge: 0 },
      "h_ce1": { id: "h_ce1", x: -15, y: 140, element: "H", charge: 0 },
      "h_ce2": { id: "h_ce2", x: 20, y: 172, element: "H", charge: 0 },
      "h_ce3": { id: "h_ce3", x: -20, y: 172, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cd": { id: "b_cb_cd", a1: "cb", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_ce": { id: "b_cd_ce", a1: "cd", a2: "ce", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ce_nz1": { id: "b_ce_nz1", a1: "ce", a2: "nz1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ce_nz2": { id: "b_ce_nz2", a1: "ce", a2: "nz2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ce_nz3": { id: "b_ce_nz3", a1: "ce", a2: "nz3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h1": { id: "b_cd_h1", a1: "cd", a2: "h_cd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h2": { id: "b_cd_h2", a1: "cd", a2: "h_cd2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nz1_h": { id: "b_nz1_h", a1: "nz1", a2: "h_ce1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nz2_h": { id: "b_nz2_h", a1: "nz2", a2: "h_ce2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nz3_h": { id: "b_nz3_h", a1: "nz3", a2: "h_ce3", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Asparagine (Asn, N) - carboxamide side chain: -CH2-C(=O)-NH2
export const asn: StructureTemplate = {
  id: "asn",
  label: "Asparagine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 0, y: 84, element: "C", charge: 0 },
      "og": { id: "og", x: -30, y: 108, element: "O", charge: 0 },
      "nd": { id: "nd", x: 30, y: 108, element: "N", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_nd1": { id: "h_nd1", x: 30, y: 126, element: "H", charge: 0 },
      "h_nd2": { id: "h_nd2", x: 45, y: 108, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_og": { id: "b_cg_og", a1: "cg", a2: "og", order: 2, stereo: "none", doubleSide: "auto" },
      "b_cg_nd": { id: "b_cg_nd", a1: "cg", a2: "nd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nd_h1": { id: "b_nd_h1", a1: "nd", a2: "h_nd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nd_h2": { id: "b_nd_h2", a1: "nd", a2: "h_nd2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Aspartate (Asp, D) - carboxylate side chain: -CH2-C(=O)-O-
export const asp: StructureTemplate = {
  id: "asp",
  label: "Aspartate",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 0, y: 84, element: "C", charge: 0 },
      "od1": { id: "od1", x: -30, y: 108, element: "O", charge: -1 },
      "od2": { id: "od2", x: 30, y: 108, element: "O", charge: -1 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_od1": { id: "b_cg_od1", a1: "cg", a2: "od1", order: 2, stereo: "none", doubleSide: "auto" },
      "b_cg_od2": { id: "b_cg_od2", a1: "cg", a2: "od2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Glutamine (Gln, Q) - carboxamide side chain: -CH2-CH2-C(=O)-NH2
export const gln: StructureTemplate = {
  id: "gln",
  label: "Glutamine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 0, y: 84, element: "C", charge: 0 },
      "cd": { id: "cd", x: 0, y: 126, element: "C", charge: 0 },
      "oe": { id: "oe", x: -30, y: 150, element: "O", charge: 0 },
      "ne": { id: "ne", x: 30, y: 150, element: "N", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_cg1": { id: "h_cg1", x: -15, y: 98, element: "H", charge: 0 },
      "h_cg2": { id: "h_cg2", x: 15, y: 98, element: "H", charge: 0 },
      "h_ne1": { id: "h_ne1", x: 30, y: 168, element: "H", charge: 0 },
      "h_ne2": { id: "h_ne2", x: 45, y: 150, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd": { id: "b_cg_cd", a1: "cg", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_oe": { id: "b_cd_oe", a1: "cd", a2: "oe", order: 2, stereo: "none", doubleSide: "auto" },
      "b_cd_ne": { id: "b_cd_ne", a1: "cd", a2: "ne", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h1": { id: "b_cg_h1", a1: "cg", a2: "h_cg1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h2": { id: "b_cg_h2", a1: "cg", a2: "h_cg2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ne_h1": { id: "b_ne_h1", a1: "ne", a2: "h_ne1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ne_h2": { id: "b_ne_h2", a1: "ne", a2: "h_ne2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Glutamate (Glu, E) - carboxylate side chain: -CH2-CH2-C(=O)-O-
export const glu: StructureTemplate = {
  id: "glu",
  label: "Glutamate",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 0, y: 84, element: "C", charge: 0 },
      "cd": { id: "cd", x: 0, y: 126, element: "C", charge: 0 },
      "oe1": { id: "oe1", x: -30, y: 150, element: "O", charge: -1 },
      "oe2": { id: "oe2", x: 30, y: 150, element: "O", charge: -1 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_cg1": { id: "h_cg1", x: -15, y: 98, element: "H", charge: 0 },
      "h_cg2": { id: "h_cg2", x: 15, y: 98, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd": { id: "b_cg_cd", a1: "cg", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_oe1": { id: "b_cd_oe1", a1: "cd", a2: "oe1", order: 2, stereo: "none", doubleSide: "auto" },
      "b_cd_oe2": { id: "b_cd_oe2", a1: "cd", a2: "oe2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h1": { id: "b_cg_h1", a1: "cg", a2: "h_cg1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h2": { id: "b_cg_h2", a1: "cg", a2: "h_cg2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Histidine (His, H) - imidazole side chain: -CH2-Imidazole
export const his: StructureTemplate = {
  id: "his",
  label: "Histidine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: -25, y: 76, element: "C", charge: 0 },
      "cd": { id: "cd", x: 0, y: 114, element: "C", charge: 0 },
      "nd1": { id: "nd1", x: -50, y: 76, element: "N", charge: 0 },
      "ne": { id: "ne", x: 50, y: 76, element: "N", charge: 0 },
      "h_cb1": { id: "h_cb1", x: 15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: -15, y: 56, element: "H", charge: 0 },
      "h_cg": { id: "h_cg", x: -25, y: 94, element: "H", charge: 0 },
      "h_cd": { id: "h_cd", x: 0, y: 132, element: "H", charge: 0 },
      "h_nd": { id: "h_nd", x: -50, y: 94, element: "H", charge: 0 },
      "h_ne": { id: "h_ne", x: 50, y: 94, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd": { id: "b_cg_cd", a1: "cg", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_nd1": { id: "b_cg_nd1", a1: "cg", a2: "nd1", order: 2, stereo: "none", doubleSide: "auto" },
      "b_cd_ne": { id: "b_cd_ne", a1: "cd", a2: "ne", order: 2, stereo: "none", doubleSide: "auto" },
      "b_nd1_cd": { id: "b_nd1_cd", a1: "nd1", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h": { id: "b_cg_h", a1: "cg", a2: "h_cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h": { id: "b_cd_h", a1: "cd", a2: "h_cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nd_h": { id: "b_nd_h", a1: "nd1", a2: "h_nd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ne_h": { id: "b_ne_h", a1: "ne", a2: "h_ne", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Isoleucine (Ile, I) - sec-butyl side chain: -CH(CH3)-CH2-CH3
export const ile: StructureTemplate = {
  id: "ile",
  label: "Isoleucine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: -25, y: 76, element: "C", charge: 0 },
      "cg2": { id: "cg2", x: 25, y: 76, element: "C", charge: 0 },
      "cd": { id: "cd", x: -25, y: 114, element: "C", charge: 0 },
      "h_cb": { id: "h_cb", x: 0, y: 24, element: "H", charge: 0 },
      "h_cg": { id: "h_cg", x: -25, y: 94, element: "H", charge: 0 },
      "h_cg2a": { id: "h_cg2a", x: 25, y: 58, element: "H", charge: 0 },
      "h_cg2b": { id: "h_cg2b", x: 40, y: 76, element: "H", charge: 0 },
      "h_cg2c": { id: "h_cg2c", x: 25, y: 94, element: "H", charge: 0 },
      "h_cd1": { id: "h_cd1", x: -25, y: 132, element: "H", charge: 0 },
      "h_cd2": { id: "h_cd2", x: -40, y: 114, element: "H", charge: 0 },
      "h_cd3": { id: "h_cd3", x: -10, y: 114, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg2": { id: "b_cb_cg2", a1: "cb", a2: "cg2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd": { id: "b_cg_cd", a1: "cg", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h": { id: "b_cb_h", a1: "cb", a2: "h_cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h": { id: "b_cg_h", a1: "cg", a2: "h_cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg2_h1": { id: "b_cg2_h1", a1: "cg2", a2: "h_cg2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg2_h2": { id: "b_cg2_h2", a1: "cg2", a2: "h_cg2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg2_h3": { id: "b_cg2_h3", a1: "cg2", a2: "h_cg2c", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h1": { id: "b_cd_h1", a1: "cd", a2: "h_cd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h2": { id: "b_cd_h2", a1: "cd", a2: "h_cd2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h3": { id: "b_cd_h3", a1: "cd", a2: "h_cd3", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Leucine (Leu, L) - isobutyl side chain: -CH2-CH(CH3)2
export const leu: StructureTemplate = {
  id: "leu",
  label: "Leucine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 0, y: 84, element: "C", charge: 0 },
      "cd1": { id: "cd1", x: -25, y: 114, element: "C", charge: 0 },
      "cd2": { id: "cd2", x: 25, y: 114, element: "C", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_cg": { id: "h_cg", x: 0, y: 102, element: "H", charge: 0 },
      "h_cd1a": { id: "h_cd1a", x: -25, y: 132, element: "H", charge: 0 },
      "h_cd1b": { id: "h_cd1b", x: -40, y: 114, element: "H", charge: 0 },
      "h_cd1c": { id: "h_cd1c", x: -10, y: 114, element: "H", charge: 0 },
      "h_cd2a": { id: "h_cd2a", x: 25, y: 132, element: "H", charge: 0 },
      "h_cd2b": { id: "h_cd2b", x: 40, y: 114, element: "H", charge: 0 },
      "h_cd2c": { id: "h_cd2c", x: 10, y: 114, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd1": { id: "b_cg_cd1", a1: "cg", a2: "cd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd2": { id: "b_cg_cd2", a1: "cg", a2: "cd2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h": { id: "b_cg_h", a1: "cg", a2: "h_cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd1_h1": { id: "b_cd1_h1", a1: "cd1", a2: "h_cd1a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd1_h2": { id: "b_cd1_h2", a1: "cd1", a2: "h_cd1b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd1_h3": { id: "b_cd1_h3", a1: "cd1", a2: "h_cd1c", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd2_h1": { id: "b_cd2_h1", a1: "cd2", a2: "h_cd2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd2_h2": { id: "b_cd2_h2", a1: "cd2", a2: "h_cd2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd2_h3": { id: "b_cd2_h3", a1: "cd2", a2: "h_cd2c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Lysine (Lys, K) - aminoalkyl side chain: -(CH2)4-NH2
export const lys: StructureTemplate = {
  id: "lys",
  label: "Lysine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 0, y: 84, element: "C", charge: 0 },
      "cd": { id: "cd", x: 0, y: 126, element: "C", charge: 0 },
      "ce": { id: "ce", x: 0, y: 168, element: "C", charge: 0 },
      "nz": { id: "nz", x: 0, y: 210, element: "N", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_cg1": { id: "h_cg1", x: -15, y: 98, element: "H", charge: 0 },
      "h_cg2": { id: "h_cg2", x: 15, y: 98, element: "H", charge: 0 },
      "h_cd1": { id: "h_cd1", x: -15, y: 140, element: "H", charge: 0 },
      "h_cd2": { id: "h_cd2", x: 15, y: 140, element: "H", charge: 0 },
      "h_ce1": { id: "h_ce1", x: -15, y: 182, element: "H", charge: 0 },
      "h_ce2": { id: "h_ce2", x: 15, y: 182, element: "H", charge: 0 },
      "h_nz1": { id: "h_nz1", x: 0, y: 228, element: "H", charge: 0 },
      "h_nz2": { id: "h_nz2", x: 15, y: 210, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd": { id: "b_cg_cd", a1: "cg", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_ce": { id: "b_cd_ce", a1: "cd", a2: "ce", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ce_nz": { id: "b_ce_nz", a1: "ce", a2: "nz", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h1": { id: "b_cg_h1", a1: "cg", a2: "h_cg1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h2": { id: "b_cg_h2", a1: "cg", a2: "h_cg2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h1": { id: "b_cd_h1", a1: "cd", a2: "h_cd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h2": { id: "b_cd_h2", a1: "cd", a2: "h_cd2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ce_h1": { id: "b_ce_h1", a1: "ce", a2: "h_ce1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ce_h2": { id: "b_ce_h2", a1: "ce", a2: "h_ce2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nz_h1": { id: "b_nz_h1", a1: "nz", a2: "h_nz1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_nz_h2": { id: "b_nz_h2", a1: "nz", a2: "h_nz2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Methionine (Met, M) - thioether side chain: -CH2-CH2-S-CH3
export const met: StructureTemplate = {
  id: "met",
  label: "Methionine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 0, y: 84, element: "C", charge: 0 },
      "cs": { id: "cs", x: 0, y: 126, element: "S", charge: 0 },
      "ct": { id: "ct", x: 0, y: 168, element: "C", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_cg1": { id: "h_cg1", x: -15, y: 98, element: "H", charge: 0 },
      "h_cg2": { id: "h_cg2", x: 15, y: 98, element: "H", charge: 0 },
      "h_ct1": { id: "h_ct1", x: -15, y: 182, element: "H", charge: 0 },
      "h_ct2": { id: "h_ct2", x: 15, y: 182, element: "H", charge: 0 },
      "h_ct3": { id: "h_ct3", x: 0, y: 168, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cs": { id: "b_cg_cs", a1: "cg", a2: "cs", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cs_ct": { id: "b_cs_ct", a1: "cs", a2: "ct", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h1": { id: "b_cg_h1", a1: "cg", a2: "h_cg1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h2": { id: "b_cg_h2", a1: "cg", a2: "h_cg2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ct_h1": { id: "b_ct_h1", a1: "ct", a2: "h_ct1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ct_h2": { id: "b_ct_h2", a1: "ct", a2: "h_ct2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ct_h3": { id: "b_ct_h3", a1: "ct", a2: "h_ct3", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Phenylalanine (Phe, F) - benzyl side chain: -CH2-Ph
export const phe: StructureTemplate = {
  id: "phe",
  label: "Phenylalanine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cz": { id: "cz", x: -25, y: 76, element: "C", charge: 0 },
      "ch1": { id: "ch1", x: -50, y: 76, element: "C", charge: 0 },
      "ch2": { id: "ch2", x: -62, y: 114, element: "C", charge: 0 },
      "ch3": { id: "ch3", x: -62, y: 152, element: "C", charge: 0 },
      "ch4": { id: "ch4", x: -50, y: 190, element: "C", charge: 0 },
      "ch5": { id: "ch5", x: -25, y: 190, element: "C", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_ch2": { id: "h_ch2", x: -75, y: 114, element: "H", charge: 0 },
      "h_ch3": { id: "h_ch3", x: -75, y: 152, element: "H", charge: 0 },
      "h_ch4": { id: "h_ch4", x: -50, y: 208, element: "H", charge: 0 },
      "h_ch5": { id: "h_ch5", x: -25, y: 208, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cz": { id: "b_cb_cz", a1: "cb", a2: "cz", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cz_ch1": { id: "b_cz_ch1", a1: "cz", a2: "ch1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch1_ch2": { id: "b_ch1_ch2", a1: "ch1", a2: "ch2", order: 2, stereo: "none", doubleSide: "auto" },
      "b_ch2_ch3": { id: "b_ch2_ch3", a1: "ch2", a2: "ch3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch3_ch4": { id: "b_ch3_ch4", a1: "ch3", a2: "ch4", order: 2, stereo: "none", doubleSide: "auto" },
      "b_ch4_ch5": { id: "b_ch4_ch5", a1: "ch4", a2: "ch5", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch5_cz": { id: "b_ch5_cz", a1: "ch5", a2: "cz", order: 2, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch2_h": { id: "b_ch2_h", a1: "ch2", a2: "h_ch2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch3_h": { id: "b_ch3_h", a1: "ch3", a2: "h_ch3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch4_h": { id: "b_ch4_h", a1: "ch4", a2: "h_ch4", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch5_h": { id: "b_ch5_h", a1: "ch5", a2: "h_ch5", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Proline (Pro, P) - cyclic side chain: pyrrolidine ring (CA-CB-CG-CD-N-CA)
export const pro: StructureTemplate = {
  id: "pro",
  label: "Proline",
  category: "aminoAcids",
  molecule: {
    atoms: {
      // N is shared with backbone, CA is alpha carbon
      "ca": { id: "ca", x: 0, y: 0, element: "C", charge: 0 },
      "n": { id: "n", x: -42, y: 0, element: "N", charge: 0 },
      "c": { id: "c", x: 42, y: 0, element: "C", charge: 0 },
      "o": { id: "o", x: 72, y: -36, element: "O", charge: 0 },
      "oh": { id: "oh", x: 72, y: 36, element: "O", charge: 0 },
      "h_oh": { id: "h_oh", x: 72, y: 72, element: "H", charge: 0 },
      "h_ca": { id: "h_ca", x: 0, y: -42, element: "H", charge: 0 },
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: -30, y: 76, element: "C", charge: 0 },
      "cd": { id: "cd", x: -60, y: 76, element: "C", charge: 0 },
      "h_cb1": { id: "h_cb1", x: 15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: -15, y: 56, element: "H", charge: 0 },
      "h_cg1": { id: "h_cg1", x: -30, y: 94, element: "H", charge: 0 },
      "h_cg2": { id: "h_cg2", x: -45, y: 76, element: "H", charge: 0 },
      "h_cd1": { id: "h_cd1", x: -60, y: 94, element: "H", charge: 0 },
      "h_cd2": { id: "h_cd2", x: -75, y: 76, element: "H", charge: 0 },
    },
    bonds: {
      "b_ca_n": { id: "b_ca_n", a1: "ca", a2: "n", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ca_c": { id: "b_ca_c", a1: "ca", a2: "c", order: 1, stereo: "none", doubleSide: "auto" },
      "b_c_o": { id: "b_c_o", a1: "c", a2: "o", order: 2, stereo: "none", doubleSide: "auto" },
      "b_c_oh": { id: "b_c_oh", a1: "c", a2: "oh", order: 1, stereo: "none", doubleSide: "auto" },
      "b_oh_h": { id: "b_oh_h", a1: "oh", a2: "h_oh", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ca_h": { id: "b_ca_h", a1: "ca", a2: "h_ca", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd": { id: "b_cg_cd", a1: "cg", a2: "cd", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_n": { id: "b_cd_n", a1: "cd", a2: "n", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h1": { id: "b_cg_h1", a1: "cg", a2: "h_cg1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h2": { id: "b_cg_h2", a1: "cg", a2: "h_cg2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h1": { id: "b_cd_h1", a1: "cd", a2: "h_cd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd_h2": { id: "b_cd_h2", a1: "cd", a2: "h_cd2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Serine (Ser, S) - hydroxymethyl side chain: -CH2-OH
export const ser: StructureTemplate = {
  id: "ser",
  label: "Serine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "og": { id: "og", x: 0, y: 84, element: "O", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_og": { id: "h_og", x: 0, y: 102, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_og": { id: "b_cb_og", a1: "cb", a2: "og", order: 1, stereo: "none", doubleSide: "auto" },
      "b_og_h": { id: "b_og_h", a1: "og", a2: "h_og", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Threonine (Thr, T) - -CH(OH)-CH3 side chain
export const thr: StructureTemplate = {
  id: "thr",
  label: "Threonine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: 25, y: 76, element: "C", charge: 0 },
      "og": { id: "og", x: -25, y: 76, element: "O", charge: 0 },
      "h_cb": { id: "h_cb", x: 0, y: 24, element: "H", charge: 0 },
      "h_cg1": { id: "h_cg1", x: 25, y: 58, element: "H", charge: 0 },
      "h_cg2": { id: "h_cg2", x: 40, y: 76, element: "H", charge: 0 },
      "h_cg3": { id: "h_cg3", x: 25, y: 94, element: "H", charge: 0 },
      "h_og": { id: "h_og", x: -43, y: 76, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_og": { id: "b_cb_og", a1: "cb", a2: "og", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h": { id: "b_cb_h", a1: "cb", a2: "h_cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h1": { id: "b_cg_h1", a1: "cg", a2: "h_cg1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h2": { id: "b_cg_h2", a1: "cg", a2: "h_cg2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_h3": { id: "b_cg_h3", a1: "cg", a2: "h_cg3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_og_h": { id: "b_og_h", a1: "og", a2: "h_og", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Tryptophan (Trp, W) - indole side chain
export const trp: StructureTemplate = {
  id: "trp",
  label: "Tryptophan",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg": { id: "cg", x: -25, y: 76, element: "C", charge: 0 },
      "cd1": { id: "cd1", x: -50, y: 76, element: "C", charge: 0 },
      "cd2": { id: "cd2", x: 0, y: 114, element: "C", charge: 0 },
      "ce": { id: "ce", x: -25, y: 152, element: "C", charge: 0 },
      "ne": { id: "ne", x: 25, y: 114, element: "N", charge: 0 },
      "h_cb1": { id: "h_cb1", x: 15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: -15, y: 56, element: "H", charge: 0 },
      "h_cd1": { id: "h_cd1", x: -62, y: 76, element: "H", charge: 0 },
      "h_cd2": { id: "h_cd2", x: 0, y: 132, element: "H", charge: 0 },
      "h_ce": { id: "h_ce", x: -25, y: 170, element: "H", charge: 0 },
      "h_ne": { id: "h_ne", x: 43, y: 114, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg": { id: "b_cb_cg", a1: "cb", a2: "cg", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd1": { id: "b_cg_cd1", a1: "cg", a2: "cd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg_cd2": { id: "b_cg_cd2", a1: "cg", a2: "cd2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd1_ce": { id: "b_cd1_ce", a1: "cd1", a2: "ce", order: 2, stereo: "none", doubleSide: "auto" },
      "b_cd2_ne": { id: "b_cd2_ne", a1: "cd2", a2: "ne", order: 2, stereo: "none", doubleSide: "auto" },
      "b_ce_ne": { id: "b_ce_ne", a1: "ce", a2: "ne", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd1_h": { id: "b_cd1_h", a1: "cd1", a2: "h_cd1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cd2_h": { id: "b_cd2_h", a1: "cd2", a2: "h_cd2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ce_h": { id: "b_ce_h", a1: "ce", a2: "h_ce", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ne_h": { id: "b_ne_h", a1: "ne", a2: "h_ne", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Tyrosine (Tyr, Y) - phenolic side chain: -CH2-Ph-OH
export const tyr: StructureTemplate = {
  id: "tyr",
  label: "Tyrosine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cz": { id: "cz", x: -25, y: 76, element: "C", charge: 0 },
      "ch1": { id: "ch1", x: -50, y: 76, element: "C", charge: 0 },
      "ch2": { id: "ch2", x: -62, y: 114, element: "C", charge: 0 },
      "ch3": { id: "ch3", x: -62, y: 152, element: "C", charge: 0 },
      "oh": { id: "oh_ring", x: -62, y: 190, element: "O", charge: 0 },
      "ch4": { id: "ch4", x: -50, y: 190, element: "C", charge: 0 },
      "ch5": { id: "ch5", x: -25, y: 190, element: "C", charge: 0 },
      "h_cb1": { id: "h_cb1", x: -15, y: 56, element: "H", charge: 0 },
      "h_cb2": { id: "h_cb2", x: 15, y: 56, element: "H", charge: 0 },
      "h_ch2": { id: "h_ch2", x: -75, y: 114, element: "H", charge: 0 },
      "h_ch3": { id: "h_ch3", x: -75, y: 152, element: "H", charge: 0 },
      "h_oh": { id: "h_oh_ring", x: -62, y: 208, element: "H", charge: 0 },
      "h_ch4": { id: "h_ch4", x: -50, y: 208, element: "H", charge: 0 },
      "h_ch5": { id: "h_ch5", x: -25, y: 208, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cz": { id: "b_cb_cz", a1: "cb", a2: "cz", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cz_ch1": { id: "b_cz_ch1", a1: "cz", a2: "ch1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch1_ch2": { id: "b_ch1_ch2", a1: "ch1", a2: "ch2", order: 2, stereo: "none", doubleSide: "auto" },
      "b_ch2_ch3": { id: "b_ch2_ch3", a1: "ch2", a2: "ch3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch3_oh": { id: "b_ch3_oh", a1: "ch3", a2: "oh", order: 1, stereo: "none", doubleSide: "auto" },
      "b_oh_ch4": { id: "b_oh_ch4", a1: "oh", a2: "ch4", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch4_ch5": { id: "b_ch4_ch5", a1: "ch4", a2: "ch5", order: 2, stereo: "none", doubleSide: "auto" },
      "b_ch5_cz": { id: "b_ch5_cz", a1: "ch5", a2: "cz", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h1": { id: "b_cb_h1", a1: "cb", a2: "h_cb1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h2": { id: "b_cb_h2", a1: "cb", a2: "h_cb2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch2_h": { id: "b_ch2_h", a1: "ch2", a2: "h_ch2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch3_h": { id: "b_ch3_h", a1: "ch3", a2: "h_ch3", order: 1, stereo: "none", doubleSide: "auto" },
      "b_oh_h": { id: "b_oh_h", a1: "oh", a2: "h_oh", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch4_h": { id: "b_ch4_h", a1: "ch4", a2: "h_ch4", order: 1, stereo: "none", doubleSide: "auto" },
      "b_ch5_h": { id: "b_ch5_h", a1: "ch5", a2: "h_ch5", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Valine (Val, V) - isopropyl side chain: -CH(CH3)2
export const val: StructureTemplate = {
  id: "val",
  label: "Valine",
  category: "aminoAcids",
  molecule: {
    atoms: {
      ...BACKBONE.atoms,
      "cb": { id: "cb", x: 0, y: 42, element: "C", charge: 0 },
      "cg1": { id: "cg1", x: -25, y: 76, element: "C", charge: 0 },
      "cg2": { id: "cg2", x: 25, y: 76, element: "C", charge: 0 },
      "h_cb": { id: "h_cb", x: 0, y: 24, element: "H", charge: 0 },
      "h_cg1a": { id: "h_cg1a", x: -25, y: 94, element: "H", charge: 0 },
      "h_cg1b": { id: "h_cg1b", x: -40, y: 76, element: "H", charge: 0 },
      "h_cg1c": { id: "h_cg1c", x: -10, y: 76, element: "H", charge: 0 },
      "h_cg2a": { id: "h_cg2a", x: 25, y: 94, element: "H", charge: 0 },
      "h_cg2b": { id: "h_cg2b", x: 40, y: 76, element: "H", charge: 0 },
      "h_cg2c": { id: "h_cg2c", x: 10, y: 76, element: "H", charge: 0 },
    },
    bonds: {
      ...BACKBONE.bonds,
      "b_ca_cb": { id: "b_ca_cb", a1: "ca", a2: "cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg1": { id: "b_cb_cg1", a1: "cb", a2: "cg1", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_cg2": { id: "b_cb_cg2", a1: "cb", a2: "cg2", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cb_h": { id: "b_cb_h", a1: "cb", a2: "h_cb", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg1_h1": { id: "b_cg1_h1", a1: "cg1", a2: "h_cg1a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg1_h2": { id: "b_cg1_h2", a1: "cg1", a2: "h_cg1b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg1_h3": { id: "b_cg1_h3", a1: "cg1", a2: "h_cg1c", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg2_h1": { id: "b_cg2_h1", a1: "cg2", a2: "h_cg2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg2_h2": { id: "b_cg2_h2", a1: "cg2", a2: "h_cg2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b_cg2_h3": { id: "b_cg2_h3", a1: "cg2", a2: "h_cg2c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Export all 20 amino acid templates
export const AMINO_ACID_TEMPLATES = [
  gly,
  ala,
  arg,
  asn,
  asp,
  gln,
  glu,
  his,
  ile,
  leu,
  lys,
  met,
  phe,
  pro,
  ser,
  thr,
  trp,
  tyr,
  val,
];