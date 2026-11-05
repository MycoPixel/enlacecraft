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
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          ctrlKey: modifiers.ctrl ?? false,
          metaKey: false,
          shiftKey: modifiers.shift ?? false,
        }),
      );
    });
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
    // The picture flavors: PNG bytes plus the SVG wrapped as a data-URI img.
    expect(new TextDecoder().decode(arg.png!)).toBe("png-bytes");
    expect(arg.html).toContain("data:image/svg+xml;base64,");
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
});
