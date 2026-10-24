import type { Molecule, Annotation } from "../types/chemistry";
import { StructureTemplate } from "../model/structureTemplates";

/**
 * Steroid templates as StructureTemplates.
 * Includes the gonane (cyclopentanoperhydrophenanthrene) core and key steroids:
 * cholesterol, testosterone, estradiol, progesterone, cortisol, bile acids.
 * Coordinates are re-centered so each template's bounding-box center sits at (0, 0).
 */

// Gonane core (the basic steroid nucleus: three 6-membered rings A/B/C and one 5-membered ring D)
export const gonane: StructureTemplate = {
  id: "gonane",
  label: "Gonane (Steroid Nucleus)",
  category: "steroids",
  molecule: {
    atoms: {
      // Ring A (6-membered)
      "a1": { id: "a1", x: -50, y: -30, element: "C", charge: 0 },
      "a2": { id: "a2", x: -10, y: -30, element: "C", charge: 0 },
      "a3": { id: "a3", x: 30, y: -20, element: "C", charge: 0 },
      "a4": { id: "a4", x: 30, y: 30, element: "C", charge: 0 },
      "a5": { id: "a5", x: -10, y: 30, element: "C", charge: 0 },
      "a6": { id: "a6", x: -50, y: 20, element: "C", charge: 0 },
      // Ring B (6-membered)
      "b1": { id: "b1", x: 30, y: 30, element: "C", charge: 0 },
      "b2": { id: "b2", x: 70, y: 20, element: "C", charge: 0 },
      "b3": { id: "b3", x: 70, y: -20, element: "C", charge: 0 },
      "b4": { id: "b4", x: 30, y: -30, element: "C", charge: 0 },
      // Ring C (6-membered)
      "c1": { id: "c1", x: 30, y: -30, element: "C", charge: 0 },
      "c2": { id: "c2", x: 70, y: -40, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: -70, element: "C", charge: 0 },
      "c4": { id: "c4", x: -10, y: -70, element: "C", charge: 0 },
      // Ring D (5-membered)
      "d1": { id: "d1", x: -30, y: -50, element: "C", charge: 0 },
      "d2": { id: "d2", x: -30, y: -10, element: "C", charge: 0 },
      "d3": { id: "d3", x: 10, y: -10, element: "C", charge: 0 },
      "d4": { id: "d4", x: 10, y: 10, element: "C", charge: 0 },
      "d5": { id: "d5", x: -30, y: 30, element: "C", charge: 0 },
      // Side chain at C17 (variable, simplified as methyl here)
      "s1": { id: "s1", x: -10, y: -70, element: "C", charge: 0 },
      "s2": { id: "s2", x: -10, y: -90, element: "C", charge: 0 },
      // Methyl groups at typical steroid positions
      "m1": { id: "m1", x: -70, y: -20, element: "C", charge: 0 },
      "m2": { id: "m2", x: -70, y: 20, element: "C", charge: 0 },
      "m3": { id: "m3", x: 80, y: 0, element: "C", charge: 0 },
      "m4": { id: "m4", x: 80, y: -40, element: "C", charge: 0 },
      // Key functional groups (examples)
      "o1": { id: "o1", x: -20, y: 50, element: "O", charge: 0 },
      "o2": { id: "o2", x: 60, y: -50, element: "O", charge: 0 },
      "o3": { id: "o3", x: -40, y: -60, element: "O", charge: 0 },
      // Hydrogens (selective)
      "h1": { id: "h1", x: -60, y: -30, element: "H", charge: 0 },
      "h2": { id: "h2", x: 80, y: -30, element: "H", charge: 0 },
    },
    bonds: {
      // Ring A
      "b1": { id: "b1", a1: "a1", a2: "a2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "a2", a2: "a3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "a3", a2: "a4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "a4", a2: "a5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "a5", a2: "a6", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "a6", a2: "a1", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring B
      "b7": { id: "b7", a1: "a3", a2: "b1", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "b1", a2: "b2", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "b2", a2: "b3", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "b3", a2: "b4", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring C
      "b11": { id: "b11", a1: "b4", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring D
      "b15": { id: "b15", a1: "c4", a2: "d1", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "d1", a2: "d2", order: 1, stereo: "none", doubleSide: "auto" },
      "b17": { id: "b17", a1: "d2", a2: "d3", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "d3", a2: "d4", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "d4", a2: "d5", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "d5", a2: "a1", order: 1, stereo: "none", doubleSide: "auto" },
      // Side chain
      "b21": { id: "b21", a1: "d5", a2: "s1", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "s1", a2: "s2", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b23": { id: "b23", a1: "a1", a2: "m1", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "a5", a2: "m2", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "b3", a2: "m3", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c2", a2: "m4", order: 1, stereo: "none", doubleSide: "auto" },
      // Key oxygen functions
      "b27": { id: "b27", a1: "a3", a2: "o1", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "b2", a2: "o2", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "d2", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Cholesterol (typical steroid with hydrocarbon side chain at C17 and -OH at C3)
export const cholesterol: StructureTemplate = {
  id: "cholesterol",
  label: "Cholesterol",
  category: "steroids",
  molecule: {
    atoms: {
      // Core steroid skeleton (simplified - 17 carbons in nucleus)
      // Ring A
      "c3": { id: "c3", x: -30, y: -20, element: "C", charge: 0 }, // C3 with -OH
      "c4": { id: "c4", x: 10, y: -20, element: "C", charge: 0 },
      "c5": { id: "c5", x: 50, y: -10, element: "C", charge: 0 },
      "c6": { id: "c6", x: 50, y: 10, element: "C", charge: 0 },
      "c7": { id: "c7", x: -30, y: 20, element: "C", charge: 0 },
      "c8": { id: "c8", x: 10, y: 20, element: "C", charge: 0 },
      // Ring B
      "c9": { id: "c9", x: 50, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: 90, y: 20, element: "C", charge: 0 },
      "c11": { id: "c11", x: 90, y: -10, element: "C", charge: 0 },
      "c12": { id: "c12", x: 50, y: -20, element: "C", charge: 0 },
      // Ring C
      "c13": { id: "c13", x: 50, y: -30, element: "C", charge: 0 },
      "c14": { id: "c14", x: 90, y: -40, element: "C", charge: 0 },
      "c15": { id: "c15", x: 50, y: -50, element: "C", charge: 0 },
      "c16": { id: "c16", x: 10, y: -50, element: "C", charge: 0 },
      // Ring D
      "c17": { id: "c17", x: -30, y: -50, element: "C", charge: 0 }, // C17 with side chain
      "c18": { id: "c18", x: -30, y: -10, element: "C", charge: 0 },
      "c19": { id: "c19", x: -10, y: -10, element: "C", charge: 0 },
      "c20": { id: "c20", x: 10, y: -10, element: "C", charge: 0 },
      // Methyl groups at C10 and C13
      "c21": { id: "c21", x: -60, y: -10, element: "C", charge: 0 }, // C19
      "c22": { id: "c22", x: 90, y: 10, element: "C", charge: 0 }, // C18
      // Side chain at C17 (8 carbons)
      "s1": { id: "s1", x: -30, y: -70, element: "C", charge: 0 },
      "s2": { id: "s2", x: -30, y: -90, element: "C", charge: 0 },
      "s3": { id: "s3", x: -10, y: -90, element: "C", charge: 0 },
      "s4": { id: "s4", x: 10, y: -90, element: "C", charge: 0 },
      "s5": { id: "s5", x: 30, y: -70, element: "C", charge: 0 },
      "s6": { id: "s6", x: 50, y: -50, element: "C", charge: 0 },
      "s7": { id: "s7", x: 70, y: -30, element: "C", charge: 0 },
      "s8": { id: "s8", x: 90, y: -10, element: "C", charge: 0 },
      // -OH at C3
      "o3": { id: "o3h", x: -30, y: -50, element: "O", charge: -1 },
      "h3o": { id: "h3oh", x: -30, y: -70, element: "H", charge: 0 },
      // Hydrogens
      "h9": { id: "h9", x: -40, y: -20, element: "H", charge: 0 },
      "h10": { id: "h10", x: 60, y: -10, element: "H", charge: 0 },
      "h11": { id: "h11", x: 100, y: 0, element: "H", charge: 0 },
      "h12": { id: "h12", x: 100, y: -20, element: "H", charge: 0 },
      "h13": { id: "h13", x: 100, y: -30, element: "H", charge: 0 },
      "h14": { id: "h13", x: -40, y: -50, element: "H", charge: 0 },
      "h15": { id: "h15", x: -40, y: -70, element: "H", charge: 0 },
      "h16": { id: "h16", x: -20, y: -90, element: "H", charge: 0 },
      "h17": { id: "h17", x: 0, y: -90, element: "H", charge: 0 },
      "h18": { id: "h18", x: 20, y: -70, element: "H", charge: 0 },
      "h19": { id: "h19", x: 40, y: -50, element: "H", charge: 0 },
      "h20": { id: "h20", x: 60, y: -30, element: "H", charge: 0 },
    },
    bonds: {
      // Ring A (C3-C4-C5-C6-C7-C8-C9-C10, but simplified)
      "b1": { id: "b1", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b7": { id: "b7", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c10", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" }, // ring closure
      // Ring B
      "b9": { id: "b9", a1: "c5", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c10", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b12": { id: "b12", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring C
      "b13": { id: "b13", a1: "c12", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c14", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring D
      "b17": { id: "b17", a1: "c16", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c17", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c18", a2: "c19", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c19", a2: "c20", order: 1, stereo: "none", doubleSide: "auto" },
      "b21": { id: "b21", a1: "c20", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      // Side chain
      "b22": { id: "b22", a1: "c17", a2: "s1", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "s1", a2: "s2", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "s2", a2: "s3", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "s3", a2: "s4", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "s4", a2: "s5", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "s5", a2: "s6", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "s6", a2: "s7", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "s7", a2: "s8", order: 1, stereo: "none", doubleSide: "auto" },
      // -OH at C3
      "b30": { id: "b30", a1: "c3", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "o3", a2: "h3o", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b32": { id: "b32", a1: "c10", a2: "c21", order: 1, stereo: "none", doubleSide: "auto" },
      "b33": { id: "b33", a1: "c8", a2: "c22", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens on key positions
      "b34": { id: "b34", a1: "c3", a2: "h9", order: 1, stereo: "none", doubleSide: "auto" },
      "b35": { id: "b35", a1: "c5", a2: "h10", order: 1, stereo: "none", doubleSide: "auto" },
      "b36": { id: "b36", a1: "c10", a2: "h11", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Testosterone (androst-4-en-17β-ol-3-one) - 3-keto, 17-OH, Δ4 double bond
export const testosterone: StructureTemplate = {
  id: "testosterone",
  label: "Testosterone",
  category: "steroids",
  molecule: {
    atoms: {
      // Ring A (C1-C2-C3(=O)-C4=C5-C10)
      "c1": { id: "c1", x: -50, y: -30, element: "C", charge: 0 },
      "c2": { id: "c2", x: -10, y: -30, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: -20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 30, element: "C", charge: 0 },
      "c5": { id: "c5", x: -10, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: -50, y: 20, element: "C", charge: 0 },
      // Ring B (C5-C6-C7-C8-C9-C10)
      "c6": { id: "c6", x: 30, y: 30, element: "C", charge: 0 },
      "c7": { id: "c7", x: 70, y: 20, element: "C", charge: 0 },
      "c8": { id: "c8", x: 70, y: -20, element: "C", charge: 0 },
      "c9": { id: "c9", x: 30, y: -30, element: "C", charge: 0 },
      // Ring C (C8-C9-C11-C12-C13-C14)
      "c11": { id: "c11", x: 70, y: -40, element: "C", charge: 0 },
      "c12": { id: "c12", x: 30, y: -70, element: "C", charge: 0 },
      "c13": { id: "c13", x: -10, y: -70, element: "C", charge: 0 },
      "c14": { id: "c14", x: -30, y: -50, element: "C", charge: 0 },
      // Ring D (C13-C14-C15-C16-C17)
      "c15": { id: "c15", x: -30, y: -10, element: "C", charge: 0 },
      "c16": { id: "c16", x: 10, y: -10, element: "C", charge: 0 },
      "c17": { id: "c17", x: 10, y: 10, element: "C", charge: 0 },
      // Methyl groups
      "c19": { id: "c19", x: -70, y: -20, element: "C", charge: 0 }, // C19 at C10
      "c18": { id: "c18", x: -70, y: 20, element: "C", charge: 0 }, // C18 at C13
      // 3-keto oxygen
      "o3": { id: "o3", x: -20, y: 50, element: "O", charge: 0 },
      // 17-hydroxyl
      "o17": { id: "o17", x: 80, y: 0, element: "O", charge: 0 },
      "h17": { id: "h17", x: 90, y: 10, element: "H", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: -60, y: -30, element: "H", charge: 0 },
      "h2": { id: "h2", x: 80, y: -30, element: "H", charge: 0 },
    },
    bonds: {
      // Ring A: C1-C2-C3-C4=C5-C10-C1
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 2, stereo: "none", doubleSide: "auto" }, // Δ4
      "b5": { id: "b5", a1: "c5", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c10", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring B: C5-C6-C7-C8-C9-C10
      "b7": { id: "b7", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring C: C8-C9-C11-C12-C13-C14
      "b12": { id: "b12", a1: "c8", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c12", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c14", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring D: C13-C14-C15-C16-C17-C13
      "b17": { id: "b17", a1: "c13", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c16", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c17", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b21": { id: "b21", a1: "c10", a2: "c19", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c13", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      // 3-keto
      "b23": { id: "b23", a1: "c3", a2: "o3", order: 2, stereo: "none", doubleSide: "auto" },
      // 17-hydroxyl
      "b24": { id: "b24", a1: "c17", a2: "o17", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "o17", a2: "h17", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b26": { id: "b26", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "c8", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Estradiol (estra-1,3,5(10)-triene-3,17β-diol) - aromatic A ring, 3,17-diol, no C19 methyl
export const estradiol: StructureTemplate = {
  id: "estradiol",
  label: "Estradiol",
  category: "steroids",
  molecule: {
    atoms: {
      // Aromatic Ring A (C1-C2-C3(OH)-C4-C5-C10, all aromatic)
      "c1": { id: "c1", x: -50, y: -30, element: "C", charge: 0 },
      "c2": { id: "c2", x: -10, y: -30, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: -20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 30, element: "C", charge: 0 },
      "c5": { id: "c5", x: -10, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: -50, y: 20, element: "C", charge: 0 },
      // Ring B (C5-C6-C7-C8-C9-C10)
      "c6": { id: "c6", x: 30, y: 30, element: "C", charge: 0 },
      "c7": { id: "c7", x: 70, y: 20, element: "C", charge: 0 },
      "c8": { id: "c8", x: 70, y: -20, element: "C", charge: 0 },
      "c9": { id: "c9", x: 30, y: -30, element: "C", charge: 0 },
      // Ring C (C8-C9-C11-C12-C13-C14)
      "c11": { id: "c11", x: 70, y: -40, element: "C", charge: 0 },
      "c12": { id: "c12", x: 30, y: -70, element: "C", charge: 0 },
      "c13": { id: "c13", x: -10, y: -70, element: "C", charge: 0 },
      "c14": { id: "c14", x: -30, y: -50, element: "C", charge: 0 },
      // Ring D (C13-C14-C15-C16-C17)
      "c15": { id: "c15", x: -30, y: -10, element: "C", charge: 0 },
      "c16": { id: "c16", x: 10, y: -10, element: "C", charge: 0 },
      "c17": { id: "c17", x: 10, y: 10, element: "C", charge: 0 },
      // C18 methyl at C13 (no C19 methyl in estrane)
      "c18": { id: "c18", x: -70, y: 20, element: "C", charge: 0 },
      // 3-hydroxyl (phenolic)
      "o3": { id: "o3", x: -20, y: 50, element: "O", charge: 0 },
      "h3": { id: "h3o", x: -20, y: 70, element: "H", charge: 0 },
      // 17-hydroxyl
      "o17": { id: "o17", x: 80, y: 0, element: "O", charge: 0 },
      "h17": { id: "h17o", x: 90, y: 10, element: "H", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: -60, y: -30, element: "H", charge: 0 },
      "h2": { id: "h2", x: 80, y: -30, element: "H", charge: 0 },
    },
    bonds: {
      // Ring A: aromatic (all bonds treated as aromatic/delocalized)
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 2, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 2, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c10", order: 2, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c10", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring B: C5-C6-C7-C8-C9-C10
      "b7": { id: "b7", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring C: C8-C9-C11-C12-C13-C14
      "b12": { id: "b12", a1: "c8", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c12", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c14", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring D: C13-C14-C15-C16-C17-C13
      "b17": { id: "b17", a1: "c13", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c16", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c17", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      // C18 methyl
      "b21": { id: "b21", a1: "c13", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      // 3-hydroxyl (phenolic)
      "b22": { id: "b22", a1: "c3", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b23": { id: "b23", a1: "o3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      // 17-hydroxyl
      "b24": { id: "b24", a1: "c17", a2: "o17", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "o17", a2: "h17", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b26": { id: "b26", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "c8", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Progesterone (preg-4-ene-3,20-dione) - 3-keto, 20-keto, Δ4, acetyl side chain at C17
export const progesterone: StructureTemplate = {
  id: "progesterone",
  label: "Progesterone",
  category: "steroids",
  molecule: {
    atoms: {
      // Ring A
      "c1": { id: "c1", x: -50, y: -30, element: "C", charge: 0 },
      "c2": { id: "c2", x: -10, y: -30, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: -20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 30, element: "C", charge: 0 },
      "c5": { id: "c5", x: -10, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: -50, y: 20, element: "C", charge: 0 },
      // Ring B
      "c6": { id: "c6", x: 30, y: 30, element: "C", charge: 0 },
      "c7": { id: "c7", x: 70, y: 20, element: "C", charge: 0 },
      "c8": { id: "c8", x: 70, y: -20, element: "C", charge: 0 },
      "c9": { id: "c9", x: 30, y: -30, element: "C", charge: 0 },
      // Ring C
      "c11": { id: "c11", x: 70, y: -40, element: "C", charge: 0 },
      "c12": { id: "c12", x: 30, y: -70, element: "C", charge: 0 },
      "c13": { id: "c13", x: -10, y: -70, element: "C", charge: 0 },
      "c14": { id: "c14", x: -30, y: -50, element: "C", charge: 0 },
      // Ring D
      "c15": { id: "c15", x: -30, y: -10, element: "C", charge: 0 },
      "c16": { id: "c16", x: 10, y: -10, element: "C", charge: 0 },
      "c17": { id: "c17", x: 10, y: 10, element: "C", charge: 0 },
      // Methyl groups
      "c19": { id: "c19", x: -70, y: -20, element: "C", charge: 0 },
      "c18": { id: "c18", x: -70, y: 20, element: "C", charge: 0 },
      // 3-keto
      "o3": { id: "o3", x: -20, y: 50, element: "O", charge: 0 },
      // 20-keto side chain at C17: C17-C20(=O)-C21
      "c20": { id: "c20", x: 50, y: 10, element: "C", charge: 0 },
      "c21": { id: "c21", x: 80, y: 10, element: "C", charge: 0 },
      "o20": { id: "o20", x: 50, y: 40, element: "O", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: -60, y: -30, element: "H", charge: 0 },
      "h2": { id: "h2", x: 80, y: -30, element: "H", charge: 0 },
      "h21a": { id: "h21a", x: 80, y: -10, element: "H", charge: 0 },
      "h21b": { id: "h21b", x: 80, y: 30, element: "H", charge: 0 },
      "h21c": { id: "h21c", x: 95, y: 5, element: "H", charge: 0 },
    },
    bonds: {
      // Ring A: C1-C2-C3-C4=C5-C10-C1
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 2, stereo: "none", doubleSide: "auto" }, // Δ4
      "b5": { id: "b5", a1: "c5", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c10", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring B: C5-C6-C7-C8-C9-C10
      "b7": { id: "b7", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring C: C8-C9-C11-C12-C13-C14
      "b12": { id: "b12", a1: "c8", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c12", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c14", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring D: C13-C14-C15-C16-C17-C13
      "b17": { id: "b17", a1: "c13", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c16", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c17", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b21": { id: "b21", a1: "c10", a2: "c19", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c13", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      // 3-keto
      "b23": { id: "b23", a1: "c3", a2: "o3", order: 2, stereo: "none", doubleSide: "auto" },
      // 20-keto side chain: C17-C20(=O)-C21
      "b24": { id: "b24", a1: "c17", a2: "c20", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "c20", a2: "o20", order: 2, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "c20", a2: "c21", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b27": { id: "b27", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "c8", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c21", a2: "h21a", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c21", a2: "h21b", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "c21", a2: "h21c", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Cortisol (pregn-4-ene-3,20-dione-11β,17α,21-triol)
export const cortisol: StructureTemplate = {
  id: "cortisol",
  label: "Cortisol",
  category: "steroids",
  molecule: {
    atoms: {
      // Ring A
      "c1": { id: "c1", x: -50, y: -30, element: "C", charge: 0 },
      "c2": { id: "c2", x: -10, y: -30, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: -20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 30, element: "C", charge: 0 },
      "c5": { id: "c5", x: -10, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: -50, y: 20, element: "C", charge: 0 },
      // Ring B
      "c6": { id: "c6", x: 30, y: 30, element: "C", charge: 0 },
      "c7": { id: "c7", x: 70, y: 20, element: "C", charge: 0 },
      "c8": { id: "c8", x: 70, y: -20, element: "C", charge: 0 },
      "c9": { id: "c9", x: 30, y: -30, element: "C", charge: 0 },
      // Ring C
      "c11": { id: "c11", x: 70, y: -40, element: "C", charge: 0 },
      "c12": { id: "c12", x: 30, y: -70, element: "C", charge: 0 },
      "c13": { id: "c13", x: -10, y: -70, element: "C", charge: 0 },
      "c14": { id: "c14", x: -30, y: -50, element: "C", charge: 0 },
      // Ring D
      "c15": { id: "c15", x: -30, y: -10, element: "C", charge: 0 },
      "c16": { id: "c16", x: 10, y: -10, element: "C", charge: 0 },
      "c17": { id: "c17", x: 10, y: 10, element: "C", charge: 0 },
      // Methyl groups
      "c19": { id: "c19", x: -70, y: -20, element: "C", charge: 0 },
      "c18": { id: "c18", x: -70, y: 20, element: "C", charge: 0 },
      // 3-keto
      "o3": { id: "o3", x: -20, y: 50, element: "O", charge: 0 },
      // 11-hydroxyl
      "o11": { id: "o11", x: 90, y: -40, element: "O", charge: 0 },
      "h11": { id: "h11", x: 90, y: -60, element: "H", charge: 0 },
      // 17-hydroxyl
      "o17": { id: "o17", x: 10, y: 40, element: "O", charge: 0 },
      "h17": { id: "h17", x: 10, y: 60, element: "H", charge: 0 },
      // 20-keto side chain: C17-C20(=O)-C21(OH)
      "c20": { id: "c20", x: 50, y: 10, element: "C", charge: 0 },
      "c21": { id: "c21", x: 80, y: 10, element: "C", charge: 0 },
      "o20": { id: "o20", x: 50, y: 40, element: "O", charge: 0 },
      "o21": { id: "o21", x: 80, y: 40, element: "O", charge: 0 },
      "h21": { id: "h21", x: 80, y: 60, element: "H", charge: 0 },
      // Hydrogens
      "h1": { id: "h1", x: -60, y: -30, element: "H", charge: 0 },
      "h2": { id: "h2", x: 80, y: -30, element: "H", charge: 0 },
    },
    bonds: {
      // Ring A: C1-C2-C3-C4=C5-C10-C1
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 2, stereo: "none", doubleSide: "auto" }, // Δ4
      "b5": { id: "b5", a1: "c5", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c10", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring B: C5-C6-C7-C8-C9-C10
      "b7": { id: "b7", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring C: C8-C9-C11-C12-C13-C14
      "b12": { id: "b12", a1: "c8", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c12", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c14", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring D: C13-C14-C15-C16-C17-C13
      "b17": { id: "b17", a1: "c13", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c16", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c17", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b21": { id: "b21", a1: "c10", a2: "c19", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c13", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      // 3-keto
      "b23": { id: "b23", a1: "c3", a2: "o3", order: 2, stereo: "none", doubleSide: "auto" },
      // 11-hydroxyl
      "b24": { id: "b24", a1: "c11", a2: "o11", order: 1, stereo: "none", doubleSide: "auto" },
      "b25": { id: "b25", a1: "o11", a2: "h11", order: 1, stereo: "none", doubleSide: "auto" },
      // 17-hydroxyl
      "b26": { id: "b26", a1: "c17", a2: "o17", order: 1, stereo: "none", doubleSide: "auto" },
      "b27": { id: "b27", a1: "o17", a2: "h17", order: 1, stereo: "none", doubleSide: "auto" },
      // 20-keto side chain: C17-C20(=O)-C21(OH)
      "b28": { id: "b28", a1: "c17", a2: "c20", order: 1, stereo: "none", doubleSide: "auto" },
      "b29": { id: "b29", a1: "c20", a2: "o20", order: 2, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c20", a2: "c21", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "c21", a2: "o21", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "o21", a2: "h21", order: 1, stereo: "none", doubleSide: "auto" },
      // Hydrogens
      "b33": { id: "b33", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b34": { id: "b34", a1: "c8", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Cholic Acid (3α,7α,12α-trihydroxy-5β-cholan-24-oic acid)
export const cholicAcid: StructureTemplate = {
  id: "cholicAcid",
  label: "Cholic Acid",
  category: "steroids",
  molecule: {
    atoms: {
      // Steroid nucleus (saturated, no double bonds)
      "c1": { id: "c1", x: -50, y: -30, element: "C", charge: 0 },
      "c2": { id: "c2", x: -10, y: -30, element: "C", charge: 0 },
      "c3": { id: "c3", x: 30, y: -20, element: "C", charge: 0 },
      "c4": { id: "c4", x: 30, y: 30, element: "C", charge: 0 },
      "c5": { id: "c5", x: -10, y: 30, element: "C", charge: 0 },
      "c10": { id: "c10", x: -50, y: 20, element: "C", charge: 0 },
      "c6": { id: "c6", x: 30, y: 30, element: "C", charge: 0 },
      "c7": { id: "c7", x: 70, y: 20, element: "C", charge: 0 },
      "c8": { id: "c8", x: 70, y: -20, element: "C", charge: 0 },
      "c9": { id: "c9", x: 30, y: -30, element: "C", charge: 0 },
      "c11": { id: "c11", x: 70, y: -40, element: "C", charge: 0 },
      "c12": { id: "c12", x: 30, y: -70, element: "C", charge: 0 },
      "c13": { id: "c13", x: -10, y: -70, element: "C", charge: 0 },
      "c14": { id: "c14", x: -30, y: -50, element: "C", charge: 0 },
      "c15": { id: "c15", x: -30, y: -10, element: "C", charge: 0 },
      "c16": { id: "c16", x: 10, y: -10, element: "C", charge: 0 },
      "c17": { id: "c17", x: 10, y: 10, element: "C", charge: 0 },
      // Methyl groups
      "c19": { id: "c19", x: -70, y: -20, element: "C", charge: 0 },
      "c18": { id: "c18", x: -70, y: 20, element: "C", charge: 0 },
      // 3-hydroxyl
      "o3": { id: "o3", x: -20, y: 50, element: "O", charge: 0 },
      "h3": { id: "h3o", x: -20, y: 70, element: "H", charge: 0 },
      // 7-hydroxyl
      "o7": { id: "o7", x: 90, y: 20, element: "O", charge: 0 },
      "h7": { id: "h7o", x: 90, y: 40, element: "H", charge: 0 },
      // 12-hydroxyl
      "o12": { id: "o12", x: 90, y: -40, element: "O", charge: 0 },
      "h12": { id: "h12o", x: 90, y: -60, element: "H", charge: 0 },
      // Side chain: C17-C20-C22-C23-C24(=O)OH
      "c20": { id: "c20", x: 50, y: 10, element: "C", charge: 0 },
      "c22": { id: "c22", x: 80, y: 10, element: "C", charge: 0 },
      "c23": { id: "c23", x: 100, y: 10, element: "C", charge: 0 },
      "c24": { id: "c24", x: 120, y: 10, element: "C", charge: 0 },
      "o24a": { id: "o24a", x: 120, y: 40, element: "O", charge: 0 },
      "o24b": { id: "o24b", x: 140, y: 10, element: "O", charge: -1 },
      "h24": { id: "h24o", x: 120, y: 60, element: "H", charge: 0 },
      // Hydrogens on side chain
      "h20a": { id: "h20a", x: 50, y: -10, element: "H", charge: 0 },
      "h20b": { id: "h20b", x: 50, y: 30, element: "H", charge: 0 },
      "h22a": { id: "h22a", x: 80, y: -10, element: "H", charge: 0 },
      "h22b": { id: "h22b", x: 80, y: 30, element: "H", charge: 0 },
      "h23a": { id: "h23a", x: 100, y: -10, element: "H", charge: 0 },
      "h23b": { id: "h23b", x: 100, y: 30, element: "H", charge: 0 },
      // Hydrogens on nucleus
      "h1": { id: "h1", x: -60, y: -30, element: "H", charge: 0 },
      "h2": { id: "h2", x: 80, y: -30, element: "H", charge: 0 },
    },
    bonds: {
      // Ring A: C1-C2-C3-C4-C5-C10-C1 (saturated)
      "b1": { id: "b1", a1: "c1", a2: "c2", order: 1, stereo: "none", doubleSide: "auto" },
      "b2": { id: "b2", a1: "c2", a2: "c3", order: 1, stereo: "none", doubleSide: "auto" },
      "b3": { id: "b3", a1: "c3", a2: "c4", order: 1, stereo: "none", doubleSide: "auto" },
      "b4": { id: "b4", a1: "c4", a2: "c5", order: 1, stereo: "none", doubleSide: "auto" },
      "b5": { id: "b5", a1: "c5", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      "b6": { id: "b6", a1: "c10", a2: "c1", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring B: C5-C6-C7-C8-C9-C10
      "b7": { id: "b7", a1: "c5", a2: "c6", order: 1, stereo: "none", doubleSide: "auto" },
      "b8": { id: "b8", a1: "c6", a2: "c7", order: 1, stereo: "none", doubleSide: "auto" },
      "b9": { id: "b9", a1: "c7", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      "b10": { id: "b10", a1: "c8", a2: "c9", order: 1, stereo: "none", doubleSide: "auto" },
      "b11": { id: "b11", a1: "c9", a2: "c10", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring C: C8-C9-C11-C12-C13-C14
      "b12": { id: "b12", a1: "c8", a2: "c11", order: 1, stereo: "none", doubleSide: "auto" },
      "b13": { id: "b13", a1: "c11", a2: "c12", order: 1, stereo: "none", doubleSide: "auto" },
      "b14": { id: "b14", a1: "c12", a2: "c13", order: 1, stereo: "none", doubleSide: "auto" },
      "b15": { id: "b15", a1: "c13", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      "b16": { id: "b16", a1: "c14", a2: "c8", order: 1, stereo: "none", doubleSide: "auto" },
      // Ring D: C13-C14-C15-C16-C17-C13
      "b17": { id: "b17", a1: "c13", a2: "c15", order: 1, stereo: "none", doubleSide: "auto" },
      "b18": { id: "b18", a1: "c15", a2: "c16", order: 1, stereo: "none", doubleSide: "auto" },
      "b19": { id: "b19", a1: "c16", a2: "c17", order: 1, stereo: "none", doubleSide: "auto" },
      "b20": { id: "b20", a1: "c17", a2: "c14", order: 1, stereo: "none", doubleSide: "auto" },
      // Methyl groups
      "b21": { id: "b21", a1: "c10", a2: "c19", order: 1, stereo: "none", doubleSide: "auto" },
      "b22": { id: "b22", a1: "c13", a2: "c18", order: 1, stereo: "none", doubleSide: "auto" },
      // 3-hydroxyl
      "b23": { id: "b23", a1: "c3", a2: "o3", order: 1, stereo: "none", doubleSide: "auto" },
      "b24": { id: "b24", a1: "o3", a2: "h3", order: 1, stereo: "none", doubleSide: "auto" },
      // 7-hydroxyl
      "b25": { id: "b25", a1: "c7", a2: "o7", order: 1, stereo: "none", doubleSide: "auto" },
      "b26": { id: "b26", a1: "o7", a2: "h7", order: 1, stereo: "none", doubleSide: "auto" },
      // 12-hydroxyl
      "b27": { id: "b27", a1: "c11", a2: "o12", order: 1, stereo: "none", doubleSide: "auto" },
      "b28": { id: "b28", a1: "o12", a2: "h12", order: 1, stereo: "none", doubleSide: "auto" },
      // Side chain: C17-C20-C22-C23-C24(=O)OH
      "b29": { id: "b29", a1: "c17", a2: "c20", order: 1, stereo: "none", doubleSide: "auto" },
      "b30": { id: "b30", a1: "c20", a2: "c22", order: 1, stereo: "none", doubleSide: "auto" },
      "b31": { id: "b31", a1: "c22", a2: "c23", order: 1, stereo: "none", doubleSide: "auto" },
      "b32": { id: "b32", a1: "c23", a2: "c24", order: 1, stereo: "none", doubleSide: "auto" },
      "b33": { id: "b33", a1: "c24", a2: "o24a", order: 2, stereo: "none", doubleSide: "auto" },
      "b34": { id: "b34", a1: "c24", a2: "o24b", order: 1, stereo: "none", doubleSide: "auto" },
      "b35": { id: "b35", a1: "o24b", a2: "h24", order: 1, stereo: "none", doubleSide: "auto" },
      // Side chain hydrogens
      "b36": { id: "b36", a1: "c20", a2: "h20a", order: 1, stereo: "none", doubleSide: "auto" },
      "b37": { id: "b37", a1: "c20", a2: "h20b", order: 1, stereo: "none", doubleSide: "auto" },
      "b38": { id: "b38", a1: "c22", a2: "h22a", order: 1, stereo: "none", doubleSide: "auto" },
      "b39": { id: "b39", a1: "c22", a2: "h22b", order: 1, stereo: "none", doubleSide: "auto" },
      "b40": { id: "b40", a1: "c23", a2: "h23a", order: 1, stereo: "none", doubleSide: "auto" },
      "b41": { id: "b41", a1: "c23", a2: "h23b", order: 1, stereo: "none", doubleSide: "auto" },
      // Nucleus hydrogens
      "b42": { id: "b42", a1: "c1", a2: "h1", order: 1, stereo: "none", doubleSide: "auto" },
      "b43": { id: "b43", a1: "c8", a2: "h2", order: 1, stereo: "none", doubleSide: "auto" },
    },
    hapticBonds: {},
    aromaticRingDisplays: {},
  },
  annotations: [],
};

// Export all steroid templates
export const STEROID_TEMPLATES = [
  gonane,
  cholesterol,
  testosterone,
  estradiol,
  progesterone,
  cortisol,
  cholicAcid,
];