// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TemplatePalette } from "./TemplatePalette";
import { useMoleculeStore } from "../../store/useMoleculeStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useMoleculeStore.setState({ userTemplates: [], language: "en" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<Parameters<typeof TemplatePalette>[0]> = {}) {
  const onChooseStructure = vi.fn();
  act(() => {
    root.render(
      <TemplatePalette
        userTemplates={[]}
        onChooseStructure={onChooseStructure}
        onChooseUser={() => {}}
        onDeleteUser={() => {}}
        {...props}
      />,
    );
  });
  return { onChooseStructure };
}

function tab(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>(".template-palette__tab")]
    .find((b) => b.textContent === label);
  if (!button) throw new Error(`No tab named ${label}`);
  return button;
}

function clickTab(label: string) {
  act(() => tab(label).click());
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("TemplatePalette", () => {
  test("renders category tabs and the grouped All view", () => {
    render();
    const labels = [...container.querySelectorAll(".template-palette__tab")].map((b) => b.textContent);
    expect(labels).toContain("All");
    expect(labels).toContain("Amino acids");
    expect(labels).toContain("Carbohydrates");
    expect(labels).toContain("My templates");

    const text = container.textContent ?? "";
    expect(text).toContain("Alanine");
    expect(text).toContain("Sucrose");
    expect(text).toContain("Indole");
  });

  test("switching to a category tab shows only that category", () => {
    render();
    clickTab("Carbohydrates");
    const text = container.textContent ?? "";
    expect(text).toContain("D-Glucose (Fischer)");
    expect(text).toContain("Sucrose");
    expect(text).not.toContain("Alanine");
    // A single-category tab has no second group heading above its grid.
    expect(container.querySelectorAll(".template-palette__group-label")).toHaveLength(0);
  });

  test("search filters within the active tab", () => {
    render();
    const input = container.querySelector<HTMLInputElement>(".template-palette__search")!;
    type(input, "glucose");
    const text = container.textContent ?? "";
    expect(text).toContain("D-Glucose (Fischer)");
    expect(text).not.toContain("Sucrose");
    expect(text).not.toContain("Alanine");
  });

  test("shows a no-results message when nothing matches", () => {
    render();
    const input = container.querySelector<HTMLInputElement>(".template-palette__search")!;
    type(input, "not-a-real-structure");
    expect(container.textContent).toContain("No matching structures");
  });

  test("choosing a built-in template calls onChooseStructure with its id", () => {
    const { onChooseStructure } = render();
    const button = [...container.querySelectorAll<HTMLButtonElement>(".template-palette__item")]
      .find((b) => b.textContent === "Sucrose")!;
    act(() => button.click());
    expect(onChooseStructure).toHaveBeenCalledWith("sucrose");
  });

  test("My templates tab hosts the user template manager", () => {
    render();
    clickTab("My templates");
    const text = container.textContent ?? "";
    expect(text).toContain("No saved templates yet");
    expect(text).toContain("Import bookmarks");
    expect(container.querySelector(".template-palette__search")).toBeNull();
  });
});
