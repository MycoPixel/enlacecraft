import { useCallback } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { translate } from "./translate";

/**
 * useT() returns a t(key, vars?) function bound to the current UI language,
 * reactive to language changes (components using it re-render on toggle).
 *
 * The returned function is referentially stable per language (useCallback).
 * This matters beyond tidiness: several callers (useStructureDescription,
 * command-palette definitions, …) list `t` in useMemo/useCallback dependency
 * arrays. A fresh closure on every render silently defeated every one of
 * those memos, re-running expensive work (reaction interpretation, structure
 * descriptions) on each render — including the per-pointer-move canvas
 * re-renders.
 */
export function useT() {
  const lang = useMoleculeStore((s) => s.language);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
}
