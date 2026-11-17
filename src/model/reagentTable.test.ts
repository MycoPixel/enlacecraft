import { describe, expect, it } from "vitest";
import {
  computeReagentTable,
  formatReagentNumber,
  newReagentRow,
  reagentRowsFromAtoms,
  reagentTableToCsv,
} from "./reagentTable";
import { emptyMolecule } from "./molecule";
import type { Atom, Molecule, ReagentTable } from "../types/chemistry";
import { importProject } from "../io/project";

function atom(id: string, element: Atom["element"], x: number): Atom {
  return { id, x, y: 0, element, charge: 0 } as Atom;
}

function ethane(): Molecule {
  const mol = emptyMolecule();
  mol.atoms.a = atom("a", "C", 0);
  mol.atoms.b = atom("b", "C", 42);
  mol.bonds.ab = { id: "ab", a1: "a", a2: "b", order: 1, stereo: "none", doubleSide: "auto" };
  return mol;
}

function table(rows: ReagentTable["rows"], scaleMmol?: number): ReagentTable {
  return { rows, ...(scaleMmol ? { scaleMmol } : {}) };
}

describe("computeReagentTable", () => {
  it("scales every row from the limiting reagent", () => {
    const rows = [
      newReagentRow({ id: "r1", name: "A", role: "reactant", equivalents: 1, mmol: 2, mw: 32, limiting: true }),
      newReagentRow({ id: "r2", name: "B", role: "reagent", equivalents: 1.5, mw: 40 }),
    ];
    const result = computeReagentTable(table(rows));
    expect(result.scaleMmol).toBe(2);
    expect(result.limitingId).toBe("r1");
    expect(result.rows[0].mmol).toBe(2);
    expect(result.rows[1].mmol).toBe(3);
  });

  it("falls back to the first reactant and then to the batch scale", () => {
    const rows = [
      newReagentRow({ id: "r1", name: "A", role: "reactant", equivalents: 2 }),
      newReagentRow({ id: "r2", name: "B", role: "reactant", equivalents: 1 }),
    ];
    const fromRow = computeReagentTable(table(rows));
    expect(fromRow.limitingId).toBe("r1");
    expect(fromRow.scaleMmol).toBe(1);

    const fromScale = computeReagentTable(table([{ ...rows[0], equivalents: 1 }], 4));
    expect(fromScale.scaleMmol).toBe(4);
    expect(fromScale.rows[0].mmol).toBe(4);
  });

  it("turns mmol and MW into milligrams", () => {
    const result = computeReagentTable(
      table([newReagentRow({ id: "r1", role: "reactant", equivalents: 1, mmol: 2.5, mw: 46.07, limiting: true })])
    );
    expect(result.rows[0].massMg).toBeCloseTo(115.175, 5);
  });

  it("derives volume from density, and prefers concentration when both exist", () => {
    const neat = computeReagentTable(
      table([newReagentRow({ id: "r1", role: "reactant", equivalents: 1, mmol: 2, mw: 32, density: 0.792, limiting: true })])
    );
    expect(neat.rows[0].volumeMl).toBeCloseTo(0.0808, 4);

    const solution = computeReagentTable(
      table([
        newReagentRow({
          id: "r1",
          role: "reactant",
          equivalents: 1,
          mmol: 2,
          mw: 32,
          density: 0.792,
          concentration: 1,
          limiting: true,
        }),
      ])
    );
    expect(solution.rows[0].volumeMl).toBeCloseTo(2, 6);
  });

  it("applies a product's yield without changing its theoretical amount", () => {
    const result = computeReagentTable(
      table([
        newReagentRow({ id: "p1", role: "product", mmol: 5, mw: 100, yieldPercent: 80 }),
      ])
    );
    expect(result.rows[0].mmol).toBe(5);
    expect(result.rows[0].massMg).toBeCloseTo(500, 6);
    expect(result.rows[0].isolatedMassMg).toBeCloseTo(400, 6);
  });

  it("treats a missing yield as quantitative", () => {
    const result = computeReagentTable(table([newReagentRow({ id: "p1", role: "product", mmol: 1, mw: 50 })]));
    expect(result.rows[0].isolatedMassMg).toBeCloseTo(50, 6);
  });

  it("sums reactant and reagent mass, not solvent or product", () => {
    const result = computeReagentTable(
      table([
        newReagentRow({ id: "r1", role: "reactant", equivalents: 1, mmol: 1, mw: 100, limiting: true }),
        newReagentRow({ id: "r2", role: "reagent", equivalents: 1, mmol: 1, mw: 50 }),
        newReagentRow({ id: "s1", role: "solvent", equivalents: 100, mmol: 100, mw: 10 }),
        newReagentRow({ id: "p1", role: "product", mmol: 1, mw: 120 }),
      ])
    );
    expect(result.totalReactantMassMg).toBeCloseTo(150, 6);
  });
});

describe("rows from a drawing", () => {
  it("makes one row per connected structure with formula and MW", () => {
    const rows = reagentRowsFromAtoms(ethane(), ["a", "b"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].formula).toBe("C2H6");
    expect(rows[0].mw).toBeCloseTo(30.07, 2);
    expect(rows[0].atomIds).toEqual(["a", "b"]);
    expect(rows[0].role).toBe("reactant");
  });

  it("ignores ids that are not in the molecule", () => {
    expect(reagentRowsFromAtoms(ethane(), ["missing"])).toEqual([]);
  });
});

describe("CSV", () => {
  it("writes the derived columns and quotes names with commas", () => {
    const csv = reagentTableToCsv(
      table([
        newReagentRow({
          id: "r1",
          name: "K2CO3, sat.",
          role: "reagent",
          equivalents: 2,
          mw: 138.2,
          limiting: false,
        }),
      ])
    );
    const [header, row] = csv.split("\n");
    expect(header).toContain("Mass (mg)");
    expect(row).toContain('"K2CO3, sat."');
    expect(row).toContain("276.4");
  });

  it("lets an explicit mmol override the equivalents calculation", () => {
    const result = computeReagentTable(
      table([
        newReagentRow({ id: "r1", name: "A", role: "reactant", equivalents: 1, mmol: 2, mw: 100, limiting: true }),
        newReagentRow({ id: "r2", name: "B", role: "reagent", equivalents: 2, mmol: 1, mw: 50 }),
      ])
    );
    expect(result.rows[0].mmol).toBe(2);
    expect(result.rows[1].mmol).toBe(1);
    expect(result.rows[1].massMg).toBeCloseTo(50, 6);
  });

  it("exports a product's isolated mass beside its theoretical mass", () => {
    const csv = reagentTableToCsv(
      table([newReagentRow({ id: "p1", name: "P", role: "product", mmol: 2, mw: 100, yieldPercent: 75 })])
    );
    const [header, row] = csv.split("\n");
    expect(header).toContain("Isolated (mg)");
    const cols = row.split(",");
    expect(cols[header.split(",").indexOf("Mass (mg)")]).toBe("200");
    expect(cols[header.split(",").indexOf("Isolated (mg)")]).toBe("150");
  });

  it("marks the effective limiting row, even when it was only the fallback", () => {
    const csv = reagentTableToCsv(
      table([
        newReagentRow({ id: "r1", name: "A", role: "reactant", mw: 10 }),
        newReagentRow({ id: "r2", name: "B", role: "reagent", mw: 20 }),
      ])
    );
    const [, first, second] = csv.split("\n");
    expect(first.endsWith("yes")).toBe(true);
    expect(second.endsWith("yes")).toBe(false);
  });

  it("formats numbers without trailing zeros", () => {
    expect(formatReagentNumber(2)).toBe("2");
    expect(formatReagentNumber(2.5)).toBe("2.5");
    expect(formatReagentNumber(undefined)).toBe("");
  });
});

describe("project round-trip", () => {
  const projects = (reagentTable: unknown) =>
    JSON.stringify({
      version: 2,
      activeTabId: "t1",
      tabs: [
        {
          id: "t1",
          title: "T",
          molecule: { ...ethane(), reagentTable },
          annotations: {},
          view: { scale: 1, tx: 0, ty: 0 },
        },
      ],
    });

  it("keeps a valid table", () => {
    const imported = importProject(
      projects({
        scaleMmol: 2,
        rows: [{ id: "r1", name: "A", role: "reactant", formula: "C2H6", mw: 30.07, equivalents: 1, limiting: true }],
      })
    );
    const table = imported.tabs[0].molecule.reagentTable;
    expect(table?.scaleMmol).toBe(2);
    expect(table?.rows[0].name).toBe("A");
    expect(table?.rows[0].limiting).toBe(true);
  });

  it("drops impossible numbers, unknown roles and stale atom ids", () => {
    const imported = importProject(
      projects({
        rows: [
          {
            id: "r1",
            name: "A",
            role: "not-a-role",
            mw: -4,
            equivalents: 1e12,
            density: Number.POSITIVE_INFINITY,
            atomIds: ["a", "ghost"],
          },
        ],
      })
    );
    const row = imported.tabs[0].molecule.reagentTable!.rows[0];
    expect(row.role).toBe("reactant");
    expect(row.mw).toBeUndefined();
    expect(row.equivalents).toBeUndefined();
    expect(row.density).toBeUndefined();
    expect(row.atomIds).toEqual(["a"]);
  });
});
