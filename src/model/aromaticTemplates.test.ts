import { describe, expect, it } from "vitest";
import { AROMATIC_TEMPLATES } from "./aromaticTemplates";
import { computeFormula, findConnectedFragments } from "./valence";
import { BOND_LEN } from "./constants";

/**
 * Named-aromatics guards: exact compositions, exact double-bond counts
 * (each template is one hand-worked perfect matching), genuine fused
 * connectivity (shared-edge dedupe means an n-ring system has exactly the
 * atom count of the real skeleton, not two rings drawn close), and the
 * geometric guarantees the generator promises (regular polygon bond
 * lengths; bounding-box centred on the origin).
 */

const EXPECTED: Record<string, { formula: string; atoms: number; bonds: number; doubles: number }> = {
  // 3 linearly fused hexagons: 14 atoms, 18 ring bonds − 2 shared = 16,
  // 7 C=C in the Kekulé matching.
  anthracene: { formula: "C14H10", atoms: 14, bonds: 16, doubles: 7 },
  // Angular fusion adds no atoms or bonds vs anthracene.
  phenanthrene: { formula: "C14H10", atoms: 14, bonds: 16, doubles: 7 },
  // Pentagon (5 bonds) + heptagon (7) − 1 shared = 11 ring bonds, 5 C=C.
  azulene: { formula: "C10H8", atoms: 10, bonds: 11, doubles: 5 },
  // Two separate rings + the single bridge bond.
  biphenyl: { formula: "C12H10", atoms: 12, bonds: 13, doubles: 6 },
  // Pentagon + two benzo rings: 5 + 6 + 6 − 2 shared = 15 ring bonds,
  // 6 C=C (all on the benzo rings; the CH2-bearing pentagon is all single).
  fluorene: { formula: "C13H10", atoms: 13, bonds: 15, doubles: 6 },
  // Pentagon + one benzo ring: 5 + 6 − 1 shared = 10 ring bonds, 4 C=C.
  indene: { formula: "C9H8", atoms: 9, bonds: 10, doubles: 4 },
};

describe("named aromatics", () => {
  it("has the exact skeleton, formula and Kekulé count for every template", () => {
    expect(Object.keys(EXPECTED)).toHaveLength(AROMATIC_TEMPLATES.length);
    for (const tmpl of AROMATIC_TEMPLATES) {
      const expected = EXPECTED[tmpl.id];
      expect(expected, `${tmpl.id} is covered`).toBeDefined();
      const mol = tmpl.molecule;
      expect(Object.keys(mol.atoms), `${tmpl.id} atom count`).toHaveLength(expected.atoms);
      expect(Object.keys(mol.bonds), `${tmpl.id} bond count`).toHaveLength(expected.bonds);
      expect(computeFormula(mol), `${tmpl.id} formula`).toBe(expected.formula);
      const doubles = Object.values(mol.bonds).filter((b) => b.order === 2);
      expect(doubles, `${tmpl.id} double-bond count`).toHaveLength(expected.doubles);
    }
  });

  it("is one connected fragment per template with standard bond lengths", () => {
    for (const tmpl of AROMATIC_TEMPLATES) {
      const mol = tmpl.molecule;
      expect(findConnectedFragments(mol), `${tmpl.id} connected`).toHaveLength(1);
      for (const [key, bond] of Object.entries(mol.bonds)) {
        const len = Math.hypot(mol.atoms[bond.a1].x - mol.atoms[bond.a2].x, mol.atoms[bond.a1].y - mol.atoms[bond.a2].y);
        // Generated from exact polygon trigonometry — not merely inside
        // the usual plausibility window but within a rounding of BOND_LEN.
        expect(len, `${tmpl.id} bond ${key}`).toBeCloseTo(BOND_LEN, 1);
      }
    }
  });

  it("fuses rings by sharing atoms, not by drawing rings close together", () => {
    // A fused skeleton's junction atoms (three ring bonds each) exist only
    // when the shared edge's atoms are single records — and every one of
    // them is a Kekulé junction carrying exactly one double bond (valence
    // 4, no H), which is what keeps the fusion chemically real.
    const junctions = (id: string, count: number) => {
      const mol = AROMATIC_TEMPLATES.find((t) => t.id === id)!.molecule;
      const degree = (atomId: string) =>
        Object.values(mol.bonds).filter((b) => b.a1 === atomId || b.a2 === atomId).length;
      const junctionAtoms = Object.keys(mol.atoms).filter((id2) => degree(id2) === 3);
      expect(junctionAtoms, `${id} junction atoms`).toHaveLength(count);
      for (const jid of junctionAtoms) {
        const bonds = Object.values(mol.bonds).filter((b) => b.a1 === jid || b.a2 === jid);
        expect(bonds.filter((b) => b.order === 2), `${id} junction ${jid} exactly one double`).toHaveLength(1);
        expect(bonds.filter((b) => b.order === 1), `${id} junction ${jid} two singles`).toHaveLength(2);
      }
    };
    junctions("anthracene", 4);
    junctions("phenanthrene", 4);
    junctions("azulene", 2);
    junctions("fluorene", 4);
    junctions("indene", 2);
    // Biphenyl's two bridge carbons are its only degree-3 atoms, and the
    // bridge between them is the lone inter-ring single: 13 bonds total
    // (6+6 ring bonds + 1 bridge), 7 of them single.
    const biphenyl = AROMATIC_TEMPLATES.find((t) => t.id === "biphenyl")!.molecule;
    const singles = Object.values(biphenyl.bonds).filter((b) => b.order === 1);
    expect(singles).toHaveLength(7);
  });

  it("centres every template's bounding box on the origin", () => {
    for (const tmpl of AROMATIC_TEMPLATES) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const a of Object.values(tmpl.molecule.atoms)) {
        minX = Math.min(minX, a.x);
        maxX = Math.max(maxX, a.x);
        minY = Math.min(minY, a.y);
        maxY = Math.max(maxY, a.y);
      }
      expect((minX + maxX) / 2, `${tmpl.id} x centre`).toBeCloseTo(0, 6);
      expect((minY + maxY) / 2, `${tmpl.id} y centre`).toBeCloseTo(0, 6);
    }
  });

  it("gives fluorene and indene a single sp3 bridge carbon amid sp2 aromatics", () => {
    // Both skeletons have exactly ONE degree-2 carbon whose two bonds are
    // both single — the methylene bridge — sitting below the ring system
    // in the conventional apex-down pose. Every other degree-2 carbon is
    // an aromatic CH carrying exactly one double.
    for (const id of ["fluorene", "indene"]) {
      const mol = AROMATIC_TEMPLATES.find((t) => t.id === id)!.molecule;
      const degree = (atomId: string) =>
        Object.values(mol.bonds).filter((b) => b.a1 === atomId || b.a2 === atomId).length;
      const degree2 = Object.values(mol.atoms).filter((a) => degree(a.id) === 2);
      const sp3 = degree2.filter((a) =>
        Object.values(mol.bonds)
          .filter((b) => b.a1 === a.id || b.a2 === a.id)
          .every((b) => b.order === 1),
      );
      expect(sp3, `${id} has one CH2 bridge`).toHaveLength(1);
      expect(sp3[0].y).toBeGreaterThan(0);
      const aromatics = degree2.filter((a) => a.id !== sp3[0].id);
      for (const a of aromatics) {
        const doubles = Object.values(mol.bonds).filter(
          (b) => b.order === 2 && (b.a1 === a.id || b.a2 === a.id),
        );
        expect(doubles, `${id} aromatic carbon ${a.id}`).toHaveLength(1);
      }
    }
  });
});
