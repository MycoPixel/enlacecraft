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

/**
 * A five-membered ring extending out from `fromKey` (which must already
 * be a placed atom on the local x-axis at `fromPos`) — the heteroaromatic
 * counterpart to ring6() above, needed for histidine's imidazole side
 * chain (and, via appendedRing() below, for tryptophan's fused indole).
 * Unlike ring6, the caller supplies each vertex's element and each edge's
 * bond order directly (`elements`/`orders`, both length 5, walked in ring
 * order starting from the ipso atom bonded to fromKey) since there's no
 * single aromatic/heteroatom convention that would fit every 5-ring this
 * file needs the way ring6's benzene-or-cyclohexane toggle does.
 *
 * Unlike ring6's ipso bond (see that function's own vertex-placement
 * comment — its external bond ends up shorter than BOND_LEN), this
 * places the ipso vertex a full BOND_LEN out from fromKey, matching every
 * other bond build() draws; the ring center sits one more ring-circumradius
 * further along +x from there.
 */
function ring5(
  fromKey: string,
  fromPos: { x: number; y: number },
  keyPrefix: string,
  elements: FunctionalGroupTemplate["atoms"][number]["element"][],
  orders: (1 | 2)[],
) {
  const R = BOND_LEN / (2 * Math.sin(Math.PI / 5));
  const ipso = { x: fromPos.x + BOND_LEN, y: fromPos.y };
  const cx = ipso.x + R;
  const cy = ipso.y;
  const key = (i: number) => `${keyPrefix}${i}`;
  const atoms: FunctionalGroupTemplate["atoms"] = [];
  const pos: { x: number; y: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const theta = ((180 - 72 * i) * Math.PI) / 180;
    const p = { x: cx + R * Math.cos(theta), y: cy + R * Math.sin(theta) };
    pos.push(p);
    atoms.push({ key: key(i), element: elements[i], x: p.x, y: p.y });
  }
  const bonds: FunctionalGroupTemplate["bonds"] = [{ from: fromKey, to: key(0), order: 1 }];
  for (let i = 0; i < 5; i++) bonds.push({ from: key(i), to: key((i + 1) % 5), order: orders[i] });
  return { atoms, bonds, pos, ipsoKey: key(0) };
}

function rotateAround(p: { x: number; y: number }, center: { x: number; y: number }, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad), y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad) };
}

/**
 * Fuses a new regular ring of `size` atoms (5 or 6) onto the edge between
 * two already-placed, adjacent ring atoms (`sharedAKey`/`sharedBKey`,
 * looked up in `existingPos`), growing away from `awayFromCenter` (the
 * existing ring's own center, so the new ring doesn't fold back onto it)
 * — the general version of the geometry tryptophan's indole needs to
 * append its benzo ring onto ring5()'s imidazole-shaped pentagon. Returns
 * only the newly-created (size - 2) atoms/bonds; the shared edge's bond
 * already exists from whichever call built the first ring, so this
 * doesn't duplicate it.
 */
function appendedRing(
  sharedAKey: string,
  sharedBKey: string,
  sharedAPos: { x: number; y: number },
  sharedBPos: { x: number; y: number },
  awayFromCenter: { x: number; y: number },
  keyPrefix: string,
  size: 5 | 6,
  elements: FunctionalGroupTemplate["atoms"][number]["element"][],
  // Bond order for each of the (size - 1) new edges, walked from
  // sharedAKey through the new atoms to sharedBKey (the shared edge's own
  // order was already fixed by whichever ring built it first).
  orders: (1 | 2)[],
) {
  const interior = 360 / size;
  const R = BOND_LEN / (2 * Math.sin((interior / 2) * (Math.PI / 180)));
  const apothem = R * Math.cos((interior / 2) * (Math.PI / 180));
  const mid = { x: (sharedAPos.x + sharedBPos.x) / 2, y: (sharedAPos.y + sharedBPos.y) / 2 };
  const away = { x: mid.x - awayFromCenter.x, y: mid.y - awayFromCenter.y };
  const awayLen = Math.hypot(away.x, away.y);
  const center = { x: mid.x + (away.x / awayLen) * apothem, y: mid.y + (away.y / awayLen) * apothem };
  // Whichever rotation sign lands on sharedBPos in one step is the "short
  // way" (the existing shared edge); the new vertices are generated going
  // the long way around, starting adjacent to sharedAKey.
  const plus = rotateAround(sharedAPos, center, interior);
  const longWaySign = Math.hypot(plus.x - sharedBPos.x, plus.y - sharedBPos.y) < 1e-6 ? -1 : 1;
  const key = (i: number) => `${keyPrefix}${i}`;
  const atoms: FunctionalGroupTemplate["atoms"] = [];
  const newKeys: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    const p = rotateAround(sharedAPos, center, longWaySign * interior * i);
    atoms.push({ key: key(i), element: elements[i - 1], x: p.x, y: p.y });
    newKeys.push(key(i));
  }
  const chain = [sharedAKey, ...newKeys, sharedBKey];
  const bonds: FunctionalGroupTemplate["bonds"] = [];
  for (let i = 0; i < chain.length - 1; i++) bonds.push({ from: chain[i], to: chain[i + 1], order: orders[i] });
  return { atoms, bonds };
}

export const FUNCTIONAL_GROUP_TEMPLATES: FunctionalGroupTemplate[] = [
  {
    id: "hydroxyl",
    label: "Hydroxyl",
    category: "common",
    ...build("A", [
      ["A", "O1", CENTER_ANGLE, 1, "O"],
    ]),
  },
  {
    id: "amine",
    label: "Amine",
    category: "common",
    ...build("A", [
      ["A", "N1", CENTER_ANGLE, 1, "N"],
    ]),
  },
  {
    id: "thiol",
    label: "Thiol",
    category: "common",
    ...build("A", [
      ["A", "S1", CENTER_ANGLE, 1, "S"],
    ]),
  },
  {
    id: "ether",
    label: "Ether",
    category: "common",
    ...build("A", [
      ["A", "O1", CENTER_ANGLE, 1, "O"],
      ["O1", "C2", BRANCH_UP, 1, "C"],
    ]),
  },
  {
    id: "carboxylic-acid",
    label: "Carboxylic acid",
    category: "common",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "O2", BRANCH_DOWN, 1, "O"],
    ]),
  },
  {
    id: "ester",
    label: "Ester",
    category: "common",
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
    category: "common",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "N1", BRANCH_DOWN, 1, "N"],
    ]),
  },
  {
    id: "ketone",
    label: "Ketone",
    category: "common",
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
    category: "common",
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
    category: "common",
    ...build("A", [
      // Linear: -C#N drawn straight out from the attachment point.
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "N1", CENTER_ANGLE, 3, "N"],
    ]),
  },
  {
    id: "nitro",
    label: "Nitro",
    category: "common",
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

  { id: "methyl", label: "Methyl", category: "alkyl", ...build("A", [["A", "C1", CENTER_ANGLE, 1, "C"]]) },
  {
    id: "ethyl",
    label: "Ethyl",
    category: "alkyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
    ]),
  },
  {
    id: "n-propyl",
    label: "n-Propyl",
    category: "alkyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 1, "C"],
    ]),
  },
  {
    id: "n-butyl",
    label: "n-Butyl",
    category: "alkyl",
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
    category: "alkyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", BRANCH_UP, 1, "C"],
      ["C1", "C3", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "isobutyl",
    label: "Isobutyl",
    category: "alkyl",
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
    category: "alkyl",
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
    category: "alkyl",
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
    category: "alkyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 2, "C"],
    ]),
  },
  {
    id: "allyl",
    label: "Allyl",
    category: "alkyl",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 2, "C"],
    ]),
  },
  {
    id: "trifluoromethyl",
    label: "Trifluoromethyl",
    category: "alkyl",
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
    category: "alkyl",
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
    category: "common",
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
    category: "protecting",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 2, "O"],
      ["C1", "C2", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "pivaloyl",
    label: "Pivaloyl",
    category: "protecting",
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
    category: "protecting",
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
    category: "protecting",
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
    category: "protecting",
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
    category: "protecting",
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
    category: "protecting",
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
    return { id: "phenyl", label: "Phenyl", category: "aromatic", attachKey: "A", atoms: [{ key: "A", element: "C" as const, x: 0, y: 0 }, ...ring.atoms], bonds: ring.bonds };
  })(),
  (() => {
    const c1 = { x: BOND_LEN, y: 0 };
    const ring = ring6("C1", c1, "bn", true);
    return {
      id: "benzyl",
      label: "Benzyl",
      category: "aromatic",
      attachKey: "A",
      atoms: [{ key: "A", element: "C" as const, x: 0, y: 0 }, { key: "C1", element: "C" as const, x: c1.x, y: c1.y }, ...ring.atoms],
      bonds: [{ from: "A", to: "C1", order: 1 as const }, ...ring.bonds],
    };
  })(),
  (() => {
    const ring = ring6("A", { x: 0, y: 0 }, "cy", false);
    return { id: "cyclohexyl", label: "Cyclohexyl", category: "aromatic", attachKey: "A", atoms: [{ key: "A", element: "C" as const, x: 0, y: 0 }, ...ring.atoms], bonds: ring.bonds };
  })(),
  (() => {
    const c1 = { x: BOND_LEN, y: 0 };
    const o1 = { x: BOND_LEN + BOND_LEN * Math.cos((BRANCH_UP * Math.PI) / 180), y: BOND_LEN * Math.sin((BRANCH_UP * Math.PI) / 180) };
    const ring = ring6("C1", c1, "bz", true);
    return {
      id: "benzoyl",
      label: "Benzoyl",
      category: "aromatic",
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
      category: "protecting",
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
      category: "protecting",
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

  // -------------------------------------------------------------------
  // Amino acid side chains (the standard residues' R groups, attached to
  // whatever backbone carbon the person has already drawn) — same
  // build()/ring6() conventions as everything above, plus ring5() and
  // appendedRing() for histidine's imidazole and tryptophan's fused
  // indole. Alanine, valine, leucine, isoleucine, and phenylalanine's
  // side chains are chemically identical to the generic methyl/
  // isopropyl/isobutyl/sec-butyl/benzyl groups above, so they aren't
  // duplicated here — use those. Glycine's side chain is just H, i.e.
  // nothing to attach — leave the backbone carbon as-is. Proline isn't
  // included: its ring closes back onto the backbone nitrogen rather
  // than branching off a single attach point, which doesn't fit this
  // one-point-of-attachment convention at all.
  // -------------------------------------------------------------------

  {
    id: "ser-sidechain",
    label: "Serine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", CENTER_ANGLE, 1, "O"],
    ]),
  },
  {
    id: "cys-sidechain",
    label: "Cysteine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "S1", CENTER_ANGLE, 1, "S"],
    ]),
  },
  {
    id: "thr-sidechain",
    label: "Threonine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "O1", BRANCH_UP, 1, "O"],
      ["C1", "C2", BRANCH_DOWN, 1, "C"],
    ]),
  },
  {
    id: "met-sidechain",
    label: "Methionine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "S1", -30, 1, "S"],
      ["S1", "C3", 30, 1, "C"],
    ]),
  },
  {
    id: "asp-sidechain",
    label: "Aspartate side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "O1", BRANCH_UP, 2, "O"],
      ["C2", "O2", BRANCH_DOWN, 1, "O"],
    ]),
  },
  {
    id: "glu-sidechain",
    label: "Glutamate side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 1, "C"],
      ["C3", "O1", BRANCH_UP, 2, "O"],
      ["C3", "O2", BRANCH_DOWN, 1, "O"],
    ]),
  },
  {
    id: "asn-sidechain",
    label: "Asparagine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "O1", BRANCH_UP, 2, "O"],
      ["C2", "N1", BRANCH_DOWN, 1, "N"],
    ]),
  },
  {
    id: "gln-sidechain",
    label: "Glutamine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 1, "C"],
      ["C3", "O1", BRANCH_UP, 2, "O"],
      ["C3", "N1", BRANCH_DOWN, 1, "N"],
    ]),
  },
  {
    id: "lys-sidechain",
    label: "Lysine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 1, "C"],
      ["C3", "C4", 30, 1, "C"],
      ["C4", "N1", -30, 1, "N"],
    ]),
  },
  {
    id: "arg-sidechain",
    label: "Arginine side chain",
    category: "aminoAcid",
    ...build("A", [
      ["A", "C1", CENTER_ANGLE, 1, "C"],
      ["C1", "C2", 30, 1, "C"],
      ["C2", "C3", -30, 1, "C"],
      ["C3", "N1", 30, 1, "N"],
      ["N1", "C4", -30, 1, "C"],
      ["C4", "N2", BRANCH_UP, 2, "N"],
      ["C4", "N3", BRANCH_DOWN, 1, "N"],
    ]),
  },
  (() => {
    // -CH2-(imidazol-4-yl): ring5()'s generic pentagon, walked ipso(C,
    // attach) = C(H) [double] - N(H) [single] - C [single] = N [double] -
    // closing back to ipso [single], matching real imidazole's Kekulé
    // structure (verified against RDKit's own Kekulization while authoring
    // this).
    const c1 = { x: BOND_LEN, y: 0 };
    const ring = ring5("C1", c1, "his", ["C", "C", "N", "C", "N"], [2, 1, 1, 2, 1]);
    return {
      id: "his-sidechain",
      label: "Histidine side chain",
      category: "aminoAcid",
      attachKey: "A",
      atoms: [
        { key: "A", element: "C" as const, x: 0, y: 0 },
        { key: "C1", element: "C" as const, x: c1.x, y: c1.y },
        ...ring.atoms,
      ],
      bonds: [{ from: "A", to: "C1", order: 1 as const }, ...ring.bonds],
    };
  })(),
  (() => {
    // -CH2-C6H4-OH (para) — same ring6()-plus-paraKey-substituent pattern
    // as tosyl's methyl above, with a hydroxyl instead.
    const c1 = { x: BOND_LEN, y: 0 };
    const ring = ring6("C1", c1, "tyr", true);
    const paraPos = ring.atoms.find((a) => a.key === ring.paraKey)!;
    const oh = { x: paraPos.x + BOND_LEN, y: paraPos.y };
    return {
      id: "tyr-sidechain",
      label: "Tyrosine side chain",
      category: "aminoAcid",
      attachKey: "A",
      atoms: [
        { key: "A", element: "C" as const, x: 0, y: 0 },
        { key: "C1", element: "C" as const, x: c1.x, y: c1.y },
        ...ring.atoms,
        { key: "O1", element: "O" as const, x: oh.x, y: oh.y },
      ],
      bonds: [
        { from: "A", to: "C1", order: 1 as const },
        ...ring.bonds,
        { from: ring.paraKey, to: "O1", order: 1 as const },
      ],
    };
  })(),
  (() => {
    // -CH2-(indol-3-yl): ring5() builds the pyrrole ring (ipso = indole's
    // C3), then appendedRing() fuses the benzo ring onto its far edge —
    // same fused-ring technique naphthalene's own placement uses
    // (engine/ringPlacement.ts's placeNaphthalene), generalized to a
    // hexagon-on-pentagon instead of hexagon-on-hexagon. Bond orders
    // again verified against RDKit's Kekulization of indole while
    // authoring this.
    const c1 = { x: BOND_LEN, y: 0 };
    const pyrrole = ring5("C1", c1, "trp", ["C", "C", "N", "C", "C"], [2, 1, 1, 1, 1]);
    const [v0, v1, v2, v3, v4] = pyrrole.pos;
    const pentCenter = {
      x: (v0.x + v1.x + v2.x + v3.x + v4.x) / 5,
      y: (v0.y + v1.y + v2.y + v3.y + v4.y) / 5,
    };
    const benzo = appendedRing("trp3", "trp4", v3, v4, pentCenter, "trpb", 6, ["C", "C", "C", "C"], [2, 1, 2, 1, 2]);
    return {
      id: "trp-sidechain",
      label: "Tryptophan side chain",
      category: "aminoAcid",
      attachKey: "A",
      atoms: [
        { key: "A", element: "C" as const, x: 0, y: 0 },
        { key: "C1", element: "C" as const, x: c1.x, y: c1.y },
        ...pyrrole.atoms,
        ...benzo.atoms,
      ],
      bonds: [{ from: "A", to: "C1", order: 1 as const }, ...pyrrole.bonds, ...benzo.bonds],
    };
  })(),
];
