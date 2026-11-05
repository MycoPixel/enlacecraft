import { describe, expect, it } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { BOND_LEN, RING_TEMPLATES } from "../model/constants";
import { computeFormula, findConnectedFragments } from "../model/valence";
import { placeRing, previewRingLoops } from "./ringPlacement";
import type { Molecule, RingAttachment, RingTemplate } from "../types/chemistry";

function template(id: string): RingTemplate {
  const found = RING_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`no such ring template: ${id}`);
  return found;
}

function placed(id: string, attachment: RingAttachment = { type: "none" }): Molecule {
  return placeRing(emptyMolecule(), template(id), { x: 0, y: 0 }, attachment);
}

function bondLengths(mol: Molecule): number[] {
  return Object.values(mol.bonds).map((b) => {
    const a = mol.atoms[b.a1];
    const c = mol.atoms[b.a2];
    return Math.hypot(a.x - c.x, a.y - c.y);
  });
}

describe("conformation ring templates", () => {
  it("have the formula of the real cycloalkane", () => {
    expect(computeFormula(placed("cyclohexane-chair"))).toBe("C6H12");
    expect(computeFormula(placed("cyclohexane-boat"))).toBe("C6H12");
    expect(computeFormula(placed("cis-decalin"))).toBe("C10H18");
    expect(computeFormula(placed("trans-decalin"))).toBe("C10H18");
    expect(computeFormula(placed("norbornane"))).toBe("C7H12");
  });

  it("are one connected fragment with the expected atom/bond counts", () => {
    const cases: [string, number, number][] = [
      ["cyclohexane-chair", 6, 6],
      ["cyclohexane-boat", 6, 6],
      // 10 ring carbons + 2 explicit bridgehead hydrogens, 11 ring bonds +
      // 2 C-H bonds.
      ["cis-decalin", 12, 13],
      ["trans-decalin", 12, 13],
      // Bicyclo[2.2.1]heptane: 7 carbons, 8 bonds.
      ["norbornane", 7, 8],
    ];
    for (const [id, atoms, bonds] of cases) {
      const mol = placed(id);
      expect(findConnectedFragments(mol), id).toHaveLength(1);
      expect(Object.keys(mol.atoms), id).toHaveLength(atoms);
      expect(Object.keys(mol.bonds), id).toHaveLength(bonds);
    }
  });

  it("draws chair with equal ring bonds and boat within its projected range", () => {
    for (const length of bondLengths(placed("cyclohexane-chair"))) {
      expect(length).toBeCloseTo(BOND_LEN, 0);
    }
    // The boat is a perspective projection (like ChemDraw's own template),
    // so its two "prow" bonds read shorter and its flat bottom edge longer
    // than a real C-C bond; they must still stay in a plausible drawn range.
    for (const length of bondLengths(placed("cyclohexane-boat"))) {
      expect(length).toBeGreaterThan(BOND_LEN * 0.7);
      expect(length).toBeLessThan(BOND_LEN * 1.35);
    }
  });

  it("encodes cis/trans decalin through the bridgehead hydrogen wedges", () => {
    const hydrogenBonds = (mol: Molecule) =>
      Object.values(mol.bonds).filter(
        (b) => mol.atoms[b.a1]?.element === "H" || mol.atoms[b.a2]?.element === "H"
      );
    expect(hydrogenBonds(placed("cis-decalin")).map((b) => b.stereo)).toEqual(["wedge", "wedge"]);
    expect(hydrogenBonds(placed("trans-decalin")).map((b) => b.stereo).sort()).toEqual(["dash", "wedge"]);
  });

  it("previews one loop per ring", () => {
    expect(previewRingLoops(emptyMolecule(), template("cyclohexane-chair"), { x: 100, y: 50 }, { type: "none" }))
      .toHaveLength(1);
    const decalinLoops = previewRingLoops(emptyMolecule(), template("cis-decalin"), { x: 100, y: 50 }, { type: "none" });
    expect(decalinLoops).toHaveLength(2);
    expect(decalinLoops.every((loop) => loop.length === 6)).toBe(true);
    expect(previewRingLoops(emptyMolecule(), template("norbornane"), { x: 0, y: 0 }, { type: "none" }))
      .toHaveLength(2);
  });

  it("fuses onto an existing atom and onto an existing bond", () => {
    const atomMol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    const fusedAtom = placeRing(atomMol, template("cyclohexane-chair"), { x: 0, y: 0 }, { type: "atom", atomId: "a" });
    expect(fusedAtom.atoms["a"]).toBeDefined();
    expect(findConnectedFragments(fusedAtom)).toHaveLength(1);
    // 6 ring atoms, one of which is the existing atom.
    expect(Object.keys(fusedAtom.atoms)).toHaveLength(6);

    let bondMol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    bondMol = addAtom(bondMol, "b", { x: BOND_LEN, y: 0 }, "C");
    bondMol = addBond(bondMol, "ab", "a", "b", 1);
    const fusedBond = placeRing(bondMol, template("cis-decalin"), { x: 0, y: 0 }, { type: "bond", a1: "a", a2: "b" });
    expect(findConnectedFragments(fusedBond)).toHaveLength(1);
    // 12 layout atoms, two of which are the existing bond's endpoints.
    expect(Object.keys(fusedBond.atoms)).toHaveLength(12);
    expect(Object.keys(fusedBond.bonds)).toHaveLength(13);
  });
});
