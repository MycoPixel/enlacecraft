// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore, type SavedTab } from "./useMoleculeStore";
import { emptyMolecule } from "../model/molecule";
import { defaultPageSetup } from "../model/pageSetup";
import type { PageSetup, ViewTransform } from "../types/chemistry";

/**
 * Page setup belongs to a tab, not to a molecule: two drawings open side by
 * side can be laid out on different paper, and switching between them must
 * carry each one's page along. These tests pin the store transitions that
 * move the page between the active tab's top-level field and the inactive
 * tabs' TabDocument copies.
 */

const VIEW: ViewTransform = { scale: 1, tx: 0, ty: 0 };

const PAGE_A: PageSetup = { x: 0, y: 0, width: 595.28, height: 841.89, bondLength: 30, marginWidth: 2 };
const PAGE_B: PageSetup = { x: 0, y: 0, width: 841.89, height: 595.28, bondLength: 36, marginWidth: 4 };

function savedTab(id: string, page?: PageSetup): SavedTab {
  return {
    id,
    title: id,
    molecule: emptyMolecule(),
    annotations: {},
    view: VIEW,
    ...(page ? { page } : {}),
  };
}

function resetStore(): void {
  useMoleculeStore.setState({
    molecule: emptyMolecule(),
    annotations: {},
    view: VIEW,
    page: defaultPageSetup(),
    past: [],
    future: [],
    selected: new Set<string>(),
    activeTabId: "tab-1",
    tabs: [{ id: "tab-1", title: "tab-1" }],
    tabDocuments: {},
    hasUnsavedChanges: false,
  });
}

beforeEach(resetStore);

describe("page setup across tabs", () => {
  test("loadProject installs each tab's own page", () => {
    useMoleculeStore.getState().loadProject({
      activeTabId: "tab-1",
      tabs: [savedTab("tab-1", PAGE_A), savedTab("tab-2", PAGE_B)],
    });

    const state = useMoleculeStore.getState();
    expect(state.page).toEqual(PAGE_A);
    expect(state.tabDocuments["tab-2"].page).toEqual(PAGE_B);
  });

  test("switching tabs carries the page with the drawing", () => {
    const store = useMoleculeStore.getState();
    store.loadProject({
      activeTabId: "tab-1",
      tabs: [savedTab("tab-1", PAGE_A), savedTab("tab-2", PAGE_B)],
    });

    store.switchToTab("tab-2");
    expect(useMoleculeStore.getState().page).toEqual(PAGE_B);

    useMoleculeStore.getState().switchToTab("tab-1");
    expect(useMoleculeStore.getState().page).toEqual(PAGE_A);
  });

  test("a tab saved before page setup existed gets the default page", () => {
    useMoleculeStore.getState().loadProject({
      activeTabId: "tab-1",
      tabs: [savedTab("tab-1"), savedTab("tab-2")],
    });

    const state = useMoleculeStore.getState();
    expect(state.page).toEqual(defaultPageSetup());
    expect(state.tabDocuments["tab-2"].page).toEqual(defaultPageSetup());
  });

  test("getAllTabsForSave emits a page for every tab", () => {
    useMoleculeStore.getState().loadProject({
      activeTabId: "tab-1",
      tabs: [savedTab("tab-1", PAGE_A), savedTab("tab-2", PAGE_B), savedTab("tab-3")],
    });

    const tabs = useMoleculeStore.getState().getAllTabsForSave();
    expect(tabs.find((t) => t.id === "tab-1")?.page).toEqual(PAGE_A);
    expect(tabs.find((t) => t.id === "tab-2")?.page).toEqual(PAGE_B);
    expect(tabs.find((t) => t.id === "tab-3")?.page).toEqual(defaultPageSetup());
  });
});
