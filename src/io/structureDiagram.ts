import type { Molecule } from "../types/chemistry";
import { totalHydrogenCount } from "../model/valence";
import { addExplicitHydrogens } from "../engine/explicitHydrogens";

/**
 * Which atoms and bonds a read-only structure diagram draws, and how it is
 * fitted to the box it has been given.
 *
 * This was extracted out of the NMR report's diagram module because nothing in
 * here is NMR-specific: the IR report draws the same molecule for the same
 * reasons, and copying ~200 lines of layout and hydrogen-handling arithmetic
 * into a second module is how two copies of a subtle fitting rule end up
 * disagreeing. Only the parts that genuinely reason about predictions - the
 * SMILES atom-index mapping and the shift badges - stayed behind in
 * nmrReportDiagram.ts, which re-exports everything here so no NMR caller
 * changed.
 *
 * The filtering rules, which are what most of this module is:
 *
 * - EXPLICIT HYDROGEN IS OPTIONAL. A structure drawn with the canvas's "Show
 *   Hydrogens" has an "H" atom attached to every carbon, and drawing all of
 *   them buries the heavy-atom skeleton any annotation is anchored to. Worse,
 *   their labels ("H2") sit next to annotations belonging to the heavy atom
 *   next to them, which is genuinely confusing to read. So they default to
 *   hidden.
 * - IMPLICIT HYDROGEN IS REPORTED, NOT DRAWN. This is the distinction that
 *   matters in practice: a structure is normally drawn SKELETAL, so it has no
 *   explicit H atoms at all and its only record of hydrogens is the implicit
 *   valence. Filtering alone therefore does nothing visible for most
 *   structures - the H toggle also adds that count to the label ("C1" ->
 *   "C1H3"), which is what the reader is actually after. See
 *   hydrogenSuffixForLabel.
 * - BONDS FOLLOW THEIR ATOMS. A bond to a hidden hydrogen is dropped with it,
 *   since a line that stops in empty space reads as a broken drawing rather
 *   than as a filtered element.
 */

/**
 * The heavy atom an explicit hydrogen is attached to, or null if there isn't
 * one.
 *
 * Callers that report a per-heavy-atom quantity (the NMR report shows one 1H
 * shift covering all the protons on a carbon) need this, because a drawn "H"
 * vertex has no value of its own and must borrow its parent's.
 *
 * Null rather than a guess for the awkward cases - an unbonded hydrogen, or one
 * bridged between two heavy atoms. A hydrogen in a bridging position is not a
 * proton anybody can assign anything to, and inventing a parent there would
 * print a confident number that belongs to a different atom.
 */
export function hydrogenParent(molecule: Molecule, atomId: string): string | null {
  const atom = molecule.atoms[atomId];
  if (!atom || atom.element !== "H") return null;
  const parents: string[] = [];
  for (const bond of Object.values(molecule.bonds)) {
    if (bond.a1 === atomId) parents.push(bond.a2);
    else if (bond.a2 === atomId) parents.push(bond.a1);
  }
  // Exactly one heavy neighbour is a normal C-H. Anything else (none, or a
  // bridge) is left unassigned rather than resolved to an arbitrary neighbour.
  if (parents.length !== 1) return null;
  const parent = parents[0];
  return molecule.atoms[parent] && molecule.atoms[parent].element !== "H" ? parent : null;
}

/**
 * The molecule to DRAW when hydrogens are switched on.
 *
 * A structure is normally drawn skeletal, so it has no explicit hydrogens at
 * all - and a viewer that can only reveal hydrogens the user already expanded
 * on the canvas would show nothing for the structure most people draw. So when
 * hydrogens are wanted and the structure is skeletal, they are laid out here
 * with the same fanning geometry the canvas's own "Explicit hydrogens" action
 * uses, purely for display.
 *
 * Deliberately NOT the canvas's structural edit: the returned molecule is a
 * throwaway used only to place circles and lines, so switching the toggle on
 * and off leaves the real structure - and the undo history - untouched. Real
 * hydrogens the user drew are kept as-is rather than re-fanned, so a hand-drawn
 * H stays where they put it.
 */
export function moleculeWithDisplayHydrogens(molecule: Molecule): Molecule {
  const hasExplicitH = Object.values(molecule.atoms).some((a) => a.element === "H" && !a.isotope);
  return hasExplicitH ? molecule : addExplicitHydrogens(molecule);
}

/**
 * The molecule the diagram will actually DRAW for a given toggle state.
 *
 * Exists so the drawing and the box it is fitted into cannot disagree. The
 * diagram component sizes its viewBox from this, and each caller sizes the
 * pixel box from the same call - and they have to, because the two are derived
 * from the same extent. A caller that measured the un-augmented fragment while
 * the component drew display hydrogens would fit the box to a skeleton and then
 * have the hydrogens spill outside it.
 */
export function diagramSourceFragment(molecule: Molecule, showExplicitHydrogens: boolean): Molecule {
  return showExplicitHydrogens ? moleculeWithDisplayHydrogens(molecule) : molecule;
}

export interface VisibleAtomsAndBonds {
  atoms: Molecule["atoms"];
  bonds: Molecule["bonds"];
}

/**
 * Blank margin around the drawn atoms, in SVG user units.
 *
 * Lives here rather than inline in the component because the viewBox and the
 * pixel box have to be derived from the SAME extent - see diagramExtent.
 */
const DIAGRAM_PAD = 30;

/**
 * Ceiling on the scale for a cramped caller - one overlaying a spectrum.
 *
 * 1.0 is natural size: one user unit per pixel, the same density the canvas
 * draws atoms at, which puts an 11-unit label at a readable 11px. A little
 * enlargement above that is welcome on a small structure, but past roughly
 * this the circles and bonds thicken faster than the labels do and the drawing
 * starts to look like a cartoon of itself.
 *
 * Callers with a panel to themselves pass a higher ceiling (or none) - see the
 * `maxScale` argument on diagramBoxSize. The cap is really a statement about
 * how much of the view the drawing is allowed to dominate, so it belongs to
 * the caller rather than being baked in here.
 *
 * Note there is deliberately NO matching floor. A floor on the scale sounds
 * like the fix for "large molecules render tiny", but it cannot be one: a
 * molecule too big for the allowed box has to be shrunk to fit whatever the
 * floor says, so a floor would only ever produce a box that overflows its
 * container and gets clipped or overlapped. What actually fixes it is growing
 * the box to the full space allowed.
 */
const MAX_DIAGRAM_SCALE = 1.5;

export interface DiagramExtent {
  width: number;
  height: number;
}

/**
 * The drawn extent of the diagram, in SVG user units.
 *
 * The single source of truth for both the viewBox and the pixel box. Deriving
 * them separately is how the two drift apart - a viewBox fitted to slightly
 * different padding than the box was sized for silently letterboxes or clips
 * the drawing, and it reads as "the diagram is off-centre" rather than as the
 * arithmetic bug it is.
 *
 * Computed from the atoms as actually drawn (i.e. AFTER hydrogen filtering),
 * so hiding hydrogens doesn't leave a permanently empty margin.
 */
export function diagramExtent(atoms: readonly { x: number; y: number }[]): DiagramExtent {
  if (atoms.length === 0) return { width: 100, height: 100 };
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  return {
    width: Math.max(1, Math.max(...xs) - Math.min(...xs) + DIAGRAM_PAD * 2),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys) + DIAGRAM_PAD * 2),
  };
}

/**
 * The pixel box to draw an extent of this size into.
 *
 * The box grows with the molecule until it fills the space allowed, which is
 * the actual fix for "the drawing is tiny on a big molecule". SVG text is sized
 * in viewBox units and the viewBox spans the molecule, so a fixed pixel box
 * makes every atom label shrink as the structure grows - a 30-atom structure
 * ends up with indices smaller than the text beside it. Filling the box instead
 * gives the drawing every pixel the caller can spare.
 *
 * `maxWidth`/`maxHeight` bound how much of the surrounding view the diagram may
 * cover; a caller with a panel to itself can pass far larger numbers than one
 * overlaying a spectrum. A molecule too large for its allowance is drawn as
 * large as that allowance permits - there is no way around that, since the
 * labels have to share the pixels the atoms do.
 *
 * The aspect ratio is preserved exactly. Scaling each axis independently to
 * "fill" the box would misreport the drawing's proportions, and the SVG's own
 * letterboxing would then undo it - so the box is derived from ONE scale and
 * both axes follow from it.
 *
 * `maxScale` caps how far a SMALL molecule may be enlarged, which is a question
 * about the caller's surroundings rather than about the drawing: a diagram
 * overlaying a spectrum stays modest so it doesn't bury the peaks, while one
 * with a whole column to itself is free to fill it. Defaults to the cramped
 * overlay's ceiling; pass a higher number (or Infinity) when there is room.
 */
export function diagramBoxSize(
  extent: DiagramExtent,
  maxWidth: number,
  maxHeight: number,
  maxScale: number = MAX_DIAGRAM_SCALE,
): DiagramExtent {
  const fit = Math.min(maxWidth / extent.width, maxHeight / extent.height);
  const scale = Math.min(fit, maxScale);
  // floor(), not round(): rounding up could push the box a pixel past the
  // allowance the caller is relying on to keep it clear of its neighbours.
  return {
    width: Math.max(1, Math.floor(extent.width * scale)),
    height: Math.max(1, Math.floor(extent.height * scale)),
  };
}

/**
 * The hydrogen-count suffix to draw on an atom's label, or null for none.
 *
 * "H3", "H2", "H"... rendered as a subscript after the atom's own label, so a
 * carbon drawn as "C1" reads "C1H3" - which keeps the index (the thing that
 * identifies which signal belongs to this atom) while adding the valence the
 * index alone doesn't convey.
 *
 * Returns null when the count is 0 or the atom IS a hydrogen. An H drawn as
 * "H1H2" would be nonsense, and "O1H0" is just noise.
 *
 * Counts IMPLICIT hydrogens (valence-derived) as well as any explicit ones,
 * because a structure drawn skeletal - which is how nearly every structure is
 * drawn - has only implicit hydrogens, and reading "C1" instead of "C1H3"
 * is exactly the ambiguity this is here to remove.
 */
export function hydrogenSuffixForLabel(fragment: Molecule, atomId: string): string | null {
  const atom = fragment.atoms[atomId];
  if (!atom || atom.element === "H") return null;
  // totalHydrogenCount rather than implicitH, so a structure where SOME
  // hydrogens were drawn explicitly still reports the true total.
  const count = totalHydrogenCount(fragment, atomId);
  if (count <= 0) return null;
  return count === 1 ? "H" : `H${count}`;
}

/**
 * Filters a molecule for display in a read-only structure diagram.
 *
 * @param showExplicitHydrogens whether H atoms drawn as their own atoms appear
 */
export function filterForReportDiagram(
  fragment: Molecule,
  showExplicitHydrogens: boolean,
): VisibleAtomsAndBonds {
  if (showExplicitHydrogens) {
    return { atoms: fragment.atoms, bonds: fragment.bonds };
  }

  const hidden = new Set<string>();
  if (!showExplicitHydrogens) {
    for (const atom of Object.values(fragment.atoms)) {
      // Only the element itself. A deuterium is drawn as its own atom with an
      // isotope, and hiding those would silently drop a real structural fact.
      if (atom.element === "H" && !atom.isotope) hidden.add(atom.id);
    }
  }

  if (hidden.size === 0) {
    return { atoms: fragment.atoms, bonds: fragment.bonds };
  }

  const atoms: Molecule["atoms"] = {};
  for (const [id, atom] of Object.entries(fragment.atoms)) {
    if (!hidden.has(id)) atoms[id] = atom;
  }

  const bonds: Molecule["bonds"] = {};
  for (const [id, bond] of Object.entries(fragment.bonds)) {
    if (hidden.has(bond.a1) || hidden.has(bond.a2)) continue;
    bonds[id] = bond;
  }

  return { atoms, bonds };
}