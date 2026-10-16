import type { Molecule } from "../types/chemistry";
import { bondsOfAtom, implicitH } from "../model/valence";
import { findRings, isKekulizedRing } from "../engine/aromaticRings";

/**
 * The IR correlation table: the wavenumber ranges textbooks assign to each
 * functional group's characteristic absorption, plus enough structure reading
 * to know which of them a given molecule actually has.
 *
 * ## Why this is a table and not a per-peak assignment
 *
 * The backend returns wavenumbers and IR intensities, and nothing else — no
 * displacement vectors, no per-atom participation. Attaching a specific
 * functional-group label to each computed peak would mean picking which peaks
 * are "the C=O", which for a molecule with two carbonyls is not a question the
 * data can answer.
 *
 * So this works the other way round: read the *structure* for which groups are
 * present, shade those diagnostic regions across the plot, and let the user see
 * which computed peaks fall inside which region. That answers the question
 * students actually have ("is that peak at 1762 my carbonyl?") without
 * pretending to a per-peak assignment the calculation never made.
 *
 * ## Ranges are the condensed-phase ones
 *
 * Standard teaching values are for hydrogen-bonded liquids and solids, with one
 * exception noted below. GFN2-xTB computes an isolated, gas-phase molecule, so
 * an O–H or N–H stretch comes out far higher than the textbook band — a free
 * alcohol O–H is near 3650 while the condensed-phase range tops out around
 * 3600. That's called out in the panel rather than papered over.
 */

export interface IrBand {
  key: string;
  /** Wavenumber range in cm⁻¹, ascending. */
  min: number;
  max: number;
  /** Wider bands are drawn more strongly — an O–H is a broad smear, a C≡N a
   *  needle, and drawing them all identically would misrepresent that. */
  broad?: boolean;
  /**
   * True when the tabulated range assumes hydrogen bonding in a condensed
   * phase, so a computed gas-phase value will legitimately sit above it.
   */
  condensedPhase?: boolean;
}

export const IR_BANDS: IrBand[] = [
  { key: "bond.oh", min: 3200, max: 3600, broad: true, condensedPhase: true },
  { key: "bond.nh", min: 3300, max: 3500, broad: true, condensedPhase: true },
  { key: "band.chSp2", min: 3000, max: 3100 },
  { key: "bond.cTripleC", min: 2100, max: 2260 },
  { key: "bond.cTripleN", min: 2210, max: 2260 },
  { key: "band.chSp3", min: 2850, max: 3000 },
  { key: "bond.cDoubleO.acid", min: 1700, max: 1725 },
  { key: "bond.cDoubleO.ester", min: 1735, max: 1750 },
  { key: "bond.cDoubleO.aldehyde", min: 1720, max: 1740 },
  { key: "bond.cDoubleO.ketone", min: 1710, max: 1720 },
  { key: "bond.cDoubleO.amide", min: 1650, max: 1690 },
  { key: "bond.cDoubleC", min: 1620, max: 1680 },
  { key: "bond.cDoubleN", min: 1620, max: 1680 },
  { key: "bond.cDoubleO.aromatic", min: 1520, max: 1580 },
  { key: "bond.cDoubleC.aromatic", min: 1450, max: 1600, broad: true },
  { key: "band.ch3Bend", min: 1370, max: 1390 },
  { key: "bond.cSingleO", min: 1050, max: 1150, broad: true },
  { key: "bond.cSingleN", min: 1020, max: 1250, broad: true },
  { key: "band.ch2Scissor", min: 1435, max: 1475 },
  { key: "bond.cSingleCl", min: 600, max: 800 },
  { key: "bond.cSingleBr", min: 500, max: 650 },
  { key: "band.aromaticOop", min: 690, max: 710 },
];

/**
 * The subset of IR_BANDS this molecule could actually show, as
 * { band, count } pairs — the count being how many instances of that group
 * were found, so a diketone can say "2 × C=O".
 *
 * Anything the structure can't be shown to contain is left out entirely rather
 * than drawn as an empty region: a plot striped with bands for groups the
 * molecule doesn't have teaches the wrong lesson by omission.
 */
export function relevantIrBands(mol: Molecule): { band: IrBand; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

  // A ring that passes the Kekulised test isn't necessarily a real aromatic
  // ring: an abbreviated group is stored as one vertex that carries element
  // "C" purely as a bonding-model placeholder, so a drawn hexagon containing
  // one would otherwise read as benzene.
  const aromaticRings = findRings(mol).filter(
    (ring) => isKekulizedRing(mol, ring) && !ring.some((id) => mol.atoms[id]?.group),
  );
  const aromaticAtomIds = new Set(aromaticRings.flat());

  for (const atom of Object.values(mol.atoms)) {
    if (atom.group) continue; // an abbreviation's real substructure isn't in the drawing

    // Dative bonds are drawn lone-pair donations, not shared pairs, so they
    // neither create a neighbour nor change a bond order for this purpose.
    const neighbours = bondsOfAtom(mol, atom.id)
      .filter((b) => !b.dative)
      .map((b) => ({ id: b.a1 === atom.id ? b.a2 : b.a1, order: b.order }));
    const elements = neighbours.map((n) => mol.atoms[n.id]?.element);
    const hydrogens = implicitH(mol, atom.id);

    if (atom.element === "C") {
      neighbours.forEach((n, idx) => {
        const nb = elements[idx];
        if (n.order === 2 && nb === "O") {
          // An amide's C-N sits on a *different* neighbour from the C=O, so
          // the nitrogen has to be looked for among all of them — not among
          // this bond's endpoint, which is by now known to be oxygen.
          const amideN = neighbours.some((x) => mol.atoms[x.id]?.element === "N" && x.order === 1);
          const esterO = neighbours.find((x) => mol.atoms[x.id]?.element === "O" && x.order === 1);
          if (amideN) bump("bond.cDoubleO.amide");
          else if (esterO) {
            // -C(=O)-OH is an acid, -C(=O)-O-C an ester. They sit either side
            // of each other (1700-1725 vs 1735-1750), so telling them apart is
            // worth the single implicit-hydrogen lookup.
            bump(implicitH(mol, esterO.id) > 0 ? "bond.cDoubleO.acid" : "bond.cDoubleO.ester");
          } else if (hydrogens >= 1) bump("bond.cDoubleO.aldehyde");
          else bump("bond.cDoubleO.ketone");
        }
        if (n.order === 3 && nb === "N") bump("bond.cTripleN");
        if (n.order === 3 && nb === "C") bump("bond.cTripleC");
        if (n.order === 2 && nb === "N") bump("bond.cDoubleN");
      });

      if (aromaticAtomIds.has(atom.id)) {
        bump("band.chSp2");
        bump("bond.cDoubleC.aromatic");
        bump("band.aromaticOop");
      } else if (hydrogens > 0 && neighbours.every((n) => n.order === 1)) {
        bump("band.chSp3");
        if (hydrogens === 3) bump("band.ch3Bend");
      }
    }

    if (atom.element === "O") {
      const singleBondedCarbons = neighbours.filter((n) => n.order === 1 && mol.atoms[n.id]?.element === "C");
      // An alcohol's C-O stretch (1050-1150) is one of the most-used bands in
      // the whole table, and it belongs to the *same* oxygen as the O-H — so
      // this can't be restricted to two-coordinate oxygens, or every primary
      // alcohol would lose it.
      if (singleBondedCarbons.length === 1 && hydrogens >= 1) bump("bond.oh");
      if (singleBondedCarbons.length >= 1 && neighbours.every((n) => n.order === 1)) bump("bond.cSingleO");
    }

    if (atom.element === "N") {
      if (hydrogens > 0 && !neighbours.some((n) => n.order === 3)) bump("bond.nh");
      if (neighbours.some((n) => n.order === 1 && mol.atoms[n.id]?.element === "C")) bump("bond.cSingleN");
    }

    if (atom.element === "Cl" || atom.element === "Br") {
      const key = atom.element === "Cl" ? "bond.cSingleCl" : "bond.cSingleBr";
      if (neighbours.some((n) => n.order === 1 && mol.atoms[n.id]?.element === "C")) bump(key);
    }
  }

  const out: { band: IrBand; count: number }[] = [];
  for (const band of IR_BANDS) {
    const count = counts.get(band.key);
    if (count) out.push({ band, count });
  }
  // Overlapping ranges (the two C=O families, aromatic C=C) are drawn as
  // separate rows and nudged apart on the plot rather than merged, since
  // which one applies is exactly what the reader is trying to work out.
  return out.sort((a, b) => a.band.max - b.band.max || a.band.min - b.band.min);
}