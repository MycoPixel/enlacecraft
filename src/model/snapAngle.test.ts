import { describe, expect, test } from "vitest";
import { snapAngle } from "./geometry";
import { bestNewAngle } from "../engine/bondAngles";
import { snapStepRadians } from "../store/useMoleculeStore";
import { addAtom, addBond, emptyMolecule } from "./molecule";
import type { Molecule } from "../types/chemistry";

function deg(d: number): number {
  return (d * Math.PI) / 180;
}

describe("snapAngle", () => {
  test("snaps to the nearest 30° by default", () => {
    expect(snapAngle(deg(31))).toBeCloseTo(deg(30), 10);
    expect(snapAngle(deg(44))).toBeCloseTo(deg(30), 10);
    expect(snapAngle(deg(46))).toBeCloseTo(deg(60), 10);
  });

  test("honours an explicit step", () => {
    expect(snapAngle(deg(52), deg(15))).toBeCloseTo(deg(45), 10);
    expect(snapAngle(deg(52), deg(45))).toBeCloseTo(deg(45), 10);
  });

  test("a non-positive step disables snapping instead of dividing by zero", () => {
    // The "Off" preference. NaN would silently poison every coordinate
    // downstream, so this is worth pinning explicitly.
    expect(snapAngle(deg(37), 0)).toBe(deg(37));
    expect(snapAngle(deg(37), -1)).toBe(deg(37));
    expect(Number.isFinite(snapAngle(deg(37), 0))).toBe(true);
  });

  test("is a no-op on angles already on the grid", () => {
    expect(snapAngle(deg(60))).toBeCloseTo(deg(60), 10);
    expect(snapAngle(deg(-120))).toBeCloseTo(deg(-120), 10);
  });
});

describe("snapStepRadians", () => {
  test("converts degrees to radians", () => {
    expect(snapStepRadians(30)).toBeCloseTo(Math.PI / 6, 10);
    expect(snapStepRadians(15)).toBeCloseTo(Math.PI / 12, 10);
    expect(snapStepRadians(45)).toBeCloseTo(Math.PI / 4, 10);
    expect(snapStepRadians(60)).toBeCloseTo(Math.PI / 3, 10);
  });

  test("maps 0 (Off) to 0 rather than to a valid step", () => {
    expect(snapStepRadians(0)).toBe(0);
  });
});

describe("bestNewAngle with a custom snap step", () => {
  /** A single terminal carbon, so bestNewAngle falls through to its
   * "30°-up-right start" default and the snap step is the only thing
   * deciding the result. */
  function loneCarbon(): Molecule {
    return addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
  }

  test("respects a 15° step on a dragged angle", () => {
    const mol = loneCarbon();
    // 52° sits between two different 15°-grid points and two different
    // 30°-grid points, so the two settings must disagree — otherwise this
    // test wouldn't prove the step is actually being honoured. On a 15° grid
    // 52° rounds down to 45°; on a 30° grid it rounds up to 60°.
    const fine = bestNewAngle(mol, "a1", deg(52), false, snapStepRadians(15));
    const coarse = bestNewAngle(mol, "a1", deg(52), false, snapStepRadians(30));
    expect(fine).toBeCloseTo(deg(45), 10);
    expect(coarse).toBeCloseTo(deg(60), 10);
    expect(snapAngle(deg(52), snapStepRadians(15))).toBeCloseTo(fine, 10);
  });

  test("a 15° step produces a different result from 30° for a 40° drag", () => {
    const mol = loneCarbon();
    const fine = bestNewAngle(mol, "a1", deg(40), false, snapStepRadians(15));
    const coarse = bestNewAngle(mol, "a1", deg(40), false, snapStepRadians(30));
    expect(fine).toBeCloseTo(deg(45), 10);
    expect(coarse).toBeCloseTo(deg(30), 10);
  });

  test("freeform (Shift) overrides the snap step entirely", () => {
    const mol = loneCarbon();
    const angle = bestNewAngle(mol, "a1", deg(41), true, snapStepRadians(30));
    expect(angle).toBeCloseTo(deg(41), 10);
  });

  test("snapping off leaves the dragged angle exactly where it was put", () => {
    const mol = loneCarbon();
    const angle = bestNewAngle(mol, "a1", deg(41), false, snapStepRadians(0));
    expect(angle).toBeCloseTo(deg(41), 10);
  });

  test("the click-to-continue-chain path also honours the snap step", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b1", "a1", "a2");
    // a2's only bond points at 180°, so the chain continuation candidate is
    // 180° + 120° = 300°. With snapping off that candidate is returned
    // verbatim; with a 30° step it is re-snapped to the same 300° grid point.
    // A molecule where the candidate is *off* every grid point is what makes
    // the two settings distinguishable, so check that case directly too.
    expect(bestNewAngle(mol, "a2", null, false, snapStepRadians(0))).toBeCloseTo(deg(300), 10);

    let skew = emptyMolecule();
    skew = addAtom(skew, "a1", { x: 0, y: 0 }, "C");
    skew = addAtom(skew, "a2", { x: 40, y: 17 }, " " as never, "C");
    skew = addBond(skew, "b1", "a1", "a2");
    const off = bestNewAngle(skew, "a2", null, false, snapStepRadians(0));
    const snapped = bestNewAngle(skew, "a2", null, false, snapStepRadians(30));
    expect(snapped).not.toBeCloseTo(off, 10);
    expect(snapped).toBeCloseTo(snapAngle(off, snapStepRadians(30)), 10);
  });
});