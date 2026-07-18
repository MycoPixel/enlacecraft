import type { FunctionalGroupTemplate } from "../types/chemistry";
import { BOND_LEN } from "./constants";

/**
 * Builds one template's local layout from a short, readable spec instead of
 * hand-rounded coordinates: each atom is placed by walking outward from
 * `attachKey` (always at local (0, 0)) along explicit bond directions in
 * degrees, measured the same way the rest of the app measures angles (0°
 * = local +x, i.e. "the direction the group extends away from the
 * attachment point" — see FunctionalGroupTemplate's doc comment).
 *
 * `steps` is a flat list of `[fromKey, toKey, angleDeg, order, element,
 * charge?]` tuples, each placing `toKey` one BOND_LEN from `fromKey` at
 * the given absolute angle and bonding them. Every group here branches at
 * most one atom deep from any existing point (no ring closures), so this
 * flat walk is enough — no need for the general graph-placement machinery
 * engine/ringPlacement.ts needs for actual rings.
 */
function build(
  attachKey: string,
  steps: [from: string, to: string, angleDeg: number, order: 1 | 2 | 3, element: FunctionalGroupTemplate["atoms"][number]["element"], charge?: number][]
): Pick<FunctionalGroupTemplate, "atoms" | "bonds" | "attachKey"> {
  const positions: Record<string, { x: number; y: number }> = { [attachKey]: { x: 0, y: 0 } };
  // The attachKey entry here is a geometry-only placeholder (element value
  // is never used) — engine/functionalGroupPlacement.ts always reuses the
  // real attach atom (or, on an empty canvas, skips materializing this
  // position as an atom at all) rather than ever adding a new atom for it.
  const atoms: FunctionalGroupTemplate["atoms"] = [{ key: attachKey, element: "C", x: 0, y: 0 }];
  const bonds: FunctionalGroupTemplate["bonds"] = [];
  for (const [from, to, angleDeg, order, element, charge] of steps) {
    const rad = (angleDeg * Math.PI) / 180;
    const p = { x: positions[from].x + BOND_LEN * Math.cos(rad), y: positions[from].y + BOND_LEN * Math.sin(rad) };
    positions[to] = p;
    atoms.push({ key: to, element, x: p.x, y: p.y, charge });
    bonds.push({ from, to, order });
  }
  return { attachKey, atoms, bonds };
}

// Shared branch angles for a trigonal (sp2) center one bond out from the
// attachment point: the incoming bond arrives at 180° (pointing back to
// the attach atom, which sits at local (0,0) while this center sits at
// local (BOND_LEN, 0) along the authoring convention's +x), so the other
// two substituents at +60°/-60° from *that center* end up evenly spaced
// 120° apart from the incoming bond and from each other — the classic
// carbonyl/nitro "Y" shape.
const CENTER_ANGLE = 0;
const BRANCH_UP = 60;
const BRANCH_DOWN = -60;

export const FUNCTIONAL_GROUP_TEMPLATES: FunctionalGroupTemplate[] = [
  {
    id: "hydroxyl",
    label: "Hydroxyl",
    ...build("A", [
      ["A", "O1", CENTER_ANGLE, 1, "O"],
    ]),
  },
  {
    id: "amine",
    label: "Amine",
    ...build("A", [
      ["A", "N1", CENTER_ANGLE, 1, "N"],
    ]),
  },
  {
    id: "thiol",
    label: "Thiol",
    ...build("A", [
      ["A", "S1", CENTER_ANGLE, 1, "S"],
    ]),
  },
  {
    id: "ether",
    label: "Ether",
    ...build("A", [
      ["A", "O1", CENTER_ANGLE, 1, "O"],
      ["O1", "C2", BRANCH_UP, 1, "C"],
    ]),
  },
  {
    id: "carboxylic-acid",
    label: "Carboxylic acid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "O2", BRANCH_DOWN, 1, "O"],
    ]),
  },
  {
    id: "ester",
    label: "Ester",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "O2", BRANCH_DOWN, 1, "O"],
      // Capped with a methyl so this reads unambiguously as an ester
      // rather than trailing off as a bare (and then implicitly-H-filled,
      // acid-looking) oxygen — see the file's top doc comment.
      ["O2", "C2", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "amide",
    label: "Amide",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "N1", BRANCH_DOWN, 1, "N"],
    ]),
  },
  {
    id: "ketone",
    label: "Ketone",
    ...build("A", [
      // Deliberately leaves the carbonyl carbon's second substituent
      // open — attaching this onto one atom gives R-C(=O)-, and the
      // remaining valence (an implicit H until extended) is where a
      // second R group belongs to complete an actual ketone; see this
      // template's entry in the file-level doc comment for why that's
      // the same "one valence left open" convention a ring's attach atom
      // already uses.
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
    ]),
  },
  {
    id: "aldehyde",
    label: "Aldehyde",
    ...build("A", [
      // Same carbonyl shape as ketone, but with an explicit H on the
      // carbonyl carbon — aldehydes are conventionally drawn with that H
      // shown, unlike a plain terminal CH3 (which is left implicit) — so
      // this unambiguously reads as -CHO rather than leaving a second
      // valence open the way the ketone template does.
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "H1", BRANCH_DOWN, 1, "H"],
    ]),
  },
  {
    id: "nitrile",
    label: "Nitrile",
    ...build("A", [
      // Linear: -C#N drawn straight out from the attachment point.
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "N1", CENTER_ANGLE, 3, "N"],
    ]),
  },
  {
    id: "nitro",
    label: "Nitro",
    ...build("A", [
      // The standard charge-separated resonance form: N+ with one O=
      // and one O-.
      ["A", "N1", CENTER_ANGLE, 1, "N", 1],
      ["N1", "O1", BRANCH_UP, 2, "O"],
      ["N1", "O2", BRANCH_DOWN, 1, "O", -1],
    ]),
  },
];
