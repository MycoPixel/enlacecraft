import type { CatalyticCycle, Molecule } from "../../types/chemistry";
import { layoutCycle } from "../../engine/cycleLayout";

/**
 * Draws one live catalytic cycle: its directed arcs, optional side arrows
 * and caption, plus (when selected) the transient direction and scale
 * handles. Geometry comes from engine/cycleLayout.ts, so moving any of the
 * node structures refits the arcs on the next render.
 *
 * The arcs and side arrows are drawing content and therefore live inside the
 * canvas's `data-export-content` group. Handles are marked
 * `data-export-exclude` so they never reach SVG/PNG/PDF exports.
 */
export function CycleView({
  cycle,
  molecule,
  selected,
}: {
  cycle: CatalyticCycle;
  molecule: Molecule;
  selected: boolean;
}) {
  const geometry = layoutCycle(cycle, molecule);
  const markerId = `cycle-arrow-${cycle.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const strokeWidth = 1.6 * (cycle.scale ?? 1);
  const handleRadius = 9;
  const scaleHandle = {
    x: geometry.centre.x,
    y: geometry.centre.y + geometry.radius + 30 * (cycle.scale ?? 1),
  };

  return (
    <g
      className={`cycle-view${selected ? " is-selected" : ""}`}
      data-cycle-id={cycle.id}
      pointerEvents="none"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {geometry.arcs.map((arc, index) => {
        const largeArc = Math.abs(arc.sweep) > Math.PI ? 1 : 0;
        const sweepFlag = arc.sweep > 0 ? 1 : 0;
        return (
          <path
            key={`arc-${index}`}
            d={`M ${arc.start.x} ${arc.start.y} A ${geometry.radius} ${geometry.radius} 0 ${largeArc} ${sweepFlag} ${arc.end.x} ${arc.end.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#${markerId})`}
            className="cycle-view__arc"
          />
        );
      })}

      {geometry.sides.map((side) => (
        <g key={side.id} className="cycle-view__side">
          <line
            x1={side.start.x}
            y1={side.start.y}
            x2={side.end.x}
            y2={side.end.y}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#${markerId})`}
          />
          {side.label && (
            <text
              x={side.labelAnchor.x}
              y={side.labelAnchor.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="cycle-view__label"
            >
              {side.label}
            </text>
          )}
        </g>
      ))}

      {geometry.label && (
        <text
          x={geometry.label.x}
          y={geometry.label.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="cycle-view__caption"
        >
          {geometry.label.text}
        </text>
      )}

      {selected && (
        <g data-export-exclude="" className="cycle-view__handles">
          <circle
            cx={geometry.directionHandle.x}
            cy={geometry.directionHandle.y}
            r={handleRadius}
            className="cycle-view__handle"
          />
          <text
            x={geometry.directionHandle.x}
            y={geometry.directionHandle.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="cycle-view__handle-glyph"
          >
            {geometry.clockwise ? "\u21bb" : "\u21ba"}
          </text>
          <rect
            x={scaleHandle.x - 6}
            y={scaleHandle.y - 6}
            width={12}
            height={12}
            rx={2}
            className="cycle-view__handle"
          />
          <path
            d={`M ${scaleHandle.x - 3} ${scaleHandle.y + 3} L ${scaleHandle.x + 3} ${scaleHandle.y - 3}`}
            className="cycle-view__handle-glyph-line"
          />
        </g>
      )}
    </g>
  );
}
