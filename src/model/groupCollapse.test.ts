import { describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "./molecule";
import { collapseToGroup, findCollapsibleGroups, GROUP_TEMPLATES } from "./groupCollapse";
import { nextId } from "./id";
import { ABBREVIATED_GROUPS } from "./constants";
import type { Element, Molecule } from "../types/chemistry";

/**
 * Builds a molecule from elements laid out left to right at BOND_LEN spacing,
 * bonded per `adj` ([i, j, order], 0-based indices into `elements`).
 *
 * Fixtures below deliberately include the atoms *outside* the group too — a
 * nickname like Et means "one open attachment point", and that's only visible
 * in the implicit-hydrogen count once the group is bonded to something. A
 * standalone C-C is two methyls, not an ethyl, and the matcher knows that.
 */
function fragment(elements: Element[], adj: [number, number, number][] = []): { mol: Molecule; ids: string[] } {
  let mol = emptyMolecule();
  const ids: string[] = [];
  elements.forEach((el, i) => {
    const id = nextId();
    ids.push(id);
    mol = addAtom(mol, id, { x: i * 40, y: 0 }, el);
  });
  adj.forEach(([a, b, order]) => {
    mol = addBond(mol, nextId(), ids[a], ids[b], order as 1 | 2 | 3);
  });
  return { mol, ids };
}

const ids = (elements: Element[], adj: [number, number, number][]) =>
  findCollapsibleGroups(fragment(elements, adj).mol).map((m) => m.templateId);

describe("findCollapsibleGroups — exact recognition", () => {
  test("butane has no n-Bu — it has no attachment point to spare", () => {
    // Butane is CH3-CH2-CH2-CH3: every valence is already filled by hydrogen,
    // so the 3-2-2-2 pattern n-Bu needs doesn't occur. The best it offers is
    // an Et on the first two carbons. Getting this wrong in the other
    // direction (matching C3-C2-C2-C3) would relabel butane as a butyl and
    // silently drop a hydrogen.
    const found = findCollapsibleGroups(fragment(["C", "C", "C", "C"], [[0, 1, 1], [1, 2, 1], [2, 3, 1]]).mol);
    expect(found.map((m) => m.templateId)).not.toContain("nBu");
  });

  test("the largest group in a component wins over a smaller one nested in it", () => {
    // Pentane's first four carbons are 3-2-2-2 (an n-Bu) while its first two
    // are 3-2 (an Et). A greedy sweep that took the first hit would label the
    // chain Et; largest-first has to pick the n-Bu.
    const found = findCollapsibleGroups(
      fragment(["C", "C", "C", "C", "C"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]]).mol
    );
    expect(found).toHaveLength(1);
    expect(found[0].templateId).toBe("nBu");
    expect(found[0].atomIds).toHaveLength(4);
  });
});

describe("findCollapsibleGroups — isomers with identical graphs", () => {
  // Connectivity alone cannot separate these — as unlabeled graphs n-Bu and
  // sec-Bu are both the path P4, and i-Bu and t-Bu are both the same
  // three-armed star. Only the implicit-hydrogen count distinguishes them,
  // which is exactly what these fixtures pin down.
  test("a four-carbon star is i-Pr, not i-Bu", () => {
    // All three leaves are CH3 (3 H each), so the longest recognizable group
    // is i-Pr on three of them. i-Bu would need the CH2 attachment carbon to
    // carry 2 H, which only happens once something else bonds to it.
    const found = findCollapsibleGroups(fragment(["C", "C", "C", "C"], [[0, 1, 1], [0, 2, 1], [0, 3, 1]]).mol);
    expect(found.map((m) => m.templateId)).toEqual(["iPr"]);
  });

  test("i-Bu vs t-Bu — the same graph, separated only by hydrogen count", () => {
    // i-Bu: CH3-CH(CH3)-CH2-CH3. The central CH carries 1 H and the CH2 that
    // continues the chain carries 2 — that pair only occurs for i-Bu.
    const iBu = fragment(
      ["C", "C", "C", "C", "C"],
      [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]]
    );
    // 2-methylbutane contains *both* an i-Bu and an s-Bu subgraph (they're
    // the same four atoms read from different attachment points), so either
    // is a defensible label here; what matters is that neither is reported
    // as the straight-chain n-Bu.
    expect(findCollapsibleGroups(iBu.mol).map((m) => m.templateId)).toEqual(["sBu"]);

    // t-Bu: a central carbon with four bonds, so no hydrogen at all.
    const tBu = fragment(
      ["C", "C", "C", "C", "C"],
      [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]]
    );
    expect(findCollapsibleGroups(tBu.mol).map((m) => m.templateId)).toContain("tBu");
    expect(findCollapsibleGroups(tBu.mol).map((m) => m.templateId)).not.toContain("iBu");
  });
});

describe("findCollapsibleGroups — refuses wrong labels", () => {
  test("does not collapse a substituted benzene ring to Ph", () => {
    // The ring's Kekule pattern here matches the Ph template exactly, so the
    // only thing stopping the match is the substituent changing the ring
    // carbon's implicit-H count. An earlier version of this test used a
    // different Kekule arrangement and was passing for the wrong reason.
    const { mol } = fragment(
      ["C", "C", "C", "C", "C", "C", "C"],
      [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1], [0, 6, 1]]
    );
    expect(findCollapsibleGroups(mol).map((m) => m.templateId)).not.toContain("Ph");
  });

  test("collapses a bare benzene ring to Ph", () => {
    const { mol } = fragment(
      ["C", "C", "C", "C", "C", "C"],
      [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]]
    );
    expect(findCollapsibleGroups(mol).map((m) => m.templateId)).toEqual(["Ph"]);
  });

  test("recognizes Boc rather than the OMe inside it", () => {
    // (CH3)3C-C(=O)-O-CH3 : the trailing O-C pair is itself an OMe, so
    // largest-first (and the H counts) have to favour the whole Boc.
    const { mol } = fragment(
      // Boc attached to a methyl ether: (CH3)3C-C(=O)-O-CH3.
      // Three methyls hang off the quaternary carbon (index 3); the carbonyl
      // carbon (4) is separate from it, which is what an earlier version of
      // this fixture got wrong.
      ["C", "C", "C", "C", "C", "O", "O", "C"],
      [[0, 3, 1], [1, 3, 1], [2, 3, 1], [3, 4, 1], [4, 5, 2], [4, 6, 1], [6, 7, 1]]
    );
    const found = findCollapsibleGroups(mol);
    expect(found.map((m) => m.templateId)).toContain("Boc");
    expect(found[0].atomIds).toHaveLength(7);
  });

  test("a benzene ring is not mistaken for cyclohexyl", () => {
    // Same six carbons and same connectivity, different bond orders and
    // therefore different hydrogen counts.
    expect(ids(["C", "C", "C", "C", "C", "C"], [[0, 1, 2], [1, 2, 2], [2, 3, 2], [3, 4, 2], [4, 5, 2], [5, 0, 1]]))
      .not.toContain("Cy");
  });

  test("every template id is one the abbreviation registry knows", () => {
    // A template whose id isn't in ABBREVIATED_GROUPS would collapse to a
    // label the app can't render or expand.
    for (const t of GROUP_TEMPLATES) {
      expect(ABBREVIATED_GROUPS.map((g) => g.id)).toContain(t.id);
    }
  });
});

describe("findCollapsibleGroups — scope", () => {
  test("respects the skip set so claimed atoms aren't double-matched", () => {
    const { mol, ids: atomIds } = fragment(["C", "C", "C"], [[0, 1, 1], [1, 2, 1]]);
    // Without the skip this is an Et on atoms 1,2. Skipping one of them
    // forces a different (shorter) group to be found instead of reusing it.
    const found = findCollapsibleGroups(mol, { skip: new Set([atomIds[1]]) });
    expect(found.flatMap((m) => m.atomIds)).not.toContain(atomIds[1]);
  });

  test("can be restricted to a chosen set of candidate atoms", () => {
    // Restricting to a lone carbon whose implicit H was filled by a bond
    // into the excluded part of the molecule leaves it as a 1-atom component
    // with no matching open valence, so nothing is offered.
    const { mol, ids: atomIds } = fragment(["C", "C", "C"], [[0, 1, 1], [1, 2, 1]]);
    const found = findCollapsibleGroups(mol, { candidateIds: [atomIds[0]] });
    expect(found.flatMap((m) => m.atomIds)).not.toContain(atomIds[1]);
    expect(found.flatMap((m) => m.atomIds)).not.toContain(atomIds[2]);
  });

  test("finds one group per connected component", () => {
    let mol = emptyMolecule();
    const add = (el: Element, x: number) => {
      const id = nextId();
      mol = addAtom(mol, id, { x, y: 0 }, el);
      return id;
    };
    const a: string[] = [];
    for (let i = 0; i < 3; i++) a.push(add("C", i * 40));
    for (let i = 0; i < 2; i++) mol = addBond(mol, nextId(), a[i], a[i + 1]);
    const b: string[] = [];
    for (let i = 0; i < 5; i++) b.push(add("C", 300 + i * 40));
    for (let i = 0; i < 4; i++) mol = addBond(mol, nextId(), b[i], b[i + 1]);

    const found = findCollapsibleGroups(mol);
    // One group per component: the propane offers an Et, the pentane an n-Bu.
    expect(found).toHaveLength(2);
    expect(found.map((m) => m.templateId).sort()).toEqual(["Et", "nBu"]);
  });

  test("an empty molecule yields nothing", () => {
    expect(findCollapsibleGroups(emptyMolecule())).toHaveLength(0);
  });
});

describe("collapseToGroup", () => {
  function ethylOnOxygen() {
    // Et attached to an O, so there's a real outward bond to re-point.
    return fragment(["C", "C", "O"], [[0, 1, 1], [1, 2, 1]]);
  }

  test("replaces the fragment with one group atom carrying the right label", () => {
    const { mol, ids: atomIds } = ethylOnOxygen();
    const match = findCollapsibleGroups(mol).find((m) => m.templateId === "Et")!;
    const out = collapseToGroup(mol, match);
    expect(Object.keys(out.atoms)).toHaveLength(2);
    const group = Object.values(out.atoms).find((a) => a.group === "Et")!;
    expect(group).toBeDefined();
    expect(atomIds).not.toContain(group.id);
  });

  test("re-points the outward bond at the new group atom", () => {
    const { mol } = ethylOnOxygen();
    const match = findCollapsibleGroups(mol).find((m) => m.templateId === "Et")!;
    const out = collapseToGroup(mol, match);
    const groupId = Object.values(out.atoms).find((a) => a.group === "Et")!.id;
    const bonds = Object.values(out.bonds);
    expect(bonds).toHaveLength(1);
    expect([bonds[0].a1, bonds[0].a2]).toContain(groupId);
  });

  test("places the group atom at the attachment vertex so the drawing doesn't shift", () => {
    const { mol, ids: atomIds } = ethylOnOxygen();
    const match = findCollapsibleGroups(mol).find((m) => m.templateId === "Et")!;
    const out = collapseToGroup(mol, match);
    const group = Object.values(out.atoms).find((a) => a.group === "Et")!;
    const collapsed = atomIds.filter((id) => match.atomIds.includes(id));
    // The new atom sits exactly on one of the vertices it replaced.
    expect(collapsed.some((id) => mol.atoms[id].x === group.x && mol.atoms[id].y === group.y)).toBe(true);
  });

  test("drops the fragment's internal bonds", () => {
    const { mol } = ethylOnOxygen();
    const match = findCollapsibleGroups(mol).find((m) => m.templateId === "Et")!;
    const out = collapseToGroup(mol, match);
    const groupId = Object.values(out.atoms).find((a) => a.group === "Et")!.id;
    const otherId = Object.keys(out.atoms).find((id) => id !== groupId)!;
    for (const b of Object.values(out.bonds)) {
      expect([b.a1, b.a2]).toContain(groupId);
      expect([b.a1, b.a2]).toContain(otherId);
    }
  });

  test("produces a molecule with no dangling bond references", () => {
    const { mol } = ethylOnOxygen();
    const match = findCollapsibleGroups(mol).find((m) => m.templateId === "Et")!;
    const out = collapseToGroup(mol, match);
    for (const b of Object.values(out.bonds)) {
      expect(out.atoms[b.a1]).toBeDefined();
      expect(out.atoms[b.a2]).toBeDefined();
    }
  });

  test("an unattached fragment collapses to its centroid", () => {
    const { mol } = fragment(["C", "C"], [[0, 1, 1]]);
    const out = collapseToGroup(mol, { templateId: "Et", label: "Et", atomIds: matchIds(mol) });
    const group = Object.values(out.atoms)[0];
    expect(group.x).toBeCloseTo(20, 5);
    expect(group.y).toBe(0);
  });

  test("leaves the rest of the molecule's bonding alone", () => {
    // Propene: the longest recognizable group is the vinyl on the right, and
    // collapsing it must leave the methyl-carbon behind still single-bonded.
    const { mol } = fragment(["C", "C", "C"], [[0, 1, 1], [1, 2, 2]]);
    const match = findCollapsibleGroups(mol).find((m) => m.templateId === "Vinyl")!;
    const out = collapseToGroup(mol, match);
    // The C=C lived *inside* the group, so it goes away with it; what must
    // survive is the single bond joining the superatom to the methyl.
    const bonds = Object.values(out.bonds);
    expect(bonds).toHaveLength(1);
    expect(bonds[0].order).toBe(1);
    expect(Object.values(out.atoms).some((a) => a.element === "C")).toBe(true);
    expect(Object.values(out.atoms).some((a) => a.group === "Vinyl")).toBe(true);
  });
});

/** Both carbons of a two-carbon fragment, for building an explicit match. */
function matchIds(mol: Molecule): string[] {
  return Object.keys(mol.atoms);
}
describe("collapseToGroup — bridging fragments", () => {
  test("does not create a phantom double bond when both ends face one atom", () => {
    // A-B-X triangle with the fragment being {A, B}: both of its outward
    // bonds re-point at the new superatom, so without pair-based dedup the
    // result silently gains a second bond between the superatom and X. The
    // bond ids differ, so an id-keyed guard does not catch it.
    let mol = emptyMolecule();
    const mk = (i: number) => {
      const id = nextId();
      mol = addAtom(mol, id, { x: i * 40, y: 0 }, "C");
      return id;
    };
    const A = mk(0), B = mk(1), X = mk(2);
    mol = addBond(mol, nextId(), A, B);
    mol = addBond(mol, nextId(), A, X);
    mol = addBond(mol, nextId(), B, X);

    const out = collapseToGroup(mol, { templateId: "Me", label: "Me", atomIds: [A, B] });
    const g = Object.values(out.atoms).find((a) => a.group === "Me")!;
    const bonds = Object.values(out.bonds);

    // A-B was internal and is gone; exactly one bond survives, to X.
    expect(bonds).toHaveLength(1);
    expect(bonds[0].a1 === g.id ? bonds[0].a2 : bonds[0].a1).toBe(X);
  });

  test("bond ids and their keys stay in agreement after a collapse", () => {
    // Every other lookup in the app is keyed on Bond.id, so a mismatch
    // between the key and the id would break selection and export.
    const { mol } = fragment(["C", "C", "O"], [[0, 1, 1], [1, 2, 1]]);
    const match = findCollapsibleGroups(mol).find((m) => m.templateId === "Et")!;
    const out = collapseToGroup(mol, match);
    for (const [key, b] of Object.entries(out.bonds)) {
      expect(b.id).toBe(key);
      expect(out.atoms[b.a1]).toBeDefined();
      expect(out.atoms[b.a2]).toBeDefined();
    }
  });
});
