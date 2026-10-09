// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { emptyMolecule, addAtom, addBond } from "../../model/molecule";
import { NmrStructureDiagram } from "./NmrStructureDiagram";
import { NmrReportView } from "./NmrReportView";
import type { AtomShifts } from "./nmrReportTypes";

/**
 * Explicit hydrogens in the NMR structure diagram.
 *
 * Two things are being pinned here. First, that a drawn hydrogen carries the
 * proton signal - the backend reports one 1H shift per heavy atom, so an "H"
 * vertex has to borrow its parent's or it reads as a vertex the predictions
 * forgot. Second, and more subtly, that a heavy atom STOPS carrying that signal
 * once its hydrogens are drawn, because a carbon showing a proton number next
 * to three H's showing the same number is exactly the thing that read as wrong
 * in the first place.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** Ethanol, skeletal: CH3-CH2-OH. */
function ethanol() {
  let m = addAtom(emptyMolecule(), "c1", { x: 0, y: 0 }, "C");
  m = addAtom(m, "c2", { x: 42, y: 0 }, "C");
  m = addAtom(m, "o1", { x: 84, y: 0 }, "O");
  m = addBond(m, "b1", "c1", "c2", 1, "none");
  m = addBond(m, "b2", "c2", "o1", 1, "none");
  return m;
}

/** The backend's real answer for "CCO", which is what these tests assert against. */
const SHIFTS = new Map<string, AtomShifts>([
  ["c1", { c13: 18.41, h1: { shift: 1.21, numHs: 3, multiplicity: "t", multiplicityDetail: "" } }],
  ["c2", { c13: 58.39, h1: { shift: 3.6, numHs: 2, multiplicity: "q", multiplicityDetail: "" } }],
]);

const LABELS = new Map([
  ["c1", "C1"],
  ["c2", "C2"],
  ["o1", "O1"],
]);

function render(props: { showH?: boolean; showC?: boolean; showExplicitHydrogens?: boolean }) {
  act(() => {
    root.render(
      <NmrStructureDiagram
        fragment={ethanol()}
        labelOf={LABELS}
        shiftsByAtom={SHIFTS}
        showC={props.showC ?? false}
        showH={props.showH ?? true}
        showExplicitHydrogens={props.showExplicitHydrogens ?? false}
      />,
    );
  });
}

/** Every atom circle drawn, in document order. */
function circles() {
  return Array.from(container.querySelectorAll("circle.nmr-report-svg__atom"));
}

/** The text of each atom group, in document order. */
function texts() {
  return Array.from(container.querySelectorAll("text")).map((t) => t.textContent?.trim() ?? "");
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMoleculeStore.setState({ language: "en" });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("hydrogens hidden", () => {
  test("draws only the heavy-atom skeleton", () => {
    render({ showExplicitHydrogens: false });
    expect(circles()).toHaveLength(3);
  });

  test("the carbon carries the proton signal, since there is nowhere else for it", () => {
    render({ showExplicitHydrogens: false });
    // Badges carry the multiplicity too, e.g. "1.21 (t)".
    const shown = texts();
    expect(shown.filter((t) => t.startsWith("1.21"))).toHaveLength(1);
    expect(shown.filter((t) => t.startsWith("3.60"))).toHaveLength(1);
  });

  test("the proton count is on the label for when the badge is not", () => {
    // The badge replaces the label, so the count is what a reader gets on
    // hover - and on a structure with no 1H display at all.
    render({ showExplicitHydrogens: false, showH: false });
    const shown = texts().join(" ");
    expect(shown).toContain("C1H3");
    expect(shown).toContain("C2H2");
    expect(shown).toContain("O1H");
  });
});

describe("hydrogens shown", () => {
  test("draws a hydrogen on each proton-bearing carbon", () => {
    // 3 heavy atoms + 3 H on C1 + 2 H on C2 = 8.
    render({ showExplicitHydrogens: true });
    expect(circles()).toHaveLength(8);
  });

  test("lays hydrogens out even though the structure is skeletal", () => {
    // The canvas's "Explicit hydrogens" is a structural edit; this viewer must
    // not require it, or the toggle would do nothing on the structure most
    // people actually draw.
    const before = ethanol();
    render({ showExplicitHydrogens: true });
    expect(circles().length).toBeGreaterThan(Object.keys(before.atoms).length);
  });

  test("does not put hydrogens on heteroatoms", () => {
    // Matches the canvas action's carbon-only scope: an -OH is already written
    // into the label, so expanding it would double-count the proton - and the
    // count has to stay on the label, because that proton is never drawn.
    render({ showExplicitHydrogens: true });
    const shown = texts().join(" ");
    expect(shown).toContain("O1H");
    // 5 drawn hydrogens: 3 on the methyl, 2 on the methylene. The "H" of "O1H"
    // is the count, not a drawn vertex.
    expect(circles()).toHaveLength(8);
  });

  test("each hydrogen shows its own carbon's proton signal", () => {
    render({ showExplicitHydrogens: true });
    const shown = texts();
    // Three H's on C1 all read 1.21 (t); two on C2 read 3.60 (q).
    expect(shown.filter((t) => t.startsWith("1.21"))).toHaveLength(3);
    expect(shown.filter((t) => t.startsWith("3.60"))).toHaveLength(2);
  });

  test("the carbon no longer shows the proton signal - the hydrogens own it now", () => {
    // The regression this whole feature exists to remove: a carbon advertising
    // a proton number, next to hydrogens advertising the same one.
    render({ showExplicitHydrogens: true });
    // Exactly three 1.21 badges - one per drawn hydrogen, none on the carbon.
    expect(texts().filter((t) => t.startsWith("1.21"))).toHaveLength(3);
    expect(texts().filter((t) => t.startsWith("3.60"))).toHaveLength(2);
    expect(circles()).toHaveLength(8);
  });

  test("a heavy atom keeps its 13C while its hydrogens take the 1H", () => {
    render({ showExplicitHydrogens: true, showC: true });
    const shown = texts();
    expect(shown).toContain("18.4");
    expect(shown).toContain("58.4");
    expect(shown.filter((t) => t.startsWith("1.21"))).toHaveLength(3);
  });

  test("a hydrogen never shows a 13C badge", () => {
    // It borrows the parent's entry wholesale; without the element check it
    // would render a carbon shift sitting on an "H".
    render({ showExplicitHydrogens: true, showC: true });
    // 18.4 / 58.4 appear once each - on the carbons, not on any H.
    expect(texts().filter((s) => s === "18.4")).toHaveLength(1);
    expect(texts().filter((s) => s === "58.4")).toHaveLength(1);
  });

  test("the redundant H count is dropped from the carbon label", () => {
    // With the hydrogens drawn as their own vertices, "C1H3" beside three H's
    // invites reading them as two different proton counts.
    render({ showExplicitHydrogens: true });
    const shown = texts().join(" ");
    expect(shown).not.toContain("C1H3");
  });

  test("hovering a hydrogen reveals its identity, not a second number", () => {
    render({ showExplicitHydrogens: true });
    const svg = container.querySelector("svg") as SVGSVGElement;
    // The hydrogen groups are the ones whose parent is a carbon; find one by
    // hovering until an "H" label appears in place of a shift.
    const groups = Array.from(svg.querySelectorAll("g"));
    const hGroup = groups.find((g) => g.textContent?.trim()?.startsWith("1.21"));
    expect(hGroup, "a hydrogen should be showing the methyl signal").toBeTruthy();

    act(() => {
      // React synthesises onMouseEnter from a delegated mouseover, so that is
      // the event to dispatch - a non-bubbling "mouseenter" is never seen.
      hGroup!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(hGroup!.textContent?.trim()).toBe("H");
  });
});

describe("the hydrogen toggle describes itself", () => {
  test("both toggles name what they now do", () => {
    // The control used to mean "add an H count to the label" and now means
    // "draw the hydrogens, each with its 1H signal" - a different action
    // behind the same letter, so the wording has to say which.
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const m = ethanol();
    act(() => {
      root.render(
        <NmrReportView
          open
          onClose={() => {}}
          results={[
            {
              smiles: "CCO",
              predictions: [{ atomIndex: 0, predictedShiftPpm: 18.41, equivalenceGroup: 0 }],
              predictionsH1: [
                {
                  atomIndex: 0,
                  predictedShiftPpm: 1.21,
                  numHs: 3,
                  equivalenceGroup: 0,
                  multiplicity: "t",
                  multiplicityDetail: "",
                  couplingHz: [],
                },
              ],
            },
          ]}
          warnings={[]}
          selectedIsomer={0}
          onSelectIsomer={() => {}}
          atomOrder={["c1", "c2", "o1"]}
          fragment={m}
        />,
      );
    });
    // NmrReportView renders through a portal, so it lands in the document
    // rather than inside the container it was rendered into.
    const hButton = Array.from(document.querySelectorAll("button")).find((b) =>
      /hydrogen/i.test(b.getAttribute("aria-label") ?? ""),
    ) as HTMLButtonElement | undefined;
    expect(hButton, "the H toggle should be present").toBeTruthy();
    // An accessible name, not just a tooltip: the button's own text is "H",
    // and text content outranks title, so a title alone would leave the
    // control announcing as a bare letter.
    const name = hButton!.getAttribute("aria-label")!;
    expect(name).toMatch(/1H/);
    // And the wording has to describe what the control does NOW - it draws the
    // hydrogens, it no longer only adds a count to the label.
    expect(name).toMatch(/show/i);
    act(() => root.unmount());
    host.remove();
  });
});
