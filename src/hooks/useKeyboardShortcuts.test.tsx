// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";

// runProjectSave is mocked rather than exercised for real: it reaches into
// the store and the filesystem bridges, and what these tests care about is
// only which branch the shortcut selects.
const savedWithDialog: boolean[] = [];
vi.mock("../io/projectSaver", () => ({
  runProjectSave: async (forceDialog: boolean) => {
    savedWithDialog.push(forceDialog);
  },
}));

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
  savedWithDialog.length = 0;
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

describe("useKeyboardShortcuts - duplicate", () => {
  function twoAtomSelection() {
    let mol = addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a2", { x: 40, y: 0 }, "C");
    act(() => {
      useMoleculeStore.setState({ molecule: mol, selected: new Set(["a1", "a2"]), atomEditTarget: null });
    });
  }

  function pressWithCtrl(key: string) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }));
    });
  }

  test("Ctrl+D duplicates the selected atoms", () => {
    twoAtomSelection();
    pressWithCtrl("d");
    // Two original atoms plus their two duplicates.
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(4);
  });

  test("Ctrl+D is undoable as a single step", () => {
    twoAtomSelection();
    pressWithCtrl("d");
    act(() => useMoleculeStore.getState().undo());
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(2);
  });

  test("Ctrl+D with an empty selection does nothing rather than throwing", () => {
    act(() => {
      useMoleculeStore.setState({ molecule: emptyMolecule(), selected: new Set(), atomEditTarget: null });
    });
    pressWithCtrl("d");
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(0);
  });

  test("Meta+D (macOS) behaves the same as Ctrl+D", () => {
    twoAtomSelection();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", metaKey: true, bubbles: true, cancelable: true }));
    });
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(4);
  });

  test("Ctrl+D is preventDefault'd so the browser's bookmark handler doesn't fire", () => {
    twoAtomSelection();
    const event = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  test("bare d is not a duplicate shortcut and stays available to element typing", () => {
    const atomId = oneAtomMoleculeWithHover();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true, cancelable: true }));
    });
    // No duplication...
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(1);
    // ...and d isn't in the element quick-key table either, so the atom is
    // untouched. (d is the bond tool's *tool* shortcut only when nothing is
    // targeted; here an atom is hovered, so the element path wins and finds
    // no match for "d".)
    expect(useMoleculeStore.getState().molecule.atoms[atomId].element).toBe("C");
  });
});

describe("useKeyboardShortcuts - project save", () => {
  function pressWith(init: KeyboardEventInit) {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  }

  test("Ctrl+S saves without forcing the dialog", async () => {
    pressWith({ key: "s", ctrlKey: true });
    await act(async () => {});
    expect(savedWithDialog).toEqual([false]);
  });

  test("Ctrl+Shift+S goes straight to Save As", async () => {
    // Regression guard for an ordering bug: the plain handler matches the same
    // key with shift held (e.key is still "s"), so if the shift case is
    // checked second it never runs and Shift+Ctrl+S silently does a plain save.
    pressWith({ key: "s", ctrlKey: true, shiftKey: true });
    await act(async () => {});
    expect(savedWithDialog).toEqual([true]);
  });

  test("Cmd+S behaves like Ctrl+S", async () => {
    pressWith({ key: "s", metaKey: true });
    await act(async () => {});
    expect(savedWithDialog).toEqual([false]);
  });

  test("suppresses the browser's own save-page dialog", () => {
    const event = pressWith({ key: "s", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  test("bare s is unaffected — it is not a save shortcut", () => {
    pressWith({ key: "s" });
    expect(savedWithDialog).toEqual([]);
  });
});
