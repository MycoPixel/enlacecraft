import { beforeEach, describe, expect, test } from "vitest";
import type { ArrowAnnotation, Molecule, TextAnnotation } from "../../types/chemistry";
import { addAtom, emptyMolecule } from "../../model/molecule";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { snapAnnotationEndpoint, snapAnnotationMove } from "./annotationSnap";

function text(id: string, x: number, y: number, width = 50, height = 50): TextAnnotation {
  return { id, kind: "text", x, y, width, height, html: id, fontSize: 14 };
}

function arrow(id: string): ArrowAnnotation {
  return { id, kind: "arrow", x1: 0, y1: 0, x2: 10, y2: 0, variant: "forward" };
}

function reset(molecule: Molecule, annotations: Record<string, TextAnnotation | ArrowAnnotation>) {
  useMoleculeStore.setState({
    molecule,
    annotations,
    showGrid: false,
    alignmentGuides: [],
    view: { scale: 1, tx: 0, ty: 0 },
  });
}

beforeEach(() => {
  reset(emptyMolecule(), {});
});

describe("snapAnnotationMove", () => {
  test("prefers an alignment guide and leaves the other axis to the grid", () => {
    reset(emptyMolecule(), {
      moving: text("moving", 0, 0),
      target: text("target", 100, 0),
    });
    useMoleculeStore.setState({ showGrid: true });

    const p = snapAnnotationMove("moving", { x: 98, y: 100 }, false);

    // x is pulled 2px onto the target's left edge; y still lands on the grid.
    expect(p).toEqual({ x: 100, y: 96 });
    const guides = useMoleculeStore.getState().alignmentGuides;
    expect(guides).toHaveLength(1);
    expect(guides[0]).toMatchObject({ axis: "x", position: 100 });
  });

  test("falls back to the plain grid when nothing aligns", () => {
    reset(emptyMolecule(), { moving: text("moving", 0, 0), target: text("target", 500, 500) });
    useMoleculeStore.setState({ showGrid: true });

    expect(snapAnnotationMove("moving", { x: 49, y: 61 }, false)).toEqual({ x: 48, y: 72 });
    expect(useMoleculeStore.getState().alignmentGuides).toEqual([]);
  });

  test("Shift bypasses both guides and grid for the gesture", () => {
    reset(emptyMolecule(), { moving: text("moving", 0, 0), target: text("target", 100, 0) });
    useMoleculeStore.setState({ showGrid: true, alignmentGuides: [{ axis: "x", position: 1, start: 0, end: 1 }] });

    const p = snapAnnotationMove("moving", { x: 98, y: 100 }, true);

    expect(p).toEqual({ x: 98, y: 100 });
    expect(useMoleculeStore.getState().alignmentGuides).toEqual([]);
  });

  test("scales the threshold with zoom, so it stays a constant screen distance", () => {
    reset(emptyMolecule(), { moving: text("moving", 0, 0), target: text("target", 100, 0) });
    useMoleculeStore.setState({ view: { scale: 4, tx: 0, ty: 0 } });

    // At 4x, a 6px screen threshold is 1.5 world px: a 3-world-px gap no
    // longer snaps.
    expect(snapAnnotationMove("moving", { x: 97, y: 0 }, false).x).toBe(97);
  });
});

describe("snapAnnotationEndpoint", () => {
  test("aligns an arrow endpoint to a connected structure's edge", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "atom", { x: 200, y: 0 }, "C");
    reset(mol, { arrow: arrow("arrow") });

    const p = snapAnnotationEndpoint("arrow", { x: 202, y: 50 }, false);

    expect(p).toEqual({ x: 200, y: 50 });
    expect(useMoleculeStore.getState().alignmentGuides[0]).toMatchObject({ axis: "x", position: 200 });
  });
});
