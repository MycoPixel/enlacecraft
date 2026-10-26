import { Molecule as OCLMolecule } from "openchemlib";
import type { Element, Molecule } from "../types/chemistry";
import { exportMol } from "../io/molfile";
import { isMetalLike } from "../model/valence";

/** A computed absolute configuration at a tetrahedral stereocenter. */
export type ComputedStereoLabel = "R" | "S";

/** A computed E/Z configuration across a double bond. */
export type ComputedDoubleBondLabel = "E" | "Z";

export interface ComputedAtomStereo {
  atomId: string;
  label: ComputedStereoLabel;
  /**
   * True when OpenChemLib could only determine the configuration relative to
   * another center (a "pseudo" parity, which arises from enhanced-stereo
   * AND/OR groups). This app's own molfile writer doesn't emit those groups,
   * so in practice this is always false — kept so a future writer can't make
   * the panel silently claim an absolute assignment it doesn't have.
   */
  relative: boolean;
}

export interface ComputedBondStereo {
  bondId: string;
  label: ComputedDoubleBondLabel;
  /** See ComputedAtomStereo.relative. */
  relative: boolean;
}

/** Why the analysis couldn't run, when it couldn't. */
export type StereoUnavailableReason =
  /** Abbreviated groups (Ph, Boc, ...) have no real substructure here, so
   *  their CIP priorities can't be known. */
  | "abbreviated-group"
  /** A query/pseudo atom — a structure-search placeholder, not a molecule. */
  | "query-atom"
  /** A metal or metal-ligand bond: ordinary CIP rules don't cover it. */
  | "metal"
  /** OpenChemLib rejected the exported molfile. */
  | "parse-failed";

export type StereoAnalysis =
  | {
      status: "ok";
      atoms: ComputedAtomStereo[];
      bonds: ComputedBondStereo[];
      undefinedAtoms: string[];
      undefinedBonds: string[];
      ambiguousAtoms: string[];
      ambiguousBonds: string[];
    }
  | {
      status: "unavailable";
      reason: StereoUnavailableReason;
    };

/**
 * The elements whose CIP behaviour this feature is willing to vouch for.
 *
 * Deliberately narrow: the same organic/element set the rest of the app's
 * valence and drawing model is built around. Metals are handled separately
 * by isMetalLike (there's no meaningfully correct CIP answer for a
 * coordination compound here), and anything outside both is left
 * unavailable rather than guessed at.
 */
const CIP_SUPPORTED_ELEMENTS = new Set<Element>([
  "H", "B", "C", "N", "O", "F", "Si", "P", "S", "Cl", "Se", "Br", "I",
]);

/** Result cache keyed by molecule object identity. The store replaces (never
 * mutates) a Molecule on every edit, so an unchanged structure is the same
 * object — and both the canvas overlay and the info panel can ask for the
 * analysis without paying for a second OpenChemLib round-trip. */
const analysisCache = new WeakMap<Molecule, StereoAnalysis>();

/**
 * Computes R/S and E/Z descriptors for a molecule from its drawn geometry
 * and wedge/dash bonds, with OpenChemLib doing the actual CIP ranking.
 *
 * ## Why a molfile round-trip
 *
 * CIP priority ordering (recursive substituent comparison, duplicate atoms
 * for multiple bonds, isotopes, charges) is the hard part, and hand-rolling
 * it is exactly the kind of subtly-wrong implementation that silently
 * mislabels a structure. OpenChemLib already implements it; this module's
 * job is only to hand it a faithful molfile and map the answers back to
 * this app's atom/bond ids.
 *
 * ## The id mapping
 *
 * exportMol writes atoms in `Object.keys(mol.atoms)` order, so a parsed
 * atom index would naively index straight into that list. It can't: the
 * Molfile parser moves explicit ("simple") hydrogens to the end of its atom
 * array, so an explicit-H structure would map every atom after the first H
 * to the wrong id. `fromMolfileWithAtomMap` returns the parser's own
 * old-index → new-index permutation, which is inverted here to recover the
 * original export order and therefore the correct atom id.
 *
 * ## Undefined vs. computed
 *
 * `getAtomCIPParity` returns "none" both for an achiral atom and for a
 * genuine stereocenter whose configuration wasn't specified, so those two
 * cases are separated with `isAtomStereoCenter`. A wavy bond is handled
 * separately again: it means "unknown/mixed" by definition, so even if
 * OpenChemLib infers an R/S from the remaining geometry this module refuses
 * to present that as computed — the same stance io/smiles.ts already takes
 * when deciding which centers to encode.
 */
export function analyzeStereochemistry(mol: Molecule): StereoAnalysis {
  const cached = analysisCache.get(mol);
  if (cached) return cached;
  const result = computeStereochemistry(mol);
  analysisCache.set(mol, result);
  return result;
}

/** Uncached implementation; see analyzeStereochemistry. Exported only so
 * tests can build a molecule, mutate it, and recompute deliberately. */
export function computeStereochemistry(mol: Molecule): StereoAnalysis {
  const atomIds = Object.keys(mol.atoms);
  if (atomIds.length === 0) {
    return { status: "ok", atoms: [], bonds: [], undefinedAtoms: [], undefinedBonds: [], ambiguousAtoms: [], ambiguousBonds: [] };
  }

  for (const id of atomIds) {
    const atom = mol.atoms[id];
    if (atom.group || atom.groupFormula) return { status: "unavailable", reason: "abbreviated-group" };
    if (atom.queryProps) return { status: "unavailable", reason: "query-atom" };
    if (isMetalLike(atom.element) || !CIP_SUPPORTED_ELEMENTS.has(atom.element)) {
      return { status: "unavailable", reason: "metal" };
    }
  }
  // Haptic bonds aren't in the molfile at all, so the connectivity OCL sees
  // would be a different (incomplete) molecule. Dative bonds similarly.
  if (Object.keys(mol.hapticBonds).length > 0) return { status: "unavailable", reason: "metal" };
  if (Object.values(mol.bonds).some((b) => b.dative)) return { status: "unavailable", reason: "metal" };

  let parsed: { molecule: OCLMolecule; map: number[] };
  try {
    parsed = OCLMolecule.fromMolfileWithAtomMap(exportMol(mol));
  } catch {
    return { status: "unavailable", reason: "parse-failed" };
  }
  const oclMol = parsed.molecule;
  if (parsed.map.length !== atomIds.length) {
    return { status: "unavailable", reason: "parse-failed" };
  }

  // Map the parser's (possibly reordered) atom index back to export order,
  // and from there to this app's atom id.
  const exportIndexByOclIndex: number[] = [];
  for (let exportIndex = 0; exportIndex < parsed.map.length; exportIndex++) {
    exportIndexByOclIndex[parsed.map[exportIndex]] = exportIndex;
  }
  const atomIdByOclIndex = (oclIndex: number): string | undefined => {
    const exportIndex = exportIndexByOclIndex[oclIndex];
    return exportIndex === undefined ? undefined : atomIds[exportIndex];
  };

  try {
    oclMol.ensureHelperArrays(OCLMolecule.cHelperCIP);
  } catch {
    return { status: "unavailable", reason: "parse-failed" };
  }

  // A wavy bond explicitly says "stereochemistry unspecified", so a center
  // carrying one must never be reported as a clean R/S even if OCL's
  // coordinate-based inference produces one.
  const wavyAtoms = new Set<string>();
  for (const bond of Object.values(mol.bonds)) {
    if (bond.stereo !== "wavy") continue;
    wavyAtoms.add(bond.a1);
    wavyAtoms.add(bond.a2);
  }

  const atoms: ComputedAtomStereo[] = [];
  const undefinedAtoms: string[] = [];
  const ambiguousAtoms: string[] = [];

  for (let i = 0; i < oclMol.getAllAtoms(); i++) {
    const atomId = atomIdByOclIndex(i);
    if (!atomId) continue;
    const atom = mol.atoms[atomId];
    // Hydrogens can't be tetrahedral stereocenters, and skipping them keeps
    // explicit-H structures from producing phantom entries.
    if (atom.element === "H") continue;

    const cip = oclMol.getAtomCIPParity(i);
    const pseudo = oclMol.isAtomParityPseudo(i);

    if (wavyAtoms.has(atomId)) {
      // Wavy wins over whatever OCL inferred from the remaining geometry.
      if (oclMol.isAtomStereoCenter(i)) undefinedAtoms.push(atomId);
      continue;
    }

    if (cip === OCLMolecule.cAtomCIPParityRorM) {
      atoms.push({ atomId, label: "R", relative: pseudo });
    } else if (cip === OCLMolecule.cAtomCIPParitySorP) {
      atoms.push({ atomId, label: "S", relative: pseudo });
    } else if (cip === OCLMolecule.cAtomCIPParityProblem) {
      ambiguousAtoms.push(atomId);
    } else if (oclMol.isAtomStereoCenter(i)) {
      undefinedAtoms.push(atomId);
    }
  }

  // Bond lookup by endpoint ids, so reordered bond indices (and bonds to
  // explicit hydrogens) can't attach an E/Z label to the wrong line.
  const bondIdByPair = new Map<string, string>();
  for (const bond of Object.values(mol.bonds)) {
    const key = pairKey(bond.a1, bond.a2);
    if (!bondIdByPair.has(key)) bondIdByPair.set(key, bond.id);
  }

  const bonds: ComputedBondStereo[] = [];
  const undefinedBonds: string[] = [];
  const ambiguousBonds: string[] = [];
  const seenBonds = new Set<string>();

  for (let i = 0; i < oclMol.getAllBonds(); i++) {
    const a1 = atomIdByOclIndex(oclMol.getBondAtom(0, i));
    const a2 = atomIdByOclIndex(oclMol.getBondAtom(1, i));
    if (!a1 || !a2) continue;
    const bondId = bondIdByPair.get(pairKey(a1, a2));
    if (!bondId || seenBonds.has(bondId)) continue;
    // E/Z only exists across a double bond. OCL also assigns M/P to a few
    // axial single bonds; those are not what this panel is reporting.
    if (mol.bonds[bondId].order !== 2) continue;

    const cip = oclMol.getBondCIPParity(i);
    if (cip === OCLMolecule.cBondCIPParityNone && oclMol.getBondParity(i) !== OCLMolecule.cBondParityUnknown) {
      continue;
    }
    seenBonds.add(bondId);

    const pseudo = oclMol.isBondParityPseudo(i);
    if (cip === OCLMolecule.cBondCIPParityEorP) {
      bonds.push({ bondId, label: "E", relative: pseudo });
    } else if (cip === OCLMolecule.cBondCIPParityZorM) {
      bonds.push({ bondId, label: "Z", relative: pseudo });
    } else if (cip === OCLMolecule.cBondCIPParityProblem) {
      ambiguousBonds.push(bondId);
    } else {
      // Neither defined nor a hard error: OCL sees a stereogenic double bond
      // but no decidable geometry (e.g. all four atoms drawn collinear).
      undefinedBonds.push(bondId);
    }
  }

  return { status: "ok", atoms, bonds, undefinedAtoms, undefinedBonds, ambiguousAtoms, ambiguousBonds };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}
