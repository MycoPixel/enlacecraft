import type {
  Annotation,
  ArrowAnnotation,
  Molecule,
  ReactionScheme,
} from "../types/chemistry";
import { annotationBounds } from "../model/alignmentGuides";
import { connectedComponents } from "../model/molecule";

/**
 * Reading a reaction scheme the way a chemist reads it.
 *
 * A `ReactionScheme` is deliberately flat: each step stores the atom ids on
 * either side of its arrow. That is enough to save and re-export a ChemDraw
 * reaction, but not enough to answer "which structure is the reactant?" or
 * "what conditions sit above this arrow?". This module turns the stored
 * ids plus the drawing's geometry into an ordered, role-tagged reading:
 *
 *   reactant structures  →  arrow  →  product structures
 *                           ↑ ↓
 *                        conditions
 *
 * It is pure and store-independent so both the canvas overlay and the
 * accessibility description can consume the same interpretation.
 */

export type ReactionRole = "reactant" | "product" | "above" | "below";

export type ReactionPart =
  | { kind: "structure"; atomIds: string[] }
  | { kind: "text"; annotationId: string };

export interface InterpretedStep {
  stepId: string;
  arrowIds: string[];
  reactants: ReactionPart[];
  products: ReactionPart[];
  above: ReactionPart[];
  below: ReactionPart[];
}

export interface ReactionInterpretation {
  schemeId: string;
  steps: InterpretedStep[];
  /** Role of each atom, for the canvas overlay. Products win over reactants
   * so an intermediate is shown once, as the product it first is. */
  atomRoles: Map<string, ReactionRole>;
  /** Role of each condition/label annotation. */
  annotationRoles: Map<string, ReactionRole>;
  /** Atoms that appear as a product of one step and a reactant of the next. */
  intermediateAtomIds: Set<string>;
}

/** Plain text of a rich-text annotation, for checking whether a label is
 * just a plus sign. Deliberately tiny: this never renders anything, it only
 * needs to distinguish "+" from a reagent caption. */
export function annotationPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function structureParts(molecule: Molecule, atomIds: string[]): ReactionPart[] {
  const existing = atomIds.filter((id) => molecule.atoms[id]);
  if (existing.length === 0) return [];
  return connectedComponents(molecule, existing)
    .filter((component) => component.length > 0)
    .map((component) => ({ kind: "structure", atomIds: component }));
}

/**
 * Text annotations that belong to one arrow's conditions.
 *
 * Geometry is the only signal available: a caption is "on" an arrow when its
 * box overlaps the arrow horizontally and sits above or below it, close
 * enough to read as part of the same step. A plus sign between two
 * structures is explicitly skipped — it is punctuation in the row, not a
 * condition.
 */
export function reactionConditionsForArrow(
  annotations: Record<string, Annotation>,
  arrow: ArrowAnnotation
): { above: ReactionPart[]; below: ReactionPart[] } {
  const midX = (arrow.x1 + arrow.x2) / 2;
  const midY = (arrow.y1 + arrow.y2) / 2;
  const length = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1);
  // Conditions are conventionally centred on the arrow, but a long reagent
  // name can overhang either end. Scale the horizontal window with the
  // arrow so a short arrow does not grab a caption from the next step.
  const horizontalSlack = Math.max(28, length * 0.75);
  const verticalReach = Math.max(120, length * 1.5);

  const above: { part: ReactionPart; x: number }[] = [];
  const below: { part: ReactionPart; x: number }[] = [];

  for (const ann of Object.values(annotations)) {
    if (ann.kind !== "text") continue;
    const text = annotationPlainText(ann.html);
    if (!text || text === "+") continue;

    const bounds = annotationBounds(ann);
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.top + bounds.bottom) / 2;
    if (Math.abs(cx - midX) > horizontalSlack + (bounds.right - bounds.left) / 2) continue;
    if (Math.abs(cy - midY) > verticalReach) continue;

    const part: ReactionPart = { kind: "text", annotationId: ann.id };
    if (cy < midY) above.push({ part, x: bounds.left });
    else below.push({ part, x: bounds.left });
  }

  above.sort((a, b) => a.x - b.x);
  below.sort((a, b) => a.x - b.x);
  return { above: above.map((entry) => entry.part), below: below.map((entry) => entry.part) };
}

/** Interprets one scheme into ordered steps and per-object roles. */
export function interpretReaction(
  molecule: Molecule,
  annotations: Record<string, Annotation>,
  scheme: ReactionScheme
): ReactionInterpretation {
  const atomRoles = new Map<string, ReactionRole>();
  const annotationRoles = new Map<string, ReactionRole>();
  const firstReactants = new Set<string>();
  const productAtoms = new Set<string>();
  const reactantAtoms = new Set<string>();

  const steps: InterpretedStep[] = scheme.steps.map((step, stepIndex) => {
    const arrows = step.arrowIds
      .map((id) => annotations[id])
      .filter((ann): ann is ArrowAnnotation => ann?.kind === "arrow");

    const above: ReactionPart[] = [];
    const below: ReactionPart[] = [];
    for (const arrow of arrows) {
      const conditions = reactionConditionsForArrow(annotations, arrow);
      above.push(...conditions.above);
      below.push(...conditions.below);
    }

    const reactants = structureParts(molecule, step.reactantAtomIds);
    const products = structureParts(molecule, step.productAtomIds);

    for (const part of reactants) {
      if (part.kind === "structure") for (const id of part.atomIds) reactantAtoms.add(id);
    }
    for (const part of products) {
      if (part.kind === "structure") for (const id of part.atomIds) productAtoms.add(id);
    }
    // Only the first step's reactants are starting materials; a structure
    // between two arrows is also a reactant, but it is already a product.
    if (stepIndex === 0) {
      for (const part of reactants) {
        if (part.kind === "structure") for (const id of part.atomIds) firstReactants.add(id);
      }
    }

    return {
      stepId: step.id,
      arrowIds: step.arrowIds,
      reactants,
      products,
      above,
      below,
    };
  });

  // Products first, then reactants, so an intermediate keeps its product
  // label (the same precedence ChemDraw's interpretation uses).
  for (const part of steps.flatMap((step) => step.products)) {
    if (part.kind === "structure") for (const id of part.atomIds) atomRoles.set(id, "product");
  }
  for (const part of steps.flatMap((step) => step.reactants)) {
    if (part.kind !== "structure") continue;
    for (const id of part.atomIds) if (!atomRoles.has(id)) atomRoles.set(id, "reactant");
  }
  for (const step of steps) {
    for (const part of step.above) {
      if (part.kind === "text") annotationRoles.set(part.annotationId, "above");
    }
    for (const part of step.below) {
      if (part.kind === "text") annotationRoles.set(part.annotationId, "below");
    }
  }

  const intermediateAtomIds = new Set<string>();
  for (const id of productAtoms) if (reactantAtoms.has(id) && !firstReactants.has(id)) intermediateAtomIds.add(id);

  return { schemeId: scheme.id, steps, atomRoles, annotationRoles, intermediateAtomIds };
}

export interface ReactionRoleCounts {
  reactants: number;
  products: number;
  intermediates: number;
  conditions: number;
}

/** Aggregated counts for the accessibility description and status line. */
export function countReactionRoles(interpretations: ReactionInterpretation[]): ReactionRoleCounts {
  let reactants = 0;
  let products = 0;
  let conditions = 0;
  const intermediates = new Set<string>();
  const reactantsSeen = new Set<string>();
  const productsSeen = new Set<string>();

  for (const interpretation of interpretations) {
    for (const id of interpretation.intermediateAtomIds) intermediates.add(id);
    for (const [id, role] of interpretation.atomRoles) {
      if (role === "reactant" && !reactantsSeen.has(id)) {
        reactantsSeen.add(id);
        reactants += 1;
      } else if (role === "product" && !productsSeen.has(id)) {
        productsSeen.add(id);
        products += 1;
      }
    }
    conditions += interpretation.annotationRoles.size;
  }

  return { reactants, products, intermediates: intermediates.size, conditions };
}
