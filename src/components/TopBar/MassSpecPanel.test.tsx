// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { addAtom, emptyMolecule } from "../../model/molecule";
import { exactMass } from "../../model/massSpec";
import type { Element, Molecule } from "../../types/chemistry";
import { MassSpecPanel } from "./MassSpecPanel";

/**
 * Boron and selenium put isotope peaks BELOW the base mass. The panel has to
 * label those honestly ("M−1", not "M+-1") and its hint has to quote the mass
 * of the M peak itself rather than the lightest peak drawn.
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

function atomsOf(...elements: Element[]): Molecule {
  let mol = emptyMolecule();
  elements.forEach((el, i) => {
    mol = addAtom(mol, `a${i}`, { x: i * 40, y: 0 }, el);
  });
  return mol;
}

function render(mol: Molecule) {
  act(() => root.render(<MassSpecPanel molecule={mol} />));
}

describe("isotope pattern labels", () => {
  test("peaks below the base mass read M−1, never M+-1", () => {
    render(atomsOf("B", "B"));
    const labels = [...container.querySelectorAll("svg.mass-spec__pattern text")].map((n) => n.textContent ?? "");
    expect(labels).toContain("M\u22121");
    expect(labels).toContain("M\u22122");
    expect(labels).toContain("M");
    expect(labels.some((l) => l.includes("+-"))).toBe(false);
  });

  test("ordinary molecules keep their M+n labels", () => {
    render(atomsOf("Cl"));
    const labels = [...container.querySelectorAll("svg.mass-spec__pattern text")].map((n) => n.textContent ?? "");
    expect(labels).toContain("M+2");
  });

  test("the hint quotes the M peak, not the lightest peak shown", () => {
    const mol = atomsOf("B");
    render(mol);
    const hint = [...container.querySelectorAll("p.align-menu__hint")]
      .map((n) => n.textContent ?? "")
      .find((text) => text.includes("m/z"));
    expect(hint).toBeDefined();
    expect(hint).toContain(exactMass(mol).toFixed(3));
  });
});
