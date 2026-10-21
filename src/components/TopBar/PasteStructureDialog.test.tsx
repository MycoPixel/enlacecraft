// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PasteStructureDialog } from "./PasteStructureDialog";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { emptyMolecule, addAtom, addBond } from "../../model/molecule";

// Same React-act environment declaration every jsdom component test here
// sets (see ErrorBoundary.test.tsx) — without it act() warns on every call.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** React tracks the previous value on the DOM node, so assigning .value
 *  directly is invisible to onChange. Going through the native setter is what
 *  makes React see a genuine user edit (same helper idea as
 *  SpectrumLookup.test.tsx, for a textarea rather than an input). */
function typeInto(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // A deterministic, empty canvas for every test — the dialog inserts into
  // whatever the store currently holds, so tests must start from a known one.
  act(() => {
    useMoleculeStore.setState({ molecule: emptyMolecule(), annotations: {}, past: [], future: [] });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(<PasteStructureDialog onClose={() => {}} />);
  });
}

function textarea(): HTMLTextAreaElement {
  return document.body.querySelector(".paste-dialog__textarea")!;
}

function addButton(): HTMLButtonElement {
  return [...document.body.querySelectorAll("button")].find((b) => b.className.includes("paste-dialog__add"))!;
}

describe("PasteStructureDialog", () => {
  test("SMILES is detected live and lands on the canvas on submit", async () => {
    await render();
    await act(async () => {
      typeInto(textarea(), "CCO");
    });
    expect(document.body.textContent).toMatch(/Detected: SMILES/i);
    expect(addButton().disabled).toBe(false);

    await act(async () => {
      addButton().click();
    });

    const molecule = useMoleculeStore.getState().molecule;
    expect(Object.keys(molecule.atoms)).toHaveLength(3); // skeletal ethanol: C, C, O
  });

  test("MOL text is detected as a MOL file and imports through importMol", async () => {
    await render();
    const molText = [
      "pasted",
      "  test",
      "",
      "  3  2  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "    2.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0",
      "  1  2  1  0  0  0  0",
      "  2  3  1  0  0  0  0",
      "M  END",
    ].join("\n");
    await act(async () => {
      typeInto(textarea(), molText);
    });
    expect(document.body.textContent).toMatch(/Detected: MOL file/i);

    await act(async () => {
      addButton().click();
    });
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(3);
  });

  test("garbage shows an inline error and keeps the dialog open", async () => {
    await render();
    await act(async () => {
      typeInto(textarea(), "C1CC"); // dangling ring closure — OCL rejects
    });
    // Detection still routes it to SMILES (charset-valid); the parse fails.
    expect(addButton().disabled).toBe(false);

    await act(async () => {
      addButton().click();
    });

    expect(document.body.querySelector(".paste-dialog__error")).toBeTruthy();
    // Nothing was imported, and the dialog (with the error in it) is still up.
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(0);
    expect(textarea()).toBeTruthy();
  });

  test("unrecognized content disables Add", async () => {
    await render();
    await act(async () => {
      typeInto(textarea(), "Hello world, just some prose.");
    });
    expect(document.body.textContent).toMatch(/Unrecognized content/i);
    expect(addButton().disabled).toBe(true);
  });

  test("the add button is disabled while the textarea is empty", async () => {
    await render();
    expect(addButton().disabled).toBe(true);
  });

  test("Ctrl+Enter submits without clicking", async () => {
    await render();
    await act(async () => {
      typeInto(textarea(), "CCO");
    });
    await act(async () => {
      const event = new window.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true });
      textarea().dispatchEvent(event);
    });
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(3);
  });

  test("pasting into a non-empty canvas merges next to what's drawn (undoable as one step)", async () => {
    // Pre-draw a single carbon, exactly what a user mid-sketch looks like.
    let existing = emptyMolecule();
    existing = addAtom(existing, "a0", { x: 100, y: 100 }, "C");
    act(() => {
      useMoleculeStore.setState({ molecule: existing, past: [], future: [] });
    });

    await render();
    await act(async () => {
      typeInto(textarea(), "CCO");
    });
    await act(async () => {
      addButton().click();
    });

    const state = useMoleculeStore.getState();
    expect(Object.keys(state.molecule.atoms)).toHaveLength(4); // 1 drawn + 3 pasted
    expect(state.past).toHaveLength(1); // one undoable step, not per-atom churn
  });

  test("Escape closes the dialog", async () => {
    let closed = false;
    await act(async () => {
      root.render(<PasteStructureDialog onClose={() => { closed = true; }} />);
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closed).toBe(true);
  });

  test("addAtom/addBond-built molecules still paste fine alongside (sanity for the merge path)", async () => {
    let existing = emptyMolecule();
    existing = addAtom(existing, "a0", { x: 0, y: 0 }, "C");
    existing = addAtom(existing, "a1", { x: 40, y: 0 }, "C");
    existing = addBond(existing, "b0", "a0", "a1");
    act(() => {
      useMoleculeStore.setState({ molecule: existing, past: [], future: [] });
    });

    await render();
    await act(async () => {
      typeInto(textarea(), "c1ccccc1"); // lowercase aromatic — the tokenizer path
    });
    await act(async () => {
      addButton().click();
    });
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(8); // 2 + 6
  });
});
