// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { RingIcon } from "./RingPicker";
import { RING_TEMPLATES } from "../../model/constants";

/**
 * The chair/boat miniatures are supposed to be a preview of what placing the
 * template actually draws. They previously flipped the layout's y axis while
 * the canvas did not, so the icon read as the vertically reversed chair.
 *
 * The canvas uses layout coordinates directly (y-down), so this locks the
 * miniature to that same convention: for every non-horizontal bond, the
 * direction from the layout's `from` atom to its `to` atom must have the same
 * vertical sense in the icon.
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

function renderIcon(templateId: string) {
  act(() => root.render(<RingIcon templateId={templateId} />));
}

describe("fixed-layout ring miniatures", () => {
  for (const id of ["cyclohexane-chair", "cyclohexane-boat"]) {
    test(`${id} uses the same y orientation as the placed template`, () => {
      const template = RING_TEMPLATES.find((t) => t.id === id)!;
      const layout = template.layout!;
      const byKey = new Map(layout.atoms.map((a) => [a.key, a]));

      renderIcon(id);
      const lines = [...container.querySelectorAll("line")];
      // Chair/boat are all plain single bonds, so each one maps 1:1 to a
      // <line> in the same order.
      expect(lines).toHaveLength(layout.bonds.length);

      layout.bonds.forEach((bond, i) => {
        const a = byKey.get(bond.from)!;
        const b = byKey.get(bond.to)!;
        const layoutDy = a.y - b.y;
        if (Math.abs(layoutDy) < 1e-9) return; // horizontal bond: no sense to check
        const svgDy = Number(lines[i].getAttribute("y1")) - Number(lines[i].getAttribute("y2"));
        expect(Math.sign(svgDy), `${id} bond ${bond.from}-${bond.to}`).toBe(Math.sign(layoutDy));
      });
    });
  }
});
