import { describe, expect, test } from "vitest";
import { buildReactionRow, reactionRowWidth, type ReactionBuildInput } from "./reactionBuilder";
import { emptyMolecule, addAtom } from "../model/molecule";
import { importSmiles } from "../io/smilesImport";
import type { Annotation, ArrowAnnotation, Molecule, TextAnnotation } from "../types/chemistry";

function moleculeFromSmiles(smiles: string): Molecule {
  return importSmiles(smiles).molecule;
}

function annotationsOfKind<K extends Annotation["kind"]>(
  annotations: Record<string, Annotation>,
  kind: K
): Extract<Annotation, { kind: K }>[] {
  return Object.values(annotations).filter(
    (ann): ann is Extract<Annotation, { kind: K }> => ann.kind === kind
  );
}

function textOf(annotation: TextAnnotation): string {
  return annotation.html.replace(/<[^>]*>/g, "").trim();
}

function baseInput(overrides: Partial<ReactionBuildInput> = {}): ReactionBuildInput {
  return {
    reactants: [
      { molecule: moleculeFromSmiles("CCO") },
      { molecule: moleculeFromSmiles("CC(=O)O") },
    ],
    products: [{ molecule: moleculeFromSmiles("CC(=O)OCC") }],
    arrowVariant: "forward",
    ...overrides,
  };
}

const ORIGIN = { left: 500, baseline: 300 };

describe("buildReactionRow", () => {
  test("merges every component into the document and records them on one step", () => {
    const input = baseInput();
    const totalAtoms = [...input.reactants, ...input.products].reduce(
      (sum, component) => sum + Object.keys(component.molecule.atoms).length,
      0
    );

    const result = buildReactionRow(emptyMolecule(), {}, input, ORIGIN);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(Object.keys(result.molecule.atoms)).toHaveLength(totalAtoms);
    expect(result.atomIds).toHaveLength(totalAtoms);
    expect(result.scheme.steps).toHaveLength(1);
    expect(result.scheme.steps[0].reactantAtomIds).toHaveLength(
      input.reactants.reduce((sum, component) => sum + Object.keys(component.molecule.atoms).length, 0)
    );
    expect(result.scheme.steps[0].productAtomIds).toHaveLength(
      Object.keys(input.products[0].molecule.atoms).length
    );
    expect(result.molecule.schemes).toContain(result.scheme);
  });

  test("adds one plus sign between reactants, and none for a single product", () => {
    const result = buildReactionRow(emptyMolecule(), {}, baseInput(), ORIGIN);
    expect(result).not.toBeNull();
    if (!result) return;

    const pluses = annotationsOfKind(result.annotations, "text").filter(
      (ann) => textOf(ann) === "+"
    );
    expect(pluses).toHaveLength(1);
  });

  test("a multi-fragment name still gets a plus sign per fragment", () => {
    // "CC.[Na+]" parses to two disconnected components, as a salt name can.
    const result = buildReactionRow(
      emptyMolecule(),
      {},
      {
        reactants: [{ molecule: moleculeFromSmiles("CC.[Na+]") }],
        products: [{ molecule: moleculeFromSmiles("CCO") }],
        arrowVariant: "forward",
      },
      ORIGIN
    );
    expect(result).not.toBeNull();
    if (!result) return;

    const pluses = annotationsOfKind(result.annotations, "text").filter(
      (ann) => textOf(ann) === "+"
    );
    expect(pluses).toHaveLength(1);
  });

  test("places conditions above and below the arrow", () => {
    const result = buildReactionRow(
      emptyMolecule(),
      {},
      baseInput({ conditionsAbove: "H2SO4, heat", conditionsBelow: "reflux" }),
      ORIGIN
    );
    expect(result).not.toBeNull();
    if (!result) return;

    const arrow = annotationsOfKind(result.annotations, "arrow")[0];
    expect(arrow).toBeDefined();
    const arrowY = (arrow.y1 + arrow.y2) / 2;

    const texts = annotationsOfKind(result.annotations, "text");
    const above = texts.find((ann) => textOf(ann) === "H2SO4, heat");
    const below = texts.find((ann) => textOf(ann) === "reflux");
    expect(above).toBeDefined();
    expect(below).toBeDefined();
    expect(above!.y + above!.height / 2).toBeLessThan(arrowY);
    expect(below!.y + below!.height / 2).toBeGreaterThan(arrowY);

    // Centres are what cleanReaction aligns; the visible glyphs must not be
    // left hanging because the box was padded out to a generic width.
    const arrowMidX = (arrow.x1 + arrow.x2) / 2;
    for (const condition of [above!, below!]) {
      expect(condition.x + condition.width / 2).toBeCloseTo(arrowMidX, 0);
    }
    // "reflux" is ~44 units wide including padding; anything near the old
    // 120-unit floor would visibly shift the text left of the arrow.
    expect(below!.width).toBeLessThan(70);
  });

  test("carries the selected arrow variant onto the generated arrow", () => {
    const result = buildReactionRow(
      emptyMolecule(),
      {},
      baseInput({ arrowVariant: "equilibrium" }),
      ORIGIN
    );
    expect(result).not.toBeNull();
    if (!result) return;

    const arrow = annotationsOfKind(result.annotations, "arrow")[0] as ArrowAnnotation;
    expect(arrow.variant).toBe("equilibrium");
    expect(result.arrowIds).toEqual([arrow.id]);
  });

  test("translates the finished row to the requested origin", () => {
    const result = buildReactionRow(emptyMolecule(), {}, baseInput(), ORIGIN);
    expect(result).not.toBeNull();
    if (!result) return;

    let minX = Infinity;
    for (const id of result.atomIds) {
      minX = Math.min(minX, result.molecule.atoms[id].x);
    }
    for (const ann of Object.values(result.annotations)) {
      if (ann.kind === "arrow") minX = Math.min(minX, ann.x1, ann.x2);
      else minX = Math.min(minX, ann.x);
    }
    expect(minX).toBeCloseTo(ORIGIN.left, 0);

    const arrow = annotationsOfKind(result.annotations, "arrow")[0];
    expect((arrow.y1 + arrow.y2) / 2).toBeCloseTo(ORIGIN.baseline, 0);

    // The row really moved: it is nowhere near the internal temporary origin.
    expect(minX).toBeLessThan(10_000);
  });

  test("leaves existing atoms and annotations untouched", () => {
    const base = addAtom(emptyMolecule(), "existing", { x: -40, y: 12 }, "C");
    const existingAnnotation: TextAnnotation = {
      id: "note",
      kind: "text",
      x: -80,
      y: 40,
      width: 60,
      height: 20,
      html: "keep me",
      fontSize: 14,
    };

    const result = buildReactionRow(
      base,
      { note: existingAnnotation },
      baseInput(),
      ORIGIN
    );
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.molecule.atoms.existing).toEqual(base.atoms.existing);
    expect(result.annotations.note).toEqual(existingAnnotation);
  });

  test("returns null when either side has no usable structure", () => {
    const product = moleculeFromSmiles("CCO");
    expect(
      buildReactionRow(
        emptyMolecule(),
        {},
        { reactants: [], products: [{ molecule: product }], arrowVariant: "forward" },
        ORIGIN
      )
    ).toBeNull();
    expect(
      buildReactionRow(
        emptyMolecule(),
        {},
        { reactants: [{ molecule: product }], products: [], arrowVariant: "forward" },
        ORIGIN
      )
    ).toBeNull();
  });
  test("subscripts formula digits in conditions but leaves quantities and charges alone", () => {
    const result = buildReactionRow(
      emptyMolecule(),
      {},
      baseInput({
        conditionsAbove: "H2SO4, 24 h",
        conditionsBelow: "1:1, 80 °C, Fe3+",
      }),
      ORIGIN
    );
    expect(result).not.toBeNull();
    if (!result) return;

    const texts = annotationsOfKind(result.annotations, "text");
    const above = texts.find((ann) => textOf(ann) === "H2SO4, 24 h");
    const below = texts.find((ann) => textOf(ann) === "1:1, 80 °C, Fe3+");
    expect(above?.html).toBe("H<sub>2</sub>SO<sub>4</sub>, 24 h");
    expect(below?.html).toBe("1:1, 80 °C, Fe3+");
  });

  test("treats a coefficient as a prefix of its structure and keeps its atoms", () => {
    const result = buildReactionRow(
      emptyMolecule(),
      {},
      baseInput({
        reactants: [
          { molecule: moleculeFromSmiles("CCO"), coefficient: "2" },
          { molecule: moleculeFromSmiles("CC(=O)O"), coefficient: "3" },
        ],
      }),
      ORIGIN
    );
    expect(result).not.toBeNull();
    if (!result) return;

    const texts = annotationsOfKind(result.annotations, "text");
    const two = texts.find((ann) => textOf(ann) === "2");
    const three = texts.find((ann) => textOf(ann) === "3");
    const plus = texts.find((ann) => textOf(ann) === "+");
    expect(two?.coefficientFor?.length).toBeGreaterThan(0);
    expect(three?.coefficientFor?.length).toBeGreaterThan(0);

    const leftOf = (ids: string[]) =>
      Math.min(...ids.map((id) => result.molecule.atoms[id]?.x ?? Infinity));
    expect(two!.x + two!.width).toBeLessThanOrEqual(leftOf(two!.coefficientFor!));
    expect(three!.x + three!.width).toBeLessThanOrEqual(leftOf(three!.coefficientFor!));

    // The plus sign belongs between the first structure and the second's
    // coefficient ("A + 3 B"), not pinned to the coefficient's centre.
    expect(plus).toBeDefined();
    expect(plus!.x + plus!.width / 2).toBeLessThan(three!.x);
  });
});

describe("reactionRowWidth", () => {
  test("grows with more components on a side", () => {
    const one = { molecule: moleculeFromSmiles("CCO") };
    const two = { molecule: moleculeFromSmiles("CCO") };
    const products = [{ molecule: moleculeFromSmiles("CC(=O)O") }];
    expect(reactionRowWidth([one, two], products)).toBeGreaterThan(
      reactionRowWidth([one], products)
    );
  });

  test("counts a coefficient's visible width too", () => {
    const products = [{ molecule: moleculeFromSmiles("CC(=O)O") }];
    const plain = [{ molecule: moleculeFromSmiles("CCO") }];
    const withCoefficient = [{ molecule: moleculeFromSmiles("CCO"), coefficient: "12" }];
    expect(reactionRowWidth(withCoefficient, products)).toBeGreaterThan(
      reactionRowWidth(plain, products)
    );
  });
});
