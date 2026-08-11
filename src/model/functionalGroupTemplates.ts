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
type BuildStep = [from: string, to: string, angleDeg: number, order: 1 | 2 | 3, element: FunctionalGroupTemplate["atoms"][number]["element"], charge?: number];

function build(
  attachKey: string,
  steps: BuildStep[],
  // Bonds between two keys that already exist by the time this is called
  // (typically two atoms both placed earlier in `steps`) — no new position
  // is computed, this just adds the extra edge. This is what lets a ring
  // (e.g. a phenyl group's six carbons) close: every ring is still walked
  // out linearly as ordinary `steps`, and `closures` adds the one bond that
  // turns that walk's tail back into its head.
  closures: [from: string, to: string, order: 1 | 2 | 3][] = []
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
  for (const [from, to, order] of closures) bonds.push({ from, to, order });
  return { attachKey, atoms, bonds };
}

/**
 * A six-membered carbocycle (benzene when `aromatic`, cyclohexane when
 * not) extending out from `fromKey`, which must already be a placed atom
 * sitting on the local x-axis at `fromX` — every abbreviation below only
 * ever grows straight out along that axis, so this doesn't need the
 * general "attach at any angle" machinery real ring placement
 * (engine/ringPlacement.ts) handles; it just picks up build()'s walk where
 * `fromKey` left off. `keyPrefix` keeps this ring's six atom keys from
 * colliding with another ring or with the caller's own keys in the same
 * template. Returns the new atoms/bonds/closure (ready to spread into a
 * build() call's own arrays) plus `ipsoKey`/`paraKey` so a caller can
 * attach a further substituent (tosyl's methyl, tyrosine's -OH, ...) onto
 * either ring position.
 */
function ring6(fromKey: string, fromPos: { x: number; y: number }, keyPrefix: string, aromatic: boolean) {
  const R = BOND_LEN;
  const cx = fromPos.x + R * 1.5; // hexagon center, one edge-length further along +x from the ipso vertex
  const cy = fromPos.y;
  const key = (i: number) => `${keyPrefix}${i}`;
  const atoms: FunctionalGroupTemplate["atoms"] = [];
  const pos: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const theta = ((180 - 60 * i) * Math.PI) / 180;
    const p = { x: cx + R * Math.cos(theta), y: cy + R * Math.sin(theta) };
    pos.push(p);
    atoms.push({ key: key(i), element: "C", x: p.x, y: p.y });
  }
  const bonds: FunctionalGroupTemplate["bonds"] = [{ from: fromKey, to: key(0), order: 1 }];
  for (let i = 0; i < 6; i++) {
    const order: 1 | 2 = aromatic && i % 2 === 0 ? 2 : 1;
    bonds.push({ from: key(i), to: key((i + 1) % 6), order });
  }
  return { atoms, bonds, ipsoKey: key(0), paraKey: key(3) };
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

  // -------------------------------------------------------------------
  // Common abbreviations/nicknames (alkyl, protecting groups) — same
  // build()/ring6() machinery as the reactive groups above, just a much
  // larger set. Each still pastes back as a fully expanded fragment (see
  // this file's own doc comment) rather than a single collapsible
  // vertex; that's a separate, much bigger feature (a real superatom
  // atom-type) this doesn't attempt.
  // -------------------------------------------------------------------

  { id: "methyl", label: "Methyl", ...build("A", [["A", "C1", CENTER_ANGLE, 1, "C"]]) },
  {
    id: "ethyl",
    label: "Ethyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
    ]),
  },
  {
    id: "n-propyl",
    label: "n-Propyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 1, "C"],
    ]),
  },
  {
    id: "n-butyl",
    label: "n-Butyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 1, "C"],
      ["C3", "C4", 30, 1, "C"],
    ]),
  },
  {
    id: "isopropyl",
    label: "Isopropyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", BRANCH_UP, 1, "C"],
      ["C1", "C3", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "isobutyl",
    label: "Isobutyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", 90, 1, "C"],
      ["C2", "C4", -30, 1, "C"],
    ]),
  },
  {
    id: "sec-butyl",
    label: "sec-Butyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", BRANCH_UP, 1, "C"],
      ["C1", "C3", BRANCH_DOWN, 1, "C"],
      ["C3", "C4", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "tert-butyl",
    label: "tert-Butyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", CENTER_ANGLE, 1, "C"],
      ["C1", "C3", BRANCH_UP, 1, "C"],
      ["C1", "C4", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "vinyl",
    label: "Vinyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 2, "C"],
    ]),
  },
  {
    id: "allyl",
    label: "Allyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 2, "C"],
    ]),
  },
  {
    id: "trifluoromethyl",
    label: "Trifluoromethyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "F1", CENTER_ANGLE, 1, "F"],
      ["C1", "F2", BRANCH_UP, 1, "F"],
      ["C1", "F3", BRANCH_DOWN, 1, "F"],
    ]),
  },
  {
    id: "trichloromethyl",
    label: "Trichloromethyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "Cl1", CENTER_ANGLE, 1, "Cl"],
      ["C1", "Cl2", BRANCH_UP, 1, "Cl"],
      ["C1", "Cl3", BRANCH_DOWN, 1, "Cl"],
    ]),
  },
  {
    id: "azide",
    label: "Azide",
    // R-N=N+=N-, the standard charge-separated resonance form, drawn
    // straight (all three N's on the same axis) since the real group is
    // near-linear.
    ...build("A", [
      ["A", "N1", CENTER_ANGLE, 1, "N"],
      ["N1", "N2", CENTER_ANGLE, 2, "N", 1],
      ["N2", "N3", CENTER_ANGLE, 2, "N", -1],
    ]),
  },
  {
    id: "acetyl",
    label: "Acetyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "C2", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "pivaloyl",
    label: "Pivaloyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "C2", CENTER_ANGLE, 1, "C"],
      ["C2", "C3", CENTER_ANGLE, 1, "C"],
      ["C2", "C4", BRANCH_UP, 1, "C"],
      ["C2", "C5", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "mesyl",
    label: "Mesyl",
    ...build("A", [
      ["A", "S1", CENTER_ANGLE, 1, "S"],
      ["S1", "O1", BRANCH_UP, 2, "O"],
      ["S1", "O2", BRANCH_DOWN, 2, "O"],
      ["S1", "C1", CENTER_ANGLE, 1, "C"],
    ]),
  },
  {
    id: "triflyl",
    label: "Triflyl",
    ...build("A", [
      ["A", "S1", CENTER_ANGLE, 1, "S"],
      ["S1", "O1", BRANCH_UP, 2, "O"],
      ["S1", "O2", BRANCH_DOWN, 2, "O"],
      ["S1", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "F1", CENTER_ANGLE, 1, "F"],
      ["C1", "F2", BRANCH_UP, 1, "F"],
      ["C1", "F3", BRANCH_DOWN, 1, "F"],
    ]),
  },
  {
    id: "tms",
    label: "TMS",
    ...build("A", [
      ["A", "Si1", CENTER_ANGLE, 1, "Si"],
      ["Si1", "C1", CENTER_ANGLE, 1, "C"],
      ["Si1", "C2", BRANCH_UP, 1, "C"],
      ["Si1", "C3", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "tbs",
    label: "TBS",
    ...build("A", [
      ["A", "Si1", CENTER_ANGLE, 1, "Si"],
      ["Si1", "C1", BRANCH_UP, 1, "C"],
      ["Si1", "C2", BRANCH_DOWN, 1, "C"],
      ["Si1", "C3", CENTER_ANGLE, 1, "C"],
      ["C3", "C4", CENTER_ANGLE, 1, "C"],
      ["C3", "C5", BRANCH_UP, 1, "C"],
      ["C3", "C6", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "boc",
    label: "Boc",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "O2", BRANCH_DOWN, 1, "O"],
      ["O2", "C2", BRANCH_DOWN, 1, "C"],
      ["C2", "C3", BRANCH_DOWN, 1, "C"],
      ["C2", "C4", CENTER_ANGLE, 1, "C"],
      ["C2", "C5", -120, 1, "C"],
    ]),
  },

  // Aromatic/cyclic abbreviations — everything above stays purely
  // acyclic (see build()'s own doc comment on why the plain walk is
  // enough for those); these few add ring6()'s closing bond on top.
  (() => {
    const ring = ring6("A", { x: 0, y: 0 }, "ph", true);
    return { id: "phenyl", label: "Phenyl", attachKey: "A", atoms: [{ key: "A", element: "C" as const, x: 0, y: 0 }, ...ring.atoms], bonds: ring.bonds };
  })(),
  (() => {
    const c1 = { x: BOND_LEN, y: 0 };
    const ring = ring6("C1", c1, "bn", true);
    return {
      id: "benzyl",
      label: "Benzyl",
      attachKey: "A",
      atoms: [{ key: "A", element: "C" as const, x: 0, y: 0 }, { key: "C1", element: "C" as const, x: c1.x, y: c1.y }, ...ring.atoms],
      bonds: [{ from: "A", to: "C1", order: 1 as const }, ...ring.bonds],
    };
  })(),
  (() => {
    const ring = ring6("A", { x: 0, y: 0 }, "cy", false);
    return { id: "cyclohexyl", label: "Cyclohexyl", attachKey: "A", atoms: [{ key: "A", element: "C" as const, x: 0, y: 0 }, ...ring.atoms], bonds: ring.bonds };
  })(),
  (() => {
    const c1 = { x: BOND_LEN, y: 0 };
    const o1 = { x: BOND_LEN + BOND_LEN * Math.cos((BRANCH_UP * Math.PI) / 180), y: BOND_LEN * Math.sin((BRANCH_UP * Math.PI) / 180) };
    const ring = ring6("C1", c1, "bz", true);
    return {
      id: "benzoyl",
      label: "Benzoyl",
      attachKey: "A",
      atoms: [
        { key: "A", element: "C" as const, x: 0, y: 0 },
        { key: "C1", element: "C" as const, x: c1.x, y: c1.y },
        { key: "O1", element: "O" as const, x: o1.x, y: o1.y },
        ...ring.atoms,
      ],
      bonds: [{ from: "A", to: "C1", order: 1 as const }, { from: "C1", to: "O1", order: 2 as const }, ...ring.bonds],
    };
  })(),
  (() => {
    // -C(=O)-O-CH2-Ph, built the same way as the "ester"/"Boc" templates
    // above — each atom placed by walking BOND_LEN out at an absolute
    // angle from the one before it — then handed off to ring6() once the
    // benzylic CH2 (C2) is placed.
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const c1 = { x: BOND_LEN, y: 0 };
    const o1 = { x: c1.x + BOND_LEN * Math.cos(rad(BRANCH_UP)), y: c1.y + BOND_LEN * Math.sin(rad(BRANCH_UP)) };
    const o2 = { x: c1.x + BOND_LEN * Math.cos(rad(BRANCH_DOWN)), y: c1.y + BOND_LEN * Math.sin(rad(BRANCH_DOWN)) };
    const c2 = { x: o2.x + BOND_LEN * Math.cos(rad(BRANCH_UP)), y: o2.y + BOND_LEN * Math.sin(rad(BRANCH_UP)) };
    const ring = ring6("C2", c2, "cbz", true);
    return {
      id: "cbz",
      label: "Cbz",
      attachKey: "A",
      atoms: [
        { key: "A", element: "C" as const, x: 0, y: 0 },
        { key: "C1", element: "C" as const, x: c1.x, y: c1.y },
        { key: "O1", element: "O" as const, x: o1.x, y: o1.y },
        { key: "O2", element: "O" as const, x: o2.x, y: o2.y },
        { key: "C2", element: "C" as const, x: c2.x, y: c2.y },
        ...ring.atoms,
      ],
      bonds: [
        { from: "A", to: "C1", order: 1 as const },
        { from: "C1", to: "O1", order: 2 as const },
        { from: "C1", to: "O2", order: 1 as const },
        { from: "O2", to: "C2", order: 1 as const },
        ...ring.bonds,
      ],
    };
  })(),
  (() => {
    // -SO2-C6H4-CH3 (para) — sulfonyl straight into the ring, then one
    // more methyl hung off ring6()'s reported paraKey.
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const s1 = { x: BOND_LEN, y: 0 };
    const o1 = { x: s1.x + BOND_LEN * Math.cos(rad(BRANCH_UP)), y: s1.y + BOND_LEN * Math.sin(rad(BRANCH_UP)) };
    const o2 = { x: s1.x + BOND_LEN * Math.cos(rad(BRANCH_DOWN)), y: s1.y + BOND_LEN * Math.sin(rad(BRANCH_DOWN)) };
    const ring = ring6("S1", s1, "ts", true);
    const paraPos = ring.atoms.find((a) => a.key === ring.paraKey)!;
    const methyl = { x: paraPos.x + BOND_LEN, y: paraPos.y };
    return {
      id: "tosyl",
      label: "Tosyl",
      attachKey: "A",
      atoms: [
        { key: "A", element: "C" as const, x: 0, y: 0 },
        { key: "S1", element: "S" as const, x: s1.x, y: s1.y },
        { key: "O1", element: "O" as const, x: o1.x, y: o1.y },
        { key: "O2", element: "O" as const, x: o2.x, y: o2.y },
        ...ring.atoms,
        { key: "tsMe", element: "C" as const, x: methyl.x, y: methyl.y },
      ],
      bonds: [
        { from: "A", to: "S1", order: 1 as const },
        { from: "S1", to: "O1", order: 2 as const },
        { from: "S1", to: "O2", order: 2 as const },
        ...ring.bonds,
        { from: ring.paraKey, to: "tsMe", order: 1 as const },
      ],
    };
  })(),
];
