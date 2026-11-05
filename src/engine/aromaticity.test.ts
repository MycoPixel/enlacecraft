import { describe, expect, test } from "vitest";
import { emptyMolecule, addAtom, addBond, setAtomCharge, setAtomGroup } from "../model/molecule";
import { placeRing } from "./ringPlacement";
import { RING_TEMPLATES } from "../model/constants";
import { analyzeAromaticity } from "./aromaticity";
import type { Molecule } from "../types/chemistry";

function ringTemplate(id: string) {
  const t = RING_TEMPLATES.find((r) => r.id === id);
  if (!t) throw new Error(`no such ring template: ${id}`);
  return t;
}

function fromTemplate(id: string): Molecule {
  return placeRing(emptyMolecule(), ringTemplate(id), { x: 0, y: 0 }, { type: "none" });
}

/** A ring of `ids` with the given per-edge bond orders, e.g. [2,1,2,1,1]. */
function ring(ids: string[], orders: number[], charges: Record<string, number> = {}): Molecule {
  let mol = emptyMolecule();
  ids.forEach((id, i) => {
    mol = addAtom(mol, id, { x: 40 * i, y: 0 }, "C");
  });
  ids.forEach((id, i) => {
    const next = ids[(i + 1) % ids.length];
    mol = addBond(mol, `b${i}`, id, next, orders[i] as 1 | 2);
  });
  for (const [id, charge] of Object.entries(charges)) mol = setAtomCharge(mol, id, charge);
  return mol;
}

/** Azulene: a 5-ring and a 7-ring sharing the d-e bond. */
function azulene(): Molecule {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const edges: [string, string, 1 | 2][] = [
    ["a", "b", 2], ["b", "c", 1], ["c", "d", 2], ["d", "e", 1], ["e", "a", 1],
    ["e", "f", 2], ["f", "g", 1], ["g", "h", 2], ["h", "i", 1], ["i", "j", 2], ["j", "d", 1],
  ];
  let mol = emptyMolecule();
  ids.forEach((id, i) => {
    mol = addAtom(mol, id, { x: 40 * i, y: 0 }, "C");
  });
  edges.forEach(([from, to, order], i) => {
    mol = addBond(mol, `b${i}`, from, to, order);
  });
  return mol;
}

describe("monocyclic aromatics", () => {
  test("benzene: 6 π electrons, 4n+2 with n=1", () => {
    const [system] = analyzeAromaticity(fromTemplate("benzene"));
    expect(system.rings).toHaveLength(1);
    expect(system.rings[0]).toHaveLength(6);
    expect(system.verdict).toBe("aromatic");
    expect(system.reason).toBe("huckel-4n2");
    expect(system.piElectrons).toBe(6);
    expect(system.n).toBe(1);
    expect(system.nonConjugatedAtoms).toEqual([]);
    expect(system.crossCheck).toEqual([true]);
  });

  test("pyridine: the ring N contributes 1, not a lone pair (it already has a double bond)", () => {
    const [system] = analyzeAromaticity(fromTemplate("pyridine"));
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(6);
  });

  test("furan: the ring O donates a lone pair, so 4 + 2 = 6", () => {
    const [system] = analyzeAromaticity(fromTemplate("furan"));
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(6);
  });

  test("pyrrole: the ring N donates a lone pair too", () => {
    const [system] = analyzeAromaticity(fromTemplate("pyrrole"));
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(6);
  });

  test("imidazole and pyrimidine", () => {
    for (const id of ["imidazole", "pyrimidine"]) {
      const [system] = analyzeAromaticity(fromTemplate(id));
      expect([id, system.verdict, system.piElectrons]).toEqual([id, "aromatic", 6]);
    }
  });

  test("thiophene (S donates like O)", () => {
    const [system] = analyzeAromaticity(fromTemplate("thiophene"));
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(6);
  });
});

describe("non-aromatic because conjugation is broken", () => {
  test("cyclohexane: every atom is sp3", () => {
    const [system] = analyzeAromaticity(fromTemplate("cyclohexane"));
    expect(system.verdict).toBe("non-aromatic");
    expect(system.reason).toBe("not-conjugated");
    expect(system.nonConjugatedAtoms).toHaveLength(6);
    expect(system.crossCheck).toEqual([false]);
  });

  test("cyclopentadiene vs the cyclopentadienyl cation — the pair that looks identical on paper", () => {
    // Two C=C plus one sp3 CH2 in both. The only difference is whether that
    // carbon carries a charge, which is what decides conjugated-or-not.
    const diene = ring(["a", "b", "c", "d", "e"], [2, 1, 2, 1, 1]);
    const [dieneSystem] = analyzeAromaticity(diene);
    expect(dieneSystem.verdict).toBe("non-aromatic");
    expect(dieneSystem.reason).toBe("not-conjugated");
    expect(dieneSystem.nonConjugatedAtoms).toEqual(["e"]);

    // Same drawing, carbon carries +1: an empty p orbital, so the ring IS
    // conjugated and its 4 electrons make it antiaromatic.
    const cation = ring(["a", "b", "c", "d", "e"], [2, 1, 2, 1, 1], { e: 1 });
    const [cationSystem] = analyzeAromaticity(cation);
    expect(cationSystem.verdict).toBe("antiaromatic");
    expect(cationSystem.reason).toBe("huckel-4n");
    expect(cationSystem.piElectrons).toBe(4);
    expect(cationSystem.n).toBe(1);
    expect(cationSystem.nonConjugatedAtoms).toEqual([]);
  });

  test("cyclopentadienyl anion: same ring, lone pair instead, 6 π → aromatic", () => {
    const anion = ring(["a", "b", "c", "d", "e"], [2, 1, 2, 1, 1], { e: -1 });
    const [system] = analyzeAromaticity(anion);
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(6);
    expect(system.n).toBe(1);
  });

  test("cyclohexene is non-aromatic, not '4 π electrons'", () => {
    const mol = ring(["a", "b", "c", "d", "e", "f"], [2, 1, 1, 1, 1, 1]);
    const [system] = analyzeAromaticity(mol);
    expect(system.verdict).toBe("non-aromatic");
    expect(system.reason).toBe("not-conjugated");
  });
});

describe("antiaromaticity", () => {
  test("cyclobutadiene: 4 π electrons, 4n with n=1", () => {
    const mol = ring(["a", "b", "c", "d"], [2, 1, 2, 1]);
    const [system] = analyzeAromaticity(mol);
    expect(system.verdict).toBe("antiaromatic");
    expect(system.reason).toBe("huckel-4n");
    expect(system.piElectrons).toBe(4);
    expect(system.n).toBe(1);
  });

  test("cyclopropenyl cation: 2 π electrons is 4n+2 with n=0", () => {
    const mol = ring(["a", "b", "c"], [2, 1, 1], { c: 1 });
    const [system] = analyzeAromaticity(mol);
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(2);
    expect(system.n).toBe(0);
  });

  test("tropylium: 7-ring, three C=C plus an empty p → 6 π → aromatic", () => {
    const mol = ring(["a", "b", "c", "d", "e", "f", "g"], [2, 1, 2, 1, 2, 1, 1], { g: 1 });
    const [system] = analyzeAromaticity(mol);
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(6);
  });

  test("cyclooctatetraene as drawn is antiaromatic — the drawing is planar, real COT is not", () => {
    // Documents the boundary of what a topology-only answer can say: this
    // reports what the *drawn* connectivity gives. The real molecule escapes
    // antiaromaticity by puckering to a tub, which only a 3D geometry pass
    // can reveal.
    const mol = ring(["a", "b", "c", "d", "e", "f", "g", "h"], [2, 1, 2, 1, 2, 1, 2, 1]);
    const [system] = analyzeAromaticity(mol);
    expect(system.verdict).toBe("antiaromatic");
    expect(system.piElectrons).toBe(8);
    expect(system.n).toBe(2);
  });
});

describe("fused ring systems", () => {
  test("naphthalene: one 10 π system shared by both hexagons", () => {
    const systems = analyzeAromaticity(fromTemplate("naphthalene"));
    expect(systems).toHaveLength(1);
    const [system] = systems;
    expect(system.rings).toHaveLength(2);
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(10);
    expect(system.n).toBe(2);
    expect(system.crossCheck).toEqual([true, true]);
  });

  test("azulene: neither ring is 4n+2 alone, but the fused pair is a 10 π aromatic system", () => {
    const systems = analyzeAromaticity(azulene());
    expect(systems).toHaveLength(1);
    const [system] = systems;
    expect(system.rings.map((r) => r.length).sort()).toEqual([5, 7]);
    expect(system.verdict).toBe("aromatic");
    expect(system.piElectrons).toBe(10);
    // The per-ring counts are 5 and 7 — neither satisfies Hückel, which is
    // exactly why the system verdict is the one that gets reported.
    expect([...system.perRingPiElectrons].sort((a, b) => a! - b!)).toEqual([5, 7]);
  });

  test("spiro rings share an atom but not a π system, so they stay separate", () => {
    let mol = ring(["a", "b", "c", "d"], [2, 1, 2, 1]);
    mol = addAtom(mol, "e", { x: 0, y: 60 }, "C");
    mol = addBond(mol, "s1", "d", "e", 1);
    mol = addAtom(mol, "f", { x: 40, y: 80 }, "C");
    mol = addBond(mol, "s2", "e", "f", 1);
    const systems = analyzeAromaticity(mol);
    // The cyclobutadiene ring is one system; the 3-atom path e-f is not a ring.
    expect(systems).toHaveLength(1);
    expect(systems[0].verdict).toBe("antiaromatic");
  });
});

describe("things it declines to answer", () => {
  test("an abbreviated group in the ring gives unknown, not a guess", () => {
    let mol = ring(["a", "b", "c", "d", "e", "f"], [2, 1, 2, 1, 2, 1]);
    mol = setAtomGroup(mol, "a", "Ph");
    const [system] = analyzeAromaticity(mol);
    expect(system.verdict).toBe("unknown");
    expect(system.reason).toBe("abbreviated-group");
    expect(system.piElectrons).toBeNull();
    expect(system.crossCheck).toBeNull();
  });

  test("a metal in the ring gives unknown", () => {
    let mol = ring(["a", "b", "c", "d", "e"], [2, 1, 2, 1, 2]);
    mol = addAtom(mol, "fe", { x: 0, y: 60 }, "Fe");
    mol = addBond(mol, "s1", "d", "fe", 1);
    mol = addBond(mol, "s2", "fe", "e", 1);
    const systems = analyzeAromaticity(mol);
    const system = systems.find((s) => s.rings.some((r) => r.includes("fe")));
    expect(system?.verdict).toBe("unknown");
    expect(system?.reason).toBe("metal-ring");
  });

  test("an acyclic molecule has no systems at all", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b1", "a", "b", 1);
    expect(analyzeAromaticity(mol)).toEqual([]);
  });
});

describe("the Kekulé pattern is not enough", () => {
  test("cyclohexatriene drawn with alternating bonds and cyclooctatetraene both alternate, yet differ", () => {
    // Both pass any "do the bonds alternate?" test. Only the π count separates
    // them, which is the whole reason this module exists alongside — not
    // instead of — engine/aromaticRings.ts's isKekulizedRing.
    const benzene = analyzeAromaticity(fromTemplate("benzene"))[0];
    const cot = analyzeAromaticity(ring(["a", "b", "c", "d", "e", "f", "g", "h"], [2, 1, 2, 1, 2, 1, 2, 1]))[0];
    expect(benzene.verdict).toBe("aromatic");
    expect(cot.verdict).toBe("antiaromatic");
  });
});