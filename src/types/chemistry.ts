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

export type BondStereo = "none" | "wedge" | "dash";

export interface Atom {
  id: string;
  x: number;
  y: number;
  element: Element;
  charge: number;
  chargeOffsetX?: number;
  chargeOffsetY?: number;
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
  | "atom"
  | "ring"
  | "charge-plus"
  | "charge-minus"
  | "text"
  | "arrow"
  | "bracket";

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
}

export type Theme = "light" | "dark";

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
}

export type BracketVariant = "paren" | "square" | "curly";
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
