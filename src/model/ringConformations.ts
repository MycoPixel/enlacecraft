import type { RingTemplateLayout, RingTemplateLayoutAtom, RingTemplateLayoutBond } from "../types/chemistry";

/**
 * Fixed 2D layouts for the conformation ring templates (chair/boat
 * cyclohexane, cis/trans-decalin, norbornane). These are stored as explicit
 * atom/bond data rather than generated from a polygon because the whole
 * point of each template is its conventional projection: a chair's
 * alternating up/down vertices, a decalin's two fused rings plus the
 * bridgehead hydrogens that encode cis/trans, and norbornane's bridge.
 *
 * Coordinates are in world px (BOND_LEN = 42), with each layout's
 * bounding-box centre at the origin. Ring bonds are all ~42 px; norbornane's
 * two "outer" ring bonds are slightly longer, which is how the source
 * depiction lays the bridge out and keeps the drawing readable.
 */

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
  atoms: chairAtoms,
  bonds: sixRingBonds,
  loops: [sixRingLoop],
  attachAtom: "1",
  attachBond: ["1", "2"],
};

export const CYCLOHEXANE_BOAT_LAYOUT: RingTemplateLayout = {
  atoms: boatAtoms,
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
    atoms: decalinAtoms,
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
  atoms: norbornaneAtoms,
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
