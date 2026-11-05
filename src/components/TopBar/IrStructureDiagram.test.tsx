// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { emptyMolecule, addAtom, addBond } from "../../model/molecule";
import { ELEMENT_COLOR, PERIODIC_TABLE } from "../../model/constants";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { IrStructureDiagram } from "./IrStructureDiagram";

/**
 * The structure tab shows the molecule the calculation ran on. Two behaviours
 * carry their weight: dragging has to move the drawing and not a stray click,
 * and the hydrogen toggle has to actually add hydrogens to a structure drawn
 * skeletal — which is how nearly every structure here is drawn, so a toggle that
 * only revealed already-expanded H atoms would show nothing at all.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // The store ships with monochromeAtoms ON, so every colouring assertion
  // below would otherwise see --ink for everything.
  useMoleculeStore.setState({ monochromeAtoms: false });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Ethanol drawn skeletal: no H atoms as vertices, so implicit valence only. */
function ethanolSkeletal() {
  let mol = emptyMolecule();
  ["C", "C", "O", "C"].forEach((el, i) => {
    mol = addAtom(mol, `a${i}`, { x: i * 40, y: 0 }, el as never);
  });
  mol = addBond(mol, "b0", "a0", "a1", 1);
  mol = addBond(mol, "b1", "a1", "a2", 1);
  mol = addBond(mol, "b2", "a1", "a3", 1);
  return mol;
}

function render(showExplicitHydrogens: boolean, molecule = ethanolSkeletal()) {
  act(() => root.render(<IrStructureDiagram molecule={molecule} showExplicitHydrogens={showExplicitHydrogens} />));
}

function groups(): Element[] {
  return [...container.querySelectorAll(".ir-structure__svg > g")];
}

function labels(): string[] {
  return [...container.querySelectorAll(".ir-structure__label")].map((n) => n.textContent ?? "");
}

describe("IR structure drawing", () => {
  test("draws every heavy atom when hydrogens are off", () => {
    render(false);
    // Ethanol is C2H6O: four heavy atoms drawn, and the six hydrogens are not.
    expect(groups()).toHaveLength(4);
  });

  test("the hydrogen toggle adds hydrogens to a skeletal structure", () => {
    render(true);
    // If this only revealed already-drawn H atoms it would show nothing here,
    // since a skeletal drawing has none.
    expect(groups().length).toBeGreaterThan(4);
  });

  test("shows the implicit hydrogen count on labels when hydrogens are hidden", () => {
    render(false);
    const text = labels().join(" ");
    // "C1H3" carries valence the bare index doesn't.
    expect(text).toMatch(/H\d/);
  });

  test("drops the count once the hydrogens are drawn as their own atoms", () => {
    render(false);
    const withCount = labels().join(" ");
    render(true);
    const drawn = labels().join(" ");
    // "C1H3" beside three separate H's reads as two disagreeing proton counts.
    expect(withCount).toMatch(/H\d/);
    expect(drawn).not.toMatch(/H\d/);
  });

  test("a double bond is drawn as two parallel lines", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "O");
    mol = addBond(mol, "b0", "a0", "a1", 2);
    render(false, mol);
    expect(container.querySelectorAll(".ir-structure__bond")).toHaveLength(2);
  });
});

describe("IR structure element colouring", () => {
  function tintOf(index: number): string {
    // The colour arrives as a custom property so the hydrogen rule can override
    // the ring without fighting an inline fill/stroke.
    return container.querySelectorAll<SVGCircleElement>(".ir-structure__atom")[index].style.getPropertyValue("--atom-color");
  }

  /** Symbols carrying the hydrogen modifier, i.e. drawn white. */
  function hydrogenDiscs(): number {
    return container.querySelectorAll(".ir-structure__atom--hydrogen").length;
  }

  function hydrogenLabels(): number {
    return container.querySelectorAll(".ir-structure__label--hydrogen").length;
  }

  test("uses the app's own palette, so this matches the drawing it came from", () => {
    // C, C, O, C — ethanol.
    render(false);
    expect(tintOf(2)).toBe(ELEMENT_COLOR.O);
    expect(tintOf(0)).toBe(ELEMENT_COLOR.C);
  });

  test("gives oxygen and nitrogen different colours, which is the point", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "O");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "N");
    mol = addBond(mol, "b0", "a0", "a1", 1);
    render(false, mol);
    expect(tintOf(0)).toBe(ELEMENT_COLOR.O);
    expect(tintOf(1)).toBe(ELEMENT_COLOR.N);
    expect(tintOf(0)).not.toBe(tintOf(1));
  });

  test("every element in the periodic table has a colour, so none falls back", () => {
    // The `?? "var(--ink)"` is defensive only. If an element were ever added
    // without a colour it would quietly render as another carbon, which is a
    // silent wrong answer rather than a visible gap.
    const missing = PERIODIC_TABLE.filter((e) => !ELEMENT_COLOR[e.symbol]).map((e) => e.symbol);
    expect(missing).toEqual([]);
    expect(PERIODIC_TABLE).toHaveLength(118);
  });

  test("colours a halogen, which has no hand-tuned override beyond the shared green", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "C");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "Cl");
    mol = addBond(mol, "b0", "a0", "a1", 1);
    render(false, mol);
    expect(tintOf(1)).toBe(ELEMENT_COLOR.Cl);
  });

  test("leaves non-hydrogen symbols in ink, never the element colour", () => {
    // The whole point of moving colour onto the disc: 30 of 118 element
    // colours are under 3:1 against the panel in the dark themes - nitrogen
    // among them - so a coloured letter would be unreadable for the very
    // elements this drawing exists to identify.
    render(false);
    const labels = [...container.querySelectorAll<SVGTextElement>(".ir-structure__label")];
    expect(labels.every((n) => !n.style.fill)).toBe(true);
  });

  test("hydrogen is white", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "O");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "H");
    mol = addBond(mol, "b0", "a0", "a1", 1);
    render(true, mol);
    expect(tintOf(1)).toBe("#FFFFFF");
  });

  test("a hydrogen is drawn white while a heavy atom beside it is tinted", () => {
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "O");
    mol = addAtom(mol, "a1", { x: 40, y: 0 }, "H");
    mol = addBond(mol, "b0", "a0", "a1", 1);
    render(true, mol);
    expect(hydrogenDiscs()).toBe(1);
    expect(tintOf(0)).not.toBe("#FFFFFF");
  });

  test("hydrogen keeps a dark symbol, since its disc is white in every theme", () => {
    // A --ink symbol is near-white in the dark themes and would vanish into a
    // white disc; a themed symbol on a fixed-white disc has the same problem
    // inverted. This is why the override is allowed to break the theme rule.
    let mol = emptyMolecule();
    mol = addAtom(mol, "a0", { x: 0, y: 0 }, "H");
    render(true, mol);
    expect(hydrogenDiscs()).toBe(1);
    expect(hydrogenLabels()).toBe(1);
  });

  test("gives each atom an opaque plate so bonds don't run through the letter", () => {
    render(false);
    // Bonds are drawn centre-to-centre, so without a solid disc behind it the
    // symbol is crossed by a line.
    expect(container.querySelectorAll(".ir-structure__atom-backdrop")).toHaveLength(4);
    expect(container.querySelectorAll(".ir-structure__label")).toHaveLength(4);
  });

  test("stays coloured even with the canvas's monochrome mode on", () => {
    // monochromeAtoms ships ON, which is right for a skeletal canvas and wrong
    // here: every atom in this drawing is labelled, so ink-on-ink would leave
    // nothing to tell the atoms apart.
    useMoleculeStore.setState({ monochromeAtoms: true });
    try {
      let mol = emptyMolecule();
      mol = addAtom(mol, "a0", { x: 0, y: 0 }, "O");
      render(false, mol);
      expect(tintOf(0)).toBe(ELEMENT_COLOR.O);
    } finally {
      useMoleculeStore.setState({ monochromeAtoms: false });
    }
  });

  test("the hydrogen count keeps its softer ink, not the element colour", () => {
    render(false);
    const suffix = container.querySelector(".ir-structure__label-suffix") as SVGTSpanElement;
    // Matching it to the atom would make "H3" read as part of the symbol.
    expect(suffix.style.fill).toBe("");
  });
});
