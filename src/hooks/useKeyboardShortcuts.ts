import { useEffect, useRef } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import type { Element } from "../types/chemistry";

/**
 * Keyboard shortcuts (desktop):
 *   V = select   Q = lasso select   B = bond   C = chain   R = ring   E = erase   W = wedge   H = show hydrogens
 *   T = text box   A = reaction arrow   K = bracket ( [ {   + = "+" annotation
 *   1 / 2 / 3 = bond order   [ / ] = rotate selection left/right 30°
 *   Enter = open free-text label editor on a single targeted atom
 *   (middle-click an atom, or press-and-hold on touch, does the same —
 *   double-click stays reserved for selecting the whole fragment) — type
 *   any element, a short
 *   condensed formula (CH3, COOH), or a placeholder label (R, R1, R')
 *   Ctrl/Cmd+Z = undo   Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo
 *   Ctrl/Cmd+A = select all
 *   Escape = clear selection / cancel atom or label edit
 *   Delete / Backspace = delete selection (or selected annotation)
 *
 * This is the internal reference for what this hook implements — the
 * user-facing list (ShortcutsOverlay.tsx) is the actual source of truth
 * for what's shown in-app, and covers a few more entries handled
 * elsewhere (mouse-based ones like Shift+click, marquee-select, the
 * rotate handle — see useCanvasInteractions.ts). Keep both in sync when
 * changing a binding here.
 *
 * Lasso is on Q rather than L specifically so L can be a direct,
 * immediate one-key shortcut for Cl (Chlorine) while hovering an atom —
 * see elementBySymbol below for why B/L map to Br/Cl rather than their
 * more literal-looking Boron/lasso-adjacent readings, and why this
 * doesn't reduce to a two-letter "type the real symbol" scheme the way
 * it might look like it should.
 */
export function useKeyboardShortcuts() {
  const undo = useMoleculeStore((s) => s.undo);
  const redo = useMoleculeStore((s) => s.redo);
  const setTool = useMoleculeStore((s) => s.setTool);
  const deleteSelection = useMoleculeStore((s) => s.deleteSelection);
  const selectAll = useMoleculeStore((s) => s.selectAll);
  const clearSelection = useMoleculeStore((s) => s.clearSelection);
  const toggleShowHydrogens = useMoleculeStore((s) => s.toggleShowHydrogens);
  const rotateSelection = useMoleculeStore((s) => s.rotateSelection);
  const atomEditTarget = useMoleculeStore((s) => s.atomEditTarget);
  const selected = useMoleculeStore((s) => s.selected);
  const hoverAtomId = useMoleculeStore((s) => s.hoverAtomId);
  const setAtomEditTarget = useMoleculeStore((s) => s.setAtomEditTarget);
  const setLabelEditTarget = useMoleculeStore((s) => s.setLabelEditTarget);
  const setAtomLabelRevealTargets = useMoleculeStore((s) => s.setAtomLabelRevealTargets);
  const setAtomElementOf = useMoleculeStore((s) => s.setAtomElementOf);
  const selectedAnnotationIds = useMoleculeStore((s) => s.selectedAnnotationIds);
  const deleteAnnotations = useMoleculeStore((s) => s.deleteAnnotations);
  const setSelectedAnnotationIds = useMoleculeStore((s) => s.setSelectedAnnotationIds);

  const pendingElementBufferRef = useRef("");
  const pendingElementTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Deliberately just this original set, not the full periodic table
    // (model/constants.ts's PERIODIC_TABLE) — every one of these single-
    // or double-letter symbols was chosen to never collide with a
    // tool-shortcut letter (v/c/r/e/w/t/a/k) when typed while hovering
    // an atom, with one deliberate exception (b, below). Most of the
    // periodic table doesn't have this non-collision property, so
    // widening this buffer would silently break existing tool shortcuts
    // for anyone with an atom under the cursor. The full table is still
    // reachable — the periodic table picker (Sidebar) and the free-text
    // label editor (Enter/double-click, model/atomLabelParser.ts) both
    // already support any element, no buffer-collision risk either way.
    //
    // b and l don't follow the "letter matches the symbol" pattern every
    // other entry here does: b -> Br (not Boron) and l -> Cl, both
    // direct one-key shortcuts rather than a "type c then l" two-letter
    // sequence, since bromine and chlorine come up far more often when
    // quickly editing a drawn structure than boron does. b is the one
    // deliberate collision mentioned above — it's also the bond tool's
    // shortcut — resolved the same way an atom/edit/selection target
    // already takes priority over the tool switch below for every other
    // entry here too: element wins whenever there's a target, tool wins
    // when there isn't. l has no such collision (lasso moved to Q — see
    // this file's top comment for why). Both fire on the very first
    // keypress, same as every other entry: there's no b-then-r
    // continuation to reach actual Boron or an actual two-letter "cl"
    // sequence here, a single b or l is already a complete match.
    const elementBySymbol: Record<string, Element> = {
      c: "C",
      n: "N",
      o: "O",
      s: "S",
      p: "P",
      f: "F",
      i: "I",
      h: "H",
      b: "Br",
      l: "Cl",
      si: "Si",
    };

    const applyTypedElement = (symbol: string) => {
      const targetIds = atomEditTarget ? [atomEditTarget] : hoverAtomId ? [hoverAtomId] : selected.size > 0 ? [...selected] : [];
      if (targetIds.length === 0) return;
      const element = elementBySymbol[symbol.toLowerCase()];
      if (!element) return;
      const targetId = targetIds[0];
      targetIds.forEach((id) => setAtomElementOf(id, element));
      const currentTargets = new Set(useMoleculeStore.getState().atomLabelRevealTargets);
      if (element === "C") {
        if (currentTargets.has(targetId)) currentTargets.delete(targetId);
        else currentTargets.add(targetId);
      } else {
        currentTargets.delete(targetId);
      }
      setAtomLabelRevealTargets(currentTargets);
      pendingElementBufferRef.current = "";
      if (pendingElementTimerRef.current) {
        window.clearTimeout(pendingElementTimerRef.current);
        pendingElementTimerRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.key === "Escape") {
        clearSelection();
        setAtomEditTarget(null);
        setLabelEditTarget(null);
        setSelectedAnnotationIds(new Set());
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedAnnotationIds.size > 0) deleteAnnotations(selectedAnnotationIds);
        if (selected.size > 0) deleteSelection();
        return;
      }

      if (e.key === "Enter") {
        const targetIds = atomEditTarget ? [atomEditTarget] : hoverAtomId ? [hoverAtomId] : selected.size > 0 ? [...selected] : [];
        if (targetIds.length === 1) {
          e.preventDefault();
          setLabelEditTarget(targetIds[0]);
        }
        return;
      }

      const isElementKey = !(e.ctrlKey || e.metaKey) && /^[a-zA-Z]$/.test(e.key);
      const targetIds = atomEditTarget ? [atomEditTarget] : hoverAtomId ? [hoverAtomId] : selected.size > 0 ? [...selected] : [];
      if (isElementKey && targetIds.length > 0) {
        e.preventDefault();
        const nextBuffer = (pendingElementBufferRef.current + e.key).toLowerCase();
        const exactMatch = elementBySymbol[nextBuffer];
        if (exactMatch) {
          applyTypedElement(nextBuffer);
          return;
        }
        const hasPrefix = Object.keys(elementBySymbol).some((symbol) => symbol.startsWith(nextBuffer));
        if (hasPrefix) {
          pendingElementBufferRef.current = nextBuffer;
          if (pendingElementTimerRef.current) window.clearTimeout(pendingElementTimerRef.current);
          pendingElementTimerRef.current = window.setTimeout(() => {
            pendingElementTimerRef.current = null;
            const buffered = pendingElementBufferRef.current;
            if (buffered) applyTypedElement(buffered);
          }, 250);
          return;
        }
        pendingElementBufferRef.current = "";
      }

      if (!(e.ctrlKey || e.metaKey)) {
        switch (e.key.toLowerCase()) {
          case "v": setTool("select"); break;
          case "q": setTool("lasso"); break;
          case "h": toggleShowHydrogens(); break;
          case "b": setTool("bond-1"); break;
          case "c": setTool("chain"); break;
          case "r": setTool("ring"); break;
          case "e": setTool("erase"); break;
          case "w": setTool("wedge"); break;
          case "t": setTool("text"); break;
          case "a": setTool("arrow"); break;
          case "k": setTool("bracket"); break;
          case "+": setTool("plus"); break;
          case "1": setTool("bond-1"); break;
          case "2": setTool("bond-2"); break;
          case "3": setTool("bond-3"); break;
          case "[": rotateSelection(-30); break;
          case "]": rotateSelection(30); break;
          default: break;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (pendingElementTimerRef.current) {
        window.clearTimeout(pendingElementTimerRef.current);
        pendingElementTimerRef.current = null;
      }
    };
  }, [undo, redo, setTool, deleteSelection, selectAll, clearSelection, toggleShowHydrogens, rotateSelection, atomEditTarget, selected, hoverAtomId, setAtomEditTarget, setLabelEditTarget, setAtomLabelRevealTargets, setAtomElementOf, selectedAnnotationIds, deleteAnnotations, setSelectedAnnotationIds]);
}
