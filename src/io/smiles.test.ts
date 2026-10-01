import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { exportSmiles, exportSmilesWithAtomOrder } from "./smiles";
import type { Molecule } from "../types/chemistry";

function makeMol(atoms: { id: string; x: number; y: number; element: "C" | "N" | "O" | "S" | "P" | "F" | "Cl" | "Br" | "I" | "B" | "H"; charge?: number; isotope?: number; group?: string }[], bonds: { id: string; a1: string; a2: string; order?: 1 | 2 | 3; stereo?: "none" | "wedge" | "dash" | "wavy" }[]): Molecule {
  let mol = emptyMolecule();
  for (const a of atoms) {
    mol = addAtom(mol, a.id, { x: a.x, y: a.y }, a.element, a.group, a.isotope);
    if (a.charge) mol = { ...mol, atoms: { ...mol.atoms, [a.id]: { ...mol.atoms[a.id], charge: a.charge } } };
  }
  for (const b of bonds) {
    mol = addBond(mol, b.id, b.a1, b.a2, b.order ?? 1);
    if (b.stereo && b.stereo !== "none") mol = { ...mol, bonds: { ...mol.bonds, [b.id]: { ...mol.bonds[b.id], stereo: b.stereo } } };
  }
  return mol;
}

describe("exportSmiles", () => {
  test("single carbon atom", () => {
    const mol = makeMol([{ id: "a0", x: 0, y: 0, element: "C" }], []);
    expect(exportSmiles(mol)).toBe("C");
  });

  test("two-atom chain (C-C)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1" }],
    );
    expect(exportSmiles(mol)).toBe("CC");
  });

  test("double bond (C=C)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1", order: 2 }],
    );
    expect(exportSmiles(mol)).toBe("C=C");
  });

  test("triple bond (C#N)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "N" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1", order: 3 }],
    );
    expect(exportSmiles(mol)).toBe("C#N");
  });

  test("branched chain (isopropyl)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
        { id: "a2", x: 80, y: 0, element: "C" },
        { id: "a3", x: 40, y: 40, element: "C" },
      ],
      [
        { id: "b0", a1: "a0", a2: "a1" },
        { id: "b1", a1: "a1", a2: "a2" },
        { id: "b2", a1: "a1", a2: "a3" },
      ],
    );
    const result = exportSmiles(mol);
    expect(result).toMatch(/^CC\(C\)C$/);
  });

  test("charged atom (ammonium)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "N", charge: 1 },
        { id: "a1", x: 40, y: 0, element: "C" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1" }],
    );
    const result = exportSmiles(mol);
    expect(result).toContain("[NH3+]");
  });

  test("isotope (deuterium)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "H", isotope: 2 },
        { id: "a1", x: 40, y: 0, element: "C" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1" }],
    );
    const result = exportSmiles(mol);
    expect(result).toContain("[2H]");
  });

  test("abbreviated group becomes wildcard", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C", group: "Ph" },
        { id: "a1", x: 40, y: 0, element: "C" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1" }],
    );
    expect(exportSmiles(mol)).toBe("*C");
  });

  test("multi-fragment molecule (dot-separated)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
        { id: "a2", x: 200, y: 0, element: "O" },
        { id: "a3", x: 240, y: 0, element: "H" },
      ],
      [
        { id: "b0", a1: "a0", a2: "a1" },
        { id: "b1", a1: "a2", a2: "a3" },
      ],
    );
    const result = exportSmiles(mol);
    expect(result).toContain(".");
    expect(result.split(".")).toHaveLength(2);
  });

  test("includeStereo: false omits stereo descriptors", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1", order: 2 }],
    );
    const withStereo = exportSmiles(mol, { includeStereo: true });
    const withoutStereo = exportSmiles(mol, { includeStereo: false });
    expect(withoutStereo).toBe("C=C");
    expect(withStereo).toBe("C=C");
  });

  test("empty molecule returns empty string", () => {
    const mol = emptyMolecule();
    expect(exportSmiles(mol)).toBe("");
  });

  test("heteroatoms in chain (ethanol skeleton)", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
        { id: "a2", x: 80, y: 20, element: "O" },
      ],
      [
        { id: "b0", a1: "a0", a2: "a1" },
        { id: "b1", a1: "a1", a2: "a2" },
      ],
    );
    const result = exportSmiles(mol);
    expect(result).toMatch(/^CCO$/);
  });
});

describe("exportSmilesWithAtomOrder", () => {
  test("returns smiles and atom order", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
        { id: "a2", x: 80, y: 0, element: "O" },
      ],
      [
        { id: "b0", a1: "a0", a2: "a1" },
        { id: "b1", a1: "a1", a2: "a2" },
      ],
    );
    const { smiles, atomOrder } = exportSmilesWithAtomOrder(mol);
    expect(smiles).toBe("CCO");
    expect(atomOrder).toContain("a0");
    expect(atomOrder).toContain("a1");
    expect(atomOrder).toContain("a2");
    expect(atomOrder).toHaveLength(3);
  });

  test("atom order matches SMILES atom sequence", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "N" },
        { id: "a2", x: 80, y: 0, element: "O" },
      ],
      [
        { id: "b0", a1: "a0", a2: "a1" },
        { id: "b1", a1: "a1", a2: "a2" },
      ],
    );
    const { smiles, atomOrder } = exportSmilesWithAtomOrder(mol);
    expect(smiles).toBe("CNO");
    expect(atomOrder[0]).toBe("a0");
    expect(atomOrder[1]).toBe("a1");
    expect(atomOrder[2]).toBe("a2");
  });

  test("multi-fragment atom order concatenates", () => {
    const mol = makeMol(
      [
        { id: "a0", x: 0, y: 0, element: "C" },
        { id: "a1", x: 40, y: 0, element: "C" },
        { id: "a2", x: 200, y: 0, element: "O" },
      ],
      [{ id: "b0", a1: "a0", a2: "a1" }],
    );
    const { smiles, atomOrder } = exportSmilesWithAtomOrder(mol);
    expect(smiles).toContain(".");
    expect(atomOrder).toHaveLength(3);
  });
});
