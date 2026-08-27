import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { addAtom, addBond, emptyMolecule } from "../model/molecule";
import { lookupIupacName } from "./iupacLookup";

/**
 * lookupIupacName's own logic (retry/fallback ordering, stereoOmitted /
 * localFallback flagging) is what's under test here — not PubChem or
 * the local fallback service themselves, both of which are network
 * calls. Each test stubs global fetch directly rather than mocking
 * io/pubchem.ts or io/iupacFallback.ts, so a request's URL is checked
 * to decide which service it's "hitting" (PubChem's pug endpoint vs.
 * localhost:8002), the same way the two real services are actually
 * distinguished over the wire.
 */

// A single carbon bonded to one fluorine -- exportSmiles(fragment) for
// this is "CF" (see io/smiles.ts), matching what the app would send
// for something like fluoromethane. The exact structure doesn't matter
// to these tests beyond being non-empty and stereo-free.
function fluoromethane() {
  let mol = emptyMolecule();
  mol = addAtom(mol, "c1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "f1", { x: 40, y: 0 }, "F");
  mol = addBond(mol, "b1", "c1", "f1");
  return { molecule: mol, ids: ["c1", "f1"] };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const pubchemNotFound = () => new Response("", { status: 404 });
const pubchemNamed = (name: string) => jsonResponse({ PropertyTable: { Properties: [{ IUPACName: name }] } });
const localNamed = (smiles: string, name: string) => jsonResponse({ smiles, name });
const localNotFound = () => new Response("", { status: 404 });

describe("lookupIupacName", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns PubChem's name directly when PubChem has it, without touching the local fallback", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("pubchem")) return Promise.resolve(pubchemNamed("fluoromethane"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    const { molecule, ids } = fluoromethane();
    const result = await lookupIupacName(molecule, ids, "en");

    expect(result).toEqual({ english: "fluoromethane", spanish: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("falls back to the local service, flagged, when PubChem has no name for the structure", async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("pubchem")) return Promise.resolve(pubchemNotFound());
      if (u.includes("localhost:8002")) return Promise.resolve(localNamed("CF", "1-fluoro-methane"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    const { molecule, ids } = fluoromethane();
    const result = await lookupIupacName(molecule, ids, "en");

    expect(result).toEqual({ english: "1-fluoro-methane", spanish: undefined, localFallback: true });
  });

  test("rethrows PubChem's original error when the local fallback is also unavailable", async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("pubchem")) return Promise.resolve(pubchemNotFound());
      if (u.includes("localhost:8002")) return Promise.reject(new Error("connection refused"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    const { molecule, ids } = fluoromethane();

    await expect(lookupIupacName(molecule, ids, "en")).rejects.toMatchObject({ name: "PubChemError", code: "NOT_FOUND" });
  });

  test("rethrows PubChem's original error when the local fallback is reachable but also can't verify a name", async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("pubchem")) return Promise.resolve(pubchemNotFound());
      if (u.includes("localhost:8002")) return Promise.resolve(localNotFound());
      throw new Error(`unexpected fetch to ${url}`);
    });

    const { molecule, ids } = fluoromethane();

    await expect(lookupIupacName(molecule, ids, "en")).rejects.toMatchObject({ name: "PubChemError", code: "NOT_FOUND" });
  });

  test("does not use the local fallback for a transient PubChem network error", async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("pubchem")) return Promise.reject(new Error("offline"));
      throw new Error(`unexpected fetch to ${url}`);
    });

    const { molecule, ids } = fluoromethane();

    await expect(lookupIupacName(molecule, ids, "en")).rejects.toMatchObject({ name: "PubChemError", code: "NETWORK" });
    // Only the one PubChem attempt -- confirms the local fallback was
    // never even attempted for a non-"unresolved" failure.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
