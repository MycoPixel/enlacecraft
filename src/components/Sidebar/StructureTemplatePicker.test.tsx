// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { StructureTemplatePicker } from "./StructureTemplatePicker";

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

function render() {
  act(() => {
    root.render(<StructureTemplatePicker onChoose={() => {}} />);
  });
}

/** Sets a controlled input's value the way a real keystroke would, going
 * through the native setter so React's value tracker notices the change. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function searchInput() {
  return container.querySelector<HTMLInputElement>(".structure-picker__search")!;
}

describe("StructureTemplatePicker", () => {
  test("lists every category heading and template", () => {
    render();
    const text = container.textContent ?? "";
    expect(text).toContain("Amino acids");
    expect(text).toContain("Carbohydrates");
    expect(text).toContain("Fused heteroaromatics");
    expect(text).toContain("Alanine");
    expect(text).toContain("Sucrose");
    expect(text).toContain("Indole");
  });

  test("filters templates by label and hides empty categories", () => {
    render();
    type(searchInput(), "glucose");
    const text = container.textContent ?? "";
    expect(text).toContain("D-Glucose (Fischer)");
    expect(text).toContain("L-Glucose (Fischer)");
    expect(text).toContain("D-Glucose (Haworth Pyranose)");
    expect(text).not.toContain("Alanine");
    expect(text).not.toContain("Amino acids");
    expect(text).not.toContain("Sucrose");
  });

  test("shows a no-results message when nothing matches", () => {
    render();
    type(searchInput(), "not-a-real-structure");
    expect(container.textContent).toContain("No matching structures");
  });

  test("clearing the query restores the full list", () => {
    render();
    type(searchInput(), "glucose");
    type(searchInput(), "");
    const text = container.textContent ?? "";
    expect(text).toContain("Alanine");
    expect(text).toContain("Sucrose");
  });
});
