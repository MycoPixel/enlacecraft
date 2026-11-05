import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { computeAdvancedMoleculeDescriptors, computeMoleculeDescriptors, MoleculeDescriptorsError } from "./moleculeDescriptors";
import type { Molecule } from "../types/chemistry";

/** Ethanol (C-C-O, single bonds) — same fixture shape as molfile.test.ts's. */
function ethanolSkeleton(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a1", { x: 40, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 80, y: 20 }, "O");
  mol = addBond(mol, "b0", "a0", "a1");
  mol = addBond(mol, "b1", "a1", "a2");
  return mol;
}

describe("computeMoleculeDescriptors", () => {
  test("ethanol: one H-bond donor/acceptor, no rotatable bonds, no stereocenters", () => {
    const d = computeMoleculeDescriptors(ethanolSkeleton());
    expect(d.hBondDonorCount).toBe(1);
    expect(d.hBondAcceptorCount).toBe(1);
    expect(d.rotatableBondCount).toBe(0);
    expect(d.stereoCenterCount).toBe(0);
    // logP should favor the lipophilic (positive) side for a small alcohol,
    // but well short of anything hydrocarbon-like.
    expect(d.logP).toBeGreaterThan(-2);
    expect(d.logP).toBeLessThan(2);
  });

  test("a lone abbreviated-group atom (e.g. Ph) throws ABBREVIATED_GROUP", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C", "phenyl");
    expect(() => computeMoleculeDescriptors(mol)).toThrow(MoleculeDescriptorsError);
    try {
      computeMoleculeDescriptors(mol);
    } catch (err) {
      expect(err).toBeInstanceOf(MoleculeDescriptorsError);
      expect((err as MoleculeDescriptorsError).code).toBe("ABBREVIATED_GROUP");
    }
  });

  test("an empty molecule doesn't throw (OpenChemLib returns zeroed-out values)", () => {
    const d = computeMoleculeDescriptors(emptyMolecule());
    expect(d.hBondDonorCount).toBe(0);
    expect(d.rotatableBondCount).toBe(0);
  });
});

describe("computeAdvancedMoleculeDescriptors", () => {
  // These two guards run before the resources.json fetch (see the
  // function's doc comment), so they're testable without network access
  // or Resources.registerFromNodejs() \u2014 unlike embed3d.ts's resource-
  // dependent functions, which this codebase doesn't unit test for the
  // same reason.

  test("rejects with TOO_SMALL for a molecule under the heavy-atom floor", async () => {
    await expect(computeAdvancedMoleculeDescriptors(ethanolSkeleton())).rejects.toMatchObject({
      code: "TOO_SMALL",
    });
  });

  test("rejects with ABBREVIATED_GROUP before ever checking size", async () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C", "phenyl");
    await expect(computeAdvancedMoleculeDescriptors(mol)).rejects.toMatchObject({
      code: "ABBREVIATED_GROUP",
    });
  });
});
