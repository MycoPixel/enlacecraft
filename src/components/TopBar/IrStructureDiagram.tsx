import { useMemo, type CSSProperties } from "react";
import type { Molecule } from "../../types/chemistry";
import { ELEMENT_COLOR } from "../../model/constants";
import {
  diagramBoxSize,
  diagramExtent,
  diagramSourceFragment,
  filterForReportDiagram,
  hydrogenSuffixForLabel,
  type DiagramExtent,
} from "../../io/structureDiagram";

/** CPK white. Local to this diagram - see the note at its use below. */
const HYDROGEN_COLOR = "#FFFFFF";

/**
 * The molecule, as a plain read-only drawing.
 *
 * Deliberately not the NMR report's diagram. That one is a map from a predicted
 * signal back to an atom, so almost all of it is badge and hover logic driven
 * by per-atom predictions; an IR peak has no such mapping — which is the whole
 * reason this is a plain structure rather than a linked one. What it does share
 * is the layout, fitting and hydrogen handling, and those live in
 * structureDiagram.ts precisely so this component is only the drawing.
 *
 * No dragging here: moving and resizing belong to IrStructureOverlay, which
 * wraps this in the floating window. Doing both would give two competing
 * gestures for the same intent.
 */
export function IrStructureDiagram({
  molecule,
  showExplicitHydrogens,
  boxSize,
  maxWidth = 560,
  maxHeight = 460,
}: {
  molecule: Molecule;
  showExplicitHydrogens: boolean;
  /** Explicit box, so a caller that is fitting this into a window it controls
   *  doesn't get a second, independent fitting decision. */
  boxSize?: DiagramExtent;
  maxWidth?: number;
  maxHeight?: number;
}) {
  const fragment = useMemo(
    () => diagramSourceFragment(molecule, showExplicitHydrogens),
    [molecule, showExplicitHydrogens],
  );
  const visible = useMemo(
    () => filterForReportDiagram(fragment, showExplicitHydrogens),
    [fragment, showExplicitHydrogens],
  );

  const atoms = useMemo(() => Object.values(visible.atoms), [visible.atoms]);
  const extent = useMemo(() => diagramExtent(atoms), [atoms]);

  // A panel to itself, so the scale ceiling is lifted rather than left at the
  // cramped overlay default - this drawing is the point of the window.
  const fitted: DiagramExtent = useMemo(
    () => boxSize ?? diagramBoxSize(extent, maxWidth, maxHeight, Infinity),
    [boxSize, extent, maxWidth, maxHeight],
  );

  // viewBox derived from the same extent the pixel box was derived from, or the
  // drawing letterboxes inside its own frame - see diagramExtent.
  const viewBox = useMemo(() => {
    if (!atoms.length) return "0 0 100 100";
    const xs = atoms.map((a) => a.x);
    const ys = atoms.map((a) => a.y);
    const pad = 30;
    return `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${extent.width} ${extent.height}`;
  }, [atoms, extent]);

  // Per-element running index, so labels read C1, C2, O3 the way the NMR
  // diagram's do. Recomputed from scratch rather than kept in a ref: the atom
  // set changes with the hydrogen toggle and a stale counter would label a
  // different atom than it did a moment ago.
  const labelOf = useMemo(() => {
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    for (const atom of atoms) {
      const next = (counts.get(atom.element) ?? 0) + 1;
      counts.set(atom.element, next);
      labels.set(atom.id, `${atom.element}${next}`);
    }
    return labels;
  }, [atoms]);

  if (!atoms.length) return null;

  return (
    <svg
      className="ir-structure__svg"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: `${fitted.width}px`, height: `${fitted.height}px` }}
    >
      {Object.values(visible.bonds).map((bond) => {
        const a1 = visible.atoms[bond.a1];
        const a2 = visible.atoms[bond.a2];
        if (!a1 || !a2) return null;
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const len = Math.hypot(dx, dy) || 1;
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
            className="ir-structure__bond"
          />
        ));
      })}

      {atoms.map((atom) => {
        const isHydrogen = atom.element === "H";
        // Hydrogens laid out purely for display aren't part of the drawn
        // structure the labels were numbered from, and three H's around a
        // methyl are three identical protons - so they get a plain "H" rather
        // than H1/H2/H3.
        const label = isHydrogen ? "H" : labelOf.get(atom.id);
        if (!label) return null;
        const hSuffix = isHydrogen ? null : hydrogenSuffixForLabel(fragment, atom.id);
        // The shared palette, which is tuned for the canvas where a colour is a large
        // shape rather than small text. C and H resolve to --ink there, which is
        // right on a canvas but not here.
        //
        // It goes on the DISC, not the letter. Measured against the panel
        // surface, 30 of the 118 element colours fall under 3:1 as text in the
        // dark and navy themes - including nitrogen, which is in most organic
        // structures - and sulfur reads 1.90:1 in sepia. The letter stays in
        // --ink (13-18:1 in every theme), which is what keeps it readable; the
        // colour is unmistakable as a filled disc instead.
        //
        // HYDROGEN IS THE EXCEPTION, and deliberately so: white, the CPK
        // convention. It is also the one colour that cannot work here the way
        // the others do, because the panel is white in the light theme - a
        // translucent white disc on a white panel is nothing at all. So the
        // hydrogen disc is opaque and ringed (see the CSS), and its letter is
        // pinned dark rather than following the theme, because a fixed white
        // disc needs a fixed dark letter in every theme or the symbol
        // disappears in the dark ones.
        //
        // Hydrogen is NOT overridden in ELEMENT_COLOR itself: that constant is
        // shared with the canvas, where white atom labels on a white panel
        // would be invisible.
        const color = isHydrogen ? HYDROGEN_COLOR : ELEMENT_COLOR[atom.element] ?? "var(--ink)";
        return (
          <g key={atom.id}>
            {/* An opaque backdrop first: the bonds run atom-centre to
                atom-centre, so without something solid under the letter they
                show straight through it. Then the element tint on top. */}
            <circle cx={atom.x} cy={atom.y} r={11} className="ir-structure__atom-backdrop" />
            <circle
              cx={atom.x}
              cy={atom.y}
              r={11}
              className={`ir-structure__atom${isHydrogen ? " ir-structure__atom--hydrogen" : ""}`}
              // The colour is handed over as a custom property rather than as
              // `fill`/`stroke` attributes, so the hydrogen rule below can
              // override the ring without fighting an inline style.
              style={{ "--atom-color": color } as CSSProperties}
            />
            <text
              x={atom.x}
              y={atom.y}
              className={`ir-structure__label${isHydrogen ? " ir-structure__label--hydrogen" : ""}`}
            >
              {label}
              {hSuffix && (
                <tspan className="ir-structure__label-suffix" dy="3">
                  {hSuffix}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}