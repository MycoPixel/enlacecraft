import { useMemo } from "react";
import type { Molecule } from "../../types/chemistry";
import { analyzeAromaticity, type AromaticityVerdict } from "../../engine/aromaticity";

/**
 * A coloured outline around every ring, keyed to its aromaticity verdict.
 *
 * Drawn as a polygon through the ring's own atoms rather than an inscribed
 * circle. The aromatic circle in engine/aromaticRings.ts's ringCircleGeometry
 * is right for the conventional benzene-style glyph, but this has to work for
 * any ring — and a circle inscribed in a pentagon or a seven-ring reads as a
 * different shape from the ring it is meant to be labelling.
 *
 * Deliberately scoped to the whole molecule, not the current selection: the
 * panel narrows to a selection on request, but an overlay that vanished
 * whenever you clicked an atom would flicker through the whole drawing while
 * you worked. This is a persistent annotation of the structure; the panel is
 * the place to ask about one specific part of it.
 */
export function AromaticityOverlay({ molecule }: { molecule: Molecule }) {
  // crossCheck off: it round-trips a molfile through OpenChemLib, which is
  // far too heavy to repeat on every canvas repaint, and this overlay has
  // nowhere to show the answer anyway.
  const systems = useMemo(() => analyzeAromaticity(molecule, { crossCheck: false }), [molecule]);

  if (systems.length === 0) return null;

  return (
    <g
      className="aromaticity-overlay"
      pointerEvents="none"
      // data-export-exclude (not data-export-content) is what the export path
      // actually strips -- see exportImage.ts's prepareExportClone. The verdict
      // outline is the app's opinion of the structure, not part of it, and
      // shouldn't be inked onto someone's exported figure or SVG.
      data-export-exclude=""
    >
      {systems.flatMap((system, i) =>
        system.rings.map((ring, j) => {
          // A fused system's rings are drawn one outline per ring, all in the
          // system's verdict colour — so naphthalene shows two outlines, both
          // green, rather than one ambiguous outline round the pair.
          const points = ring
            .map((id) => molecule.atoms[id])
            .filter(Boolean)
            .map((a) => `${a.x},${a.y}`)
            .join(" ");
          if (!points) return null;
          return (
            <polygon
              key={`${i}-${j}`}
              points={points}
              className={`aromaticity-overlay__ring is-${verdictClass(system.verdict)}`}
            />
          );
        }),
      )}
    </g>
  );
}

function verdictClass(verdict: AromaticityVerdict): string {
  switch (verdict) {
    case "aromatic":
      return "aromatic";
    case "antiaromatic":
      return "antiaromatic";
    case "non-aromatic":
      return "non-aromatic";
    default:
      return "unknown";
  }
}