import { describe, expect, test } from "vitest";
import type { Annotation, ArrowAnnotation, Molecule, ReactionScheme, TextAnnotation } from "../types/chemistry";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { cleanReaction, layoutSchemeGrid } from "./reactionLayout";

function arrow(id: string, x1: number, x2: number, y = 0): ArrowAnnotation {
  return { id, kind: "arrow", x1, y1: y, x2, y2: y, variant: "forward" };
}

function text(id: string, x: number, y: number, html: string): TextAnnotation {
  return { id, kind: "text", x, y, width: 70, height: 20, html, fontSize: 12 };
}

function reactionMolecule(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "r1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "r2", { x: 42, y: 0 }, "C");
  mol = addBond(mol, "rb", "r1", "r2");
  mol = addAtom(mol, "p1", { x: 500, y: 60 }, "C");
  mol = addAtom(mol, "p2", { x: 542, y: 60 }, "C");
  mol = addBond(mol, "pb", "p1", "p2");
  return mol;
}

function scheme(): ReactionScheme {
  return {
    id: "s1",
    steps: [{ id: "st1", reactantAtomIds: ["r1", "r2"], productAtomIds: ["p1", "p2"], arrowIds: ["a1"] }],
  };
}

describe("cleanReaction", () => {
  test("aligns the arrow row and moves structures onto the same baseline", () => {
    const mol = reactionMolecule();
    const annotations: Record<string, Annotation> = { a1: arrow("a1", 200, 260, 20) };

    const result = cleanReaction(mol, annotations, scheme());
    expect(result.count).toBe(1);

    const resultArrow = result.annotations.a1 as ArrowAnnotation;
    expect(resultArrow.y1).toBe(resultArrow.y2);

    const r1 = result.molecule.atoms.r1;
    const r2 = result.molecule.atoms.r2;
    const p1 = result.molecule.atoms.p1;
    const p2 = result.molecule.atoms.p2;
    expect(r1.y).toBe(r2.y);
    expect(p1.y).toBe(p2.y);
    expect(r1.y).toBe(p1.y);
  });

  test("preserves each structure's internal geometry", () => {
    const mol = reactionMolecule();
    const annotations: Record<string, Annotation> = { a1: arrow("a1", 200, 260, 20) };
    const before = Math.hypot(mol.atoms.r2.x - mol.atoms.r1.x, mol.atoms.r2.y - mol.atoms.r1.y);

    const result = cleanReaction(mol, annotations, scheme());
    const after = Math.hypot(
      result.molecule.atoms.r2.x - result.molecule.atoms.r1.x,
      result.molecule.atoms.r2.y - result.molecule.atoms.r1.y
    );
    expect(after).toBeCloseTo(before, 6);
  });

  test("spaces connected structures without overlapping them", () => {
    const mol = reactionMolecule();
    const annotations: Record<string, Annotation> = { a1: arrow("a1", 200, 260, 20) };
    const result = cleanReaction(mol, annotations, scheme());

    expect(result.molecule.atoms.r2.x).toBeLessThan(result.molecule.atoms.p1.x);
    const arrowResult = result.annotations.a1 as ArrowAnnotation;
    expect(Math.min(arrowResult.x1, arrowResult.x2)).toBeGreaterThan(result.molecule.atoms.r2.x);
    expect(Math.max(arrowResult.x1, arrowResult.x2)).toBeLessThan(result.molecule.atoms.p1.x);
  });

  test("moves condition text with its arrow", () => {
    const mol = reactionMolecule();
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 200, 260, 20),
      heat: text("heat", 205, -40, "heat"),
    };
    const result = cleanReaction(mol, annotations, scheme());
    const resultArrow = result.annotations.a1 as ArrowAnnotation;
    const resultText = result.annotations.heat as TextAnnotation;
    const arrowMid = (resultArrow.x1 + resultArrow.x2) / 2;
    const textMid = resultText.x + resultText.width / 2;

    // The caption stays centred over the arrow it describes.
    expect(Math.abs(textMid - arrowMid)).toBeLessThan(1);
    expect(resultText.y).toBeLessThan(resultArrow.y1);
  });

  test("puts plus signs in the gap between structures on the same side", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 120, y: 0 }, "C");
    mol = addAtom(mol, "p", { x: 320, y: 0 }, "C");
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 200, 260),
      plus: text("plus", 60, -8, "+"),
    };
    const step: ReactionScheme = {
      id: "s1",
      steps: [{ id: "st1", reactantAtomIds: ["a", "b"], productAtomIds: ["p"], arrowIds: ["a1"] }],
    };

    const result = cleanReaction(mol, annotations, step);
    const plus = result.annotations.plus as TextAnnotation;
    const mid = plus.x + plus.width / 2;
    expect(mid).toBeGreaterThan(result.molecule.atoms.a.x);
    expect(mid).toBeLessThan(result.molecule.atoms.b.x);
  });

  test("returns the same objects when there is no scheme content", () => {
    const mol = reactionMolecule();
    const annotations: Record<string, Annotation> = {};
    const empty: ReactionScheme = { id: "s1", steps: [] };
    const result = cleanReaction(mol, annotations, empty);
    expect(result.count).toBe(0);
    expect(result.molecule).toBe(mol);
    expect(result.annotations).toBe(annotations);
  });
});

describe("layoutSchemeGrid", () => {
  function twoRowMolecule(): Molecule {
    let mol = emptyMolecule();
    // Row A near the top, starting at x = 0.
    mol = addAtom(mol, "r1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "r2", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "rb", "r1", "r2");
    mol = addAtom(mol, "p1", { x: 500, y: 60 }, "C");
    mol = addAtom(mol, "p2", { x: 542, y: 60 }, "C");
    mol = addBond(mol, "pb", "p1", "p2");
    // Row B lower down and shifted right.
    mol = addAtom(mol, "r3", { x: 300, y: 400 }, "C");
    mol = addAtom(mol, "r4", { x: 342, y: 400 }, "C");
    mol = addBond(mol, "rb2", "r3", "r4");
    mol = addAtom(mol, "p3", { x: 800, y: 460 }, "C");
    mol = addAtom(mol, "p4", { x: 842, y: 460 }, "C");
    mol = addBond(mol, "pb2", "p3", "p4");
    return mol;
  }

  const rowA: ReactionScheme = {
    id: "s1",
    steps: [{ id: "st1", reactantAtomIds: ["r1", "r2"], productAtomIds: ["p1", "p2"], arrowIds: ["a1"] }],
  };
  const rowB: ReactionScheme = {
    id: "s2",
    steps: [{ id: "st2", reactantAtomIds: ["r3", "r4"], productAtomIds: ["p3", "p4"], arrowIds: ["a2"] }],
  };

  test("cleans each row, then aligns their left edges and stacks them", () => {
    const mol = twoRowMolecule();
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 200, 260, 20),
      a2: arrow("a2", 500, 560, 420),
    };

    const result = layoutSchemeGrid(mol, annotations, [rowA, rowB]);
    expect(result.count).toBe(2);

    const minX = (...ids: string[]) => Math.min(...ids.map((id) => result.molecule.atoms[id].x));
    const minY = (...ids: string[]) => Math.min(...ids.map((id) => result.molecule.atoms[id].y));
    const maxY = (...ids: string[]) => Math.max(...ids.map((id) => result.molecule.atoms[id].y));

    // Both rows start at the same left margin…
    expect(minX("r1", "r2", "p1", "p2")).toBeCloseTo(0, 6);
    expect(minX("r3", "r4", "p3", "p4")).toBeCloseTo(0, 6);

    // …and the second row sits below the first with the default gap.
    expect(minY("r3", "r4", "p3", "p4") - maxY("r1", "r2", "p1", "p2")).toBeCloseTo(80, 6);
  });

  test("an already-tidy grid comes back unchanged", () => {
    const mol = twoRowMolecule();
    const annotations: Record<string, Annotation> = {
      a1: arrow("a1", 200, 260, 20),
      a2: arrow("a2", 500, 560, 420),
    };
    const first = layoutSchemeGrid(mol, annotations, [rowA, rowB]);
    const second = layoutSchemeGrid(first.molecule, first.annotations, [rowA, rowB]);
    expect(second.count).toBe(0);
    expect(second.molecule).toBe(first.molecule);
    // cleanReaction rebuilds each arrow object even when it lands in the
    // same place, so idempotence is checked by value, not by identity.
    expect(second.annotations).toEqual(first.annotations);
  });

  test("returns the same objects when there are no schemes", () => {
    const mol = twoRowMolecule();
    const annotations: Record<string, Annotation> = { a1: arrow("a1", 0, 60) };
    const result = layoutSchemeGrid(mol, annotations, []);
    expect(result.count).toBe(0);
    expect(result.molecule).toBe(mol);
    expect(result.annotations).toBe(annotations);
  });
});
