import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "./useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";
import type { Molecule } from "../types/chemistry";

function threeStructures(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 120, y: 0 }, "C");
  mol = addAtom(mol, "c", { x: 60, y: 100 }, "C");
  return mol;
}

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: threeStructures(),
    annotations: {},
    selected: new Set(["a", "b", "c"]),
    selectedAnnotationIds: new Set(),
    selectedCycleId: null,
    past: [],
    future: [],
    hasUnsavedChanges: false,
    language: "en",
  });
});

const state = () => useMoleculeStore.getState();

describe("catalytic cycle store actions", () => {
  test("creates a cycle from the selected structures in one undo step", () => {
    const id = state().addCatalyticCycle();
    expect(id).toBeTruthy();
    const cycle = state().molecule.cycles![0];
    expect(cycle.nodes).toHaveLength(3);
    expect(state().selectedCycleId).toBe(cycle.id);
    expect(state().past).toHaveLength(1);

    state().undo();
    expect(state().molecule.cycles).toBeUndefined();
  });

  test("moves the ring and every node atom together", () => {
    const id = state().addCatalyticCycle()!;
    const centre = state().molecule.cycles![0].centre;

    state().moveCatalyticCycle(id, 10, 20);
    const moved = state().molecule.cycles![0];
    expect(moved.centre).toEqual({ x: centre.x + 10, y: centre.y + 20 });
    expect(state().molecule.atoms.a).toMatchObject({ x: 10, y: 20 });
    expect(state().molecule.atoms.b).toMatchObject({ x: 130, y: 20 });
  });

  test("toggles direction, scale, sides and label", () => {
    const id = state().addCatalyticCycle()!;
    state().setCycleDirection(id);
    expect(state().molecule.cycles![0].clockwise).toBe(false);

    state().setCycleScale(id, 2);
    expect(state().molecule.cycles![0].scale).toBe(2);

    const sideId = state().addCycleSide(id, "in", 0, "substrate");
    expect(sideId).toBeTruthy();
    expect(state().molecule.cycles![0].sides).toHaveLength(1);

    state().attachCycleLabel(id, "  Catalytic cycle  ");
    expect(state().molecule.cycles![0].label).toBe("Catalytic cycle");

    state().removeCycleSide(id, sideId!);
    expect(state().molecule.cycles![0].sides).toBeUndefined();
  });

  test("adds and removes nodes without disturbing the drawing", () => {
    const id = state().addCatalyticCycle()!;
    useMoleculeStore.setState({
      molecule: addAtom(state().molecule, "d", { x: 200, y: 0 }, "C"),
    });
    state().setSelected(new Set(["d"]));
    expect(state().addCycleNode(id)).toBe(true);
    expect(state().molecule.cycles![0].nodes).toHaveLength(4);

    // Selecting a structure that is already on the ring is a no-op, not a
    // duplicate node.
    expect(state().addCycleNode(id)).toBe(false);
    expect(state().molecule.cycles![0].nodes).toHaveLength(4);

    state().removeCycleNode(id, 0);
    expect(state().molecule.cycles![0].nodes).toHaveLength(3);
  });

  test("deleting an atom prunes it from its node", () => {
    const id = state().addCatalyticCycle()!;
    expect(state().molecule.cycles![0].nodes).toHaveLength(3);

    state().setSelected(new Set(["a"]));
    state().deleteSelection();

    const cycle = state().molecule.cycles![0];
    expect(cycle.id).toBe(id);
    expect(cycle.nodes.some((node) => node.includes("a"))).toBe(false);
  });

  test("removing the cycle leaves its structures on the canvas", () => {
    const id = state().addCatalyticCycle()!;
    state().removeCatalyticCycle(id);
    expect(state().molecule.cycles).toBeUndefined();
    expect(Object.keys(state().molecule.atoms)).toHaveLength(3);
    expect(state().selectedCycleId).toBeNull();
  });
});
