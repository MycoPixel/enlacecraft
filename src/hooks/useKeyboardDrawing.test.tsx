// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useKeyboardDrawing } from "./useKeyboardDrawing";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { addAtom, emptyMolecule } from "../model/molecule";
import { BOND_LEN } from "../model/constants";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const ref = useRef<SVGSVGElement>(null);
  useKeyboardDrawing(ref);
  return <svg ref={ref} />;
}

let container: HTMLDivElement;
let root: Root;

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

function resetStore() {
  act(() => {
    useMoleculeStore.setState({
      molecule: emptyMolecule(),
      selected: new Set(),
      selectedAnnotationIds: new Set(),
      hoverAtomId: null,
      hoverBondId: null,
      hoverPoint: null,
      keyboardDrawing: false,
      keyboardCursor: null,
      atomEditTarget: null,
      labelEditTarget: null,
      atomElement: "C",
      atomGroup: null,
      atomIsotope: null,
      atomReactiveSite: null,
      status: "status.ready",
      view: { scale: 1, tx: 0, ty: 0 },
      canvasSize: { width: 800, height: 600 },
    });
  });
}

beforeEach(() => {
  resetStore();
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

describe("useKeyboardDrawing", () => {
  test("Ctrl/Cmd+Shift+K turns the mode on and seeds the cursor at the view centre", () => {
    press("K", { ctrlKey: true, shiftKey: true });
    const state = useMoleculeStore.getState();
    expect(state.keyboardDrawing).toBe(true);
    expect(state.keyboardCursor).toEqual({ x: 400, y: 300 });
  });

  test("arrow keys move the cursor by one bond length", () => {
    act(() => useMoleculeStore.getState().setKeyboardDrawing(true));
    press("ArrowRight");
    expect(useMoleculeStore.getState().keyboardCursor).toEqual({ x: 400 + BOND_LEN, y: 300 });
    press("ArrowLeft", { shiftKey: true });
    expect(useMoleculeStore.getState().keyboardCursor).toEqual({ x: 400 + BOND_LEN - 24, y: 300 });
  });

  test("Enter places an atom, then a bonded atom in one undo step", () => {
    act(() => useMoleculeStore.getState().setKeyboardDrawing(true));
    press("Enter");
    let state = useMoleculeStore.getState();
    expect(Object.keys(state.molecule.atoms)).toHaveLength(1);
    expect(Object.keys(state.molecule.bonds)).toHaveLength(0);

    press("ArrowRight");
    press("Enter");
    state = useMoleculeStore.getState();
    expect(Object.keys(state.molecule.atoms)).toHaveLength(2);
    expect(Object.keys(state.molecule.bonds)).toHaveLength(1);
    expect(state.selected.size).toBe(1);

    act(() => state.undo());
    state = useMoleculeStore.getState();
    expect(Object.keys(state.molecule.atoms)).toHaveLength(1);
    expect(Object.keys(state.molecule.bonds)).toHaveLength(0);
  });

  test("Enter over an existing atom selects it instead of stacking a second atom", () => {
    act(() => {
      useMoleculeStore.setState({ molecule: addAtom(emptyMolecule(), "a1", { x: 400, y: 300 }, "O") });
    });
    act(() => useMoleculeStore.getState().setKeyboardDrawing(true));
    press("Enter");
    const state = useMoleculeStore.getState();
    expect(Object.keys(state.molecule.atoms)).toHaveLength(1);
    expect(state.selected.has("a1")).toBe(true);
  });

  test("Escape clears the selection first, then leaves the mode", () => {
    act(() => {
      useMoleculeStore.setState({
        molecule: addAtom(emptyMolecule(), "a1", { x: 400, y: 300 }, "C"),
        selected: new Set(["a1"]),
      });
    });
    act(() => useMoleculeStore.getState().setKeyboardDrawing(true));

    press("Escape");
    expect(useMoleculeStore.getState().selected.size).toBe(0);
    expect(useMoleculeStore.getState().keyboardDrawing).toBe(true);

    press("Escape");
    expect(useMoleculeStore.getState().keyboardDrawing).toBe(false);
  });

  test("key presses in an input are left alone", () => {
    act(() => useMoleculeStore.getState().setKeyboardDrawing(true));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(useMoleculeStore.getState().keyboardCursor).toEqual({ x: 400, y: 300 });
  });
});
