import { useEffect, useRef } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { saveAutosaveSnapshot, loadAutosaveSnapshot, hasAnyContent } from "../io/autosave";
import { useT } from "../i18n/useT";

const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Wires up the autosave safety net described in io/autosave.ts: restores
 * the last session once on mount (if there's anything worth restoring),
 * then keeps saving in the background afterward — debounced, so a burst of
 * edits (dragging an atom, typing in a text box) writes once after things
 * settle rather than on every intermediate change.
 */
export function useAutosave() {
  const t = useT();
  const restoreAttempted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snapshot = await loadAutosaveSnapshot();
      if (cancelled) return;
      if (snapshot && hasAnyContent(snapshot.tabs)) {
        useMoleculeStore.getState().loadProject(snapshot);
        useMoleculeStore.getState().setStatus(t("autosave.restored"));
      }
      restoreAttempted.current = true;
    })();
    return () => { cancelled = true; };
    // Runs once at startup only — intentionally not re-running if the
    // language changes mid-session (t() here only needs to be correct at
    // the moment restoration actually happens, typically within the first
    // second of the page loading).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsubscribe = useMoleculeStore.subscribe(() => {
      // Guards against saving a blank starting tab over a real snapshot
      // that just hasn't finished loading yet (a race only possible in the
      // brief window before the restore effect above resolves).
      if (!restoreAttempted.current) return;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const state = useMoleculeStore.getState();
        saveAutosaveSnapshot({ activeTabId: state.activeTabId, tabs: state.getAllTabsForSave() });
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);
}
