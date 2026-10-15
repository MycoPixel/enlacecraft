import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fetchLocalInChIKey, isLocalBackendAvailable } from "./localChem";

const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("local InChIKey lookup", () => {
  it("returns the key the backend computed", async () => {
    fetchMock.mockResolvedValue(json({ inchikey: "BSYNRYMUTXBXSQ-UHFFFAOYSA-N" }));
    await expect(fetchLocalInChIKey("CC(=O)Oc1ccccc1C(=O)O")).resolves.toBe("BSYNRYMUTXBXSQ-UHFFFAOYSA-N");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/inchikey"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("treats a null key as 'cannot identify', not a failure", async () => {
    // The backend answers 200 with null when RDKit parses the structure but
    // cannot standardise it. That must not be reported as an outage, or the
    // caller would show a network error instead of "this has no key".
    fetchMock.mockResolvedValue(json({ inchikey: null }));
    await expect(fetchLocalInChIKey("C[NH2]C")).resolves.toBeNull();
  });

  it("reports an unparseable structure as unsupported", async () => {
    fetchMock.mockResolvedValue(json({ detail: "bad smiles" }, 400));
    await expect(fetchLocalInChIKey("not a smiles")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("reports a refused connection as unavailable so the caller can use PubChem", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchLocalInChIKey("CCO")).rejects.toMatchObject({ code: "unavailable" });
  });

  it("does not call the network for an empty structure", async () => {
    await expect(fetchLocalInChIKey("   ")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports availability without throwing", async () => {
    fetchMock.mockResolvedValue(json({ status: "ok" }));
    await expect(isLocalBackendAvailable()).resolves.toBe(true);

    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(isLocalBackendAvailable()).resolves.toBe(false);
  });

  it("gives up on a wedged backend instead of hanging", async () => {
    // A localhost process that accepts the connection but never answers would
    // otherwise stall the lookup indefinitely. The mock has to honour the
    // signal for this to test the timeout rather than the mock's own silence.
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const started = Date.now();
    await expect(fetchLocalInChIKey("CCO")).rejects.toMatchObject({ code: "unavailable" });
    // It must have bailed on the timeout, not returned instantly by accident.
    expect(Date.now() - started).toBeGreaterThan(1000);
  }, 15_000);
});
