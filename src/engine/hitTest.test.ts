import { describe, expect, test } from "vitest";
import { atomAt, bondAt, hitRadius, MIN_HIT_PX_PRECISE, MIN_HIT_PX_TOUCH } from "./hitTest";
import { emptyMolecule, addAtom, addBond } from "../model/molecule";
import type { Molecule } from "../types/chemistry";

/**
 * Hit targets are sized in world units, so they shrink on screen as the view
 * zooms out. At the minimum zoom that put atoms at a 4px radius and bond lines
 * at 2px — unhittable with a fingertip, and worst exactly when the structure
 * is biggest. hitRadius converts a world radius into one with an on-screen
 * floor, which these tests pin down.
 */

/**
 * Two atoms well separated along x, so a probe point near one is
 * unambiguously nearer that one. The gap is 200 rather than a realistic bond
 * length deliberately: it keeps "which atom is nearest" from flipping as the
 * hit radius grows, which is exactly the distinction these tests are checking.
 */
function twoAtomChain(): { mol: Molecule; a: string; b: string } {
  const a = "atom-a";
  const b = "atom-b";
  let mol = addAtom(emptyMolecule(), a, { x: 0, y: 0 }, "C");
  mol = addAtom(mol, b, { x: 200, y: 0 }, "C");
  mol = addBond(mol, "bond-ab", a, b, 1, "none");
  return { mol, a, b };
}

describe("hitRadius", () => {
  test("keeps the world radius when the target is already big enough on screen", () => {
    // At 100% zoom, 16 world units is 16px — well past either floor.
    expect(hitRadius(16, 1, MIN_HIT_PX_PRECISE)).toBe(16);
  });

  test("grows the radius to hold an on-screen floor when zoomed out", () => {
    // 22px floor at 25% zoom needs 88 world units.
    expect(hitRadius(16, 0.25, MIN_HIT_PX_TOUCH)).toBeCloseTo(88);
  });

  test("zoom compensation is monotonic — zooming out never shrinks the target", () => {
    let previous = 0;
    for (const scale of [1, 0.75, 0.5, 0.25, 0.1]) {
      const r = hitRadius(16, scale, MIN_HIT_PX_TOUCH);
      expect(r).toBeGreaterThanOrEqual(previous);
      previous = r;
    }
  });

  test("survives a degenerate scale instead of returning Infinity", () => {
    // A zero or NaN scale would otherwise produce Infinity and match every atom.
    expect(hitRadius(16, 0, MIN_HIT_PX_PRECISE)).toBe(16);
    expect(hitRadius(16, NaN, MIN_HIT_PX_PRECISE)).toBe(16);
    expect(hitRadius(16, Infinity, MIN_HIT_PX_PRECISE)).toBe(16);
  });

  test("the touch floor also applies at 100% zoom, where it exceeds the world radius", () => {
    // Worth stating explicitly: MIN_HIT_PX_TOUCH (22) is larger than the
    // 16-unit atom radius, so a finger always gets at least a 44px-wide
    // target even fully zoomed in. Deliberate - the guideline is a floor,
    // not something that only kicks in when zoomed out.
    expect(hitRadius(16, 1, MIN_HIT_PX_TOUCH)).toBe(22);
    // A bond's 8-unit tolerance is below the floor even at full zoom.
    expect(hitRadius(8, 1, MIN_HIT_PX_TOUCH)).toBe(22);
  });
});

describe("atomAt at low zoom", () => {
  test("a point outside the world radius but inside the touch floor hits when zoomed out", () => {
    const { mol, a } = twoAtomChain();
    // 20 world units off atom-a. At 0.25 zoom with a 44px touch floor the
    // effective radius is 176 units, so this is comfortably inside; at 1:1
    // zoom with the precise 10px floor the radius stays 16 units and it misses.
    const pt = { x: 20, y: 0 };
    expect(atomAt(mol, pt, 16, null, 0.25, MIN_HIT_PX_TOUCH)).toBe(a);
    expect(atomAt(mol, pt, 16, null, 1, MIN_HIT_PX_PRECISE)).toBeNull();
  });

  test("at full zoom the precise floor leaves behaviour essentially unchanged", () => {
    // 10px precise floor at scale 1 is below the 16-unit radius, so the world
    // radius wins and the original 16-unit reach is preserved exactly.
    expect(hitRadius(16, 1, MIN_HIT_PX_PRECISE)).toBe(16);
    const { mol } = twoAtomChain();
    expect(atomAt(mol, { x: 20, y: 0 }, 16, null, 1, MIN_HIT_PX_PRECISE)).toBeNull();
  });

  test("touch floor is more forgiving than the precise one at the same zoom", () => {
    const { mol } = twoAtomChain();
    // 20 units off atom-a and 200 away from atom-b, so atom-a is the only
    // candidate once the floor widens.
    const pt = { x: 0, y: 20 };
    expect(atomAt(mol, pt, 16, null, 1, MIN_HIT_PX_PRECISE)).toBeNull();
    expect(atomAt(mol, pt, 16, null, 1, MIN_HIT_PX_TOUCH)).toBe("atom-a");
  });

  test("still picks the nearest atom when the enlarged radius covers two", () => {
    const { mol, a, b } = twoAtomChain();
    // 20 units from atom-a, 180 from atom-b: even a radius wide enough to
    // cover both still has to pick the nearer one.
    const pt = { x: 20, y: 0 };
    const hit = atomAt(mol, pt, 16, null, 0.25, MIN_HIT_PX_TOUCH);
    expect(hit).toBe(a);
    expect(hit).not.toBe(b);
  });

  test("excludeId is still honoured after the radius change", () => {
    const { mol, a, b } = twoAtomChain();
    // At the origin, only the excluded atom is anywhere near.
    expect(atomAt(mol, { x: 0, y: 0 }, 16, a, 0.25, MIN_HIT_PX_TOUCH)).toBeNull();
    // And it still returns the *other* atom when that one is excluded.
    expect(atomAt(mol, { x: 0, y: 0 }, 16, b, 0.25, MIN_HIT_PX_TOUCH)).toBe(a);
  });
});

describe("bondAt at low zoom", () => {
  test("a bond is hittable off its line when zoomed out with a touch floor", () => {
    const { mol } = twoAtomChain();
    // 20 world units above the bond's midpoint: outside the 8-unit tolerance
    // and outside the 10px precise floor (which lands at 10 units at 1:1), but
    // well inside the 88-unit tolerance the 22px touch floor gives at 0.25
    // zoom.
    const pt = { x: 100, y: 20 };
    expect(bondAt(mol, pt)).toBeNull();
    expect(bondAt(mol, pt, 8, 0.25, MIN_HIT_PX_TOUCH)).toBe("bond-ab");
    expect(bondAt(mol, pt, 8, 1, MIN_HIT_PX_PRECISE)).toBeNull();
  });

  test("a bond stays hittable well off its line at 1:1 too, for touch", () => {
    const { mol } = twoAtomChain();
    // The 22px touch floor exceeds the 8-unit tolerance at 1:1, so a bond
    // remains grabbable by finger even fully zoomed in.
    expect(bondAt(mol, { x: 100, y: 20 }, 8, 1, MIN_HIT_PX_TOUCH)).toBe("bond-ab");
  });

  test("the offset past the bond's endpoints does not match", () => {
    const { mol } = twoAtomChain();
    // Well beyond atom b along the same line, so the closest point on the
    // segment is the endpoint and the perpendicular distance is large.
    expect(bondAt(mol, { x: 400, y: 0 }, 8, 0.25, MIN_HIT_PX_TOUCH)).toBeNull();
  });
});