import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule, mirrorAtoms } from "./molecule";
import type { Molecule } from "../types/chemistry";

function pair(): Molecule {
  let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 100, y: 20 }, "O");
  mol = addBond(mol, "ab", "a", "b", 2);
  return mol;
}

describe("mirrorAtoms", () => {
  test("horizontal flips x around the selection's bounding-box centre", () => {
    const out = mirrorAtoms(pair(), ["a", "b"], "horizontal");
    expect(out.atoms.a.x).toBe(100);
    expect(out.atoms.a.y).toBe(0);
    expect(out.atoms.b.x).toBe(0);
    expect(out.atoms.b.y).toBe(20);
  });

  test("vertical flips y and leaves x alone", () => {
    const out = mirrorAtoms(pair(), ["a", "b"], "vertical");
    expect(out.atoms.a.x).toBe(0);
    expect(out.atoms.a.y).toBe(20);
    expect(out.atoms.b.x).toBe(100);
    expect(out.atoms.b.y).toBe(0);
  });

  test("only moves the selected atoms", () => {
    let mol = pair();
    mol = addAtom(mol, "c", { x: 300, y: 0 }, "N");
    const out = mirrorAtoms(mol, ["a", "b"], "horizontal");
    expect(out.atoms.c).toEqual(mol.atoms.c);
  });

  test("mirrors label offsets so labels stay on the outside", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "N");
    mol = {
      ...mol,
      atoms: {
        ...mol.atoms,
        a: {
          ...mol.atoms.a,
          chargeOffsetX: 10,
          chargeOffsetY: 4,
          radicalOffsetX: -6,
          stereoLabelOffsetX: 8,
          mapNumberOffsetX: 3,
          lonePairOffsets: [{ x: 5, y: 7 }],
        },
      },
    };

    const horizontal = mirrorAtoms(mol, ["a"], "horizontal");
    expect(horizontal.atoms.a.chargeOffsetX).toBe(-10);
    expect(horizontal.atoms.a.chargeOffsetY).toBe(4);
    expect(horizontal.atoms.a.radicalOffsetX).toBe(6);
    expect(horizontal.atoms.a.stereoLabelOffsetX).toBe(-8);
    expect(horizontal.atoms.a.mapNumberOffsetX).toBe(-3);
    expect(horizontal.atoms.a.lonePairOffsets).toEqual([{ x: -5, y: 7 }]);

    const vertical = mirrorAtoms(mol, ["a"], "vertical");
    expect(vertical.atoms.a.chargeOffsetX).toBe(10);
    expect(vertical.atoms.a.chargeOffsetY).toBe(-4);
    expect(vertical.atoms.a.lonePairOffsets).toEqual([{ x: 5, y: -7 }]);
  });

  test("swaps a manually placed double-bond side when both ends move", () => {
    let mol = pair();
    mol = { ...mol, bonds: { ...mol.bonds, ab: { ...mol.bonds.ab, doubleSide: "left" } } };

    const out = mirrorAtoms(mol, ["a", "b"], "horizontal");
    expect(out.bonds.ab.doubleSide).toBe("right");
  });

  test("leaves the double-bond side alone when only one end moves", () => {
    let mol = pair();
    mol = { ...mol, bonds: { ...mol.bonds, ab: { ...mol.bonds.ab, doubleSide: "left" } } };

    const out = mirrorAtoms(mol, ["a"], "horizontal");
    expect(out.bonds.ab.doubleSide).toBe("left");
  });

  test("returns the original molecule when nothing actually changes", () => {
    const mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    expect(mirrorAtoms(mol, ["a"], "horizontal")).toBe(mol);
  });
});
