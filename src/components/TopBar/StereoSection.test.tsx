// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../../model/molecule";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import type { Molecule } from "../../types/chemistry";
import { StereoSection } from "./MoleculeInfoButton";

/**
 * The stereochemistry panel used to render manual Atom.stereoLabel values
 * only inside a *computed* assignment row. An atom whose configuration the
 * engine couldn't assign (or a molecule it can't analyse at all) therefore
 * kept its R/S glyph on the canvas but vanished from the panel — the one
 * place a user would look to check what they'd asserted. These pin the
 * "Manual" section that now lists those labels on their own.
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

function render(mol: Molecule) {
  useMoleculeStore.setState({ molecule: mol, selected: new Set() });
  act(() => root.render(<StereoSection molecule={mol} />));
}

const text = () => container.textContent ?? "";

/** Ethane with a manual descriptor on one carbon — no computed stereocenter,
 * so this is exactly the case the computed-only list dropped. */
function ethaneWithManualLabel(label: "R" | "S"): Molecule {
  let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 42, y: 0 }, "C");
  mol = addBond(mol, "ab", "a", "b", 1);
  return { ...mol, atoms: { ...mol.atoms, a: { ...mol.atoms.a, stereoLabel: label } } };
}

describe("manual stereo labels", () => {
  test("an unassigned manual label is listed under Manual", () => {
    render(ethaneWithManualLabel("R"));
    expect(text()).toContain("Manual");
    expect(text()).toContain("(R)");
  });

  test("it is not also reported as 'no stereocenters'", () => {
    render(ethaneWithManualLabel("S"));
    expect(text()).toContain("(S)");
    expect(text()).not.toContain("No stereocenters");
  });

  test("a structure with no manual labels keeps the empty-state hint", () => {
    let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "b", { x: 42, y: 0 }, "C");
    mol = addBond(mol, "ab", "a", "b", 1);
    render(mol);
    expect(text()).toContain("No stereocenters");
    expect(text()).not.toContain("Manual");
  });
});
