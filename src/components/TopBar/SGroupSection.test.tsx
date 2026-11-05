// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../../model/molecule";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import type { Molecule } from "../../types/chemistry";
import { SGroupSection } from "./MoleculeInfoButton";

/**
 * The info panel's editable S-group section: it lists each ChemDraw polymer/
 * mixture group, lets the person change its type/repeat/label, extend or
 * shrink it from the current selection, and delete it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function chain(): Molecule {
  let mol = addAtom(emptyMolecule(), "a", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "b", { x: 60, y: 0 }, "C");
  mol = addAtom(mol, "c", { x: 120, y: 0 }, "C");
  mol = addBond(mol, "ab", "a", "b");
  mol = addBond(mol, "bc", "b", "c");
  return mol;
}

beforeEach(() => {
  useMoleculeStore.setState({
    molecule: chain(),
    annotations: {},
    selected: new Set<string>(),
    selectedAnnotationIds: new Set<string>(),
    past: [],
    future: [],
    language: "en",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const state = () => useMoleculeStore.getState();
const text = () => container.textContent ?? "";

function render(mol: Molecule = state().molecule) {
  act(() => root.render(<SGroupSection molecule={mol} />));
}

function byTitle(title: string): HTMLButtonElement | null {
  return container.querySelector(`button[title="${title}"]`);
}

/** React's value tracker swallows a plain `input.value = ...`, so go through
 * the native setter the same way TemplatePalette.test.tsx does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("SGroupSection", () => {
  test("renders nothing when the drawing has no S-groups", () => {
    render();
    expect(text()).toBe("");
  });

  test("lists each group with its type and atom count", () => {
    state().createSGroup(["a", "b"], "SRU");
    render();

    expect(text()).toContain("S-groups");
    expect(text()).toContain("Group 1");
    expect(text()).toContain("SRU");
    expect(text()).toContain("2 atoms");
  });

  test("clicking a group selects its atoms and brackets", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    const bracketIds = state().molecule.sgroups?.[id].bracketAnnotationIds ?? [];
    state().setSelected(new Set<string>());
    state().setSelectedAnnotationIds(new Set<string>());
    render();

    act(() => container.querySelector<HTMLButtonElement>(".molecule-info__sgroup-head")!.click());

    expect([...state().selected].sort()).toEqual(["a", "b"]);
    expect(new Set(state().selectedAnnotationIds)).toEqual(new Set(bracketIds));
  });

  test("changing the type updates the group", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    render();

    const select = container.querySelector("select")!;
    act(() => {
      select.value = "COP";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(state().molecule.sgroups?.[id].type).toBe("COP");
  });

  test("editing the repeat count commits on blur", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    render();

    const input = container.querySelectorAll("input")[0];
    type(input, "m");
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

    expect(state().molecule.sgroups?.[id].subscript).toBe("m");
  });

  test("editing the label commits on blur", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    render();

    const input = container.querySelectorAll("input")[1];
    type(input, "block");
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

    expect(state().molecule.sgroups?.[id].label).toBe("block");
  });

  test("adds and removes the current selection", () => {
    const id = state().createSGroup(["a", "b"], "SRU")!;
    state().setSelected(new Set(["c"]));
    render();

    act(() => byTitle("Add current selection")!.click());
    expect(state().molecule.sgroups?.[id].atomIds).toEqual(["a", "b", "c"]);

    render();
    state().setSelected(new Set(["b"]));
    act(() => byTitle("Remove current selection")!.click());
    expect(state().molecule.sgroups?.[id].atomIds).toEqual(["a", "c"]);
  });

  test("deletes the group", () => {
    state().createSGroup(["a", "b"], "SRU");
    render();

    act(() => byTitle("Delete group")!.click());
    expect(state().molecule.sgroups).toBeUndefined();
  });
});
