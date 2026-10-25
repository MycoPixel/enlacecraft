import { describe, expect, it } from "vitest";
import { FUNCTIONAL_GROUP_TEMPLATES } from "./functionalGroupTemplates";
import { placeFunctionalGroup } from "../engine/functionalGroupPlacement";
import { addAtom, emptyMolecule } from "./molecule";
import { BOND_LEN } from "./constants";

/**
 * Guards the functional-group templates' hand-built layouts. These are
 * laid out by walking fixed bond lengths and angles (see build()/ring6()/
 * ring5() in functionalGroupTemplates.ts), so a mistake in one of those
 * helpers shows up in every group that uses it — which is exactly how the
 * ring6() external bond ended up at half a bond length for phenyl, benzyl,
 * tosyl, tyrosine and friends before this test existed.
 */
function bondLengths(template: (typeof FUNCTIONAL_GROUP_TEMPLATES)[number]) {
  const atoms = new Map(template.atoms.map((a) => [a.key, a]));
  return template.bonds.map((b) => {
    const a1 = atoms.get(b.from);
    const a2 = atoms.get(b.to);
    expect(a1, `${template.id}: bond ${b.from}-${b.to} has a missing endpoint`).toBeDefined();
    expect(a2, `${template.id}: bond ${b.from}-${b.to} has a missing endpoint`).toBeDefined();
    return Math.hypot(a1!.x - a2!.x, a1!.y - a2!.y);
  });
}

describe("functional group templates", () => {
  it("have unique atom keys, no dangling or self bonds, and no duplicate bonds", () => {
    const problems: string[] = [];
    for (const template of FUNCTIONAL_GROUP_TEMPLATES) {
      const keys = template.atoms.map((a) => a.key);
      if (new Set(keys).size !== keys.length) problems.push(`${template.id}: duplicate atom key`);
      for (const bond of template.bonds) {
        if (!keys.includes(bond.from)) problems.push(`${template.id}: bond from ${bond.from} does not exist`);
        if (!keys.includes(bond.to)) problems.push(`${template.id}: bond to ${bond.to} does not exist`);
        if (bond.from === bond.to) problems.push(`${template.id}: self bond ${bond.from}`);
      }
      const seen = new Set<string>();
      for (const bond of template.bonds) {
        const key = [bond.from, bond.to].sort().join("-");
        if (seen.has(key)) problems.push(`${template.id}: duplicate bond ${key}`);
        seen.add(key);
      }
    }
    expect(problems).toEqual([]);
  });

  it("use one consistent bond length everywhere", () => {
    const problems: string[] = [];
    for (const template of FUNCTIONAL_GROUP_TEMPLATES) {
      for (const [index, length] of bondLengths(template).entries()) {
        if (length < BOND_LEN * 0.85 || length > BOND_LEN * 1.15) {
          problems.push(`${template.id}: bond ${index} is ${length.toFixed(1)} px (expected ~${BOND_LEN})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keep every bond at a full length when attached to an existing atom", () => {
    const problems: string[] = [];
    for (const template of FUNCTIONAL_GROUP_TEMPLATES) {
      const base = addAtom(emptyMolecule(), "anchor", { x: 0, y: 0 }, "C");
      const placed = placeFunctionalGroup(base, template, { x: 0, y: 0 }, { type: "atom", atomId: "anchor" }, 0);
      for (const bond of Object.values(placed.bonds)) {
        const a1 = placed.atoms[bond.a1];
        const a2 = placed.atoms[bond.a2];
        const length = Math.hypot(a1.x - a2.x, a1.y - a2.y);
        if (length < BOND_LEN * 0.85 || length > BOND_LEN * 1.15) {
          problems.push(`${template.id}: placed bond ${bond.a1}-${bond.a2} is ${length.toFixed(1)} px`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
