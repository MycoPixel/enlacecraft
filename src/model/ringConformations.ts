import type { Molecule, RingTemplateLayout, RingTemplateLayoutAtom, RingTemplateLayoutBond } from "../types/chemistry";
import type { StructureTemplate } from "./structureTemplates";

/**
 * Fixed 2D layouts for the conformation ring templates (chair/boat
 * cyclohexane, cis/trans-decalin, norbornane). These are stored as explicit
 * atom/bond data rather than generated from a polygon because the whole
 * point of each template is its conventional projection: a chair's
 * alternating up/down vertices, a decalin's two fused rings plus the
 * bridgehead hydrogens that encode cis/trans, and norbornane's bridge.
 *
 * Coordinates are authored y-up, matching the ChemDraw-style source
 * depictions these layouts came from. The canvas is y-down, so every layout
 * is passed through yDown() before it is used: that keeps a placed template
 * in the same orientation as RingPicker's miniature, which draws layout
 * coordinates directly. Coordinates are in world px (BOND_LEN = 42), with
 * each layout's bounding-box centre at the origin. Ring bonds are all ~42 px;
 * norbornane's two "outer" ring bonds are slightly longer, which is how the
 * source depiction lays the bridge out and keeps the drawing readable.
 */
function yDown(atoms: RingTemplateLayoutAtom[]): RingTemplateLayoutAtom[] {
  return atoms.map((a) => ({ ...a, y: -a.y }));
}

const chairAtoms: RingTemplateLayoutAtom[] = [
  { key: "1", element: "C", x: 51.118, y: -18.224 },
  { key: "2", element: "C", x: 30.16, y: 18.224 },
  { key: "3", element: "C", x: -10.661, y: 7.654 },
  { key: "4", element: "C", x: -51.118, y: 18.224 },
  { key: "5", element: "C", x: -30.525, y: -17.859 },
  { key: "6", element: "C", x: 10.296, y: -7.29 },
];

const boatAtoms: RingTemplateLayoutAtom[] = [
  { key: "1", element: "C", x: -47.007, y: 21.545 },
  { key: "2", element: "C", x: -15.669, y: 4.701 },
  { key: "3", element: "C", x: 15.669, y: 4.701 },
  { key: "4", element: "C", x: 47.007, y: 21.545 },
  { key: "5", element: "C", x: 27.421, y: -21.545 },
  { key: "6", element: "C", x: -27.421, y: -21.545 },
];

const sixRingBonds: RingTemplateLayoutBond[] = [
  { from: "1", to: "2", order: 1 },
  { from: "2", to: "3", order: 1 },
  { from: "3", to: "4", order: 1 },
  { from: "4", to: "5", order: 1 },
  { from: "5", to: "6", order: 1 },
  { from: "6", to: "1", order: 1 },
];

const sixRingLoop = ["1", "2", "3", "4", "5", "6"];

export const CYCLOHEXANE_CHAIR_LAYOUT: RingTemplateLayout = {
  atoms: yDown(chairAtoms),
  bonds: sixRingBonds,
  loops: [sixRingLoop],
  attachAtom: "1",
  attachBond: ["1", "2"],
};

export const CYCLOHEXANE_BOAT_LAYOUT: RingTemplateLayout = {
  atoms: yDown(boatAtoms),
  bonds: sixRingBonds,
  loops: [sixRingLoop],
  attachAtom: "1",
  attachBond: ["1", "2"],
};

/**
 * Decalin skeleton (two fused cyclohexanes sharing the vertical C19-C24
 * edge), plus the bridgehead hydrogens that distinguish the two
 * diastereomers. A wedge means that hydrogen points toward the viewer, so
 * cis-decalin has both bridgehead H's wedged and trans-decalin has one
 * wedge + one dash.
 */
const decalinAtoms: RingTemplateLayoutAtom[] = [
  { key: "16", element: "C", x: 72.747, y: 21 },
  { key: "17", element: "C", x: 72.746, y: -20.999 },
  { key: "18", element: "C", x: 36.373, y: -41.999 },
  { key: "19", element: "C", x: 0, y: -21 },
  { key: "20", element: "C", x: -36.372, y: -42 },
  { key: "21", element: "C", x: -72.745, y: -21 },
  { key: "22", element: "C", x: -72.746, y: 21.001 },
  { key: "23", element: "C", x: -36.373, y: 42.001 },
  { key: "24", element: "C", x: 0, y: 21 },
  { key: "25", element: "C", x: 36.373, y: 42 },
  { key: "h19", element: "H", x: -0.001, y: -63 },
  { key: "h24", element: "H", x: 0.002, y: 63 },
];

const decalinBonds: RingTemplateLayoutBond[] = [
  { from: "16", to: "17", order: 1 },
  { from: "17", to: "18", order: 1 },
  { from: "18", to: "19", order: 1 },
  { from: "19", to: "20", order: 1 },
  { from: "20", to: "21", order: 1 },
  { from: "21", to: "22", order: 1 },
  { from: "22", to: "23", order: 1 },
  { from: "23", to: "24", order: 1 },
  { from: "19", to: "24", order: 1 },
  { from: "24", to: "25", order: 1 },
  { from: "16", to: "25", order: 1 },
];

function decalinLayout(cis: boolean): RingTemplateLayout {
  return {
    atoms: yDown(decalinAtoms),
    bonds: [
      ...decalinBonds,
      { from: "19", to: "h19", order: 1, stereo: "wedge" },
      { from: "24", to: "h24", order: 1, stereo: cis ? "wedge" : "dash" },
    ],
    loops: [
      ["19", "18", "17", "16", "25", "24"],
      ["19", "20", "21", "22", "23", "24"],
    ],
    attachAtom: "17",
    attachBond: ["16", "17"],
  };
}

export const CIS_DECALIN_LAYOUT: RingTemplateLayout = decalinLayout(true);
export const TRANS_DECALIN_LAYOUT: RingTemplateLayout = decalinLayout(false);

const norbornaneAtoms: RingTemplateLayoutAtom[] = [
  { key: "1", element: "C", x: 34.857, y: -39.325 },
  { key: "2", element: "C", x: -5.084, y: -52.303 },
  { key: "3", element: "C", x: -34.857, y: -2.673 },
  { key: "4", element: "C", x: -34.857, y: 39.325 },
  { key: "5", element: "C", x: 5.088, y: 52.303 },
  { key: "6", element: "C", x: 29.771, y: 18.326 },
  { key: "7", element: "C", x: 5.088, y: -15.651 },
];

const norbornaneBonds: RingTemplateLayoutBond[] = [
  { from: "1", to: "2", order: 1 },
  { from: "2", to: "3", order: 1 },
  { from: "3", to: "4", order: 1 },
  { from: "4", to: "5", order: 1 },
  { from: "5", to: "6", order: 1 },
  { from: "1", to: "6", order: 1 },
  { from: "6", to: "7", order: 1 },
  { from: "3", to: "7", order: 1 },
];

export const NORBORNANE_LAYOUT: RingTemplateLayout = {
  atoms: yDown(norbornaneAtoms),
  bonds: norbornaneBonds,
  // Two five-membered rings sharing the C3-C7-C6 path; drawing both makes
  // the bridge read clearly in the hover preview.
  loops: [
    ["1", "2", "3", "7", "6"],
    ["3", "4", "5", "6", "7"],
  ],
  attachAtom: "2",
  attachBond: ["1", "2"],
};

/**
 * The ring-flipped chair. Chair inversion swaps axial and equatorial
 * positions on every carbon, which in the 2D skeletal projection means
 * every carbon's out-of-plane displacement changes sign: the two carbons
 * drawn "up" become the two drawn "down" and vice versa. The original
 * chair drawing is (almost exactly) point-symmetric about its centre, so
 * the flipped projection is the original's mirror image across the mean
 * ring plane — here expressed, in the file's authored y-up space, as
 * simply negating each atom's y. That keeps this layout a first-class
 * sibling of CYCLOHEXANE_CHAIR_LAYOUT above (same six bonds, mirrored
 * vertex heights) rather than a hand-retyped second copy that could
 * drift, and it makes the "which carbons are up" difference between the
 * two chairs explicit in one line.
 *
 * Like every layout in this file it goes through yDown() for the canvas.
 * It is deliberately NOT registered in constants.ts's RING_TEMPLATES —
 * ring skeletons live in the RingPicker, and conformations belong to the
 * TemplatePalette's "conformations" tab (see CONFORMATION_TEMPLATES
 * below), which is also why no attachAtom/attachBond is needed.
 */
const flippedChairAtoms: RingTemplateLayoutAtom[] = chairAtoms.map((a) => ({ ...a, y: -a.y }));

export const CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT: RingTemplateLayout = {
  atoms: yDown(flippedChairAtoms),
  bonds: sixRingBonds,
  loops: [sixRingLoop],
};

// ---------------------------------------------------------------------------
// Newman projections (TemplatePalette "conformations" category)
//
// A real Newman projection is drawn with the two carbons projected onto the
// same 2D point, the front carbon's three bonds radiating from the centre
// and the back carbon's three bonds terminating on an invisible circle.
// This app has no Newman circle glyph yet (a circle drawn through the six
// substituent roots would have to be a renderer feature, not molecule data
// — future work), so these templates use a plain bond-diagram convention,
// chosen so the result is unambiguous to read and survives every renderer
// path (canvas, export, 3D viewer) unchanged:
//
//  - The FRONT carbon sits at the template's centre with its three bonds
//    radiating at 90°/210°/330° (screen angles; canvas is y-down, so 90°
//    points down) — the classic front "Y".
//  - The BACK carbon is offset 12 px straight up (NEWMAN_BACK_OFFSET,
//    "into the page"). Coincident front/back carbons were rejected: a
//    zero-length front→back bond renders degenerately and the two Y's
//    collapse into one ambiguous 6-pointed star; 12 px is enough to keep
//    the two substituent triads visually separate without reading as a
//    real bond.
//  - The BACK carbon's three substituent bonds are drawn with
//    stereo "dashed" (a plain broken line, distinct from the hash "dash"
//    wedge): they point away from the viewer, and the dashes are exactly
//    how hand-drawn no-circle Newmans distinguish rear bonds passing
//    "behind" the front carbon. Staggered projections put the rear triad
//    at 270°/30°/150° (the inverted Y, 60° from every front bond);
//    eclipsed projections reuse the front angles exactly (rear bonds
//    parallel to their front partners — the textbook no-circle eclipsed
//    shorthand), with the rear axial bond shortened so its terminal
//    hydrogen's label clears the front hydrogen's label below it.
//
// The front→back bond itself is the viewing axis: it is drawn as a short
// 12 px stub (NEWMAN_BACK_OFFSET) purely so the molecule stays one
// connected fragment for the formula/fragment readouts; a Newman's C–C
// axis isn't really a line in the projection. It is the only bond in
// these templates shorter than BOND_LEN, and structureTemplates.test.ts
// exempts exactly that stub from its bond-length plausibility check.
// ---------------------------------------------------------------------------

/** World px per the rest of this file — see BOND_LEN in model/constants.ts.
 * Not imported: constants.ts imports this module's layouts, and a runtime
 * constant used at module top level would turn that into a cycle. */
const NEWMAN_BOND_LEN = 42;

/** How far behind the front carbon the back carbon is drawn, in px. */
const NEWMAN_BACK_OFFSET = 12;

/** Screen-angle (degrees, y-down) triad for the front carbon's bonds. */
const NEWMAN_FRONT_ANGLES = [90, 210, 330];

/** Staggered rear triad — the inverted Y, offset 60° from the front set. */
const NEWMAN_STAGGERED_BACK_ANGLES = [270, 30, 150];

/** Eclipsed rear triad — parallel to the front set (rear bonds drawn
 * directly behind their front partners). */
const NEWMAN_ECLIPSED_BACK_ANGLES = [90, 210, 330];

/** deg → (x, y) unit step in the canvas's y-down convention. */
function newmanDirection(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

interface NewmanSubstituent {
  /** "H" for an explicit hydrogen, "C" for a methyl group (three implicit
   * hydrogens — the same convention every other template file uses). */
  element: "H" | "C";
  /** Bond length override (see the eclipsed axial bond above). */
  length?: number;
}

interface NewmanTemplateSpec {
  id: string;
  label: string;
  /** Substituents in NEWMAN_FRONT_ANGLES order. */
  front: [NewmanSubstituent, NewmanSubstituent, NewmanSubstituent];
  /** Substituents in the matching back-angles order. */
  back: [NewmanSubstituent, NewmanSubstituent, NewmanSubstituent];
  backAngles: number[];
}

/**
 * Builds a Newman-projection StructureTemplate from a front/back
 * substituent specification. Atom keys are reused as atom ids (they only
 * need to be unique within one template — insertMolecule remaps them at
 * insertion time), bonds get namespaced ids ("f-0", "axis", ...).
 */
function newmanTemplate(spec: NewmanTemplateSpec): StructureTemplate {
  const atoms: Molecule["atoms"] = {
    f: { id: "f", x: 0, y: 0, element: "C", charge: 0 },
    b: { id: "b", x: 0, y: -NEWMAN_BACK_OFFSET, element: "C", charge: 0 },
  };
  const bonds: Molecule["bonds"] = {
    axis: {
      id: "axis", a1: "f", a2: "b", order: 1, stereo: "none", doubleSide: "auto",
    },
  };

  const addSubstituents = (
    centerId: string,
    center: { x: number; y: number },
    subs: NewmanSubstituent[],
    angles: number[],
    dashed: boolean,
  ) => {
    subs.forEach((sub, i) => {
      const dir = newmanDirection(angles[i]);
      const len = sub.length ?? NEWMAN_BOND_LEN;
      const id = `${centerId}-${i}`;
      atoms[id] = { id, x: center.x + dir.x * len, y: center.y + dir.y * len, element: sub.element, charge: 0 };
      bonds[`${id}-bond`] = {
        id: `${id}-bond`, a1: centerId, a2: id, order: 1,
        stereo: dashed ? "dashed" : "none", doubleSide: "auto",
      };
    });
  };

  addSubstituents("f", atoms.f, spec.front, NEWMAN_FRONT_ANGLES, false);
  addSubstituents("b", atoms.b, spec.back, spec.backAngles, true);

  // Recentre so the bounding-box midpoint sits at (0, 0) — the offset back
  // carbon otherwise leaves every Newman sitting a few px high of the
  // convention StructureTemplate documents (and pasteFragment's empty-canvas
  // centering assumes).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of Object.values(atoms)) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (const a of Object.values(atoms)) {
    a.x -= cx;
    a.y -= cy;
  }

  return {
    id: spec.id,
    label: spec.label,
    category: "conformations",
    molecule: { atoms, bonds, hapticBonds: {}, aromaticRingDisplays: {} },
    annotations: [],
  };
}

const HYDROGEN: NewmanSubstituent = { element: "H" };
const METHYL: NewmanSubstituent = { element: "C" };

/**
 * The built-in Newman projections. Butane is viewed down its C2–C3 bond
 * (the bond whose rotation interconverts the anti and gauche conformers):
 * the front carbon carries the C1 methyl pointing straight down and the
 * rear carbon carries the C4 methyl — antiperiplanar (270°, 180° dihedral)
 * for anti and synclinal (30°, 60° dihedral) for gauche.
 */
export const NEWMAN_TEMPLATES: StructureTemplate[] = [
  newmanTemplate({
    id: "ethane-newman-staggered",
    label: "Ethane (Newman, staggered)",
    front: [HYDROGEN, HYDROGEN, HYDROGEN],
    back: [HYDROGEN, HYDROGEN, HYDROGEN],
    backAngles: NEWMAN_STAGGERED_BACK_ANGLES,
  }),
  newmanTemplate({
    // The rear axial (down-pointing) bond is drawn shortened: its hydrogen
    // terminates 24 px below the front carbon instead of 42, keeping the
    // two H labels clear of each other on the shared vertical. Rear bonds
    // are dashed, so the near-collision of that rear bond with the front
    // carbon reads as "passes behind", exactly as in the hand convention.
    id: "ethane-newman-eclipsed",
    label: "Ethane (Newman, eclipsed)",
    front: [HYDROGEN, HYDROGEN, HYDROGEN],
    back: [{ element: "H", length: 36 }, HYDROGEN, HYDROGEN],
    backAngles: NEWMAN_ECLIPSED_BACK_ANGLES,
  }),
  newmanTemplate({
    id: "butane-newman-anti",
    label: "Butane (Newman, anti)",
    front: [METHYL, HYDROGEN, HYDROGEN],
    back: [METHYL, HYDROGEN, HYDROGEN],
    backAngles: NEWMAN_STAGGERED_BACK_ANGLES,
  }),
  newmanTemplate({
    id: "butane-newman-gauche",
    label: "Butane (Newman, gauche)",
    front: [METHYL, HYDROGEN, HYDROGEN],
    back: [METHYL, HYDROGEN, HYDROGEN],
    // Rear methyl at 30°: 60° from the front methyl's 90° — the gauche
    // (synclinal) dihedral. Remaining rear angles stay 270°/150°.
    backAngles: [30, 270, 150],
  }),
];

/**
 * Converts one of this file's fixed layouts into the plain Molecule shape
 * StructureTemplate carries, so the flipped chair can be inserted through
 * the same TemplatePalette → pasteFragment path as every other template
 * (fresh ids, undo, valence — all handled by insertMolecule). Layouts
 * never carry charges today, but the field is mapped anyway so the
 * converter stays honest about RingTemplateLayoutAtom's shape.
 */
function layoutToMolecule(layout: RingTemplateLayout): Molecule {
  const atoms: Molecule["atoms"] = {};
  for (const a of layout.atoms) {
    atoms[a.key] = { id: a.key, x: a.x, y: a.y, element: a.element, charge: a.charge ?? 0 };
  }
  const bonds: Molecule["bonds"] = {};
  layout.bonds.forEach((b, i) => {
    const id = `b${i}`;
    bonds[id] = {
      id,
      a1: b.from,
      a2: b.to,
      order: b.order ?? 1,
      stereo: b.stereo ?? "none",
      doubleSide: "auto",
    };
  });
  return { atoms, bonds, hapticBonds: {}, aromaticRingDisplays: {} };
}

/**
 * Conformation templates for the TemplatePalette's "conformations" tab:
 * the ring-flipped chair (the RingPicker's plain chair's inversion partner
 * — see the flipped-chair comment above for why the layouts are mirrors of
 * each other) plus the four Newman projections built above. These are
 * paste-able fragments, not ring-tool skeletons, so they deliberately do
 * NOT go through RING_TEMPLATES/RingPicker; re-exported into
 * STRUCTURE_TEMPLATES by model/structureTemplates.ts.
 */
export const CONFORMATION_TEMPLATES: StructureTemplate[] = [
  {
    id: "cyclohexane-chair-flipped",
    label: "Cyclohexane (flipped chair)",
    category: "conformations",
    molecule: layoutToMolecule(CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT),
    annotations: [],
  },
  ...NEWMAN_TEMPLATES,
];
