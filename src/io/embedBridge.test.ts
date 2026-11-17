import { describe, expect, it, vi } from "vitest";
import {
  EMBED_OPS,
  embedOriginAllowed,
  exportEmbedDocument,
  isEmbedRequest,
  runEmbedCommand,
  type EmbedHost,
} from "./embedBridge";
import { emptyMolecule } from "../model/molecule";
import { defaultPageSetup } from "../model/pageSetup";
import type { Atom, Molecule } from "../types/chemistry";

function atom(id: string, element: Atom["element"], x: number): Atom {
  return { id, x, y: 0, element, charge: 0 } as Atom;
}

function ethane(): Molecule {
  const mol = emptyMolecule();
  mol.atoms.a = atom("a", "C", 0);
  mol.atoms.b = atom("b", "C", 42);
  mol.bonds.ab = { id: "ab", a1: "a", a2: "b", order: 1, stereo: "none", doubleSide: "auto" };
  return mol;
}

function fakeHost(overrides: Partial<EmbedHost> = {}): EmbedHost {
  const molecule = ethane();
  return {
    documentJson: () => '{"version":2,"activeTabId":"t","tabs":[]}',
    molecule: () => molecule,
    annotations: () => [],
    page: () => defaultPageSetup(),
    selection: () => ["a"],
    replace: vi.fn(),
    svg: () => "<svg/>",
    png: vi.fn(async () => "iVBORw0KGgo="),
    setTheme: vi.fn(),
    getTheme: () => "light",
    setReadOnly: vi.fn(),
    isSaved: () => true,
    markSaved: vi.fn(),
    version: () => "1.18.0",
    ...overrides,
  };
}

describe("exportEmbedDocument", () => {
  it("returns the project JSON under `json`", () => {
    expect(exportEmbedDocument("json", fakeHost()).json).toContain('"version":2');
  });

  it("returns SVG markup under `svg`", () => {
    expect(exportEmbedDocument("svg", fakeHost()).svg).toBe("<svg/>");
  });

  it("exports SMILES, MOL and CDXML for a real drawing", () => {
    const host = fakeHost();
    expect(exportEmbedDocument("smiles", host).smiles.length).toBeGreaterThan(0);
    expect(exportEmbedDocument("mol", host).mol).toContain("M  END");
    expect(exportEmbedDocument("cdxml", host).cdxml).toContain("<CDXML");
  });

  it("calls an empty sheet an empty sheet, in the wording hosts match on", () => {
    const host = fakeHost({ molecule: () => emptyMolecule() });
    expect(() => exportEmbedDocument("smiles", host)).toThrow(/sheet is empty/i);
    expect(() => exportEmbedDocument("mol", host)).toThrow(/sheet is empty/i);
  });

  it("refuses RXN when there is no reaction scheme", () => {
    expect(() => exportEmbedDocument("rxn", fakeHost())).toThrow(/no reaction scheme/i);
  });
});

describe("runEmbedCommand", () => {
  it("passes `set` through with its format", async () => {
    const host = fakeHost();
    await runEmbedCommand("set", { text: "CCO", format: "smiles" }, host);
    expect(host.replace).toHaveBeenCalledWith("CCO", "smiles");
  });

  it("rejects non-string set payloads", async () => {
    await expect(runEmbedCommand("set", { text: 42 }, fakeHost())).rejects.toThrow(/text must be a string/);
  });

  it("maps the ONLYOFFICE gray theme onto the closest built-in look", async () => {
    const host = fakeHost();
    await expect(runEmbedCommand("uiTheme", { theme: "gray" }, host)).resolves.toEqual({ theme: "gray" });
    expect(host.setTheme).toHaveBeenCalledWith("slate");
  });

  it("clamps picture scale to a sane range", async () => {
    const host = fakeHost();
    await runEmbedCommand("picture", { scale: 99 }, host);
    expect(host.png).toHaveBeenCalledWith(8);
  });

  it("turns read-only on and off", async () => {
    const host = fakeHost();
    await runEmbedCommand("readOnly", { on: true }, host);
    expect(host.setReadOnly).toHaveBeenCalledWith(true);
  });

  it("reports selection with a SMILES for the selected fragment", async () => {
    const result = (await runEmbedCommand("selection", {}, fakeHost())) as { atomIds: string[]; smiles?: string };
    expect(result.atomIds).toEqual(["a"]);
    expect(result.smiles).toBeDefined();
  });

  it("answers help with the protocol's operations", async () => {
    await expect(runEmbedCommand("help", {}, fakeHost())).resolves.toEqual({ ops: [...EMBED_OPS] });
  });

  it("rejects unknown commands instead of silently succeeding", async () => {
    await expect(runEmbedCommand("nope", {}, fakeHost())).rejects.toThrow(/Unknown command/);
  });
});

describe("protocol guards", () => {
  it("recognises only complete requests", () => {
    expect(isEmbedRequest({ enlacecraft: 1, id: 3, op: "set" })).toBe(true);
    expect(isEmbedRequest({ enlacecraft: 1, id: "3", op: "set" })).toBe(false);
    expect(isEmbedRequest({ enlacecraft: 2, id: 3, op: "set" })).toBe(false);
    expect(isEmbedRequest(null)).toBe(false);
  });

  it("answers everyone when no allowlist is configured, nobody else otherwise", () => {
    expect(embedOriginAllowed([], "https://evil.example")).toBe(true);
    expect(embedOriginAllowed(["https://eln.example"], "https://eln.example")).toBe(true);
    expect(embedOriginAllowed(["https://eln.example"], "https://evil.example")).toBe(false);
  });
});
