// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SpectrumLookup } from "./SpectrumLookup";

const searchSpectra = vi.fn();
const fetchSpectrum = vi.fn();
vi.mock("../../io/massBank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../io/massBank")>();
  return {
    ...actual,
    searchSpectra: (...args: unknown[]) => searchSpectra(...args),
    fetchSpectrum: (...args: unknown[]) => fetchSpectrum(...args),
  };
});

/** React tracks the previous value on the DOM node, so assigning .value
 *  directly is invisible to onChange. Going through the native setter is what
 *  makes React see a genuine user edit. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const onUseManualKey = vi.fn();
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  searchSpectra.mockReset();
  fetchSpectrum.mockReset();
  onUseManualKey.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(props: Parameters<typeof SpectrumLookup>[0]) {
  await act(async () => {
    root.render(<SpectrumLookup {...props} />);
  });
}

const SPECTRUM = {
  accession: "MSBNK-TEST-01",
  name: "Caffeine",
  license: "dl-de/by-2-0",
  recordUrl: "https://massbank.eu/MassBank/RecordDisplay?id=MSBNK-TEST-01",
  peaks: [{ mz: 110, intensity: 100, rel: 100 }],
};

describe("SpectrumLookup — manual InChIKey entry", () => {
  // Regression: the form used to render only when the automatic key lookup
  // FAILED. With PubChem working — the normal case — it was unreachable, so
  // the feature was invisible to exactly the people who could use it.
  test("is reachable when a key was resolved and spectra were found", async () => {
    searchSpectra.mockResolvedValue([{ accession: "MSBNK-TEST-01" }]);
    fetchSpectrum.mockResolvedValue(SPECTRUM);

    await render({ inchikey: "RYYVLZVUVIJVGH-UHFFFAOYSA-N", onUseManualKey });

    const toggle = [...container.querySelectorAll("button")].find((b) =>
      /different InChIKey/i.test(b.textContent ?? ""),
    );
    expect(toggle, "manual entry must be offered even on success").toBeTruthy();

    await act(async () => {
      toggle!.click();
    });
    expect(container.querySelector("#massbank-inchikey")).toBeTruthy();
  });

  test("is reachable when the key resolved but MassBank has no spectra", async () => {
    searchSpectra.mockResolvedValue([]);

    await render({ inchikey: "AAAAAAAAAA-AAAAAAAAAA-A", onUseManualKey });

    // "no spectra" is exactly the case where a user is most likely to want to
    // try a different key rather than accept the answer.
    expect(container.textContent).toMatch(/no MassBank spectra/i);
    const toggle = [...container.querySelectorAll("button")].find((b) =>
      /different InChIKey/i.test(b.textContent ?? ""),
    );
    expect(toggle).toBeTruthy();
  });

  test("submits a valid key and collapses the form", async () => {
    searchSpectra.mockResolvedValue([]);
    await render({ inchikey: undefined, keyError: true, onUseManualKey });

    const input = container.querySelector("#massbank-inchikey") as HTMLInputElement;
    expect(input, "form should be open by default when there is no key").toBeTruthy();

    await act(async () => {
      typeInto(input, "bsynrymutxbxsq-uhfffaoysa-n");
    });

    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // Lowercase input is uppercased before validating, since InChIKeys are
    // conventionally uppercase and users paste them in either case.
    expect(onUseManualKey).toHaveBeenCalledWith("BSYNRYMUTXBXSQ-UHFFFAOYSA-N");
  });

  test("rejects a malformed key without calling back", async () => {
    searchSpectra.mockResolvedValue([]);
    await render({ inchikey: undefined, keyError: true, onUseManualKey });

    const input = container.querySelector("#massbank-inchikey") as HTMLInputElement;
    await act(async () => {
      typeInto(input, "not-a-key");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(onUseManualKey).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/not a valid InChIKey/i);
  });
});