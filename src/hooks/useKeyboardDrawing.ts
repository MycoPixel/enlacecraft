import { useEffect, type RefObject } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { atomAt } from "../engine/hitTest";
import { BOND_LEN, GRID_STEP, ISOTOPE_PRESETS } from "../model/constants";
import type { Point } from "../types/chemistry";

/**
 * Keyboard drawing mode.
 *
 * A pointer can place an atom and drag out its bond in one motion, but that
 * leaves keyboard-only users with no way to draw at all. This hook gives the
 * canvas a virtual cursor: arrow keys move it, Enter places an atom (bonded
 * to the current single selection when there is one) or selects the atom
 * under it, and Escape clears the selection before exiting the mode.
 *
 * Ctrl/Cmd+Shift+K toggles the mode from anywhere outside an input or
 * dialog, and the command palette registers the same action, so it is
 * discoverable without knowing the shortcut. The cursor itself lives in the
 * store because the canvas draws it; see MoleculeCanvas's crosshair.
 *
 * The listener runs in the capture phase and stops propagation while the
 * mode is active: otherwise the editor's normal Enter shortcut would open
 * the atom label editor, and Escape would clear the selection and leave the
 * mode in the same keystroke.
 */
export function useKeyboardDrawing(svgRef: RefObject<SVGSVGElement | null>) {
  const active = useMoleculeStore((s) => s.keyboardDrawing);

  // Moving focus onto the canvas means a screen reader announces its
  // structure description and browser key handling stays scoped to the
  // drawing rather than whichever toolbar button was last used.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => svgRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active, svgRef]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      // A modal owns arrow keys, Enter and Escape while it is open.
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;

      const state = useMoleculeStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        state.setKeyboardDrawing(!state.keyboardDrawing);
        return;
      }
      if (!state.keyboardDrawing) return;

      // Focused controls keep their normal activation keys.
      if (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        // First Escape clears whatever is selected, the next one leaves the
        // mode — the same two-stage escape users expect from a drawing tool.
        if (
          state.selected.size > 0 ||
          state.selectedAnnotationIds.size > 0 ||
          state.atomEditTarget ||
          state.labelEditTarget
        ) {
          state.clearSelection();
          state.setSelectedAnnotationIds(new Set());
          state.setAtomEditTarget(null);
          state.setLabelEditTarget(null);
          state.setStatus("status.ready");
        } else {
          state.setKeyboardDrawing(false);
        }
        return;
      }

      const cursor = state.keyboardCursor;
      if (!cursor) return;

      // A full bond length per press keeps Enter's result chemically
      // sensible; Shift gives the finer canvas grid step for alignment.
      const step = e.shiftKey ? GRID_STEP : BOND_LEN;
      let next: Point | null = null;
      if (e.key === "ArrowUp") next = { x: cursor.x, y: cursor.y - step };
      else if (e.key === "ArrowDown") next = { x: cursor.x, y: cursor.y + step };
      else if (e.key === "ArrowLeft") next = { x: cursor.x - step, y: cursor.y };
      else if (e.key === "ArrowRight") next = { x: cursor.x + step, y: cursor.y };
      if (next) {
        e.preventDefault();
        e.stopPropagation();
        state.setKeyboardCursor(next);
        return;
      }

      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();

      // Enter over an existing atom selects it (and makes it the anchor for
      // the next placement) instead of stacking a second atom on top.
      const hit = atomAt(state.molecule, cursor, 16, null, state.view.scale);
      if (hit) {
        state.setSelected(new Set([hit]));
        state.setStatus("status.keyboardSelected");
        return;
      }

      const anchorId = state.selected.size === 1 ? [...state.selected][0] : null;
      let newId: string | null;
      if (state.atomReactiveSite) {
        newId = state.addReactiveSiteAtomWithBond(cursor, state.atomReactiveSite, anchorId);
      } else if (state.atomIsotope) {
        const preset = ISOTOPE_PRESETS.find((p) => p.id === state.atomIsotope);
        newId = preset
          ? state.addAtomWithBond(cursor, preset.element, anchorId, undefined, preset.massNumber)
          : state.addAtomWithBond(cursor, state.atomElement, anchorId, state.atomGroup ?? undefined);
      } else {
        newId = state.addAtomWithBond(cursor, state.atomElement, anchorId, state.atomGroup ?? undefined);
      }
      if (newId) {
        state.setSelected(new Set([newId]));
        state.setAtomEditTarget(null);
        state.setStatus("status.keyboardPlaced");
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
