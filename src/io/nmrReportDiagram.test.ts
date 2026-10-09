import { describe, expect, test } from "vitest";
import { emptyMolecule } from "../model/molecule";
import { filterForReportDiagram, hydrogenSuffixForLabel } from "./nmrReportDiagram";
import type { Atom, Bond, Molecule } from "../types/chemistry";

/**
 * What the NMR report's structure diagram draws.
 *
 * The diagram's job is mapping a predicted signal back to an atom, so the
 * filtering rules exist to keep that mapping legible: hide explicit hydrogens
 * by default (they bury the skeleton and their "H2" labels collide with 1H
 * shift badges), but never hide anything that carries structural information
 * a reader can't get elsewhere.
 */

function mol(
  atoms: Array<[string, string, number?]>,
  bonds: Array<[string, string, string, string?]>,
): Molecule {
  // emptyMolecule rather than a hand-written literal, so this fixture can't
  // drift from the real shape as fields are added to Molecule.
  const m = emptyMolecule();
  for (const [id, element, isotope] of atoms) {
    m.atoms[id] = {
      id,
      x: 0,
      y: 0,
      element: element as Atom["element"],
      charge: 0,
      ...(isotope !== undefined ? { isotope } : {}),
    } as Atom;
  }
  for (const [id, a1, a2, order] of bonds) {
    m.bonds[id] = { id, a1, a2, order: order ? Number(order) : 1 } as Bond;
  }
  return m;
}

/** Methanol drawn with both hydrogens as explicit atoms. */
const methanolExplicit = mol(
  [
    ["c", "C"],
    ["o", "O"],
    ["h1", "H"],
    ["h2", "H"],
  ],
  [
    ["b1", "c", "o"],
    ["b2", "c", "h1"],
    ["b3", "c", "h2"],
  ],
);

describe("filterForReportDiagram", () => {
  test("hides explicit hydrogens by default", () => {
    const { atoms } = filterForReportDiagram(methanolExplicit, false);
    expect(Object.keys(atoms).sort()).toEqual(["c", "o"]);
  });

  test("shows them when asked", () => {
    const { atoms } = filterForReportDiagram(methanolExplicit, true);
    expect(Object.keys(atoms).sort()).toEqual(["c", "h1", "h2", "o"]);
  });

  test("drops bonds to a hidden hydrogen, so no line stops in empty space", () => {
    // A half-drawn bond reads as a broken figure rather than a filtered atom.
    const { bonds } = filterForReportDiagram(methanolExplicit, false);
    expect(Object.keys(bonds)).toEqual(["b1"]);
  });

  test("an H-H bond goes when both its atoms are hidden", () => {
    const h2 = mol(
      [
        ["h1", "H"],
        ["h2", "H"],
      ],
      [["b", "h1", "h2"]],
    );
    expect(Object.values(filterForReportDiagram(h2, false).bonds)).toHaveLength(0);
  });

  test("keeps deuterium, which is a real isotopic label and not a bare H", () => {
    // Hiding a D would erase the fact that the position is deuterated - a
    // structural fact the reader cannot recover from the rest of the diagram.
    const labeled = mol(
      [
        ["c", "C"],
        ["d", "H", 2],
      ],
      [["b", "c", "d"]],
    );
    const { atoms, bonds } = filterForReportDiagram(labeled, false);
    expect(Object.keys(atoms).sort()).toEqual(["c", "d"]);
    expect(Object.keys(bonds)).toEqual(["b"]);
  });

  test("a molecule with no explicit hydrogens is untouched", () => {
    // The common case - most structures are drawn skeletal, so the filter must
    // be a no-op rather than rebuilding the maps on every render.
    const plain = mol(
      [
        ["c1", "C"],
        ["c2", "C"],
      ],
      [["b", "c1", "c2"]],
    );
    const off = filterForReportDiagram(plain, false);
    expect(Object.keys(off.atoms)).toHaveLength(2);
    expect(Object.keys(off.bonds)).toHaveLength(1);
  });

  test("does not mutate the molecule it was given", () => {
    // The fragment is shared with the rest of the app (and with the next
    // prediction), so filtering it in place would corrupt unrelated state.
    const before = JSON.stringify(methanolExplicit);
    filterForReportDiagram(methanolExplicit, false);
    expect(JSON.stringify(methanolExplicit)).toBe(before);
  });
});
/**
 * The hydrogen-count suffix.
 *
 * This exists because of a reported dead control: the H toggle filtered
 * explicit H atoms, and a structure drawn with the bond tool has NO explicit
 * H atoms - every hydrogen is implicit. So pressing it did nothing visible on
 * essentially every real structure. The suffix is what makes the control do
 * something for a skeletal drawing, which is the case that actually occurs.
 */

/** Ethane drawn skeletal: C-C, hydrogens implicit. The reported case. */
const ethaneSkeletal = mol(
  [
    ["c1", "C"],
    ["c2", "C"],
  ],
  [["b", "c1", "c2"]],
);

describe("hydrogenSuffixForLabel", () => {
  test("reports implicit hydrogens on a skeletal structure", () => {
    // Both carbons are CH3 - three implicit H each, no explicit H atoms
    // anywhere. This is the case that made the old toggle look broken.
    expect(hydrogenSuffixForLabel(ethaneSkeletal, "c1")).toBe("H3");
    expect(hydrogenSuffixForLabel(ethaneSkeletal, "c2")).toBe("H3");
  });

  test("skips the count when it's 1", () => {
    // "H1" is noise; "H" is how it is written.
    const ch3oh = mol(
      [
        ["c", "C"],
        ["o", "O"],
      ],
      [["b1", "c", "o"]],
    );
    expect(hydrogenSuffixForLabel(ch3oh, "o")).toBe("H");
    expect(hydrogenSuffixForLabel(ch3oh, "c")).toBe("H3");
  });

  test("returns nothing for a hydrogen atom itself", () => {
    // "H1H2" would be nonsense.
    const explicit = mol(
      [
        ["c", "C"],
        ["h", "H"],
      ],
      [["b", "c", "h"]],
    );
    expect(hydrogenSuffixForLabel(explicit, "h")).toBeNull();
  });

  test("counts explicit hydrogens as already-spent valence, not twice", () => {
    // A carbon carrying 2 explicit H uses 2 of its 4 valences, leaving 2 - so
    // it is a CH2 as drawn, and that is what must be reported. An earlier
    // version of totalHydrogenCount added the explicit count on top of the
    // implicit one and called this same structure CH4.
    const partial = mol(
      [
        ["c", "C"],
        ["h1", "H"],
        ["h2", "H"],
      ],
      [
        ["b1", "c", "h1"],
        ["b2", "c", "h2"],
      ],
    );
    expect(hydrogenSuffixForLabel(partial, "c")).toBe("H2");
  });

  test("a methyl with all three H drawn explicitly is still 3H", () => {
    // The worst case for the double-count: three explicit H, zero implicit, and
    // a naive sum would report H6.
    const explicit3 = mol(
      [
        ["c", "C"],
        ["h1", "H"],
        ["h2", "H"],
        ["h3", "H"],
      ],
      [
        ["b1", "c", "h1"],
        ["b2", "c", "h2"],
        ["b3", "c", "h3"],
      ],
    );
    expect(hydrogenSuffixForLabel(explicit3, "c")).toBe("H");
  });

  test("returns nothing for an atom with no hydrogens at all", () => {
    // A double-bonded (carbonyl) oxygen uses both of its valences on the
    // double bond, leaving no implicit H.
    const ketone = mol(
      [
        ["c", "C"],
        ["o", "O"],
        ["c2", "C"],
      ],
      [
        ["b1", "c", "o", "2"],
        ["b2", "c", "c2"],
      ],
    );
    expect(hydrogenSuffixForLabel(ketone, "o")).toBeNull();
  });

  test("an unknown atom id yields nothing rather than throwing", () => {
    expect(hydrogenSuffixForLabel(ethaneSkeletal, "nope")).toBeNull();
  });
});
