import type { Molecule, ReactionScheme } from "../types/chemistry";

/**
 * Atom-to-atom mapping for a reaction scheme.
 *
 * The drawing model already stores a per-atom `mapNumber` (see Atom's doc
 * comment) and the molfile writer/reader already round-trips it as `M  MAP`.
 * What was missing was a way to *derive* those numbers from a drawn scheme.
 *
 * The strategy here is deliberately conservative. Automatic mapping is only
 * safe when the correspondence is unambiguous; a wrong map number silently
 * mislabels which atom becomes which, which is worse than leaving the user
 * to use the existing map-number tool by hand. So this module:
 *
 *  1. Preserves every number the person already assigned.
 *  2. Refines atom labels with a Weisfeiler-Lehman-style pass (element,
 *     charge, isotope, group, then neighbour labels and bond orders).
 *  3. Pairs only labels that are unique on both sides of a step.
 *  4. Refuses to pair a number that is already used elsewhere in the step.
 *
 * This is a deterministic maximum-common-substructure approximation, not a
 * full MCS solver: it maps the unchanged skeleton of a reaction reliably and
 * leaves genuinely ambiguous atoms unmapped. That is the honest scope.
 */

export interface ReactionMapStep {
  /** One entry per connected reactant structure. */
  reactants: string[][];
  /** One entry per connected product structure. */
  products: string[][];
}

export interface ReactionMapResult {
  /** Atom id → map number, including numbers that already existed. */
  numbers: Map<string, number>;
  /** Atoms that now carry a number (new or preserved). */
  mappedAtomIds: Set<string>;
}

function baseLabel(molecule: Molecule, atomId: string): string {
  const atom = molecule.atoms[atomId];
  if (!atom) return "";
  return [atom.element, atom.charge, atom.isotope ?? "", atom.group ?? "", atom.groupFormula ?? ""].join("|");
}

function neighborsWithin(molecule: Molecule, atomId: string, allowed: ReadonlySet<string>): { id: string; order: number }[] {
  const out: { id: string; order: number }[] = [];
  for (const bond of Object.values(molecule.bonds)) {
    if (!allowed.has(bond.a1) || !allowed.has(bond.a2)) continue;
    if (bond.a1 === atomId) out.push({ id: bond.a2, order: bond.order });
    else if (bond.a2 === atomId) out.push({ id: bond.a1, order: bond.order });
  }
  out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return out;
}

function uniquePairs(
  reactantIds: string[],
  productIds: string[],
  labels: Map<string, string>,
  alreadyPaired: (reactantId: string, productId: string) => boolean
): [string, string][] {
  const byLabel = new Map<string, { reactants: string[]; products: string[] }>();
  for (const id of reactantIds) {
    const label = labels.get(id);
    if (!label) continue;
    const group = byLabel.get(label) ?? { reactants: [], products: [] };
    group.reactants.push(id);
    byLabel.set(label, group);
  }
  for (const id of productIds) {
    const label = labels.get(id);
    if (!label) continue;
    const group = byLabel.get(label) ?? { reactants: [], products: [] };
    group.products.push(id);
    byLabel.set(label, group);
  }

  const pairs: [string, string][] = [];
  for (const group of byLabel.values()) {
    if (group.reactants.length !== 1 || group.products.length !== 1) continue;
    const [reactantId] = group.reactants;
    const [productId] = group.products;
    if (alreadyPaired(reactantId, productId)) continue;
    pairs.push([reactantId, productId]);
  }
  return pairs;
}

function sideAtomIds(step: ReactionMapStep): { reactants: string[]; products: string[]; all: Set<string> } {
  const reactants = [...new Set(step.reactants.flat())];
  const products = [...new Set(step.products.flat())];
  return { reactants, products, all: new Set([...reactants, ...products]) };
}

/**
 * Derives map numbers for every step, sharing one numbering across the whole
 * scheme. An intermediate that is a product of one step and a reactant of
 * the next keeps the same atom id, so its number carries over naturally.
 *
 * Returns null when no pair could be mapped at all.
 */
export function mapReactionAtoms(molecule: Molecule, steps: ReactionMapStep[]): ReactionMapResult | null {
  const numbers = new Map<string, number>();
  const usedNumbers = new Set<number>();
  let nextNumber = 1;

  // Existing numbers are authoritative: reserve them before any guessing.
  for (const step of steps) {
    const { all } = sideAtomIds(step);
    for (const id of all) {
      const number = molecule.atoms[id]?.mapNumber;
      if (number == null) continue;
      if (numbers.has(id)) continue;
      numbers.set(id, number);
      usedNumbers.add(number);
      if (number >= nextNumber) nextNumber = number + 1;
    }
  }

  let any = numbers.size > 0;

  for (const step of steps) {
    const { reactants, products, all } = sideAtomIds(step);
    if (reactants.length === 0 || products.length === 0) continue;

    const labels = new Map<string, string>();
    for (const id of all) labels.set(id, baseLabel(molecule, id));

    const pairedReactants = new Set<string>();
    const pairedProducts = new Set<string>();
    const alreadyPaired = (reactantId: string, productId: string) =>
      numbers.get(reactantId) != null &&
      numbers.get(reactantId) === numbers.get(productId);

    // A few refinement rounds are enough to distinguish chemically distinct
    // atoms without turning into an expensive full isomorphism search.
    for (let round = 0; round < 4; round++) {
      const pairs = uniquePairs(reactants, products, labels, alreadyPaired);
      for (const [reactantId, productId] of pairs) {
        if (pairedReactants.has(reactantId) || pairedProducts.has(productId)) continue;

        const reactantNumber = numbers.get(reactantId);
        const productNumber = numbers.get(productId);
        if (reactantNumber != null && productNumber != null && reactantNumber !== productNumber) continue;
        if (reactantNumber != null && usedNumbers.has(reactantNumber) && numbers.get(productId) == null) {
          // The number is already owned by another atom elsewhere in the
          // scheme; assigning it here would create a duplicate.
          const owner = [...numbers.entries()].find(([, n]) => n === reactantNumber)?.[0];
          if (owner !== undefined && owner !== reactantId) continue;
        }
        if (productNumber != null && usedNumbers.has(productNumber) && numbers.get(reactantId) == null) {
          const owner = [...numbers.entries()].find(([, n]) => n === productNumber)?.[0];
          if (owner !== undefined && owner !== productId) continue;
        }

        const number = reactantNumber ?? productNumber ?? nextNumber++;
        numbers.set(reactantId, number);
        numbers.set(productId, number);
        usedNumbers.add(number);
        pairedReactants.add(reactantId);
        pairedProducts.add(productId);
        any = true;
      }

      // Re-label every atom with its neighbours' current labels. Paired
      // neighbours make the next round more specific, which is what lets a
      // symmetric-looking but topologically distinct atom resolve.
      const nextLabels = new Map<string, string>();
      for (const id of all) {
        const neighbourLabels = neighborsWithin(molecule, id, all)
          .map((neighbor) => `${neighbor.order}:${labels.get(neighbor.id) ?? ""}`)
          .sort()
          .join(",");
        nextLabels.set(id, `${baseLabel(molecule, id)}|${neighbourLabels}`);
      }
      for (const [id, label] of nextLabels) labels.set(id, label);
    }
  }

  if (!any || numbers.size === 0) return null;
  return { numbers, mappedAtomIds: new Set(numbers.keys()) };
}

/** Removes map numbers from the given atoms, leaving every other atom alone.
 * Returns the same molecule object when nothing changed, so the store's
 * commit wrapper does not create an empty undo entry. */
export function clearReactionMap(molecule: Molecule, atomIds: Iterable<string>): Molecule {
  let changed = false;
  const atoms = { ...molecule.atoms };
  for (const id of atomIds) {
    const atom = atoms[id];
    if (!atom || atom.mapNumber == null) continue;
    const { mapNumber: _mapNumber, mapNumberOffsetX: _offsetX, mapNumberOffsetY: _offsetY, ...rest } = atom;
    atoms[id] = rest;
    changed = true;
  }
  return changed ? { ...molecule, atoms } : molecule;
}

export interface ReactionMapValidation {
  /** True when the map is safe to export: at least one pair and no number
   * assigned to two different atoms. Partial maps are allowed — an unmapped
   * atom simply carries no number in the RXN file. */
  valid: boolean;
  mappedAtoms: number;
  duplicateNumbers: number[];
  unmappedReactantAtomIds: string[];
  unmappedProductAtomIds: string[];
}

/** Checks a scheme's map numbers without changing the drawing. */
export function validateReactionMap(molecule: Molecule, scheme: ReactionScheme): ReactionMapValidation {
  const reactantIds = new Set(scheme.steps.flatMap((step) => step.reactantAtomIds));
  const productIds = new Set(scheme.steps.flatMap((step) => step.productAtomIds));
  const allIds = new Set([...reactantIds, ...productIds]);

  // A map number is meant to be shared by one atom on the reactant side and
  // one on the product side — that pairing *is* the mapping. A duplicate is
  // therefore a number used by two atoms on the same side (or by more than
  // one pair overall), which no reader can resolve.
  const reactantOwners = new Map<number, string[]>();
  const productOwners = new Map<number, string[]>();
  const owners = new Map<number, Set<string>>();

  const record = (id: string, side: Map<number, string[]>) => {
    const number = molecule.atoms[id]?.mapNumber;
    if (number == null) return;
    const list = side.get(number) ?? [];
    if (!list.includes(id)) list.push(id);
    side.set(number, list);
    const all = owners.get(number) ?? new Set<string>();
    all.add(id);
    owners.set(number, all);
  };
  for (const id of reactantIds) record(id, reactantOwners);
  for (const id of productIds) record(id, productOwners);

  const duplicateNumbers = [...owners.keys()]
    .filter((number) => (reactantOwners.get(number)?.length ?? 0) > 1 || (productOwners.get(number)?.length ?? 0) > 1)
    .sort((a, b) => a - b);

  return {
    valid: owners.size > 0 && duplicateNumbers.length === 0,
    mappedAtoms: [...allIds].filter((id) => molecule.atoms[id]?.mapNumber != null).length,
    duplicateNumbers,
    unmappedReactantAtomIds: [...reactantIds].filter((id) => molecule.atoms[id]?.mapNumber == null),
    unmappedProductAtomIds: [...productIds].filter((id) => molecule.atoms[id]?.mapNumber == null),
  };
}
