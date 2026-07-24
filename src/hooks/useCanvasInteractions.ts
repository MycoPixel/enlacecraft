import { useCallback, useRef, type RefObject } from "react";
import type { Annotation, Molecule, Point, RingAttachment, FunctionalGroupAttachment, FunctionalGroupTemplate } from "../types/chemistry";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { atomAt, atomsInRect, bondAt, annotationsInRect } from "../engine/hitTest";
import { bestNewAngle } from "../engine/bondAngles";
import { neighborIds } from "../model/valence";
import { computeChainPoints } from "../engine/chainPlacement";
import { angleOf, dist, polar, snapAngle } from "../model/geometry";
import { fragmentOf } from "../model/molecule";
import { BOND_LEN, RING_TEMPLATES, ISOTOPE_PRESETS } from "../model/constants";
import { FUNCTIONAL_GROUP_TEMPLATES } from "../model/functionalGroupTemplates";
import type { BondOrder, BondStereo } from "../types/chemistry";

type DragState =
  | { mode: "pan"; startClient: Point; startView: { scale: number; tx: number; ty: number } }
  | { mode: "move"; ids: string[]; start: Point; origPositions: { id: string; x: number; y: number }[]; before: { molecule: Molecule; annotations: Record<string, Annotation> }; anchor: { atomId: string; neighborPos: Point; originalLength: number } | null }
  | { mode: "rotate"; ids: string[]; center: Point; startAngle: number; origPositions: { id: string; x: number; y: number }[]; before: { molecule: Molecule; annotations: Record<string, Annotation> } }
  | { mode: "bond"; from: string }
  | { mode: "functional-group"; template: FunctionalGroupTemplate; attachment: FunctionalGroupAttachment; center: Point }
  | { mode: "chain"; from: string | null; start: Point }
  | { mode: "erase"; before: { molecule: Molecule; annotations: Record<string, Annotation> } }
  | { mode: "marquee"; base: Set<string>; annotationBase: Set<string>; start: Point }
  | { mode: "arrow-draw"; start: Point }
  | { mode: "bracket-draw"; start: Point };

/**
 * Owns all pointer interaction logic for the canvas: tool dispatch, dragging
 * to move atoms/fragments, dragging to draw bonds with angle snapping, and
 * pan/zoom. Reads/writes the global store directly so this hook stays free
 * of stale-closure bugs across renders.
 */
export function useCanvasInteractions(svgRef: RefObject<SVGSVGElement>) {
  const dragRef = useRef<DragState | null>(null);
  // Two-finger pinch-to-zoom tracking — deliberately separate from dragRef
  // (which assumes one gesture at a time driven by one pointer) rather than
  // folded into its mode union, since a pinch can start mid-way through
  // whatever the first finger down was already doing.
  const touchPointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ startDistance: number; startScale: number; anchorX: number; anchorY: number } | null>(null);

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
    if (e.pointerType === "touch") {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointersRef.current.size === 2) {
        // Second finger just landed — hand off from whatever single-finger
        // gesture the first finger may have already started (a drag, a
        // bond draw, ...) to a pinch-zoom gesture instead.
        dragRef.current = null;
        const pts = [...touchPointersRef.current.values()];
        const svg = svgRef.current;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          const { view } = useMoleculeStore.getState();
          pinchRef.current = {
            startDistance: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
            startScale: view.scale,
            anchorX: (midX - rect.left - view.tx) / view.scale,
            anchorY: (midY - rect.top - view.ty) / view.scale,
          };
        }
        return;
      }
      if (touchPointersRef.current.size > 2) return; // ignore a third finger
    }

    if (e.button === 2) {
      // Right-click is a quick way back to Select/Move, matching the common
      // "right-click to stop whatever you were doing" convention — it
      // doesn't also act on whatever's under the cursor, just switches tools.
      useMoleculeStore.getState().setTool("select");
      return;
    }
    const store = useMoleculeStore.getState();
    const { tool, molecule } = store;

    // Middle-mouse-button always pans, regardless of the active tool.
    if (e.button === 1) {
      dragRef.current = { mode: "pan", startClient: { x: e.clientX, y: e.clientY }, startView: store.view };
      return;
    }

    const svg = svgRef.current;
    svg?.setPointerCapture?.(e.pointerId);

    const pt = clientToWorld(e.clientX, e.clientY);
    const hitAtom = atomAt(molecule, pt);
    const hitBond = !hitAtom ? bondAt(molecule, pt) : null;
    store.setBondPreview(null);
    store.setChainPreview(null);

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

    if (tool === "plus") {
      // Stays the active tool (like the ring/atom tools) so several "+"
      // signs can be stamped down in a row without reselecting it each time.
      store.addPlusAnnotation(pt);
      return;
    }

    if (tool === "bracket") {
      store.setSelectedAnnotationIds(new Set());
      dragRef.current = { mode: "bracket-draw", start: pt };
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
        // Only a lone atom with exactly one bond has an unambiguous single
        // angle to snap to while it's dragged (see the "move" case in
        // onPointerMove) — anything else (a branching atom, an isolated
        // atom, or a multi-atom drag) is left as a free, unsnapped move.
        const nbrs = newSelected.size === 1 ? neighborIds(molecule, hitAtom) : [];
        const anchor = nbrs.length === 1
          ? { atomId: hitAtom, neighborPos: { x: molecule.atoms[nbrs[0]].x, y: molecule.atoms[nbrs[0]].y }, originalLength: dist(molecule.atoms[hitAtom], molecule.atoms[nbrs[0]]) }
          : null;
        dragRef.current = {
          mode: "move",
          ids: [...newSelected],
          start: pt,
          origPositions: [...newSelected].map((id) => ({ id, x: molecule.atoms[id].x, y: molecule.atoms[id].y })),
          before: { molecule, annotations: store.annotations },
          anchor,
        };
      } else if (hitBond) {
        store.setSelectedAnnotationIds(new Set());
        store.setAtomEditTarget(null);
        const b = molecule.bonds[hitBond];
        // Clicking a bond that's already selected (and only that bond, i.e.
        // exactly its two atoms are the current selection) cycles its
        // order 1 -> 2 -> 3 -> 1, instead of just re-selecting it — a
        // quick way to change bond order without switching tools.
        if (!e.shiftKey && store.selected.size === 2 && store.selected.has(b.a1) && store.selected.has(b.a2)) {
          const nextOrder: BondOrder = b.order === 1 ? 2 : b.order === 2 ? 3 : 1;
          store.setBondOrder(hitBond, nextOrder);
          return;
        }
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
      // Snapshot before erasing anything, so the whole click-and-drag
      // stroke undoes as a single step (see the "erase" branches in
      // onPointerMove/onPointerUp) instead of one undo per atom/bond.
      const before = { molecule, annotations: store.annotations };
      if (hitAtom) store.deleteAtomTransient(hitAtom);
      else if (hitBond) store.deleteBondTransient(hitBond);
      dragRef.current = { mode: "erase", before };
      return;
    }

    if (tool === "atom") {
      if (hitAtom) {
        if (store.atomGroup) store.setAtomGroupOf(hitAtom, store.atomGroup);
        else if (store.atomIsotope) store.setAtomIsotopeOf(hitAtom, store.atomIsotope);
        else store.setAtomElementOf(hitAtom, store.atomElement);
        store.setAtomEditTarget(hitAtom);
        store.setSelected(new Set([hitAtom]));
      } else {
        store.setAtomEditTarget(null);
        if (store.atomIsotope) {
          const preset = ISOTOPE_PRESETS.find((p) => p.id === store.atomIsotope);
          if (preset) store.addAtom(pt, preset.element, undefined, preset.massNumber);
        } else {
          store.addAtom(pt, store.atomElement, store.atomGroup ?? undefined);
        }
      }
      return;
    }

    if (tool === "chain") {
      // Nothing is committed yet — a plain click (no real drag) drops a
      // single new carbon at the press point (see onPointerUp), same as
      // the atom tool. Only once the drag moves past the click threshold
      // does a bonded zig-zag chain actually start growing from here.
      dragRef.current = { mode: "chain", from: hitAtom, start: pt };
      return;
    }

    if (tool === "stereo-label") {
      if (hitAtom) store.cycleAtomStereoLabel(hitAtom);
      return;
    }

    if (tool === "charge-plus" || tool === "charge-minus") {
      if (hitAtom) store.setAtomCharge(hitAtom, tool === "charge-plus" ? 1 : -1);
      return;
    }

    if (tool === "lone-pair") {
      if (hitAtom) store.cycleAtomLonePairs(hitAtom);
      return;
    }

    if (tool === "radical") {
      if (hitAtom) store.toggleAtomRadical(hitAtom);
      return;
    }

    if (tool === "ring") {
      const template = RING_TEMPLATES.find((t) => t.id === store.ringTemplateId)!;
      const attachment: RingAttachment = hitAtom
        ? { type: "atom", atomId: hitAtom }
        : hitBond
        ? { type: "bond", a1: molecule.bonds[hitBond].a1, a2: molecule.bonds[hitBond].a2 }
        : { type: "none" };
      store.placeRing(template, pt, attachment);
      return;
    }

    if (tool === "functional-group") {
      const template = FUNCTIONAL_GROUP_TEMPLATES.find((t) => t.id === store.functionalGroupTemplateId)!;
      const attachment: FunctionalGroupAttachment = hitAtom ? { type: "atom", atomId: hitAtom } : { type: "none" };
      // Same press-drag-release interaction as drawing a bond: a plain
      // click places the group at its automatic angle, but dragging first
      // lets you set the angle yourself before it's committed (see
      // onPointerMove/onPointerUp's "functional-group" branches).
      dragRef.current = { mode: "functional-group", template, attachment, center: pt };
      store.setFunctionalGroupDesiredAngle(null);
      store.setFunctionalGroupPendingPlacement({ template, attachment, center: pt });
      return;
    }

    if (tool.startsWith("bond") || tool === "wedge" || tool === "dash" || tool === "wavy") {
      if (hitBond) {
        if (tool === "wedge" || tool === "dash") {
          // Clicking the wedge/dash tool again on a bond that's already
          // that stereo has nothing new to set, so instead flip which atom
          // is the narrow/wide end — the only other thing repeat-clicking
          // could usefully mean here.
          if (molecule.bonds[hitBond].stereo === tool) {
            store.flipBondDirection(hitBond);
          } else {
            store.setBondStereo(hitBond, tool);
          }
        } else if (tool === "wavy") {
          store.setBondStereo(hitBond, "wavy");
        } else if (tool === "bond-2" && molecule.bonds[hitBond].order === 2) {
          // Clicking the double-bond tool again on an existing double bond
          // cycles the second line: center -> left -> right -> center.
          // Handy for ring systems like benzene where you want the inner
          // line on a particular side.
          store.cycleDoubleBondSide(hitBond);
        } else if (tool === "bond-1") {
          // The single-bond tool doubles as a quick order-cycling tool on
          // an existing bond: single -> double -> triple -> single, so you
          // don't need to switch tools just to bump a bond's order.
          const current = molecule.bonds[hitBond].order;
          const nextOrder = (current === 1 ? 2 : current === 2 ? 3 : 1) as BondOrder;
          store.setBondOrder(hitBond, nextOrder);
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
    if (e.pointerType === "touch" && touchPointersRef.current.has(e.pointerId)) {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current && touchPointersRef.current.size === 2) {
      const svg = svgRef.current;
      if (svg) {
        const pts = [...touchPointersRef.current.values()];
        const rect = svg.getBoundingClientRect();
        const distance = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const { startDistance, startScale, anchorX, anchorY } = pinchRef.current;
        const newScale = Math.min(4, Math.max(0.25, startScale * (distance / startDistance)));
        useMoleculeStore.getState().setView({
          scale: newScale,
          tx: midX - rect.left - anchorX * newScale,
          ty: midY - rect.top - anchorY * newScale,
        });
      }
      return;
    }
    const store = useMoleculeStore.getState();
    const pt = clientToWorld(e.clientX, e.clientY);
    const hitAtom = atomAt(store.molecule, pt);
    store.setHoverAtomId(hitAtom);
    store.setHoverBondId(hitAtom ? null : bondAt(store.molecule, pt));
    store.setHoverPoint(pt);

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === "pan") {
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      store.setView({ ...drag.startView, tx: drag.startView.tx + dx, ty: drag.startView.ty + dy });
      return;
    }

    if (drag.mode === "erase") {
      if (hitAtom) store.deleteAtomTransient(hitAtom);
      else {
        const hitBond = bondAt(store.molecule, pt);
        if (hitBond) store.deleteBondTransient(hitBond);
      }
      return;
    }

    if (drag.mode === "move") {
      const lockLength = e.ctrlKey || e.metaKey;
      if (drag.anchor && (lockLength || !e.shiftKey)) {
        // Three ways to adjust a singly-bonded atom while dragging it:
        //  - default: angle snaps to 30°, length always follows the drag
        //    (see below for why length isn't forced to standard here).
        //  - Ctrl/Cmd: length is locked to whatever it already was when
        //    the drag started, and the angle snaps to a finer 15° instead
        //    — for "I like this bond's length, I just want to swing it to
        //    a clean angle" without the length drifting with the cursor.
        //  - Shift: fully free, no snapping of either.
        // Length always just follows the drag in the default case, exactly
        // like the arrow tool: otherwise, lengthening a bond with Shift
        // and then nudging its angle without Shift would snap the length
        // back to standard and undo the very thing Shift was just used for.
        const { atomId, neighborPos, originalLength } = drag.anchor;
        const step = lockLength ? Math.PI / 12 : Math.PI / 6;
        const length = lockLength ? originalLength : dist(neighborPos, pt);
        const p = polar(neighborPos.x, neighborPos.y, length, snapAngle(angleOf(neighborPos, pt), step));
        store.moveAtomsTransient({ [atomId]: p });
        store.setAtomMoveAnchor(drag.anchor);
        store.setStatus(lockLength ? "status.moveAtomSnapLocked" : "status.moveAtomSnap");
      } else {
        const dx = pt.x - drag.start.x;
        const dy = pt.y - drag.start.y;
        const moves: Record<string, Point> = {};
        for (const p of drag.origPositions) moves[p.id] = { x: p.x + dx, y: p.y + dy };
        store.moveAtomsTransient(moves);
        if (drag.anchor) store.setAtomMoveAnchor(null); // Shift held: snapping suspended for this drag
      }
      return;
    }

    if (drag.mode === "rotate") {
      let deltaAngle = Math.atan2(pt.y - drag.center.y, pt.x - drag.center.x) - drag.startAngle;
      if (e.shiftKey) {
        // Hold Shift for the classic 15°-increment snap; free (any-angle)
        // rotation is the default, so a 4-membered ring can land exactly
        // square instead of only ever landing on 30° steps.
        const step = Math.PI / 12;
        deltaAngle = Math.round(deltaAngle / step) * step;
      }
      const cos = Math.cos(deltaAngle);
      const sin = Math.sin(deltaAngle);
      const moves: Record<string, Point> = {};
      for (const p of drag.origPositions) {
        const dx = p.x - drag.center.x;
        const dy = p.y - drag.center.y;
        moves[p.id] = { x: drag.center.x + dx * cos - dy * sin, y: drag.center.y + dx * sin + dy * cos };
      }
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
          const ang = bestNewAngle(store.molecule, drag.from, desired, e.shiftKey);
          previewPoint = polar(fromAtom.x, fromAtom.y, BOND_LEN, ang);
        }
        store.setBondPreview({ from: drag.from, to: previewPoint, targetAtomId });
      }
      store.setStatus("status.dragBond");
      return;
    }

    if (drag.mode === "functional-group") {
      // Same interaction as dragging out a bond: no explicit angle until
      // the cursor's actually moved away from the press point, then it
      // snaps to 30° (Shift for the exact freeform angle instead).
      const movedEnough = dist(drag.center, pt) > 12;
      store.setFunctionalGroupDesiredAngle(movedEnough ? (e.shiftKey ? angleOf(drag.center, pt) : snapAngle(angleOf(drag.center, pt))) : null);
      store.setStatus("status.dragFunctionalGroup");
      return;
    }

    if (drag.mode === "chain") {
      const fromAtom = drag.from ? store.molecule.atoms[drag.from] : null;
      const anchor: Point = fromAtom ? { x: fromAtom.x, y: fromAtom.y } : drag.start;
      const points = computeChainPoints(store.molecule, drag.from ?? "", anchor, pt, e.shiftKey);
      store.setChainPreview(points.length > 0 ? { from: drag.from, anchor, points } : null);
      store.setStatus("status.dragChain");
      return;
    }

    if (drag.mode === "arrow-draw") {
      const end = e.shiftKey || dist(drag.start, pt) <= 8
        ? pt
        : polar(drag.start.x, drag.start.y, dist(drag.start, pt), snapAngle(angleOf(drag.start, pt)));
      store.setArrowPreview({ x1: drag.start.x, y1: drag.start.y, x2: end.x, y2: end.y });
      store.setStatus("status.dragArrow");
      return;
    }

    if (drag.mode === "bracket-draw") {
      store.setBracketPairPreview({ x1: drag.start.x, y1: drag.start.y, x2: pt.x, y2: pt.y });
    }
  }, [clientToWorld]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      touchPointersRef.current.delete(e.pointerId);
      if (touchPointersRef.current.size < 2) pinchRef.current = null;
      if (touchPointersRef.current.size > 0) {
        // A pinch just ended (or one of 2+ fingers lifted) — the
        // remaining finger(s) never went through onPointerDown's tool
        // dispatch for where they currently are, so don't let this fall
        // through into resuming/starting some other gesture.
        dragRef.current = null;
        return;
      }
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const store = useMoleculeStore.getState();
    const svg = svgRef.current;
    if (svg && svg.hasPointerCapture?.(e.pointerId)) {
      try { svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    store.setBondPreview(null);
    store.setChainPreview(null);
    store.setAtomMoveAnchor(null);

    if (drag.mode === "erase") {
      // Only push an undo step if something was actually erased — a plain
      // click on empty canvas with the erase tool shouldn't clutter the
      // undo stack with a no-op entry.
      if (store.molecule !== drag.before.molecule) store.commitCheckpoint(drag.before);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "move") {
      store.commitCheckpoint(drag.before);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "rotate") {
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
        const ang = bestNewAngle(molecule, from, desired, e.shiftKey);
        const p = polar(fromAtom.x, fromAtom.y, BOND_LEN, ang);
        toAtom = store.addAtom(p, "C");
      }

      const order = (tool === "bond-2" ? 2 : tool === "bond-3" ? 3 : 1) as BondOrder;
      const stereo: BondStereo = tool === "wedge" ? "wedge" : tool === "dash" ? "dash" : tool === "wavy" ? "wavy" : "none";
      store.addBond(from, toAtom, stereo === "none" ? order : 1, stereo);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "functional-group") {
      // placeFunctionalGroup reads the angle onPointerMove just set (or
      // null, for a plain click with no drag) directly from the store.
      store.placeFunctionalGroup(drag.template, drag.center, drag.attachment);
      store.setFunctionalGroupDesiredAngle(null);
      store.setFunctionalGroupPendingPlacement(null);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "chain") {
      const pt = clientToWorld(e.clientX, e.clientY);
      const fromAtom = drag.from ? store.molecule.atoms[drag.from] : null;
      const anchor: Point = fromAtom ? { x: fromAtom.x, y: fromAtom.y } : drag.start;
      const points = computeChainPoints(store.molecule, drag.from ?? "", anchor, pt, e.shiftKey);
      store.addChain(drag.from, anchor, points);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "arrow-draw") {
      store.setArrowPreview(null);
      const pt = clientToWorld(e.clientX, e.clientY);
      let end: Point;
      if (dist(drag.start, pt) <= 8) {
        // A near-zero drag still places a reasonable default-length arrow
        // pointing right, rather than a degenerate zero-length one.
        end = { x: drag.start.x + BOND_LEN * 1.5, y: drag.start.y };
      } else if (e.shiftKey) {
        end = pt; // free angle — same Shift-to-bypass convention as bonds
      } else {
        end = polar(drag.start.x, drag.start.y, dist(drag.start, pt), snapAngle(angleOf(drag.start, pt)));
      }
      const id = store.addArrowAnnotation(drag.start, end, store.arrowVariant, store.arrowBarb, store.arrowHeadSize);
      store.setSelectedAnnotationIds(new Set([id]));
      store.setTool("select");
      return;
    }

    if (drag.mode === "bracket-draw") {
      store.setBracketPairPreview(null);
      const pt = clientToWorld(e.clientX, e.clientY);
      const { openId, closeId } = store.addBracketPair(drag.start, pt, store.bracketVariant);
      store.setSelectedAnnotationIds(new Set([openId, closeId]));
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
    const store = useMoleculeStore.getState();
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    store.setView((v) => {
      const newScale = Math.min(4, Math.max(0.25, v.scale * factor));
      const tx = mx - ((mx - v.tx) / v.scale) * newScale;
      const ty = my - ((my - v.ty) / v.scale) * newScale;
      return { scale: newScale, tx, ty };
    });
  }, [svgRef]);

  /** Starts a free-angle rotation drag for `ids` around `center` — called
   * from the rotate handle MoleculeCanvas draws above the current
   * selection. Unlike the sidebar's fixed ±30° nudge buttons, this tracks
   * the cursor continuously so a selection can land on any angle (e.g. a
   * 4-membered ring rotated exactly onto a square orientation), snapping
   * to 15° steps only while Shift is held. */
  const onRotateHandleDown = useCallback((e: React.PointerEvent, ids: string[], center: Point) => {
    e.stopPropagation();
    const store = useMoleculeStore.getState();
    const svg = svgRef.current;
    svg?.setPointerCapture?.(e.pointerId);
    const pt = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      mode: "rotate",
      ids,
      center,
      startAngle: Math.atan2(pt.y - center.y, pt.x - center.x),
      origPositions: ids.map((id) => ({ id, x: store.molecule.atoms[id].x, y: store.molecule.atoms[id].y })),
      before: { molecule: store.molecule, annotations: store.annotations },
    };
  }, [clientToWorld, svgRef]);

  const onPointerLeave = useCallback(() => {
    const store = useMoleculeStore.getState();
    // Only clear the hover-preview bits — not mid-drag state, which keeps
    // running via pointer capture even if the cursor briefly leaves the
    // <svg> bounds.
    store.setHoverAtomId(null);
    store.setHoverBondId(null);
    store.setHoverPoint(null);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onWheel, onDoubleClick, onPointerLeave, onRotateHandleDown };
}
