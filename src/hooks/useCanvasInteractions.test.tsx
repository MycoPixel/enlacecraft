// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useCanvasInteractions } from "./useCanvasInteractions";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { emptyMolecule, addAtom, addBond } from "../model/molecule";

/**
 * Covers the touch long-press that opens the context menu.
 *
 * This is the gesture that makes eleven actions reachable on a phone at all —
 * dative bond, haptic bond, aromatic circle, charge bracket, ignore-valence,
 * highlight, duplicate, copy, paste, select-all, IUPAC name — none of which
 * had a usable touch path before. The previous behaviour depended entirely on
 * the browser's native `contextmenu` event, which the existing code itself
 * noted iOS Safari often never fires for SVG content.
 *
 * Timed and pointer-sequence logic is exactly the kind that passes by luck,
 * so the interesting cases are the ones where the gesture must NOT fire: a
 * press that becomes a drag, and a press that lands on an atom (AtomView
 * already claims that one for the label editor).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let handlers: ReturnType<typeof useCanvasInteractions>;
let container: HTMLDivElement;
let root: Root;

/**
 * The hook's clientToWorld does `svgRef.current!.getBoundingClientRect()`, so
 * the ref has to point at a real element - rendering an actual <svg> is the
 * simplest way to satisfy that.
 */
function Harness() {
  // useRef<SVGSVGElement | null> so it can go straight on the element;
  // the hook takes the older RefObject<SVGSVGElement> shape.
  const ref = useRef<SVGSVGElement | null>(null);
  handlers = useCanvasInteractions(ref as React.RefObject<SVGSVGElement>);
  return (
    <svg ref={ref} width={800} height={600}>
      <rect x={0} y={0} width={800} height={600} />
    </svg>
  );
}

/** A two-atom chain: a-a-bond-a, laid out along x so hits are predictable. */
function seedChain() {
  let mol = addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
  mol = addAtom(mol, "a2", { x: 200, y: 0 }, "C");
  mol = addBond(mol, "b1", "a1", "a2", 1, "none");
  useMoleculeStore.setState({ molecule: mol, selected: new Set(), contextMenu: null });
}

/** A pointer event shaped like a React synthetic one for the handler. */
function pointerEvent(clientX: number, clientY: number, pointerId = 1) {
  return {
    pointerId,
    pointerType: "touch" as const,
    button: 0,
    clientX,
    clientY,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as React.PointerEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness />);
  });
  seedChain();
  // jsdom's getBoundingClientRect() returns all zeros, which is already the
  // identity mapping this test wants (client coords == world coords at scale 1).
  useMoleculeStore.setState({ view: { scale: 1, tx: 0, ty: 0 } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("touch long-press opens the context menu", () => {
  test("opens the menu after the hold threshold on empty canvas", () => {
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    expect(useMoleculeStore.getState().contextMenu).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    const menu = useMoleculeStore.getState().contextMenu;
    expect(menu).not.toBeNull();
    expect(menu!.atomId).toBeNull();
    expect(menu!.bondId).toBeNull();
  });

  test("targets the bond under the press", () => {
    // Midpoint of the a1-a2 bond, in client coords at scale 1 / no pan.
    act(() => {
      handlers.onPointerDown(pointerEvent(100, 0));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const menu = useMoleculeStore.getState().contextMenu;
    expect(menu).not.toBeNull();
    expect(menu!.bondId).toBe("b1");
  });

  test("does not fire when the press becomes a drag", () => {
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    // More than the 8px slop that cancels the gesture.
    act(() => {
      handlers.onPointerMove(pointerEvent(430, 340));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).toBeNull();
  });

  test("does not fire for small jitter below the slop threshold", () => {
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    act(() => {
      handlers.onPointerMove(pointerEvent(405, 303)); // ~5.8px, under 8
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).not.toBeNull();
  });

  test("does not arm on an atom, leaving that gesture to AtomView's label editor", () => {
    // Directly on a1. AtomView claims long-press-on-atom for the free-text
    // label editor; arming here too would open a label editor and a context
    // menu at the same time.
    act(() => {
      handlers.onPointerDown(pointerEvent(0, 0));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).toBeNull();
  });

  test("releasing before the threshold does not open the menu", () => {
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(400, 300));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).toBeNull();
  });

  test("the release after a fired long-press does not also run the tool action", () => {
    // The select tool on empty canvas would otherwise start a marquee; after a
    // long-press opened the menu, that release must be swallowed.
    useMoleculeStore.setState({ tool: "select" });
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).not.toBeNull();

    act(() => {
      handlers.onPointerUp(pointerEvent(400, 300));
    });
    // A marquee rect would mean the release resumed the tool gesture.
    expect(useMoleculeStore.getState().marqueeRect).toBeNull();
  });

  test("a second long-press can open the menu again after the first closes", () => {
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(400, 300));
    });

    useMoleculeStore.setState({ contextMenu: null });
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).not.toBeNull();
  });

  test("a cancelled pointer never opens the menu", () => {
    act(() => {
      handlers.onPointerDown(pointerEvent(400, 300));
    });
    act(() => {
      handlers.onPointerCancel(pointerEvent(400, 300));
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).toBeNull();
  });

  test("mouse presses never arm the long-press", () => {
    act(() => {
      handlers.onPointerDown({ ...pointerEvent(400, 300), pointerType: "mouse" } as unknown as React.PointerEvent);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(useMoleculeStore.getState().contextMenu).toBeNull();
  });
});

describe("freeAngle bypasses the 30-degree snap", () => {
  /** One lone carbon, with the bond tool active. */
  function seedBondTool() {
    let mol = addAtom(emptyMolecule(), "a1", { x: 0, y: 0 }, "C");
    useMoleculeStore.setState({ molecule: mol, selected: new Set(), contextMenu: null });
    useMoleculeStore.setState({ tool: "bond-1" });
  }

  /**
   * Drags a bond out at `angleDeg` and returns the angle of the resulting
   * bond, in degrees, snapped to something comparable.
   */
  function dragBondAt(angleDeg: number): number | null {
    const r = 100;
    const rad = (angleDeg * Math.PI) / 180;
    const tx = Math.cos(rad) * r;
    const ty = Math.sin(rad) * r;
    act(() => {
      handlers.onPointerDown(pointerEvent(0, 0)); // on a1
    });
    act(() => {
      handlers.onPointerMove(pointerEvent(tx, ty));
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(tx, ty));
    });
    const mol = useMoleculeStore.getState().molecule;
    const other = Object.values(mol.atoms).find((a) => a.id !== "a1");
    if (!other) return null;
    return (Math.atan2(other.y, other.x) * 180) / Math.PI;
  }

  beforeEach(() => {
    seedBondTool();
    useMoleculeStore.setState({ freeAngle: false });
  });

  test("snaps a 40-degree drag onto the 30-degree grid by default", () => {
    // 40 is not a multiple of 30, so snapping is observable.
    const deg = dragBondAt(40);
    expect(deg).not.toBeNull();
    // atan2 returns ~29.999999999999993 for a true 30, so measure the
    // distance to the nearest grid line rather than comparing directly.
    expect(Math.abs(deg! - Math.round(deg! / 30) * 30)).toBeLessThan(1e-6);
  });

  test("keeps a 40-degree drag at 40 degrees when freeAngle is on", () => {
    useMoleculeStore.setState({ freeAngle: true });
    const deg = dragBondAt(40);
    expect(deg).not.toBeNull();
    expect(Math.abs(deg! - 40)).toBeLessThan(0.001);
  });

  test("an angle already on the grid is unchanged either way", () => {
    const onGrid = dragBondAt(30)!;
    expect(Math.abs(onGrid - Math.round(onGrid / 30) * 30)).toBeLessThan(1e-6);
    seedBondTool();
    useMoleculeStore.setState({ freeAngle: true });
    const kept = dragBondAt(30)!;
    expect(Math.abs(kept - 30)).toBeLessThan(1e-6);
  });

  test("the toggle flips and is readable from the store", () => {
    expect(useMoleculeStore.getState().freeAngle).toBe(false);
    act(() => useMoleculeStore.getState().toggleFreeAngle());
    expect(useMoleculeStore.getState().freeAngle).toBe(true);
    act(() => useMoleculeStore.getState().toggleFreeAngle());
    expect(useMoleculeStore.getState().freeAngle).toBe(false);
  });

  test("does not make freeAngle affect selection, which keeps its own Shift meaning", () => {
    // With freeAngle on, a plain tap on an atom should still just select it -
    // the toggle is about angle snapping only.
    seedBondTool();
    useMoleculeStore.setState({ tool: "select", freeAngle: true });
    act(() => {
      handlers.onPointerDown(pointerEvent(0, 0));
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(0, 0));
    });
    expect(useMoleculeStore.getState().selected.has("a1")).toBe(true);
  });
});

describe("dative and hollow-wedge bond tools", () => {
  test("clicking an existing bond with the dative tool toggles it", () => {
    useMoleculeStore.setState({ tool: "dative" });
    act(() => {
      handlers.onPointerDown(pointerEvent(100, 0));
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(100, 0));
    });
    expect(Object.values(useMoleculeStore.getState().molecule.bonds)[0].dative).toBe(true);

    // A second click turns it back into a plain single bond rather than
    // doing nothing.
    act(() => {
      handlers.onPointerDown(pointerEvent(100, 0));
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(100, 0));
    });
    expect(Object.values(useMoleculeStore.getState().molecule.bonds)[0].dative).toBe(false);
  });

  test("dragging with the hollow-wedge tool creates a hollowWedge bond", () => {
    useMoleculeStore.setState({ tool: "hollow-wedge" });
    act(() => {
      handlers.onPointerDown(pointerEvent(0, 0)); // on a1
    });
    act(() => {
      handlers.onPointerMove(pointerEvent(0, 120));
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(0, 120));
    });
    const bonds = Object.values(useMoleculeStore.getState().molecule.bonds);
    const created = bonds.find((b) => b.a1 === "a1" && b.a2 !== "a2") ?? bonds[bonds.length - 1];
    expect(created.stereo).toBe("hollowWedge");
  });

  test("dragging with the dative tool creates a dative bond", () => {
    useMoleculeStore.setState({ tool: "dative" });
    act(() => {
      handlers.onPointerDown(pointerEvent(0, 0)); // on a1
    });
    act(() => {
      handlers.onPointerMove(pointerEvent(0, 120));
    });
    act(() => {
      handlers.onPointerUp(pointerEvent(0, 120));
    });
    const bonds = Object.values(useMoleculeStore.getState().molecule.bonds);
    expect(bonds.some((b) => b.dative)).toBe(true);
  });
});
