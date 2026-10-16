import { useCallback, useRef, useState } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { exportSmiles } from "../io/smiles";
import { fetchInChI, PubChemError } from "../io/pubchem";
import { fetchLocalInChIKey, LocalChemError } from "../io/localChem";

/**
 * Why one structure's InChIKey, shared by every panel that needs one.
 *
 * The two places that resolve a key had grown two different chains:
 * MassSpecButton went local-RDKit-first (so a structure nobody has ever
 * submitted to PubChem still resolves) while MoleculeInfoButton went straight
 * to PubChem, and each carried its own copy of the SMILES-keying, the stale-key
 * discard, and the busy-vs-unsupported-vs-error split. This is that chain,
 * once.
 *
 * `state` deliberately keeps "busy" and "unsupported" apart from "error",
 * because they call for different things from the person looking at the panel:
 *
 *  - `busy`       PubChem is overloaded. Nothing is wrong with the molecule,
 *                 and retrying is the documented remedy, so this offers a
 *                 retry rather than implying the structure is unknown.
 *  - `unsupported` RDKit could not standardise the structure into an InChI at
 *                 all (an odd valence, say). PubChem would not do better
 *                 either, so this is not a retry situation.
 *  - `error`      genuinely could not resolve it this time.
 */

/**
 * `idle` is both "never asked" and "resolved successfully" — it carries the
 * resolved key. `pendingKey`-style flags are derived from it at the call site,
 * the same way MassSpecButton already did, so this stays the single source of
 * truth for which state the lookup is actually in.
 */
export type InChIKeyState = "idle" | "loading" | "error" | "busy" | "unsupported";

export interface InChIKeyResult {
  inchikey: string | undefined;
  state: InChIKeyState;
  /** Resolve for the current structure. Safe to call repeatedly — it is a
   *  no-op when the current structure's key is already in hand. */
  resolve: () => void;
  /** Accept a hand-entered key, for when neither backend is reachable. */
  useManualKey: (key: string) => void;
}

export function useInChIKey(): InChIKeyResult {
  const [inchikey, setInchikey] = useState<string | undefined>(undefined);
  const [state, setState] = useState<InChIKeyState>("idle");

  // Which structure the current key belongs to. Without this the key survives
  // edits and a panel would keep showing the previous molecule's data under a
  // newly drawn structure. Tracked for manual keys too, so reopening a panel
  // can't quietly replace a pasted key with a failed lookup.
  const keyFor = useRef<{ smiles: string; key: string } | null>(null);

  const fail = useCallback((next: Exclude<InChIKeyState, "idle" | "loading">) => {
    setInchikey(undefined);
    keyFor.current = null;
    setState(next);
  }, []);

  const resolve = useCallback(() => {
    // Read the store imperatively rather than closing over the molecule, so
    // this callback's identity doesn't change on every edit (it is passed
    // straight to buttons as an onClick) while still reading the current
    // structure at the moment it fires.
    const smiles = exportSmiles(useMoleculeStore.getState().molecule);
    if (!smiles.trim()) {
      fail("error");
      return;
    }
    if (keyFor.current?.smiles === smiles && inchikey) return;

    setState("loading");

    void (async () => {
      // Local first: the bundled RDKit can key any structure RDKit can parse,
      // including ones nobody has ever submitted to PubChem, and it answers on
      // loopback with no network involved. When the backend isn't there the
      // connection is refused immediately, so trying it first costs nothing.
      let key: string | null = null;
      try {
        key = await fetchLocalInChIKey(smiles);
      } catch (err) {
        if (err instanceof LocalChemError && err.code === "unsupported") {
          fail("unsupported");
          return;
        }
        // "unavailable" (or a network hiccup) falls through to PubChem.
      }

      if (!key) {
        try {
          key = (await fetchInChI(smiles)).inchikey;
        } catch (err) {
          fail(err instanceof PubChemError && err.code === "BUSY" ? "busy" : "error");
          return;
        }
      }

      // The structure may have been edited while this was in flight. Committing
      // unconditionally would leave the new drawing showing the key of the old
      // one, which looks exactly like a wrong answer rather than a stale one.
      if (exportSmiles(useMoleculeStore.getState().molecule) !== smiles) return;

      keyFor.current = { smiles, key };
      setInchikey(key);
      setState("idle");
    })();
  }, [fail, inchikey]);

  const useManualKey = useCallback((key: string) => {
    setInchikey(key);
    keyFor.current = { smiles: exportSmiles(useMoleculeStore.getState().molecule), key };
    setState("idle");
  }, []);

  return { inchikey, state, resolve, useManualKey };
}