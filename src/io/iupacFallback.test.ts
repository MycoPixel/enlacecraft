import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchNameToStructureLocal } from "./iupacFallback";

/**
 * fetchNameToStructureLocal's own fail-soft contract is what's under
 * test here — not the local fallback service itself, which is a network
 * call. Like iupacLookup.test.ts, each test stubs global fetch directly
 * rather than mocking any io module, so a request's URL is checked to
 * decide which service it's "hitting". importSmiles is deliberately
 * *real* ("CCO" and "zzz" are cheap for OpenChemLib either way) so the
 * "parses the SMILES it got back" half of the contract is exercised
 * end-to-end, the same way the real client would run it.
 */

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }));
  return calls;
}

const localOk = (smiles: string) =>
  new Response(JSON.stringify({ smiles }), { status: 200, headers: { "Content-Type": "application/json" } });
const localNotFound = () => new Response("", { status: 404 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchNameToStructureLocal", () => {
  test("parses the returned SMILES into a molecule on success", async () => {
    const calls = mockFetch(() => localOk("CCO"));

    const molecule = await fetchNameToStructureLocal("ethanol");

    expect(molecule).not.toBeNull();
    expect(Object.keys(molecule!.atoms).length).toBe(3); // C-C-O, no explicit Hs to strip
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:8002/name-to-structure");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(JSON.stringify({ name: "ethanol" }));
  });

  test("returns null on the server's 404 (name OPSIN couldn't parse)", async () => {
    mockFetch(() => localNotFound());

    const molecule = await fetchNameToStructureLocal("unobtainium");

    expect(molecule).toBeNull();
  });

  test("returns null when the service isn't running (network failure)", async () => {
    mockFetch(() => {
      throw new Error("connection refused");
    });

    const molecule = await fetchNameToStructureLocal("ethanol");

    expect(molecule).toBeNull();
  });

  test("returns null when the response carries no usable SMILES", async () => {
    mockFetch((url) =>
      String(url).includes("localhost:8002")
        ? new Response(JSON.stringify({}), { status: 200 })
        : new Response("", { status: 404 }),
    );

    const molecule = await fetchNameToStructureLocal("ethanol");

    expect(molecule).toBeNull();
  });

  test("returns null when the returned SMILES doesn't survive import", async () => {
    mockFetch(() => localOk("zzz")); // "z" is not an element symbol

    const molecule = await fetchNameToStructureLocal("ethanol");

    expect(molecule).toBeNull();
  });

  test("returns null for an empty name without calling the service", async () => {
    const calls = mockFetch(() => localOk("CCO"));

    expect(await fetchNameToStructureLocal("   ")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("returns null for an over-cap name without calling the service", async () => {
    const calls = mockFetch(() => localOk("CCO"));

    // Matches the server's MAX_NAME_CHARS cap (naming.py): 513 is one too many.
    expect(await fetchNameToStructureLocal("a".repeat(513))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("trims the name before sending it", async () => {
    const calls = mockFetch(() => localOk("CCO"));

    await fetchNameToStructureLocal("  ethanol  ");

    expect(calls[0].init?.body).toBe(JSON.stringify({ name: "ethanol" }));
  });
});
