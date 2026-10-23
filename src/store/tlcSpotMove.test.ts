// @vitest-environment jsdom
import { describe, expect, test, beforeEach } from "vitest";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { emptyMolecule } from "../model/molecule";
import type { Annotation, TlcPlateAnnotation } from "../types/chemistry";

function freshStore(annotations: Record<string, Annotation> = {}) {
  useMoleculeStore.setState({
    molecule: emptyMolecule(),
    annotations,
    selected: new Set<string>(),
    selectedAnnotationIds: new Set<string>(),
  });
}

const plate: TlcPlateAnnotation = {
  id: "plate-1",
  kind: "tlc",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  spots: [{ fx: 0.5, fy: 0.5, r: 4 }],
};

describe("moveTlcSpot", () => {
  beforeEach(() => {
    freshStore({ [plate.id]: plate });
  });

  test("moves a spot to the clicked point (fractional coords recomputed)", () => {
    // Click well to the right of center: fx should clamp to 1.
    useMoleculeStore.getState().moveTlcSpot(plate.id, 0, { x: 250, y: 50 });
    const spot = useMoleculeStore.getState().annotations[plate.id] as TlcPlateAnnotation;
    expect(spot.spots[0].fx).toBe(1);
    expect(spot.spots[0].fy).toBeCloseTo(0.487179, 4);
  });

  test("clamps fy to [0, 1] outside the plate's span", () => {
    useMoleculeStore.getState().moveTlcSpot(plate.id, 0, { x: 50, y: -200 });
    const spot = useMoleculeStore.getState().annotations[plate.id] as TlcPlateAnnotation;
    expect(spot.spots[0].fx).toBe(0.5);
    expect(spot.spots[0].fy).toBe(1);
  });

  test("leaves other spots untouched", () => {
    const twoSpots: TlcPlateAnnotation = { ...plate, spots: [{ fx: 0.2, fy: 0.3, r: 4 }, { fx: 0.8, fy: 0.7, r: 4 }] };
    freshStore({ [plate.id]: twoSpots });
    useMoleculeStore.getState().moveTlcSpot(plate.id, 1, { x: 20, y: 20 });
    const s = useMoleculeStore.getState().annotations[plate.id] as TlcPlateAnnotation;
    expect(s.spots[0].fx).toBe(0.2);
    expect(s.spots[0].fy).toBe(0.3);
    expect(s.spots[1].fx).toBe(0.2);
    expect(s.spots[1].fy).toBeCloseTo(0.871795, 4);
  });
});
