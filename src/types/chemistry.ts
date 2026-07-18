/**
 * Core domain types for the molecule editor.
 * Keeping these separate from React/UI code means the chemical model
 * can be reused, tested, or ported (e.g. to a Node script) independently.
 */

export type Element =
  | "C" | "N" | "O" | "S" | "P"
  | "F" | "Cl" | "Br" | "I"
  | "H" | "B" | "Si";

export type BondOrder = 1 | 2 | 3;

export type BondStereo = "none" | "wedge" | "dash" | "wavy";

export interface Atom {
  id: string;
  x: number;
  y: number;
  element: Element;
  charge: number;
  chargeOffsetX?: number;
  chargeOffsetY?: number;
  /**
   * Number of lone-pair dot-pairs shown around the atom (0-4), cycled by
   * the lone-pair tool. Purely a visual annotation for mechanism/structure
   * clarity — it does not feed into implicit-hydrogen or valence math,
   * which is still driven by element + charge + bond orders as before, so
   * marking lone pairs can never change the computed formula/MW/H-count.
   */
  lonePairs?: number;
  lonePairsOffsetX?: number;
  lonePairsOffsetY?: number;
  /**
   * Whether a single unpaired-electron dot is shown (radical center),
   * toggled by the radical tool. Same purely-visual status as lonePairs.
   */
  radical?: boolean;
  radicalOffsetX?: number;
  radicalOffsetY?: number;
  /**
   * Abbreviated-group id (see ABBREVIATED_GROUPS), when this vertex is a
   * shorthand substituent ("Ph", "Boc", ...) rather than a real element.
   * `element` is still set (to "C") as a bonding-model placeholder — it's
   * `group` that actually drives the label, formula/MW contribution, and
   * skips implicit-H math entirely (see model/valence.ts).
   */
  group?: string;
  /** Mass number (e.g. 2 for deuterium, 13 for carbon-13) when this atom is
   * isotope-labeled; absent means the standard/most-abundant isotope. Purely
   * label + MW — see model/valence.ts and STANDARD_MASS_NUMBER. */
  isotope?: number;
  /**
   * A manually-assigned R/S descriptor shown next to the atom. This is a
   * label the user asserts, not a computed CIP assignment — actually
   * deriving R/S from geometry requires full CIP priority rules (recursive
   * substituent comparison, duplicate-atom handling for double/aromatic
   * bonds, etc.), which is a substantial undertaking on its own and too
   * easy to get subtly wrong in ways that would silently mislabel a
   * structure. Letting the user assert the label directly (as many
   * teaching-oriented drawing tools do) is the honest scope here.
   */
  stereoLabel?: "R" | "S";
  stereoLabelOffsetX?: number;
  stereoLabelOffsetY?: number;
}

/**
 * For a double bond, which side the second line is drawn on:
 *  - "auto" (the default): automatically resolved from the surrounding
 *    structure — the second line is drawn toward whichever side the bonded
 *    atoms' other neighbors sit on (e.g. the interior of a ring). Re-evaluated
 *    live as the molecule changes.
 *  - "center": symmetric, a line offset to each side of the atom-atom axis
 *  - "left" / "right": explicit override — the primary line sits exactly on
 *    the atom-atom axis and the second line is offset to just one side.
 * Irrelevant for order !== 2.
 */
export type DoubleBondSide = "auto" | "center" | "left" | "right";

export interface Bond {
  id: string;
  a1: string; // Atom id
  a2: string; // Atom id
  order: BondOrder;
  stereo: BondStereo;
  doubleSide: DoubleBondSide;
}

/** Live, uncommitted preview of a bond being dragged out from an atom. */
export interface BondPreview {
  from: string; // Atom id the bond is being dragged from
  to: Point; // Current (possibly snapped) endpoint
  targetAtomId: string | null; // Set when the drag is hovering an existing atom
}

/**
 * Live, uncommitted preview of a carbon chain being dragged out with the
 * chain tool — see engine/chainPlacement.ts. `from` is the existing atom
 * the chain grows from, or null if the press started on empty canvas (in
 * which case a fresh anchor atom is what `anchor` previews and what
 * `points` continues from). Only shown once the drag has grown at least
 * one bonded atom — a plain click with no real drag just drops a single
 * unbonded carbon at `anchor` with no preview needed first.
 */
export interface ChainPreview {
  from: string | null;
  anchor: Point; // Position the chain's first bond is drawn from
  points: Point[]; // World-space positions of each new bonded atom, in order
}

/**
 * How a new ring attaches to what's already on the canvas — shared by the
 * real placement (engine/ringPlacement.ts's placeRing) and its live hover
 * preview, so the preview always matches exactly what gets placed:
 * - "none": dropped centered at a point on empty canvas.
 * - "atom": fused through a single existing atom, extending away from its
 *   existing bonds.
 * - "bond": fused directly onto an existing bond, which becomes one edge
 *   of the new ring (both its atoms are reused, unmoved).
 */
export type RingAttachment =
  | { type: "none" }
  | { type: "atom"; atomId: string }
  | { type: "bond"; a1: string; a2: string };

export interface Molecule {
  atoms: Record<string, Atom>;
  bonds: Record<string, Bond>;
}

export interface Point {
  x: number;
  y: number;
}

export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

export type ToolId =
  | "select"
  | "pan"
  | "erase"
  | "bond-1"
  | "bond-2"
  | "bond-3"
  | "wedge"
  | "dash"
  | "wavy"
  | "atom"
  | "chain"
  | "ring"
  | "functional-group"
  | "charge-plus"
  | "charge-minus"
  | "lone-pair"
  | "radical"
  | "isotope"
  | "stereo-label"
  | "text"
  | "arrow"
  | "bracket"
  | "plus";

/** Live, uncommitted rectangle-selection ("marquee") drag, in world coordinates. */
export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RingTemplate {
  id: string;
  label: string;
  sides: number;
  aromatic: boolean;
  /**
   * Element overrides for specific ring vertex positions (0-indexed,
   * walking the ring in placement order). Omitted positions default to
   * Carbon. When fusing onto an existing atom (position 0 is that atom),
   * position 0's override is skipped rather than mutating the existing
   * atom — see placeRing.
   */
  heteroatoms?: { position: number; element: Element }[];
  /**
   * Explicit order for ring bond i (connecting vertex i to vertex
   * (i+1)%sides), overriding the generic "every other bond is a double
   * bond" heuristic used for plain carbocycles. Needed for heteroaromatic
   * rings (furan, pyrrole, imidazole, ...) whose double-bond pattern isn't
   * just alternation starting at 0.
   */
  bondOrders?: BondOrder[];
  /**
   * Marks a template that isn't a single point-symmetric polygon (e.g.
   * naphthalene's two fused hexagons) and therefore can't use the generic
   * sides/heteroatoms/bondOrders geometry in placeRing — it's placed by its
   * own dedicated function instead (see engine/ringPlacement.ts) and gets
   * its own picker icon (see Sidebar/RingPicker.tsx) rather than the
   * generic MiniRing polygon.
   */
  fused?: boolean;
}

/** One atom in a FunctionalGroupTemplate's local layout — see that type's
 * doc comment for the coordinate convention. */
export interface FunctionalGroupAtom {
  /** Local id, unique within this template only (freely reused across
   * different templates) — referenced by FunctionalGroupBond.from/to and
   * by the template's own attachKey. */
  key: string;
  element: Element;
  x: number;
  y: number;
  /** Formal charge, for groups that need one (e.g. nitro's N+/O-).
   * Omitted (0) for everything else. */
  charge?: number;
}

export interface FunctionalGroupBond {
  from: string;
  to: string;
  order: BondOrder;
}

/**
 * A pre-made functional group (carboxylic acid, ketone, amine, ...)
 * insertable via the sidebar's functional-group tool, attached through a
 * single point — either fused onto an existing atom (extending away from
 * its existing bonds, the same convention as a single-ring RingTemplate's
 * atom attachment) or dropped centered on an empty-canvas click.
 *
 * Coordinate convention: `attachKey` names the local atom that plays the
 * role of the attachment point. Local coordinates are otherwise free-form
 * (drawn however reads clearly at BOND_LEN scale), but by convention
 * `attachKey` sits at local (0, 0) and the group extends toward +x (i.e.
 * its own bonded neighbor(s) have positive local x) — placeFunctionalGroup
 * figures out the real-world rotation from that, mirroring how
 * engine/ringPlacement.ts orients a ring off an attach atom.
 *
 * When attaching onto an existing atom, that atom's own element/identity
 * is left untouched (attachKey is a template-only placeholder for wherever
 * the attachment lands) — same reasoning as RingTemplate.heteroatoms'
 * "don't overwrite an existing atom" rule.
 */
export interface FunctionalGroupTemplate {
  id: string;
  label: string;
  atoms: FunctionalGroupAtom[];
  bonds: FunctionalGroupBond[];
  attachKey: string;
}

export type FunctionalGroupAttachment = { type: "none" } | { type: "atom"; atomId: string };

export type Theme = "light" | "dark";

/**
 * The drawing canvas's own background — independent of the light/dark app
 * theme, since a plain white canvas is what most people want for
 * screenshots regardless of which theme they're editing in. "theme"
 * restores the normal themed background (with its grid-dot pattern).
 */
export type CanvasBackground = "white" | "theme";

/**
 * Reaction-arrow variants. Rendered by ArrowAnnotationView; the marker ids
 * referenced there must stay in sync with these names.
 *  - "forward": a single straight arrow, A -> B
 *  - "equilibrium": two stacked full arrows pointing opposite directions
 *  - "resonance": a double-headed arrow (<->), for resonance structures
 *  - "curved" / "curvedReverse": a single curved arrow bulging to one side
 *    or the other (e.g. for mechanism/electron-pushing style flow). Bulge
 *    amount is user-adjustable via `curvature` (see ArrowAnnotation).
 */
export type ArrowVariant = "forward" | "equilibrium" | "resonance" | "curved" | "curvedReverse";

/** Full-arrowhead (electron pair) size. Doesn't apply to the fishhook
 * (single-electron) style, which only ever comes in one size. */
export type ArrowHeadSize = "small" | "medium" | "large";

export interface ArrowAnnotation {
  id: string;
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  variant: ArrowVariant;
  /**
   * Perpendicular bulge distance (world/pixel units) for "curved" and
   * "curvedReverse" variants, adjustable by dragging the curve's control
   * handle. Ignored by the other variants. Optional for backward
   * compatibility with annotations saved before this field existed — a
   * sensible default (proportional to arrow length) is used when absent.
   */
  curvature?: number;
  /**
   * Arrowhead style: "full" (default, both barbs — a bonding electron
   * *pair* moving) or "single" (one barb only, a "fishhook" — a *single*
   * electron moving, as in radical/homolytic mechanisms). Optional for
   * backward compatibility; absent means "full".
   */
  barb?: "full" | "single";
  /**
   * Full-arrowhead size — small/medium/large. Only meaningful when `barb`
   * is "full" (or absent, which also means "full"); ignored for fishhooks.
   * Optional for backward compatibility; absent means "medium", which is
   * also the only size that existed before this field did, so old
   * annotations render identically to how they always did.
   */
  headSize?: ArrowHeadSize;
}

export type BracketVariant = "paren" | "square";
/** Which way the glyph opens: "open" renders ( [ { , "close" renders ) ] } */
export type BracketFacing = "open" | "close";

/** A single resizable bracket glyph (place one "open" and one "close" to enclose a fragment). */
export interface BracketAnnotation {
  id: string;
  kind: "bracket";
  x: number;
  y: number;
  width: number;
  height: number;
  variant: BracketVariant;
  facing: BracketFacing;
}

/**
 * A draggable, richly-formatted text box for reaction conditions, labels,
 * etc. `html` holds a small safe subset of inline markup (b, i, sub, sup,
 * span with inline font-size/color) produced by the annotation format
 * toolbar. `height` is kept in sync with the rendered content (see
 * TextAnnotationView) purely so the surrounding <foreignObject> is sized
 * correctly and so hit-testing/selection outlines match the visible box.
 */
export interface TextAnnotation {
  id: string;
  kind: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  html: string;
  fontSize: number;
}

export type Annotation = ArrowAnnotation | TextAnnotation | BracketAnnotation;

/** Live, uncommitted preview of an arrow being dragged out on the canvas. */
export interface ArrowPreview {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
