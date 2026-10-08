// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { emptyMolecule, addAtom, addBond } from "../../model/molecule";

// The API clients are mocked so the test controls exactly when a prediction
// resolves - which is the whole point: the bug being fixed is about a result
// arriving (or persisting) when it no longer matches the structure.
const predictNmrSpectrum = vi.fn();
vi.mock("../../io/nmrPredict", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../io/nmrPredict")>();
  return { ...actual, predictNmrSpectrum: (...args: unknown[]) => predictNmrSpectrum(...args) };
});

vi.mock("../../io/embed3d", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../io/embed3d")>();
  return { ...actual, embedMolecule3DWithMethod: vi.fn(async () => ({ molfile: "molfile" })) };
});

// Imported after the mocks are declared so the component picks them up.
import { NmrPredictionButton } from "./NmrPredictionButton";

/**
 * A prediction is a function of one specific fragment - the selection, or the
 * whole canvas when nothing is selected. Before this fix nothing tied the
 * displayed result to that fragment: predict on aspirin, edit a bond, and the
 * dropdown and the full-screen report kept showing aspirin's shifts. Because
 * the panel's whole purpose is comparing a prediction against a real
 * spectrum, that is actively misleading rather than merely stale.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** A one-carbon molecule, so the guard conditions (valence, organometallic) pass. */
function seedMolecule() {
  let mol = addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 30, y: 0 }, "C");
  mol = addBond(mol, "b1", "a1", "a2", 1, "none");
  useMoleculeStore.setState({ molecule: mol, selected: new Set(), language: "en" });
}

/** A plausible result payload, shaped like NmrPredictResult. */
function result(smiles: string) {
  return {
    smiles,
    results: [{ smiles, predictions: [], predictionsH1: [] }],
    // Annotated so taggedResult can widen it to string[] without a type error.
    warnings: [] as string[],
  };
}

/**
 * Same, but tagged with a marker warning so two results can be told apart in
 * the DOM. translateNmrWarning passes an unrecognised warning through verbatim,
 * so the tag renders as-is - the SMILES isn't displayed anywhere, which makes it
 * useless as a discriminator.
 */
function taggedResult(tag: string) {
  return { ...result("CC"), warnings: [`TAG-${tag}`] };
}

/**
 * The dropdown's content is rendered through a portal (ToolDropdown positions
 * it against the trigger), so it lands on document.body rather than inside the
 * container the component was mounted into. Assert against body, or every
 * "is it gone?" check would pass vacuously.
 */

/**
 * Flushes the mocked prediction promise chain.
 *
 * runPrediction is async and does several awaits before setState (SMILES
 * export, optional 3D embed, then the predict call), so a single microtask
 * turn isn't enough to land the result. Draining a few turns inside act()
 * lets React commit before assertions run.
 */
async function flushPrediction() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Opens the dropdown the way a user would, and waits for effects. */
async function openDropdown() {
  // ToolDropdown renders its trigger button; clicking it is the user action.
  const trigger = container.querySelector("button");
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  predictNmrSpectrum.mockReset();
  predictNmrSpectrum.mockResolvedValue(result("CC"));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<NmrPredictionButton />);
  });
  seedMolecule();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (window as { electron?: unknown }).electron;
  vi.restoreAllMocks();
});

describe("NMR prediction result invalidation", () => {
  test("a prediction renders, and is visible in the dropdown", async () => {
    await openDropdown();
    // The dropdown opens with a fresh prediction (its onOpen fires one), so
    // the API should have been called without a second click.
    await flushPrediction();
    expect(predictNmrSpectrum).toHaveBeenCalled();
  });

  test("editing the structure discards the displayed result", async () => {
    await openDropdown();
    await flushPrediction();
    // Sanity: the result really is on screen before the edit, otherwise
    // "gone afterwards" would prove nothing.
    expect(document.body.querySelector(".nmr-result")).not.toBeNull();

    // Edit: add an atom. This is a different molecule, so the old shifts are
    // meaningless now.
    await act(async () => {
      const { molecule } = useMoleculeStore.getState();
      const next = addAtom(molecule, "a3", { x: 60, y: 0 }, "C");
      useMoleculeStore.setState({ molecule: next });
    });

    // The result-specific markup is gone.
    expect(document.body.querySelector(".nmr-result")).toBeNull();
  });

  test("changing the selection discards the result too", async () => {
    await openDropdown();
    await flushPrediction();

    await act(async () => {
      useMoleculeStore.setState({ selected: new Set(["a1"]) });
    });

    expect(document.body.querySelector(".nmr-result")).toBeNull();
  });

  test("hover alone does not discard the result", async () => {
    await openDropdown();
    await flushPrediction();
    expect(document.body.querySelector(".nmr-result")).not.toBeNull();

    // Moving the pointer across the canvas must not wipe a result the user is
    // in the middle of reading.
    await act(async () => {
      useMoleculeStore.setState({ hoverAtomId: "a1", hoverPoint: { x: 5, y: 5 } });
    });

    expect(document.body.querySelector(".nmr-result")).not.toBeNull();
  });

  test("a prediction resolving after an edit is discarded, not displayed", async () => {
    // A prediction whose promise we control, started before an edit.
    let resolvePrediction!: (value: ReturnType<typeof result>) => void;
    predictNmrSpectrum.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePrediction = resolve;
      }),
    );

    await openDropdown();

    // Edit while it is in flight.
    await act(async () => {
      const { molecule } = useMoleculeStore.getState();
      useMoleculeStore.setState({ molecule: addAtom(molecule, "a3", { x: 60, y: 0 }, "C") });
    });

    // Now the request lands - carrying shifts for the pre-edit structure.
    await act(async () => {
      resolvePrediction(result("CC"));
    });

    // It must not appear: those numbers belong to a molecule that is gone.
    expect(document.body.querySelector(".nmr-result")).toBeNull();
  });

  test("an error resolving after an edit is also discarded", async () => {
    let rejectPrediction!: (reason: Error) => void;
    predictNmrSpectrum.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectPrediction = reject;
      }),
    );

    await openDropdown();
    await act(async () => {
      const { molecule } = useMoleculeStore.getState();
      useMoleculeStore.setState({ molecule: addAtom(molecule, "a3", { x: 60, y: 0 }, "C") });
    });
    await act(async () => {
      rejectPrediction(new Error("network down"));
    });

    // No stale error banner either.
    expect(document.body.querySelector(".nmr-result")).toBeNull();
  });

  test("two predictions for the SAME input: the later one wins", async () => {
    // The generation guard only bumps when the MOLECULE changes, so two requests
    // for the same unedited structure shared a generation and neither could tell
    // the other apart. Clicking "XTB" then "Fast" - realistic, since the xtb
    // path allows 120s - could leave MMFF shifts displayed under an xTB tab
    // label, a 0.3-0.5 ppm difference on a value the user measures off the plot.
    //
    // So: two requests, NO edit between them, resolved in the order that used
    // to be wrong.
    let resolveFirst!: (value: ReturnType<typeof result>) => void;
    let resolveSecond!: (value: ReturnType<typeof result>) => void;
    predictNmrSpectrum.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );

    await openDropdown();
    // Let the first request reach the predict call.
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // Second request for the same molecule, via the other quality tab.
    const tabs = Array.from(document.body.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    predictNmrSpectrum.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );
    await act(async () => {
      tabs[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // The SECOND (most recent) resolves first and is displayed.
    await act(async () => {
      resolveSecond(taggedResult("SECOND"));
    });
    expect(document.body.textContent).toContain("TAG-SECOND");

    // The FIRST resolves afterwards, and must be discarded rather than
    // overwriting the newer result.
    await act(async () => {
      resolveFirst(taggedResult("FIRST"));
    });
    expect(document.body.textContent).toContain("TAG-SECOND");
    expect(document.body.textContent).not.toContain("TAG-FIRST");
  });

  test("a stale error does not replace a newer successful result", async () => {
    let rejectFirst!: (reason: Error) => void;
    predictNmrSpectrum.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );
    await openDropdown();
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    predictNmrSpectrum.mockResolvedValue(taggedResult("FRESH"));
    const tabs = Array.from(document.body.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    await act(async () => {
      tabs[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPrediction();
    expect(document.body.textContent).toContain("TAG-FRESH");

    // The older request now fails. Showing its error would replace a perfectly
    // good result with a banner about a request the user has already moved on
    // from.
    await act(async () => {
      rejectFirst(new Error("network down"));
    });
    expect(document.body.textContent).toContain("TAG-FRESH");
    expect(document.body.textContent).not.toContain("network down");
  });

  test("editing twice in a row keeps it discarded", async () => {
    await openDropdown();
    await flushPrediction();

    await act(async () => {
      const { molecule } = useMoleculeStore.getState();
      useMoleculeStore.setState({ molecule: addAtom(molecule, "a3", { x: 60, y: 0 }, "C") });
    });
    await act(async () => {
      const { molecule } = useMoleculeStore.getState();
      useMoleculeStore.setState({ molecule: addAtom(molecule, "a4", { x: 90, y: 0 }, "C") });
    });

    expect(document.body.querySelector(".nmr-result")).toBeNull();
  });
});