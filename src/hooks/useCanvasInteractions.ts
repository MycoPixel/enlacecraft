import { useCallback, useRef, type RefObject } from "react";
import type { Annotation, Molecule, Point } from "../types/chemistry";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { atomAt, atomsInRect, bondAt, annotationsInRect } from "../engine/hitTest";
import { bestNewAngle } from "../engine/bondAngles";
import { angleOf, dist, polar } from "../model/geometry";
import { fragmentOf } from "../model/molecule";
import { BOND_LEN, RING_TEMPLATES } from "../model/constants";
import type { BondOrder, BondStereo } from "../types/chemistry";

type DragState =
  | { mode: "pan"; startClient: Point; startView: { scale: number; tx: number; ty: number } }
  | { mode: "move"; ids: string[]; start: Point; origPositions: { id: string; x: number; y: number }[]; before: { molecule: Molecule; annotations: Record<string, Annotation> } }
  | { mode: "bond"; from: string }
  | { mode: "marquee"; base: Set<string>; annotationBase: Set<string>; start: Point }
  | { mode: "arrow-draw"; start: Point };

/**
 * Owns all pointer interaction logic for the canvas: tool dispatch, dragging
 * to move atoms/fragments, dragging to draw bonds with angle snapping, and
 * pan/zoom. Reads/writes the global store directly so this hook stays free
 * of stale-closure bugs across renders.
 */
export function useCanvasInteractions(svgRef: RefObject<SVGSVGElement>) {
  const dragRef = useRef<DragState | null>(null);

  const clientToWorld = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const { view } = useMoleculeStore.getState();
    return {
      x: (clientX - rect.left - view.tx) / view.scale,
      y: (clientY - rect.top - view.ty) / view.scale,
    };
  }, [svgRef]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) return;
    const store = useMoleculeStore.getState();
    const { tool, molecule } = store;

    // Middle-mouse-button always pans, regardless of the active tool.
    if (e.button === 1) {
      dragRef.current = { mode: "pan", startClient: { x: e.clientX, y: e.clientY }, startView: store.view };
      return;
    }

    const pt = clientToWorld(e.clientX, e.clientY);
    const hitAtom = atomAt(molecule, pt);
    const hitBond = !hitAtom ? bondAt(molecule, pt) : null;
    store.setBondPreview(null);

    if (tool === "pan") {
      dragRef.current = { mode: "pan", startClient: { x: e.clientX, y: e.clientY }, startView: store.view };
      return;
    }

    if (tool === "text") {
      const id = store.addTextAnnotation(pt);
      store.setSelectedAnnotationIds(new Set([id]));
      store.setEditingTextId(id);
      store.setTool("select");
      return;
    }

    if (tool === "bracket") {
      const id = store.addBracketAnnotation(pt, store.bracketVariant, store.bracketFacing);
      store.setSelectedAnnotationIds(new Set([id]));
      store.setTool("select");
      return;
    }

    if (tool === "arrow") {
      store.setSelectedAnnotationIds(new Set());
      dragRef.current = { mode: "arrow-draw", start: pt };
      return;
    }

    if (tool === "select") {
      if (hitAtom) {
        // Clicking an atom is a different selection target entirely — any
        // active annotation selection is unrelated and gets cleared.
        store.setSelectedAnnotationIds(new Set());
        let newSelected: Set<string>;
        if (e.shiftKey) {
          // Shift+click toggles individual atoms in/out of a multi-selection.
          newSelected = new Set(store.selected);
          if (newSelected.has(hitAtom)) newSelected.delete(hitAtom);
          else newSelected.add(hitAtom);
        } else if (store.selected.has(hitAtom) && store.selected.size > 1) {
          // Clicking (without shift) on a member of an existing multi-selection
          // keeps the whole group selected, so you can drag it as one unit.
          newSelected = new Set(store.selected);
        } else {
          newSelected = new Set([hitAtom]);
        }
        store.setSelected(newSelected);
        store.setAtomEditTarget(hitAtom);
        dragRef.current = {
          mode: "move",
          ids: [...newSelected],
          start: pt,
          origPositions: [...newSelected].map((id) => ({ id, x: molecule.atoms[id].x, y: molecule.atoms[id].y })),
          before: { molecule, annotations: store.annotations },
        };
      } else if (hitBond) {
        store.setSelectedAnnotationIds(new Set());
        store.setAtomEditTarget(null);
        const b = molecule.bonds[hitBond];
        if (e.shiftKey) {
          const newSelected = new Set(store.selected);
          newSelected.add(b.a1);
          newSelected.add(b.a2);
          store.setSelected(newSelected);
        } else {
          store.setSelected(new Set([b.a1, b.a2]));
        }
      } else {
        store.setAtomEditTarget(null);
        // Empty canvas: start a rectangle ("marquee") selection instead of panning.
        // Use the dedicated Pan tool, or a middle-mouse drag, to pan.
        const base = e.shiftKey ? new Set(store.selected) : new Set<string>();
        const annotationBase = e.shiftKey ? new Set(store.selectedAnnotationIds) : new Set<string>();
        store.setSelected(base);
        store.setSelectedAnnotationIds(annotationBase);
        dragRef.current = { mode: "marquee", base, annotationBase, start: pt };
      }
      return;
    }

    if (tool === "erase") {
      if (hitAtom) store.deleteAtom(hitAtom);
      else if (hitBond) store.deleteBond(hitBond);
      return;
    }

    if (tool === "atom") {
      if (hitAtom) {
        store.setAtomElementOf(hitAtom, store.atomElement);
        store.setAtomEditTarget(hitAtom);
        store.setSelected(new Set([hitAtom]));
      } else {
        store.setAtomEditTarget(null);
        store.addAtom(pt, store.atomElement);
      }
      return;
    }

    if (tool === "charge-plus" || tool === "charge-minus") {
      if (hitAtom) store.setAtomCharge(hitAtom, tool === "charge-plus" ? 1 : -1);
      return;
    }

    if (tool === "ring") {
      const template = RING_TEMPLATES.find((t) => t.id === store.ringTemplateId)!;
      store.placeRing(template, pt, hitAtom || null);
      return;
    }

    if (tool.startsWith("bond") || tool === "wedge" || tool === "dash") {
      if (hitBond) {
        if (tool === "wedge" || tool === "dash") {
          store.setBondStereo(hitBond, tool as BondStereo);
        } else if (tool === "bond-2" && molecule.bonds[hitBond].order === 2) {
          // Clicking the double-bond tool again on an existing double bond
          // cycles the second line: center -> left -> right -> center.
          // Handy for ring systems like benzene where you want the inner
          // line on a particular side.
          store.cycleDoubleBondSide(hitBond);
        } else {
          store.setBondOrder(hitBond, (tool === "bond-2" ? 2 : tool === "bond-3" ? 3 : 1) as BondOrder);
        }
        return;
      }
      const startAtom = hitAtom || store.addAtom(pt, "C");
      dragRef.current = { mode: "bond", from: startAtom };
      return;
    }
  }, [clientToWorld]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const store = useMoleculeStore.getState();
    const pt = clientToWorld(e.clientX, e.clientY);
    const hitAtom = atomAt(store.molecule, pt);
    store.setHoverAtomId(hitAtom);

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === "pan") {
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      store.setView({ ...drag.startView, tx: drag.startView.tx + dx, ty: drag.startView.ty + dy });
      return;
    }

    if (drag.mode === "move") {
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      const moves: Record<string, Point> = {};
      for (const p of drag.origPositions) moves[p.id] = { x: p.x + dx, y: p.y + dy };
      store.moveAtomsTransient(moves);
      return;
    }

    if (drag.mode === "marquee") {
      const enclosed = atomsInRect(store.molecule, drag.start, pt);
      const union = new Set(drag.base);
      enclosed.forEach((id) => union.add(id));
      store.setSelected(union);

      const enclosedAnnotations = annotationsInRect(store.annotations, drag.start, pt);
      const annotationUnion = new Set(drag.annotationBase);
      enclosedAnnotations.forEach((id) => annotationUnion.add(id));
      store.setSelectedAnnotationIds(annotationUnion);

      store.setMarqueeRect({
        x: Math.min(drag.start.x, pt.x),
        y: Math.min(drag.start.y, pt.y),
        w: Math.abs(pt.x - drag.start.x),
        h: Math.abs(pt.y - drag.start.y),
      });
      return;
    }

    if (drag.mode === "bond") {
      const fromAtom = store.molecule.atoms[drag.from];
      if (fromAtom) {
        const movedEnough = dist(fromAtom, pt) > 12;
        const hit = atomAt(store.molecule, pt, 16, drag.from);
        let previewPoint: Point;
        let targetAtomId: string | null = null;
        if (hit) {
          previewPoint = { x: store.molecule.atoms[hit].x, y: store.molecule.atoms[hit].y };
          targetAtomId = hit;
        } else {
          const desired = movedEnough ? angleOf(fromAtom, pt) : null;
          const ang = bestNewAngle(store.molecule, drag.from, desired);
          previewPoint = polar(fromAtom.x, fromAtom.y, BOND_LEN, ang);
        }
        store.setBondPreview({ from: drag.from, to: previewPoint, targetAtomId });
      }
      store.setStatus("status.dragBond");
      return;
    }

    if (drag.mode === "arrow-draw") {
      store.setArrowPreview({ x1: drag.start.x, y1: drag.start.y, x2: pt.x, y2: pt.y });
    }
  }, [clientToWorld]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const store = useMoleculeStore.getState();
    store.setBondPreview(null);

    if (drag.mode === "move") {
      store.commitCheckpoint(drag.before);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "marquee") {
      store.setMarqueeRect(null);
      return;
    }

    if (drag.mode === "bond") {
      const pt = clientToWorld(e.clientX, e.clientY);
      const { molecule, tool } = store;
      const from = drag.from;
      const fromAtom = molecule.atoms[from];
      if (!fromAtom) return;
      const movedEnough = dist(fromAtom, pt) > 12;
      const hitAtom = atomAt(molecule, pt);

      let toAtom: string;
      if (hitAtom && hitAtom !== from) {
        toAtom = hitAtom;
      } else {
        const desired = movedEnough ? angleOf(fromAtom, pt) : null;
        const ang = bestNewAngle(molecule, from, desired);
        const p = polar(fromAtom.x, fromAtom.y, BOND_LEN, ang);
        toAtom = store.addAtom(p, "C");
      }

      const order = (tool === "bond-2" ? 2 : tool === "bond-3" ? 3 : 1) as BondOrder;
      const stereo: BondStereo = tool === "wedge" ? "wedge" : tool === "dash" ? "dash" : "none";
      store.addBond(from, toAtom, stereo === "none" ? order : 1, stereo);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "arrow-draw") {
      store.setArrowPreview(null);
      const pt = clientToWorld(e.clientX, e.clientY);
      // A near-zero drag still places a reasonable default-length arrow
      // pointing right, rather than a degenerate zero-length one.
      const end = dist(drag.start, pt) > 8 ? pt : { x: drag.start.x + BOND_LEN * 1.5, y: drag.start.y };
      const id = store.addArrowAnnotation(drag.start, end, store.arrowVariant);
      store.setSelectedAnnotationIds(new Set([id]));
      store.setTool("select");
    }
  }, [clientToWorld]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const store = useMoleculeStore.getState();
    if (store.tool !== "select") return;
    const { molecule } = store;
    const pt = clientToWorld(e.clientX, e.clientY);
    const hitAtom = atomAt(molecule, pt);
    const hitBond = !hitAtom ? bondAt(molecule, pt) : null;

    if (hitAtom) {
      store.setSelected(fragmentOf(molecule, hitAtom));
    } else if (hitBond) {
      store.setSelected(fragmentOf(molecule, molecule.bonds[hitBond].a1));
    }
  }, [clientToWorld]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const store = useMoleculeStore.getState();
    store.setView((v) => {
      const newScale = Math.min(4, Math.max(0.25, v.scale * factor));
      const tx = mx - ((mx - v.tx) / v.scale) * newScale;
      const ty = my - ((my - v.ty) / v.scale) * newScale;
      return { scale: newScale, tx, ty };
    });
  }, [svgRef]);

  return { onPointerDown, onPointerMove, onPointerUp, onWheel, onDoubleClick };
}
