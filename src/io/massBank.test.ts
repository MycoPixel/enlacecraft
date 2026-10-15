import { describe, it, expect } from "vitest";
import { searchSpectra, fetchSpectrum, MassBankError, isValidInChIKey } from "./massBank";
import { fetchInChI } from "./pubchem";

/**
 * These hit the live MassBank server. They're the only tests in the repo that
 * do, so they're gated behind MASSBANK_LIVE=1 — a normal `npm test` must not
 * depend on third-party uptime, and MassBank has no CI-friendly SLA.
 *
 * Run them with: MASSBANK_LIVE=1 npx vitest run src/io/massBank.test.ts
 *
 * What they protect is the thing that already went wrong once: the documented
 * `?query=` params on /records are silently ignored and return the entire
 * ~257 MB database. If a future refactor "simplifies" these two calls back
 * onto /records, searchSpectra will start returning thousands of unrelated
 * accessions and this test fails instead of shipping.
 */
const LIVE = import.meta.env.MODE === "test" && import.meta.env.MASSBANK_LIVE === "1";

describe("pubChem retry policy", () => {
  it("retries a 503 and then succeeds, instead of reporting the structure as unresolvable", async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls < 3) return new Response("busy", { status: 503 });
      return new Response(
        JSON.stringify({ PropertyTable: { Properties: [{ InChI: "InChI=1S/x", InChIKey: "RYYVLZVUVIJVGH-UHFFFAOYSA-N" }] } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const r = await fetchInChI("CCO");
      expect(r.inchikey).toBe("RYYVLZVUVIJVGH-UHFFFAOYSA-N");
      expect(calls).toBe(3);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("reports BUSY, not a structural failure, when every attempt is throttled", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("busy", { status: 503 })) as typeof fetch;
    try {
      await expect(fetchInChI("CCO")).rejects.toMatchObject({ code: "BUSY" });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("does not retry a 404 — that is a definitive answer", async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    try {
      await expect(fetchInChI("CCO")).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("InChIKey validation for manual entry", () => {
  it("accepts real keys", () => {
    expect(isValidInChIKey("BSYNRYMUTXBXSQ-UHFFFAOYSA-N")).toBe(true); // aspirin
    expect(isValidInChIKey("RYYVLZVUVIJVGH-UHFFFAOYSA-N")).toBe(true); // caffeine
    expect(isValidInChIKey("  LFQSCWFLJHTTHZ-UHFFFAOYSA-N  ")).toBe(true); // surrounding space
  });

  it("rejects malformed keys before spending a request on them", () => {
    for (const bad of [
      "",
      "aspirin",
      "BSYNRYMUTXBXSQ", // missing blocks
      "BSYNRYMUTXBXSQ-UHFFFAOYSA", // two blocks
      "BSYNRYMUTXBXSQ-UHFFFAOYSA-N-EXTRA",
      "bsynrymutxbxsq-uhfffaoysa-n", // lowercase is not valid InChIKey form
      "BSYNRYMUTXBXS0-UHFFFAOYSA-N", // digit where a letter belongs
    ]) {
      expect(isValidInChIKey(bad), `should reject ${JSON.stringify(bad)}`).toBe(false);
    }
  });
});

describe("massBank — pure input handling", () => {
  it("rejects an empty InChIKey before touching the network", async () => {
    await expect(searchSpectra("   ")).rejects.toMatchObject({ code: "EMPTY_QUERY" });
  });

  it("rejects an empty accession before touching the network", async () => {
    await expect(fetchSpectrum("")).rejects.toMatchObject({ code: "EMPTY_QUERY" });
  });

  it("uses a distinct error class", () => {
    expect(new MassBankError("NETWORK")).toBeInstanceOf(Error);
    expect(new MassBankError("NETWORK").name).toBe("MassBankError");
  });
});

describe.skipIf(!LIVE)("massBank — live server contract", () => {
  const CAFFEINE = "RYYVLZVUVIJVGH-UHFFFAOYSA-N";

  it("searchSpectra filters by InChIKey instead of returning the whole database", async () => {
    const { refs: hits } = await searchSpectra(CAFFEINE);
    expect(hits.length).toBeGreaterThan(0);
    // The failure mode this guards against: unfiltered /records returns ~90k.
    expect(hits.length).toBeLessThan(1000);
    for (const h of hits) expect(h.accession).toMatch(/^MSBNK-/);
  });

  it("searchSpectra returns nothing for an unknown key rather than throwing", async () => {
    await expect(searchSpectra("AAAAAAAAAA-AAAAAAAAAA-A")).resolves.toEqual({ refs: [], stereochemistryFallback: false });
  });

  it("fetchSpectrum returns peaks and the per-record license", async () => {
    const { refs: hits } = await searchSpectra(CAFFEINE);
    const spec = await fetchSpectrum(hits[0].accession);
    expect(spec.accession).toBe(hits[0].accession);
    expect(spec.peaks.length).toBeGreaterThan(0);
    // Every peak must be a real, usable m/z — the viewer plots these directly.
    for (const p of spec.peaks) {
      expect(Number.isFinite(p.mz)).toBe(true);
      expect(p.mz).toBeGreaterThan(0);
    }
    // Peaks arrive sorted by m/z; the stick plot assumes it.
    const mzs = spec.peaks.map((p) => p.mz);
    expect([...mzs].sort((a, b) => a - b)).toEqual(mzs);
  });

  it("fetchSpectrum carries attribution and acquisition metadata", async () => {
    const { refs: hits } = await searchSpectra(CAFFEINE);
    const spec = await fetchSpectrum(hits[0].accession);
    // license is required — it's per-record and non-redistributable without it
    expect(spec.license).toBeTruthy();
    expect(spec.name).toBeTruthy();
  });

  it("reads the licence from the top level, not from compound", async () => {
    // `license` sits beside `compound`, not inside it. Asserting only
    // toBeTruthy() here missed that bug entirely and rendered every
    // attribution as "(unknown)" — which is how a record can end up shown
    // with no credit attached.
    const { refs: hits } = await searchSpectra(CAFFEINE);
    const res = await fetch(
      `https://massbank.eu/MassBank-api/records/${encodeURIComponent(hits[0].accession)}`,
      { headers: { Accept: "application/json" } },
    );
    const raw = (await res.json()) as { license?: string; compound?: { license?: string } };
    expect(raw.license).toBeTruthy();
    expect(raw.compound?.license).toBeUndefined();

    const spec = await fetchSpectrum(hits[0].accession);
    expect(spec.license).toBe(raw.license);
    expect(spec.license).not.toBe("");
  });

  it("builds an attribution link to the server-rendered record page", async () => {
    const { refs: hits } = await searchSpectra(CAFFEINE);
    const spec = await fetchSpectrum(hits[0].accession);
    expect(spec.recordUrl).toBe(
      `https://massbank.eu/MassBank/RecordDisplay?id=${encodeURIComponent(spec.accession)}`,
    );

    // The link has to actually resolve to a page for THIS record. Both
    // `Search?query=` and `SpectrumDisplay.jsp?id=` return 200 with a generic
    // app shell that then renders "no results", so a status check alone would
    // have passed on the broken URLs.
    const res = await fetch(spec.recordUrl);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(spec.accession);
  });

  it("finds spectra from a hand-entered key, bypassing PubChem entirely", async () => {
    // The whole point of manual entry: no InChIKey service involved, just the
    // key the user pasted.
    const pasted = "BSYNRYMUTXBXSQ-UHFFFAOYSA-N";
    expect(isValidInChIKey(pasted)).toBe(true);
    const { refs: hits } = await searchSpectra(pasted);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("an unknown-but-well-formed key yields no hits rather than an error", async () => {
    // This is why a typo must be caught before the request: an empty result is
    // indistinguishable from "no spectra for this molecule".
    const { refs: hits, stereochemistryFallback } = await searchSpectra("AAAAAAAAAA-AAAAAAAAAA-A");
    expect(hits).toEqual([]);
    expect(stereochemistryFallback).toBe(false);
  });

  it("uses the exact key when it matches, without flagging a fallback", async () => {
    // MassBank indexes both the stereo key and the ...-UHFFFAOYSA-N key a 2D
    // drawing produces, so the drawn form usually finds most records anyway
    // (tryptophan: 78 of 81). The skeleton fallback is a safety net for the
    // cases where it doesn't, not a routine path.
    const stereo = "ROHFNLRQFUQHCH-YFKPBYRVSA-N";
    const drawn = "ROHFNLRQFUQHCH-UHFFFAOYSA-N";

    const exact = await searchSpectra(stereo);
    expect(exact.refs.length).toBeGreaterThan(0);
    expect(exact.stereochemistryFallback).toBe(false);

    const asDrawn = await searchSpectra(drawn);
    expect(asDrawn.stereochemistryFallback).toBe(false);
    expect(asDrawn.refs.length).toBeGreaterThan(0);
  });

  it("recovers records when only the skeleton block matches", async () => {
    // The skeleton block is shared by every stereoisomer and MassBank accepts
    // it as a prefix, so it is a strict superset: tryptophan 81 -> 175,
    // cholesterol 4 -> 24. That is why results from it are flagged rather than
    // silently mixed in with exact matches.
    const skeleton = "ROHFNLRQFUQHCH";
    const exact = await searchSpectra("ROHFNLRQFUQHCH-YFKPBYRVSA-N");
    const loose = await searchSpectra(skeleton);

    expect(loose.refs.length).toBeGreaterThanOrEqual(exact.refs.length);
    expect(loose.stereochemistryFallback).toBe(false);
  });

  it("does not flag the fallback when the exact key already matched", async () => {
    // Aspirin is achiral, so its skeleton block and full key give the same
    // set -- no fallback is attempted and none is reported.
    const full = await searchSpectra("BSYNRYMUTXBXSQ-UHFFFAOYSA-N");
    const skeleton = await searchSpectra("BSYNRYMUTXBXSQ");
    expect(full.refs.length).toBe(skeleton.refs.length);
    expect(full.stereochemistryFallback).toBe(false);
  });

  it("throws NOT_FOUND for a well-formed but nonexistent accession", async () => {
    await expect(fetchSpectrum("MSBNK-Nope_XX-XX000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});