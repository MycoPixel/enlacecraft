// @vitest-environment jsdom
import { describe, expect, test, beforeAll, vi } from "vitest";
import * as $3Dmol from "3dmol";
import { Resources } from "openchemlib";
import { addAtom, addBond, emptyMolecule } from "../../model/molecule";
import { embedMolecule3D } from "../../io/embed3d";
import { parseV2000 } from "./rotateBond";
import { atomIdForSerial, buildSerialToAtomId, serialForAtomId } from "./atomLink";

vi.mock("../../io/oclResources", () => ({ ensureOclResourcesLoaded: async () => {} }));
beforeAll(() => { Resources.registerFromNodejs(); });

/** N-O-S-C-F, deliberately not alphabetical so that any sorting or map/hash
 * ordering introduced anywhere in the embed pipeline would break the
 * positional mapping this module relies on. */
function oddChain() {
  let mol = emptyMolecule();
  mol = addAtom(mol, "n1", { x: 0, y: 0 }, "N");
  mol = addAtom(mol, "o1", { x: 40, y: 0 }, "O");
  mol = addAtom(mol, "s1", { x: 80, y: 0 }, "S");
  mol = addAtom(mol, "c1", { x: 120, y: 0 }, "C");
  mol = addAtom(mol, "f1", { x: 160, y: 0 }, "F");
  const ids = Object.keys(mol.atoms);
  for (let i = 0; i < ids.length - 1; i++) mol = addBond(mol, `b${i}`, ids[i], ids[i + 1]);
  return mol;
}

describe("2D <-> 3D atom correspondence", () => {
  test("serial N in the 3D model is the Nth 2D atom (regression guard)", async () => {
    // This is the assumption the whole feature rests on. If OpenChemLib ever
    // changes its atom ordering, this test fails here rather than the app
    // silently highlighting the wrong atom on the 2D canvas.
    const mol = oddChain();
    const { serialToAtomId, heavyAtomCount } = buildSerialToAtomId(mol);

    const res = await embedMolecule3D(mol, "quick", 1);
    const parsed = parseV2000(res.molfile);

    // The first `heavyAtomCount` positions are the 2D atoms, in order.
    for (let i = 0; i < heavyAtomCount; i++) {
      expect(parsed.atoms[i].element).toBe(mol.atoms[serialToAtomId[i]].element);
    }
  });

  test("3Dmol's atom.serial is zero-based, and atomIdForSerial agrees", async () => {
    // THE regression test for a real bug: atomIdForSerial originally did
    // `serial - 1`, treating the serial as a 1-based V2000 atom number. Every
    // click therefore selected the atom *before* the one clicked, and clicking
    // the first atom reported "no counterpart in the 2D drawing".
    //
    // No test written against this app's own parseV2000 could have caught it,
    // because that parser is consistently 0-based — which is why the
    // rotate-bond tool, the other consumer of atom.serial, always worked. So
    // this drives 3Dmol's actual parser and asserts the convention directly.
    const mol = oddChain();
    const { serialToAtomId } = buildSerialToAtomId(mol);
    const res = await embedMolecule3D(mol, "quick", 1);

    // parseMolData returns one frame per model; a single-model molfile gives
    // exactly one frame holding all the atoms.
    const frames = $3Dmol.GLModel.parseMolData(res.molfile, "mol", {}) as { serial: number; elem: string }[][];
    expect(frames).toHaveLength(1);
    const parsed = frames[0];
    expect(parsed.length).toBeGreaterThan(serialToAtomId.length);

    // Sanity: the serials really are 0-based, so the first atom is serial 0.
    expect(parsed[0].serial).toBe(0);

    // And each heavy atom maps back to the 2D atom with the same element.
    for (let i = 0; i < serialToAtomId.length; i++) {
      expect(parsed[i].serial).toBe(i);
      const id = atomIdForSerial(serialToAtomId, parsed[i].serial);
      expect(id).toBe(serialToAtomId[i]);
      expect(mol.atoms[id!].element).toBe(parsed[i].elem);
    }
  });

  test("clicking the first heavy atom selects the first 2D atom, not null", () => {
    // The specific user-visible symptom of the off-by-one.
    const { serialToAtomId } = buildSerialToAtomId(oddChain());
    expect(atomIdForSerial(serialToAtomId, 0)).toBe(serialToAtomId[0]);
  });

  test("clicking the last heavy atom selects the last 2D atom", () => {
    const { serialToAtomId } = buildSerialToAtomId(oddChain());
    const last = serialToAtomId.length - 1;
    expect(atomIdForSerial(serialToAtomId, last)).toBe(serialToAtomId[last]);
  });

  test("generated hydrogens sit past the heavy-atom range and map to nothing", async () => {
    const mol = oddChain();
    const { serialToAtomId, heavyAtomCount } = buildSerialToAtomId(mol);
    const res = await embedMolecule3D(mol, "quick", 1);
    const parsed = parseV2000(res.molfile);

    // The embedded structure always saturates valences with explicit H, so
    // there are more atoms than the 2D drawing has.
    expect(parsed.atoms.length).toBeGreaterThan(heavyAtomCount);
    // The first generated hydrogen sits immediately past the heavy atoms.
    expect(atomIdForSerial(serialToAtomId, heavyAtomCount)).toBeNull();
  });

  test("serialToAtomId round-trips through atomIdForSerial/serialForAtomId", () => {
    const mol = oddChain();
    const { serialToAtomId } = buildSerialToAtomId(mol);
    serialToAtomId.forEach((id, i) => {
      expect(atomIdForSerial(serialToAtomId, i)).toBe(id);
      expect(serialForAtomId(serialToAtomId, id)).toBe(i);
    });
  });

  test("an unknown atom id has no serial", () => {
    const { serialToAtomId } = buildSerialToAtomId(oddChain());
    expect(serialForAtomId(serialToAtomId, "does-not-exist")).toBeNull();
  });

  test("serials outside the valid range map to null rather than wrapping", () => {
    const { serialToAtomId } = buildSerialToAtomId(oddChain());
    expect(atomIdForSerial(serialToAtomId, -1)).toBeNull();
    expect(atomIdForSerial(serialToAtomId, serialToAtomId.length)).toBeNull();
    expect(atomIdForSerial(serialToAtomId, 9999)).toBeNull();
  });

  test("an empty molecule produces an empty mapping with no heavy atoms", () => {
    const { serialToAtomId, heavyAtomCount } = buildSerialToAtomId(emptyMolecule());
    expect(heavyAtomCount).toBe(0);
    expect(atomIdForSerial(serialToAtomId, 0)).toBeNull();
  });
});