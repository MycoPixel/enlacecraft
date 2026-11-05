import type { Annotation, BracketAnnotation, Molecule } from "../../types/chemistry";

/**
 * Draws the repeat-count/subscript of each S-group (the italic "n" on a
 * polymer bracket) next to its closing glyph.
 *
 * The count lives on the molecule (`SGroup.subscript`) rather than as a
 * separate text annotation, because ChemDraw treats it as a property of the
 * bracketed group — it is written as `RepeatCount` in CDXML, not as a
 * caption. Imported files therefore have no text object for it, and without
 * this overlay an imported polymer would show bare brackets with no visible
 * repeat count.
 *
 * Rendered inside the canvas's `data-export-content` group, so PNG/SVG
 * export includes it exactly like the rest of the drawing.
 */
export function SGroupOverlay({
  molecule,
  annotations,
}: {
  molecule: Molecule;
  annotations: Record<string, Annotation>;
}) {
  const groups = Object.values(molecule.sgroups ?? {}).filter((g) => !!g.subscript);
  if (groups.length === 0) return null;

  return (
    <g className="sgroup-overlay" pointerEvents="none">
      {groups.map((group) => {
        const brackets = (group.bracketAnnotationIds ?? [])
          .map((id) => annotations[id])
          .filter((a): a is BracketAnnotation => a?.kind === "bracket");
        if (brackets.length === 0) return null;
        const close = brackets.find((b) => b.facing === "close") ?? brackets[brackets.length - 1];
        return (
          <text
            key={group.id}
            x={close.x + close.width + 3}
            y={close.y + close.height + 11}
            textAnchor="start"
            fontSize="12"
            fontStyle="italic"
            fill="var(--ink)"
            className="sgroup-repeat atom-label"
          >
            {group.subscript}
          </text>
        );
      })}
    </g>
  );
}
