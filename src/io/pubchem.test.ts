import { afterEach, describe, expect, test, vi } from "vitest";
import {
  detectIdentifierKind,
  fetchCompoundByIdentifier,
  fetchCompoundIdentifiersBySmiles,
  PubChemError,
} from "./pubchem";

const SDF = [
  "caffeine",
  "  PubChem",
  "",
  "  1  0  0  0  0  0  0  0  0  0999 V2000",
  "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
  "M  END",
  "> <PUBCHEM_IUPAC_NAME>",
  "Caffeine",
  "",
  "> <PUBCHEM_MOLECULAR_FORMULA>",
  "C8H10N4O2",
  "",
  "> <PUBCHEM_COMPOUND_CID>",
  "2244",
  "",
].join("\n");

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

function sdfResponse(): Response {
  return new Response(SDF, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectIdentifierKind", () => {
  test.each([
    ["aspirin", "name"],
    ["ácido acetilsalicílico", "name"],
    ["CC(=O)Oc1ccccc1C(=O)O", "smiles"],
    ["CCO", "smiles"],
    ["c1ccccc1", "smiles"],
    ["C1CCCCC1", "smiles"],
    ["CC(C)C", "smiles"],
    ["C/C=C/C", "smiles"],
    ["2-propanol", "name"],
    ["1,3-butadiene", "name"],
    ["p-xylene", "name"],
    ["alpha-tocopherol", "name"],
    ["InChI=1S/CH4/h1H4", "inchi"],
    ["XLYOFNOQVPJJNP-UHFFFAOYSA-N", "inchikey"],
    ["xlyofnoqvpjjnp-uhfffaoysa-n", "inchikey"],    ["2244", "cid"],
    ["50-78-2", "cas"],
    ["C6H12O6", "formula"],
    ["H2O", "formula"],
    ["NaCl", "formula"],
  ] as const)("%s -> %s", (input, expected) => {
    expect(detectIdentifierKind(input)).toBe(expected);
  });

  test("empty input falls back to name rather than crashing", () => {
    expect(detectIdentifierKind("   ")).toBe("name");
  });
});

describe("fetchCompoundByIdentifier", () => {
  test("auto-detects a CID and resolves its SDF", async () => {
    const calls = mockFetch(sdfResponse);
    const result = await fetchCompoundByIdentifier("2244");

    expect(calls[0].url).toContain("/compound/cid/2244/record/SDF?record_type=2d");
    expect(result.identifierKind).toBe("cid");
    expect(result.query).toBe("2244");
    expect(result.name).toBe("Caffeine");
    expect(result.formula).toBe("C8H10N4O2");
    expect(Object.keys(result.molecule.atoms)).toHaveLength(1);
  });

  test("uses the name namespace for CAS numbers", async () => {
    const calls = mockFetch(sdfResponse);
    const result = await fetchCompoundByIdentifier("50-78-2");
    expect(calls[0].url).toContain("/compound/name/50-78-2/record/SDF");
    expect(result.identifierKind).toBe("cas");
  });

  test("POSTs InChI to avoid slash/equals mangling in the URL", async () => {
    const calls = mockFetch(sdfResponse);
    const inchi = "InChI=1S/CH4/h1H4";
    const result = await fetchCompoundByIdentifier(inchi);

    expect(calls[0].url).toContain("/compound/inchi/record/SDF");
    expect(calls[0].init?.method).toBe("POST");
    expect(String(calls[0].init?.body)).toBe(`inchi=${encodeURIComponent(inchi)}`);
    expect(result.identifierKind).toBe("inchi");
  });

  test("uppercases InChIKeys before the GET", async () => {
    const calls = mockFetch(sdfResponse);
    const result = await fetchCompoundByIdentifier("xlyofnoqvpjjnp-uhfffaoysa-n");
    expect(calls[0].url).toContain("/compound/inchikey/XLYOFNOQVPJJNP-UHFFFAOYSA-N/record/SDF");
    expect(result.identifierKind).toBe("inchikey");
  });

  test("explicit SMILES mode keeps using the POST form", async () => {
    const calls = mockFetch(sdfResponse);
    const result = await fetchCompoundByIdentifier("CC(=O)O", "smiles");
    expect(calls[0].url).toContain("/compound/smiles/record/SDF");
    expect(calls[0].init?.method).toBe("POST");
    expect(String(calls[0].init?.body)).toBe(`smiles=${encodeURIComponent("CC(=O)O")}`);
    expect(result.identifierKind).toBe("smiles");
  });

  test("resolves a formula to its first CID, then fetches that structure", async () => {
    const calls = mockFetch((url) => {
      if (url.includes("/cids/TXT")) return new Response("2244\n2519\n", { status: 200 });
      return sdfResponse();
    });
    const result = await fetchCompoundByIdentifier("C8H10N4O2");

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/compound/formula/C8H10N4O2/cids/TXT");
    expect(calls[1].url).toContain("/compound/cid/2244/record/SDF");
    expect(result.identifierKind).toBe("formula");
    expect(result.query).toBe("C8H10N4O2");
  });

  test("name mode uses the existing Spanish-aware name lookup", async () => {
    const calls = mockFetch(sdfResponse);
    const result = await fetchCompoundByIdentifier("aspirin", "name");
    expect(calls[0].url).toContain("/compound/name/aspirin/record/SDF");
    expect(result.identifierKind).toBe("name");
  });

  test("empty query throws EMPTY_QUERY", async () => {
    mockFetch(sdfResponse);
    await expect(fetchCompoundByIdentifier("   ")).rejects.toMatchObject({ code: "EMPTY_QUERY" });
  });

  test("a missing formula result throws NOT_FOUND", async () => {
    mockFetch(() => new Response("", { status: 200 }));
    await expect(fetchCompoundByIdentifier("C99H999")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("HTTP errors keep their status and don't masquerade as not-found", async () => {
    mockFetch(() => new Response("busy", { status: 500 }));
    await expect(fetchCompoundByIdentifier("2244")).rejects.toEqual(
      expect.objectContaining({ code: "HTTP", params: { status: 500 } })
    );
  });

  test("network failures map to NETWORK", async () => {
    mockFetch(() => {
      throw new TypeError("offline");
    });
    await expect(fetchCompoundByIdentifier("2244")).rejects.toBeInstanceOf(PubChemError);
    await expect(fetchCompoundByIdentifier("2244")).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("fetchCompoundIdentifiersBySmiles", () => {
  test("POSTs the SMILES and reads CID, name and InChIKey in one request", async () => {
    const calls = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            PropertyTable: {
              Properties: [
                { CID: 6324, IUPACName: "ethane", InChIKey: "OTMSDBZUPAUEDD-UHFFFAOYSA-N" },
              ],
            },
          }),
          { status: 200 },
        ),
    );
    const result = await fetchCompoundIdentifiersBySmiles("CC");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/compound/smiles/property/IUPACName,InChIKey/JSON");
    expect(calls[0].init?.method).toBe("POST");
    expect(String(calls[0].init?.body)).toBe("smiles=CC");
    expect(result).toEqual({
      cid: 6324,
      name: "ethane",
      inchikey: "OTMSDBZUPAUEDD-UHFFFAOYSA-N",
    });
  });

  test("keeps whichever fields PubChem did return", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ PropertyTable: { Properties: [{ CID: 962 }] } }), {
          status: 200,
        }),
    );
    expect(await fetchCompoundIdentifiersBySmiles("O")).toEqual({ cid: 962, name: undefined, inchikey: undefined });
  });

  test("an empty property table is NOT_FOUND", async () => {
    mockFetch(() => new Response(JSON.stringify({ PropertyTable: { Properties: [] } }), { status: 200 }));
    await expect(fetchCompoundIdentifiersBySmiles("C99H999")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("HTTP failures keep their status", async () => {
    mockFetch(() => new Response("busy", { status: 503 }));
    await expect(fetchCompoundIdentifiersBySmiles("CC")).rejects.toEqual(
      expect.objectContaining({ code: "HTTP", params: { status: 503 } }),
    );
  });

  test("empty input throws EMPTY_QUERY without a request", async () => {
    const calls = mockFetch(sdfResponse);
    await expect(fetchCompoundIdentifiersBySmiles("   ")).rejects.toMatchObject({ code: "EMPTY_QUERY" });
    expect(calls).toHaveLength(0);
  });
});
