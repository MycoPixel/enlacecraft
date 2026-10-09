/**
 * Which atoms and bonds the NMR report's structure diagram draws.
 *
 * The report diagram is not a picture of the molecule - it's a map from a
 * predicted signal back to the atom that produced it, so the reader can go
 * from a number in the spectrum table to a position on the structure. That job
 * decides what may be shown:
 *
 * - EXPLICIT HYDROGEN IS OPTIONAL. A structure drawn with the canvas's "Show
 *   Hydrogens" has an "H" atom attached to every carbon, and drawing all of
 *   them buries the heavy-atom skeleton the shift badges are anchored to.
 *   Worse, their labels ("H2") sit next to 1H shift badges (e.g. "2.34"),
 *   which is genuinely confusing to read. So they default to hidden.
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

import type { Molecule } from "../types/chemistry";
import { totalHydrogenCount } from "../model/valence";

export interface VisibleAtomsAndBonds {
  atoms: Molecule["atoms"];
  bonds: Molecule["bonds"];
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
 * Filters a molecule for display in the report diagram.
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