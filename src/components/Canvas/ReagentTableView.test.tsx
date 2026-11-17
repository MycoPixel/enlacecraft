// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ReagentTableView } from "./ReagentTableView";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { emptyMolecule } from "../../model/molecule";
import { newReagentRow } from "../../model/reagentTable";
import type { Atom, Molecule } from "../../types/chemistry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMoleculeStore.setState({ language: "en" });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function atom(id: string, x: number, y: number): Atom {
  return { id, x, y, element: "C", charge: 0 } as Atom;
}

function withTable(table: Molecule["reagentTable"]): Molecule {
  const mol = emptyMolecule();
  mol.atoms.a = atom("a", 0, 0);
  mol.atoms.b = atom("b", 42, 20);
  mol.reagentTable = table;
  return mol;
}

function render(molecule: Molecule) {
  act(() => root.render(<ReagentTableView molecule={molecule} />));
  return container.textContent ?? "";
}

describe("ReagentTableView", () => {
  test("draws nothing when the sheet has no table", () => {
    expect(render(withTable(undefined))).toBe("");
    expect(render(withTable({ rows: [] }))).toBe("");
  });

  test("renders the rows with their derived amounts", () => {
    const text = render(
      withTable({
        scaleMmol: 2,
        rows: [
          newReagentRow({ id: "r1", name: "K2CO3", role: "reactant", equivalents: 1, mw: 138.2, limiting: true }),
          newReagentRow({ id: "r2", name: "Ethanol", role: "product", mw: 46.07, yieldPercent: 80 }),
        ],
      })
    );
    expect(text).toContain("Reagent table");
    expect(text).toContain("K2CO3");
    expect(text).toContain("Ethanol");
    expect(text).toContain("276.4");
    // A product is reported as what you would weigh out, not the theory.
    expect(text).toContain("73.712");
    // The limiting row is named in the subtitle, so the table explains itself.
    expect(text).toContain("Limiting: K2CO3");
    expect(container.querySelectorAll("[data-reagent-row]")).toHaveLength(2);
  });

  test("falls back to the formula when a row has no name", () => {
    const text = render(
      withTable({
        rows: [newReagentRow({ id: "r1", role: "reactant", formula: "C2H6O", mw: 46.07 })],
      })
    );
    expect(text).toContain("C2H6O");
  });

  test("hangs below the drawing instead of over it", () => {
    render(
      withTable({
        rows: [newReagentRow({ id: "r1", name: "A", role: "reactant", mw: 10 })],
      })
    );
    const group = container.querySelector("[data-reagent-table]");
    expect(group?.getAttribute("transform")).toBe("translate(0 68)");
  });
});
