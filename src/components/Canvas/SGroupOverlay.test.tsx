// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SGroupOverlay } from "./SGroupOverlay";
import type { Annotation, BracketAnnotation, Molecule } from "../../types/chemistry";

/**
 * The repeat-count overlay: CDXML stores a polymer's "n" as RepeatCount on
 * the group rather than as a caption, so without this overlay an imported
 * bracket would show no repeat count at all.
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
});

function bracket(id: string, facing: "open" | "close"): BracketAnnotation {
  return { id, kind: "bracket", x: facing === "open" ? 10 : 80, y: 20, width: 16, height: 90, variant: "square", facing };
}

function molecule(subscript?: string): Molecule {
  return {
    atoms: {},
    bonds: {},
    hapticBonds: {},
    aromaticRingDisplays: {},
    sgroups: {
      sg1: { id: "sg1", type: "SRU", atomIds: ["a"], subscript, bracketAnnotationIds: ["b1", "b2"] },
    },
  };
}

const annotations: Record<string, Annotation> = { b1: bracket("b1", "open"), b2: bracket("b2", "close") };

function render(mol: Molecule, anns: Record<string, Annotation> = annotations) {
  act(() => root.render(<SGroupOverlay molecule={mol} annotations={anns} />));
}

describe("SGroupOverlay", () => {
  test("renders the repeat count next to the closing bracket", () => {
    render(molecule("n"));
    const label = container.querySelector("text.sgroup-repeat");
    expect(label?.textContent).toBe("n");
    // The close bracket sits at x=80 with width 16; the label starts just
    // past its right edge.
    expect(Number(label?.getAttribute("x"))).toBeGreaterThan(96);
  });

  test("renders nothing when no group has a repeat count", () => {
    render(molecule());
    expect(container.querySelector("text")).toBeNull();
  });

  test("skips a group whose brackets are missing", () => {
    render(molecule("n"), {});
    expect(container.querySelector("text")).toBeNull();
  });
});
