import { useState } from "react";
import type { Molecule } from "../../types/chemistry";
import { atomLabelInfo, atomLabelRadius, hSuffixPlacement, hasEastBond, type HSuffixPlacement } from "../../model/valence";
import { defaultLonePairPosition } from "../../model/lonePairs";

/**
 * Everything an AtomView needs to know that is derived from the whole
 * molecule rather than from the atom object alone.
 *
 * AtomView used to take the entire `mol` as a prop and call these helpers
 * itself. That made React.memo on it nearly useless: model/molecule.ts
 * rebuilds the atoms map immutably on every edit, so `mol` was a fresh
 * object every time and *every* atom re-rendered even when only one had
 * actually changed. Hoisting the derivation up here means the caller
 * computes each atom's context once per molecule and can hand back the
 * *previous* context object verbatim when nothing about that atom changed
 * (see computeAtomRenderContexts) — so the memo compare finally has
 * something stable to compare.
 */
export interface AtomRenderContext {
  /** Whether the element/group label renders at all (a bare skeletal vertex otherwise). */
  showLabel: boolean;
  /** The label itself, element symbol or abbreviated-group name. */
  labelText: string;
  /** Implicit-H suffix ("H", "H2", "H3"), or undefined when there is none. */
  hSuffix: string | undefined;
  /** Mass number drawn as a small prefix, for isotopes without their own symbol (D/T). */
  isotopePrefix: string | undefined;
  /** Which side of the atom the hSuffix renders on, so it clears the bonds. */
  suffixPlacement: HSuffixPlacement;
  /** Whether a group label should anchor by its end rather than its start (bond heading east). */
  groupAnchorEnd: boolean;
  /** Default local position for each lone pair, indexed like Atom.lonePairs. Empty when the atom has none. */
  lonePairPositions: ReadonlyArray<{ x: number; y: number }>;
  /** Default local position for the radical dot, sitting past any lone pairs. */
  radicalBase: { x: number; y: number };
  /** Approximate half-width of the label, for pulling bond lines back to clear it. */
  labelRadius: number;
  /** Whether the 3D panel's link tool currently points at this atom — drawn
   * as an accent ring so the 3D<->2D correspondence is visible on the canvas
   * and not only implied by the 2D selection. */
  linked: boolean;
}

const NO_LONE_PAIRS: ReadonlyArray<{ x: number; y: number }> = [];

/** Builds the context for one atom. Separate from computeAtomRenderContexts so
 * the identity-preserving loop below stays readable. */
function contextFor(mol: Molecule, atomId: string, showHydrogens: boolean, forceLabel: boolean, linkedAtomId: string | null): AtomRenderContext {
  const atom = mol.atoms[atomId];
  const { visible, text, hSuffix, isotopePrefix } = atomLabelInfo(mol, atomId, showHydrogens, forceLabel);

  // Only pay for the lone-pair / radical geometry when the atom actually has
  // any — defaultLonePairPosition scans the whole bond list on every call, so
  // computing it unconditionally would be pure waste on the large majority of
  // atoms that have neither.
  const lonePairCount = atom?.lonePairs ?? 0;
  const lonePairPositions: ReadonlyArray<{ x: number; y: number }> =
    lonePairCount === 0
      ? NO_LONE_PAIRS
      : Array.from({ length: lonePairCount }, (_, i) => defaultLonePairPosition(mol, atomId, i, lonePairCount));

  return {
    showLabel: visible,
    labelText: text,
    hSuffix,
    isotopePrefix,
    suffixPlacement: hSuffix ? hSuffixPlacement(mol, atomId) : "right",
    groupAnchorEnd: !!atom?.group && hasEastBond(mol, atomId),
    lonePairPositions,
    radicalBase: defaultLonePairPosition(mol, atomId, lonePairCount, lonePairCount + 1),
    labelRadius: atomLabelRadius(mol, atomId, showHydrogens, forceLabel),
    linked: linkedAtomId === atomId,
  };
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Field-by-field equality, used purely to decide whether an atom's context
 * object can be reused. Deliberately not a deep-equal helper: this compares
 * exactly the fields AtomRenderContext exposes, nothing else. */
function sameContext(a: AtomRenderContext, b: AtomRenderContext): boolean {
  if (
    a.showLabel !== b.showLabel ||
    a.labelText !== b.labelText ||
    a.hSuffix !== b.hSuffix ||
    a.isotopePrefix !== b.isotopePrefix ||
    a.suffixPlacement !== b.suffixPlacement ||
    a.groupAnchorEnd !== b.groupAnchorEnd ||
    a.labelRadius !== b.labelRadius ||
    a.lonePairPositions.length !== b.lonePairPositions.length ||
    a.linked !== b.linked
  ) {
    return false;
  }
  for (let i = 0; i < a.lonePairPositions.length; i++) {
    if (!samePoint(a.lonePairPositions[i], b.lonePairPositions[i])) return false;
  }
  return samePoint(a.radicalBase, b.radicalBase);
}

/**
 * Computes every atom's render context for one molecule.
 *
 * `previous` is the map returned by the last call. Any atom whose derived
 * values came out identical gets the *previous object* put back into the map
 * rather than the freshly built one, which keeps the reference stable across
 * renders and is what makes the React.memo'd AtomView below able to bail out.
 * Without this, every atom would get a brand new context object on every
 * molecule change and the memo compare would never hit again.
 */
export function computeAtomRenderContexts(
  mol: Molecule,
  showHydrogens: boolean,
  revealTargets: ReadonlySet<string>,
  linkedAtomId: string | null,
  previous?: Map<string, AtomRenderContext>
): Map<string, AtomRenderContext> {
  const result = new Map<string, AtomRenderContext>();
  for (const atomId of Object.keys(mol.atoms)) {
    const next = contextFor(mol, atomId, showHydrogens, revealTargets.has(atomId), linkedAtomId);
    const prior = previous?.get(atomId);
    result.set(atomId, prior && sameContext(prior, next) ? prior : next);
  }
  return result;
}
/**
 * React hook wrapper around computeAtomRenderContexts that remembers the
 * previous map so unchanged entries can be reused by reference.
 *
 * Uses React's documented "adjust state when props change" pattern (setState
 * during render) rather than a ref: reading or writing a ref during render is
 * unsafe under StrictMode's double-invocation, and React Compiler actively
 * opts out of optimizing a component that does it. Setting state during render
 * is the supported way to carry information forward from a previous render,
 * and React discards this render's output and re-runs immediately — so the
 * stale map returned below is never actually painted.
 */
export function useAtomRenderContexts(
  mol: Molecule,
  showHydrogens: boolean,
  revealTargets: ReadonlySet<string>,
  linkedAtomId: string | null
): Map<string, AtomRenderContext> {
  const [entry, setEntry] = useState(() => ({
    mol,
    showHydrogens,
    revealTargets,
    linkedAtomId,
    contexts: computeAtomRenderContexts(mol, showHydrogens, revealTargets, linkedAtomId),
  }));

  if (
    entry.mol !== mol ||
    entry.showHydrogens !== showHydrogens ||
    entry.revealTargets !== revealTargets ||
    entry.linkedAtomId !== linkedAtomId
  ) {
    setEntry({
      mol,
      showHydrogens,
      revealTargets,
      linkedAtomId,
      contexts: computeAtomRenderContexts(mol, showHydrogens, revealTargets, linkedAtomId, entry.contexts),
    });
    return entry.contexts;
  }

  return entry.contexts;
}
