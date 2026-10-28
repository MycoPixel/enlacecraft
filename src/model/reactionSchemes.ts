import type { Annotation, Atom, Molecule, ReactionScheme, ReactionStep } from "../types/chemistry";

/**
 * Small helpers around `Molecule.schemes` (ChemDraw reaction-scheme
 * grouping — see ReactionScheme's doc comment).
 *
 * The scheme data is deliberately plain arrays of ids, so the only real
 * maintenance work is pruning: atoms and arrows can be deleted while a
 * scheme still references them. Every prune helper here returns the *same*
 * array when nothing changed, which lets the store's commit wrappers keep
 * object identity (and therefore avoid pointless re-renders/undo entries)
 * when an edit has nothing to do with scheme membership.
 */

function pruneAtomIds(ids: string[], atomIds: ReadonlySet<string>): string[] {
  const kept = ids.filter((id) => atomIds.has(id));
  return kept.length === ids.length ? ids : kept;
}

/** Drops scheme references to atoms that no longer exist, and steps/schemes
 * left with no structures at all. Used by the structural delete paths. */
export function pruneSchemesForAtoms(
  schemes: ReactionScheme[] | undefined,
  atoms: ReadonlySet<string> | Record<string, Atom>
): ReactionScheme[] | undefined {
  if (!schemes || schemes.length === 0) return schemes;
  const atomIds = atoms instanceof Set ? atoms : new Set(Object.keys(atoms));
  let changed = false;
  const next: ReactionScheme[] = [];

  for (const scheme of schemes) {
    let schemeChanged = false;
    const steps: ReactionStep[] = [];
    for (const step of scheme.steps) {
      const reactantAtomIds = pruneAtomIds(step.reactantAtomIds, atomIds);
      const productAtomIds = pruneAtomIds(step.productAtomIds, atomIds);
      const stepChanged =
        reactantAtomIds !== step.reactantAtomIds || productAtomIds !== step.productAtomIds;
      if (reactantAtomIds.length === 0 && productAtomIds.length === 0) {
        schemeChanged = true;
        continue;
      }
      steps.push(stepChanged ? { ...step, reactantAtomIds, productAtomIds } : step);
      if (stepChanged) schemeChanged = true;
    }
    if (steps.length === 0) {
      changed = true;
      continue;
    }
    next.push(schemeChanged ? { ...scheme, steps } : scheme);
    if (schemeChanged) changed = true;
  }

  if (!changed) return schemes;
  return next.length > 0 ? next : undefined;
}

/** Drops scheme references to annotations that no longer exist. Steps stay
 * even when their arrow is gone (the reactant/product grouping is still
 * meaningful); only the stale arrow id is removed. */
export function pruneSchemeArrowIds(
  schemes: ReactionScheme[] | undefined,
  annotationIds: ReadonlySet<string> | Record<string, Annotation>
): ReactionScheme[] | undefined {
  if (!schemes || schemes.length === 0) return schemes;
  const ids = annotationIds instanceof Set ? annotationIds : new Set(Object.keys(annotationIds));
  let changed = false;
  const next = schemes.map((scheme) => {
    let schemeChanged = false;
    const steps = scheme.steps.map((step) => {
      const arrowIds = step.arrowIds.filter((id) => ids.has(id));
      if (arrowIds.length === step.arrowIds.length) return step;
      schemeChanged = true;
      return { ...step, arrowIds };
    });
    if (!schemeChanged) return scheme;
    changed = true;
    return { ...scheme, steps };
  });
  return changed ? next : schemes;
}

/** Every atom id in a scheme, deduplicated — e.g. for selecting the whole
 * reaction as one unit. */
export function schemeAtomIds(scheme: ReactionScheme): string[] {
  const ids = new Set<string>();
  for (const step of scheme.steps) {
    for (const id of step.reactantAtomIds) ids.add(id);
    for (const id of step.productAtomIds) ids.add(id);
  }
  return [...ids];
}

/** Every arrow annotation id in a scheme, deduplicated. */
export function schemeArrowIds(scheme: ReactionScheme): string[] {
  const ids = new Set<string>();
  for (const step of scheme.steps) {
    for (const id of step.arrowIds) ids.add(id);
  }
  return [...ids];
}

/** The scheme an atom belongs to, if any. */
export function findSchemeForAtom(molecule: Molecule, atomId: string): ReactionScheme | null {
  for (const scheme of molecule.schemes ?? []) {
    for (const step of scheme.steps) {
      if (step.reactantAtomIds.includes(atomId) || step.productAtomIds.includes(atomId)) return scheme;
    }
  }
  return null;
}

/** The scheme an annotation belongs to, if any. */
export function findSchemeForAnnotation(molecule: Molecule, annotationId: string): ReactionScheme | null {
  for (const scheme of molecule.schemes ?? []) {
    for (const step of scheme.steps) {
      if (step.arrowIds.includes(annotationId)) return scheme;
    }
  }
  return null;
}

/** Human-scale summary used by the info panel: number of steps plus the
 * largest reactant/product side, without exposing raw atom ids. */
export interface SchemeSummary {
  steps: number;
  reactants: number;
  products: number;
  arrows: number;
}

export function summarizeScheme(scheme: ReactionScheme): SchemeSummary {
  let reactants = 0;
  let products = 0;
  let arrows = 0;
  for (const step of scheme.steps) {
    reactants = Math.max(reactants, step.reactantAtomIds.length);
    products = Math.max(products, step.productAtomIds.length);
    arrows += step.arrowIds.length;
  }
  return { steps: scheme.steps.length, reactants, products, arrows };
}
