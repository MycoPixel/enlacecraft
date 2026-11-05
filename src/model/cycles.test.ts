import { describe, expect, test } from "vitest";
import type { CatalyticCycle } from "../types/chemistry";
import { addAtom, emptyMolecule } from "./molecule";
import {
  centroidOf,
  cycleAtomIds,
  fragmentsForNodes,
  pruneCyclesForAtoms,
  suggestedCycleRadius,
} from "./cycles";

function cycle(overrides: Partial<CatalyticCycle> = {}): CatalyticCycle {
  return {
    id: "c1",
    centre: { x: 0, y: 0 },
    radius: 100,
    clockwise: true,
    nodes: [["a"], ["b"]],
    ...overrides,
  };
}

describe("cycles", () => {
  test("collects every atom in a cycle's nodes", () => {
    expect([...cycleAtomIds(cycle({ nodes: [["a", "b"], ["c"]] }))].sort()).toEqual(["a", "b", "c"]);
  });

  test("groups selected atoms into one node per connected structure", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 0 }, "C");
    mol = addAtom(mol, "c", { x: 300, y: 0 }, "C");
    mol = { ...mol, bonds: { ab: { id: "ab", a1: "a", a2: "b", order: 1, stereo: "none", doubleSide: "auto" } } };

    expect(fragmentsForNodes(mol, ["a", "b", "c"])).toEqual([["a", "b"], ["c"]]);
  });

  test("suggests a radius that clears the nodes' atoms", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 100, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 0, y: 80 }, "C");
    expect(suggestedCycleRadius(mol, { x: 0, y: 0 }, [["a"], ["b"]])).toBeCloseTo(158, 6);
  });

  test("centres on the atoms, or falls back when there are none", () => {
    const mol = addAtom(emptyMolecule(), "a", { x: 10, y: 20 }, "C");
    expect(centroidOf(mol, ["a"], { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
    expect(centroidOf(mol, ["missing"], { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  test("prunes deleted atoms and drops nodes that become empty", () => {
    const cycles = [cycle({ nodes: [["a"], ["b"]] })];
    const pruned = pruneCyclesForAtoms(cycles, new Set(["a"]))!;
    expect(pruned).toHaveLength(1);
    expect(pruned[0].nodes).toEqual([["a"]]);
  });

  test("drops a cycle that loses every node, but keeps a bare ring", () => {
    expect(pruneCyclesForAtoms([cycle()], new Set())).toBeUndefined();
    expect(pruneCyclesForAtoms([cycle({ nodes: [] })], new Set())).toHaveLength(1);
  });

  test("returns the same array when nothing changed", () => {
    const cycles = [cycle()];
    expect(pruneCyclesForAtoms(cycles, new Set(["a", "b"]))).toBe(cycles);
  });
});
