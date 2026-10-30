// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { emptyMolecule } from "../model/molecule";

function reset() {
  useMoleculeStore.setState({
    molecule: emptyMolecule(),
    annotations: {},
    selected: new Set<string>(),
    selectedAnnotationIds: new Set<string>(),
    arrowHeadStyle: "auto",
    arrowTailStyle: "auto",
    arrowShaftStyle: "auto",
    arrowDashed: false,
  });
}

beforeEach(reset);

describe("arrow style defaults on newly drawn arrows", () => {
  test("auto defaults leave the annotation's style fields unset", () => {
    const id = useMoleculeStore.getState().addArrowAnnotation({ x: 0, y: 0 }, { x: 100, y: 0 }, "forward", "full", "medium");
    const ann = useMoleculeStore.getState().annotations[id];
    expect(ann.kind).toBe("arrow");
    if (ann.kind !== "arrow") return;
    expect(ann.headStyle).toBeUndefined();
    expect(ann.tailStyle).toBeUndefined();
    expect(ann.shaftStyle).toBeUndefined();
    expect(ann.dashed).toBeUndefined();
  });

  test("explicit overrides and the dashed flag are applied at creation", () => {
    const id = useMoleculeStore.getState().addArrowAnnotation(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      "forward",
      "full",
      "large",
      true,
      "open",
      "full",
      "dashed",
    );
    const ann = useMoleculeStore.getState().annotations[id];
    if (ann.kind !== "arrow") throw new Error("not an arrow");
    expect(ann.dashed).toBe(true);
    expect(ann.headStyle).toBe("open");
    expect(ann.tailStyle).toBe("full");
    expect(ann.shaftStyle).toBe("dashed");
  });
});

describe("per-annotation style setters", () => {
  test("setting a style changes only that arrow, and auto clears it", () => {
    const id = useMoleculeStore.getState().addArrowAnnotation({ x: 0, y: 0 }, { x: 100, y: 0 }, "forward");
    useMoleculeStore.getState().setArrowHeadStyleOf(id, "circle");
    let ann = useMoleculeStore.getState().annotations[id];
    if (ann.kind !== "arrow") throw new Error("not an arrow");
    expect(ann.headStyle).toBe("circle");

    useMoleculeStore.getState().setArrowHeadStyleOf(id, "auto");
    ann = useMoleculeStore.getState().annotations[id];
    if (ann.kind !== "arrow") throw new Error("not an arrow");
    expect(ann.headStyle).toBeUndefined();
  });

  test("tail and shaft setters work the same way", () => {
    const id = useMoleculeStore.getState().addArrowAnnotation({ x: 0, y: 0 }, { x: 100, y: 0 }, "forward");
    useMoleculeStore.getState().setArrowTailStyleOf(id, "open");
    useMoleculeStore.getState().setArrowShaftStyleOf(id, "bold");
    let ann = useMoleculeStore.getState().annotations[id];
    if (ann.kind !== "arrow") throw new Error("not an arrow");
    expect(ann.tailStyle).toBe("open");
    expect(ann.shaftStyle).toBe("bold");

    useMoleculeStore.getState().setArrowTailStyleOf(id, "auto");
    useMoleculeStore.getState().setArrowShaftStyleOf(id, "auto");
    ann = useMoleculeStore.getState().annotations[id];
    if (ann.kind !== "arrow") throw new Error("not an arrow");
    expect(ann.tailStyle).toBeUndefined();
    expect(ann.shaftStyle).toBeUndefined();
  });
});

describe("dative and hollow-wedge bond creation", () => {
  test("addBond(..., dative=true) creates a dative bond in one step", () => {
    const s = useMoleculeStore.getState();
    const a1 = s.addAtom({ x: 0, y: 0 }, "N");
    const a2 = s.addAtom({ x: 60, y: 0 }, "Fe");
    const pastBefore = useMoleculeStore.getState().past.length;
    useMoleculeStore.getState().addBond(a1, a2, 1, "none", true);
    const mol = useMoleculeStore.getState().molecule;
    const bond = Object.values(mol.bonds)[0];
    expect(bond.dative).toBe(true);
    expect(bond.order).toBe(1);
    expect(useMoleculeStore.getState().past.length).toBe(pastBefore + 1);
  });

  test("addBond with hollowWedge stereo keeps the stereo", () => {
    const s = useMoleculeStore.getState();
    const a1 = s.addAtom({ x: 0, y: 0 }, "C");
    const a2 = s.addAtom({ x: 60, y: 0 }, "C");
    useMoleculeStore.getState().addBond(a1, a2, 1, "hollowWedge");
    const bond = Object.values(useMoleculeStore.getState().molecule.bonds)[0];
    expect(bond.stereo).toBe("hollowWedge");
    expect(bond.dative).toBeUndefined();
  });
});
