// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { emptyMolecule, addAtom, addBond, setAtomCharge } from "../../model/molecule";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import type { Molecule } from "../../types/chemistry";
import { AromaticityPanel } from "./AromaticityPanel";

/**
 * The panel reads the molecule from the store rather than taking it as a prop
 * (it also needs the selection, to scope the way the other descriptor panels
 * do), so these seed the store the way ignoreValenceSelection.test.ts does.
 *
 * What's worth pinning down here is the *presentation* half — that each verdict
 * gets its own badge and card treatment, and that the reasoning line travels
 * with the number. The chemistry itself is covered in engine/aromaticity.test.ts.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useMoleculeStore.setState({ molecule: emptyMolecule(), selected: new Set(), language: "en" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** A ring of carbons with the given per-edge bond orders. */
function ring(ids: string[], orders: number[], charges: Record<string, number> = {}): Molecule {
  let mol = emptyMolecule();
  ids.forEach((id, i) => {
    mol = addAtom(mol, id, { x: 40 * i, y: 0 }, "C");
  });
  ids.forEach((id, i) => {
    mol = addBond(mol, `b${i}`, id, ids[(i + 1) % ids.length], orders[i] as 1 | 2);
  });
  for (const [id, charge] of Object.entries(charges)) mol = setAtomCharge(mol, id, charge);
  return mol;
}

function render(mol: Molecule, selected: string[] = []) {
  useMoleculeStore.setState({ molecule: mol, selected: new Set(selected) });
  act(() => root.render(<AromaticityPanel />));
}

const text = () => container.textContent ?? "";
const badge = () => container.querySelector(".aromaticity-badge");
const card = () => container.querySelector(".aromaticity-card");

describe("verdict badges", () => {
  test("benzene shows Aromatic, its π count and the Hückel expression", () => {
    render(ring(["a", "b", "c", "d", "e", "f"], [2, 1, 2, 1, 2, 1]));
    expect(badge()?.textContent).toBe("Aromatic");
    expect(card()?.className).toContain("aromaticity-card--aromatic");
    expect(text()).toContain("6 π electrons");
    expect(text()).toContain("4n+2, n=1");
  });

  test("cyclobutadiene shows Antiaromatic with a red treatment", () => {
    render(ring(["a", "b", "c", "d"], [2, 1, 2, 1]));
    expect(badge()?.textContent).toBe("Antiaromatic");
    expect(card()?.className).toContain("aromaticity-card--antiaromatic");
    expect(text()).toContain("4 π electrons");
    expect(text()).toContain("4n, n=1");
  });

  test("cyclohexane shows Non-aromatic and says why, rather than just the verdict", () => {
    render(ring(["a", "b", "c", "d", "e", "f"], [1, 1, 1, 1, 1, 1]));
    expect(badge()?.textContent).toBe("Non-aromatic");
    expect(card()?.className).toContain("aromaticity-card--non-aromatic");
    // The reason is the whole point for this case: there is no π count to show.
    expect(text()).toContain("Conjugation is broken");
  });

  test("an abbreviated group in the ring reports Not determined instead of guessing", () => {
    let mol = ring(["a", "b", "c", "d", "e", "f"], [2, 1, 2, 1, 2, 1]);
    mol = { ...mol, atoms: { ...mol.atoms, a: { ...mol.atoms.a, group: "Ph" } } };
    render(mol);
    expect(badge()?.textContent).toBe("Not determined");
    expect(text()).toContain("abbreviated group");
  });
});

describe("empty states", () => {
  test("nothing drawn", () => {
    render(emptyMolecule());
    expect(text()).toContain("Draw a structure first");
  });

  test("a structure with no rings says so, and doesn't claim it's fine", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b1", "a", "b", 1);
    render(mol);
    expect(text()).toContain("No rings in this structure");
  });
});

describe("fused systems", () => {
  test("a 6+6 fusion is one system, and says the count is for the pair", () => {
    // Two hexagons sharing the d-e bond, as in naphthalene.
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const edges: [string, string, 1 | 2][] = [
      ["a", "b", 2], ["b", "c", 1], ["c", "d", 2], ["d", "e", 1], ["e", "f", 2],
      ["f", "g", 1], ["g", "h", 2], ["h", "i", 1], ["i", "j", 2], ["j", "a", 1], ["e", "j", 1],
    ];
    let mol = emptyMolecule();
    ids.forEach((id, i) => {
      mol = addAtom(mol, id, { x: 40 * i, y: 0 }, "C");
    });
    edges.forEach(([from, to, order], i) => {
      mol = addBond(mol, `b${i}`, from, to, order);
    });
    render(mol);
    expect(container.querySelectorAll(".aromaticity-card")).toHaveLength(1);
    expect(text()).toContain("6 + 6 fused");
    expect(text()).toContain("10 π electrons");
    expect(text()).toContain("Both rings share one delocalised");
  });

  test("two disconnected fragments are labelled separately", () => {
    // Without the per-fragment heading, one fragment's verdict reads as a
    // statement about the whole drawing.
    let mol = ring(["a", "b", "c", "d"], [2, 1, 2, 1]);
    ["e", "f", "g", "h"].forEach((id, i) => {
      mol = addAtom(mol, id, { x: 40 * i, y: 200 }, "C");
    });
    ["e-f", "f-g", "g-h", "h-e"].forEach((pair, i) => {
      mol = addBond(mol, `x${i}`, pair.split("-")[0], pair.split("-")[1], 1);
    });
    render(mol);
    expect(container.querySelectorAll(".aromaticity-card")).toHaveLength(2);
    expect(text()).toContain("Fragment 1");
    expect(text()).toContain("Fragment 2");
  });
});

describe("scoping to the selection", () => {
  test("selecting part of a ring analyses only what was selected", () => {
    // The whole ring is antiaromatic; a bare chain of it is not a ring at all.
    render(ring(["a", "b", "c", "d"], [2, 1, 2, 1]), ["a", "b"]);
    expect(text()).toContain("Selection (2 atoms)");
    expect(text()).toContain("No rings in this structure");
    expect(badge()).toBeNull();
  });
});

describe("translation", () => {
  test("the Spanish UI shows Spanish, with no missing-key fallbacks", () => {
    useMoleculeStore.setState({ language: "es" });
    render(ring(["a", "b", "c", "d"], [2, 1, 2, 1]));
    expect(badge()?.textContent).toBe("Antiaromático");
    expect(text()).not.toContain("aromaticity.");
  });
});