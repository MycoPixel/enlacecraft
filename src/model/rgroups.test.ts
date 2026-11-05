import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "./molecule";
import type { Molecule, RGroupDefinition } from "../types/chemistry";
import {
  MAX_RGROUP_COMBINATIONS,
  clearRGroups,
  defineRGroup,
  drawnRGroupLabels,
  expandGeneric,
  hasExpandableRGroups,
  isRGroupLabel,
  nextUnusedRGroupLabel,
  rgroupDefinitionsByLabel,
} from "./rgroups";

/** Host with two drawn placeholders: c1—R1 and c1—R2. */
function drawing(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "r1", { x: -60, y: 0 }, "C", "R1");
  mol = addAtom(mol, "r2", { x: 60, y: 0 }, "C", "R2");
  mol = addBond(mol, "b1", "c1", "r1");
  mol = addBond(mol, "b2", "c1", "r2");
  return mol;
}

/** The drawing plus a two-atom substituent (C2—O1) hanging off c1. */
function drawingWithSubstituent(): Molecule {
  let mol = drawing();
  mol = addAtom(mol, "c2", { x: 200, y: 0 }, "C");
  mol = addAtom(mol, "o1", { x: 260, y: 0 }, "O");
  mol = addBond(mol, "b3", "c1", "c2");
  mol = addBond(mol, "b4", "c2", "o1");
  return mol;
}

/** A minimal single-atom definition (like a sanitized one produces). */
function singleAtomDef(id: string, label: string, element: Molecule["atoms"][string]["element"], atomId = `f-${id}`): RGroupDefinition {
  return {
    id,
    label,
    attachmentAtomId: atomId,
    molecule: {
      atoms: { [atomId]: { id: atomId, x: 0, y: 0, element, charge: 0 } },
      bonds: {},
      hapticBonds: {},
      aromaticRingDisplays: {},
    },
  };
}

describe("R-group label helpers", () => {
  test("accepts the R-shaped placeholder labels the editor can draw", () => {
    for (const label of ["R", "R1", "R7", "R99", "R'", "R''", "R1'", "R2''"]) {
      expect(isRGroupLabel(label)).toBe(true);
    }
    for (const label of ["X", "Nu", "Ar", "r1", "R100", "R1x", "", "RR"]) {
      expect(isRGroupLabel(label)).toBe(false);
    }
  });

  test("drawnRGroupLabels lists the drawn R labels in natural order", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a", { x: 0, y: 0 }, "C", "R10");
    mol = addAtom(mol, "b", { x: 30, y: 0 }, "C", "R2");
    mol = addAtom(mol, "c", { x: 60, y: 0 }, "C", "R1");
    mol = addAtom(mol, "d", { x: 90, y: 0 }, "C", "Ph"); // registry group, not an R site
    expect(drawnRGroupLabels(mol)).toEqual(["R1", "R2", "R10"]);
  });

  test("nextUnusedRGroupLabel skips defined labels", () => {
    expect(nextUnusedRGroupLabel(emptyMolecule())).toBe("R");
    let mol: Molecule = { ...emptyMolecule(), rgroups: { d: singleAtomDef("d", "R", "O") } };
    expect(nextUnusedRGroupLabel(mol)).toBe("R1");
    mol = { ...mol, rgroups: { d: singleAtomDef("d", "R", "O"), e: singleAtomDef("e", "R1", "O") } };
    expect(nextUnusedRGroupLabel(mol)).toBe("R2");
  });

  test("hasExpandableRGroups needs both a drawn label and a definition", () => {
    expect(hasExpandableRGroups(drawing())).toBe(false);
    const defined = defineRGroup(drawingWithSubstituent(), "R1", ["c2", "o1"]);
    expect(hasExpandableRGroups(defined)).toBe(true);
    // Definitions exist but nothing drawn carries their label any more.
    const bare = { ...emptyMolecule(), rgroups: defined.rgroups };
    expect(hasExpandableRGroups(bare)).toBe(false);
  });

  test("rgroupDefinitionsByLabel buckets definitions by label", () => {
    const mol = {
      ...emptyMolecule(),
      rgroups: {
        d1: singleAtomDef("d1", "R1", "O"),
        d2: singleAtomDef("d2", "R1", "N"),
        d3: singleAtomDef("d3", "R2", "S"),
      },
    };
    expect(rgroupDefinitionsByLabel(mol).get("R1")).toHaveLength(2);
    expect(rgroupDefinitionsByLabel(mol).get("R2")).toHaveLength(1);
    expect(rgroupDefinitionsByLabel(mol).get("R3")).toBeUndefined();
  });
});

describe("defineRGroup", () => {
  test("extracts the selection into a fragment, removes it from the drawing, registers the definition", () => {
    const mol = drawingWithSubstituent();
    const next = defineRGroup(mol, "R1", ["c2", "o1"]);

    // Gone from the drawing, bonds included.
    expect(next.atoms.c2).toBeUndefined();
    expect(next.atoms.o1).toBeUndefined();
    expect(next.bonds.b3).toBeUndefined();
    expect(next.bonds.b4).toBeUndefined();
    expect(next.atoms.c1).toBeDefined();
    expect(next.atoms.r1?.group).toBe("R1");

    // Registered under its own id, as drawn.
    const defs = Object.values(next.rgroups ?? {});
    expect(defs).toHaveLength(1);
    expect(defs[0].label).toBe("R1");
    // The fragment atom that still bonded to the rest (c2 bonded to c1).
    expect(defs[0].attachmentAtomId).toBe("c2");
    expect(defs[0].molecule.atoms.c2).toMatchObject({ x: 200, y: 0 });
    expect(defs[0].molecule.atoms.o1).toMatchObject({ x: 260, y: 0 });
    expect(defs[0].molecule.bonds.b4).toBeDefined();
  });

  test("a disconnected selection uses the first selected atom as the attachment", () => {
    let mol = drawing();
    mol = addAtom(mol, "f1", { x: 500, y: 0 }, "C");
    mol = addAtom(mol, "f2", { x: 540, y: 0 }, "C");
    mol = addBond(mol, "bf", "f1", "f2");
    const next = defineRGroup(mol, "R", ["f2", "f1"]);
    expect(Object.values(next.rgroups ?? {})[0].attachmentAtomId).toBe("f2");
  });

  test("redefining a label replaces that label's definition", () => {
    let next = defineRGroup(drawingWithSubstituent(), "R1", ["c2", "o1"]);
    next = addAtom(next, "c3", { x: 400, y: 0 }, "C");
    next = defineRGroup(next, "R1", ["c3"]);
    const defs = Object.values(next.rgroups ?? {});
    expect(defs).toHaveLength(1);
    expect(defs[0].molecule.atoms.c3).toBeDefined();
    expect(defs[0].molecule.atoms.c2).toBeUndefined();
  });

  test("returns the same molecule for a non-R label or an empty selection", () => {
    const mol = drawingWithSubstituent();
    expect(defineRGroup(mol, "X", ["c2", "o1"])).toBe(mol);
    expect(defineRGroup(mol, "R1", [])).toBe(mol);
    expect(defineRGroup(mol, "R1", ["ghost"])).toBe(mol);
  });
});

describe("clearRGroups", () => {
  test("drops definitions without restoring the extracted fragments", () => {
    const mol = drawingWithSubstituent();
    const defined = defineRGroup(mol, "R1", ["c2", "o1"]);
    const cleared = clearRGroups(defined);
    expect(cleared.rgroups).toBeUndefined();
    // Not restored: the substituent stays extracted — clearing is not an
    // undo of Define (see clearRGroups's doc comment).
    expect(cleared.atoms.c2).toBeUndefined();
    expect(cleared.atoms.c1).toBeDefined();
  });

  test("is a no-op (same object) without definitions", () => {
    const mol = drawing();
    expect(clearRGroups(mol)).toBe(mol);
  });
});

describe("expandGeneric", () => {
  test("one definition per label: both placeholders are replaced in a single copy", () => {
    let mol = drawing();
    // Draw a methyl for R1 and a hydroxyl for R2, each attached to c1.
    mol = addAtom(mol, "m1", { x: 0, y: 60 }, "C");
    mol = addBond(mol, "bm", "c1", "m1");
    mol = addAtom(mol, "o1", { x: 0, y: -60 }, "O");
    mol = addBond(mol, "bo", "c1", "o1");
    mol = defineRGroup(mol, "R1", ["m1"]);
    mol = defineRGroup(mol, "R2", ["o1"]);

    const result = expandGeneric(mol);
    expect(result.count).toBe(1);
    const next = result.mol;

    // The original drawing is untouched, placeholders and definitions kept.
    expect(next.atoms.c1).toMatchObject({ x: 0, y: 0 });
    expect(next.atoms.r1?.group).toBe("R1");
    expect(next.atoms.r2?.group).toBe("R2");
    expect(next.rgroups).toEqual(mol.rgroups);

    // The copy: host carbon one stride right of the original bounds; each
    // fragment's attachment atom sits exactly where its R placeholder was.
    const stride = 60 - -60 + 80; // bounds width + gap
    const hostCopy = Object.values(next.atoms).find((a) => a.id !== "c1" && a.element === "C" && Math.abs(a.x - stride) < 1e-9 && a.y === 0);
    expect(hostCopy).toBeDefined();
    // Original atoms keep their exact positions/ids; every new id is fresh.
    const ids = Object.keys(next.atoms);
    expect(new Set(ids).size).toBe(ids.length);

    const neighbours = Object.values(next.bonds)
      .filter((b) => b.a1 === hostCopy!.id || b.a2 === hostCopy!.id)
      .map((b) => next.atoms[b.a1 === hostCopy!.id ? b.a2 : b.a1]);
    expect(neighbours).toHaveLength(2);
    const elements = neighbours.map((a) => a.element).sort();
    expect(elements).toEqual(["C", "O"]); // methyl carbon + hydroxyl oxygen
    const methyl = neighbours.find((a) => a.element === "C")!;
    const oh = neighbours.find((a) => a.element === "O")!;
    expect(methyl).toMatchObject({ x: -60 + stride, y: 0 }); // old R1 site
    expect(oh).toMatchObject({ x: 60 + stride, y: 0 }); // old R2 site
  });

  test("the fragment copy is oriented away from the R atom's former neighbours", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "r1", { x: -60, y: 0 }, "C", "R1");
    mol = addBond(mol, "b1", "c1", "r1");
    // A two-atom fragment drawn pointing +x; its attachment (aO) is the
    // first selected atom (disconnected from the host when defined).
    mol = addAtom(mol, "aO", { x: 300, y: 0 }, "O");
    mol = addAtom(mol, "aC", { x: 330, y: 0 }, "C");
    mol = addBond(mol, "ba", "aO", "aC");
    mol = defineRGroup(mol, "R1", ["aO", "aC"]);

    const next = expandGeneric(mol).mol;
    // At expansion time the drawing holds only c1 and r1 (the fragment was
    // extracted), so the stride is that bounds' width + gap.
    const stride = 0 - -60 + 80;
    // The former neighbour (the copied host carbon) re-bonds the attachment.
    const hostCopy = Object.values(next.atoms).find((a) => a.id !== "c1" && a.element === "C" && Math.abs(a.x - 0 - stride) < 1e-9 && a.y === 0);
    expect(hostCopy).toBeDefined();
    const attach = Object.values(next.bonds)
      .filter((b) => b.a1 === hostCopy!.id || b.a2 === hostCopy!.id)
      .map((b) => next.atoms[b.a1 === hostCopy!.id ? b.a2 : b.a1]);
    expect(attach).toHaveLength(1);
    expect(attach[0].element).toBe("O");
    expect(attach[0].x).toBeCloseTo(-60 + stride, 6); // the R atom's old position
    expect(attach[0].y).toBeCloseTo(0, 6);
    // The fragment's own carbon was pointing +x as drawn; after expanding it
    // must have been rotated to point away from the host neighbour (−x).
    const partnerBond = Object.values(next.bonds).find((b) => b.a1 === attach[0].id || b.a2 === attach[0].id)!;
    const partner = next.atoms[partnerBond.a1 === attach[0].id ? partnerBond.a2 : partnerBond.a1];
    expect(partner.element).toBe("C");
    expect(partner.x).toBeLessThan(attach[0].x);
  });

  test("former R-neighbour bonds keep their order and stereo", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "r1", { x: -60, y: 0 }, "C", "R1");
    mol = addBond(mol, "b1", "c1", "r1", 2, "wedge");
    mol = addAtom(mol, "s1", { x: 0, y: 60 }, "O");
    mol = defineRGroup(mol, "R1", ["s1"]);

    const next = expandGeneric(mol).mol;
    // At expansion time the drawing holds only c1 and r1 (the fragment was
    // extracted), so the stride is that bounds' width + gap.
    const stride = 0 - -60 + 80;
    const attach = Object.values(next.atoms).find((a) => a.element === "O" && Math.abs(a.x - (-60 + stride)) < 1e-6);
    expect(attach).toBeDefined();
    const bond = Object.values(next.bonds).find((b) => b.a1 === attach!.id || b.a2 === attach!.id)!;
    expect(bond.order).toBe(2);
    expect(bond.stereo).toBe("wedge");
  });

  test("several definitions on one label expand as separate combinations", () => {
    const mol = {
      ...drawing(),
      rgroups: {
        d1: singleAtomDef("d1", "R1", "O"),
        d2: singleAtomDef("d2", "R1", "N"),
      },
    };
    const result = expandGeneric(mol);
    expect(result.count).toBe(2);
    const stride = 60 - -60 + 80;
    // Each combination puts its fragment's attachment at its own copy's old
    // R1 site (one stride further right per copy), with a different element.
    const atSite = Object.values(result.mol.atoms).filter(
      (a) => (a.element === "O" || a.element === "N") && Math.abs(a.y) < 1e-6
    );
    expect(atSite.map((a) => a.element).sort()).toEqual(["N", "O"]);
    const xs = atSite.map((a) => a.x).sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(-60 + stride, 6);
    expect(xs[1]).toBeCloseTo(-60 + 2 * stride, 6);
  });

  test("combinations are the cartesian product across labels and respect the cap", () => {
    const atoms: Molecule["atoms"] = {};
    const rgroups: Record<string, RGroupDefinition> = {};
    for (let i = 1; i <= 3; i++) {
      atoms[`r${i}`] = { id: `r${i}`, x: (i - 1) * 60, y: 0, element: "C", charge: 0, group: `R${i}` };
      rgroups[`d${i}a`] = singleAtomDef(`d${i}a`, `R${i}`, "O");
      rgroups[`d${i}b`] = singleAtomDef(`d${i}b`, `R${i}`, "N");
    }
    const mol: Molecule = { atoms, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {}, rgroups };

    expect(expandGeneric(mol).count).toBe(8); // 2 × 2 × 2
    expect(expandGeneric(mol, { maxCombinations: 5 }).count).toBe(5);
  });

  test("the default cap stops runaway products at 64", () => {
    const atoms: Molecule["atoms"] = {};
    const rgroups: Record<string, RGroupDefinition> = {};
    for (let i = 1; i <= 7; i++) {
      atoms[`r${i}`] = { id: `r${i}`, x: (i - 1) * 60, y: 0, element: "C", charge: 0, group: `R${i}` };
      rgroups[`d${i}a`] = singleAtomDef(`d${i}a`, `R${i}`, "O");
      rgroups[`d${i}b`] = singleAtomDef(`d${i}b`, `R${i}`, "N");
    }
    const mol: Molecule = { atoms, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {}, rgroups };

    expect(expandGeneric(mol).count).toBe(MAX_RGROUP_COMBINATIONS);
    // Copies lay out in a grid, not one endless row.
    const next = expandGeneric(mol).mol;
    expect(Object.keys(next.atoms)).toHaveLength(7 + 64 * 7);
  });

  test("copies never share atom ids with the original or each other", () => {
    const atoms: Molecule["atoms"] = {};
    const rgroups: Record<string, RGroupDefinition> = {};
    for (let i = 1; i <= 2; i++) {
      atoms[`r${i}`] = { id: `r${i}`, x: (i - 1) * 60, y: 0, element: "C", charge: 0, group: `R${i}` };
      rgroups[`d${i}a`] = singleAtomDef(`d${i}a`, `R${i}`, "O");
      rgroups[`d${i}b`] = singleAtomDef(`d${i}b`, `R${i}`, "N");
    }
    const next = expandGeneric({ atoms, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {}, rgroups }).mol;
    const ids = Object.keys(next.atoms);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("nothing to expand returns the same molecule with count 0", () => {
    const noDefs = drawing();
    const result = expandGeneric(noDefs);
    expect(result.count).toBe(0);
    expect(result.mol).toBe(noDefs);

    // Definitions exist, but no drawn atom carries their label.
    const noLabels = { ...emptyMolecule(), rgroups: { d: singleAtomDef("d", "R1", "O") } };
    const result2 = expandGeneric(noLabels);
    expect(result2.count).toBe(0);
    expect(result2.mol).toBe(noLabels);

    // A drawn label with no definition doesn't count either.
    const defOtherLabel = { ...drawing(), rgroups: { d: singleAtomDef("d", "R3", "O") } };
    expect(expandGeneric(defOtherLabel).count).toBe(0);
  });

  test("wraps copies onto grid rows below the first", () => {
    // Five combinations of a one-label drawing: the 5th copy wraps to the
    // second row (RGROUP_EXPANSION_COLUMNS = 4).
    const mol = {
      ...drawing(),
      rgroups: {
        d1: singleAtomDef("d1", "R1", "O"),
        d2: singleAtomDef("d2", "R1", "N"),
        d3: singleAtomDef("d3", "R1", "S"),
        d4: singleAtomDef("d4", "R1", "P"),
        d5: singleAtomDef("d5", "R1", "F"),
      },
    };
    const next = expandGeneric(mol).mol;
    const stride = 60 - -60 + 80;
    // Row 0 copies sit on the original's baseline; the row-1 copy is one
    // row-height (bounds height + gap) lower, back at column 0's offset.
    const fifth = Object.values(next.atoms).find((a) => a.element === "F" && a.id !== "r1");
    expect(fifth).toBeDefined();
    expect(fifth!.y).toBeCloseTo(80, 6); // bounds height (0) + gap
    expect(fifth!.x).toBeCloseTo(-60 + stride, 6); // the old R1 site, column 0
  });
});
