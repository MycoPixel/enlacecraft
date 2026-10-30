import { describe, expect, test } from "vitest";
import { bestNewAngle } from "./bondAngles";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { angleDelta, polar } from "../model/geometry";
import type { Molecule } from "../types/chemistry";

function deg(d: number): number {
  return (d * Math.PI) / 180;
}

/** A central carbon with one neighbour per entry in `angles` (degrees). */
function atomWithBonds(angles: number[]): Molecule {
  let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, "C");
  angles.forEach((angle, i) => {
    const id = `n${i}`;
    mol = addAtom(mol, id, polar(0, 0, 42, deg(angle)), "C");
    mol = addBond(mol, `b${i}`, "c", id);
  });
  return mol;
}

function minDistance(angleDeg: number, existingDeg: number[]): number {
  return Math.min(...existingDeg.map((a) => Math.abs(angleDelta(deg(a), deg(angleDeg)))));
}

describe("bestNewAngle on a plain click", () => {
  test("starts a lone atom's first bond 30° up-right", () => {
    expect(bestNewAngle(atomWithBonds([]), "c", null, false, deg(30))).toBeCloseTo(deg(-30), 10);
  });

  test("continues a one-bond chain at 120°", () => {
    expect(bestNewAngle(atomWithBonds([0]), "c", null, false, deg(30))).toBeCloseTo(deg(120), 10);
  });

  test("picks the widest open gap once an atom has two bonds", () => {
    // 0° and 120° leave a 240° gap from 120° round to 360°; its bisector is
    // 240°, which is the outward direction on a ring vertex.
    expect(bestNewAngle(atomWithBonds([0, 120]), "c", null, false, deg(30))).toBeCloseTo(deg(240), 10);
  });

  test("repeat clicks fan out instead of stacking bonds on top of each other", () => {
    let mol = addAtom(emptyMolecule(), "c", { x: 0, y: 0 }, "C");
    const chosen: number[] = [];

    for (let i = 0; i < 6; i++) {
      const angle = bestNewAngle(mol, "c", null, false, deg(30));
      chosen.push(angle);
      const id = `n${i}`;
      mol = addAtom(mol, id, polar(0, 0, 42, angle), "C");
      mol = addBond(mol, `b${i}`, "c", id);
    }

    // The regression this locks in: every new direction must be visibly
    // distinct from every earlier one. The old implementation always
    // returned firstBond + 120°, so clicks 2+ landed on the same angle.
    const degrees = chosen.map((a) => ((a * 180) / Math.PI + 360) % 360);
    for (let i = 0; i < degrees.length; i++) {
      expect(minDistance(degrees[i], degrees.slice(0, i))).toBeGreaterThan(deg(30) - 1e-9);
    }
    expect(new Set(degrees.map((d) => Math.round(d))).size).toBe(6);
  });
});

describe("bestNewAngle with a dragged direction", () => {
  test("still honours the dragged angle even if a bond already points there", () => {
    // Dragging is an explicit choice, so it is not overridden by the
    // open-gap heuristic above.
    expect(bestNewAngle(atomWithBonds([0, 120]), "c", deg(0), false, deg(30))).toBeCloseTo(deg(0), 10);
  });
});
