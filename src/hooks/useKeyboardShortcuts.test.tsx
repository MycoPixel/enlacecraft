// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";

/**
 * Covers the specific priority interactions that make b and l worth
 * testing on their own (see useKeyboardShortcuts.ts's doc comments for
 * the reasoning): both are direct single-key element shortcuts (b ->
 * Br, l -> Cl) that only apply with a target under them, and b in
 * particular has to still fall through to its *tool* shortcut (bond)
 * when there's no target — the same collision-resolution pattern the
 * hook already relied on before this change, now exercised directly
 * rather than only reasoned about by hand.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  useKeyboardShortcuts();
  return null;
}

let container: HTMLDivElement;
let root: Root;

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function oneAtomMoleculeWithHover(): string {
  const mol = addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
  act(() => {
    useMoleculeStore.setState({ molecule: mol, hoverAtomId: "a1", selected: new Set(), atomEditTarget: null });
  });
  return "a1";
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useKeyboardShortcuts - element quick-keys", () => {
  test("b sets the hovered atom to Br, not Boron", () => {
    const atomId = oneAtomMoleculeWithHover();
    press("b");
    expect(useMoleculeStore.getState().molecule.atoms[atomId].element).toBe("Br");
  });

  test("l sets the hovered atom to Cl", () => {
    const atomId = oneAtomMoleculeWithHover();
    press("l");
    expect(useMoleculeStore.getState().molecule.atoms[atomId].element).toBe("Cl");
  });

  test("b falls through to the bond tool when nothing is hovered/selected", () => {
    act(() => {
      useMoleculeStore.setState({
        molecule: emptyMolecule(),
        hoverAtomId: null,
        selected: new Set(),
        atomEditTarget: null,
        tool: "select",
      });
    });
    press("b");
    expect(useMoleculeStore.getState().tool).toBe("bond-1");
  });

  test("l does not switch to the (now-relocated) lasso tool while hovering an atom", () => {
    act(() => {
      useMoleculeStore.setState({ tool: "select" });
    });
    oneAtomMoleculeWithHover();
    press("l");
    expect(useMoleculeStore.getState().tool).toBe("select");
  });

  test("q switches to the lasso tool when nothing is hovered/selected", () => {
    act(() => {
      useMoleculeStore.setState({
        molecule: emptyMolecule(),
        hoverAtomId: null,
        selected: new Set(),
        atomEditTarget: null,
        tool: "select",
      });
    });
    press("q");
    expect(useMoleculeStore.getState().tool).toBe("lasso");
  });
});
