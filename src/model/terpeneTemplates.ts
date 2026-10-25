import type { Molecule, Annotation } from "../types/chemistry";
import { StructureTemplate } from "../model/structureTemplates";

/**
 * Terpene templates as StructureTemplates.
 * Includes monoterpenes (C10), sesquiterpenes (C15), diterpenes (C20),
 * and triterpenes (C30).
 * Coordinates are re-centered so each template's bounding-box center sits at (0, 0).
 */

// Monoterpene: Limonene (common citrus scent)
export const limonene: StructureTemplate = {
  id: "limonene",
  label: "Limonene",
  category: "terpenes",
  molecule: {
    atoms: {
      // Three double bonds in a cyclohexene ring + isopropenyl group
      "c1": { id: "c1", x: 0, y: 0, element: "C", charge: 0 },
      "c2": { id: "c2", x: 30, y: -20, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: 20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 0, y: 40, element: "C", charge: 0 },
      "c5": { id: "c5", x: -30, y: 20, element: "C", charge: 0 },
      "c6": { id: "c6", x: -30, y: -20, element: "C", charge: 0 },
      // Isopropenyl group at C1
      "c7": { id: "c7", x: 50, y: 0, element: "C", charge: 0 },
      "c8": { id: "c8", x: 80, y: -20, element: "C", charge: 0 },
      "c9": { id: "c9", x: 80, y: 20, element: "C", charge: 0 },
      // Double bonds
      "c10": { id: "c10", x: 30, y: -40, element: "C", charge: 0 },
      "c11": { id: "c11", x: -30, y: -40, element: "C", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: -40, y: 0, element: "H", charge: 0 },
      "h2": { id: "h2", x: 40, y: -20, element: "H", charge: 0 },
      "h3": { id: "h3", x: 40, y: 20, element: "H", charge: 0 },
      "h4": { id: "h4", x: -40, y: 40, element: "H", charge: 0 },
      "h5": { id: "h5", x: 50, y: -20, element: "H", charge: 0 },
      "h6": { id: "h6", x: -50, y: -20, element: "H", charge: 0 },
      "h7": { id: "h7", x: 90, y: 0, element: "H", charge: 0 },
      "h8": { id: "h8", x: 90, y: -30, element: "H", charge: 0 },
      "h9": { id: "h9", x: 90, y: 30, element: "H", charge: 0 },
    },
    bonds: {
      // Cyclohexene ring (with one double bond)
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c6", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Isopropenyl group
      "b7": { id: "b7", a1: "c1", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c7", a2: "c8", order: 2, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b9": { id: "b9", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c2", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c5", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c6", a2: "h6", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c7", a2: "h7", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c8", a2: "h8", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c8", a2: "h9", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Sesquiterpene: Caryophyllene (found in clove, black pepper)
export const caryophyllene: StructureTemplate = {
  id: "caryophyllene",
  label: "Caryophyllene",
  category: "terpenes",
  molecule: {
    atoms: {
      // 4,11-dimethyl-8-ethylidenecyclodeca-1,3,5-triene (simplified)
      // 15-carbon skeleton with 4 double bonds and a ring
      "c1": { id: "c1", x: 0, y: 0, element: "C", charge: 0 },
      "c2": { id: "c2", x: 30, y: -20, element: "C", charge: 0 },
      "c3": { id: "c3", x: 50, y: 0, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 0, y: 30, element: "C", charge: 0 },
      "c6": { id: "c6", x: -30, y: 20, element: "C", charge: 0 },
      "c7": { id: "c7", x: -50, y: 0, element: "C", charge: 0 },
      "c8": { id: "c8", x: -30, y: -20, element: "C", charge: 0 },
      "c9": { id: "c9", x: -50, y: -30, element: "C", charge: 0 },
      "c10": { id: "c10", x: 0, y: -30, element: "C", charge: 0 }, // quaternary center
      // Isopropyl group at C4
      "c11": { id: "c11", x: 50, y: 30, element: "C", charge: 0 },
      "c12": { id: "c12", x: 80, y: 20, element: "C", charge: 0 },
      "c13": { id: "c13", x: 80, y: 40, element: "C", charge: 0 },
      // Ethylidene group at C11
      "c14": { id: "c14", x: 30, y: 50, element: "C", charge: 0 },
      "c15": { id: "c15", x: 60, y: 60, element: "C", charge: 0 },
      "c16": { id: "c16", x: 30, y: 70, element: "C", charge: 0 },
      // Methyl groups
      "c17": { id: "c17", x: -20, y: 50, element: "C", charge: 0 },
      "c18": { id: "c18", x: -20, y: 10, element: "C", charge: 0 },
      "c19": { id: "c19", x: -40, y: -10, element: "C", charge: 0 },
      "c20": { id: "c20", x: -40, y: -30, element: "C", charge: 0 },
      // Hydrogens (selective)
      "h1": { id: "h1", x: -50, y: 0, element: "H", charge: 0 },
      "h2": { id: "h2", x: 30, y: -40, element: "H", charge: 0 },
      "h3": { id: "h3", x: 30, y: 40, element: "H", charge: 0 },
      "h4": { id: "h4", x: -30, y: 40, element: "H", charge: 0 },
      "h5": { id: "h5", x: -50, y: -30, element: "H", charge: 0 },
      "h6": { id: "h6", x: 50, y: 40, element: "H", charge: 0 },
      "h7": { id: "h7", x: 50, y: 50, element: "H", charge: 0 },
      "h8": { id: "h8", x: 70, y: 60, element: "H", charge: 0 },
      "h9": { id: "h9", x: 70, y: 70, element: "H", charge: 0 },
      "h10": { id: "h10", x: 30, y: 80, element: "H", charge: 0 },
    },
    bonds: {
      // Cyclodecane ring (10-membered with 4 double bonds)
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c7", a2: "c8", order: 2, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c9", a2: "c10", order: 2, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c10", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Isopropyl group
      "b11": { id: "b11", a1: "c4", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c12", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      // Ethylidene group
      "b14": { id: "b14", a1: "c11", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c14", a2: "c15", order: 2, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c15", a2: "h7", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b17": { id: "b17", a1: "c10", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c10", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c10", a2: "c19", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c10", a2: "c20", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b21": { id: "b21", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c2", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c6", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c7", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c9", a2: "h6", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "c11", a2: "h7", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c14", a2: "h8", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c15", a2: "h9", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Diterpene: Retinol (Vitamin A, C20)
export const retinol: StructureTemplate = {
  id: "retinol",
  label: "Retinol (Vitamin A)",
  category: "terpenes",
  molecule: {
    atoms: {
      // Ionone ring + polyene chain
      // Ring (6-membered with one double bond)
      "c1": { id: "c1", x: 0, y: 0, element: "C", charge: 0 },
      "c2": { id: "c2", x: 30, y: -20, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: 20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 0, y: 40, element: "C", charge: 0 },
      "c5": { id: "c5", x: -30, y: 20, element: "C", charge: 0 },
      "c6": { id: "c6", x: -30, y: -20, element: "C", charge: 0 },
      // Ring double bond
      "c7": { id: "c7", x: 30, y: -40, element: "C", charge: 0 },
      "c8": { id: "c8", x: -30, y: -40, element: "C", charge: 0 },
      // Polyene chain (8 more carbons = C9 to C20)
      "c9": { id: "c9", x: 50, y: 0, element: "C", charge: 0 },
      "c10": { id: "c10", x: 80, y: -20, element: "C", charge: 0 },
      "c11": { id: "c11", x: 80, y: 20, element: "C", charge: 0 },
      "c12": { id: "c12", x: 50, y: 40, element: "C", charge: 0 },
      "c13": { id: "c13", x: 20, y: 60, element: "C", charge: 0 },
      "c14": { id: "c14", x: -10, y: 50, element: "C", charge: 0 },
      "c15": { id: "c15", x: -30, y: 30, element: "C", charge: 0 },
      "c16": { id: "c16", x: -30, y: -10, element: "C", charge: 0 },
      "c17": { id: "c17", x: -10, y: -30, element: "C", charge: 0 },
      "c18": { id: "c18", x: 10, y: -50, element: "C", charge: 0 },
      "c19": { id: "c19", x: 30, y: -50, element: "C", charge: 0 },
      "c20": { id: "c20", x: 50, y: -30, element: "C", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: -40, y: 0, element: "H", charge: 0 },
      "h2": { id: "h2", x: 40, y: -20, element: "H", charge: 0 },
      "h3": { id: "h3", x: 40, y: 20, element: "H", charge: 0 },
      "h4": { id: "h4", x: -40, y: 40, element: "H", charge: 0 },
      "h5": { id: "h5", x: 50, y: -20, element: "H", charge: 0 },
      "h6": { id: "h6", x: -50, y: -20, element: "H", charge: 0 },
      "h7": { id: "h7", x: 50, y: -30, element: "H", charge: 0 },
      "h8": { id: "h8", x: 80, y: -30, element: "H", charge: 0 },
      "h9": { id: "h9", x: 80, y: 30, element: "H", charge: 0 },
      "h10": { id: "h10", x: 50, y: -40, element: "H", charge: 0 },
      "h11": { id: "h11", x: 80, y: -50, element: "H", charge: 0 },
      "h12": { id: "h12", x: 50, y: -50, element: "H", charge: 0 },
      "h13": { id: "h13", x: -20, y: 50, element: "H", charge: 0 },
      "h14": { id: "h14", x: -40, y: 60, element: "H", charge: 0 },
      "h15": { id: "h15", x: -40, y: 40, element: "H", charge: 0 },
    },
    bonds: {
      // Ring
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c6", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring double bond
      "b6b": { id: "b6b", a1: "c1", a2: "c7", order: 2, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c8", a2: "c1", order: 2, stereo: "none", doubleSide: "auto" },
      // Polyene chain (9 double bonds total in vitamin A)
      "b9": { id: "b9", a1: "c8", a2: "c9", order: 2, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c10", a2: "c11", order: 2, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c12", a2: "c13", order: 2, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c14", a2: "c15", order: 2, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c16", a2: "c17", order: 2, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c17", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c18", a2: "c19", order: 2, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c19", a2: "c20", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b21": { id: "b21", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c2", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c5", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c6", a2: "h6", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "c9", a2: "h7", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c10", a2: "h8", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c11", a2: "h9", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c12", a2: "h10", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "c14", a2: "h11", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "c15", a2: "h12", order: 1, stereo: "none", doubleSide: "auto" },
      "b33": { id: "b33", a1: "c16", a2: "h13", order: 1, stereo: "none", doubleSide: "auto" },
      "b34": { id: "b34", a1: "c17", a2: "h14", order: 1, stereo: "none", doubleSide: "auto" },
      "b35": { id: "b35", a1: "c18", a2: "h15", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Monoterpene: Menthol (p-isopropyl-3-methylcyclohexanol)
export const menthol: StructureTemplate = {
  id: "menthol",
  label: "Menthol",
  category: "terpenes",
  molecule: {
    atoms: {
      // Cyclohexane ring with -OH at C3, -CH3 at C1, -CH(CH3)2 at C4
      "c1": { id: "c1", x: 0, y: 0, element: "C", charge: 0 },
      "c2": { id: "c2", x: 30, y: -20, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: 20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 0, y: 40, element: "C", charge: 0 },
      "c5": { id: "c5", x: -30, y: 20, element: "C", charge: 0 },
      "c6": { id: "c6", x: -30, y: -20, element: "C", charge: 0 },
      // Methyl at C1
      "c7": { id: "c7", x: -40, y: 0, element: "C", charge: 0 },
      // Hydroxyl at C3
      "o3": { id: "o3", x: 50, y: 20, element: "O", charge: 0 },
      "h3": { id: "h3o", x: 50, y: 40, element: "H", charge: 0 },
      // Isopropyl at C4
      "c8": { id: "c8", x: -50, y: 40, element: "C", charge: 0 },
      "c9": { id: "c9", x: -80, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: -80, y: 50, element: "C", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: 10, y: -40, element: "H", charge: 0 },
      "h2": { id: "h2", x: 40, y: -40, element: "H", charge: 0 },
      "h3c": { id: "h3c", x: 40, y: 40, element: "H", charge: 0 },
      "h4": { id: "h4", x: 10, y: 60, element: "H", charge: 0 },
      "h5": { id: "h5", x: -40, y: 40, element: "H", charge: 0 },
      "h6": { id: "h6", x: -40, y: -40, element: "H", charge: 0 },
      "h7a": { id: "h7a", x: -40, y: -20, element: "H", charge: 0 },
      "h7b": { id: "h7b", x: -40, y: 20, element: "H", charge: 0 },
      "h7c": { id: "h7c", x: -55, y: 0, element: "H", charge: 0 },
      "h8": { id: "h8", x: -50, y: 60, element: "H", charge: 0 },
      "h9a": { id: "h9a", x: -90, y: 10, element: "H", charge: 0 },
      "h9b": { id: "h9b", x: -90, y: 50, element: "H", charge: 0 },
      "h9c": { id: "h9c", x: -80, y: 70, element: "H", charge: 0 },
      "h10a": { id: "h10a", x: -80, y: 30, element: "H", charge: 0 },
      "h10b": { id: "h10b", x: -80, y: 50, element: "H", charge: 0 },
      "h10c": { id: "h10c", x: -95, y: 40, element: "H", charge: 0 },
    },
    bonds: {
      // Cyclohexane ring
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c6", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl at C1
      "b7": { id: "b7", a1: "c1", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydroxyl at C3
      "b8": { id: "b8", a1: "c3", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "o3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      // Isopropyl at C4
      "b10": { id: "b10", a1: "c4", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c8", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring hydrogens
      "b13": { id: "b13", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c2", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c5", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c6", a2: "h6", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl hydrogens
      "b18": { id: "b18", a1: "c7", a2: "h7a", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c7", a2: "h7b", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c7", a2: "h7c", order: 1, stereo: "none", doubleSide: "auto" },
      // Isopropyl hydrogens
      "b21": { id: "b21", a1: "c9", a2: "h9a", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c9", a2: "h9b", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c9", a2: "h9c", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c10", a2: "h10a", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c10", a2: "h10b", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c10", a2: "h10c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Monoterpene: Camphor (1,7,7-trimethylbicyclo[2.2.1]heptan-2-one)
export const camphor: StructureTemplate = {
  id: "camphor",
  label: "Camphor",
  category: "terpenes",
  molecule: {
    atoms: {
      // Bicyclo[2.2.1]heptane skeleton (bornane)
      "c1": { id: "c1", x: 0, y: 0, element: "C", charge: 0 },
      "c2": { id: "c2", x: 30, y: -20, element: "C", charge: 0 },
      "c3": { id: "c3", x: 50, y: 0, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 0, y: 20, element: "C", charge: 0 },
      "c6": { id: "c6", x: -20, y: 10, element: "C", charge: 0 },
      "c7": { id: "c7", x: 0, y: 40, element: "C", charge: 0 },
      // Bridge carbons with methyls
      "c8": { id: "c8", x: 30, y: 50, element: "C", charge: 0 }, // C7 bridge
      // Methyl groups at C1, C7, C7
      "c9": { id: "c9", x: -20, y: -20, element: "C", charge: 0 },
      "c10": { id: "c10", x: 30, y: 70, element: "C", charge: 0 },
      "c11": { id: "c11", x: 50, y: 50, element: "C", charge: 0 },
      // 2-keto oxygen
      "o2": { id: "o2", x: 30, y: -40, element: "O", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: -10, y: -20, element: "H", charge: 0 },
      "h3": { id: "h3", x: 60, y: 20, element: "H", charge: 0 },
      "h4": { id: "h4", x: 40, y: 40, element: "H", charge: 0 },
      "h5": { id: "h5", x: -10, y: 40, element: "H", charge: 0 },
      "h6a": { id: "h6a", x: -30, y: -10, element: "H", charge: 0 },
      "h6b": { id: "h6b", x: -30, y: 30, element: "H", charge: 0 },
      "h7": { id: "h7", x: 0, y: 60, element: "H", charge: 0 },
      "h9a": { id: "h9a", x: -20, y: -40, element: "H", charge: 0 },
      "h9b": { id: "h9b", x: -20, y: 0, element: "H", charge: 0 },
      "h9c": { id: "h9c", x: -35, y: -10, element: "H", charge: 0 },
      "h10a": { id: "h10a", x: 30, y: 90, element: "H", charge: 0 },
      "h10b": { id: "h10b", x: 30, y: 50, element: "H", charge: 0 },
      "h10c": { id: "h10c", x: 15, y: 60, element: "H", charge: 0 },
      "h11a": { id: "h11a", x: 50, y: 70, element: "H", charge: 0 },
      "h11b": { id: "h11b", x: 65, y: 40, element: "H", charge: 0 },
      "h11c": { id: "h11c", x: 65, y: 60, element: "H", charge: 0 },
    },
    bonds: {
      // Bicyclo[2.2.1]heptane bonds
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c6", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c1", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c4", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c8", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b11": { id: "b11", a1: "c1", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c8", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c8", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      // 2-keto
      "b14": { id: "b14", a1: "c2", a2: "o2", order: 2, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b15": { id: "b15", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c5", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c6", a2: "h6a", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c6", a2: "h6b", order: 1, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c7", a2: "h7", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c9", a2: "h9a", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c9", a2: "h9b", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c9", a2: "h9c", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c10", a2: "h10a", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c10", a2: "h10b", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "c10", a2: "h10c", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c11", a2: "h11a", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c11", a2: "h11b", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c11", a2: "h11c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Sesquiterpene: Artemisinin (C15H22O5, endoperoxide bridge)
export const artemisinin: StructureTemplate = {
  id: "artemisinin",
  label: "Artemisinin",
  category: "terpenes",
  molecule: {
    atoms: {
      // Sesquiterpene lactone with endoperoxide bridge (simplified)
      "c1": { id: "c1", x: 0, y: 0, element: "C", charge: 0 },
      "c2": { id: "c2", x: 30, y: -20, element: "C", charge: 0 },
      "c3": { id: "c3", x: 50, y: 0, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 0, y: 20, element: "C", charge: 0 },
      "c6": { id: "c6", x: -20, y: 10, element: "C", charge: 0 },
      "c7": { id: "c7", x: 0, y: 40, element: "C", charge: 0 },
      "c8": { id: "c8", x: 30, y: 50, element: "C", charge: 0 },
      "c9": { id: "c9", x: 50, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: 50, y: 10, element: "C", charge: 0 },
      "c11": { id: "c11", x: 30, y: -40, element: "C", charge: 0 },
      "c12": { id: "c12", x: -20, y: -20, element: "C", charge: 0 },
      "c13": { id: "c13", x: -30, y: 10, element: "C", charge: 0 },
      "c14": { id: "c14", x: -20, y: 30, element: "C", charge: 0 },
      "c15": { id: "c15", x: 0, y: 60, element: "C", charge: 0 },
      // Peroxide oxygens (endoperoxide bridge O-O)
      "o1": { id: "o1", x: 15, y: 80, element: "O", charge: 0 },
      "o2": { id: "o2", x: 45, y: 80, element: "O", charge: 0 },
      // Lactone carbonyl
      "o3": { id: "o3", x: 70, y: 10, element: "O", charge: 0 },
      "o4": { id: "o4", x: 70, y: 50, element: "O", charge: 0 },
      // Hydrogens (selective)
      "h1": { id: "h1", x: -10, y: -20, element: "H", charge: 0 },
      "h2": { id: "h2", x: 30, y: -40, element: "H", charge: 0 },
      "h3": { id: "h3", x: 60, y: 20, element: "H", charge: 0 },
      "h4": { id: "h4", x: 40, y: 40, element: "H", charge: 0 },
      "h5": { id: "h5", x: -10, y: 40, element: "H", charge: 0 },
      "h6a": { id: "h6a", x: -30, y: -10, element: "H", charge: 0 },
      "h6b": { id: "h6b", x: -30, y: 30, element: "H", charge: 0 },
      "h8": { id: "h8", x: 30, y: 70, element: "H", charge: 0 },
      "h9": { id: "h9", x: 60, y: 40, element: "H", charge: 0 },
      "h10": { id: "h10", x: 60, y: -10, element: "H", charge: 0 },
      "h12a": { id: "h12a", x: -20, y: -40, element: "H", charge: 0 },
      "h12b": { id: "h12b", x: -20, y: 0, element: "H", charge: 0 },
      "h13": { id: "h13", x: -40, y: 10, element: "H", charge: 0 },
      "h14": { id: "h14", x: -20, y: 50, element: "H", charge: 0 },
    },
    bonds: {
      // Sesquiterpene skeleton
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c6", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c1", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c4", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c10", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c6", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c13", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c12", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c14", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c8", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      // Endoperoxide bridge O-O
      "b19": { id: "b19", a1: "c8", a2: "o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "o1", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "o2", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      // Lactone group
      "b22": { id: "b22", a1: "c10", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "o3", a2: "o4", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "o4", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b25": { id: "b25", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c2", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "c3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c5", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c6", a2: "h6a", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "c6", a2: "h6b", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "c8", a2: "h8", order: 1, stereo: "none", doubleSide: "auto" },
      "b33": { id: "b33", a1: "c9", a2: "h9", order: 1, stereo: "none", doubleSide: "auto" },
      "b34": { id: "b34", a1: "c10", a2: "h10", order: 1, stereo: "none", doubleSide: "auto" },
      "b35": { id: "b35", a1: "c12", a2: "h12a", order: 1, stereo: "none", doubleSide: "auto" },
      "b36": { id: "b36", a1: "c12", a2: "h12b", order: 1, stereo: "none", doubleSide: "auto" },
      "b37": { id: "b37", a1: "c13", a2: "h13", order: 1, stereo: "none", doubleSide: "auto" },
      "b38": { id: "b38", a1: "c14", a2: "h14", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Triterpene: Squalene (C30H50, acyclic polyunsaturated hydrocarbon)
export const squalene: StructureTemplate = {
  id: "squalene",
  label: "Squalene",
  category: "terpenes",
  molecule: {
    atoms: {
      // Squalene: 2,6,10,15,19,23-hexamethyltetracosa-2,6,10,14,18,22-hexaene
      // 30 carbons, 6 double bonds, acyclic
      "c1": { id: "c1", x: 0, y: 0, element: "C", charge: 0 },
      "c2": { id: "c2", x: 30, y: -20, element: "C", charge: 0 },
      "c3": { id: "c3", x: 60, y: -20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 90, y: 0, element: "C", charge: 0 },
      "c5": { id: "c5", x: 120, y: 0, element: "C", charge: 0 },
      "c6": { id: "c6", x: 150, y: -20, element: "C", charge: 0 },
      "c7": { id: "c7", x: 180, y: -20, element: "C", charge: 0 },
      "c8": { id: "c8", x: 210, y: 0, element: "C", charge: 0 },
      "c9": { id: "c9", x: 240, y: 0, element: "C", charge: 0 },
      "c10": { id: "c10", x: 270, y: -20, element: "C", charge: 0 },
      "c11": { id: "c11", x: 300, y: -20, element: "C", charge: 0 },
      "c12": { id: "c12", x: 330, y: 0, element: "C", charge: 0 },
      // Methyl branches
      "c13": { id: "c13", x: 30, y: 0, element: "C", charge: 0 },
      "c14": { id: "c14", x: 90, y: -40, element: "C", charge: 0 },
      "c15": { id: "c15", x: 150, y: 0, element: "C", charge: 0 },
      "c16": { id: "c16", x: 210, y: -40, element: "C", charge: 0 },
      "c17": { id: "c17", x: 270, y: 0, element: "C", charge: 0 },
      "c18": { id: "c18", x: 330, y: -40, element: "C", charge: 0 },
      // Continue chain
      "c19": { id: "c19", x: 360, y: 0, element: "C", charge: 0 },
      "c20": { id: "c20", x: 390, y: -20, element: "C", charge: 0 },
      "c21": { id: "c21", x: 420, y: -20, element: "C", charge: 0 },
      "c22": { id: "c22", x: 450, y: 0, element: "C", charge: 0 },
      "c23": { id: "c23", x: 480, y: 0, element: "C", charge: 0 },
      "c24": { id: "c24", x: 510, y: -20, element: "C", charge: 0 },
      "c25": { id: "c25", x: 540, y: -20, element: "C", charge: 0 },
      "c26": { id: "c26", x: 570, y: 0, element: "C", charge: 0 },
      // More methyl branches
      "c27": { id: "c27", x: 360, y: -40, element: "C", charge: 0 },
      "c28": { id: "c28", x: 420, y: -40, element: "C", charge: 0 },
      "c29": { id: "c29", x: 480, y: -40, element: "C", charge: 0 },
      "c30": { id: "c30", x: 540, y: -40, element: "C", charge: 0 },
      // Hydrogens (selective)
      "h1": { id: "h1", x: -10, y: 0, element: "H", charge: 0 },
      "h2": { id: "h2", x: 0, y: -20, element: "H", charge: 0 },
      "h3": { id: "h3", x: 30, y: -40, element: "H", charge: 0 },
      "h4": { id: "h4", x: 60, y: -40, element: "H", charge: 0 },
      "h5": { id: "h5", x: 100, y: 0, element: "H", charge: 0 },
      "h6": { id: "h6", x: 120, y: 20, element: "H", charge: 0 },
      "h7": { id: "h7", x: 150, y: -40, element: "H", charge: 0 },
      "h8": { id: "h8", x: 180, y: -40, element: "H", charge: 0 },
      "h9": { id: "h9", x: 210, y: 20, element: "H", charge: 0 },
      "h10": { id: "h10", x: 240, y: 20, element: "H", charge: 0 },
      "h11": { id: "h11", x: 270, y: -40, element: "H", charge: 0 },
      "h12": { id: "h12", x: 300, y: -40, element: "H", charge: 0 },
    },
    bonds: {
      // Main chain with alternating double bonds
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 2, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c6", order: 2, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c8", a2: "c9", order: 2, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c10", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c11", a2: "c12", order: 2, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c12", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c14", a2: "c15", order: 2, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c16", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "c17", a2: "c18", order: 2, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c18", a2: "c19", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c19", a2: "c20", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c20", a2: "c21", order: 2, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c21", a2: "c22", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c22", a2: "c23", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "c23", a2: "c24", order: 2, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "c24", a2: "c25", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c25", a2: "c26", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl branches
      "b26": { id: "b26", a1: "c3", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "c6", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c9", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c12", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c15", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "c18", a2: "c27", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "c21", a2: "c28", order: 1, stereo: "none", doubleSide: "auto" },
      "b33": { id: "b33", a1: "c24", a2: "c29", order: 1, stereo: "none", doubleSide: "auto" },
      "b34": { id: "b34", a1: "c27", a2: "c30", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens (selective)
      "b35": { id: "b35", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b36": { id: "b36", a1: "c2", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b37": { id: "b37", a1: "c4", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      "b38": { id: "b38", a1: "c5", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b39": { id: "b39", a1: "c7", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b40": { id: "b40", a1: "c8", a2: "h6", order: 1, stereo: "none", doubleSide: "auto" },
      "b41": { id: "b41", a1: "c10", a2: "h7", order: 1, stereo: "none", doubleSide: "auto" },
      "b42": { id: "b42", a1: "c11", a2: "h8", order: 1, stereo: "none", doubleSide: "auto" },
      "b43": { id: "b43", a1: "c13", a2: "h9", order: 1, stereo: "none", doubleSide: "auto" },
      "b44": { id: "b44", a1: "c14", a2: "h10", order: 1, stereo: "none", doubleSide: "auto" },
      "b45": { id: "b45", a1: "c16", a2: "h11", order: 1, stereo: "none", doubleSide: "auto" },
      "b46": { id: "b46", a1: "c17", a2: "h12", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Export all terpene templates
export const TERPENE_TEMPLATES = [
  limonene,
  caryophyllene,
  retinol,
  menthol,
  camphor,
  artemisinin,
  squalene,
];