// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CompoundSearch } from "./CompoundSearch";
import { emptyMolecule } from "../../model/molecule";
import { useMoleculeStore } from "../../store/useMoleculeStore";

/**
 * Tests the name-search fallback wiring in CompoundSearch: when PubChem
 * has no compound for a name (its NOT_FOUND path), the optional local
 * OPSIN service (io/iupacFallback.ts) gets a chance to resolve it before
 * the error is shown. Like iupacLookup.test.ts, global fetch is stubbed
 * and requests are routed by URL — PubChem's pug host vs localhost:8002 —
 * so the real io modules run unmocked. importSmiles is real too: "CCO" is
 * cheap for OpenChemLib and the point is that the fallback's molecule
 * lands on the canvas exactly like a PubChem hit does.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const QUERY = "unobtainium"; // auto-detects as a name; PubChem will "not find" it

let container: HTMLDivElement;
let root: Root;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    return handler(url);
  }));
  return urls;
}

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function typeQuery(text: string) {
  const input = container.querySelector<HTMLInputElement>("input")!;
  expect(input).toBeTruthy();
  await act(async () => {
    // React 19 controlled input: set the value through the native setter
    // so the input event is seen as a real user edit.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = container.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<CompoundSearch />));
  useMoleculeStore.setState({
    molecule: emptyMolecule(),
    selected: new Set(),
    language: "en",
    status: "status.ready",
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CompoundSearch name → structure fallback", () => {
  test("loads the OPSIN fallback's structure like a PubChem hit when PubChem doesn't know the name", async () => {
    const urls = mockFetch((url) => {
      if (url.includes("localhost:8002")) return jsonResponse({ smiles: "CCO" });
      return new Response("", { status: 404 }); // every PubChem endpoint: not found
    });

    await typeQuery(QUERY);
    await submit();

    const state = useMoleculeStore.getState();
    // Ethanol's 3 heavy atoms landed on the canvas through the same
    // importCompound path a PubChem result uses.
    expect(Object.keys(state.molecule.atoms).length).toBe(3);
    expect(state.status).toContain("unobtainium");
    expect(state.status).toContain("OPSIN");
    // The query cleared and no error is shown, exactly like a PubChem hit.
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("");
    expect(container.querySelector(".compound-search__error")).toBeNull();
    // The local fallback was actually consulted (after PubChem's 404).
    expect(urls.some((u) => u.includes("localhost:8002/name-to-structure"))).toBe(true);
  });

  test("keeps PubChem's not-found error when the local service also can't resolve the name", async () => {
    mockFetch(() => new Response("", { status: 404 })); // PubChem and localhost:8002 both 404

    await typeQuery(QUERY);
    await submit();

    const state = useMoleculeStore.getState();
    expect(Object.keys(state.molecule.atoms).length).toBe(0);
    expect(state.status).toBe("status.ready");
    const error = container.querySelector(".compound-search__error");
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain("No compound found named");
    expect(error!.textContent).toContain(QUERY);
  });

  test("does not consult the local fallback for a PubChem network failure", async () => {
    const urls = mockFetch((url) => {
      if (url.includes("pubchem")) throw new Error("offline");
      throw new Error(`unexpected fetch to ${url}`);
    });

    await typeQuery(QUERY);
    await submit();

    const state = useMoleculeStore.getState();
    expect(Object.keys(state.molecule.atoms).length).toBe(0);
    const error = container.querySelector(".compound-search__error");
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain("Couldn't reach PubChem");
    // A network error says nothing about whether the name is resolvable,
    // so the local fallback must never be attempted.
    expect(urls.every((u) => !u.includes("localhost:8002"))).toBe(true);
  });
});
