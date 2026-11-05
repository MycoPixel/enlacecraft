import { describe, expect, it } from "vitest";
import {
  CONFORMATION_TEMPLATES,
  CYCLOHEXANE_CHAIR_LAYOUT,
  CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT,
  NEWMAN_TEMPLATES,
} from "./ringConformations";
import { computeFormula } from "./valence";
import { BOND_LEN } from "./constants";

/**
 * Geometry guards for the Phase-10 conformation additions: the flipped
 * chair must stay an exact mirror of the plain chair (same x's, negated
 * y's — that identity IS the ring flip in the 2D projection), and the
 * Newman projections must keep their front/back triad geometry (rear
 * triad staggered at 60°, eclipsed parallel, butane's anti/gauche methyl
 * dihedrals) so the templates mean what their labels say.
 */

const byId = new Map(CONFORMATION_TEMPLATES.map((t) => [t.id, t]));

describe("flipped chair layout", () => {
  it("is the plain chair mirrored through the mean ring plane", () => {
    expect(CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT.atoms).toHaveLength(CYCLOHEXANE_CHAIR_LAYOUT.atoms.length);
    const chairByKey = new Map(CYCLOHEXANE_CHAIR_LAYOUT.atoms.map((a) => [a.key, a]));
    for (const atom of CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT.atoms) {
      const plain = chairByKey.get(atom.key);
      expect(plain).toBeDefined();
      // Same x, negated y in the canvas convention — every carbon that
      // drew "up" now draws "down", which is the axial↔equatorial swap.
      expect(atom.x).toBeCloseTo(plain!.x, 6);
      expect(atom.y).toBeCloseTo(-plain!.y, 6);
    }
    expect(CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT.bonds).toEqual(CYCLOHEXANE_CHAIR_LAYOUT.bonds);
  });

  it("has six ring bonds at the standard bond length", () => {
    const byKey = new Map(CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT.atoms.map((a) => [a.key, a]));
    for (const bond of CYCLOHEXANE_FLIPPED_CHAIR_LAYOUT.bonds) {
      const a = byKey.get(bond.from)!;
      const b = byKey.get(bond.to)!;
      // The source chair drawing's vertices are rounded to ~0.1 px, so
      // bond lengths land within a fraction of a px of BOND_LEN.
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(BOND_LEN, 0);
    }
  });

  it("is registered as a conformation template", () => {
    const tmpl = byId.get("cyclohexane-chair-flipped");
    expect(tmpl).toBeDefined();
    expect(tmpl!.category).toBe("conformations");
    expect(Object.keys(tmpl!.molecule.atoms)).toHaveLength(6);
  });
});

/** Screen-space direction angle (degrees, y-down) of the bond from
 * `center` to `atom`. */
function bondAngle(center: { x: number; y: number }, atom: { x: number; y: number }): number {
  return (Math.atan2(atom.y - center.y, atom.x - center.x) * 180) / Math.PI;
}

/** Smallest absolute difference between two angles, in 0..180. */
function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe("Newman projections", () => {
  it("all exist with Newmann-consistent formulas and labels", () => {
    expect(NEWMAN_TEMPLATES).toHaveLength(4);
    expect(computeFormula(byId.get("ethane-newman-staggered")!.molecule)).toBe("C2H6");
    expect(computeFormula(byId.get("ethane-newman-eclipsed")!.molecule)).toBe("C2H6");
    expect(computeFormula(byId.get("butane-newman-anti")!.molecule)).toBe("C4H10");
    expect(computeFormula(byId.get("butane-newman-gauche")!.molecule)).toBe("C4H10");
  });

  it("draw the back carbon offset up, joined by the short viewing-axis stub", () => {
    for (const tmpl of NEWMAN_TEMPLATES) {
      const front = tmpl.molecule.atoms["f"];
      const back = tmpl.molecule.atoms["b"];
      expect(front).toBeDefined();
      expect(back).toBeDefined();
      expect(back.y).toBeCloseTo(front.y - 12, 6);
      expect(back.x).toBeCloseTo(front.x, 6);
      const axis = Object.values(tmpl.molecule.bonds).find((b) => b.a1 === "f" && b.a2 === "b");
      expect(axis, `${tmpl.id} keeps its front→back axis stub`).toBeDefined();
    }
  });

  it("give every carbon three substituents 120° apart at full bond length", () => {
    for (const tmpl of NEWMAN_TEMPLATES) {
      for (const centerId of ["f", "b"] as const) {
        const center = tmpl.molecule.atoms[centerId];
        const subs = Object.values(tmpl.molecule.bonds)
          .filter((b) => (b.a1 === centerId) !== (b.a2 === centerId))
          .map((b) => (b.a1 === centerId ? b.a2 : b.a1))
          .filter((id) => id !== "b" && id !== "f")
          .map((id) => tmpl.molecule.atoms[id]);
        expect(subs, `${tmpl.id} carbon ${centerId}`).toHaveLength(3);
        const lengths = subs.map((s) => Math.hypot(s.x - center.x, s.y - center.y));
        for (const len of lengths) {
          // The eclipsed axial rear bond is deliberately shortened (see
          // ringConformations.ts) so its H label clears the front H's.
          expect(len).toBeGreaterThanOrEqual(BOND_LEN * 0.7);
          expect(len).toBeLessThanOrEqual(BOND_LEN * 1.35);
        }
        const a0 = bondAngle(center, subs[0]);
        const a1 = bondAngle(center, subs[1]);
        const a2 = bondAngle(center, subs[2]);
        expect(angleDiff(a0, a1)).toBeCloseTo(120, 0);
        expect(angleDiff(a1, a2)).toBeCloseTo(120, 0);
      }
    }
  });

  it("draw all rear substituent bonds dashed (they point away from the viewer)", () => {
    for (const tmpl of NEWMAN_TEMPLATES) {
      const rearBonds = Object.values(tmpl.molecule.bonds).filter((b) => b.a1 === "b");
      expect(rearBonds).toHaveLength(3);
      for (const bond of rearBonds) expect(bond.stereo, `${tmpl.id} bond ${bond.id}`).toBe("dashed");
    }
  });

  it("stagger ethane's rear triad 60° off the front triad and eclipse it exactly", () => {
    const rearAngles = (id: string) => {
      const tmpl = byId.get(id)!;
      const back = tmpl.molecule.atoms["b"];
      return Object.values(tmpl.molecule.bonds)
        .filter((b) => b.a1 === "b" && b.a2 !== "f")
        .map((b) => bondAngle(back, tmpl.molecule.atoms[b.a2]))
        .sort((a, b) => a - b);
    };
    const frontAngles = (id: string) => {
      const tmpl = byId.get(id)!;
      const front = tmpl.molecule.atoms["f"];
      return Object.values(tmpl.molecule.bonds)
        .filter((b) => b.a1 === "f" && b.a2 !== "b")
        .map((b) => bondAngle(front, tmpl.molecule.atoms[b.a2]))
        .sort((a, b) => a - b);
    };

    const stagFront = frontAngles("ethane-newman-staggered");
    const stagRear = rearAngles("ethane-newman-staggered");
    for (const front of stagFront) {
      // Staggered: each front bond has exactly one rear bond antiperiplanar
      // to it (180°) and the other two at ±60°.
      const diffs = stagRear.map((rear) => angleDiff(front, rear)).sort((a, b) => a - b);
      expect(diffs[0]).toBeCloseTo(60, 0);
      expect(diffs[1]).toBeCloseTo(60, 0);
      expect(diffs[2]).toBeCloseTo(180, 0);
    }

    const eclFront = frontAngles("ethane-newman-eclipsed");
    const eclRear = rearAngles("ethane-newman-eclipsed");
    for (const front of eclFront) {
      // Every rear bond is parallel to (0° from) its front partner.
      const nearest = Math.min(...eclRear.map((rear) => angleDiff(front, rear)));
      expect(nearest).toBeCloseTo(0, 0);
    }
  });

  it("put butane's methyls antiperiplanar for anti and synclinal for gauche", () => {
    const methylAngle = (id: string, carbonId: "f" | "b") => {
      const tmpl = byId.get(id)!;
      const center = tmpl.molecule.atoms[carbonId];
      const methyl = Object.values(tmpl.molecule.bonds)
        .map((b) => (b.a1 === carbonId ? b.a2 : b.a2 === carbonId ? b.a1 : null))
        .filter((other): other is string => other !== null && other !== "f" && other !== "b")
        .map((other) => tmpl.molecule.atoms[other])
        .find((atom) => atom.element === "C");
      expect(methyl, `${id} carbon ${carbonId} carries its C4/C1 methyl`).toBeDefined();
      return bondAngle(center, methyl!);
    };

    const antiDiff = angleDiff(methylAngle("butane-newman-anti", "f"), methylAngle("butane-newman-anti", "b"));
    expect(antiDiff).toBeCloseTo(180, 0);

    const gaucheDiff = angleDiff(methylAngle("butane-newman-gauche", "f"), methylAngle("butane-newman-gauche", "b"));
    expect(gaucheDiff).toBeCloseTo(60, 0);
  });
});
