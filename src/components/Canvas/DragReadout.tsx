import { angleOf, dist } from "../../model/geometry";
import { BOND_LEN } from "../../model/constants";
import type { Point } from "../../types/chemistry";

interface DragReadoutProps {
  from: Point;
  to: Point;
  /** How far to the side of the line the label sits, in world units — kept
   * small since it scales with zoom along with everything else on the
   * canvas (see MoleculeCanvas's viewport transform), same as atom labels. */
  offset?: number;
}

/**
 * A small live label next to a bond/arrow while it's being dragged out,
 * showing its current length — as a multiple of the standard bond length,
 * since "is this the same length as the rest of the structure?" is the
 * question that actually matters when drawing, not an absolute pixel
 * count — and its angle in degrees. Mainly meant to make the angle
 * snapping in useCanvasInteractions visible and confirmable in the moment
 * (you can watch it lock to "30°", "90°", etc.) rather than only
 * discoverable after the fact.
 */
export function DragReadout({ from, to, offset = 14 }: DragReadoutProps) {
  const length = dist(from, to);
  if (length < 4) return null; // too short a drag yet for a reading to mean anything

  const angleRad = angleOf(from, to);
  let angleDeg = Math.round((angleRad * 180) / Math.PI) % 360;
  if (angleDeg < 0) angleDeg += 360;
  const ratio = (length / BOND_LEN).toFixed(2);
  const label = `${ratio}\u00d7 \u00b7 ${angleDeg}\u00b0`;

  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const segLen = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector, so the label sits beside the line rather
  // than on top of it regardless of the line's own direction.
  const px = -dy / segLen;
  const py = dx / segLen;
  const labelX = midX + px * offset;
  const labelY = midY + py * offset;

  const boxW = label.length * 5.6 + 10;
  const boxH = 16;

  return (
    <g pointerEvents="none" data-export-exclude="true">
      <rect
        x={labelX - boxW / 2}
        y={labelY - boxH / 2}
        width={boxW}
        height={boxH}
        rx={4}
        fill="var(--panel)"
        stroke="var(--panel-border)"
        strokeWidth={1}
      />
      <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600} fill="var(--accent)">
        {label}
      </text>
    </g>
  );
}
