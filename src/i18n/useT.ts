import { useMoleculeStore } from "../store/useMoleculeStore";
import { translate } from "./translate";

/**
 * useT() returns a t(key, vars?) function bound to the current UI language,
 * reactive to language changes (components using it re-render on toggle).
 */
export function useT() {
  const lang = useMoleculeStore((s) => s.language);
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
