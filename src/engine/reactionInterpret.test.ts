import { describe, expect, test } from "vitest";
import type { Annotation, ArrowAnnotation, Molecule, ReactionScheme, TextAnnotation } from "../types/chemistry";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { countReactionRoles, interpretReaction } from "./reactionInterpret";

function arrow(id: string, x1: number, x2: number, y = 0): ArrowAnnotation {
  return { id, kind: "arrow", x1, y1: y, x2, y2: y, variant: "forward" };
}

function text(id: string, x: number, y: number, html: string): TextAnnotation {
  return { id, kind: "text", x, y, width: 70, height: 20, html, fontSize: 12 };
}

function chain(ids: string[], spacing = 80): Molecule {
  let mol = emptyMolecule();
  ids.forEach((id, i) => {
    mol = addAtom(mol, id, { x: i * spacing, y: 0 }, "C");
    if (i > 0) mol = addBond(mol, `b${i}`, ids[i - 1], id);
  });
  return mol;
}

describe("interpretReaction", () => {
  test("reads one step into reactants and products", () => {
    const mol = chain(["r1", "r2", "p1", "p2"]);
    const annotations: Record<string, Annotation> = { a1: arrow("a1", 140, 200) };
    const scheme: ReactionScheme = {
      id: "s1",
      steps: [{ id: "st1", reactantAtomIds: ["r1", "r2"], productAtomIds: ["p1", "p2"], arrowIds: ["a1"] }],
    };

    const reading = interpretReaction(mol, annotations, scheme);
    expect(reading.steps).toHaveLength(1);
    expect(reading.steps[0].reactants).toEqual([{ kind: "structure", atomIds: ["r1", "r2"] }]);
    expect(reading.steps[0].products).toEqual([{ kind: "structure", atomIds: ["p1", "p2"] }]);
    expect(reading.atomRoles.get("r1")).toBe("reactant");
    expect(reading.atomRoles.get("p1")).toBe("product");
  });

  test("keeps an intermediate in both steps but labels it as a product", () => {
    const mol = chain(["a", "b", "c"]);
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 40, 80),
      a2: arrow("a2", 120, 160),
    };
    const scheme: ReactionScheme = {
      id: "s1",
      steps: [
        { id: "st1", reactantAtomIds: ["a"], productAtomIds: ["b"], arrowIds: ["a1"] },
        { id: "st2", reactantAtomIds: ["b"], productAtomIds: ["c"], arrowIds: ["a2"] },
      ],
    };

    const reading = interpretReaction(mol, annotations, scheme);
    expect(reading.steps).toHaveLength(2);
    expect(reading.steps[0].products[0]).toEqual({ kind: "structure", atomIds: ["b"] });
    expect(reading.steps[1].reactants[0]).toEqual({ kind: "structure", atomIds: ["b"] });
    expect(reading.atomRoles.get("b")).toBe("product");
    expect(reading.intermediateAtomIds.has("b")).toBe(true);
  });

  test("attaches text above and below the arrow, skipping plus signs", () => {
    const mol = chain(["a", "b"]);
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 100, 160),
      heat: text("heat", 105, -45, "heat"),
      solvent: text("solvent", 105, 45, "EtOH"),
      plus: text("plus", 40, -8, "+"),
    };
    const scheme: ReactionScheme = {
      id: "s1",
      steps: [{ id: "st1", reactantAtomIds: ["a"], productAtomIds: ["b"], arrowIds: ["a1"] }],
    };

    const reading = interpretReaction(mol, annotations, scheme);
    expect(reading.steps[0].above).toEqual([{ kind: "text", annotationId: "heat" }]);
    expect(reading.steps[0].below).toEqual([{ kind: "text", annotationId: "solvent" }]);
    expect(reading.annotationRoles.get("heat")).toBe("above");
    expect(reading.annotationRoles.get("solvent")).toBe("below");
    expect(reading.annotationRoles.has("plus")).toBe(false);
  });

  test("ignores atoms that are not part of the scheme", () => {
    const mol = chain(["a", "b", "outsider"]);
    const annotations: Record<string, Annotation> = { a1: arrow("a1", 100, 160) };
    const scheme: ReactionScheme = {
      id: "s1",
      steps: [{ id: "st1", reactantAtomIds: ["a"], productAtomIds: ["b"], arrowIds: ["a1"] }],
    };

    const reading = interpretReaction(mol, annotations, scheme);
    expect(reading.atomRoles.has("outsider")).toBe(false);
  });

  test("counts roles for the accessibility description", () => {
    const mol = chain(["a", "b", "c"]);
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 40, 80),
      heat: text("heat", 40, -40, "heat"),
    };
    const scheme: ReactionScheme = {
      id: "s1",
      steps: [{ id: "st1", reactantAtomIds: ["a"], productAtomIds: ["b", "c"], arrowIds: ["a1"] }],
    };

    const counts = countReactionRoles([interpretReaction(mol, annotations, scheme)]);
    expect(counts.reactants).toBe(1);
    expect(counts.products).toBe(2);
    expect(counts.conditions).toBe(1);
  });
});
