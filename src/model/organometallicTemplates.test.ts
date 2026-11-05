import { describe, expect, it } from "vitest";
import { ORGANOMETALLIC_TEMPLATES } from "./organometallicTemplates";
import { computeFormula, findConnectedFragments } from "./valence";
import { BOND_LEN } from "./constants";
import type { Molecule } from "../types/chemistry";
import type { StructureTemplate } from "./structureTemplates";

/**
 * Organometallic-specific guards beyond the shared structureTemplates
 * checks: the metallocenes must be true sandwiches (two η⁵ haptic bonds
 * onto a bare, ordinarily-unbonded metal; parallel rings with a shared
 * centroid axis; staggered vertex sets), and the paddlewheel must be a
 * real [Ru2(OAc)4] lantern (Ru–Ru axis, four O contacts per Ru, four
 * acetate methyls, dative donations, balanced formal charges).
 */

const byId = new Map(ORGANOMETALLIC_TEMPLATES.map((t) => [t.id, t]));

function template(id: string): StructureTemplate {
  const tmpl = byId.get(id);
  expect(tmpl, `${id} exists`).toBeDefined();
  return tmpl!;
}

/** Centroid of a set of atoms. */
function centroid(mol: Molecule, ids: string[]): { x: number; y: number } {
  const pts = ids.map((id) => mol.atoms[id]);
  return {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
  };
}

describe("metallocenes", () => {
  it.each(["ferrocene", "cobaltocene", "nickelocene"])("%s is a staggered M(Cp)₂ sandwich", (id) => {
    const tmpl = template(id);
    const mol = tmpl.molecule;

    // One metal atom with NO ordinary bonds — its only contacts are the
    // two haptic bonds below.
    const metal = Object.values(mol.atoms).find((a) => a.element !== "C")!;
    expect(metal.element).toMatch(/^(Fe|Co|Ni)$/);
    expect(Object.values(mol.bonds).filter((b) => b.a1 === metal.id || b.a2 === metal.id)).toHaveLength(0);

    // Exactly two η⁵ haptic bonds, each spanning the whole five-ring, both
    // anchored on the same metal.
    const haptics = Object.values(mol.hapticBonds);
    expect(haptics).toHaveLength(2);
    for (const hb of haptics) {
      expect(hb.metalAtomId).toBe(metal.id);
      expect(hb.ringAtomIds).toHaveLength(5);
      for (const ringId of hb.ringAtomIds) expect(mol.atoms[ringId]).toBeDefined();
    }

    // The two rings are parallel: both ring centroids sit on the vertical
    // through the metal, exactly halfway either side of it (so the metal
    // is the midpoint of the sandwich axis).
    const ringCentroids = haptics.map((hb) => centroid(mol, hb.ringAtomIds));
    for (const c of ringCentroids) {
      expect(c.x).toBeCloseTo(metal.x, 6);
    }
    expect(metal.y).toBeCloseTo((ringCentroids[0].y + ringCentroids[1].y) / 2, 6);
    const [topId, bottomId] = haptics.map((hb) => hb.ringAtomIds);

    // Every Cp ring bond is one standard bond length.
    const ringIds = new Set([...topId, ...bottomId]);
    const ringBonds = Object.values(mol.bonds).filter((b) => ringIds.has(b.a1) && ringIds.has(b.a2));
    expect(ringBonds).toHaveLength(10);
    for (const bond of ringBonds) {
      const len = Math.hypot(mol.atoms[bond.a1].x - mol.atoms[bond.a2].x, mol.atoms[bond.a1].y - mol.atoms[bond.a2].y);
      expect(len).toBeCloseTo(BOND_LEN, 0);
    }

    // Staggered: no vertex of one ring shares its angle (about the ring
    // centroid) with any vertex of the other — the closest approach is 36°.
    const angles = (ids: string[]) =>
      ids
        .map((rid) => {
          const p = mol.atoms[rid];
          return (Math.atan2(p.y - centroid(mol, ids).y, p.x - centroid(mol, ids).x) * 180) / Math.PI;
        })
        .sort((a, b) => a - b);
    for (const a of angles(topId)) {
      for (const b of angles(bottomId)) {
        let diff = Math.abs(a - b) % 360;
        if (diff > 180) diff = 360 - diff;
        expect(diff).toBeGreaterThanOrEqual(35.9);
      }
    }

    // Composition: two Cp⁻ rings (C5H5 each — one explicit −1 per ring,
    // same convention as the cyclopentadienyl ligand template) + the metal.
    expect(computeFormula(mol)).toBe({ ferrocene: "C10H10Fe", cobaltocene: "C10H10Co", nickelocene: "C10H10Ni" }[id as "ferrocene"]!);
    const anions = Object.values(mol.atoms).filter((a) => a.charge === -1);
    expect(anions).toHaveLength(2);
  });

  it("keeps each metallocene one connected fragment through the haptic bonds", () => {
    for (const tmpl of ORGANOMETALLIC_TEMPLATES.filter((t) => t.id !== "ru2-acetate-paddlewheel")) {
      const fragments = findConnectedFragments(tmpl.molecule);
      expect(fragments, `${tmpl.id} is connected`).toHaveLength(1);
    }
  });
});

describe("ruthenium acetate paddlewheel", () => {
  const paddle = () => template("ru2-acetate-paddlewheel").molecule;

  it("has a vertical Ru–Ru axis with four O contacts on each Ru", () => {
    const mol = paddle();
    const rus = Object.values(mol.atoms).filter((a) => a.element === "Ru");
    expect(rus).toHaveLength(2);
    const [ru1, ru2] = rus;
    // Vertical axis, one and a quarter bond lengths apart.
    expect(ru1.x).toBeCloseTo(ru2.x, 6);
    expect(Math.abs(ru1.y - ru2.y)).toBeGreaterThan(BOND_LEN);
    expect(Math.abs(ru1.y - ru2.y)).toBeLessThan(BOND_LEN * 1.35);
    const axis = Object.values(mol.bonds).find((b) => b.a1 === ru1.id && b.a2 === ru2.id);
    expect(axis, "Ru–Ru bond present").toBeDefined();

    for (const ru of rus) {
      const oContacts = Object.values(mol.bonds).filter(
        (b) => b.dative && (mol.atoms[b.a1].element === "O" ? b.a2 === ru.id : b.a1 === ru.id),
      );
      expect(oContacts, `${ru.id} receives four O donations`).toHaveLength(4);
    }
  });

  it("draws four acetate bridges (C(=O)O⁻ + CH3) with balanced charges", () => {
    const mol = paddle();
    // Four methyls + four carboxyl carbons (the carboxyl C's sit at |x| 64,
    // methyls at |x| 98 — tell them apart by how many bonds they carry).
    const byBondCount = (n: number) =>
      Object.values(mol.atoms).filter(
        (a) =>
          a.element === "C" &&
          Object.values(mol.bonds).filter((b) => b.a1 === a.id || b.a2 === a.id).length === n,
      );
    expect(byBondCount(1), "four terminal methyls").toHaveLength(4);
    expect(byBondCount(3), "four carboxyl carbons").toHaveLength(4);

    // Both Ru(II) centres against four anionic donor oxygens: net zero,
    // exactly how the neutral salt's formal charges balance.
    const totalCharge = Object.values(mol.atoms).reduce((sum, a) => sum + a.charge, 0);
    expect(totalCharge).toBe(0);
    expect(Object.values(mol.atoms).filter((a) => a.charge === 2)).toHaveLength(2);
    expect(Object.values(mol.atoms).filter((a) => a.charge === -1)).toHaveLength(4);
  });

  it("computes to [Ru2(O2CCH3)4] and survives insertion", () => {
    expect(computeFormula(paddle())).toBe("C8H12O8Ru2");
    const fragments = findConnectedFragments(template("ru2-acetate-paddlewheel").molecule);
    expect(fragments).toHaveLength(1);
  });
});

describe("organometallic registry", () => {
  it("has unique ids in the organometallics category, centered at the origin", () => {
    const ids = ORGANOMETALLIC_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tmpl of ORGANOMETALLIC_TEMPLATES) {
      expect(tmpl.category).toBe("organometallics");
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const a of Object.values(tmpl.molecule.atoms)) {
        minX = Math.min(minX, a.x);
        maxX = Math.max(maxX, a.x);
        minY = Math.min(minY, a.y);
        maxY = Math.max(maxY, a.y);
      }
      expect((minX + maxX) / 2).toBeCloseTo(0, 6);
      expect((minY + maxY) / 2).toBeCloseTo(0, 6);
    }
  });
});
