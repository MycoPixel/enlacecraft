import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "./molecule";
import {
  DEFAULT_SGROUP_SUBSCRIPT,
  SGROUP_TYPES,
  pruneSGroupAnnotationIds,
  pruneSgroups,
  sgroupBondIds,
  sgroupBondsTouching,
} from "./sgroups";
import type { Annotation, BracketAnnotation, Molecule, SGroup } from "../types/chemistry";

function chain(): Molecule {
  let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 60, y: 0 }, "C");
  mol = addAtom(mol, "c", { x: 120, y: 0 }, "C");
  mol = addBond(mol, "ab", "a", "b");
  mol = addBond(mol, "bc", "b", "c");
  return mol;
}

function bracket(id: string): BracketAnnotation {
  return { id, kind: "bracket", x: 0, y: 0, width: 16, height: 90, variant: "square", facing: "open" };
}

function sgroup(overrides: Partial<SGroup> = {}): SGroup {
  return { id: "sg1", type: "SRU", atomIds: ["a", "b"], bondIds: ["ab"], ...overrides };
}

describe("SGROUP_TYPES", () => {
  test("lists every type once", () => {
    expect(new Set(SGROUP_TYPES).size).toBe(SGROUP_TYPES.length);
    expect(SGROUP_TYPES).toContain("SRU");
    expect(SGROUP_TYPES).toContain("DAT");
  });

  test("polymer types get a default repeat count", () => {
    expect(DEFAULT_SGROUP_SUBSCRIPT.SRU).toBe("n");
    expect(DEFAULT_SGROUP_SUBSCRIPT.SUP).toBeUndefined();
  });
});

describe("sgroupBondIds", () => {
  test("returns only bonds with both endpoints inside the group", () => {
    const mol = chain();
    expect(sgroupBondIds(mol, ["a", "b"]).sort()).toEqual(["ab"]);
    expect(sgroupBondIds(mol, ["a", "b", "c"]).sort()).toEqual(["ab", "bc"]);
    expect(sgroupBondIds(mol, ["a"])).toEqual([]);
  });
});

describe("sgroupBondsTouching", () => {
  test("keeps an existing crossing bond whose far end is outside the group", () => {
    const mol = chain();
    expect(sgroupBondsTouching(mol, ["a", "b"], ["bc"]).sort()).toEqual(["ab", "bc"]);
  });

  test("drops an existing bond that no longer touches any member", () => {
    const mol = chain();
    expect(sgroupBondsTouching(mol, ["a"], ["bc"])).toEqual([]);
  });

  test("adds internal bonds that were not listed before", () => {
    const mol = chain();
    expect(sgroupBondsTouching(mol, ["a", "b", "c"], ["ab"]).sort()).toEqual(["ab", "bc"]);
  });
});

describe("pruneSgroups", () => {
  test("returns the original record when nothing changed", () => {
    const sgroups = { sg1: sgroup() };
    expect(pruneSgroups(sgroups, new Set(["a", "b"]), new Set(["ab"]))).toBe(sgroups);
  });

  test("drops deleted atoms from the group", () => {
    const before = { sg1: sgroup() };
    // Deleting "b" also removes bond "ab", so the group keeps neither.
    const after = pruneSgroups(before, new Set(["a"]), new Set<string>());
    expect(after?.sg1.atomIds).toEqual(["a"]);
    expect(after?.sg1.bondIds).toBeUndefined();
  });

  test("drops a group once all of its atoms are gone", () => {
    expect(pruneSgroups({ sg1: sgroup() }, new Set(["c"]), new Set(["bc"]))).toBeUndefined();
  });

  test("keeps a group that still has atoms but lost its bonds", () => {
    const before = { sg1: sgroup() };
    const after = pruneSgroups(before, new Set(["a", "b"]), new Set<string>());
    expect(after?.sg1.atomIds).toEqual(["a", "b"]);
    expect(after?.sg1.bondIds).toBeUndefined();
  });

  test("keeps an untouched sibling when another group is pruned", () => {
    const before = {
      sg1: sgroup(),
      sg2: sgroup({ id: "sg2", atomIds: ["c"], bondIds: ["bc"] }),
    };
    const after = pruneSgroups(before, new Set(["a", "b"]), new Set(["ab"]));
    expect(Object.keys(after ?? {})).toEqual(["sg1"]);
  });
});

describe("pruneSGroupAnnotationIds", () => {
  const annotations: Record<string, Annotation> = {
    b1: bracket("b1"),
    b2: bracket("b2"),
  };

  test("returns the original record when every bracket still exists", () => {
    const sgroups = { sg1: sgroup({ bracketAnnotationIds: ["b1", "b2"] }) };
    expect(pruneSGroupAnnotationIds(sgroups, annotations)).toBe(sgroups);
  });

  test("drops deleted bracket ids", () => {
    const sgroups = { sg1: sgroup({ bracketAnnotationIds: ["b1", "gone"] }) };
    expect(pruneSGroupAnnotationIds(sgroups, annotations)?.sg1.bracketAnnotationIds).toEqual(["b1"]);
  });

  test("removes the field once every bracket is gone", () => {
    const sgroups = { sg1: sgroup({ bracketAnnotationIds: ["gone"] }) };
    expect(pruneSGroupAnnotationIds(sgroups, annotations)?.sg1.bracketAnnotationIds).toBeUndefined();
  });

  test("accepts an annotation array as well as a map", () => {
    const sgroups = { sg1: sgroup({ bracketAnnotationIds: ["b1", "b2"] }) };
    expect(pruneSGroupAnnotationIds(sgroups, [bracket("b1")])?.sg1.bracketAnnotationIds).toEqual(["b1"]);
  });
});
