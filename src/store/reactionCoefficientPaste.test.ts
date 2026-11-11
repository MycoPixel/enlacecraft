import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { emptyMolecule, extractFragment } from "../model/molecule";
import { importSmiles } from "../io/smilesImport";

const state = () => useMoleculeStore.getState();

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: emptyMolecule(),
    annotations: {},
    selected: new Set(),
    selectedAnnotationIds: new Set(),
    selectedCycleId: null,
    groups: [],
    userTemplates: [],
    past: [],
    future: [],
    hasUnsavedChanges: false,
    language: "en",
    view: { scale: 1, tx: 0, ty: 0 },
    canvasSize: { width: 800, height: 600 },
  });
});

/** Builds a row with a coefficient, then returns the coefficient annotation
 * and the reactant atom ids it belongs to. */
function buildCoefficientRow() {
  const schemeId = state().buildReaction({
    reactants: [{ molecule: importSmiles("CCO").molecule, coefficient: "2" }],
    products: [{ molecule: importSmiles("CC(=O)O").molecule }],
    arrowVariant: "forward",
  });
  expect(schemeId).not.toBeNull();

  const scheme = state().molecule.schemes![0];
  const reactantIds = scheme.steps[0].reactantAtomIds;
  const coefficient = Object.values(state().annotations).find(
    (ann) => ann.kind === "text" && ann.coefficientFor?.length
  );
  expect(coefficient?.kind).toBe("text");
  if (coefficient?.kind !== "text") throw new Error("missing coefficient annotation");
  expect(coefficient.coefficientFor).toEqual(reactantIds);

  return { reactantIds, coefficient };
}

function pastedCoefficient(originalId: string) {
  const copies = Object.values(state().annotations).filter(
    (ann) => ann.kind === "text" && ann.coefficientFor?.length && ann.id !== originalId
  );
  expect(copies).toHaveLength(1);
  const copy = copies[0];
  if (copy.kind !== "text") throw new Error("not a text annotation");
  return copy;
}

describe("stoichiometric coefficient metadata", () => {
  test("survives copy/paste by re-pointing at the pasted atoms", () => {
    const { reactantIds, coefficient } = buildCoefficientRow();
    const fragment = extractFragment(state().molecule, reactantIds);

    state().pasteFragment({ molecule: fragment, annotations: [coefficient] });

    const pasted = pastedCoefficient(coefficient.id);
    expect(pasted.coefficientFor).toHaveLength(reactantIds.length);
    expect(pasted.coefficientFor!.every((id) => !!state().molecule.atoms[id])).toBe(true);
    expect(pasted.coefficientFor!.some((id) => reactantIds.includes(id))).toBe(false);
    expect(pasted.html).toBe("2");
  });

  test("survives saving and pasting a user template", () => {
    const { reactantIds, coefficient } = buildCoefficientRow();
    state().setSelected(new Set(reactantIds));
    state().setSelectedAnnotationIds(new Set([coefficient.id]));

    state().saveUserTemplate("coefficient row");
    const template = state().userTemplates[state().userTemplates.length - 1];
    expect(template).toBeDefined();
    const templateCoefficient = template.annotations.find(
      (ann) => ann.kind === "text" && ann.coefficientFor?.length
    );
    expect(templateCoefficient?.kind).toBe("text");
    if (templateCoefficient?.kind !== "text") return;
    expect(templateCoefficient.coefficientFor).toEqual(reactantIds);

    state().pasteFragment({ molecule: template.molecule, annotations: template.annotations });

    const pasted = pastedCoefficient(templateCoefficient.id);
    expect(pasted.coefficientFor!.every((id) => !!state().molecule.atoms[id])).toBe(true);
    expect(pasted.coefficientFor!.some((id) => reactantIds.includes(id))).toBe(false);
  });

  test("drops coefficientFor when its structure is not part of the paste", () => {
    const { coefficient } = buildCoefficientRow();

    state().pasteFragment({ molecule: emptyMolecule(), annotations: [coefficient] });

    const copies = Object.values(state().annotations).filter(
      (ann) => ann.kind === "text" && ann.id !== coefficient.id
    );
    expect(copies).toHaveLength(1);
    const copy = copies[0];
    if (copy.kind !== "text") return;
    expect(copy.coefficientFor).toBeUndefined();
  });
});
