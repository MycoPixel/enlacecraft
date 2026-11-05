import { describe, expect, test } from "vitest";
import type { CatalyticCycle, Molecule } from "../types/chemistry";
import { addAtom, emptyMolecule } from "../model/molecule";
import {
  cycleDirectionHandleAt,
  cycleRingAt,
  cycleSideAt,
  layoutCycle,
} from "./cycleLayout";

function nodeAt(mol: Molecule, id: string, x: number, y: number): Molecule {
  return addAtom(mol, id, { x, y }, "C");
}

function ring(): Molecule {
  // Three intermediates at 0°, 120° and 240° around the origin.
  let mol = emptyMolecule();
  mol = nodeAt(mol, "a", 100, 0);
  mol = nodeAt(mol, "b", -50, 86.6);
  mol = nodeAt(mol, "c", -50, -86.6);
  return mol;
}

function cycle(overrides: Partial<CatalyticCycle> = {}): CatalyticCycle {
  return {
    id: "cycle-1",
    centre: { x: 0, y: 0 },
    radius: 100,
    clockwise: true,
    nodes: [["a"], ["b"], ["c"]],
    ...overrides,
  };
}

describe("layoutCycle", () => {
  test("draws one full ring when there are no nodes", () => {
    const geometry = layoutCycle(cycle({ nodes: [] }), emptyMolecule());
    expect(geometry.nodes).toHaveLength(0);
    expect(geometry.arcs).toHaveLength(1);
    expect(Math.abs(geometry.arcs[0].sweep)).toBeCloseTo(Math.PI * 2 - 0.06, 6);
  });

  test("makes one arc per node in a three-node cycle", () => {
    const geometry = layoutCycle(cycle(), ring());
    expect(geometry.nodes).toHaveLength(3);
    expect(geometry.arcs).toHaveLength(3);

    for (const arc of geometry.arcs) {
      expect(arc.sweep).toBeGreaterThan(0);
      expect(arc.sweep).toBeLessThan(Math.PI);
      expect(Math.hypot(arc.start.x, arc.start.y)).toBeCloseTo(100, 6);
      expect(Math.hypot(arc.end.x, arc.end.y)).toBeCloseTo(100, 6);
    }
  });

  test("reverses the sweep for an anticlockwise cycle", () => {
    const geometry = layoutCycle(cycle({ clockwise: false }), ring());
    expect(geometry.arcs).toHaveLength(3);
    for (const arc of geometry.arcs) {
      expect(arc.sweep).toBeLessThan(0);
    }
  });

  test("keeps a clear gap around each node's ink", () => {
    const mol = addAtom(ring(), "a2", { x: 140, y: 0 }, "C");
    const geometry = layoutCycle(cycle({ nodes: [["a", "a2"], ["b"], ["c"]] }), mol);
    const node = geometry.nodes.find((entry) => entry.index === 0)!;

    for (const arc of geometry.arcs) {
      if (arc.fromNode === 0) expect(arc.startAngle).toBeGreaterThan(node.angle);
      if (arc.toNode === 0) expect(arc.endAngle).toBeLessThan(node.angle + Math.PI * 2);
    }
    // The gap is at least the node's angular half-width, never zero.
    expect(node.halfGap).toBeGreaterThan(0.13);
  });

  test("follows a moved node instead of keeping the old arc position", () => {
    const before = layoutCycle(cycle(), ring());
    const moved = addAtom(emptyMolecule(), "a", { x: 0, y: 100 }, "C");
    const movedMol = addAtom(addAtom(moved, "b", { x: -100, y: 0 }, "C"), "c", { x: 0, y: -100 }, "C");
    const after = layoutCycle(cycle(), movedMol);

    const beforeA = before.nodes.find((entry) => entry.index === 0)!;
    const afterA = after.nodes.find((entry) => entry.index === 0)!;
    expect(afterA.angle).not.toBeCloseTo(beforeA.angle, 3);

    // Node 0 still has an arc leaving it and one arriving at it.
    expect(after.arcs.some((arc) => arc.fromNode === 0)).toBe(true);
    expect(after.arcs.some((arc) => arc.toNode === 0)).toBe(true);
  });

  test("handles a two-node cycle with one arc each way", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 100, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: -100, y: 0 }, "C");
    const geometry = layoutCycle(cycle({ nodes: [["a"], ["b"]] }), mol);
    expect(geometry.arcs).toHaveLength(2);
    expect(geometry.arcs.map((arc) => arc.fromNode).sort()).toEqual([0, 1]);
  });

  test("puts side arrows outside the ring", () => {
    const geometry = layoutCycle(
      cycle({
        sides: [
          { id: "in", direction: "in", angle: 0, label: "substrate" },
          { id: "out", direction: "out", angle: Math.PI / 2, label: "product" },
        ],
      }),
      ring()
    );

    expect(geometry.sides).toHaveLength(2);
    for (const side of geometry.sides) {
      expect(Math.hypot(side.start.x, side.start.y)).toBeGreaterThan(100);
      expect(Math.hypot(side.end.x, side.end.y)).toBeGreaterThan(100);
    }
    const incoming = geometry.sides.find((side) => side.id === "in")!;
    // "in" points toward the ring: its end is closer than its start.
    expect(Math.hypot(incoming.end.x, incoming.end.y)).toBeLessThan(
      Math.hypot(incoming.start.x, incoming.start.y)
    );
  });

  test("hit tests distinguish the ring, a side arrow and the direction handle", () => {
    const geometry = layoutCycle(
      cycle({ sides: [{ id: "in", direction: "in", angle: 0 }] }),
      ring()
    );

    expect(cycleRingAt(geometry, { x: 100, y: 0 })).toBe(true);
    expect(cycleRingAt(geometry, { x: 0, y: 0 })).toBe(false);
    expect(cycleDirectionHandleAt(geometry, geometry.directionHandle)).toBe(true);
    const side = geometry.sides[0];
    const sideMid = { x: (side.start.x + side.end.x) / 2, y: (side.start.y + side.end.y) / 2 };
    expect(cycleSideAt(geometry, sideMid)).toBe("in");
  });
});
