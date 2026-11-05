import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule, setAtomGroup } from "../model/molecule";
import type { Molecule } from "../types/chemistry";
import { analyzeStereochemistry, computeStereochemistry } from "./stereo";

/** Lactic acid drawn with the stereocenter at the origin: methyl left,
 *  hydroxyl right, carboxyl carbon up (canvas y grows downward). The
 *  `stereo` argument controls the bond from the center to the hydroxyl. */
function lacticAcid(stereo: "wedge" | "dash" | "none" | "wavy"): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "oh", { x: 42, y: 0 }, "O");
  mol = addAtom(mol, "me", { x: -42, y: 0 }, "C");
  mol = addAtom(mol, "cooh", { x: 0, y: -42 }, "C");
  mol = addAtom(mol, "o1", { x: 42, y: -84 }, "O");
  mol = addAtom(mol, "o2", { x: -42, y: -84 }, "O");
  mol = addBond(mol, "b1", "c", "oh", 1, stereo === "none" ? "none" : stereo);
  mol = addBond(mol, "b2", "c", "me", 1);
  mol = addBond(mol, "b3", "c", "cooh", 1);
  mol = addBond(mol, "b4", "cooh", "o1", 2);
  mol = addBond(mol, "b5", "cooh", "o2", 1);
  return mol;
}

/** 2-butene with the two methyls above/below the double bond. */
function butene(geometry: "trans" | "cis" | "collinear"): Molecule {
  const y = geometry === "trans" ? 36 : geometry === "cis" ? -36 : 0;
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "c2", { x: 42, y: 0 }, "C");
  mol = addAtom(mol, "m1", { x: -21, y: -36 }, "C");
  mol = addAtom(mol, "m2", { x: 63, y }, "C");
  mol = addBond(mol, "db", "c1", "c2", 2);
  mol = addBond(mol, "b1", "c1", "m1", 1);
  mol = addBond(mol, "b2", "c2", "m2", 1);
  return mol;
}

describe("analyzeStereochemistry — tetrahedral centers", () => {
  test("a wedged substituent on a drawn lactic acid resolves to S", () => {
    const result = computeStereochemistry(lacticAcid("wedge"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.atoms).toEqual([{ atomId: "c", label: "S", relative: false }]);
  });

  test("the mirrored dash gives R", () => {
    const result = computeStereochemistry(lacticAcid("dash"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.atoms).toEqual([{ atomId: "c", label: "R", relative: false }]);
  });

  test("a flat, unwedged stereocenter is reported as undefined rather than guessed", () => {
    const result = computeStereochemistry(lacticAcid("none"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.atoms).toEqual([]);
    expect(result.undefinedAtoms).toEqual(["c"]);
  });

  test("a wavy bond overrides whatever geometry OCL would infer", () => {
    // OpenChemLib happily infers S from the remaining 2D geometry; a wavy
    // bond means "unknown/mixed" by definition, so it must not be presented
    // as a computed assignment.
    const result = computeStereochemistry(lacticAcid("wavy"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.atoms).toEqual([]);
    expect(result.undefinedAtoms).toEqual(["c"]);
  });

  test("explicit hydrogens reordered by the parser don't shift the atom mapping", () => {
    // The molfile parser moves simple hydrogens to the end of its atom
    // array. h1 is deliberately written *between* the stereocenter and the
    // other heavy atoms, so a naive index mapping would attribute the
    // computed label to the wrong app atom (or to the hydrogen).
    let mol = emptyMolecule();
    mol = addAtom(mol, "c", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "h1", { x: 0, y: 42 }, "H");
    mol = addAtom(mol, "oh", { x: 42, y: 0 }, "O");
    mol = addAtom(mol, "me", { x: -42, y: 0 }, "C");
    mol = addAtom(mol, "cooh", { x: 0, y: -42 }, "C");
    mol = addAtom(mol, "o1", { x: 42, y: -84 }, "O");
    mol = addAtom(mol, "o2", { x: -42, y: -84 }, "O");
    mol = addBond(mol, "b1", "c", "oh", 1, "wedge");
    mol = addBond(mol, "b2", "c", "me", 1);
    mol = addBond(mol, "b3", "c", "cooh", 1);
    mol = addBond(mol, "b4", "c", "h1", 1);
    mol = addBond(mol, "b5", "cooh", "o1", 2);
    mol = addBond(mol, "b6", "cooh", "o2", 1);

    const result = computeStereochemistry(mol);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.atoms.map((a) => a.atomId)).toEqual(["c"]);
    expect(result.atoms[0].label).toMatch(/^[RS]$/);
    expect(result.undefinedAtoms).toEqual([]);
  });

  test("an achiral molecule produces no assignments at all", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "c2", { x: 42, y: 0 }, "C");
    mol = addAtom(mol, "o", { x: 84, y: 0 }, "O");
    mol = addBond(mol, "b1", "c1", "c2", 1);
    mol = addBond(mol, "b2", "c2", "o", 1);

    const result = computeStereochemistry(mol);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.atoms).toEqual([]);
    expect(result.undefinedAtoms).toEqual([]);
    expect(result.ambiguousAtoms).toEqual([]);
  });
});

describe("analyzeStereochemistry — E/Z double bonds", () => {
  test("substituents on opposite sides are E", () => {
    const result = computeStereochemistry(butene("trans"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.bonds).toEqual([{ bondId: "db", label: "E", relative: false }]);
  });

  test("substituents on the same side are Z", () => {
    const result = computeStereochemistry(butene("cis"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.bonds).toEqual([{ bondId: "db", label: "Z", relative: false }]);
  });

  test("collinear substituents leave the configuration undefined", () => {
    const result = computeStereochemistry(butene("collinear"));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.bonds).toEqual([]);
    expect(result.undefinedBonds).toEqual(["db"]);
  });
});

describe("analyzeStereochemistry — unsupported structures", () => {
  test("abbreviated groups make the analysis unavailable", () => {
    const mol = setAtomGroup(lacticAcid("wedge"), "me", "Ph");
    expect(computeStereochemistry(mol)).toEqual({ status: "unavailable", reason: "abbreviated-group" });
  });

  test("query atoms make the analysis unavailable", () => {
    const base = lacticAcid("wedge");
    const mol: Molecule = {
      ...base,
      atoms: { ...base.atoms, me: { ...base.atoms.me, queryProps: { element: "C N O" } } },
    };
    expect(computeStereochemistry(mol)).toEqual({ status: "unavailable", reason: "query-atom" });
  });

  test("a metal makes the analysis unavailable", () => {
    let mol = lacticAcid("wedge");
    mol = addAtom(mol, "fe", { x: 84, y: 0 }, "Fe");
    expect(computeStereochemistry(mol)).toEqual({ status: "unavailable", reason: "metal" });
  });

  test("haptic and dative bonds make the analysis unavailable", () => {
    const base = lacticAcid("wedge");
    expect(
      computeStereochemistry({
        ...base,
        hapticBonds: { h: { id: "h", metalAtomId: "me", ringAtomIds: ["c", "oh"] } },
      }),
    ).toEqual({ status: "unavailable", reason: "metal" });

    const dative: Molecule = {
      ...base,
      bonds: { ...base.bonds, b1: { ...base.bonds.b1, dative: true } },
    };
    expect(computeStereochemistry(dative)).toEqual({ status: "unavailable", reason: "metal" });
  });
});

describe("analyzeStereochemistry — caching", () => {
  test("repeated calls on the same molecule object reuse the cached result", () => {
    const mol = lacticAcid("wedge");
    expect(analyzeStereochemistry(mol)).toBe(analyzeStereochemistry(mol));
  });

  test("a new molecule object is analyzed afresh", () => {
    const first = analyzeStereochemistry(lacticAcid("wedge"));
    const second = analyzeStereochemistry(lacticAcid("dash"));
    expect(first).not.toBe(second);
  });
});

describe("stereochemistry UI translations", () => {
  test("every unavailable reason and section label resolves in both languages", async () => {
    const { translate } = await import("../i18n/translate");
    const keys = [
      "moleculeInfo.stereoHeading",
      "moleculeInfo.stereoShowOnCanvas",
      "moleculeInfo.stereoComputed",
      "moleculeInfo.stereoNeedsAttention",
      "moleculeInfo.stereoUndefined",
      "moleculeInfo.stereoAmbiguous",
      "moleculeInfo.stereoNone",
      "moleculeInfo.stereoClickHint",
      "moleculeInfo.stereoUnavailable.abbreviated-group",
      "moleculeInfo.stereoUnavailable.query-atom",
      "moleculeInfo.stereoUnavailable.metal",
      "moleculeInfo.stereoUnavailable.parse-failed",
    ];
    for (const lang of ["en", "es"] as const) {
      for (const key of keys) {
        expect(translate(lang, key)).not.toBe(key);
      }
    }
  });
});
