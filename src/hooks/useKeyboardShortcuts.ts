import { useEffect, useRef } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import type { Element } from "../types/chemistry";

/**
 * Keyboard shortcuts (desktop):
 *   V = select   B = bond   C = chain   R = ring   E = erase   W = wedge   H = show hydrogens
 *   T = text box   A = reaction arrow   K = bracket ( [ {
 *   1 / 2 / 3 = bond order   [ / ] = rotate selection left/right 30°
 *   Enter = open free-text label editor on a single targeted atom
 *   (double-clicking an atom does the same) — type any element, a short
 *   condensed formula (CH3, COOH), or a placeholder label (R, R1, R')
 *   Ctrl/Cmd+Z = undo   Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo
 *   Delete / Backspace = delete selection (or selected annotation)
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
    const elementBySymbol: Record<string, Element> = {
      c: "C",
      n: "N",
      o: "O",
      s: "S",
      p: "P",
      f: "F",
      cl: "Cl",
      br: "Br",
      i: "I",
      h: "H",
      b: "B",
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
