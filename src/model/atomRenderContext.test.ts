import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule, moveAtoms } from "./molecule";
import { computeAtomRenderContexts } from "../components/Canvas/atomRenderContext";
import type { Molecule } from "../types/chemistry";

/** Ethanol: C-C-O, so there's a terminal carbon, a bridging carbon, and a
 * terminal heteroatom — between them they exercise the label and hSuffix
 * branches of the context. Lone pairs are explicit in this model (never
 * inferred), so tests that need them set lonePairs by hand. */
function ethanol(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "c2", { x: 40, y: 0 }, "C");
  mol = addAtom(mol, "o1", { x: 80, y: 0 }, "O");
  mol = addBond(mol, "b1", "c1", "c2");
  mol = addBond(mol, "b2", "c2", "o1");
  return mol;
}

describe("computeAtomRenderContexts", () => {
  test("derives label info matching what AtomView used to compute itself", () => {
    const mol = ethanol();
    const ctx = computeAtomRenderContexts(mol, false, new Set(), null);

    // A bonded carbon is skeletal — no label, and no radius for bonds to clear.
    expect(ctx.get("c1")?.showLabel).toBe(false);
    expect(ctx.get("c1")?.labelRadius).toBe(0);

    // The O is a labeled heteroatom carrying an implicit H, and the suffix
    // placement is worked out for it even without one showing here.
    const o = ctx.get("o1");
    expect(o?.showLabel).toBe(true);
    expect(o?.labelText).toBe("O");
    expect(o?.hSuffix).toBe("H");
    expect(o?.labelRadius).toBeGreaterThan(0);
    // Lone pairs are explicit, never inferred — none were added here.
    expect(o?.lonePairPositions).toHaveLength(0);
  });

  test("showHydrogens forces skeletal carbons to render their labels", () => {
    const ctx = computeAtomRenderContexts(ethanol(), true, new Set(), null);
    for (const atomId of ["c1", "c2"]) {
      expect(ctx.get(atomId)?.showLabel).toBe(true);
      expect(ctx.get(atomId)?.labelText).toBe("C");
    }
    expect(ctx.get("o1")?.labelText).toBe("O");
  });

  test("reuses the previous object for atoms whose derived values did not change", () => {
    // This identity preservation is the entire point of the module: it's what
    // lets the React.memo'd AtomView bail out for untouched atoms.
    const mol = ethanol();
    const first = computeAtomRenderContexts(mol, false, new Set(), null);

    // An edit that only moves the *last* carbon changes nothing about the O.
    const moved = moveAtoms(mol, { c1: { x: 5, y: 5 } });
    const second = computeAtomRenderContexts(moved, false, new Set(), null, first);

    expect(second.get("o1")).toBe(first.get("o1"));
  });

  test("hands back a new object for an atom whose derived values did change", () => {
    const mol = ethanol();
    const first = computeAtomRenderContexts(mol, false, new Set(), null);

    // Moving the O's own neighbor changes its hSuffix placement and the
    // lone-pair direction, so its context must not be reused.
    const moved = moveAtoms(mol, { c2: { x: 40, y: 40 } });
    const second = computeAtomRenderContexts(moved, false, new Set(), null, first);

    expect(second.get("o1")).not.toBe(first.get("o1"));
  });

  test("a lone pair added to an atom invalidates that atom's context", () => {
    const mol = ethanol();
    const withLonePair: Molecule = { ...mol, atoms: { ...mol.atoms, o1: { ...mol.atoms.o1, lonePairs: 2 } } };
    const first = computeAtomRenderContexts(withLonePair, false, new Set(), null);
    expect(first.get("o1")?.lonePairPositions).toHaveLength(2);

    const without: Molecule = { ...withLonePair, atoms: { ...withLonePair.atoms, o1: { ...withLonePair.atoms.o1, lonePairs: 0 } } };
    const second = computeAtomRenderContexts(without, false, new Set(), null, first);
    expect(second.get("o1")?.lonePairPositions).toHaveLength(0);
    expect(second.get("o1")).not.toBe(first.get("o1"));
  });

  test("the linked 3D atom is flagged, and linking invalidates only it", () => {
    const mol = ethanol();
    const plain = computeAtomRenderContexts(mol, false, new Set(), null);
    expect(Object.values(Object.fromEntries(plain)).some((c) => c.linked)).toBe(false);

    const linked = computeAtomRenderContexts(mol, false, new Set(), "o1", plain);
    expect(linked.get("o1")?.linked).toBe(true);
    expect(linked.get("c1")?.linked).toBe(false);
    // Only the newly-linked atom's context object changes identity.
    expect(linked.get("o1")).not.toBe(plain.get("o1"));
    expect(linked.get("c1")).toBe(plain.get("c1"));
  });

  test("unlinking produces an equal (though not identical) context", () => {
    // Only one level of history is carried forward, so unlinking can't hand
    // back the object from two calls ago — it recomputes one that compares
    // equal in every field. Identity isn't guaranteed here; correctness is.
    const mol = ethanol();
    const plain = computeAtomRenderContexts(mol, false, new Set(), null);
    const linked = computeAtomRenderContexts(mol, false, new Set(), "o1", plain);
    const unlinked = computeAtomRenderContexts(mol, false, new Set(), null, linked);
    expect(unlinked.get("o1")).toStrictEqual(plain.get("o1"));
    expect(unlinked.get("o1")?.linked).toBe(false);
  });

  test("toggling showHydrogens invalidates contexts", () => {
    const mol = ethanol();
    const first = computeAtomRenderContexts(mol, false, new Set(), null);
    const second = computeAtomRenderContexts(mol, true, new Set(), null, first);
    expect(second.get("c1")).not.toBe(first.get("c1"));
    expect(second.get("c1")?.showLabel).toBe(true);
  });
});