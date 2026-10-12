import type { Molecule } from "../../types/chemistry";

/**
 * Maps between an atom's position in the 2D editor and the `serial` that
 * 3Dmol.js reports for it on click, so clicking an atom in the 3D view can
 * select the matching atom on the 2D canvas (and vice versa).
 *
 * Why a positional mapping works at all: embed3d.ts builds the 3D structure
 * by feeding the 2D molecule through this app's own exportMol, whose atom
 * order is exactly Object.keys(mol.atoms) (see the `index` map it builds).
 * OpenChemLib's conformer search preserves the input atom order and appends
 * the hydrogens it saturates open valences with, so position N in the 3D
 * model is the Nth 2D atom for the first `Object.keys(mol.atoms).length`
 * positions, and everything beyond that is a generated hydrogen with no 2D
 * counterpart.
 *
 * That equivalence is not guaranteed by any published contract, so
 * atomLink.test.ts pins it with a deliberately non-alphabetical element
 * sequence — if OpenChemLib ever reorders atoms, that test fails rather than
 * the app silently highlighting the wrong atom. `buildSerialToAtomId` also
 * returns the heavy-atom count so callers can refuse to map a position past
 * it instead of highlighting an unrelated atom.
 *
 * ## Serial is ZERO-based
 *
 * `serial` here is 3Dmol's `atom.serial`, which is **0-based**, even though
 * the V2000 atom block numbers atoms from 1 and 3Dmol's own bond parsing
 * treats those file numbers as 1-based. Both facts sit a few lines apart in
 * its parseV2000:
 *
 *     for (let i = start; i < end; i++, offset++) {
 *         atom.serial = i;                       // 0-based loop index
 *         serialToIndex[i] = curFrame.length;
 *     }
 *     const from = serialToIndex[parseInt(line.substring(0, 3)) - 1 + start];
 *                                                        ^ 1-based file number
 *
 * The comment above that loop ("Serial is atom's index in file") describes
 * the intent but not what the code does. Getting this wrong is invisible in
 * any test written against this app's own parseV2000, because that one *is*
 * consistently 0-based — which is why the rotate-bond tool, its only other
 * consumer of `atom.serial`, works while this one didn't. The regression test
 * below parses a molfile with 3Dmol's real parser to pin the convention.
 *
 * The public helpers therefore take and return 0-based positions. Callers
 * holding a serial from a 3Dmol click handler must pass it through unchanged.
 */
export function buildSerialToAtomId(mol: Molecule): { serialToAtomId: string[]; heavyAtomCount: number } {
  const atomIds = Object.keys(mol.atoms);
  return { serialToAtomId: atomIds, heavyAtomCount: atomIds.length };
}

/** The 2D atom id behind a 3D atom's 0-based serial, or null when that
 * position is a generated hydrogen (or out of range) and so has no 2D
 * counterpart. Takes 3Dmol's `atom.serial` verbatim — see the note on
 * zero-based serials above. */
export function atomIdForSerial(mapping: string[], serial: number): string | null {
  return serial >= 0 && serial < mapping.length ? mapping[serial] : null;
}

/** The 0-based 3D serial for a 2D atom id, or null if it isn't found. */
export function serialForAtomId(mapping: string[], atomId: string): number | null {
  const idx = mapping.indexOf(atomId);
  return idx >= 0 ? idx : null;
}
