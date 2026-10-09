import { useMemo, useState } from "react";
import { useT } from "../../i18n/useT";
import type { Molecule } from "../../types/chemistry";
import type { AtomShifts } from "./nmrReportTypes";
import { filterForReportDiagram, hydrogenSuffixForLabel } from "../../io/nmrReportDiagram";

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
}

export function NmrStructureDiagram({
  fragment,
  labelOf,
  shiftsByAtom,
  showC,
  showH,
  showExplicitHydrogens,
  highlightedAtomIds,
}: NmrStructureDiagramProps) {
  const t = useT();
  // Atom under the pointer, if any. While hovered, that atom's shift swaps
  // back to its plain label, so the reader can identify it without losing the
  // shift display everywhere else.
  const [hoveredAtomId, setHoveredAtomId] = useState<string | null>(null);

  // Explicit hydrogens are filtered out of the drawing when toggled off, along
  // with any bond that touches one - see nmrReportDiagram.ts for why.
  const { atoms: atomsById, bonds: bondsById } = useMemo(
    () => filterForReportDiagram(fragment, showExplicitHydrogens),
    [fragment, showExplicitHydrogens],
  );
  const atoms = useMemo(() => Object.values(atomsById), [atomsById]);
  const bonds = useMemo(() => Object.values(bondsById), [bondsById]);

  // Fit to whatever is actually drawn, AFTER filtering. Computing this from the
  // unfiltered atoms would leave a permanently empty margin when hydrogens are
  // hidden, and the diagram would sit off-centre with dead space around it.
  const viewBox = useMemo(() => {
    if (atoms.length === 0) return "0 0 100 100";
    const xs = atoms.map((a) => a.x);
    const ys = atoms.map((a) => a.y);
    const pad = 30;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    return `${minX} ${minY} ${Math.max(w, 1)} ${Math.max(h, 1)}`;
  }, [atoms]);

  const hasLinkedHighlight = (highlightedAtomIds?.size ?? 0) > 0;

  return (
    <svg className="nmr-report-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
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
        const label = labelOf.get(atom.id);
        const shifts = shiftsByAtom.get(atom.id);
        if (!label) return null;

        const hasC = shifts?.c13 !== undefined && showC;
        const hasH = shifts?.h1 !== undefined && showH;
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
        const isLinked = highlightedAtomIds?.has(atom.id) ?? false;
        const hSuffix = showExplicitHydrogens ? hydrogenSuffixForLabel(fragment, atom.id) : null;

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