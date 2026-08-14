import { useEffect, useRef, useState } from "react";
import type { Molecule } from "../types/chemistry";
import type { Lang } from "../i18n/translations";
import { extractFragment } from "../model/molecule";
import { exportSmiles } from "../io/smiles";
import { lookupIupacName, type IupacLookupResult } from "../io/iupacLookup";
import { PubChemError, type PubChemErrorCode } from "../io/pubchem";
import { hasIgnoredValenceAtoms } from "../model/valence";

export type AutoNameState =
  | { phase: "idle" }
  | { phase: "pending" } // debounce window open, not yet sent to PubChem
  | { phase: "loading" }
  | { phase: "error"; code: PubChemErrorCode | "OTHER"; params: Record<string, string | number> }
  | ({ phase: "result" } & IupacLookupResult);

const DEBOUNCE_MS = 700;

/**
 * Live counterpart to IupacNameButton's on-demand lookup: instead of
 * waiting for a click, this re-resolves the name whenever the watched
 * atoms' *structure* changes, so a panel can show "name for the current
 * selection" and have it update as the user draws.
 *
 * Two things keep this from turning into "hit PubChem on every mouse
 * move", per NCBI's request to keep clients under ~5 req/s:
 *
 *  - It keys off the exported SMILES, not the molecule object identity —
 *    dragging an atom's position, panning, or any edit that doesn't
 *    change connectivity/elements produces the same SMILES, so no new
 *    request goes out.
 *  - Every change to that SMILES restarts a `DEBOUNCE_MS` timer rather
 *    than firing immediately, so a burst of edits (drawing several bonds
 *    in a row) collapses into one request after the user pauses.
 *
 * A monotonically increasing request id guards against a slow, stale
 * response landing after a newer one — only the response matching the
 * latest id is applied.
 */
export function useAutoIupacName(molecule: Molecule, selectedIds: string[], language: Lang, enabled: boolean): AutoNameState {
  const [state, setState] = useState<AutoNameState>({ phase: "idle" });
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ids = selectedIds.length > 0 ? selectedIds : Object.keys(molecule.atoms);
  // Recomputing SMILES on every render is cheap relative to a network
  // request, and doing it here (rather than caching it in a ref) is what
  // lets the effect below depend on the actual structure instead of on
  // `molecule`'s object identity, which changes on every edit including
  // ones that don't affect the name (e.g. moving atoms).
  const smiles = enabled && ids.length > 0 && !hasIgnoredValenceAtoms(extractFragment(molecule, ids)) ? exportSmiles(extractFragment(molecule, ids)) : "";

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!enabled || !smiles) {
      requestIdRef.current += 1; // invalidate any in-flight request
      setState({ phase: "idle" });
      return;
    }

    setState({ phase: "pending" });
    const myRequestId = ++requestIdRef.current;

    debounceRef.current = setTimeout(() => {
      if (requestIdRef.current !== myRequestId) return;
      setState({ phase: "loading" });
      lookupIupacName(molecule, ids, language)
        .then((result) => {
          if (requestIdRef.current !== myRequestId) return; // superseded while in flight
          setState({ phase: "result", ...result });
        })
        .catch((err) => {
          if (requestIdRef.current !== myRequestId) return;
          const code: PubChemErrorCode | "OTHER" = err instanceof PubChemError ? err.code : "OTHER";
          const params = err instanceof PubChemError ? err.params : {};
          setState({ phase: "error", code, params });
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // `ids` is intentionally omitted: it's derived fresh each render from
    // molecule/selectedIds, and `smiles` already captures every change to
    // it that could actually affect the name — including a re-selection
    // that happens to resolve to the same fragment, which correctly
    // shouldn't re-trigger a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smiles, enabled, language]);

  return state;
}
