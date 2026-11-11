import type { Annotation, ArrowAnnotation, Molecule, ReactionScheme, TextAnnotation } from "../types/chemistry";
import { connectedComponents, rotateAtoms } from "../model/molecule";
import { schemeArrowIds, schemeAtomIds } from "../model/reactionSchemes";
import { annotationPlainText, reactionConditionsForArrow } from "./reactionInterpret";
import { mapReactionAtoms } from "./reactionMapping";

/**
 * "Clean Up Reaction" for a drawn scheme.
 *
 * The rule is the same one ChemDraw's command follows: keep every structure's
 * internal geometry exactly as drawn, move each connected structure onto one
 * baseline, space them evenly, and put the arrows and their condition text in
 * the gaps. This is a layout pass over whole structures, never a re-generation
 * of their coordinates, so stereochemistry, wedges, labels and lone pairs all
 * survive untouched.
 *
 * The module is pure: it returns new molecule/annotation objects and leaves
 * the caller to decide whether the result is worth an undo entry. The store
 * compares object identity, so a reaction that is already tidy comes back as
 * the same objects and does not create a no-op undo step.
 */

export interface ReactionLayoutResult {
  molecule: Molecule;
  annotations: Record<string, Annotation>;
  /** Number of schemes that were actually laid out. */
  count: number;
}

/** Space between a structure and an arrow. */
const ARROW_GAP = 44;
/** Space between two structures on the same side of an arrow (where a plus
 * sign would sit). */
const STRUCTURE_GAP = 52;
/** Minimum visible arrow length when the surrounding structures are crowded. */
const MIN_ARROW_LENGTH = 48;
/** Space between a stoichiometric coefficient and the structure it counts. */
const COEFFICIENT_GAP = 16;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
  /** Left edge used for spacing, including a coefficient's reserved space.
   * Equal to `left` when the structure has no coefficient. */
  visualLeft?: number;
}

function boxFor(molecule: Molecule, atomIds: string[]): Box | null {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const id of atomIds) {
    const atom = molecule.atoms[id];
    if (!atom) continue;
    left = Math.min(left, atom.x);
    right = Math.max(right, atom.x);
    top = Math.min(top, atom.y);
    bottom = Math.max(bottom, atom.y);
  }
  if (left === Infinity) return null;
  return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function arrowMidY(arrow: ArrowAnnotation): number {
  return (arrow.y1 + arrow.y2) / 2;
}

/** Rotates each product onto the reactant it shares the most mapped atoms
 * with, about its own centre. Used by "Augmented clean". */
function alignProductsByMap(
  molecule: Molecule,
  scheme: ReactionScheme,
  numbers: Map<string, number>
): Molecule {
  let out = molecule;

  for (const step of scheme.steps) {
    const reactantComponents = connectedComponents(out, step.reactantAtomIds);
    const productComponents = connectedComponents(out, step.productAtomIds);

    for (const product of productComponents) {
      const productNumbers = new Map<number, string>();
      for (const id of product) {
        const n = numbers.get(id);
        if (n != null) productNumbers.set(n, id);
      }
      if (productNumbers.size < 2) continue;

      let best: { pairs: [string, string][]; count: number } = { pairs: [], count: 0 };
      for (const reactant of reactantComponents) {
        const pairs: [string, string][] = [];
        for (const id of reactant) {
          const n = numbers.get(id);
          if (n == null) continue;
          const productId = productNumbers.get(n);
          if (productId) pairs.push([productId, id]);
        }
        if (pairs.length > best.count) best = { pairs, count: pairs.length };
      }
      if (best.pairs.length < 2) continue;

      const productCentroid = centroid(out, best.pairs.map(([productId]) => productId));
      const reactantCentroid = centroid(out, best.pairs.map(([, reactantId]) => reactantId));
      if (!productCentroid || !reactantCentroid) continue;

      let sin = 0;
      let cos = 0;
      for (const [productId, reactantId] of best.pairs) {
        const p = out.atoms[productId];
        const r = out.atoms[reactantId];
        if (!p || !r) continue;
        const px = p.x - productCentroid.x;
        const py = p.y - productCentroid.y;
        const rx = r.x - reactantCentroid.x;
        const ry = r.y - reactantCentroid.y;
        sin += px * ry - py * rx;
        cos += px * rx + py * ry;
      }
      const angle = Math.atan2(sin, cos);
      if (!Number.isFinite(angle) || Math.abs(angle) < 1e-6) continue;
      out = rotateAtoms(out, product, productCentroid, angle);
    }
  }

  return out;
}

function centroid(molecule: Molecule, atomIds: string[]): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const id of atomIds) {
    const atom = molecule.atoms[id];
    if (!atom) continue;
    x += atom.x;
    y += atom.y;
    count += 1;
  }
  return count > 0 ? { x: x / count, y: y / count } : null;
}

/**
 * Lays out one scheme. `augmented` first maps the reaction (when it has no
 * usable map) and rotates each product onto its mapped reactant, which is
 * what makes a product drawn in a different orientation line up with the
 * starting material it came from.
 */
export function cleanReaction(
  molecule: Molecule,
  annotations: Record<string, Annotation>,
  scheme: ReactionScheme,
  options: { augmented?: boolean } = {}
): ReactionLayoutResult {
  const arrowIds = schemeArrowIds(scheme);
  const arrows = arrowIds
    .map((id) => annotations[id])
    .filter((ann): ann is ArrowAnnotation => ann?.kind === "arrow");

  const atomIds = schemeAtomIds(scheme);
  const components = connectedComponents(molecule, atomIds);
  if (components.length === 0) {
    return { molecule, annotations, count: 0 };
  }

  let workingMolecule = molecule;
  let numbers: Map<string, number> | null = null;

  if (options.augmented) {
    const mapping = mapReactionAtoms(
      workingMolecule,
      scheme.steps.map((step) => ({
        reactants: connectedComponents(workingMolecule, step.reactantAtomIds),
        products: connectedComponents(workingMolecule, step.productAtomIds),
      }))
    );
    if (mapping) {
      numbers = mapping.numbers;
      workingMolecule = alignProductsByMap(workingMolecule, scheme, mapping.numbers);
    }
  }

  const boxes = components
    .map((ids) => ({ ids, box: boxFor(workingMolecule, ids) }))
    .filter((entry): entry is { ids: string[]; box: Box } => entry.box !== null)
    .sort((a, b) => a.box.cx - b.box.cx || a.box.cy - b.box.cy);

  if (boxes.length === 0) {
    return { molecule, annotations, count: 0 };
  }

  const rowY = arrows.length > 0 ? median(arrows.map(arrowMidY)) : median(boxes.map((entry) => entry.box.cy));

  const indexByAtom = new Map<string, number>();
  boxes.forEach((entry, index) => {
    for (const id of entry.ids) indexByAtom.set(id, index);
  });

  // A coefficient belongs to the leftmost connected structure it names, so a
  // salt resolved into several fragments still gets one coefficient in front
  // of the whole group.
  const coefficientByComponent = new Map<number, TextAnnotation>();
  for (const ann of Object.values(annotations)) {
    if (ann.kind !== "text" || !ann.coefficientFor?.length) continue;
    let index: number | undefined;
    for (const atomId of ann.coefficientFor) {
      const candidate = indexByAtom.get(atomId);
      if (candidate === undefined) continue;
      if (index === undefined || candidate < index) index = candidate;
    }
    if (index !== undefined) coefficientByComponent.set(index, ann);
  }

  // A gap that contains an arrow needs room for the arrow plus its clear
  // space on both sides; gaps between structures on the same side only need
  // room for a plus sign.
  const arrowGaps = new Set<number>();
  for (const step of scheme.steps) {
    const reactantIndices = step.reactantAtomIds
      .map((id) => indexByAtom.get(id))
      .filter((index): index is number => index !== undefined);
    const productIndices = step.productAtomIds
      .map((id) => indexByAtom.get(id))
      .filter((index): index is number => index !== undefined);
    if (reactantIndices.length === 0 || productIndices.length === 0) continue;
    const left = Math.max(...reactantIndices);
    const right = Math.min(...productIndices);
    if (right === left + 1) arrowGaps.add(left);
  }

  // Translate every structure onto the baseline, preserving its own shape.
  const moved = new Map<string, { x: number; y: number }>();
  const placedBoxes: Box[] = [];
  const annotationUpdates = new Map<string, Annotation>();
  let cursor: number | null = null;

  boxes.forEach((entry, index) => {
    const gapBefore =
      index === 0
        ? 0
        : arrowGaps.has(index - 1)
          ? ARROW_GAP * 2 + MIN_ARROW_LENGTH
          : STRUCTURE_GAP;
    const baseLeft = cursor === null ? entry.box.left : cursor + gapBefore;
    const coefficient = coefficientByComponent.get(index);
    const reserve = coefficient ? coefficient.width + COEFFICIENT_GAP : 0;
    const targetLeft = baseLeft + reserve;
    const dx = targetLeft - entry.box.left;
    const dy = rowY - entry.box.cy;
    for (const id of entry.ids) {
      const atom = workingMolecule.atoms[id];
      if (!atom) continue;
      moved.set(id, { x: atom.x + dx, y: atom.y + dy });
    }
    const placed: Box = {
      left: entry.box.left + dx,
      right: entry.box.right + dx,
      top: entry.box.top + dy,
      bottom: entry.box.bottom + dy,
      cx: entry.box.cx + dx,
      cy: entry.box.cy + dy,
      visualLeft: baseLeft,
    };
    placedBoxes.push(placed);
    if (coefficient) {
      annotationUpdates.set(coefficient.id, {
        ...coefficient,
        x: baseLeft,
        y: rowY - coefficient.height / 2,
      });
    }
    cursor = placed.right;
  });

  // The arrow sits in the gap between the rightmost reactant and the
  // leftmost product. Using component order (not raw coordinates) keeps a
  // multi-step row with a shared intermediate consistent.

  for (const step of scheme.steps) {
    const stepArrows = step.arrowIds
      .map((id) => annotations[id])
      .filter((ann): ann is ArrowAnnotation => ann?.kind === "arrow");
    if (stepArrows.length === 0) continue;

    const reactantIndices = step.reactantAtomIds
      .map((id) => indexByAtom.get(id))
      .filter((index): index is number => index !== undefined);
    const productIndices = step.productAtomIds
      .map((id) => indexByAtom.get(id))
      .filter((index): index is number => index !== undefined);
    if (reactantIndices.length === 0 || productIndices.length === 0) continue;

    const leftIndex = Math.max(...reactantIndices);
    const rightIndex = Math.min(...productIndices);
    const leftEdge = placedBoxes[leftIndex]?.right;
    const rightEdge = placedBoxes[rightIndex]?.left;
    if (leftEdge === undefined || rightEdge === undefined) continue;

    const slotStart = leftEdge + ARROW_GAP;
    const slotEnd = rightEdge - ARROW_GAP;
    const span = Math.max(MIN_ARROW_LENGTH * stepArrows.length, slotEnd - slotStart);
    const slotWidth = span / stepArrows.length;

    stepArrows.forEach((arrow, arrowIndex) => {
      const slotCenter = slotStart + slotWidth * (arrowIndex + 0.5);
      const length = Math.min(110, Math.max(MIN_ARROW_LENGTH, slotWidth * 0.6));
      const reversed = arrow.x2 < arrow.x1;
      const startX = slotCenter - length / 2;
      const endX = slotCenter + length / 2;
      const next: ArrowAnnotation = {
        ...arrow,
        x1: reversed ? endX : startX,
        x2: reversed ? startX : endX,
        y1: rowY,
        y2: rowY,
      };
      annotationUpdates.set(arrow.id, next);

      // Conditions move with their own arrow, so "above" and "below" stay
      // attached to the step they describe.
      const conditions = reactionConditionsForArrow(annotations, arrow);
      const oldMidY = arrowMidY(arrow);
      for (const part of [...conditions.above, ...conditions.below]) {
        if (part.kind !== "text") continue;
        const ann = annotations[part.annotationId];
        if (ann?.kind !== "text" || annotationUpdates.has(ann.id)) continue;
        // Centre the caption over the arrow and keep its original vertical
        // offset, so "above" stays above by the same visual distance.
        const offsetY = ann.y + ann.height / 2 - oldMidY;
        annotationUpdates.set(ann.id, {
          ...ann,
          x: slotCenter - ann.width / 2,
          y: rowY + offsetY - ann.height / 2,
        });
      }
    });
  }

  // Plus signs are punctuation between structures, not conditions. Put each
  // one in the nearest gap that does not contain an arrow.
  const plusSigns = Object.values(annotations).filter(
    (ann): ann is Extract<Annotation, { kind: "text" }> =>
      ann.kind === "text" &&
      annotationPlainText(ann.html) === "+" &&
      Math.abs(ann.y + ann.height / 2 - rowY) <= 180
  );

  if (plusSigns.length > 0) {
    const arrowBoxes = [...annotationUpdates.values()]
      .filter((ann): ann is ArrowAnnotation => ann.kind === "arrow")
      .map((ann) => ({
        left: Math.min(ann.x1, ann.x2) - 8,
        right: Math.max(ann.x1, ann.x2) + 8,
      }));

    const gaps: { left: number; right: number }[] = [];
    for (let i = 0; i + 1 < placedBoxes.length; i++) {
      const left = placedBoxes[i].right;
      // Stop before the next structure's coefficient, so "A + 2 B" puts the
      // plus between A and the 2 rather than on top of it.
      const right = placedBoxes[i + 1].visualLeft ?? placedBoxes[i + 1].left;
      const mid = (left + right) / 2;
      if (arrowBoxes.some((box) => mid >= box.left && mid <= box.right)) continue;
      gaps.push({ left, right });
    }

    for (const sign of plusSigns) {
      let best: { left: number; right: number; distance: number } | null = null;
      for (const gap of gaps) {
        const mid = (gap.left + gap.right) / 2;
        const distance = Math.abs(sign.x + sign.width / 2 - mid);
        if (!best || distance < best.distance) best = { ...gap, distance };
      }
      if (!best) continue;
      annotationUpdates.set(sign.id, {
        ...sign,
        x: (best.left + best.right) / 2 - sign.width / 2,
        y: rowY - sign.height / 2,
      });
    }
  }

  const atoms = { ...workingMolecule.atoms };
  let moleculeChanged = false;
  for (const [id, position] of moved) {
    const atom = atoms[id];
    if (!atom) continue;
    if (atom.x === position.x && atom.y === position.y) continue;
    atoms[id] = { ...atom, x: position.x, y: position.y };
    moleculeChanged = true;
  }

  if (numbers) {
    for (const [id, number] of numbers) {
      const atom = atoms[id];
      if (!atom || atom.mapNumber === number) continue;
      atoms[id] = { ...atom, mapNumber: number };
      moleculeChanged = true;
    }
  }

  const nextAnnotations = Object.keys(annotations).length > 0 ? { ...annotations } : annotations;
  let annotationsChanged = false;
  for (const [id, ann] of annotationUpdates) {
    nextAnnotations[id] = ann;
    annotationsChanged = true;
  }

  return {
    molecule: moleculeChanged ? { ...workingMolecule, atoms } : workingMolecule,
    annotations: annotationsChanged ? nextAnnotations : annotations,
    count: moleculeChanged || annotationsChanged ? 1 : 0,
  };
}

/** Moves one annotation by (dx, dy) without touching its style. */
function translateAnnotation(ann: Annotation, dx: number, dy: number): Annotation {
  if (ann.kind === "arrow") {
    return { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy };
  }
  return { ...ann, x: ann.x + dx, y: ann.y + dy };
}

/**
 * Lays out several reaction schemes as aligned rows, one scheme per row.
 *
 * Each row is first cleaned on its own (so its arrows, gaps and conditions
 * are tidy), then every row's left edge is aligned to a common margin and
 * the rows are stacked with equal vertical spacing. That is what makes a
 * multi-step synthesis read as a grid instead of a scatter of independently
 * placed reactions.
 *
 * Pure, like cleanReaction: the caller decides whether the result is worth an
 * undo entry.
 */
export function layoutSchemeGrid(
  molecule: Molecule,
  annotations: Record<string, Annotation>,
  schemes: ReactionScheme[],
  options: { augmented?: boolean; rowGap?: number } = {}
): ReactionLayoutResult {
  if (schemes.length === 0) return { molecule, annotations, count: 0 };

  const rowGap = options.rowGap ?? 80;
  let workingMolecule = molecule;
  let workingAnnotations = annotations;

  // Tidy each scheme first. Schemes in one document are normally disjoint;
  // when a multi-step row shares an intermediate the later clean simply sees
  // the already-tidy shared structure.
  for (const scheme of schemes) {
    const result = cleanReaction(workingMolecule, workingAnnotations, scheme, {
      augmented: options.augmented,
    });
    workingMolecule = result.molecule;
    workingAnnotations = result.annotations;
  }

  const rows = schemes
    .map((scheme) => {
      const atomIds = schemeAtomIds(scheme);
      const atomBox = boxFor(workingMolecule, atomIds);
      if (!atomBox) return null;

      // Include the row's arrows in its box so a long arrow is not clipped
      // by the row above it.
      let left = atomBox.left;
      let right = atomBox.right;
      let top = atomBox.top;
      let bottom = atomBox.bottom;
      for (const id of schemeArrowIds(scheme)) {
        const ann = workingAnnotations[id];
        if (ann?.kind !== "arrow") continue;
        left = Math.min(left, ann.x1, ann.x2);
        right = Math.max(right, ann.x1, ann.x2);
        top = Math.min(top, ann.y1, ann.y2);
        bottom = Math.max(bottom, ann.y1, ann.y2);
      }
      return { scheme, box: { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 } };
    })
    .filter((row): row is { scheme: ReactionScheme; box: Box } => row !== null)
    .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);

  if (rows.length === 0) return { molecule, annotations, count: 0 };

  const commonLeft = Math.min(...rows.map((row) => row.box.left));
  const atoms = { ...workingMolecule.atoms };
  const nextAnnotations = { ...workingAnnotations };
  let cursorTop = rows[0].box.top;
  let changed = false;

  for (const row of rows) {
    const dx = commonLeft - row.box.left;
    const dy = cursorTop - row.box.top;
    const rowHeight = row.box.bottom - row.box.top;
    cursorTop += rowHeight + rowGap;

    if (dx === 0 && dy === 0) continue;

    const rowAtomIds = new Set(schemeAtomIds(row.scheme));
    for (const id of rowAtomIds) {
      const atom = atoms[id];
      if (!atom) continue;
      atoms[id] = { ...atom, x: atom.x + dx, y: atom.y + dy };
      changed = true;
    }

    // Arrows, conditions, stoichiometric coefficients and plus signs all move
    // with their row; only the atoms are stored on the scheme itself.
    const annotationIds = new Set<string>(schemeArrowIds(row.scheme));
    for (const id of schemeArrowIds(row.scheme)) {
      const arrow = workingAnnotations[id];
      if (arrow?.kind !== "arrow") continue;
      const conditions = reactionConditionsForArrow(workingAnnotations, arrow);
      for (const part of [...conditions.above, ...conditions.below]) {
        if (part.kind === "text") annotationIds.add(part.annotationId);
      }
    }
    for (const ann of Object.values(workingAnnotations)) {
      if (ann.kind === "text" && ann.coefficientFor?.length) {
        if (ann.coefficientFor.some((id) => rowAtomIds.has(id))) annotationIds.add(ann.id);
        continue;
      }
      if (ann.kind !== "text" || annotationPlainText(ann.html) !== "+") continue;
      const cy = ann.y + ann.height / 2;
      const cx = ann.x + ann.width / 2;
      if (
        cy >= row.box.top - rowGap &&
        cy <= row.box.bottom + rowGap &&
        cx >= row.box.left - 100 &&
        cx <= row.box.right + 100
      ) {
        annotationIds.add(ann.id);
      }
    }

    for (const id of annotationIds) {
      const ann = workingAnnotations[id];
      if (!ann) continue;
      nextAnnotations[id] = translateAnnotation(ann, dx, dy);
      changed = true;
    }
  }

  return {
    molecule: changed ? { ...workingMolecule, atoms } : workingMolecule,
    annotations: changed ? nextAnnotations : workingAnnotations,
    count: changed ? rows.length : 0,
  };
}
