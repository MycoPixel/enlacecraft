import { describe, expect, test, vi, beforeAll } from "vitest";
import { Resources } from "openchemlib";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { embedMolecule3D, embedMolecule3DWithMethod, refineStructure3D, Embed3DError } from "./embed3d";
import { parseV2000 } from "../components/Molecule3D/rotateBond";
import type { Molecule } from "../types/chemistry";

// embedMolecule3D normally loads OpenChemLib's ~1.3MB force-field parameter
// tables via Resources.registerFromUrl() — a browser fetch of a Vite-emitted
// asset, which cannot work under vitest's node environment. RegisterFromNodejs
// in beforeAll loads the very same tables off disk, and the loader itself is
// stubbed to a no-op so the module doesn't try the URL. Net effect: these
// tests drive the real conformer search rather than a stub of it.
//
// This is also the reason embed3d had no unit tests before — the obstacle was
// the URL fetch, not the code being untestable, so the constraint is worth
// lifting rather than routing around again.
vi.mock("./oclResources", () => ({
  ensureOclResourcesLoaded: async () => {},
}));

beforeAll(() => {
  Resources.registerFromNodejs();
});

/** Straight carbon chains. Butane has a small finite set of rotamers about
 * its central bond (so it runs out); hexane and octane have more than enough
 * to walk through, which is what makes them useful for testing that
 * successive conformers really do differ. */
function chain(n: number): Molecule {
  let mol = emptyMolecule();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `c${i}`;
    ids.push(id);
    mol = addAtom(mol, id, { x: i * 40, y: (i % 2) * 30 }, "C");
  }
  for (let i = 0; i < n - 1; i++) mol = addBond(mol, `b${i}`, ids[i], ids[i + 1]);
  return mol;
}
function butane(): Molecule {
  return chain(4);
}
function hexane(): Molecule {
  return chain(6);
}

/** Rigid-motion invariant fingerprint: the sorted list of all pairwise
 * interatomic distances. Two structures with the same fingerprint differ
 * only by being turned or moved, so this distinguishes genuinely different
 * conformers from the same conformer placed differently on screen. */
function shape(molfile: string): string {
  const atoms = parseV2000(molfile).atoms;
  const distances: string[] = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      distances.push(Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z).toFixed(2));
    }
  }
  return distances.sort().join(" ");
}

describe("embedMolecule3D conformer selection", () => {
  test("conformer 0 is stable across calls, so a re-render never jumps", async () => {
    const mol = butane();
    const a = await embedMolecule3D(mol, "quick");
    const b = await embedMolecule3D(mol, "quick");
    expect(shape(a.molfile)).toBe(shape(b.molfile));
    expect(a.conformerIndexAchieved).toBe(0);
  });

  test("later indices give genuinely different conformers", async () => {
    // THE regression test for the real bug. This used to call
    // getOneConformerAsMolecule(seed) and treat the seed as a conformer index.
    // Measured across 10 seeds, butane through decane all returned the *same*
    // geometry every time, so the "new conformer" button was a no-op for any
    // molecule with real conformational freedom — exactly the case it was
    // supposed to help with. An intermediate fix re-initialized the generator
    // inside the walk loop, which restarted the enumeration each time and was
    // just as broken.
    const mol = hexane();
    const shapes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await embedMolecule3D(mol, "quick", i);
      shapes.push(shape(r.molfile));
    }
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });

  test("every index below the one requested is actually walked", async () => {
    // Guards the specific mistake above: a new generator per iteration means
    // conformer #3 is really #0 again, and the fingerprints would repeat.
    const mol = hexane();
    const third = shape((await embedMolecule3D(mol, "quick", 3)).molfile);
    expect(third).not.toBe(shape((await embedMolecule3D(mol, "quick", 0)).molfile));
    expect(third).not.toBe(shape((await embedMolecule3D(mol, "quick", 1)).molfile));
  });

  test("running out of torsion sets reports it instead of erroring", async () => {
    // Butane has a small, finite set of distinct rotamers about its central
    // bond, so a high index is unreachable. The generator returns null and we
    // keep the last conformer it did produce, reporting the shortfall so the
    // UI can stop offering the button.
    const mol = butane();
    const r = await embedMolecule3D(mol, "quick", 200);
    expect(r.conformerIndexAchieved).toBeLessThan(200);
    expect(r.conformerIndexAchieved).toBeGreaterThan(0);
    expect(r.molfile.length).toBeGreaterThan(0);
  });

  test("mmff94 also varies by conformer index", async () => {
    const mol = hexane();
    const a = await embedMolecule3D(mol, "mmff94", 0);
    const b = await embedMolecule3D(mol, "mmff94", 2);
    expect(shape(a.molfile)).not.toBe(shape(b.molfile));
  });

  test("embedding an empty molecule still raises the typed EMPTY error", async () => {
    await expect(embedMolecule3D(emptyMolecule(), "quick")).rejects.toBeInstanceOf(Embed3DError);
  });
});

describe("embedMolecule3DWithMethod conformer forwarding", () => {
  test("forwards the conformer index for the quick method", async () => {
    const mol = hexane();
    const via = await embedMolecule3DWithMethod(mol, "quick", 2);
    const direct = await embedMolecule3D(mol, "quick", 2);
    expect(via.conformerIndexAchieved).toBe(direct.conformerIndexAchieved);
    expect(via.molfile).toBe(direct.molfile);
  });

  test("forwards it for mmff94 too", async () => {
    const mol = hexane();
    const via = await embedMolecule3DWithMethod(mol, "mmff94", 2);
    const direct = await embedMolecule3D(mol, "mmff94", 2);
    expect(via.conformerIndexAchieved).toBe(direct.conformerIndexAchieved);
    expect(via.energyKcalMol).toBeDefined();
  });

  test("defaults to conformer 0 when none is given, for both methods", async () => {
    const mol = hexane();
    for (const method of ["quick", "mmff94"] as const) {
      const implicit = await embedMolecule3DWithMethod(mol, method);
      const explicit = await embedMolecule3DWithMethod(mol, method, 0);
      expect(implicit.molfile).toBe(explicit.molfile);
    }
  });
});

describe("refineStructure3D (imported structures)", () => {
  /** A V2000 molfile with real 3D coordinates and a real bond — the shape an
   * imported file arrives in. Deliberately not a geometry any conformer
   * generator would produce (one atom out of plane), so a test can tell
   * "refined" from "re-embedded". */
  const STAGGERED_ETHANE = [
    "ethane",
    "  imported",
    "",
    "  2  1  0  0  0  0  0  0  0  0999 V2000",
    "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0",
    "    1.2600    0.9000   -0.5000 C   0  0  0  0  0  0  0  0  0  0  0",
    "  1  2  1  0",
    "M  END",
  ].join("\n");

  test("quick returns the input unchanged — the honest 'don't touch my coordinates'", async () => {
    const r = await refineStructure3D(STAGGERED_ETHANE, "quick");
    expect(r.molfile).toBe(STAGGERED_ETHANE);
    expect(r.energyKcalMol).toBeUndefined();
  });

  test("mmff94 minimises the imported geometry rather than replacing it", async () => {
    const r = await refineStructure3D(STAGGERED_ETHANE, "mmff94");
    const before = shape(STAGGERED_ETHANE);
    const after = shape(r.molfile);
    expect(after).not.toBe(before);
    expect(r.energyKcalMol).toBeDefined();
  });

  test("refinement preserves the bond, so sticks still render", async () => {
    // The whole risk of refining an imported file: rebuilding connectivity
    // instead of reading it. A structure that came back with no bonds would
    // render as a cloud of disconnected spheres.
    const r = await refineStructure3D(STAGGERED_ETHANE, "mmff94");
    const bonds = parseV2000(r.molfile).bonds;
    const { atoms } = parseV2000(r.molfile);
    const carbons = atoms.map((a, i) => (a.element === "C" ? i : -1)).filter((i) => i >= 0);
    expect(carbons).toHaveLength(2);
    // The original C-C bond specifically, not merely "some bonds".
    expect(bonds.some((b) => carbons.includes(b.a) && carbons.includes(b.b))).toBe(true);
  });

  test("adds the hydrogens the force field needs, without losing heavy atoms", async () => {
    // The fixture is deliberately hydrogen-free, as most imported .mol files
    // are. MMFF94 cannot minimise an atom with an unfilled valence, so the
    // refinement saturates first — the same thing the drawn-structure path
    // gets for free from the conformer generator. Without it the identical
    // molecule would refine from a drawing and fail when imported.
    const before = parseV2000(STAGGERED_ETHANE).atoms;
    const after = parseV2000((await refineStructure3D(STAGGERED_ETHANE, "mmff94")).molfile).atoms;
    expect(before.filter((a) => a.element === "C")).toHaveLength(2);
    expect(after.filter((a) => a.element === "C")).toHaveLength(2);
    expect(after.filter((a) => a.element === "H").length).toBeGreaterThan(0);
  });

  test("refining twice is stable — it relaxes toward a minimum, not a fresh embed", async () => {
    const once = await refineStructure3D(STAGGERED_ETHANE, "mmff94");
    const twice = await refineStructure3D(once.molfile, "mmff94");
    const onceEnergy = once.energyKcalMol!;
    const twiceEnergy = twice.energyKcalMol!;
    // A second pass must not be *higher* in energy: that would mean each
    // click re-randomised the geometry instead of relaxing it further.
    expect(twiceEnergy).toBeLessThanOrEqual(onceEnergy + 1e-6);
    // And the heavy-atom skeleton must be essentially where it was.
    const heavy = (mf: string) =>
      parseV2000(mf).atoms.filter((a) => a.element !== "H").map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`).sort().join(" ");
    expect(heavy(twice.molfile)).toBe(heavy(once.molfile));
  });

  test("refining a structure the force field has no parameters for gives a readable error", async () => {
    // Metals and some main-group elements have no MMFF94 parameters. This
    // must not surface as a library exception; the user needs to be told and
    // pointed at the method that would work.
    const ferrocenish = [
      "metal",
      "  test",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 FE  0  0  0  0  0  0  0  0  0  0  0",
      "    2.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0",
      "M  END",
    ].join("\n");
    await expect(refineStructure3D(ferrocenish, "mmff94")).rejects.toBeInstanceOf(Embed3DError);
  });
});
