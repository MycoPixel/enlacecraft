import { describe, expect, test } from "vitest";
import { emptyMolecule } from "../model/molecule";
import {
  filterForReportDiagram,
  hydrogenSuffixForLabel,
  diagramExtent,
  diagramBoxSize,
  heavyAtomOrder,
  hydrogenParent,
  moleculeWithDisplayHydrogens,
} from "./nmrReportDiagram";
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

/**
 * Sizing the drawing.
 *
 * Both of these exist because of one specific failure: SVG text is sized in
 * viewBox units, and the viewBox spans the molecule, so holding the pixel box
 * at a fixed size made every atom label shrink as the structure grew - until a
 * big molecule's indices were smaller than the table text beside them. The box
 * now grows with the drawing instead.
 */
describe("diagramExtent", () => {
  test("spans the atoms plus a fixed margin on every side", () => {
    const extent = diagramExtent([
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ]);
    // 100 + 2*30 wide, 50 + 2*30 high.
    expect(extent).toEqual({ width: 160, height: 110 });
  });

  test("a single atom still gets the full margin, so it isn't flush to the edge", () => {
    expect(diagramExtent([{ x: 42, y: 42 }])).toEqual({ width: 60, height: 60 });
  });

  test("an empty molecule yields a usable box rather than zero", () => {
    // Zero would collapse the SVG and make the drawing disappear entirely.
    const extent = diagramExtent([]);
    expect(extent.width).toBeGreaterThan(0);
    expect(extent.height).toBeGreaterThan(0);
  });

  test("negative coordinates are handled (extent is about size, not position)", () => {
    const extent = diagramExtent([
      { x: -100, y: -100 },
      { x: 0, y: 0 },
    ]);
    expect(extent).toEqual({ width: 160, height: 160 });
  });
});

describe("diagramBoxSize", () => {
  /** An n x n grid of atoms one bond length apart - the "large molecule" case. */
  function grid(n: number, spacing = 42) {
    const atoms = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) atoms.push({ x: i * spacing, y: j * spacing });
    }
    return atoms;
  }

  test("a large molecule fills the space allowed instead of being shrunk", () => {
    // The regression: this used to be a fixed 200x160 box, so a structure
    // spanning 1700 user units drew at well under a tenth of natural size.
    const box = diagramBoxSize(diagramExtent(grid(40)), 340, 260);
    expect(box.height).toBe(260);
  });

  test("never exceeds the space the caller allows", () => {
    // The overlay sits ON the spectrum, so it must not grow until it covers the
    // very signals it exists to explain.
    for (const n of [1, 3, 10, 20, 40, 80]) {
      const box = diagramBoxSize(diagramExtent(grid(n)), 340, 260);
      expect(box.width).toBeLessThanOrEqual(340);
      expect(box.height).toBeLessThanOrEqual(260);
    }
  });

  test("grows with the molecule while there is room to grow", () => {
    // Generous bounds, like the Structure tab, so growth isn't masked by the
    // allowance saturating.
    const sizes = [3, 6, 10].map((n) => diagramBoxSize(diagramExtent(grid(n)), 760, 620));
    expect(sizes[1].width).toBeGreaterThan(sizes[0].width);
    expect(sizes[2].width).toBeGreaterThan(sizes[1].width);
  });

  test("draws at natural size or larger whenever it fits", () => {
    // Never below 1:1 for a structure that has room - this is what keeps a
    // medium molecule's 11px atom labels at 11px instead of shrinking.
    for (const n of [1, 2, 3, 5, 8]) {
      const extent = diagramExtent(grid(n));
      const box = diagramBoxSize(extent, 760, 620);
      expect(box.width / extent.width).toBeGreaterThanOrEqual(1);
    }
  });

  test("does not blow a small molecule up to fill the box", () => {
    // A one-atom "molecule" drawn at the full 760x620 would be a single huge
    // circle with comically thick bonds.
    expect(diagramBoxSize(diagramExtent([{ x: 0, y: 0 }]), 760, 620)).toEqual({
      width: 90,
      height: 90,
    });
  });

  test("preserves the aspect ratio, so the drawing is never stretched", () => {
    // Wider than tall, in a box that binds on width.
    const extent = diagramExtent([
      { x: 0, y: 0 },
      { x: 400, y: 40 },
    ]);
    const box = diagramBoxSize(extent, 500, 600);
    // Within integer-pixel rounding: the box is floored to whole pixels, so a
    // 108px-tall axis can drift by up to half a pixel. That is far below the
    // point where preserveAspectRatio's own letterboxing would matter.
    const drift = Math.abs(box.width / box.height - extent.width / extent.height);
    expect(drift / (extent.width / extent.height)).toBeLessThan(0.02);
  });

  test("the scale ceiling is the caller's to set", () => {
    // Same molecule, same box, different surroundings: a diagram overlaying a
    // spectrum stays modest so it doesn't bury the peaks it annotates, while
    // one with a whole column to itself is free to fill it.
    const extent = diagramExtent([{ x: 0, y: 0 }, { x: 100, y: 60 }]);
    expect(diagramBoxSize(extent, 560, 760).width).toBe(
      diagramBoxSize(extent, 560, 760, 1.5).width,
    );
    expect(diagramBoxSize(extent, 560, 760, 3).width).toBeGreaterThan(
      diagramBoxSize(extent, 560, 760, 1.5).width,
    );
  });

  test("an unbounded ceiling fills the box, as the roomy Structure tab does", () => {
    const extent = diagramExtent([{ x: 0, y: 0 }, { x: 100, y: 60 }]);
    const box = diagramBoxSize(extent, 400, 400, Infinity);
    // 160x120 units; width binds at 2.5x, and it uses every pixel offered.
    expect(extent).toEqual({ width: 160, height: 120 });
    expect(box).toEqual({ width: 400, height: 300 });
  });

  test("stays within the allowance even for a molecule far larger than it", () => {
    const box = diagramBoxSize(diagramExtent(grid(100)), 340, 260);
    expect(box).toEqual({ width: 260, height: 260 });
  });
});

/**
 * Mapping prediction indices back onto drawn atoms, and onto hydrogens.
 *
 * The backend renumbers a molecule's heavy atoms from zero and drops explicit
 * hydrogens before the model sees them (verified against the running service:
 * "CCC" and its fully-hydrogen-expanded form return identical predictions
 * numbered 0,1,2). The app's own SMILES atom order does NOT drop them, so
 * resolving a prediction through the raw order silently mislabels every shift
 * on a structure drawn with hydrogens expanded.
 */
describe("heavyAtomOrder", () => {
  /** Ethanol as the app writes it with every hydrogen expanded. */
  function ethanolExplicit() {
    const m = mol(
      [
        ["h1", "H"],
        ["c1", "C"],
        ["h2", "H"],
        ["h3", "H"],
        ["h4", "H"],
        ["c2", "C"],
        ["o1", "O"],
      ],
      [
        ["b1", "h1", "c1"],
        ["b2", "h2", "c1"],
        ["b3", "h3", "c1"],
        ["b4", "h4", "c2"],
        ["b5", "c1", "c2"],
        ["b6", "c2", "o1"],
      ],
    );
    // The SMILES writer emits them interleaved, hydrogen-first at each atom.
    return { m, order: ["h1", "c1", "h2", "h3", "h4", "c2", "o1"] };
  }

  test("drops hydrogens, leaving the heavy atoms in order", () => {
    const { m, order } = ethanolExplicit();
    expect(heavyAtomOrder(m, order)).toEqual(["c1", "c2", "o1"]);
  });

  test("is the identity for a skeletal structure", () => {
    const skeletal = mol(
      [
        ["c1", "C"],
        ["c2", "C"],
        ["o1", "O"],
      ],
      [
        ["b1", "c1", "c2"],
        ["b2", "c2", "o1"],
      ],
    );
    const order = ["c1", "c2", "o1"];
    expect(heavyAtomOrder(skeletal, order)).toEqual(order);
  });

  test("realigns a prediction that the raw order would have misplaced", () => {
    // The regression: with atomOrder[0] a hydrogen, prediction 0 (the methyl
    // carbon, per the backend) landed on the hydrogen and every later atom
    // shifted by however many hydrogens preceded it.
    const { m, order } = ethanolExplicit();
    const raw = order[0];
    const fixed = heavyAtomOrder(m, order)[0];
    expect(raw).toBe("h1");
    expect(fixed).toBe("c1");
  });

  test("drops deuterium too, because the backend does", () => {
    // C[2H] comes back as a single prediction, for the carbon.
    const withD = mol(
      [
        ["c1", "C"],
        ["d1", "H", 2],
      ],
      [["b1", "c1", "d1"]],
    );
    expect(heavyAtomOrder(withD, ["c1", "d1"])).toEqual(["c1"]);
  });

  test("keeps an id the fragment doesn't have, so one gap can't shift the rest", () => {
    const skeletal = mol([["c1", "C"]], []);
    expect(heavyAtomOrder(skeletal, ["c1", "ghost"])).toEqual(["c1", "ghost"]);
  });
});

describe("hydrogenParent", () => {
  function methyl() {
    return mol(
      [
        ["c1", "C"],
        ["c2", "C"],
        ["h1", "H"],
        ["h2", "H"],
        ["h3", "H"],
      ],
      [
        ["b1", "c1", "c2"],
        ["b2", "h1", "c1"],
        ["b3", "h2", "c1"],
        ["b4", "h3", "c1"],
      ],
    );
  }

  test("finds the carbon a hydrogen hangs off", () => {
    const m = methyl();
    expect(hydrogenParent(m, "h1")).toBe("c1");
    expect(hydrogenParent(m, "h2")).toBe("c1");
    expect(hydrogenParent(m, "h3")).toBe("c1");
  });

  test("a heavy atom is nobody's hydrogen", () => {
    expect(hydrogenParent(methyl(), "c1")).toBeNull();
  });

  test("an unbonded hydrogen resolves to nothing rather than guessing", () => {
    expect(hydrogenParent(mol([["h1", "H"]], []), "h1")).toBeNull();
  });

  test("an unknown atom id is null, not a throw", () => {
    expect(hydrogenParent(methyl(), "nope")).toBeNull();
  });

  test("a hydrogen bonded to another hydrogen has no heavy parent", () => {
    // Physically nonsense as a proton assignment, so nothing is claimed.
    const h2 = mol(
      [
        ["h1", "H"],
        ["h2", "H"],
      ],
      [["b1", "h1", "h2"]],
    );
    expect(hydrogenParent(h2, "h1")).toBeNull();
  });

  test("a bridging hydrogen is left unassigned", () => {
    // Two heavy neighbours means it is not a proton on either of them, and
    // picking one would print a confident number belonging to a different atom.
    const bridged = mol(
      [
        ["c1", "C"],
        ["c2", "C"],
        ["h1", "H"],
      ],
      [
        ["b1", "c1", "h1"],
        ["b2", "c2", "h1"],
      ],
    );
    expect(hydrogenParent(bridged, "h1")).toBeNull();
  });
});

describe("moleculeWithDisplayHydrogens", () => {
  function ethane() {
    return mol(
      [
        ["c1", "C"],
        ["c2", "C"],
      ],
      [["b1", "c1", "c2"]],
    );
  }

  test("adds hydrogens to a skeletal structure, without editing it", () => {
    const before = ethane();
    const after = moleculeWithDisplayHydrogens(before);
    expect(Object.keys(after.atoms).length).toBeGreaterThan(Object.keys(before.atoms).length);
    // The input is untouched - this is a display aid, not a structural edit, so
    // it must not reach the undo history.
    expect(Object.keys(before.atoms)).toEqual(["c1", "c2"]);
  });

  test("keeps hydrogens the user actually drew", () => {
    const withRealH = mol(
      [
        ["c1", "C"],
        ["c2", "C"],
        ["h1", "H"],
      ],
      [
        ["b1", "c1", "c2"],
        ["b2", "c1", "h1"],
      ],
    );
    const result = moleculeWithDisplayHydrogens(withRealH);
    // Same atom set: a hand-placed hydrogen stays exactly where it was put
    // rather than being re-fanned somewhere else.
    expect(Object.keys(result.atoms).sort()).toEqual(["c1", "c2", "h1"]);
    expect(result.atoms.h1).toBe(withRealH.atoms.h1);
  });
});
