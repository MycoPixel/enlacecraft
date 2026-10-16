// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { emptyMolecule, addAtom, addBond, setAtomCharge } from "../../model/molecule";
import type { Molecule } from "../../types/chemistry";
import { AromaticityOverlay } from "./AromaticityOverlay";

/**
 * The overlay's job is to put the verdict on the structure itself, so what's
 * worth pinning down is that each verdict reaches its own class — a mismapped
 * colour would mark cyclobutadiene as aromatic, which is exactly the error the
 * feature exists to prevent.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function ring(ids: string[], orders: number[], charges: Record<string, number> = {}): Molecule {
  let mol = emptyMolecule();
  ids.forEach((id, i) => {
    mol = addAtom(mol, id, { x: 40 * i, y: i * 7 }, "C");
  });
  ids.forEach((id, i) => {
    mol = addBond(mol, `b${i}`, id, ids[(i + 1) % ids.length], orders[i] as 1 | 2);
  });
  for (const [id, charge] of Object.entries(charges)) mol = setAtomCharge(mol, id, charge);
  return mol;
}

function render(mol: Molecule) {
  act(() => root.render(
    <svg>
      <AromaticityOverlay molecule={mol} />
    </svg>,
  ));
}

const classes = () =>
  [...container.querySelectorAll(".aromaticity-overlay__ring")].map((n) => n.getAttribute("class") ?? "");

describe("verdict classes", () => {
  test("benzene is outlined as aromatic", () => {
    render(ring(["a", "b", "c", "d", "e", "f"], [2, 1, 2, 1, 2, 1]));
    expect(classes()).toHaveLength(1);
    expect(classes()[0]).toContain("is-aromatic");
  });

  test("cyclobutadiene is outlined as antiaromatic", () => {
    render(ring(["a", "b", "c", "d"], [2, 1, 2, 1]));
    expect(classes()[0]).toContain("is-antiaromatic");
  });

  test("cyclohexane is outlined as non-aromatic", () => {
    render(ring(["a", "b", "c", "d", "e", "f"], [1, 1, 1, 1, 1, 1]));
    expect(classes()[0]).toContain("is-non-aromatic");
  });

  test("the three verdicts are visually distinct, not one shared style", () => {
    const all = new Set([
      ...classesFor(ring(["a", "b", "c", "d", "e", "f"], [2, 1, 2, 1, 2, 1])),
      ...classesFor(ring(["a", "b", "c", "d"], [2, 1, 2, 1])),
      ...classesFor(ring(["a", "b", "c", "d", "e", "f"], [1, 1, 1, 1, 1, 1])),
    ]);
    expect(all.size).toBe(3);
  });

  test("an acyclic molecule draws nothing at all", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 40, y: 0 }, "C");
    mol = addBond(mol, "b1", "a", "b", 1);
    render(mol);
    expect(container.querySelector(".aromaticity-overlay")).toBeNull();
  });
});

describe("fused systems", () => {
  test("naphthalene gets one outline per ring, both in the system's verdict", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const edges: [string, string, 1 | 2][] = [
      ["a", "b", 2], ["b", "c", 1], ["c", "d", 2], ["d", "e", 1], ["e", "f", 2],
      ["f", "g", 1], ["g", "h", 2], ["h", "i", 1], ["i", "j", 2], ["j", "a", 1], ["e", "j", 1],
    ];
    let mol = emptyMolecule();
    ids.forEach((id, i) => {
      mol = addAtom(mol, id, { x: 30 * i, y: i % 2 ? 20 : 0 }, "C");
    });
    edges.forEach(([from, to, order], i) => {
      mol = addBond(mol, `b${i}`, from, to, order);
    });
    render(mol);
    const got = classes();
    expect(got).toHaveLength(2);
    expect(got.every((c) => c.includes("is-aromatic"))).toBe(true);
  });
});

describe("overlay geometry", () => {
  test("each polygon follows its own ring's atom coordinates", () => {
    render(ring(["a", "b", "c", "d"], [2, 1, 2, 1]));
    const poly = container.querySelector(".aromaticity-overlay__ring") as SVGPolygonElement;
    expect(poly).toBeTruthy();
    const points = (poly.getAttribute("points") ?? "").split(" ").filter(Boolean);
    expect(points).toHaveLength(4);
    expect(points[0]).toBe("0,0");
  });

  test("the overlay is inert to clicks and excluded from exports", () => {
    render(ring(["a", "b", "c", "d"], [2, 1, 2, 1]));
    const group = container.querySelector(".aromaticity-overlay") as SVGGElement;
    // Drawing analysis annotations onto someone's exported figure would be
    // wrong: the figure is the structure, not the app's opinion of it. Note
    // this is data-export-exclude, which is what exportImage.ts's
    // prepareExportClone actually removes — data-export-content only scopes
    // the bounding box, and tagging with that would silently do nothing.
    expect(group.getAttribute("pointer-events")).toBe("none");
    expect(group.hasAttribute("data-export-exclude")).toBe(true);
  });
});

function classesFor(mol: Molecule): string[] {
  act(() => root.render(
    <svg>
      <AromaticityOverlay molecule={mol} />
    </svg>,
  ));
  return classes();
}