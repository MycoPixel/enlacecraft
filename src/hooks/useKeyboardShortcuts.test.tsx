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

describe("useKeyboardShortcuts - delete", () => {
  /**
   * Regression coverage for "catalytic cycles cannot be deleted": selecting
   * a cycle's ring clears the atom selection and only sets selectedCycleId,
   * so the Delete handler's old `selected.size > 0` guard swallowed the key
   * and the cycle survived every Delete press.
   */
  function cycleOnlySelection() {
    const mol = addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
    act(() => {
      useMoleculeStore.setState({ molecule: mol, selected: new Set(), atomEditTarget: null });
    });
    act(() => {
      useMoleculeStore.getState().addCatalyticCycle({ centre: { x: 0, y: 0 }, radius: 80, nodes: [["a1"]] });
    });
  }

  test("Delete removes a cycle-only selection", () => {
    cycleOnlySelection();
    expect(useMoleculeStore.getState().molecule.cycles).toHaveLength(1);
    press("Delete");
    expect(useMoleculeStore.getState().molecule.cycles ?? []).toHaveLength(0);
    expect(useMoleculeStore.getState().selectedCycleId).toBeNull();
  });

  test("Backspace removes a cycle-only selection the same way", () => {
    cycleOnlySelection();
    press("Backspace");
    expect(useMoleculeStore.getState().molecule.cycles ?? []).toHaveLength(0);
  });

  test("deleting a cycle is undoable as a single step", () => {
    cycleOnlySelection();
    press("Delete");
    act(() => useMoleculeStore.getState().undo());
    expect(useMoleculeStore.getState().molecule.cycles).toHaveLength(1);
  });

  test("Escape deselects the cycle too", () => {
    cycleOnlySelection();
    press("Escape");
    expect(useMoleculeStore.getState().selectedCycleId).toBeNull();
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

/**
 * The desktop Edit-menu arrangement (see electron/main.cjs): the menu does
 * not register its accelerators, so Ctrl+Z/Y/A reach this hook's keydown
 * handler even when a text field has focus — where the hook forwards them
 * to the native editor commands through the bridge — and the menu's own
 * click handlers deliver undo/redo/select-all over IPC instead.
 */
describe("useKeyboardShortcuts - desktop Edit menu routing", () => {
  const originalElectron = (window as unknown as { electron?: unknown }).electron;
  const nativeCommands: string[] = [];
  const editCommandListeners = new Set<(command: string) => void>();

  function installBridge() {
    nativeCommands.length = 0;
    editCommandListeners.clear();
    Object.defineProperty(window, "electron", {
      value: {
        nativeEditCommand: async (command: string) => {
          nativeCommands.push(command);
          return true;
        },
        onEditCommand: (callback: (command: string) => void) => {
          editCommandListeners.add(callback);
          return () => editCommandListeners.delete(callback);
        },
      },
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "electron", { value: originalElectron, configurable: true, writable: true });
  });

  /** Mounts a fresh harness AFTER the bridge exists, since the
   * subscription effect only registers when the bridge is present. */
  function mountWithBridge() {
    installBridge();
    const container2 = document.createElement("div");
    document.body.appendChild(container2);
    const root2 = createRoot(container2);
    act(() => {
      root2.render(<Harness />);
    });
    return () =>
      act(() => {
        root2.unmount();
        container2.remove();
      });
  }

  test("Ctrl+A in a text field forwards select-all to the native editor, not the canvas", () => {
    installBridge();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
    });
    expect(nativeCommands).toEqual(["selectAll"]);
    input.remove();
  });

  test("Ctrl+Shift+Z / Ctrl+Y in a text field forward redo, Ctrl+Z undo", () => {
    installBridge();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true }));
    });
    expect(nativeCommands).toEqual(["undo", "redo", "redo"]);
    input.remove();
  });

  test("the Edit menu's undo/redo/select-all commands drive the store actions", () => {
    const mol = (() => {
      let m = emptyMolecule();
      m = addAtom(m, "a1", { x: 0, y: 0 }, "C");
      m = addAtom(m, "a2", { x: 40, y: 0 }, "C");
      return m;
    })();
    act(() => {
      useMoleculeStore.setState({
        molecule: mol,
        annotations: {},
        selected: new Set(["a1", "a2"]),
        selectedAnnotationIds: new Set(),
        selectedCycleId: null,
        past: [],
        future: [],
        hoverAtomId: null,
        atomEditTarget: null,
        labelEditTarget: null,
      });
    });
    const unmount = mountWithBridge();

    act(() => {
      for (const listener of editCommandListeners) listener("selectAll");
    });
    expect(useMoleculeStore.getState().selected.size).toBe(2);

    // A committed edit to undo (selection changes themselves carry no
    // history entry, so delete the selection to push one).
    act(() => {
      useMoleculeStore.getState().deleteSelection();
    });
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(0);

    act(() => {
      for (const listener of editCommandListeners) listener("undo");
    });
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(2);

    act(() => {
      for (const listener of editCommandListeners) listener("redo");
    });
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(0);

    unmount();
  });

  test("menu undo/redo/select-all in a text field forward to the native editor", () => {
    const unmount = mountWithBridge();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      for (const listener of editCommandListeners) listener("selectAll");
      for (const listener of editCommandListeners) listener("undo");
    });
    expect(nativeCommands).toEqual(["selectAll", "undo"]);
    input.remove();
    unmount();
  });
});
