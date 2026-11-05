/**
 * The XYZ format: a plain-text list of atomic symbols and Cartesian
 * coordinates, with no bond/connectivity information at all — the most
 * common "just the raw 3D geometry" input format accepted by
 * computational chemistry tools (ORCA, xtb, Gaussian, PyMOL, Avogadro,
 * ...). Used by Molecule3DView.tsx to let someone take a structure this
 * app generated (see io/embed3d.ts, io/xtbRefine.ts) out to one of those
 * tools for anything beyond what this app itself computes.
 *
 * Deliberately its own minimal input type rather than importing
 * components/Molecule3D/rotateBond.ts's XyzAtom: this module lives in
 * io/ alongside the app's other file-format code (molfile.ts, cdxml.ts,
 * smiles.ts) and shouldn't depend on a specific feature component's
 * types to do so — the two shapes are structurally identical, so any
 * caller with { element, x, y, z } objects (rotateBond.ts's included)
 * can pass them straight through.
 */
export interface XyzAtomInput {
  element: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Serializes atoms to the standard XYZ format: an atom-count line, a
 * free-text comment line, then one "Element  x  y  z" line per atom.
 * Coordinates are written as-is (in Ångströms, matching what
 * embed3d.ts/xtbRefine.ts already produce) — this format carries no
 * unit metadata of its own; Å is the de facto convention every
 * consumer of it assumes.
 */
export function exportXyz(atoms: XyzAtomInput[], comment = ""): string {
  const lines = [String(atoms.length), comment];
  for (const a of atoms) {
    lines.push(`${a.element}  ${a.x.toFixed(6)}  ${a.y.toFixed(6)}  ${a.z.toFixed(6)}`);
  }
  return lines.join("\n") + "\n";
}
