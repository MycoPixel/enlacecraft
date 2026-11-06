// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ExportMenu } from "./ExportMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

const baseProps = {
  onPNG: noop,
  onSVG: noop,
  onPageSetup: noop,
  onPDF: noop,
  onPrint: noop,
  onMOL: noop,
  onSDF: noop,
  onSDFWithProperties: noop,
  onRXN: noop,
  onReactionSmiles: noop,
  onCDXML: noop,
  onSmiles: noop,
  onCopyAs: noop,
  copyAsDisabled: false,
  fitExportsToPage: false,
  onToggleFitExportsToPage: noop,
  onSaveProject: noop,
  onSaveProjectAs: noop,
  onCopyShareLink: noop,
  onOpenShareLink: noop,
  onCopyEmbedCode: noop,
  onExportHtmlViewer: noop,
  reactionExportDisabled: false,
  projectFileName: null,
};

let container: HTMLDivElement;
let root: Root;

async function openMenu() {
  const trigger = container.querySelector("button");
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function dropdown(): HTMLDivElement {
  const el = document.body.querySelector<HTMLDivElement>(".export-dropdown");
  if (!el) throw new Error("export dropdown is not open");
  return el;
}

function itemButtons(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>(".export-dropdown__item")];
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMoleculeStore.setState({ language: "en" });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("ExportMenu dropdown", () => {
  test("every entry is reachable: the menu is height-capped and scrollable", async () => {
    await act(async () => {
      root.render(<ExportMenu {...baseProps} />);
    });
    await openMenu();

    const el = dropdown();
    // jsdom's window.innerHeight is 768 and the (zero-sized) trigger button
    // sits at 0, so the cap is 768 - 12 = 756. The matching `overflow-y:
    // auto` lives in the stylesheet — the inline cap is what the CSS
    // fallback can't know: where the button actually sits.
    expect(el.style.maxHeight).toBe("756px");
  });

  test("the cap follows the space actually available below the button", async () => {
    await act(async () => {
      root.render(<ExportMenu {...baseProps} />);
    });
    await openMenu();
    expect(dropdown().style.maxHeight).toBe("756px");

    // Shrinking the window re-caps the menu via the resize reposition.
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(dropdown().style.maxHeight).toBe("388px");
  });

  test("a pathologically short window keeps a usable, scrollable floor", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 100 });
    await act(async () => {
      root.render(<ExportMenu {...baseProps} />);
    });
    await openMenu();
    // max(120, 100 - 12) — the menu scrolls rather than collapsing to nothing.
    expect(dropdown().style.maxHeight).toBe("120px");
  });

  test("all 25 entries render, including the ones that used to run off-screen", async () => {
    await act(async () => {
      root.render(<ExportMenu {...baseProps} />);
    });
    await openMenu();

    const items = itemButtons();
    expect(items).toHaveLength(25);
    // The tail of the menu — the entries furthest from the export button and
    // therefore the ones a short window used to make unreachable.
    const labels = items.map((b) => b.textContent);
    expect(labels).toContain("Export SDF with properties");
    expect(labels).toContain("Copy as SMILES");
    expect(labels[labels.length - 1]).toBe("Copy reaction SMILES");
  });
});
