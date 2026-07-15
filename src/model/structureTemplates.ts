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
];
