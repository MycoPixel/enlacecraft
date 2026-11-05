import type {
  Annotation,
  ArrowAnnotation,
  Atom,
  Molecule,
  ReactionScheme,
  ReactionStep,
} from "../types/chemistry";
import { connectedComponents } from "./molecule";
import { nextId } from "./id";

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

/**
 * Vertical distance within which two arrows are read as belonging to the
 * same reaction row. A reaction is read left-to-right along one baseline;
 * arrows drawn for the same step may be a few pixels apart vertically
 * (hand placement, snapped grid), while a genuinely separate row is at
 * least a structure-height away. Kept as a plain world-unit constant so
 * the grouping is independent of the current zoom.
 */
export const REACTION_ROW_TOLERANCE = 40;

function arrowMidX(arrow: ArrowAnnotation): number {
  return (arrow.x1 + arrow.x2) / 2;
}

function arrowMidY(arrow: ArrowAnnotation): number {
  return (arrow.y1 + arrow.y2) / 2;
}

function rowMidY(row: ArrowAnnotation[]): number {
  return row.reduce((sum, arrow) => sum + arrowMidY(arrow), 0) / row.length;
}

/**
 * Groups selected straight arrows into left-to-right rows.
 *
 * A reaction row is a run of arrows sharing a baseline. Rows themselves are
 * returned top-to-bottom so a two-row drawing still reads in page order.
 * Non-arrow annotations in `arrowIds` are ignored: the caller's selection
 * can legitimately contain condition text and plus signs too.
 */
export function findReactionRows(
  annotations: Record<string, Annotation>,
  arrowIds: Iterable<string>
): ArrowAnnotation[][] {
  const arrows: ArrowAnnotation[] = [];
  const seen = new Set<string>();
  for (const id of arrowIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const ann = annotations[id];
    if (ann?.kind === "arrow") arrows.push(ann);
  }
  if (arrows.length === 0) return [];

  arrows.sort((a, b) => arrowMidY(a) - arrowMidY(b) || arrowMidX(a) - arrowMidX(b));

  const rows: ArrowAnnotation[][] = [];
  for (const arrow of arrows) {
    // Compare against the row's first arrow rather than its running mean:
    // one very long arrow should not drag the anchor far enough to swallow
    // an adjacent row.
    const row = rows.find((candidate) => Math.abs(arrowMidY(candidate[0]) - arrowMidY(arrow)) <= REACTION_ROW_TOLERANCE);
    if (row) row.push(arrow);
    else rows.push([arrow]);
  }

  for (const row of rows) row.sort((a, b) => arrowMidX(a) - arrowMidX(b));
  rows.sort((a, b) => rowMidY(a) - rowMidY(b));
  return rows;
}

interface StructureBox {
  atomIds: string[];
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
}

function structureBoxes(molecule: Molecule, atomIds: Iterable<string>): StructureBox[] {
  const ids = [...new Set(atomIds)].filter((id) => molecule.atoms[id]);
  return connectedComponents(molecule, ids)
    .map((component): StructureBox | null => {
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const id of component) {
        const atom = molecule.atoms[id];
        if (!atom) continue;
        left = Math.min(left, atom.x);
        right = Math.max(right, atom.x);
        top = Math.min(top, atom.y);
        bottom = Math.max(bottom, atom.y);
      }
      if (left === Infinity) return null;
      return {
        atomIds: component,
        left,
        right,
        top,
        bottom,
        cx: (left + right) / 2,
        cy: (top + bottom) / 2,
      };
    })
    .filter((box): box is StructureBox => box !== null)
    .sort((a, b) => a.cx - b.cx || a.cy - b.cy);
}

/** How far a structure may sit from a row's baseline before it is treated
 * as belonging to a different row (or not to the reaction at all). */
const ROW_ASSIGNMENT_TOLERANCE = 220;

/**
 * Builds one or more reaction schemes from the current selection.
 *
 * The selection has to contain both arrows and structures. Each arrow
 * becomes a step; structures left of the first arrow are its reactants,
 * structures between two arrows are the product of the earlier step and
 * the reactant of the later one, and structures right of the last arrow
 * are its products. A row with only one side populated is not a reaction,
 * so it is left out rather than inventing a half-step.
 *
 * `makeId` is injectable so tests can produce stable ids; the store uses
 * the same page-lifetime id counter as atoms and annotations.
 */
export function buildSchemesFromSelection(
  molecule: Molecule,
  annotations: Record<string, Annotation>,
  atomIds: Iterable<string>,
  annotationIds: Iterable<string>,
  makeId: () => string = nextId
): ReactionScheme[] {
  const rows = findReactionRows(annotations, annotationIds);
  if (rows.length === 0) return [];

  const boxes = structureBoxes(molecule, atomIds);
  if (boxes.length === 0) return [];

  const schemes: ReactionScheme[] = [];

  // Assign every structure to its nearest row. With one row this is just
  // "everything selected belongs to it"; with several it keeps a stacked
  // pair of reactions from stealing each other's structures.
  const rowForBox = (box: StructureBox): number => {
    let best = -1;
    let bestDistance = ROW_ASSIGNMENT_TOLERANCE;
    rows.forEach((row, index) => {
      const distance = Math.abs(box.cy - rowMidY(row));
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  };

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const inRow = boxes.filter((box) => rowForBox(box) === rowIndex);
    if (inRow.length === 0) continue;

    const steps: ReactionStep[] = [];
    for (let i = 0; i < row.length; i++) {
      const arrow = row[i];
      const mid = arrowMidX(arrow);
      const previous = i > 0 ? arrowMidX(row[i - 1]) : -Infinity;
      const next = i + 1 < row.length ? arrowMidX(row[i + 1]) : Infinity;

      const reactants = inRow
        .filter((box) => box.cx > previous && box.cx < mid)
        .flatMap((box) => box.atomIds);
      const products = inRow
        .filter((box) => box.cx > mid && box.cx < next)
        .flatMap((box) => box.atomIds);

      if (reactants.length === 0 || products.length === 0) continue;
      steps.push({
        id: makeId(),
        reactantAtomIds: reactants,
        productAtomIds: products,
        arrowIds: [arrow.id],
      });
    }

    if (steps.length > 0) schemes.push({ id: makeId(), steps });
  }

  return schemes;
}
