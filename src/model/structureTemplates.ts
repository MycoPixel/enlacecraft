import type { Annotation, Molecule } from "../types/chemistry";
import { AMINO_ACID_TEMPLATES } from "./aminoAcidTemplates";
import { AROMATIC_TEMPLATES } from "./aromaticTemplates";
import { CARBOHYDRATE_TEMPLATES } from "./carbohydrateTemplates";
import { CONFORMATION_TEMPLATES } from "./ringConformations";
import { FUSED_HETEROCYCLE_TEMPLATES } from "./heterocycleTemplates";
import { NUCLEOBASE_TEMPLATES } from "./nucleobaseTemplates";
import { NUCLEOTIDE_TEMPLATES } from "./nucleotideTemplates";
import { ORGANOMETALLIC_TEMPLATES } from "./organometallicTemplates";
import { POLYSACCHARIDE_TEMPLATES } from "./polysaccharideTemplates";
import { STEROID_TEMPLATES } from "./steroidTemplates";
import { TERPENE_TEMPLATES } from "./terpeneTemplates";

/**
 * A pre-made structure insertable via the "Structures" button next to the
 * ring templates — for things too specific/non-regular to express as a
 * RingTemplate (a Fischer projection's vertical carbon chain, a Haworth
 * ring's particular slant, a chair conformation's alternating up/down
 * ring vertices with explicit axial/equatorial wedges), where getting the
 * exact conventional layout right matters more than generating it
 * procedurally.
 *
 * The molecular data lives in the per-family files re-exported at the
 * bottom of this file. Each one is built from a reference structure
 * (SMILES for skeletal molecules, explicit projection builders for the
 * Fischer/Haworth sugars) so connectivity, bond orders, charges and
 * stereochemistry are chemically correct; see each family file's header.
 * Insertion reuses the exact same placement logic as a clipboard paste
 * (see pasteFragment in the store): dropped just to the right of whatever
 * is already on the canvas, or centered in view if the canvas is empty.
 * Every atom/bond id is arbitrary and gets freshly remapped at insertion
 * time (see insertMolecule), so these only need to be unique *within* one
 * template, not across templates or against whatever's already drawn.
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
   * long undifferentiated list — see TemplatePalette.tsx. Purely
   * a display grouping; has no effect on insertion. */
  category: string;
  molecule: Molecule;
  annotations: Annotation[];
}

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
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
      hapticBonds: {}, aromaticRingDisplays: {},
    },
    annotations: [],
  },

  ...AMINO_ACID_TEMPLATES,
  ...CARBOHYDRATE_TEMPLATES,
  ...POLYSACCHARIDE_TEMPLATES,
  ...FUSED_HETEROCYCLE_TEMPLATES,
  ...NUCLEOTIDE_TEMPLATES,
  ...NUCLEOBASE_TEMPLATES,
  ...STEROID_TEMPLATES,
  ...TERPENE_TEMPLATES,
  // Phase-10 library expansion sets — conformation projections
  // (ringConformations.ts), metallocenes/paddlewheel
  // (organometallicTemplates.ts) and named aromatics/bicyclics
  // (aromaticTemplates.ts). Same paste-fragment insertion path as every
  // family above; their categories are listed in TemplatePalette's
  // CATEGORY_ORDER and labelled in i18n/translations.ts.
  ...CONFORMATION_TEMPLATES,
  ...ORGANOMETALLIC_TEMPLATES,
  ...AROMATIC_TEMPLATES,
];
