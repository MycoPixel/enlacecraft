import { useCallback, useMemo, useState } from "react";
import { useT } from "../../i18n/useT";
import type { Molecule } from "../../types/chemistry";
import type { AtomShifts } from "./nmrReportTypes";
import {
  filterForReportDiagram,
  hydrogenSuffixForLabel,
  hydrogenParent,
  diagramSourceFragment,
  diagramExtent,
  type DiagramExtent,
} from "../../io/nmrReportDiagram";

/**
 * The predicted-shift diagram, shared by the report's Structure tab and the
 * inline one on the Spectrum tab.
 *
 * Extracted rather than duplicated because the two views must not be able to
 * disagree: they draw the same atoms from the same predictions, and the whole
 * point of showing the structure next to a spectrum is that hovering a signal
 * there highlights the same atoms that carry the number here. A second copy
 * would drift, and a drift between "the peak I hovered" and "the atom that
 * lit up" is worse than not offering the link at all.
 *
 * The hover direction runs BOTH ways and is deliberately reciprocal: hovering
 * an atom reveals its label in place of its shift (so you can tell which atom
 * a number belongs to), and hovering a peak in the spectrum highlights the
 * atoms here. One direction alone leaves the other half of the link missing.
 */

export interface NmrStructureDiagramProps {
  fragment: Molecule;
  /** Label per atom id ("C1", "O2", ...), pre-built by the caller so both
   *  views number atoms identically. */
  labelOf: Map<string, string>;
  shiftsByAtom: Map<string, AtomShifts>;
  showC: boolean;
  showH: boolean;
  /** Whether hydrogens appear - as drawn atoms, and as a count on each label. */
  showExplicitHydrogens: boolean;
  /**
   * Atom ids to highlight, from whatever is currently hovered on the other
   * side (a signal on the spectrum plot). Empty means "nothing linked".
   */
  highlightedAtomIds?: ReadonlySet<string>;
  /**
   * Explicit pixel box for the SVG, so a caller can size the drawing to the
   * room it actually has.
   *
   * Without this the box comes from a CSS clamp that is a fixed guess, which
   * is fine for an average structure and wrong at both ends: too small for a
   * large molecule (every label shrinks with the viewBox) and pointlessly
   * large for a small one. Callers size it with diagramBoxSize against the
   * same extent the viewBox is built from, so the two stay consistent.
   */
  boxSize?: DiagramExtent;
}

export function NmrStructureDiagram({
  fragment,
  labelOf,
  shiftsByAtom,
  showC,
  showH,
  showExplicitHydrogens,
  highlightedAtomIds,
  boxSize,
}: NmrStructureDiagramProps) {
  const t = useT();
  // Atom under the pointer, if any. While hovered, that atom's shift swaps
  // back to its plain label, so the reader can identify it without losing the
  // shift display everywhere else.
  const [hoveredAtomId, setHoveredAtomId] = useState<string | null>(null);

  // Explicit hydrogens are filtered out of the drawing when toggled off, along
  // with any bond that touches one - see nmrReportDiagram.ts for why.
  //
  // When they ARE wanted but the structure is skeletal, hydrogens are laid out
  // for display first, so the toggle works on the structure most people draw
  // rather than only on one they've already expanded on the canvas.
  const drawableFragment = useMemo(
    () => diagramSourceFragment(fragment, showExplicitHydrogens),
    [fragment, showExplicitHydrogens],
  );
  const { atoms: atomsById, bonds: bondsById } = useMemo(
    () => filterForReportDiagram(drawableFragment, showExplicitHydrogens),
    [drawableFragment, showExplicitHydrogens],
  );
  const atoms = useMemo(() => Object.values(atomsById), [atomsById]);
  const bonds = useMemo(() => Object.values(bondsById), [bondsById]);

  /**
   * Each drawn hydrogen's heavy-atom parent, for the atoms actually on screen.
   *
   * Built once over the filtered set rather than looked up per atom: an
   * explicit-hydrogen view of a 30-atom molecule asks this question a hundred
   * times per render, and the answer can't change within a render anyway.
   */
  const hydrogenParentOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const atom of atoms) {
      if (atom.element !== "H") continue;
      const parentId = hydrogenParent(drawableFragment, atom.id);
      if (parentId) map.set(atom.id, parentId);
    }
    return map;
  }, [atoms, drawableFragment]);

  /**
   * Heavy atoms that have at least one hydrogen drawn next to them.
   *
   * This is what decides where the 1H signal is shown. One 1H shift covers all
   * the protons on a heavy atom, so there are two honest places to put it: on
   * the hydrogens themselves, or - when they aren't drawn - on the carbon they
   * hang off. Showing it on BOTH is what made hovering a carbon feel wrong: it
   * looked like the carbon's own signal was a proton signal, and the reader had
   * no way to tell a labelled vertex from a borrowed one. So exactly one of the
   * two carries it, and which one depends on whether the hydrogens are on
   * screen.
   */
  const atomsWithDrawnHydrogens = useMemo(
    () => new Set(hydrogenParentOf.values()),
    [hydrogenParentOf],
  );

  /**
   * The shift to show for an atom, which is not always its own.
   *
   * A hydrogen has no prediction of its own - the backend reports one 1H shift
   * per heavy atom, covering every proton sitting on it - so a drawn "H" has to
   * borrow the parent's.
   */
  const shiftsFor = useCallback(
    (atomId: string): AtomShifts | undefined => {
      const own = shiftsByAtom.get(atomId);
      if (own) return own;
      const parentId = hydrogenParentOf.get(atomId);
      return parentId ? shiftsByAtom.get(parentId) : undefined;
    },
    [shiftsByAtom, hydrogenParentOf],
  );

  // Fit to whatever is actually drawn, AFTER filtering. Computing this from the
  // unfiltered atoms would leave a permanently empty margin when hydrogens are
  // hidden, and the diagram would sit off-centre with dead space around it.
  // The extent itself comes from the shared helper so that the viewBox here and
  // the pixel box a caller sizes with diagramBoxSize are derived from one
  // calculation - see that function for why the two must not be separate.
  const extent = useMemo(() => diagramExtent(atoms), [atoms]);
  const viewBox = useMemo(() => {
    if (atoms.length === 0) return "0 0 100 100";
    const xs = atoms.map((a) => a.x);
    const ys = atoms.map((a) => a.y);
    // Same padding diagramExtent applies, so the box and the viewBox agree.
    const pad = 30;
    return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${extent.width} ${extent.height}`;
  }, [atoms, extent]);

  const hasLinkedHighlight = (highlightedAtomIds?.size ?? 0) > 0;

  return (
    <svg
      className="nmr-report-svg"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={boxSize ? { width: `${boxSize.width}px`, height: `${boxSize.height}px` } : undefined}
    >
      {bonds.map((bond) => {
        const a1 = atomsById[bond.a1];
        const a2 = atomsById[bond.a2];
        if (!a1 || !a2) return null;
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const len = Math.hypot(dx, dy) || 1;
        // Perpendicular unit vector, for offsetting the extra parallel
        // line(s) of a double/triple bond.
        const ox = (-dy / len) * 4;
        const oy = (dx / len) * 4;
        const lines = bond.order === 1 ? [0] : bond.order === 2 ? [-1, 1] : [-1.6, 0, 1.6];
        return lines.map((k, i) => (
          <line
            key={`${bond.id}-${i}`}
            x1={a1.x + ox * k}
            y1={a1.y + oy * k}
            x2={a2.x + ox * k}
            y2={a2.y + oy * k}
            className="nmr-report-svg__bond"
          />
        ));
      })}

      {atoms.map((atom) => {
        const isHydrogen = atom.element === "H";
        const parentId = isHydrogen ? hydrogenParentOf.get(atom.id) : undefined;
        // Hydrogens laid out purely for display have no entry in labelOf - they
        // aren't part of the structure the labels were numbered from. They fall
        // back to a plain "H", which is also the conventional way to draw them:
        // three H's around a methyl are three identical protons, not H1/H2/H3.
        const label = labelOf.get(atom.id) ?? (isHydrogen ? "H" : undefined);
        const shifts = shiftsFor(atom.id);
        if (!label) return null;

        // A hydrogen borrows its parent's signal, so it must never also be
        // offered the parent's 13C - "H" carrying a carbon shift would be a
        // different kind of wrong. Its own badge is the 1H only.
        //
        // And a heavy atom drops its 1H badge once its hydrogens are drawn,
        // because they now carry it (see atomsWithDrawnHydrogens). A carbon
        // that kept showing a proton signal next to three H's each showing the
        // same number would read as two different signals, or as a carbon
        // signal that had somehow become a proton one.
        const hasC = !isHydrogen && shifts?.c13 !== undefined && showC;
        const hasH =
          shifts?.h1 !== undefined && showH && !(!isHydrogen && atomsWithDrawnHydrogens.has(atom.id));
        const hasShift = hasC || hasH;
        // Shift numbers sit right on the atom itself rather than offset toward
        // guessed-at open space - that guess could land one atom's shift on top
        // of a neighbour's label in a crowded structure. Anchoring to the atom
        // means a shift can only ever cover its own label, and hovering swaps
        // it back on demand, so nothing is permanently hidden.
        const isHovered = hoveredAtomId === atom.id;
        const showingShift = hasShift && !isHovered;
        // Highlighted from the spectrum side: a signal hovered there owns this
        // atom. Distinct from the pointer hover above, which is local to this
        // diagram and swaps label for shift.
        //
        // A hydrogen counts as linked when its parent is, so hovering a peak
        // lights up the protons that produce it and not just the carbon they
        // hang off - otherwise expanding the hydrogens would make the link look
        // broken.
        const isLinked =
          (highlightedAtomIds?.has(atom.id) ?? false) ||
          (parentId !== undefined && (highlightedAtomIds?.has(parentId) ?? false));
        // The "H3" proton count, shown only where it is still information.
        //
        // Once an atom's hydrogens are drawn as their own labelled vertices the
        // count is redundant, and worse than redundant: "C1H3" sitting beside
        // three separate H's reads as two disagreeing proton counts. It also
        // has to survive when hydrogens are NOT drawn, since that count is then
        // the only record of them on the structure at all - which is the case
        // for the skeletal structure people normally draw.
        //
        // Deliberately not tied to the hydrogens toggle. It used to be, back
        // when that toggle could only add a suffix; now that it draws real
        // vertices, tying the two would mean the count appeared exactly when it
        // was least needed and vanished exactly when it was most.
        const hSuffix =
          !isHydrogen && !atomsWithDrawnHydrogens.has(atom.id)
            ? hydrogenSuffixForLabel(fragment, atom.id)
            : null;

        return (
          <g
            key={atom.id}
            onMouseEnter={() => hasShift && setHoveredAtomId(atom.id)}
            onMouseLeave={() => setHoveredAtomId((id) => (id === atom.id ? null : id))}
            style={hasShift ? { cursor: "pointer" } : undefined}
            className={isLinked ? "nmr-report-svg__atom-group--linked" : undefined}
          >
            <circle
              cx={atom.x}
              cy={atom.y}
              r={11}
              className={
                "nmr-report-svg__atom" +
                (isHovered && hasShift ? " nmr-report-svg__atom--hovered" : "") +
                // The ring is drawn larger than the others so a linked atom
                // reads even when it's behind the label text.
                (isLinked ? " nmr-report-svg__atom--linked" : "")
              }
            />
            {showingShift ? (
              <>
                {hasC && (
                  <text
                    x={atom.x}
                    y={atom.y + (hasH ? -6 : 0)}
                    className="nmr-report-svg__badge nmr-report-svg__badge--c nmr-report-svg__badge--oncenter"
                  >
                    {shifts!.c13!.toFixed(1)}
                  </text>
                )}
                {hasH && (
                  <text
                    x={atom.x}
                    y={atom.y + (hasC ? 7 : 0)}
                    className={
                      "nmr-report-svg__badge nmr-report-svg__badge--h nmr-report-svg__badge--oncenter" +
                      (shifts?.implausible ? " nmr-report-svg__badge--implausible" : "")
                    }
                  >
                    {shifts?.implausible && <title>{t("nmr.implausibleHint")}</title>}
                    {shifts!.h1!.shift.toFixed(2)}
                    {shifts!.h1!.multiplicity ? ` (${shifts!.h1!.multiplicity})` : ""}
                    {shifts?.implausible ? " ⚠" : ""}
                  </text>
                )}
              </>
            ) : (
              <text x={atom.x} y={atom.y} className="nmr-report-svg__atom-label">
                {label}
                {hSuffix && (
                  <tspan className="nmr-report-svg__atom-label-suffix" dy="3">
                    {hSuffix}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}

      {/* Caption only while a link is live, so it explains a highlight the
          reader can actually see rather than describing nothing. */}
      {hasLinkedHighlight && (
        <text className="nmr-report-svg__linked-caption" x={0} y={0}>
          {t("nmr.structureLinkedCaption")}
        </text>
      )}
    </svg>
  );
}