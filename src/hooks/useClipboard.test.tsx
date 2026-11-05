// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseStructureText, CHEMICAL_MIME_TYPES_SUPPORTED, useClipboard } from "./useClipboard";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import type { Molecule } from "../types/chemistry";

/**
 * Paste-detection coverage for the plain-text sniffing path (the
 * security-sensitive part of clipboard paste: anything on the OS clipboard
 * is untrusted, and this function decides whether text becomes a structure).
 * The MIME-priority loop around it is thin wiring over these same parsers.
 */
describe("parseStructureText (clipboard paste detection)", () => {
  test("parses SMILES", () => {
    const mol = parseStructureText("CCO");
    expect(mol).not.toBeNull();
    expect(Object.keys(mol!.atoms)).toHaveLength(3);
  });

  test("a mixed 'SMILES name' line is deliberately NOT claimed by the sniffer", () => {
    // detectStructureText only claims lines made purely of SMILES-charset
    // characters; a "CCO ethanol" line stays unrecognized so ordinary text
    // never lands on the canvas as a structure. (The .smi file-import path
    // routes by extension and can use importSmiles's token-picking instead.)
    expect(parseStructureText("CC(=O)Oc1ccccc1C(=O)O aspirin")).toBeNull();
  });

  test("parses CDXML", () => {
    const cdxml = `<?xml version="1.0"?><CDXML><page><n id="1" p="1 1" Element="6"/></page></CDXML>`;
    const mol = parseStructureText(cdxml);
    expect(mol).not.toBeNull();
    expect(Object.keys(mol!.atoms)).toHaveLength(1);
  });

  test("parses a V2000 molfile", () => {
    const molfile = [
      "clip",
      "  EnlaceCraft",
      "",
      "  1  0  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      "M  END",
    ].join("\n");
    const mol = parseStructureText(molfile);
    expect(mol).not.toBeNull();
    expect(Object.keys(mol!.atoms)).toHaveLength(1);
  });

  test("rejects hostile/plain text without throwing", () => {
    expect(parseStructureText("")).toBeNull();
    expect(parseStructureText("hello, this is a sentence about plants")).toBeNull();
    expect(parseStructureText("<script>alert(1)</script>")).toBeNull();
    // Malformed molfile: detectStructureText says "mol", importMol throws → null.
    expect(parseStructureText("V2000\ngarbage")).toBeNull();
    // Malformed CDXML likewise.
    expect(parseStructureText("<CDXML><unclosed>")).toBeNull();
  });

  test("the chemistry MIME list matches the plan's paste-detection set", () => {
    expect(CHEMICAL_MIME_TYPES_SUPPORTED).toEqual([
      "chemical/x-cdxml",
      "chemical/x-mdl-molfile",
      "chemical/x-mdl-rxnfile",
      "image/svg+xml",
    ]);
  });
});

/**
 * Desktop copy-path coverage (the "nothing to paste outside the app"
 * report): Ctrl+C must put a picture AND editable chemistry on the OS
 * clipboard, and canvas Cut / the Edit menu's IPC commands must reach the
 * same logic. exportImage is mocked at the raster/SVG boundary because
 * jsdom has no real canvas rasterization; what's under test here is the
 * wiring, not the pixels.
 */
const richWrites: { text?: string; html?: string; png?: Uint8Array }[] = [];
const editCommandListeners = new Set<(command: string) => void>();
const nativeCommands: string[] = [];

vi.mock("../io/exportImage", () => ({
  exportSelectionPNGBlob: async () => new Blob(["png-bytes"], { type: "image/png" }),
  exportSelectionSVGString: () => `<svg><g data-atom-id="a1"/></svg>`,
  exportPNGBlob: async () => new Blob(["png-bytes"], { type: "image/png" }),
  serializeExportSVG: () => "<svg/>",
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function installDesktopBridge() {
  Object.defineProperty(window, "electron", {
    value: {
      writeClipboardRich: async (payload: { text?: string; html?: string; png?: Uint8Array }) => {
        richWrites.push(payload);
        return true;
      },
      writeClipboardText: async () => true,
      nativeEditCommand: async (command: string) => {
        nativeCommands.push(command);
        return true;
      },
      onEditCommand: (callback: (command: string) => void) => {
        editCommandListeners.add(callback);
        return () => editCommandListeners.delete(callback);
      },
    },
    configurable: true,
    writable: true,
  });
}

const originalElectron = (window as unknown as { electron?: unknown }).electron;

function twoAtomMolecule(): Molecule {
  let mol = emptyMolecule();
  mol = addAtom(mol, "a1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 40, y: 0 }, "O");
  mol = addBond(mol, "b1", "a1", "a2");
  return mol;
}

function Harness({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  useClipboard(svgRef);
  return null;
}

describe("useClipboard - desktop copy wiring", () => {
  let container: HTMLDivElement;
  let root: Root;
  let svg: SVGSVGElement;

  beforeEach(() => {
    richWrites.length = 0;
    nativeCommands.length = 0;
    editCommandListeners.clear();
    installDesktopBridge();
    container = document.createElement("div");
    document.body.appendChild(container);
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);
    const mol = twoAtomMolecule();
    act(() => {
      useMoleculeStore.setState({
        molecule: mol,
        selected: new Set(["a1", "a2"]),
        selectedAnnotationIds: new Set(),
      });
    });
    const svgRef = { current: svg };
    root = createRoot(container);
    act(() => {
      root.render(<Harness svgRef={svgRef} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    svg.remove();
    Object.defineProperty(window, "electron", { value: originalElectron, configurable: true, writable: true });
  });

  function pressKey(key: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}) {
    let event: KeyboardEvent;
    act(() => {
      event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true, // so preventDefault() marks the event and we can assert on it
        ctrlKey: modifiers.ctrl ?? false,
        metaKey: false,
        shiftKey: modifiers.shift ?? false,
      });
      window.dispatchEvent(event);
    });
    return event!;
  }

  test("Ctrl+C writes picture + editable chemistry together through the desktop bridge", async () => {
    pressKey("c", { ctrl: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(richWrites).toHaveLength(1);
    const arg = richWrites[0];
    // Editable chemistry in text/plain (CDXML for chemistry-aware targets).
    expect(arg.text).toContain("CDXML");
    // The picture flavors: PNG bytes plus the HTML flavor carrying the
    // raster as a data-URI img (the flavor Office reliably renders).
    expect(new TextDecoder().decode(arg.png!)).toBe("png-bytes");
    expect(arg.html).toContain(`data:image/png;base64,${btoa("png-bytes")}`);
  });

  test("canvas Ctrl+X cuts: the same rich copy goes out and the selection is deleted", async () => {
    pressKey("x", { ctrl: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(richWrites).toHaveLength(1);
    expect(useMoleculeStore.getState().selected.size).toBe(0);
    expect(Object.keys(useMoleculeStore.getState().molecule.atoms)).toHaveLength(0);
  });

  test("Ctrl+Shift+X stays with the clean-reaction command (no copy, no delete)", async () => {
    pressKey("x", { ctrl: true, shift: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(richWrites).toHaveLength(0);
    expect(useMoleculeStore.getState().selected.size).toBe(2);
  });

  test("the Edit menu's copy/cut/paste commands reach the same logic over IPC", async () => {
    act(() => {
      for (const listener of editCommandListeners) listener("copy");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(richWrites).toHaveLength(1);

    act(() => {
      for (const listener of editCommandListeners) listener("cut");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(richWrites).toHaveLength(2);
    expect(useMoleculeStore.getState().selected.size).toBe(0);
  });

  test("Ctrl+C in a text field forwards the native command instead of copying the canvas", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(nativeCommands).toEqual(["copy"]);
    expect(richWrites).toHaveLength(0);
    input.remove();
  });

  test("Ctrl+V in a text field forwards paste EXACTLY ONCE and suppresses Chromium's own binding", async () => {
    // Regression: the forwarded command and the renderer's built-in input
    // edit binding both ran, so pasting into the compound-search box
    // inserted the clipboard text twice in a row ("glucoseglucose").
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    let event: KeyboardEvent | undefined;
    act(() => {
      event = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(nativeCommands).toEqual(["paste"]);
    // The default (Chromium's native paste) is suppressed; the forwarded
    // command is the single source of action.
    expect(event!.defaultPrevented).toBe(true);
    input.remove();
  });

  test("Ctrl+X in a text field forwards cut once; Ctrl+Shift+X stays unforwarded", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const press = (shift: boolean) =>
      act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "x", ctrlKey: true, shiftKey: shift, bubbles: true, cancelable: true }));
      });
    press(false);
    press(true);
    expect(nativeCommands).toEqual(["cut"]);
    input.remove();
  });

  test("a text-only copy (caption annotation, no atoms) carries the annotation text as text/plain", async () => {
    // Regression: copying the word "glucose" as a canvas text annotation
    // put no text flavor on the clipboard at all — pasting into Word, a
    // text editor, or the app's own search box found nothing word-shaped.
    act(() => {
      useMoleculeStore.setState({
        selected: new Set(),
        selectedAnnotationIds: new Set(["t1"]),
        annotations: {
          t1: { id: "t1", kind: "text", x: 0, y: 0, width: 40, height: 12, html: "<b>glucose</b>", fontSize: 14 },
        },
      });
    });
    pressKey("c", { ctrl: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(richWrites).toHaveLength(1);
    expect(richWrites[0].text).toBe("glucose");
    // The picture flavors still ride along for visual targets.
    expect(richWrites[0].html).toContain("data:image/png;base64,");
  });

  test("a mixed copy (atoms + text annotation) keeps CDXML as the text flavor", async () => {
    act(() => {
      useMoleculeStore.setState({
        selected: new Set(["a1", "a2"]),
        selectedAnnotationIds: new Set(["t1"]),
        annotations: {
          t1: { id: "t1", kind: "text", x: 0, y: 0, width: 40, height: 12, html: "ethanol", fontSize: 14 },
        },
      });
    });
    pressKey("c", { ctrl: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(richWrites).toHaveLength(1);
    expect(richWrites[0].text).toContain("CDXML");
  });
});

/** The plain-browser half: with no desktop bridge, editable keydowns must be
 * left completely alone — the browser's own bindings run copy/paste exactly
 * once, and nothing may be forwarded or prevented. */
describe("useClipboard - browser editable keys (no bridge)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    richWrites.length = 0;
    nativeCommands.length = 0;
    editCommandListeners.clear();
    Object.defineProperty(window, "electron", { value: undefined, configurable: true, writable: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    const svgRef = { current: document.createElementNS("http://www.w3.org/2000/svg", "svg") };
    root = createRoot(container);
    act(() => {
      root.render(<Harness svgRef={svgRef} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, "electron", { value: originalElectron, configurable: true, writable: true });
  });

  test("Ctrl+V in a text field is neither forwarded nor prevented", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const event = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => {
      input.dispatchEvent(event);
    });
    expect(nativeCommands).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    input.remove();
  });
});
