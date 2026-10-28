// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { addAtom, emptyMolecule } from "../../model/molecule";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import type { Molecule } from "../../types/chemistry";
import { SchemeSection } from "./MoleculeInfoButton";

/**
 * The info panel's read-only reaction-scheme section: it must stay out of
 * the way when a drawing has no ChemDraw scheme, and let the person select
 * a whole reaction (structures + connecting arrows) in one click.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useMoleculeStore.setState({ molecule: emptyMolecule(), selected: new Set(), selectedAnnotationIds: new Set(), language: "en" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function moleculeWithScheme(): Molecule {
  let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 60, y: 0 }, "O");
  mol = addAtom(mol, "c", { x: 180, y: 0 }, "N");
  return {
    ...mol,
    schemes: [
      {
        id: "s1",
        steps: [{ id: "st1", reactantAtomIds: ["a", "b"], productAtomIds: ["c"], arrowIds: ["arrow1"] }],
      },
    ],
  };
}

function render(mol: Molecule) {
  useMoleculeStore.setState({ molecule: mol });
  act(() => root.render(<SchemeSection molecule={mol} />));
}

const text = () => container.textContent ?? "";

describe("SchemeSection", () => {
  test("renders nothing when the drawing has no reaction scheme", () => {
    render(addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C"));
    expect(text()).toBe("");
  });

  test("lists the scheme with its step and atom counts", () => {
    render(moleculeWithScheme());
    expect(text()).toContain("Reaction schemes");
    expect(text()).toContain("Reaction 1");
    expect(text()).toContain("steps: 1");
    expect(text()).toContain("2 \u2192 1 atoms");
  });

  test("clicking a scheme selects its structures and its arrows", () => {
    const mol = moleculeWithScheme();
    render(mol);
    const button = container.querySelector("button")!;
    act(() => button.click());

    const state = useMoleculeStore.getState();
    expect([...state.selected].sort()).toEqual(["a", "b", "c"]);
    expect([...state.selectedAnnotationIds]).toEqual(["arrow1"]);
  });
});
