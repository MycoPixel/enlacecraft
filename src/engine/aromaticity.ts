import { Molecule as OCLMolecule } from "openchemlib";
import type { Molecule } from "../types/chemistry";
import { findRings } from "./aromaticRings";
import { isMetalLike } from "../model/valence";
import { exportMol } from "../io/molfile";

/**
 * Aromatic / antiaromatic / non-aromatic classification of every ring in a
 * structure, by the textbook decision procedure:
 *
 *   1. Does every atom of the ring have a p orbital taking part in a single
 *      continuous cycle of conjugation? (a sp3 CH2 anywhere breaks it)
 *   2. How many π electrons does that cycle carry?
 *   3. 4n+2 → aromatic, 4n → antiaromatic, anything else → non-aromatic.
 *
 * ## Why this isn't engine/aromaticRings.ts's isKekulizedRing
 *
 * That function asks "does this ring's Kekulé structure alternate single and
 * double bonds", which is the right question for deciding where to draw an
 * inscribed circle and the wrong question for chemistry: a fully conjugated
 * ring need not have its Kekulé structure alternate (see the fused-ring note
 * below), and alternation says nothing about whether the result is aromatic or
 * antiaromatic. Its own doc comment already says it makes "no attempt at true
 * (Huckel-rule) aromaticity perception". This module is that attempt.
 *
 * ## Geometry is deliberately not consulted
 *
 * Planarity is a *criterion* in the textbook procedure, but it is not
 * available here: this app's Molecule carries only x/y per atom, so a ring's
 * shape on the 2D canvas is the drawing, not the molecule. Reading planarity
 * or bond-length alternation off the canvas would be circular — a ring drawn as
 * a hexagon looks planar whether or not it is. Real geometry has to come from
 * the 3D pipeline (io/embed3d.ts / the xtb refinement), which is a separate
 * step against real coordinates. Two consequences worth knowing:
 *
 *  - Cyclobutadiene and the cyclopentadienyl cation are reported antiaromatic
 *    here, and they genuinely are — but their instability is electronic
 *    (Jahn-Teller), not geometric, so a planarity check will *not* catch them.
 *    Planarity catches the opposite case: cyclooctatetraene puckers precisely
 *    to avoid antiaromaticity, and it is the non-aromatic one.
 *
 * ## Rings that share a delocalised system
 *
 * Per-ring counting is ambiguous for fused rings, because a Kekulé structure
 * spreads the π electrons across the whole fused system and which atom ends up
 * without a drawn double bond is an arbitrary choice of resonance form. Azulene
 * is the extreme case: neither its five-ring nor its seven-ring is a simple
 * 4n+2 ring on its own, yet the pair is unambiguously aromatic as one
 * 10-electron system.
 *
 * So the headline verdict is always per *system* (rings fused through a shared
 * edge or pair of atoms are one system), and the per-ring π count is reported
 * alongside as indicative. Spiro rings share only an atom and genuinely have
 * separate π systems, so they are not merged.
 */

export type AromaticityVerdict = "aromatic" | "antiaromatic" | "non-aromatic" | "unknown";

export type AromaticityReason =
  /** 4n+2 π electrons. */
  | "huckel-4n2"
  /** 4n π electrons. */
  | "huckel-4n"
  /** Conjugated, but the π count is neither 4n+2 nor 4n. */
  | "pi-count-other"
  /** At least one ring atom has no p orbital, so no continuous cycle exists. */
  | "not-conjugated"
  /** Conjugated but carries no π electrons at all. */
  | "no-pi-electrons"
  /** An abbreviated group (Ph, Boc, ...) sits in the ring — its real
   *  substructure isn't in the drawing, so there's nothing to count. */
  | "abbreviated-group"
  /** A metal sits in the ring. */
  | "metal-ring"
  /** An atom whose lone-pair / empty-orbital situation this module doesn't
   *  have a rule for. */
  | "unsupported-element";

export interface AromaticitySystem {
  /** Every ring in this system, in walk order. Length 1 for a monocycle. */
  rings: string[][];
  verdict: AromaticityVerdict;
  reason: AromaticityReason;
  /** π electrons in the system's π cloud; null when it couldn't be counted. */
  piElectrons: number | null;
  /** The n in the applicable Hückel expression; null when neither applies. */
  n: number | null;
  /** Atoms in the system with no p orbital. Empty for a fully conjugated one. */
  nonConjugatedAtoms: string[];
  /** π electrons counted within each ring individually. Indicative only when
   *  `rings.length > 1` — see the module doc comment. null if uncountable. */
  perRingPiElectrons: (number | null)[];
  /** OpenChemLib's independent aromatic / not verdict per ring, when the
   *  cross-check ran. A null array means it didn't. Entries are per ring and
   *  in the same order as `rings`. Note OCL cannot distinguish antiaromatic
   *  from merely-not-aromatic, so it only corroborates half the question. */
  crossCheck: (boolean | null)[] | null;
}

/** One bond, as seen from a given atom. */
interface Adjacency {
  bondId: string;
  other: string;
  order: number;
  dative: boolean;
}

function buildAdjacency(mol: Molecule): Map<string, Adjacency[]> {
  const adj = new Map<string, Adjacency[]>();
  for (const id of Object.keys(mol.atoms)) adj.set(id, []);
  for (const bond of Object.values(mol.bonds)) {
    adj.get(bond.a1)?.push({ bondId: bond.id, other: bond.a2, order: bond.order, dative: bond.dative === true });
    adj.get(bond.a2)?.push({ bondId: bond.id, other: bond.a1, order: bond.order, dative: bond.dative === true });
  }
  return adj;
}

interface PiState {
  /** Does this atom have a p orbital able to join a cyclic π system? */
  conjugated: boolean;
  /** π electrons this atom contributes to a monocycle's π count. */
  electrons: number;
  /** Can this lone pair / empty orbital donate into a π system at all? */
  donates: boolean;
}

/**
 * How many π electrons one ring atom contributes, and whether it can
 * participate at all.
 *
 * The count is per-ring rather than derived from the molecule's double bonds
 * because a lone-pair donor and an empty orbital both contribute to the same
 * total as an ordinary π bond — pyrrole, furan and pyridine are all 6 electrons
 * despite only pyridine having three drawn double bonds.
 */
function piStateOf(mol: Molecule, atomId: string, adj: Map<string, Adjacency[]>): PiState {
  const atom = mol.atoms[atomId];
  const neighbours = (adj.get(atomId) ?? []).filter((a) => !a.dative);

  // A dative bond is a donated lone pair drawn as an arrow, not a shared pair
  // in a covalent π system, so it neither contributes electrons nor implies a
  // p orbital.
  const hasMultipleBond = neighbours.some((a) => a.order >= 2);
  const sigmaCount = neighbours.length;
  const charge = atom.charge;

  switch (atom.element) {
    case "C":
      if (hasMultipleBond) return { conjugated: true, electrons: 1, donates: true };
      // A lone pair (carbanion) or an empty p orbital (carbocation) both leave
      // the carbon sp2 and able to join the cycle.
      if (charge < 0) return { conjugated: true, electrons: 2, donates: true };
      if (charge > 0) return { conjugated: true, electrons: 0, donates: true };
      // Everything else is an ordinary sp3 carbon: two ring bonds and hydrogens.
      return { conjugated: false, electrons: 0, donates: false };

    case "N":
      if (hasMultipleBond) return { conjugated: true, electrons: 1, donates: true };
      if (charge > 0) return { conjugated: true, electrons: 0, donates: true };
      if (charge < 0) return { conjugated: true, electrons: 2, donates: true };
      // Pyrrole-type: three sigma bonds and a lone pair. Four would leave no
      // lone pair, so that's an over-valence the caller should not second-guess.
      if (sigmaCount >= 4) return { conjugated: false, electrons: 0, donates: false };
      return { conjugated: true, electrons: 2, donates: true };

    case "O":
    case "S":
    case "Se":
      // A double bond to a ring atom means the π electrons belong to that
      // bond, not to this atom's donation — a ring carbonyl oxygen contributes
      // nothing to the ring's own count.
      if (hasMultipleBond) return { conjugated: true, electrons: 0, donates: true };
      if (charge < 0) return { conjugated: true, electrons: 2, donates: true };
      // Oxonium with no lone pair and no double bond has nothing to give.
      if (charge > 0) return { conjugated: false, electrons: 0, donates: false };
      // Furan / thiophene-type.
      return { conjugated: true, electrons: 2, donates: true };

    case "B":
      // Borole/borabenzene: an empty p orbital joins the cycle and
      // contributes no electrons, which is what makes borabenzene's 5 count
      // fail Hückel where benzene's 6 succeeds.
      if (hasMultipleBond) return { conjugated: true, electrons: 1, donates: true };
      if (charge < 0) return { conjugated: true, electrons: 2, donates: true };
      return { conjugated: true, electrons: 0, donates: true };

    default:
      // Conservative: an atom in a drawn multiple bond is treated as an
      // ordinary sp2 contributor, anything else as sp3.
      if (hasMultipleBond) return { conjugated: true, electrons: 1, donates: true };
      if (charge < 0) return { conjugated: true, electrons: 2, donates: true };
      return { conjugated: false, electrons: 0, donates: false };
  }
}

/**
 * How many rings share at least two atoms, and so share a delocalised π
 * system? Naphthalene's two hexagons share the fusion *bond* (2 atoms); a
 * spiro pair shares 1 atom and must stay separate, because two rings meeting
 * at a single tetravalent atom have no π path between them.
 */
function groupFusedRings(rings: string[][]): number[][] {
  const parent = rings.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const shared = rings[i].filter((id) => rings[j].includes(id)).length;
      if (shared >= 2) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  rings.forEach((_, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  });
  return [...groups.values()];
}

/**
 * π electron count over a set of atoms. Counts double bonds once rather than
 * once per atom, because for a fused system the same π bond is shared between
 * two rings and summing per-atom contributions would double-count it.
 */
function countSystemPi(mol: Molecule, atomIds: string[], adj: Map<string, Adjacency[]>): {
  pi: number;
  nonConjugated: string[];
  unsupported: boolean;
  donorAvailable: boolean;
} {
  const inSystem = new Set(atomIds);
  const countedBonds = new Set<string>();
  let pi = 0;
  let donorAvailable = false;

  for (const id of atomIds) {
    const state = piStateOf(mol, id, adj);
    if (!state.conjugated) continue;

    const multiple = (adj.get(id) ?? []).filter((a) => !a.dative && a.order >= 2 && inSystem.has(a.other));
    if (multiple.length > 0) {
      for (const a of multiple) {
        // A triple bond inside the ring contributes one in-plane π bond (part
        // of the ring's σ framework, not its π cloud) plus one perpendicular
        // one; only the perpendicular pair is counted, so each end of a double
        // bond is worth 1 and a triple bond is worth 1 per atom.
        if (countedBonds.has(a.bondId)) continue;
        countedBonds.add(a.bondId);
        pi += 2;
      }
    } else if (state.donates) {
      // No π bond of its own, so its lone pair (or empty orbital) is what
      // reaches the cycle.
      donorAvailable = true;
      pi += state.electrons;
    }
  }

  const nonConjugated = atomIds.filter((id) => !piStateOf(mol, id, adj).conjugated);
  const unsupported = atomIds.some((id) => !isSupportedElement(mol.atoms[id].element));
  return { pi, nonConjugated, unsupported, donorAvailable };
}

function isSupportedElement(element: string): boolean {
  return element === "C" || element === "N" || element === "O" || element === "S" || element === "Se" || element === "B";
}

/** The Hückel verdict for a π-electron count. */
function classify(
  pi: number,
  nonConjugated: string[],
  blocked: { abbreviated: boolean; metal: boolean; unsupported: boolean },
): { verdict: AromaticityVerdict; reason: AromaticityReason; n: number | null } {
  if (blocked.abbreviated) return { verdict: "unknown", reason: "abbreviated-group", n: null };
  if (blocked.metal) return { verdict: "unknown", reason: "metal-ring", n: null };
  if (blocked.unsupported) return { verdict: "unknown", reason: "unsupported-element", n: null };
  // Conjugation is checked before the count: a ring whose sp3 carbon breaks
  // the cycle has no π system to count, whatever the arithmetic says.
  if (nonConjugated.length > 0) return { verdict: "non-aromatic", reason: "not-conjugated", n: null };
  if (pi === 0) return { verdict: "non-aromatic", reason: "no-pi-electrons", n: null };
  if (pi >= 2 && (pi - 2) % 4 === 0) return { verdict: "aromatic", reason: "huckel-4n2", n: (pi - 2) / 4 };
  if (pi >= 4 && pi % 4 === 0) return { verdict: "antiaromatic", reason: "huckel-4n", n: pi / 4 };
  return { verdict: "non-aromatic", reason: "pi-count-other", n: null };
}

/**
 * OpenChemLib's own aromaticity verdict per ring, as an independent second
 * opinion on the aromatic/not half of the question.
 *
 * Deliberately advisory and fail-soft. It needs a molfile round-trip, it can't
 * see abbreviated groups, and it cannot distinguish antiaromatic from
 * not-aromatic — so a disagreement is a flag for the person reading the
 * result, never something that overrides the Hückel verdict. Ring and atom
 * indices are 0-based and match `Object.keys(mol.atoms)` order because
 * exportMol writes its atom block in exactly that order; the atom count is
 * checked before trusting any of it.
 */
function oclAromaticPerAtomSet(mol: Molecule): Map<string, boolean> | null {
  const atomIds = Object.keys(mol.atoms);
  // exportMol keeps an abbreviated group as one superatom atom, so OCL would
  // see a bare carbon and quietly disagree. Decline rather than mislead.
  if (atomIds.some((id) => mol.atoms[id].group || mol.atoms[id].groupFormula)) return null;

  let oclMol: OCLMolecule;
  try {
    oclMol = OCLMolecule.fromMolfile(exportMol(mol));
  } catch {
    return null;
  }
  if (oclMol.getAllAtoms() !== atomIds.length) return null;

  try {
    const rings = oclMol.getRingSet();
    const out = new Map<string, boolean>();
    for (let r = 0; r < rings.getSize(); r++) {
      const key = rings
        .getRingAtoms(r)
        .map((idx) => atomIds[idx])
        .sort()
        .join(",");
      if (key) out.set(key, rings.isAromatic(r));
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Classifies every ring in `mol`. Returns one entry per fused ring system, in
 * the order findRings first encountered them — so a monocyclic molecule gives
 * exactly one system with a single ring.
 */
export function analyzeAromaticity(mol: Molecule): AromaticitySystem[] {
  const rings = findRings(mol);
  if (rings.length === 0) return [];

  const adj = buildAdjacency(mol);
  const crossCheckByRingSet = oclAromaticPerAtomSet(mol);

  return groupFusedRings(rings).map((group) => {
    const systemRings = group.map((i) => rings[i]);
    const atomIds = [...new Set(systemRings.flat())];

    const blocked = {
      abbreviated: atomIds.some((id) => !!mol.atoms[id].group || !!mol.atoms[id].groupFormula),
      metal: atomIds.some((id) => isMetalLike(mol.atoms[id].element)),
      unsupported: atomIds.some((id) => !isSupportedElement(mol.atoms[id].element)),
    };

    const { pi, nonConjugated } = countSystemPi(mol, atomIds, adj);
    const { verdict, reason, n } = classify(pi, nonConjugated, blocked);

    // Per-ring counts are the per-atom tally, which is exact for a ring that
    // stands alone and indicative for a fused one (see the module comment).
    const perRingPiElectrons = systemRings.map((ring) => {
      if (blocked.abbreviated) return null;
      let total = 0;
      let ok = true;
      for (const id of ring) {
        const state = piStateOf(mol, id, adj);
        if (!state.conjugated) ok = false;
        total += state.electrons;
      }
      return ok ? total : null;
    });

    const crossCheck = crossCheckByRingSet
      ? systemRings.map((ring) => crossCheckByRingSet.get([...ring].sort().join(",")) ?? null)
      : null;

    return {
      rings: systemRings,
      verdict,
      reason,
      piElectrons: blocked.abbreviated ? null : pi,
      n,
      nonConjugatedAtoms: nonConjugated,
      perRingPiElectrons,
      crossCheck,
    };
  });
}