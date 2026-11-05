import type { Element, HapticBond, Molecule } from "../types/chemistry";
import type { StructureTemplate } from "./structureTemplates";

/**
 * Organometallic templates for the TemplatePalette's "organometallics"
 * category: the three prototypical metallocenes (ferrocene, cobaltocene,
 * nickelocene) and the ruthenium(II) acetate paddlewheel. All coordinates
 * and connectivity are authored here from first principles (regular-polygon
 * trigonometry at the model's BOND_LEN = 42 world-px scale — see the
 * per-builder comments for the derivations); nothing is copied from any
 * external template library.
 *
 * Conventions match the existing "cyclopentadienyl" ligand template in
 * structureTemplates.ts:
 *  - Cp⁻ rings are drawn as regular pentagons with side length 42
 *    (circumradius 35.73), alternating Kekulé bond orders 1-2-1-2-1, and
 *    the single formal −1 charge sitting on the carbon between the two
 *    single bonds — that carbon's used valence (2) then sits one below its
 *    charge-adjusted ceiling (3), and every other ring carbon carries
 *    exactly one implicit H, so each ring computes to C5H5⁻.
 *  - η⁵ metal-to-ring bonds are HapticBonds (metal atom → live ring
 *    centroid), not ordinary bonds: the ring keeps its own normal C–C
 *    bonds, the metal picks up no covalent valence, and
 *    findConnectedFragments folds haptic adjacency into connectivity so a
 *    metallocene still reads as one fragment (see HapticBond's doc comment
 *    in types/chemistry.ts). Rendering (dashed line to the centroid with
 *    an η5 label) is handled by HapticBondView.
 *  - Transition metals have no VALENCE table entry, so implicit-H and
 *    over-valence logic deliberately never second-guesses their bonding —
 *    the paddlewheel's five-coordinate Ru needs no ignoreValence flag.
 *
 * Hydrogens stay implicit everywhere except where a Newman-style explicit
 * atom is unavoidable (none here): methyl groups are plain carbons whose
 * three hydrogens come from implicit-H math. Every template's bounding-box
 * centre sits at (0, 0); ids are unique within a template only
 * (insertMolecule remaps at insertion).
 */

/** Regular-pentagon circumradius for side length 42 (BOND_LEN — not
 * imported: model/constants.ts imports template data files like this one,
 * and a top-level runtime constant would make the edge a cycle):
 * s = 2·R·sin(π/5)  →  R = 42 / (2·sin 36°) = 35.73. Same radius (and the
 * same -18° vertex phase) as the existing cyclopentadienyl ligand template,
 * so a Cp ring inserted from either palette is visually identical. */
const CP_RADIUS = 35.73;

/** deg → (x, y) step in the canvas's y-down convention. */
function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
}

interface CpRing {
  /** "c1".."c5" style atom records, ring-walk order starting at the
   * rotation angle. */
  atoms: Molecule["atoms"];
  /** Five ring bonds with the alternating 1-2-1-2-1 Kekulé pattern; bond
   * "p0" connects atom 0→1 (order 1), so atom 0 is the one between the
   * two single bonds and carries the ring's −1 charge. */
  bonds: Molecule["bonds"];
  /** Ring atom ids in walk order — ready to become a HapticBond's
   * ringAtomIds (η⁵ needs the whole ring, not a bond). */
  atomIds: string[];
}

/**
 * Builds one cyclopentadienyl ring. Atom keys are prefixed (`cp1-c3` ...)
 * so both rings of a metallocene can live in one atom record without
 * colliding. `rotationDeg` phases the vertex walk (0 = first vertex
 * straight up); staggering the two rings of a metallocene by 36° gives the
 * conventional staggered (D5d) sandwich drawing — ferrocene's ground-state
 * conformation.
 */
function cpRing(prefix: string, cx: number, cy: number, rotationDeg: number): CpRing {
  const atoms: Molecule["atoms"] = {};
  const atomIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = `${prefix}c${i + 1}`;
    const offset = polar(rotationDeg + i * 72 - 90, CP_RADIUS);
    // Atom 0 (i = 0) is the anionic carbon; see CpRing.bonds above.
    atoms[id] = { id, x: cx + offset.x, y: cy + offset.y, element: "C", charge: i === 0 ? -1 : 0 };
    atomIds.push(id);
  }
  const orders = [1, 2, 1, 2, 1] as const;
  const bonds: Molecule["bonds"] = {};
  for (let i = 0; i < 5; i++) {
    const id = `${prefix}b${i + 1}`;
    bonds[id] = {
      id,
      a1: atomIds[i],
      a2: atomIds[(i + 1) % 5],
      order: orders[i],
      stereo: "none",
      doubleSide: "auto",
    };
  }
  return { atoms, bonds, atomIds };
}

/** Vertical distance from the metal to each Cp ring centroid. Ring
 * vertices reach CP_RADIUS·sin54° ≈ 28.9 px toward the middle, so 63 px
 * keeps a ~68 px clear channel around the metal while the η⁵ dashed lines
 * stay short enough to read as bonds. */
const METALLOCENE_RING_OFFSET = 63;

/**
 * A staggered metallocene: M(C5H5)2 with the metal centred between two
 * parallel Cp rings, the rear ring rotated 36° so the sandwich reads
 * staggered at a glance. Connectivity per the file header: two C5H5⁻
 * rings + one metal atom joined by two η⁵ HapticBonds (no ordinary
 * metal–carbon bonds).
 */
function metallocene(id: string, label: string, metal: Element): StructureTemplate {
  const top = cpRing(`${id}-t`, 0, -METALLOCENE_RING_OFFSET, 0);
  const bottom = cpRing(`${id}-b`, 0, METALLOCENE_RING_OFFSET, 36);

  const atoms: Molecule["atoms"] = {
    m: { id: "m", x: 0, y: 0, element: metal, charge: 0 },
    ...top.atoms,
    ...bottom.atoms,
  };
  const bonds: Molecule["bonds"] = { ...top.bonds, ...bottom.bonds };
  const hapticBonds: Record<string, HapticBond> = {
    [`${id}-h1`]: { id: `${id}-h1`, metalAtomId: "m", ringAtomIds: top.atomIds },
    [`${id}-h2`]: { id: `${id}-h2`, metalAtomId: "m", ringAtomIds: bottom.atomIds },
  };

  return {
    id,
    label,
    category: "organometallics",
    molecule: { atoms, bonds, hapticBonds, aromaticRingDisplays: {} },
    annotations: [],
  };
}

/**
 * Ruthenium(II) acetate paddlewheel, [Ru2(O2CCH3)4] — the classic
 * lantern/paddlewheel core drawn in the conventional side view:
 *
 *   - The Ru–Ru axis is vertical (52 px ≈ 1.25 bonds — the plausibility
 *     window of structureTemplates.test.ts is 0.7–1.35 × BOND_LEN, and the
 *     52 px here is what gives the eight bridging O atoms enough room).
 *   - The four acetates sit one per quadrant. Each acetate's two oxygens
 *     lie in a vertical column at x = ±38: the OUTER oxygen of each pair
 *     reaches up/down to the near ruthenium, the INNER oxygen reaches
 *     across to the far ruthenium — so every acetate is a genuine μ₂
 *     bridge (one O on each metal) and each Ru collects exactly four
 *     O neighbours, the real coordination of the dimer.
 *   - The drawing shows one C=O and one C–O⁻ per acetate (the classic
 *     carboxylate depiction), and BOTH oxygens donate to the metals as
 *     dative O→Ru bonds (Bond.dative — the arrowhead into the metal is
 *     applied automatically by the renderer, same as the dative tool).
 *     That is what keeps every valence honest at once: a bridging O drawn
 *     with a plain covalent C–O *and* a covalent Ru contact would be
 *     tri-valent with a phantom implicit H (implicitH fills the unused
 *     slot — see model/valence.ts), but a dative donation costs the
 *     donor no valence while the formal −1 closes it, so each O is
 *     exactly its carboxylate self. Formal charges balance the way the
 *     real salt does: four O⁻ against two Ru(II) → net zero, and the
 *     formula computes cleanly to C8H12O8Ru2 with twelve methyl H.
 *
 * Column geometry: with Ru atoms at y = ±26 and O columns at |x| = 38,
 * the outer O's sit 42.0 px from their near Ru and the inner O's 53.7 px
 * from their far Ru (hypot(38, 38)) — all inside the 29.4–56.7 px
 * plausibility window. Inner-column O's are 24 px apart vertically, enough
 * separation for the "O" labels.
 */
function rutheniumAcetatePaddlewheel(): StructureTemplate {
  const atoms: Molecule["atoms"] = {
    ru1: { id: "ru1", x: 0, y: -26, element: "Ru", charge: 2 },
    ru2: { id: "ru2", x: 0, y: 26, element: "Ru", charge: 2 },
  };
  const bonds: Molecule["bonds"] = {
    "ru-ru": { id: "ru-ru", a1: "ru1", a2: "ru2", order: 1, stereo: "none", doubleSide: "auto" },
  };

  // One entry per acetate: which x-column it occupies (sign) and which
  // quadrant (upper = the pair whose outer O bonds ru1).
  for (const [name, sx, upper] of [
    ["nw", -1, true],
    ["sw", -1, false],
    ["ne", 1, true],
    ["se", 1, false],
  ] as const) {
    const outerY = upper ? -44 : 44;
    const innerY = upper ? -12 : 12;
    const cy = upper ? -28 : 28;
    const oOuter = `o-${name}-outer`;
    const oInner = `o-${name}-inner`;
    const carboxyl = `c-${name}`;
    const methyl = `me-${name}`;

    atoms[oOuter] = { id: oOuter, x: 38 * sx, y: outerY, element: "O", charge: 0 };
    atoms[oInner] = { id: oInner, x: 38 * sx, y: innerY, element: "O", charge: -1 };
    atoms[carboxyl] = { id: carboxyl, x: 64 * sx, y: cy, element: "C", charge: 0 };
    atoms[methyl] = { id: methyl, x: 98 * sx, y: cy, element: "C", charge: 0 };

    const bond = (id: string, a1: string, a2: string, order: 1 | 2, dative = false) => {
      bonds[id] = { id, a1, a2, order, stereo: "none", doubleSide: "auto", dative };
    };
    // The outer O is the carbonyl O; each O donates to one Ru (near for
    // the outer, across the axis for the inner) — see the dative comment
    // in the function doc above.
    bond(`b-${name}-o1`, carboxyl, oOuter, 2);
    bond(`b-${name}-o2`, carboxyl, oInner, 1);
    bond(`b-${name}-me`, carboxyl, methyl, 1);
    bond(`b-${name}-ru-near`, oOuter, upper ? "ru1" : "ru2", 1, true);
    bond(`b-${name}-ru-far`, oInner, upper ? "ru2" : "ru1", 1, true);
  }

  return {
    id: "ru2-acetate-paddlewheel",
    label: "Ruthenium(II) acetate paddlewheel",
    category: "organometallics",
    molecule: { atoms, bonds, hapticBonds: {}, aromaticRingDisplays: {} },
    annotations: [],
  };
}

/**
 * The organometallic set re-exported into STRUCTURE_TEMPLATES by
 * model/structureTemplates.ts. Ferrocene (Fe), cobaltocene (Co) and
 * nickelocene (Ni) are the canonical 18/19/20-electron sandwiches; the
 * Ru(II) acetate paddlewheel is the standard example of a metal–metal
 * quadruple-bond family drawn with plain bridging contacts.
 */
export const ORGANOMETALLIC_TEMPLATES: StructureTemplate[] = [
  metallocene("ferrocene", "Ferrocene", "Fe"),
  metallocene("cobaltocene", "Cobaltocene", "Co"),
  metallocene("nickelocene", "Nickelocene", "Ni"),
  rutheniumAcetatePaddlewheel(),
];
