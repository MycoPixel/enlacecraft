// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { relevantIrBands } from "../../model/irBands";
import { emptyMolecule, addAtom, addBond } from "../../model/molecule";
import { IrSpectrumPanel } from "./IrSpectrumPanel";
import { IrReportView } from "./IrReportView";

/**
 * The dropdown panel is a toolbar dropdown; the full view is a dialog. What
 * matters is that the route between them only exists once there's a spectrum to
 * show, and that the report shows every mode rather than the panel's cut of the
 * strongest dozen.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll(".ir-report-overlay").forEach((n) => n.remove());
});

/** Ethanol's drawn skeleton: enough for two carbonyl-free bands to be found. */
function ethanol() {
  let mol = emptyMolecule();
  ["C", "C", "O", "C", "H"].forEach((el, i) => {
    mol = addAtom(mol, `a${i}`, { x: i * 40, y: 0 }, el as never);
  });
  mol = addBond(mol, "b0", "a0", "a1", 1);
  mol = addBond(mol, "b1", "a1", "a2", 1);
  mol = addBond(mol, "b2", "a1", "a3", 1);
  mol = addBond(mol, "b3", "a2", "a4", 1);
  return mol;
}

const bands = relevantIrBands(ethanol());

/** 30 modes, so the panel's limit of 12 is visibly a cut. */
const manyModes = Array.from({ length: 30 }, (_, i) => ({
  wavenumber: 400 + i * 100,
  intensityKmMol: i + 1,
}));

function findButton(text: RegExp): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""));
}

describe("IR panel to full view", () => {
  test("no route to the full view before anything is computed", () => {
    act(() =>
      root.render(
        <IrSpectrumPanel state={{ phase: "idle" }} run={() => {}} bands={bands} onExpand={() => {}} />,
      ),
    );
    expect(findButton(/full spectrum/i)).toBeUndefined();
  });

  test("offers the full view once there is a spectrum, and it fires", () => {
    let opened = false;
    act(() =>
      root.render(
        <IrSpectrumPanel
          state={{ phase: "done", modes: manyModes, imaginaryCount: 0 }}
          run={() => {}}
          bands={bands}
          onExpand={() => {
            opened = true;
          }}
        />,
      ),
    );
    const button = findButton(/full spectrum/i);
    expect(button).toBeDefined();
    act(() => button!.click());
    expect(opened).toBe(true);
  });

  test("the panel shows the strongest dozen, not every mode", () => {
    act(() =>
      root.render(
        <IrSpectrumPanel
          state={{ phase: "done", modes: manyModes, imaginaryCount: 0 }}
          run={() => {}}
          bands={bands}
          onExpand={() => {}}
        />,
      ),
    );
    expect(container.querySelectorAll(".ir-table__row")).toHaveLength(12);
  });

  test("calculating disables the button rather than allowing a second run", () => {
    act(() =>
      root.render(
        <IrSpectrumPanel state={{ phase: "loading" }} run={() => {}} bands={bands} onExpand={() => {}} />,
      ),
    );
    expect((container.querySelector(".ir-panel__run") as HTMLButtonElement).disabled).toBe(true);
  });

  test("an imaginary mode is surfaced, since the frequencies are then suspect", () => {
    act(() =>
      root.render(
        <IrSpectrumPanel
          state={{ phase: "done", modes: manyModes, imaginaryCount: 1 }}
          run={() => {}}
          bands={bands}
          onExpand={() => {}}
        />,
      ),
    );
    expect(container.querySelector(".ir-panel__warn")?.textContent).toMatch(/imaginary/i);
  });
});

describe("IR full view", () => {
function renderReport(extra: Partial<React.ComponentProps<typeof IrReportView>> = {}) {
  act(() =>
    root.render(
      <IrReportView
        open
        onClose={() => {}}
        molecule={ethanol()}
        modes={manyModes}
        bands={bands}
        imaginaryCount={0}
        {...extra}
      />,
    ),
  );
}

  test("renders nothing while closed", () => {
    renderReport({ open: false });
    expect(document.querySelector(".ir-report-overlay")).toBeNull();
  });

  test("lists every mode, which is the whole point of the full view", () => {
    renderReport();
    expect(document.querySelectorAll(".ir-report-overlay .ir-table__row")).toHaveLength(30);
  });

  test("sorts by wavenumber, so the list reads like a spectrum", () => {
    renderReport();
    const first = document.querySelector(".ir-report-overlay .ir-table__wn")?.textContent;
    expect(Number(first)).toBe(400);
  });

  test("names the diagnostic ranges it shaded, with their counts", () => {
    renderReport();
    const text = document.querySelector(".ir-report-overlay")?.textContent ?? "";
    expect(text).toMatch(/C–O stretch/);
    expect(text).toMatch(/1050–1150/);
  });

  test("closes on Escape", () => {
    let closed = false;
    renderReport({ onClose: () => { closed = true; } });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(closed).toBe(true);
  });

  test("closes on a click outside the dialog", () => {
    let closed = false;
    renderReport({ onClose: () => { closed = true; } });
    const overlay = document.querySelector(".ir-report-overlay")!;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(closed).toBe(true);
  });

  test("an imaginary-mode warning is repeated here, where a peak is most likely read off", () => {
    renderReport({ imaginaryCount: 2 });
    expect(document.querySelector(".ir-report-warnings")?.textContent).toMatch(/imaginary/i);
  });

  test("says so when the structure matched no textbook range, rather than showing none", () => {
    renderReport({ bands: [] });
    expect(document.querySelector(".ir-report-empty")).not.toBeNull();
  });

  test("offers the structure as a window over the spectrum, not a tab", () => {
    renderReport();
    // A tab would mean reading one or the other, and remembering the
    // correspondence - which is the part a reader can't do reliably.
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.querySelector(".ir-report-plot .ir-structure-overlay")).toBeNull();
    act(() => {
      (document.querySelector(".ir-report-toggle-btn") as HTMLButtonElement).click();
    });
    const win = document.querySelector(".ir-report-plot .ir-structure-overlay");
    expect(win).not.toBeNull();
    // And it sits over the plot, so both are visible at once.
    expect(document.querySelector(".ir-report-plot .ir-plot")).not.toBeNull();
  });

  test("keeps the peak table and the plot in the same view", () => {
    renderReport();
    expect(document.querySelector(".ir-plot")).not.toBeNull();
    expect(document.querySelectorAll(".ir-table__row").length).toBeGreaterThan(0);
  });
});