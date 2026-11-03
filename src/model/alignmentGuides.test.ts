import { describe, expect, test } from "vitest";
import type { ArrowAnnotation, Molecule, OrbitalAnnotation, TextAnnotation } from "../types/chemistry";
import { addAtom, addBond, emptyMolecule } from "./molecule";
import {
  alignBounds,
  annotationBounds,
  annotationBoundsAt,
  collectAlignmentTargets,
  pointBounds,
  structureBounds,
  translateBounds,
} from "./alignmentGuides";

function text(overrides: Partial<TextAnnotation> = {}): TextAnnotation {
  return { id: "t1", kind: "text", x: 10, y: 20, width: 100, height: 30, html: "", fontSize: 14, ...overrides };
}

describe("annotationBounds", () => {
  test("uses the box for text, shape, bracket and TLC annotations", () => {
    expect(annotationBounds(text())).toEqual({ left: 10, top: 20, right: 110, bottom: 50 });
  });

  test("normalizes a reversed arrow segment", () => {
    const ann: ArrowAnnotation = {
      id: "a1", kind: "arrow", x1: 100, y1: 80, x2: 20, y2: 30, variant: "forward",
    };
    expect(annotationBounds(ann)).toEqual({ left: 20, top: 30, right: 100, bottom: 80 });
  });

  test("orbital bounds surround the nucleus by one lobe length", () => {
    const ann: OrbitalAnnotation = {
      id: "o1", kind: "orbital", x: 50, y: 60, size: 20, angle: 0, variant: "p",
    };
    expect(annotationBounds(ann)).toEqual({ left: 30, top: 40, right: 70, bottom: 80 });
  });
});

describe("translateBounds / annotationBoundsAt", () => {
  test("translates every edge", () => {
    expect(translateBounds({ left: 0, top: 0, right: 10, bottom: 20 }, 5, -3)).toEqual({
      left: 5, top: -3, right: 15, bottom: 17,
    });
  });

  test("moves an annotation's box so its origin lands on the requested point", () => {
    expect(annotationBoundsAt(text(), { x: 0, y: 0 })).toEqual({ left: 0, top: 0, right: 100, bottom: 30 });
  });

  test("moves an arrow's box so its start point lands on the requested point", () => {
    const ann: ArrowAnnotation = {
      id: "a1", kind: "arrow", x1: 100, y1: 100, x2: 160, y2: 130, variant: "forward",
    };
    expect(annotationBoundsAt(ann, { x: 0, y: 0 })).toEqual({ left: 0, top: 0, right: 60, bottom: 30 });
  });
});

describe("alignBounds", () => {
  const moving = { left: 0, top: 0, right: 100, bottom: 100 };

  test("snaps the nearest edge pair and reports one guide", () => {
    const target = { left: 3, top: 200, right: 103, bottom: 300 };
    const result = alignBounds(moving, [target], 5);
    expect(result.dx).toBe(3);
    expect(result.dy).toBe(0);
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]).toMatchObject({ axis: "x", position: 3, start: 0, end: 300 });
  });

  test("prefers an exact centre match even when it is farther from the edges", () => {
    const target = { left: 10, top: 500, right: 90, bottom: 600 };
    const result = alignBounds(moving, [target], 5);
    expect(result.dx).toBe(0);
    expect(result.guides[0].position).toBe(50);
  });

  test("does nothing when every candidate is outside the threshold", () => {
    const target = { left: 200, top: 200, right: 300, bottom: 300 };
    expect(alignBounds(moving, [target], 5)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  test("aligns each axis independently against different targets", () => {
    const xTarget = { left: 2, top: 500, right: 102, bottom: 600 };
    const yTarget = { left: 500, top: 4, right: 600, bottom: 104 };
    const result = alignBounds(moving, [xTarget, yTarget], 5);
    expect(result.dx).toBe(2);
    expect(result.dy).toBe(4);
    expect(result.guides.map((g) => g.axis).sort()).toEqual(["x", "y"]);
  });

  test("chooses the closest target when several could match", () => {
    const near = { left: 1, top: 0, right: 101, bottom: 100 };
    const far = { left: 4, top: 0, right: 104, bottom: 100 };
    expect(alignBounds(moving, [far, near], 5).dx).toBe(1);
  });

  test("a non-positive threshold disables alignment", () => {
    const target = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(alignBounds(moving, [target], 0)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe("structureBounds", () => {
  test("an empty molecule has no bounds", () => {
    expect(structureBounds(emptyMolecule())).toHaveLength(0);
  });

  test("returns one box per connected fragment", () => {
    let mol: Molecule = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 20 }, "C");
    mol = addAtom(mol, "c", { x: 200, y: 100 }, "O");
    mol = addBond(mol, "bond1", "a", "b", 1, "none");
    expect(structureBounds(mol)).toEqual([
      { left: 0, top: 0, right: 40, bottom: 20 },
      { left: 200, top: 100, right: 200, bottom: 100 },
    ]);
  });
});

describe("collectAlignmentTargets", () => {
  test("includes structures and unexcluded annotations only", () => {
    let mol: Molecule = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
    const annotations = {
      keep: text({ id: "keep", x: 300, y: 300, width: 10, height: 10 }),
      moving: text({ id: "moving", x: 500, y: 500, width: 10, height: 10 }),
    };
    const targets = collectAlignmentTargets(mol, annotations, new Set(["moving"]));
    expect(targets).toEqual([
      { left: 0, top: 0, right: 0, bottom: 0 },
      { left: 300, top: 300, right: 310, bottom: 310 },
    ]);
  });
});

describe("pointBounds", () => {
  test("is a zero-size box at the point", () => {
    expect(pointBounds({ x: 7, y: -3 })).toEqual({ left: 7, top: -3, right: 7, bottom: -3 });
  });
});
