// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useEmbedBridge } from "./useEmbedBridge";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { emptyMolecule } from "../model/molecule";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The pure command table is covered by io/embedBridge.test.ts. These tests
 * cover the wiring the host actually talks to: the ready announcement, the
 * origin gate, the reply envelope, and the two events — which used to fire
 * for redraws that changed nothing the host could see.
 */

const posted: Array<Record<string, unknown>> = [];

function Harness({ origins, enabled = true }: { origins: string[]; enabled?: boolean }) {
  useEmbedBridge({ current: null }, { enabled, origins });
  return null;
}

let container: HTMLDivElement;
let root: Root;

function mount(origins: string[] = [], enabled = true) {
  act(() => root.render(<Harness origins={origins} enabled={enabled} />));
  // `ready` is posted from a timer (never rAF: see the hook's comment).
  act(() => vi.advanceTimersByTime(1));
}

function send(op: string, args?: Record<string, unknown>, origin = "http://host.test") {
  const event = new MessageEvent("message", {
    data: { enlacecraft: 1, id: 7, op, args },
    origin,
    source: window,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function replies() {
  return posted.filter((m) => "id" in m);
}

beforeEach(() => {
  posted.length = 0;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(window, "postMessage").mockImplementation(((message: Record<string, unknown>) => {
    posted.push(message);
  }) as unknown as typeof window.postMessage);
  act(() => {
    useMoleculeStore.setState({
      molecule: emptyMolecule(),
      annotations: {},
      selected: new Set<string>(),
      embedReadOnly: false,
      language: "en",
    });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useEmbedBridge", () => {
  test("announces ready with the command list after mount", () => {
    mount();
    const ready = posted.find((m) => m.event === "ready");
    expect(ready).toBeDefined();
    expect(Array.isArray(ready?.ops)).toBe(true);
    expect(ready?.ops).toContain("set");
  });

  test("answers a command under the same id", async () => {
    mount();
    await send("version");
    expect(replies()).toEqual([
      { enlacecraft: 1, id: 7, ok: true, result: { name: "EnlaceCraft", version: expect.any(String) } },
    ]);
  });

  test("turns a failure into an error reply instead of throwing", async () => {
    mount();
    await send("nope");
    expect(replies()[0]).toEqual({ enlacecraft: 1, id: 7, ok: false, error: "Unknown command: nope" });
  });

  test("ignores a page the allowlist does not name", async () => {
    mount(["https://eln.example"]);
    await send("version", undefined, "https://evil.example");
    expect(replies()).toHaveLength(0);
    await send("version", undefined, "https://eln.example");
    expect(replies()).toHaveLength(1);
  });

  test("drops ready and commands while disabled", async () => {
    mount([], false);
    expect(posted).toHaveLength(0);
    await send("version");
    expect(replies()).toHaveLength(0);
  });

  test("posts one change event per edit, not per redraw", async () => {
    mount();
    posted.length = 0;
    act(() => {
      useMoleculeStore.setState({ molecule: { ...emptyMolecule(), atoms: {} } });
      vi.advanceTimersByTime(200);
    });
    expect(posted.filter((m) => m.event === "change")).toHaveLength(1);

    // An unrelated store field must not look like an edit.
    act(() => {
      useMoleculeStore.setState({ status: "still nothing" });
      vi.advanceTimersByTime(200);
    });
    expect(posted.filter((m) => m.event === "change")).toHaveLength(1);
  });

  test("only reports a selection change when the ids really differ", async () => {
    mount();
    posted.length = 0;

    act(() => {
      useMoleculeStore.setState({ selected: new Set<string>() });
    });
    expect(posted.filter((m) => m.event === "selection")).toHaveLength(0);

    act(() => {
      useMoleculeStore.setState({ selected: new Set(["a"]) });
    });
    expect(posted.filter((m) => m.event === "selection")).toHaveLength(1);

    // A fresh Set with the same contents is a redraw, not a new selection.
    act(() => {
      useMoleculeStore.setState({ selected: new Set(["a"]) });
    });
    expect(posted.filter((m) => m.event === "selection")).toHaveLength(1);
  });

  test("set replaces the document from a SMILES string", async () => {
    mount();
    await send("set", { text: "CCO", format: "smiles" });
    expect(replies()[0]).toMatchObject({ ok: true });
    const molecule = useMoleculeStore.getState().molecule;
    expect(Object.keys(molecule.atoms)).toHaveLength(3);
  });
});
