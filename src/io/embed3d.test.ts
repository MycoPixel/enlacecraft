import { describe, expect, test, vi, beforeAll } from "vitest";
import { Resources } from "openchemlib";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { embedMolecule3D, embedMolecule3DWithMethod, Embed3DError } from "./embed3d";
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

/** Ethane: two carbons joined by a single bond. Small enough that conformer
 * generation is fast, but still has a real rotatable bond about which the
 * torsion algorithm can legitimately produce different arrangements. */
function ethane(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "c2", { x: 40, y: 0 }, "C");
  mol = addBond(mol, "b1", "c1", "c2");
  return mol;
}

/** Pulls the atom coordinate block out of a V2000 molfile: the 4-character
 * x/y/z columns on the atom lines that follow the counts line. */
function atomCoordinates(molfile: string): string {
  const lines = molfile.split(/\r?\n/);
  const counts = lines[3];
  const atomCount = parseInt(counts.slice(0, 3), 10);
  return lines
    .slice(4, 4 + atomCount)
    .map((l) => `${l.slice(0, 10)}|${l.slice(10, 20)}|${l.slice(20, 30)}`)
    .join("\n");
}

describe("embedMolecule3D seeding", () => {
  test("the same seed reproduces the same conformer", async () => {
    // This determinism is load-bearing: the 3D panel re-embeds on every edit,
    // and without it the structure would jump to an unrelated conformer on
    // each re-render.
    const mol = ethane();
    const a = await embedMolecule3D(mol, "quick", 1);
    const b = await embedMolecule3D(mol, "quick", 1);
    expect(atomCoordinates(a.molfile)).toBe(atomCoordinates(b.molfile));
  });

  test("different seeds explore different conformers", async () => {
    // The point of the "new conformer" button: a student looking at butane
    // or longer should be able to see more than one arrangement rather than
    // being permanently locked to whichever one seed 1 happened to pick.
    const mol = ethane();
    const a = await embedMolecule3D(mol, "quick", 1);
    const b = await embedMolecule3D(mol, "quick", 2);
    const c = await embedMolecule3D(mol, "quick", 3);
    const seen = new Set([atomCoordinates(a.molfile), atomCoordinates(b.molfile), atomCoordinates(c.molfile)]);
    expect(seen.size).toBeGreaterThan(1);
  });

  test("the default seed is 1", async () => {
    const mol = ethane();
    const explicit = await embedMolecule3D(mol, "quick", 1);
    const implicit = await embedMolecule3D(mol, "quick");
    expect(atomCoordinates(implicit.molfile)).toBe(atomCoordinates(explicit.molfile));
  });

  test("embedding an empty molecule still raises the typed EMPTY error", async () => {
    await expect(embedMolecule3D(emptyMolecule(), "quick", 1)).rejects.toBeInstanceOf(Embed3DError);
  });
});

describe("embedMolecule3DWithMethod seed forwarding", () => {
  test("forwards the seed for the quick method", async () => {
    // Guards the plumbing specifically: embedMolecule3DWithMethod used to
    // accept no seed and call embedMolecule3D without one, so the panel's
    // "new conformer" button would have silently kept regenerating the
    // seed-1 structure.
    const mol = ethane();
    const a = await embedMolecule3DWithMethod(mol, "quick", 4);
    const direct = await embedMolecule3D(mol, "quick", 4);
    expect(atomCoordinates(a.molfile)).toBe(atomCoordinates(direct.molfile));
  });

  test("forwards the seed for the mmff94 method", async () => {
    const mol = ethane();
    const a = await embedMolecule3DWithMethod(mol, "mmff94", 3);
    const direct = await embedMolecule3D(mol, "mmff94", 3);
    expect(atomCoordinates(a.molfile)).toBe(atomCoordinates(direct.molfile));
    expect(a.energyKcalMol).toBeDefined();
  });

  test("defaults to seed 1 when none is given, for both methods", async () => {
    const mol = ethane();
    for (const method of ["quick", "mmff94"] as const) {
      const implicit = await embedMolecule3DWithMethod(mol, method);
      const explicit = await embedMolecule3DWithMethod(mol, method, 1);
      expect(atomCoordinates(implicit.molfile)).toBe(atomCoordinates(explicit.molfile));
    }
  });
});