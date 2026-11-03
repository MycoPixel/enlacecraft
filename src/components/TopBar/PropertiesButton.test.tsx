// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../../model/molecule";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import type { Molecule } from "../../types/chemistry";
import { PropertiesButton } from "./PropertiesButton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function seed(mol: Molecule) {
  useMoleculeStore.setState({ molecule: mol, selected: new Set(), language: "en" });
}

function ethaneAndWater(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "c2", { x: 42, y: 0 }, "C");
  mol = addBond(mol, "cc", "c1", "c2", 1, "none");
  mol = addAtom(mol, "o", { x: 300, y: 0 }, "O");
  return mol;
}

function ethane(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "c2", { x: 42, y: 0 }, "C");
  return addBond(mol, "cc", "c1", "c2", 1, "none");
}

async function openPanel() {
  const trigger = container.querySelector("button");
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function actionButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>(".properties-panel__action")].find((b) =>
    b.textContent?.includes(label),
  );
  if (!button) throw new Error(`No properties action labelled ${label}`);
  return button;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PropertiesButton", () => {
  test("shows one table row per connected structure", async () => {
    seed(ethaneAndWater());
    act(() => root.render(<PropertiesButton />));
    await openPanel();

    const table = document.querySelector(".properties-table");
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table!.textContent).toContain("C2H6");
    expect(table!.textContent).toContain("H2O");
    expect(table!.textContent).toContain("Formula");
    expect(table!.textContent).toContain("SMILES");
  });

  test("Copy CSV writes the same visible table", async () => {
    seed(ethaneAndWater());
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    act(() => root.render(<PropertiesButton />));
    await openPanel();
    await act(async () => {
      actionButton("Copy CSV").click();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const csv = String(writeText.mock.calls[0][0]);
    expect(csv.startsWith("#,Formula,MW (g/mol)")).toBe(true);
    expect(csv).toContain("1,C2H6,30.07");
    expect(csv).toContain("2,H2O,18.02");
  });

  test("PubChem enrichment adds CID, name and InChIKey columns", async () => {
    seed(ethane());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            PropertyTable: {
              Properties: [{ CID: 6324, IUPACName: "ethane", InChIKey: "OTMSDBZUPAUEDD-UHFFFAOYSA-N" }],
            },
          }),
          { status: 200 },
        ),
      ),
    );

    act(() => root.render(<PropertiesButton />));
    await openPanel();
    expect(document.querySelector(".properties-table")!.textContent).not.toContain("CID");

    await act(async () => {
      actionButton("Look up on PubChem").click();
    });
    await flush();

    const table = document.querySelector(".properties-table")!;
    expect(table.textContent).toContain("CID");
    expect(table.textContent).toContain("6324");
    expect(table.textContent).toContain("ethane");
    expect(table.textContent).toContain("OTMSDBZUPAUEDD-UHFFFAOYSA-N");
    expect(document.querySelector(".properties-panel__status")?.textContent).toContain(
      "Found identifiers for 1 of 1 structures",
    );
  });
});
