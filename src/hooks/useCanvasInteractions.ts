import { useCallback, useRef, type RefObject } from "react";
import type { Annotation, Molecule, Point, RingAttachment, RingTemplate, FunctionalGroupAttachment, FunctionalGroupTemplate } from "../types/chemistry";
import { useMoleculeStore, snapStepRadians } from "../store/useMoleculeStore";
import { atomAt, atomsInRect, bondAt, annotationsInRect, atomsInPolygon, annotationsInPolygon, MIN_HIT_PX_PRECISE, MIN_HIT_PX_TOUCH } from "../engine/hitTest";
import { bestNewAngle } from "../engine/bondAngles";
import { neighborIds } from "../model/valence";
import { computeChainPoints } from "../engine/chainPlacement";
import { angleOf, dist, polar, snapAngle } from "../model/geometry";
import { fragmentOf } from "../model/molecule";
import { BOND_LEN, RING_TEMPLATES, ISOTOPE_PRESETS } from "../model/constants";
import { FUNCTIONAL_GROUP_TEMPLATES } from "../model/functionalGroupTemplates";
import type { BondOrder, BondStereo } from "../types/chemistry";

type DragState =
  | { mode: "pan"; startClient: Point; startView: { scale: number; tx: number; ty: number }; clickToSelectIfNoDrag?: boolean }
  | { mode: "move"; ids: string[]; start: Point; origPositions: { id: string; x: number; y: number }[]; before: { molecule: Molecule; annotations: Record<string, Annotation> }; anchor: { atomId: string; neighborPos: Point; originalLength: number } | null }
  | { mode: "rotate"; ids: string[]; center: Point; startAngle: number; baselineDeg: number; origPositions: { id: string; x: number; y: number }[]; before: { molecule: Molecule; annotations: Record<string, Annotation> } }
  | { mode: "bond"; from: string }
  | { mode: "atom-bond"; from: string }
  | { mode: "ring"; template: RingTemplate }
  | { mode: "functional-group"; template: FunctionalGroupTemplate; attachment: FunctionalGroupAttachment; center: Point }
  | { mode: "chain"; from: string | null; start: Point }
  | { mode: "erase"; before: { molecule: Molecule; annotations: Record<string, Annotation> } }
  | { mode: "marquee"; base: Set<string>; annotationBase: Set<string>; start: Point }
  | { mode: "lasso"; base: Set<string>; annotationBase: Set<string>; points: Point[] }
  | { mode: "arrow-draw"; start: Point }
  | { mode: "bracket-draw"; start: Point }
  | { mode: "shape-draw"; start: Point }
  | { mode: "orbital-draw"; start: Point }
  | { mode: "tlc-draw"; start: Point };

/** The user's angle-snapping preference, in radians, read fresh from the
 * store at each use rather than captured in a hook dependency. Every call
 * site here is inside an imperative pointer/key handler that already reads
 * `store` (or getState()) directly to avoid stale closures, so this follows
 * the same pattern. */
function snapStep(): number {
  return snapStepRadians(useMoleculeStore.getState().snapAngleDegrees);
}

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

  /**
   * Hit-testing wrappers that keep target sizes usable at every zoom level.
   *
   * The raw radii in hitTest.ts are world units, so they shrink on screen as
   * the view zooms out: at the minimum zoom an atom is a 4px target and a bond
   * line 2px, which a fingertip cannot hit. These pass the live zoom through
   * so the target keeps an on-screen floor instead (see hitTest.ts's
   * hitRadius), and raise that floor for touch, where a finger is far blunter
   * than a mouse pointer.
   *
   * The touch flag is tracked from pointerdown rather than passed per call so
   * that the plain `atomAt(mol, pt)` call sites keep their existing shape.
   */
  const touchInputRef = useRef(false);

  /**
   * Whether drawing should bypass the 30-degree angle snap.
   *
   * True when Shift is held (desktop) OR the persistent freeAngle toggle is
   * on (store.freeAngle). The toggle exists because touch has no way to hold
   * a modifier key, so every bond, chain, arrow and functional group drawn by
   * finger was locked to the 30-degree grid. See store's freeAngle doc comment.
   *
   * Read per-call rather than captured, since it can be flipped mid-session
   * (and mid-gesture) from the mobile toolbar.
   *
   * Covers every site where Shift currently bypasses an *angle* snap:
   * bond/atom-bond/chain/arrow/functional-group drawing, and repositioning a
   * singly-bonded atom. Deliberately excluded are the two places where Shift
   * means something else: Shift+click's selection toggle (a discrete click
   * action, not a drawing modifier) and the rotate gesture, where Shift
   * *adds* a 15-degree snap rather than removing one.
   */
  const angleFree = (e: { shiftKey: boolean }): boolean =>
    e.shiftKey || useMoleculeStore.getState().freeAngle;

  const pickAtom = useCallback((mol: Molecule, pt: Point, excludeId: string | null = null, worldRadius = 16): string | null => {
    const { view } = useMoleculeStore.getState();
    return atomAt(mol, pt, worldRadius, excludeId, view.scale, touchInputRef.current ? MIN_HIT_PX_TOUCH : MIN_HIT_PX_PRECISE);
  }, []);

  const pickBond = useCallback((mol: Molecule, pt: Point, worldTolerance = 8): string | null => {
    const { view } = useMoleculeStore.getState();
    return bondAt(mol, pt, worldTolerance, view.scale, touchInputRef.current ? MIN_HIT_PX_TOUCH : MIN_HIT_PX_PRECISE);
  }, []);

  /**
   * Long-press to open the context menu on touch.
   *
   * The app already had a context menu, but on touch it was reachable only
   * via the browser's native `contextmenu` event, which is unreliable for
   * exactly the content this is (SVG). The existing code said as much: its
   * own comment noted that iOS Safari "may simply do nothing there" for a
   * long-press on non-text elements. The practical result was that eleven
   * actions — dative bond, haptic bond, aromatic circle, charge bracket,
   * ignore-valence, per-atom highlight, duplicate, copy, paste, select-all,
   * IUPAC name — existed on a phone with no way to reach them at all.
   *
   * So this adds the same timer-based detector AtomView already uses for its
   * own long-press (550ms, cancelled past 8px of movement), rather than
   * relying on the native event at all.
   *
   * Deliberately NOT started when the press begins on an atom: AtomView
   * already claims that gesture for the free-text label editor, and both
   * timers firing would open a label editor and a context menu at once.
   * This mirrors the same exclusion onContextMenu has always applied.
   */
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const openContextMenuAt = useCallback((clientX: number, clientY: number) => {
    const store = useMoleculeStore.getState();
    const pt = clientToWorld(clientX, clientY);
    const atomId = pickAtom(store.molecule, pt);
    const bondId = atomId ? null : pickBond(store.molecule, pt);
    store.setContextMenu({ x: clientX, y: clientY, atomId, bondId });
  }, [clientToWorld, pickAtom, pickBond]);

  /**
   * Aborts whatever single-pointer gesture is in flight, without losing the
   * work it already did.
   *
   * This exists because several tools mutate the molecule on *pointerdown*
   * and only push their undo checkpoint in onPointerUp:
   *
   *   - erase   deletes the hit atom/bond immediately, checkpoints on release
   *   - move    repositions atoms as you drag, checkpoints on release
   *   - bond    creates a carbon at the press point if you missed an atom,
   *             then draws the bond on release
   *   - atom    creates the atom immediately, then draws a bond on drag
   *
   * A second finger landing (starting a pinch) or a cancelled pointer
   * abandons that drag without ever reaching onPointerUp — so before this
   * existed the mutations stayed but the undo entry never got pushed, and
   * the user lost the ability to undo their own edit. Worse for erase, where
   * the change is destructive by definition.
   *
   * Rather than roll the edit back, this commits it: the user had already
   * seen the erase happen on screen, so silently restoring those atoms would
   * be the more surprising outcome. Committing keeps the model consistent
   * with what was drawn and makes the whole gesture a single undo step.
   *
   * Modes that only ever preview (bond/chain/arrow/bracket/marquee/lasso/
   * functional-group/ring) have nothing to save, so this is a no-op for them
   * beyond clearing the preview state.
   */
  const abortDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    // Clear any preview the in-flight gesture was drawing, so it doesn't stay
    // frozen on the canvas after the gesture is gone.
    const store = useMoleculeStore.getState();
    store.setBondPreview(null);
    store.setChainPreview(null);
    store.setArrowPreview(null);
    store.setBracketPairPreview(null);
    store.setShapePreview(null);
    store.setOrbitalPreview(null);
    store.setTlcPreview(null);
    store.setAtomMoveAnchor(null);

    // Only these three modes mutate the molecule before release, and each
    // already carries the pre-mutation snapshot its own release path uses.
    if (drag.mode === "erase") {
      if (store.molecule !== drag.before.molecule) store.commitCheckpoint(drag.before);
    } else if (drag.mode === "move") {
      store.commitCheckpoint(drag.before);
    } else if (drag.mode === "rotate") {
      store.commitCheckpoint(drag.before);
    }
    // "bond" and "atom-bond" create their origin atom on pointerdown. There is
    // no snapshot to commit for those (they're single additive actions), and
    // an abandoned pinch mid-bond-draw legitimately leaves the carbon placed
    // — the same result as tapping with the bond tool, which is the gesture
    // the press actually was.
    store.setStatus("status.ready");
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Tracked so hit targets get a finger-sized floor for the rest of the
    // gesture (see hitAtom/hitBond). Set before any hit-testing below.
    touchInputRef.current = e.pointerType === "touch";
    if (e.pointerType === "touch") {
      touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPointersRef.current.size === 2) {
        // Second finger just landed — hand off from whatever single-finger
        // gesture the first finger may have already started (a drag, a
        // bond draw, ...) to a pinch-zoom gesture instead. abortDrag (not a
        // bare `dragRef.current = null`) so whatever that gesture already
        // changed still lands as one undoable step.
        abortDrag();
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
      // Right-click no longer does anything on pointerdown itself — it's
      // handled by the real context menu, wired to the browser's own
      // contextmenu event (see onContextMenu below) so it fires exactly
      // once per right-click regardless of platform, rather than trying
      // to reconstruct that from raw pointer events here.
      return;
    }
    const store = useMoleculeStore.getState();
    const { tool, molecule } = store;

    // Middle-mouse-button always pans, regardless of what's under the
    // cursor or the active tool — same as it's always done. Grabbing
    // *empty* space specifically also still carries the old "quick stop,
    // back to Select" convenience right-click used to have (now that
    // right-click opens the context menu instead): if it turns out to be
    // a plain click rather than an actual drag, onPointerUp below treats
    // it as that shortcut instead of a (successful, if extremely short)
    // pan.
    if (e.button === 1) {
      const svg = svgRef.current;
      svg?.setPointerCapture?.(e.pointerId);
      const pt = clientToWorld(e.clientX, e.clientY);
      const hit = pickAtom(molecule, pt) || pickBond(molecule, pt);
      dragRef.current = {
        mode: "pan",
        startClient: { x: e.clientX, y: e.clientY },
        startView: store.view,
        clickToSelectIfNoDrag: !hit,
      };
      return;
    }

    const svg = svgRef.current;
    svg?.setPointerCapture?.(e.pointerId);

    const pt = clientToWorld(e.clientX, e.clientY);
    const hitAtom = pickAtom(molecule, pt);
    const hitBond = !hitAtom ? pickBond(molecule, pt) : null;
    store.setBondPreview(null);
    store.setChainPreview(null);

    // Arm the touch long-press, except on an atom where AtomView's own
    // long-press (the label editor) has first claim on the gesture.
    clearLongPress();
    longPressFiredRef.current = false;
    if (e.pointerType === "touch" && !hitAtom) {
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        // The press was meant as "show me the menu", not as the active tool's
        // action, so whatever that tool already did on pointerdown is
        // abandoned (and checkpointed, so it stays undoable) rather than
        // being carried to the release as a completed gesture.
        abortDrag();
        openContextMenuAt(e.clientX, e.clientY);
      }, 550);
    }

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

    if (tool === "shape") {
      store.setSelectedAnnotationIds(new Set());
      dragRef.current = { mode: "shape-draw", start: pt };
      return;
    }

    if (tool === "orbital") {
      store.setSelectedAnnotationIds(new Set());
      dragRef.current = { mode: "orbital-draw", start: pt };
      return;
    }

    if (tool === "tlc") {
      store.setSelectedAnnotationIds(new Set());
      dragRef.current = { mode: "tlc-draw", start: pt };
      return;
    }

    if (tool === "select" || tool === "lasso") {
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
        // Empty canvas: start a rectangle ("marquee") selection, or with
        // the lasso tool active, a freeform path — instead of panning.
        // Use the dedicated Pan tool, or a middle-mouse drag, to pan.
        const base = e.shiftKey ? new Set(store.selected) : new Set<string>();
        const annotationBase = e.shiftKey ? new Set(store.selectedAnnotationIds) : new Set<string>();
        store.setSelected(base);
        store.setSelectedAnnotationIds(annotationBase);
        if (tool === "lasso") {
          dragRef.current = { mode: "lasso", base, annotationBase, points: [pt] };
        } else {
          dragRef.current = { mode: "marquee", base, annotationBase, start: pt };
        }
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
        if (store.atomReactiveSite) store.setAtomReactiveSiteOf(hitAtom, store.atomReactiveSite);
        else if (store.atomGroup) store.setAtomGroupOf(hitAtom, store.atomGroup);
        else if (store.atomIsotope) store.setAtomIsotopeOf(hitAtom, store.atomIsotope);
        else store.setAtomElementOf(hitAtom, store.atomElement);
        store.setAtomEditTarget(hitAtom);
        store.setSelected(new Set([hitAtom]));
      } else {
        store.setAtomEditTarget(null);
        // A plain click just places the atom, same as before. But this
        // also starts tracking the drag (see onPointerMove/onPointerUp's
        // "atom-bond" branches, mirroring the "bond" tool almost
        // exactly): if the pointer moves past the click threshold before
        // release, a single bond is drawn from this atom out to a new
        // (or existing, if you drag onto one) atom in that direction —
        // "place an atom with a bond" in one motion instead of two
        // separate tool actions.
        let newAtomId: string;
        if (store.atomReactiveSite) {
          newAtomId = store.addReactiveSiteAtom(pt, store.atomReactiveSite) ?? store.addAtom(pt, store.atomElement, store.atomGroup ?? undefined);
        } else if (store.atomIsotope) {
          const preset = ISOTOPE_PRESETS.find((p) => p.id === store.atomIsotope);
          newAtomId = preset
            ? store.addAtom(pt, preset.element, undefined, preset.massNumber)
            : store.addAtom(pt, store.atomElement, store.atomGroup ?? undefined);
        } else {
          newAtomId = store.addAtom(pt, store.atomElement, store.atomGroup ?? undefined);
        }
        dragRef.current = { mode: "atom-bond", from: newAtomId };
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

    if (tool === "map-number") {
      if (hitAtom) store.handleMapNumberClick(hitAtom);
      return;
    }

    if (tool === "ring") {
      const template = RING_TEMPLATES.find((t) => t.id === store.ringTemplateId)!;
      if (e.pointerType === "touch") {
        // A finger can't hover before landing, so the initial touch-down
        // spot is often a little off from what was actually meant — and
        // the finger itself is covering exactly the atom/bond it's trying
        // to hit. Rather than commit to that first guess, defer to
        // pointer-up: hoverAtomId/hoverBondId/hoverPoint keep tracking the
        // touch the whole time it's held down (onPointerMove updates them
        // unconditionally, drag or not), so MoleculeCanvas's existing
        // hover-driven ring preview already follows the finger live —
        // this just waits for release to actually place it, so a mouse
        // click still commits immediately but a touch press-drag-release
        // gets a chance to land on the right spot first.
        dragRef.current = { mode: "ring", template };
        return;
      }
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

    if (tool.startsWith("bond") || tool === "wedge" || tool === "dash" || tool === "wavy" || tool === "bold" || tool === "bold-hash" || tool === "dashed" || tool === "dative" || tool === "hollow-wedge") {
      if (hitBond) {
        if (tool === "wedge" || tool === "dash" || tool === "hollow-wedge") {
          // Clicking the wedge/dash tool again on a bond that's already
          // that stereo has nothing new to set, so instead flip which atom
          // is the narrow/wide end — the only other thing repeat-clicking
          // could usefully mean here.
          const stereo: BondStereo = tool === "hollow-wedge" ? "hollowWedge" : tool;
          if (molecule.bonds[hitBond].stereo === stereo) {
            store.flipBondDirection(hitBond);
          } else {
            store.setBondStereo(hitBond, stereo);
          }
        } else if (tool === "dative") {
          // Toggle, matching the context menu's dative-bond action: a
          // second click on the same bond turns it back into a plain single
          // bond instead of doing nothing.
          store.setBondDative(hitBond, !molecule.bonds[hitBond].dative);
        } else if (tool === "wavy") {
          store.setBondStereo(hitBond, "wavy");
        } else if (tool === "bold") {
          store.setBondStereo(hitBond, "bold");
        } else if (tool === "bold-hash") {
          store.setBondStereo(hitBond, "boldHash");
        } else if (tool === "dashed") {
          store.setBondStereo(hitBond, "dashed");
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
  }, [clientToWorld, pickAtom, pickBond, clearLongPress, abortDrag, openContextMenuAt]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    // A press that turns into a drag is not a long-press. Same 8px threshold
    // AtomView uses, so the two gestures feel identical.
    const lpStart = longPressStartRef.current;
    if (lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 8) {
      clearLongPress();
    }
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
    const hitAtom = pickAtom(store.molecule, pt);
    store.setHoverAtomId(hitAtom);
    store.setHoverBondId(hitAtom ? null : pickBond(store.molecule, pt));
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
        const hitBond = pickBond(store.molecule, pt);
        if (hitBond) store.deleteBondTransient(hitBond);
      }
      return;
    }

    if (drag.mode === "move") {
      const lockLength = e.ctrlKey || e.metaKey;
      // freeAngle counts here too: Shift bypasses this snap block, and the
      // snap being bypassed is a 30-degree angle snap like the others.
      if (drag.anchor && (lockLength || !angleFree(e))) {
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
      let deltaDeg = ((Math.atan2(pt.y - drag.center.y, pt.x - drag.center.x) - drag.startAngle) * 180) / Math.PI;
      if (e.shiftKey) {
        // Snap the TOTAL angle-from-session-start (baseline + this drag's
        // own motion) onto the nearest 15° — not just this drag's own
        // motion — so it's always pulling toward the same absolute grid
        // this selection started at, however many separate drags it's
        // taken to get here. See onRotateHandleDown's doc comment.
        const step = 15;
        const targetTotal = Math.round((drag.baselineDeg + deltaDeg) / step) * step;
        deltaDeg = targetTotal - drag.baselineDeg;
      }
      const deltaAngle = (deltaDeg * Math.PI) / 180;
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

    if (drag.mode === "lasso") {
      // Only append once the finger/mouse has actually moved a few world
      // units since the last recorded point — otherwise a slow drag piles
      // up a point virtually every pointermove event, which both bloats
      // the path for no visual benefit and makes atomsInPolygon/render
      // work harder than it needs to every frame.
      const last = drag.points[drag.points.length - 1];
      if (dist(last, pt) > 4) drag.points.push(pt);

      const enclosed = atomsInPolygon(store.molecule, drag.points);
      const union = new Set(drag.base);
      enclosed.forEach((id) => union.add(id));
      store.setSelected(union);

      const enclosedAnnotations = annotationsInPolygon(store.annotations, drag.points);
      const annotationUnion = new Set(drag.annotationBase);
      enclosedAnnotations.forEach((id) => annotationUnion.add(id));
      store.setSelectedAnnotationIds(annotationUnion);

      store.setLassoPath([...drag.points]);
      return;
    }

    if (drag.mode === "bond" || drag.mode === "atom-bond") {
      const fromAtom = store.molecule.atoms[drag.from];
      if (fromAtom) {
        const movedEnough = dist(fromAtom, pt) > 12;
        const hit = pickAtom(store.molecule, pt, drag.from, 16);
        let previewPoint: Point;
        let targetAtomId: string | null = null;
        let targetBondId: string | null = null;
        if (hit) {
          previewPoint = { x: store.molecule.atoms[hit].x, y: store.molecule.atoms[hit].y };
          targetAtomId = hit;
        } else if (drag.mode === "atom-bond" && !movedEnough) {
          // Unlike the bond tool (which always ends in a bond, so it
          // always shows a preview toward some default angle even
          // before the cursor moves), a plain click here should place
          // only the atom - no preview until the drag actually clears
          // the click threshold, so it's clear nothing else is
          // committing yet.
          store.setBondPreview(null);
          return;
        } else {
          // No atom to snap onto - check whether the cursor is instead
          // riding close to an existing bond's line (excluding bonds
          // already touching the atom we're dragging from, which the
          // angle snap below handles on its own). If so, snap the new
          // bond's endpoint onto that line rather than wherever the
          // angle grid would otherwise put it, so a new atom doesn't
          // land squarely on top of unrelated geometry - and surface
          // which bond it snapped to for MoleculeCanvas to highlight.
          const nearBond = pickBond(store.molecule, pt, 10);
          const nb = nearBond ? store.molecule.bonds[nearBond] : null;
          if (nb && nb.a1 !== drag.from && nb.a2 !== drag.from) {
            const ba1 = store.molecule.atoms[nb.a1];
            const ba2 = store.molecule.atoms[nb.a2];
            const len = dist(ba1, ba2) || 1;
            const t = Math.max(
              0,
              Math.min(1, ((pt.x - ba1.x) * (ba2.x - ba1.x) + (pt.y - ba1.y) * (ba2.y - ba1.y)) / (len * len))
            );
            previewPoint = { x: ba1.x + t * (ba2.x - ba1.x), y: ba1.y + t * (ba2.y - ba1.y) };
            targetBondId = nearBond;
          } else {
            const desired = movedEnough ? angleOf(fromAtom, pt) : null;
            const ang = bestNewAngle(store.molecule, drag.from, desired, angleFree(e), snapStep());
            previewPoint = polar(fromAtom.x, fromAtom.y, BOND_LEN, ang);
          }
        }
        store.setBondPreview({ from: drag.from, to: previewPoint, targetAtomId, targetBondId });
      }
      store.setStatus("status.dragBond");
      return;
    }

    if (drag.mode === "functional-group") {
      // Same interaction as dragging out a bond: no explicit angle until
      // the cursor's actually moved away from the press point, then it
      // snaps to 30° (Shift for the exact freeform angle instead).
      const movedEnough = dist(drag.center, pt) > 12;
      store.setFunctionalGroupDesiredAngle(movedEnough ? (angleFree(e) ? angleOf(drag.center, pt) : snapAngle(angleOf(drag.center, pt), snapStep())) : null);
      store.setStatus("status.dragFunctionalGroup");
      return;
    }

    if (drag.mode === "chain") {
      const fromAtom = drag.from ? store.molecule.atoms[drag.from] : null;
      const anchor: Point = fromAtom ? { x: fromAtom.x, y: fromAtom.y } : drag.start;
      const points = computeChainPoints(store.molecule, drag.from ?? "", anchor, pt, angleFree(e), snapStep());
      store.setChainPreview(points.length > 0 ? { from: drag.from, anchor, points } : null);
      store.setStatus("status.dragChain");
      return;
    }

    if (drag.mode === "arrow-draw") {
      const end = angleFree(e) || dist(drag.start, pt) <= 8
        ? pt
        : polar(drag.start.x, drag.start.y, dist(drag.start, pt), snapAngle(angleOf(drag.start, pt), snapStep()));
      store.setArrowPreview({ x1: drag.start.x, y1: drag.start.y, x2: end.x, y2: end.y });
      store.setStatus("status.dragArrow");
      return;
    }

    if (drag.mode === "bracket-draw") {
      store.setBracketPairPreview({ x1: drag.start.x, y1: drag.start.y, x2: pt.x, y2: pt.y });
      return;
    }

    if (drag.mode === "shape-draw") {
      store.setShapePreview({ x1: drag.start.x, y1: drag.start.y, x2: pt.x, y2: pt.y });
      store.setStatus("status.dragShape");
      return;
    }

    if (drag.mode === "orbital-draw") {
      store.setOrbitalPreview({ cx: drag.start.x, cy: drag.start.y, x: pt.x, y: pt.y });
      store.setStatus("status.dragOrbital");
      return;
    }

    if (drag.mode === "tlc-draw") {
      store.setTlcPreview({ x1: drag.start.x, y1: drag.start.y, x2: pt.x, y2: pt.y });
      store.setStatus("status.dragTlc");
    }
  }, [clientToWorld, abortDrag, pickAtom, pickBond, clearLongPress]);

  /**
   * A cancelled pointer must NOT be treated as a successful release.
   *
   * MoleculeCanvas wires `onPointerCancel={onPointerUp}`, so a cancelled touch
   * used to run the entire commit path: an interrupted bond-drag still created
   * its bond and endpoint atom, an interrupted bracket-draw still placed its
   * bracket pair, an interrupted arrow still placed its arrow. A cancel means
   * the gesture was torn down by the browser or the OS (a system gesture
   * stealing the pointer, a palm rejection, the window losing focus) — not that
   * the user finished drawing. abortDrag keeps what was already committed to
   * the molecule and just refuses to invent the part that never happened.
   */
  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    clearLongPress();
    if (e.pointerType === "touch") {
      touchPointersRef.current.delete(e.pointerId);
      if (touchPointersRef.current.size < 2) pinchRef.current = null;
    }
    abortDrag();
  }, [abortDrag]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    clearLongPress();
    if (longPressFiredRef.current) {
      // The long-press already opened the menu and abandoned the drag. Fall
      // through to nothing else: this release is the tail of that gesture,
      // not a separate click that should also run the active tool.
      longPressFiredRef.current = false;
      abortDrag();
      return;
    }
    if (e.pointerType === "touch") {
      touchPointersRef.current.delete(e.pointerId);
      if (touchPointersRef.current.size < 2) pinchRef.current = null;
      if (touchPointersRef.current.size > 0) {
        // A pinch just ended (or one of 2+ fingers lifted) — the
        // remaining finger(s) never went through onPointerDown's tool
        // dispatch for where they currently are, so don't let this fall
        // through into resuming/starting some other gesture. abortDrag for the
        // same reason onPointerDown's pinch handoff uses it.
        abortDrag();
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

    if (drag.mode === "pan") {
      // A middle-click-drag that started on empty space and never
      // actually moved (within a small pixel tolerance, same idea as any
      // click-vs-drag threshold) is treated as a plain click instead of
      // a pan — see onPointerDown's identical comment for why.
      const moved = Math.hypot(e.clientX - drag.startClient.x, e.clientY - drag.startClient.y);
      if (drag.clickToSelectIfNoDrag && moved < 4) {
        store.setTool("select");
      }
      return;
    }

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

    if (drag.mode === "lasso") {
      store.setLassoPath(null);
      return;
    }

    if (drag.mode === "ring") {
      // Commits wherever the finger actually lifted, using the same
      // attachment resolution as a mouse click (see onPointerDown's
      // non-touch branch above) — recomputed fresh from the release
      // position rather than trusting the store's hover state, same as
      // every other drag-commit branch in this function does.
      const pt = clientToWorld(e.clientX, e.clientY);
      const { molecule } = store;
      const hitAtom = pickAtom(molecule, pt);
      const hitBond = !hitAtom ? pickBond(molecule, pt) : null;
      const attachment: RingAttachment = hitAtom
        ? { type: "atom", atomId: hitAtom }
        : hitBond
        ? { type: "bond", a1: molecule.bonds[hitBond].a1, a2: molecule.bonds[hitBond].a2 }
        : { type: "none" };
      store.placeRing(drag.template, pt, attachment);
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "bond") {
      const pt = clientToWorld(e.clientX, e.clientY);
      const { molecule, tool } = store;
      const from = drag.from;
      const fromAtom = molecule.atoms[from];
      if (!fromAtom) return;
      const movedEnough = dist(fromAtom, pt) > 12;
      const hitAtom = pickAtom(molecule, pt);

      let toAtom: string;
      if (hitAtom && hitAtom !== from) {
        toAtom = hitAtom;
      } else {
        const desired = movedEnough ? angleOf(fromAtom, pt) : null;
        const ang = bestNewAngle(molecule, from, desired, angleFree(e), snapStep());
        const p = polar(fromAtom.x, fromAtom.y, BOND_LEN, ang);
        toAtom = store.addAtom(p, "C");
      }

      const order = (tool === "bond-2" ? 2 : tool === "bond-3" ? 3 : 1) as BondOrder;
      const stereo: BondStereo = tool === "wedge" ? "wedge"
        : tool === "hollow-wedge" ? "hollowWedge"
        : tool === "dash" ? "dash"
        : tool === "wavy" ? "wavy"
        : tool === "bold" ? "bold"
        : tool === "bold-hash" ? "boldHash"
        : tool === "dashed" ? "dashed"
        : "none";
      store.addBond(from, toAtom, stereo === "none" ? order : 1, stereo, tool === "dative");
      store.setStatus("status.ready");
      return;
    }

    if (drag.mode === "atom-bond") {
      // Mirrors "bond" above almost exactly, with one deliberate
      // difference: a plain click (not moved past the threshold) here
      // means "just place the atom" - the atom itself was already
      // created back in onPointerDown, so a non-drag release adds
      // nothing further. Only a real drag adds the bond (+ endpoint
      // atom, or snaps onto an existing one) that "bond" mode always
      // adds regardless of drag distance.
      const pt = clientToWorld(e.clientX, e.clientY);
      const { molecule } = store;
      const from = drag.from;
      const fromAtom = molecule.atoms[from];
      if (!fromAtom) return;
      const movedEnough = dist(fromAtom, pt) > 12;
      if (!movedEnough) {
        store.setStatus("status.ready");
        return;
      }
      const hitAtom = pickAtom(molecule, pt, from, 16);
      const toAtom = hitAtom ?? store.addAtom(polar(fromAtom.x, fromAtom.y, BOND_LEN, bestNewAngle(molecule, from, angleOf(fromAtom, pt), angleFree(e), snapStep())), "C");
      store.addBond(from, toAtom, 1, "none");
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
      const points = computeChainPoints(store.molecule, drag.from ?? "", anchor, pt, angleFree(e), snapStep());
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
      } else if (angleFree(e)) {
        end = pt; // free angle — same Shift-to-bypass convention as bonds
      } else {
        end = polar(drag.start.x, drag.start.y, dist(drag.start, pt), snapAngle(angleOf(drag.start, pt), snapStep()));
      }
      const id = store.addArrowAnnotation(
        drag.start,
        end,
        store.arrowVariant,
        store.arrowBarb,
        store.arrowHeadSize,
        store.arrowDashed,
        store.arrowHeadStyle === "auto" ? undefined : store.arrowHeadStyle,
        store.arrowTailStyle === "auto" ? undefined : store.arrowTailStyle,
        store.arrowShaftStyle === "auto" ? undefined : store.arrowShaftStyle,
      );
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
      return;
    }

    if (drag.mode === "shape-draw") {
      store.setShapePreview(null);
      const pt = clientToWorld(e.clientX, e.clientY);
      const id = store.addShapeAnnotation(drag.start, pt, store.shapeVariant, store.shapeFilled);
      store.setSelectedAnnotationIds(new Set([id]));
      store.setTool("select");
      return;
    }

    if (drag.mode === "orbital-draw") {
      store.setOrbitalPreview(null);
      const pt = clientToWorld(e.clientX, e.clientY);
      const id = store.addOrbitalAnnotation(drag.start, pt, store.orbitalVariant, store.orbitalFilled);
      store.setSelectedAnnotationIds(new Set([id]));
      store.setTool("select");
      return;
    }

    if (drag.mode === "tlc-draw") {
      store.setTlcPreview(null);
      const pt = clientToWorld(e.clientX, e.clientY);
      const id = store.addTlcPlate(drag.start, pt);
      store.setSelectedAnnotationIds(new Set([id]));
      store.setTool("select");
    }
  }, [clientToWorld, pickAtom, pickBond, abortDrag, clearLongPress]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const store = useMoleculeStore.getState();
    if (store.tool !== "select" && store.tool !== "lasso") return;
    const { molecule } = store;
    const pt = clientToWorld(e.clientX, e.clientY);
    const hitAtom = pickAtom(molecule, pt);
    const hitBond = !hitAtom ? pickBond(molecule, pt) : null;

    if (hitAtom) {
      store.setSelected(fragmentOf(molecule, hitAtom));
    } else if (hitBond) {
      store.setSelected(fragmentOf(molecule, molecule.bonds[hitBond].a1));
    }
  }, [clientToWorld, pickAtom, pickBond]);

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
   * to 15° steps only while Shift is held.
   *
   * Shift's snap targets absolute 15°-of-arc positions measured from this
   * exact selection's own rotation "session" (see RotationSession) — not
   * just this one drag's own motion — so re-grabbing the handle after an
   * earlier free (non-snapped) rotation still pulls cleanly onto
   * 15/30/45/60° etc. instead of only ever snapping in fixed steps
   * relative to wherever it already happened to stop. A fresh session
   * starts (current positions become its "0°" baseline) the first time
   * this exact set of atoms is grabbed; grabbing the same selection again
   * later reuses it, which is also what makes resetRotation possible.
   */
  const onRotateHandleDown = useCallback((e: React.PointerEvent, ids: string[], center: Point) => {
    e.stopPropagation();
    const store = useMoleculeStore.getState();
    const svg = svgRef.current;
    svg?.setPointerCapture?.(e.pointerId);
    const pt = clientToWorld(e.clientX, e.clientY);

    const key = [...ids].sort().join(",");
    let session = store.rotationSession;
    if (!session || session.key !== key) {
      session = {
        key,
        center,
        original: Object.fromEntries(ids.map((id) => [id, { x: store.molecule.atoms[id].x, y: store.molecule.atoms[id].y }])),
      };
      store.setRotationSession(session);
    }

    // How far this selection has already been rotated since the session
    // started, measured fresh from geometry (current position of one
    // reference atom vs. its position in session.original, both read
    // around the session's own fixed pivot) rather than an accumulated
    // running total — sidesteps any float drift across many small drags.
    const refId = ids[0];
    const origRef = session.original[refId];
    const curRef = store.molecule.atoms[refId];
    const angleOrig = Math.atan2(origRef.y - session.center.y, origRef.x - session.center.x);
    const angleCur = Math.atan2(curRef.y - session.center.y, curRef.x - session.center.x);
    const baselineDeg = ((angleCur - angleOrig) * 180) / Math.PI;

    dragRef.current = {
      mode: "rotate",
      ids,
      center: session.center,
      startAngle: Math.atan2(pt.y - session.center.y, pt.x - session.center.x),
      baselineDeg,
      origPositions: ids.map((id) => ({ id, x: store.molecule.atoms[id].x, y: store.molecule.atoms[id].y })),
      before: { molecule: store.molecule, annotations: store.annotations },
    };
  }, [clientToWorld, svgRef, pickAtom, pickBond]);

  const onPointerLeave = useCallback(() => {
    const store = useMoleculeStore.getState();
    // Only clear the hover-preview bits — not mid-drag state, which keeps
    // running via pointer capture even if the cursor briefly leaves the
    // <svg> bounds.
    store.setHoverAtomId(null);
    store.setHoverBondId(null);
    store.setHoverPoint(null);
  }, []);

  /** Right-click (or, on a touchpad/touchscreen, whatever gesture the OS
   * maps to a "contextmenu" event) — opens the ContextMenu component at
   * the click point, hit-testing what's underneath so it can offer
   * atom/bond-specific actions on top of the always-available
   * selection/canvas ones. Doesn't itself change tool or selection; it's
   * purely "figure out what's here and let the menu component decide
   * what to show for it". */
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const store = useMoleculeStore.getState();
    const pt = clientToWorld(e.clientX, e.clientY);
    const atomId = pickAtom(store.molecule, pt);
    const bondId = atomId ? null : pickBond(store.molecule, pt);
    // A genuine right-click (button === 2) always opens the menu. Some
    // mobile/touchscreen browsers also dispatch a contextmenu event on a
    // long-press, reported as button 0 — that's let through here too,
    // but only for a long-press landing on a bond or empty canvas.
    // Landing directly on an atom is deliberately excluded: AtomView's
    // own long-press handling already claims that exact gesture there,
    // to open the free-text label editor instead (see AtomView.tsx and
    // ShortcutsOverlay.tsx's "middle-click / long-press" entry) — the
    // existing rename gesture has first claim on a long-press-on-an-atom,
    // so this menu only picks up the touch cases that gesture doesn't
    // already cover.
    //
    // This still leaves genuine touch reliability gaps this doesn't try
    // to solve: iOS Safari in particular has long been inconsistent
    // about firing a native contextmenu event from a long-press on
    // arbitrary (non-text/link/image) elements at all, so a bond or
    // empty-canvas long-press may simply do nothing there rather than
    // opening this menu. A fully reliable cross-platform version of this
    // would need its own timer-based gesture detector, the same pattern
    // AtomView already uses for its long-press rather than relying on
    // the browser's native event — a bigger, separate change from this
    // one.
    if (e.button !== 2 && atomId) return;
    store.setContextMenu({ x: e.clientX, y: e.clientY, atomId, bondId });
  }, [clientToWorld, pickAtom, pickBond]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel, onDoubleClick, onPointerLeave, onRotateHandleDown, onContextMenu };
}
