import type {
  Annotation,
  ArrowAnnotation,
  ArrowHeadSize,
  ArrowVariant,
  Molecule,
  ReactionScheme,
} from "../types/chemistry";
import { boundingBox, connectedComponents, insertMolecule } from "../model/molecule";
import { nextId } from "../model/id";
import { cleanReaction as cleanReactionImpl } from "./reactionLayout";
import { escapeHtmlText, formatFormulaHtml, formulaSegments } from "./formulaFormat";

/**
 * Builds a whole one-step reaction row from resolved structures.
 *
 * The dialog only resolves text (names/SMILES) to molecules; this module owns
 * the drawing half: merging the structures into the document, putting the
 * plus signs in the right gaps, creating the arrow/conditions, grouping it all
 * into a real ReactionScheme, and reusing the same layout pass as "Clean
 * Reaction" so a generated scheme is indistinguishable from a hand-drawn one.
 *
 * Everything is built at a far-away temporary position first. That matters:
 * cleanReaction's condition/plus attachment is purely geometric, so building
 * at the visible origin could make it grab unrelated text from an existing
 * drawing. Once the row is tidy, only the new atoms/annotations are
 * translated to the requested insertion point.
 *
 * Pure and store-independent: the caller decides whether to commit, so it is
 * easy to test and can never leave half a reaction behind.
 */

export interface ReactionComponent {
  molecule: Molecule;
  /** Optional stoichiometric coefficient drawn immediately before the
   * structure ("2" in "2 H2 + O2"). Free text so fractions like "1/2" work. */
  coefficient?: string;
}

export interface ReactionBuildInput {
  reactants: ReactionComponent[];
  products: ReactionComponent[];
  arrowVariant: ArrowVariant;
  /** Free-text, placed centred above / below the arrow. */
  conditionsAbove?: string;
  conditionsBelow?: string;
  barb?: "full" | "single";
  headSize?: ArrowHeadSize;
}

/** Where the finished row should land. `left` is the row's left edge and
 * `baseline` the arrow's y coordinate, both in world units. */
export interface ReactionBuildOrigin {
  left: number;
  baseline: number;
}

export interface ReactionBuildResult {
  molecule: Molecule;
  annotations: Record<string, Annotation>;
  scheme: ReactionScheme;
  /** Every atom in the new scheme, for selection/highlighting. */
  atomIds: string[];
  /** The connecting arrow's annotation id. */
  arrowIds: string[];
}

/** Gap between two structures on the same side of the arrow — matches
 * engine/reactionLayout.ts's own STRUCTURE_GAP, so the pre-layout row and
 * the cleaned row agree before the layout pass runs. */
const SAME_SIDE_GAP = 52;
/** Gap across the arrow: ARROW_GAP * 2 + MIN_ARROW_LENGTH in reactionLayout. */
const CROSS_SIDE_GAP = 136;
const ARROW_SIDE_GAP = 44;
const ARROW_LENGTH = 48;

// Same box the sidebar's plus tool and addPlusAnnotation use.
const PLUS_WIDTH = 26;
const PLUS_HEIGHT = 30;
const PLUS_FONT_SIZE = 22;

const CONDITION_HEIGHT = 26;
const CONDITION_GAP = 14;
const CONDITION_FONT_SIZE = 14;

// Coefficients use the same visible size as an atom label, so "2 H2" reads as
// one phrase rather than two unrelated pieces of text.
const COEFFICIENT_FONT_SIZE = 16;
const COEFFICIENT_HEIGHT = 28;
const COEFFICIENT_GAP = 16;
const COEFFICIENT_PADDING = 12;

/**
 * Width of a condition text box, in world units.
 *
 * cleanReaction centres the *box* over the arrow, while TextAnnotationView
 * left-aligns its content — so the width has to match the rendered glyphs.
 * Too wide (the original 120-unit floor) leaves short conditions visibly
 * left of centre; too narrow wraps them onto a second line. The box is
 * border-box, so the glyph width plus 5 units of padding per side is the
 * smallest correct width.
 *
 * Measured with a canvas when the DOM is available (the real app), which is
 * exact for the current font. Vitest/jsdom has no canvas backend, so the
 * per-character estimate keeps the pure engine usable there.
 */
const CONDITION_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const CONDITION_PADDING = 12;
/** Chrome/Safari render <sub> at about 83% of the parent size; 0.8 leaves a
 * little extra room so a formula never wraps. */
const SUBSCRIPT_SCALE = 0.8;

let conditionMeasureCtx: CanvasRenderingContext2D | null | undefined;

function measureContext(): CanvasRenderingContext2D | null {
  if (conditionMeasureCtx === undefined) {
    try {
      conditionMeasureCtx =
        typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    } catch {
      conditionMeasureCtx = null;
    }
  }
  return conditionMeasureCtx ?? null;
}

function measureTextRun(text: string, fontSize: number): number {
  if (!text) return 0;
  const ctx = measureContext();
  if (ctx) {
    ctx.font = `${fontSize}px ${CONDITION_FONT_FAMILY}`;
    return ctx.measureText(text).width;
  }

  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.3;
    else if (/[0-9]/.test(ch)) em += 0.56;
    else if (/[A-Z]/.test(ch)) em += 0.66;
    else if (/[a-z]/.test(ch)) em += 0.47;
    else if (/[.,:;'!|]/.test(ch)) em += 0.3;
    else em += 0.45;
  }
  return em * fontSize;
}

function conditionBoxWidth(text: string): number {
  const glyphs = formulaSegments(text).reduce(
    (sum, segment) =>
      sum + measureTextRun(segment.text, segment.sub ? CONDITION_FONT_SIZE * SUBSCRIPT_SCALE : CONDITION_FONT_SIZE),
    0
  );
  return Math.min(360, Math.max(36, glyphs + CONDITION_PADDING));
}

function coefficientBoxWidth(text: string): number {
  return Math.min(120, Math.max(20, measureTextRun(text, COEFFICIENT_FONT_SIZE) + COEFFICIENT_PADDING));
}

/** Deliberately far from any realistic drawing. See the module comment for
 * why the row is built off-canvas and translated afterwards. */
const TEMP_LEFT = 1_000_000;
const TEMP_BASELINE = 1_000_000;

interface StructureBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
}

function hasAtoms(mol: Molecule): boolean {
  return Object.keys(mol.atoms).length > 0;
}

function boxForAtoms(molecule: Molecule, atomIds: Iterable<string>): StructureBox | null {
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
  return { left, right, top, bottom, cx: (left + right) / 2 };
}

/** One box per connected structure, left-to-right — a single named salt can
 * legitimately resolve to more than one fragment, and each fragment still
 * deserves its own plus sign in the row. */
function structureBoxes(molecule: Molecule, atomIds: string[]): StructureBox[] {
  return connectedComponents(molecule, atomIds)
    .map((component) => boxForAtoms(molecule, component))
    .filter((box): box is StructureBox => box !== null)
    .sort((a, b) => a.cx - b.cx);
}

function translateAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if (annotation.kind === "arrow") {
    return { ...annotation, x1: annotation.x1 + dx, y1: annotation.y1 + dy, x2: annotation.x2 + dx, y2: annotation.y2 + dy };
  }
  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
}

/** Approximate final row width, used by the store to centre a new reaction
 * when the canvas is empty (the row is translated into place after layout,
 * so this only has to be close). */
export function reactionRowWidth(reactants: ReactionComponent[], products: ReactionComponent[]): number {
  const widthOf = (list: ReactionComponent[]) =>
    list.reduce((sum, component) => {
      const box = boundingBox(component.molecule);
      const structureWidth = box ? box.maxX - box.minX : 0;
      const coefficient = component.coefficient?.trim();
      const coefficientWidth = coefficient ? coefficientBoxWidth(coefficient) + COEFFICIENT_GAP : 0;
      return sum + structureWidth + coefficientWidth;
    }, 0);
  const r = reactants.filter((component) => hasAtoms(component.molecule)).length;
  const p = products.filter((component) => hasAtoms(component.molecule)).length;
  return widthOf(reactants) + widthOf(products) + Math.max(0, r - 1) * SAME_SIDE_GAP + Math.max(0, p - 1) * SAME_SIDE_GAP + CROSS_SIDE_GAP;
}

interface InsertedComponent {
  component: ReactionComponent;
  atomIds: string[];
  box: StructureBox;
}

/**
 * Builds and lays out one reaction row. Returns null when either side is
 * empty after filtering out blank components.
 */
export function buildReactionRow(
  molecule: Molecule,
  annotations: Record<string, Annotation>,
  input: ReactionBuildInput,
  origin: ReactionBuildOrigin
): ReactionBuildResult | null {
  const reactants = input.reactants.filter((component) => hasAtoms(component.molecule));
  const products = input.products.filter((component) => hasAtoms(component.molecule));
  if (reactants.length === 0 || products.length === 0) return null;

  let mol = molecule;
  const nextAnnotations: Record<string, Annotation> = { ...annotations };
  const newAnnotationIds = new Set<string>();
  const reactantAtomIds: string[] = [];
  const productAtomIds: string[] = [];

  // Lay the components out left-to-right on a temporary baseline. The final
  // layout comes from cleanReaction below; these positions only need to keep
  // the order and the side grouping unambiguous.
  let cursor = TEMP_LEFT;
  const insertSide = (
    components: ReactionComponent[],
    atomIds: string[],
    gapAfterLast: number
  ): InsertedComponent[] => {
    const insertedComponents: InsertedComponent[] = [];
    components.forEach((component, index) => {
      const box = boundingBox(component.molecule);
      if (!box) return;
      const dx = cursor - box.minX;
      const dy = TEMP_BASELINE - (box.minY + box.maxY) / 2;
      const inserted = insertMolecule(mol, component.molecule, dx, dy);
      mol = inserted.mol;
      atomIds.push(...inserted.newAtomIds);
      const placedBox = boxForAtoms(mol, inserted.newAtomIds);
      if (placedBox) insertedComponents.push({ component, atomIds: inserted.newAtomIds, box: placedBox });
      cursor += box.maxX - box.minX + (index < components.length - 1 ? SAME_SIDE_GAP : gapAfterLast);
    });
    return insertedComponents;
  };
  const reactantEntries = insertSide(reactants, reactantAtomIds, CROSS_SIDE_GAP);
  const productEntries = insertSide(products, productAtomIds, 0);

  const addPlusSigns = (atomIds: string[]) => {
    const boxes = structureBoxes(mol, atomIds);
    for (let i = 0; i + 1 < boxes.length; i++) {
      const centerX = (boxes[i].right + boxes[i + 1].left) / 2;
      const id = nextId();
      nextAnnotations[id] = {
        id,
        kind: "text",
        x: centerX - PLUS_WIDTH / 2,
        y: TEMP_BASELINE - PLUS_HEIGHT / 2,
        width: PLUS_WIDTH,
        height: PLUS_HEIGHT,
        html: "<b>+</b>",
        fontSize: PLUS_FONT_SIZE,
      };
      newAnnotationIds.add(id);
    }
  };
  addPlusSigns(reactantAtomIds);
  addPlusSigns(productAtomIds);

  // A coefficient is its own text box immediately left of its structure. The
  // atom ids in `coefficientFor` let Clean Reaction keep the two together
  // after it has re-spaced the row.
  const addCoefficients = (entries: InsertedComponent[]) => {
    for (const entry of entries) {
      const coefficient = entry.component.coefficient?.trim();
      if (!coefficient) continue;
      const width = coefficientBoxWidth(coefficient);
      const id = nextId();
      nextAnnotations[id] = {
        id,
        kind: "text",
        x: entry.box.left - COEFFICIENT_GAP - width,
        y: TEMP_BASELINE - COEFFICIENT_HEIGHT / 2,
        width,
        height: COEFFICIENT_HEIGHT,
        html: escapeHtmlText(coefficient),
        fontSize: COEFFICIENT_FONT_SIZE,
        coefficientFor: [...entry.atomIds],
      };
      newAnnotationIds.add(id);
    }
  };
  addCoefficients([...reactantEntries, ...productEntries]);

  const reactantBoxes = structureBoxes(mol, reactantAtomIds);
  const productBoxes = structureBoxes(mol, productAtomIds);
  if (reactantBoxes.length === 0 || productBoxes.length === 0) return null;

  const arrowStart = reactantBoxes[reactantBoxes.length - 1].right + ARROW_SIDE_GAP;
  const arrowEnd = arrowStart + ARROW_LENGTH;
  const arrowId = nextId();
  nextAnnotations[arrowId] = {
    id: arrowId,
    kind: "arrow",
    x1: arrowStart,
    y1: TEMP_BASELINE,
    x2: arrowEnd,
    y2: TEMP_BASELINE,
    variant: input.arrowVariant,
    ...(input.barb ? { barb: input.barb } : {}),
    ...(input.headSize ? { headSize: input.headSize } : {}),
  };
  newAnnotationIds.add(arrowId);

  const arrowMidX = (arrowStart + arrowEnd) / 2;
  const addCondition = (text: string | undefined, above: boolean) => {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return;
    const width = conditionBoxWidth(trimmed);
    const id = nextId();
    nextAnnotations[id] = {
      id,
      kind: "text",
      x: arrowMidX - width / 2,
      y: above ? TEMP_BASELINE - CONDITION_GAP - CONDITION_HEIGHT : TEMP_BASELINE + CONDITION_GAP,
      width,
      height: CONDITION_HEIGHT,
      html: formatFormulaHtml(trimmed),
      fontSize: CONDITION_FONT_SIZE,
    };
    newAnnotationIds.add(id);
  };
  addCondition(input.conditionsAbove, true);
  addCondition(input.conditionsBelow, false);

  const scheme: ReactionScheme = {
    id: nextId(),
    steps: [
      {
        id: nextId(),
        reactantAtomIds,
        productAtomIds,
        arrowIds: [arrowId],
      },
    ],
  };
  mol = { ...mol, schemes: [...(mol.schemes ?? []), scheme] };

  // The same tidy pass the "Clean Reaction" command runs, so spacing,
  // condition centring and plus-sign placement cannot drift from it.
  const cleaned = cleanReactionImpl(mol, nextAnnotations, scheme);
  mol = cleaned.molecule;
  const laidOutAnnotations = cleaned.annotations;

  // Find the row's natural top-left and arrow y, then move only the newly
  // created objects to the requested insertion point.
  let minX = Infinity;
  for (const id of [...reactantAtomIds, ...productAtomIds]) {
    const atom = mol.atoms[id];
    if (atom) minX = Math.min(minX, atom.x);
  }
  for (const id of newAnnotationIds) {
    const ann = laidOutAnnotations[id];
    if (!ann) continue;
    if (ann.kind === "arrow") minX = Math.min(minX, ann.x1, ann.x2);
    else {
      minX = Math.min(minX, ann.x);
    }
  }
  if (!Number.isFinite(minX)) return null;

  const arrow = laidOutAnnotations[arrowId] as ArrowAnnotation | undefined;
  const rowBaseline = arrow ? (arrow.y1 + arrow.y2) / 2 : TEMP_BASELINE;
  const dx = origin.left - minX;
  const dy = origin.baseline - rowBaseline;

  const atoms = { ...mol.atoms };
  for (const id of [...reactantAtomIds, ...productAtomIds]) {
    const atom = atoms[id];
    if (!atom) continue;
    atoms[id] = { ...atom, x: atom.x + dx, y: atom.y + dy };
  }
  mol = { ...mol, atoms };

  const finalAnnotations = { ...laidOutAnnotations };
  for (const id of newAnnotationIds) {
    const ann = finalAnnotations[id];
    if (ann) finalAnnotations[id] = translateAnnotation(ann, dx, dy);
  }

  return {
    molecule: mol,
    annotations: finalAnnotations,
    scheme,
    atomIds: [...reactantAtomIds, ...productAtomIds],
    arrowIds: [arrowId],
  };
}
