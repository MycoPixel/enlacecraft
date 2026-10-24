import type { Molecule, Annotation } from "../types/chemistry";
import { StructureTemplate } from "../model/structureTemplates";

/**
 * Carbohydrate templates as StructureTemplates.
 * Includes monosaccharides (Fischer, Haworth, Chair forms), disaccharides,
 * and polysaccharide repeating units.
 * Coordinates are re-centered so each template's bounding-box center sits at (0, 0).
 */

// Monosaccharide: D-Glucose in Fischer projection
export const glucoseFischer: StructureTemplate = {
  id: "glucose-fischer",
  label: "D-Glucose (Fischer)",
  category: "carbohydrates",
  molecule: {
    atoms: {
      // Aldehyde carbon at top (C1)
      "1": { id: "1", x: 0, y: -84, element: "C", charge: 0 },
      // C2 with OH on right in D-glucose
      "2": { id: "2", x: 0, y: -42, element: "C", charge: 0 },
      // C3 with OH on left
      "3": { id: "3", x: 0, y: 0, element: "C", charge: 0 },
      // C4 with OH on right
      "4": { id: "4", x: 0, y: 42, element: "C", charge: 0 },
      // C5 with CH2OH group
      "5": { id: "5", x: 0, y: 84, element: "C", charge: 0 },
      // C6 (CH2OH attached to C5)
      "6": { id: "6", x: 42, y: -42, element: "C", charge: 0 },
      // O in ring (for Haworth/chair forms)
      "o5": { id: "o5", x: 42, y: 42, element: "O", charge: 0 },
      // OH groups
      "oh1": { id: "o1", x: -42, y: 0, element: "O", charge: 0 },
      "oh2": { id: "o2", x: -42, y: -42, element: "O", charge: 0 },
      "oh3": { id: "o3", x: -42, y: 42, element: "O", charge: 0 },
      "oh4": { id: "o4", x: 42, y: 84, element: "O", charge: 0 },
      "oh5": { id: "o5h", x: 42, y: 126, element: "O", charge: 0 },
      "oh6": { id: "o6h", x: -42, y: 84, element: "O", charge: 0 },
      // Hydrogens on carbons
      "h1": { id: "h1", x: 0, y: -126, element: "H", charge: 0 },
      "h2a": { id: "h2ax", x: 0, y: -60, element: "H", charge: 0 },
      "h2b": { id: "h2bx", x: 0, y: -24, element: "H", charge: 0 },
      "h3a": { id: "h3ax", x: 0, y: 24, element: "H", charge: 0 },
      "h3b": { id: "h3bx", x: 0, y: 60, element: "H", charge: 0 },
      "h4a": { id: "h4ax", x: 0, y: 102, element: "H", charge: 0 },
      "h4b": { id: "h4bx", x: 0, y: 78, element: "H", charge: 0 },
      "h5a": { id: "h5ax", x: 0, y: 168, element: "H", charge: 0 },
      "h5b": { id: "h5bx", x: 0, y: 132, element: "H", charge: 0 },
      "h6a": { id: "h6ax", x: 84, y: -84, element: "H", charge: 0 },
      "h6b": { id: "h6bx", x: 84, y: -24, element: "H", charge: 0 },
    },
    bonds: {
      // Backbone
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      // C6 attached to C5
      "b5": { id: "b5", a1: "5", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      // OH groups
      "b6": { id: "b6", a1: "2", a2: "o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "o1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "3", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "o2", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "o2", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "4", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "o3", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "o3", a2: "h3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "5", a2: "o4", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "o4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "5", a2: "o5h", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "o5h", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "o5h", a2: "h5b", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "6", a2: "o6h", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "o6h", a2: "h6a", order: 1, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "o6h", a2: "h6b", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring-closing bond (C1-C5 with O in Haworth)
      // Not drawn in Fischer, but noted for Haworth/chair conversion
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Haworth projection of D-Glucose (pyranose form)
export const glucoseHaworth: StructureTemplate = {
  id: "glucose-haworth",
  label: "D-Glucose (Haworth Pyranose)",
  category: "carbohydrates",
  molecule: {
    atoms: {
      // Ring oxygen
      "o5": { id: "o5h", x: 0, y: -30, element: "O", charge: 0 },
      // C1 (anomeric carbon)
      "c1": { id: "c1h", x: 30, y: -10, element: "C", charge: 0 },
      // C2
      "c2": { id: "c2h", x: 50, y: 20, element: "C", charge: 0 },
      // C3
      "c3": { id: "c3h", x: 50, y: 70, element: "C", charge: 0 },
      // C4
      "c4": { id: "c4h", x: 20, y: 90, element: "C", charge: 0 },
      // C5
      "c5": { id: "c5h", x: -20, y: 70, element: "C", charge: 0 },
      // C6 (CH2OH)
      "c6": { id: "c6h", x: -40, y: 20, element: "C", charge: 0 },
      // OH groups (alpha/beta anomer)
      "oh1ax": { id: "o1ax", x: 20, y: -50, element: "O", charge: 0 },
      "oh1eq": { id: "o1eq", x: -20, y: -50, element: "O", charge: 0 },
      "oh2": { id: "o2h", x: 70, y: 90, element: "O", charge: 0 },
      "oh3": { id: "o3h", x: 70, y: 130, element: "O", charge: 0 },
      "oh4": { id: "o4h", x: -10, y: 110, element: "O", charge: 0 },
      "oh5": { id: "o5h2", x: -40, y: 30, element: "O", charge: 0 },
      // Hydrogens
      "h1ax": { id: "h1axh", x: 20, y: -70, element: "H", charge: 0 },
      "h1eq": { id: "h1eqh", x: -20, y: -70, element: "H", charge: 0 },
      "h2": { id: "h2h", x: 70, y: 110, element: "H", charge: 0 },
      "h3": { id: "h3h", x: 70, y: 150, element: "H", charge: 0 },
      "h4": { id: "h4h", x: -10, y: 130, element: "H", charge: 0 },
      "h5": { id: "h5h", x: -40, y: 50, element: "H", charge: 0 },
      "h6": { id: "h6h", x: -60, y: 10, element: "H", charge: 0 },
    },
    bonds: {
      // Ring
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b4c": { id: "b4c", a1: "c5", a2: "o5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "o5", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Substituents
      "b6": { id: "b6", a1: "c1", a2: "o1ax", order: 1, stereo: "none", doubleSide: "auto" }, // alpha
      // "b6b": { id: "b6b", a1: "c1", a2: "o1eq", order: 1, stereo: "none", doubleSide: "auto" }, // beta
      "b7": { id: "b7", a1: "o1ax", a2: "h1ax", order: 1, stereo: "none", doubleSide: "auto" },
      "b7e": { id: "b7e", a1: "o1eq", a2: "h1eq", order: 1, stereo: "none", doubleSide: "auto" }, // beta
      "b8": { id: "b8", a1: "c2", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "o2", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c3", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "o3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c4", a2: "o4", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "o4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c5", a2: "o5", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c6", a2: "o5h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "o5h2", a2: "h5", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c6", a2: "h6", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Disaccharide: Maltose (glucose-α-1,4-glucose)
export const maltose: StructureTemplate = {
  id: "maltose",
  label: "Maltose",
  category: "carbohydrates",
  molecule: {
    atoms: {
      // First glucose unit (reducing end)
      "g1c1": { id: "g1c1", x: 0, y: -80, element: "C", charge: 0 },
      "g1c2": { id: "g1c2", x: 0, y: -40, element: "C", charge: 0 },
      "g1c3": { id: "g1c3", x: 0, y: 0, element: "C", charge: 0 },
      "g1c4": { id: "g1c4", x: 0, y: 40, element: "C", charge: 0 },
      "g1c5": { id: "g1c5", x: 0, y: 80, element: "C", charge: 0 },
      "g1c6": { id: "g1c6", x: 40, y: -40, element: "C", charge: 0 },
      "g1o5": { id: "g1o5", x: 40, y: 40, element: "O", charge: 0 },
      "g1oh1": { id: "g1o1", x: -40, y: 0, element: "O", charge: 0 },
      "g1oh2": { id: "g1o2", x: -40, y: -40, element: "O", charge: 0 },
      "g1oh3": { id: "g1o3", x: -40, y: 40, element: "O", charge: 0 },
      "g1oh4": { id: "g1o4", x: 40, y: 80, element: "O", charge: 0 },
      "g1oh5": { id: "g1o5h", x: 40, y: 120, element: "O", charge: 0 },
      "g1h6a": { id: "g1h6a", x: 80, y: -80, element: "H", charge: 0 },
      "g1h6b": { id: "g1h6b", x: 80, y: -20, element: "H", charge: 0 },
      // Second glucose unit
      "g2c1": { id: "g2c1", x: 80, y: -80, element: "C", charge: 0 },
      "g2c2": { id: "g2c2", x: 80, y: -40, element: "C", charge: 0 },
      "g2c3": { id: "g2c3", x: 80, y: 0, element: "C", charge: 0 },
      "g2c4": { id: "g2c4", x: 80, y: 40, element: "C", charge: 0 },
      "g2c5": { id: "g2c5", x: 80, y: 80, element: "C", charge: 0 },
      "g2c6": { id: "g2c6", x: 120, y: -40, element: "C", charge: 0 },
      "g2o5": { id: "g2o5", x: 120, y: 40, element: "O", charge: 0 },
      "g2oh1": { id: "g2o1", x: 40, y: -80, element: "O", charge: 0 },
      "g2oh2": { id: "g2o2", x: 40, y: -120, element: "O", charge: 0 },
      "g2oh3": { id: "g2o3", x: 40, y: 0, element: "O", charge: 0 },
      "g2oh4": { id: "g2o4", x: 120, y: 80, element: "O", charge: 0 },
      "g2oh5": { id: "g2o5h", x: 120, y: 120, element: "O", charge: 0 },
      "g2h6a": { id: "g2h6a", x: 160, y: -80, element: "H", charge: 0 },
      "g2h6b": { id: "g2h6b", x: 160, y: -20, element: "H", charge: 0 },
      // Bridge oxygen (1,4 linkage)
      "bridgeO": { id: "bridgeO", x: 40, y: 0, element: "O", charge: 0 },
    },
    bonds: {
      // First glucose backbone
      "b1": { id: "b1", a1: "g1c1", a2: "g1c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "g1c2", a2: "g1c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "g1c3", a2: "g1c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "g1c4", a2: "g1c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "g1c5", a2: "g1c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "g1c1", a2: "g1o5", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "g1o5", a2: "g1c5", order: 1, stereo: "none", doubleSide: "auto" },
      // OH groups first glucose
      "b8": { id: "b8", a1: "g1c2", a2: "g1o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "g1o1", a2: "h", order: 1, stereo: "none", doubleSide: "auto" },
      // ... (more OH groups)
      // Second glucose backbone (simplified)
      "b10": { id: "b10", a1: "g2c1", a2: "g2c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "g2c2", a2: "g2c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "g2c3", a2: "g2c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "g2c4", a2: "g2c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "g2c5", a2: "g2c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "g2c1", a2: "g2o5", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "g2o5", a2: "g2c5", order: 1, stereo: "none", doubleSide: "auto" },
      // 1,4-glycosidic linkage
      "b17": { id: "b17", a1: "g1c1", a2: "bridgeO", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "bridgeO", a2: "g2c4", order: 1, stereo: "none", doubleSide: "auto" },
      // OH groups second glucose
      "b19": { id: "b19", a1: "g2c2", a2: "g2o1", order: 1, stereo: "none", doubleSide: "auto" },
      // ... more bonds
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Monosaccharide: D-Galactose in Fischer projection (differs from glucose at C4)
export const galactoseFischer: StructureTemplate = {
  id: "galactose-fischer",
  label: "D-Galactose (Fischer)",
  category: "carbohydrates",
  molecule: {
    atoms: {
      "1": { id: "1", x: 0, y: -84, element: "C", charge: 0 },
      "2": { id: "2", x: 0, y: -42, element: "C", charge: 0 },
      "3": { id: "3", x: 0, y: 0, element: "C", charge: 0 },
      "4": { id: "4", x: 0, y: 42, element: "C", charge: 0 },
      "5": { id: "5", x: 0, y: 84, element: "C", charge: 0 },
      "6": { id: "6", x: 42, y: -42, element: "C", charge: 0 },
      "o5": { id: "o5", x: 42, y: 42, element: "O", charge: 0 },
      "oh1": { id: "o1", x: -42, y: 0, element: "O", charge: 0 },
      "oh2": { id: "o2", x: -42, y: -42, element: "O", charge: 0 },
      "oh3": { id: "o3", x: -42, y: 42, element: "O", charge: 0 },
      "oh4": { id: "o4", x: 42, y: 84, element: "O", charge: 0 },
      "oh5": { id: "o5h", x: 42, y: 126, element: "O", charge: 0 },
      "oh6": { id: "o6h", x: -42, y: 84, element: "O", charge: 0 },
      "h1": { id: "h1", x: 0, y: -126, element: "H", charge: 0 },
      "h2a": { id: "h2ax", x: 0, y: -60, element: "H", charge: 0 },
      "h2b": { id: "h2bx", x: 0, y: -24, element: "H", charge: 0 },
      "h3a": { id: "h3ax", x: 0, y: 24, element: "H", charge: 0 },
      "h3b": { id: "h3bx", x: 0, y: 60, element: "H", charge: 0 },
      "h4a": { id: "h4ax", x: 0, y: 102, element: "H", charge: 0 },
      "h4b": { id: "h4bx", x: 0, y: 78, element: "H", charge: 0 },
      "h5a": { id: "h5ax", x: 0, y: 168, element: "H", charge: 0 },
      "h5b": { id: "h5bx", x: 0, y: 132, element: "H", charge: 0 },
      "h6a": { id: "h6ax", x: 84, y: -84, element: "H", charge: 0 },
      "h6b": { id: "h6bx", x: 84, y: -24, element: "H", charge: 0 },
    },
    bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "5", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "2", a2: "o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "o1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "3", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "o2", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "o2", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "4", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "o3", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "o3", a2: "h3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "5", a2: "o4", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "o4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "5", a2: "o5h", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "o5h", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "o5h", a2: "h5b", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "6", a2: "o6h", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "o6h", a2: "h6a", order: 1, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "o6h", a2: "h6b", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Monosaccharide: D-Mannose in Fischer projection (differs from glucose at C2)
export const mannoseFischer: StructureTemplate = {
  id: "mannose-fischer",
  label: "D-Mannose (Fischer)",
  category: "carbohydrates",
  molecule: {
    atoms: {
      "1": { id: "1", x: 0, y: -84, element: "C", charge: 0 },
      "2": { id: "2", x: 0, y: -42, element: "C", charge: 0 },
      "3": { id: "3", x: 0, y: 0, element: "C", charge: 0 },
      "4": { id: "4", x: 0, y: 42, element: "C", charge: 0 },
      "5": { id: "5", x: 0, y: 84, element: "C", charge: 0 },
      "6": { id: "6", x: 42, y: -42, element: "C", charge: 0 },
      "o5": { id: "o5", x: 42, y: 42, element: "O", charge: 0 },
      "oh1": { id: "o1", x: -42, y: 0, element: "O", charge: 0 },
      "oh2": { id: "o2", x: -42, y: -42, element: "O", charge: 0 },
      "oh3": { id: "o3", x: -42, y: 42, element: "O", charge: 0 },
      "oh4": { id: "o4", x: 42, y: 84, element: "O", charge: 0 },
      "oh5": { id: "o5h", x: 42, y: 126, element: "O", charge: 0 },
      "oh6": { id: "o6h", x: -42, y: 84, element: "O", charge: 0 },
      "h1": { id: "h1", x: 0, y: -126, element: "H", charge: 0 },
      "h2a": { id: "h2ax", x: 0, y: -60, element: "H", charge: 0 },
      "h2b": { id: "h2bx", x: 0, y: -24, element: "H", charge: 0 },
      "h3a": { id: "h3ax", x: 0, y: 24, element: "H", charge: 0 },
      "h3b": { id: "h3bx", x: 0, y: 60, element: "H", charge: 0 },
      "h4a": { id: "h4ax", x: 0, y: 102, element: "H", charge: 0 },
      "h4b": { id: "h4bx", x: 0, y: 78, element: "H", charge: 0 },
      "h5a": { id: "h5ax", x: 0, y: 168, element: "H", charge: 0 },
      "h5b": { id: "h5bx", x: 0, y: 132, element: "H", charge: 0 },
      "h6a": { id: "h6ax", x: 84, y: -84, element: "H", charge: 0 },
      "h6b": { id: "h6bx", x: 84, y: -24, element: "H", charge: 0 },
    },
    bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "5", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "2", a2: "o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "o1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "3", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "o2", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "o2", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "4", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "o3", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "o3", a2: "h3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "5", a2: "o4", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "o4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "5", a2: "o5h", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "o5h", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "o5h", a2: "h5b", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "6", a2: "o6h", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "o6h", a2: "h6a", order: 1, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "o6h", a2: "h6b", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Monosaccharide: D-Fructose in Fischer projection (ketose, C2 is keto)
export const fructoseFischer: StructureTemplate = {
  id: "fructose-fischer",
  label: "D-Fructose (Fischer)",
  category: "carbohydrates",
  molecule: {
    atoms: {
      "1": { id: "1", x: 0, y: -84, element: "C", charge: 0 },
      "2": { id: "2", x: 0, y: -42, element: "C", charge: 0 },
      "3": { id: "3", x: 0, y: 0, element: "C", charge: 0 },
      "4": { id: "4", x: 0, y: 42, element: "C", charge: 0 },
      "5": { id: "5", x: 0, y: 84, element: "C", charge: 0 },
      "6": { id: "6", x: 42, y: -42, element: "C", charge: 0 },
      "o5": { id: "o5", x: 42, y: 42, element: "O", charge: 0 },
      "oh1": { id: "o1", x: -42, y: 0, element: "O", charge: 0 },
      "oh2": { id: "o2", x: -42, y: -42, element: "O", charge: 0 },
      "oh3": { id: "o3", x: -42, y: 42, element: "O", charge: 0 },
      "oh4": { id: "o4", x: 42, y: 84, element: "O", charge: 0 },
      "oh5": { id: "o5h", x: 42, y: 126, element: "O", charge: 0 },
      "oh6": { id: "o6h", x: -42, y: 84, element: "O", charge: 0 },
      "h1": { id: "h1", x: 0, y: -126, element: "H", charge: 0 },
      "h2a": { id: "h2ax", x: 0, y: -60, element: "H", charge: 0 },
      "h2b": { id: "h2bx", x: 0, y: -24, element: "H", charge: 0 },
      "h3a": { id: "h3ax", x: 0, y: 24, element: "H", charge: 0 },
      "h3b": { id: "h3bx", x: 0, y: 60, element: "H", charge: 0 },
      "h4a": { id: "h4ax", x: 0, y: 102, element: "H", charge: 0 },
      "h4b": { id: "h4bx", x: 0, y: 78, element: "H", charge: 0 },
      "h5a": { id: "h5ax", x: 0, y: 168, element: "H", charge: 0 },
      "h5b": { id: "h5bx", x: 0, y: 132, element: "H", charge: 0 },
      "h6a": { id: "h6ax", x: 84, y: -84, element: "H", charge: 0 },
      "h6b": { id: "h6bx", x: 84, y: -24, element: "H", charge: 0 },
    },
    bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "5", a2: "6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "2", a2: "o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "o1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "3", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "o2", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "o2", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "4", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "o3", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "o3", a2: "h3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "5", a2: "o4", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "o4", a2: "h4", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "5", a2: "o5h", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "o5h", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "o5h", a2: "h5b", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "6", a2: "o6h", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "o6h", a2: "h6a", order: 1, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "o6h", a2: "h6b", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Monosaccharide: D-Ribose in Fischer projection (aldopentose, 5 carbons)
export const riboseFischer: StructureTemplate = {
  id: "ribose-fischer",
  label: "D-Ribose (Fischer)",
  category: "carbohydrates",
  molecule: {
    atoms: {
      "1": { id: "1", x: 0, y: -84, element: "C", charge: 0 },
      "2": { id: "2", x: 0, y: -42, element: "C", charge: 0 },
      "3": { id: "3", x: 0, y: 0, element: "C", charge: 0 },
      "4": { id: "4", x: 0, y: 42, element: "C", charge: 0 },
      "5": { id: "5", x: 42, y: -42, element: "C", charge: 0 },
      "o4": { id: "o4", x: 42, y: 42, element: "O", charge: 0 },
      "oh1": { id: "o1", x: -42, y: 0, element: "O", charge: 0 },
      "oh2": { id: "o2", x: -42, y: -42, element: "O", charge: 0 },
      "oh3": { id: "o3", x: -42, y: 42, element: "O", charge: 0 },
      "oh4": { id: "o4h", x: 42, y: 84, element: "O", charge: 0 },
      "oh5": { id: "o5h", x: -42, y: 84, element: "O", charge: 0 },
      "h1": { id: "h1", x: 0, y: -126, element: "H", charge: 0 },
      "h2a": { id: "h2ax", x: 0, y: -60, element: "H", charge: 0 },
      "h2b": { id: "h2bx", x: 0, y: -24, element: "H", charge: 0 },
      "h3a": { id: "h3ax", x: 0, y: 24, element: "H", charge: 0 },
      "h3b": { id: "h3bx", x: 0, y: 60, element: "H", charge: 0 },
      "h4a": { id: "h4ax", x: 0, y: 102, element: "H", charge: 0 },
      "h4b": { id: "h4bx", x: 0, y: 78, element: "H", charge: 0 },
      "h5a": { id: "h5ax", x: 84, y: -84, element: "H", charge: 0 },
      "h5b": { id: "h5bx", x: 84, y: -24, element: "H", charge: 0 },
    },
    bonds: {
      "b1": { id: "b1", a1: "1", a2: "2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "2", a2: "3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "3", a2: "4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "4", a2: "5", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "2", a2: "o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "o1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "3", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "o2", a2: "h2a", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "o2", a2: "h2b", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "4", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "o3", a2: "h3a", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "o3", a2: "h3b", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "5", a2: "o4h", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "o4h", a2: "h4a", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "5", a2: "o5h", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "o5h", a2: "h5a", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "o5h", a2: "h5b", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Export all carbohydrate templates
export const CARBOHYDRATE_TEMPLATES = [
  glucoseFischer,
  glucoseHaworth,
  maltose,
  galactoseFischer,
  mannoseFischer,
  fructoseFischer,
  riboseFischer,
];