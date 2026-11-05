import type { TorsionPoint, TorsionSummary } from "./torsionScan";

// Mirrors Molecule3DView's ROTATE_COLOR — kept as a separate literal here
// (rather than an import) since that constant is module-private to
// Molecule3DView and this chart is deliberately a "dumb", presentation-only
// component with no dependency on the panel that hosts it.
const CURRENT_ANGLE_COLOR = "#4fb3ff";
const MOST_STABLE_COLOR = "#3ecf8e";
const LEAST_STABLE_COLOR = "#e5484d";

/**
 * Plots one MMFF94 single-point energy scan (see torsionScan.ts) as a
 * small line chart: x = rotation angle around the picked bond (0-360°),
 * y = rigid, unminimized energy at that angle. Marks the most/least
 * stable rotamers found in the scan, plus (with a dashed line) whatever
 * angle the rotate-bond slider is currently sitting at, so the live
 * slider position and the scanned curve read as the same picture.
 */
export function TorsionEnergyChart({
  points,
  summary,
  currentAngle,
  width = 220,
  height = 64,
}: {
  points: TorsionPoint[];
  summary: TorsionSummary;
  currentAngle: number;
  width?: number;
  height?: number;
}) {
  const scored = points.filter(
    (p): p is TorsionPoint & { energyKcalMol: number } => p.energyKcalMol !== null,
  );
  if (scored.length < 2) return null;

  const padX = 3;
  const padTop = 6;
  const padBottom = 12;

  const minE = summary.mostStable.energyKcalMol;
  const maxE = summary.leastStable.energyKcalMol;
  const span = Math.max(maxE - minE, 0.01); // guard against a flat (zero-range) scan

  const xFor = (angle: number) => padX + (angle / 360) * (width - 2 * padX);
  const yFor = (energy: number) =>
    height - padBottom - ((energy - minE) / span) * (height - padTop - padBottom);

  const pathD = scored
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.angle).toFixed(1)} ${yFor(p.energyKcalMol).toFixed(1)}`)
    .join(" ");

  const tickAngles = [0, 90, 180, 270, 360];

  return (
    <svg
      className="molecule-3d-panel__torsion-chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-hidden="true"
    >
      {tickAngles.map((angle) => (
        <line
          key={angle}
          x1={xFor(angle)}
          x2={xFor(angle)}
          y1={padTop}
          y2={height - padBottom}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={1}
        />
      ))}

      <line
        x1={xFor(currentAngle)}
        x2={xFor(currentAngle)}
        y1={padTop}
        y2={height - padBottom}
        stroke={CURRENT_ANGLE_COLOR}
        strokeWidth={1.2}
        strokeDasharray="2 2"
      />

      <path d={pathD} fill="none" stroke="currentColor" strokeOpacity={0.75} strokeWidth={1.4} />

      <circle cx={xFor(summary.mostStable.angle)} cy={yFor(summary.mostStable.energyKcalMol)} r={2.6} fill={MOST_STABLE_COLOR} />
      <circle cx={xFor(summary.leastStable.angle)} cy={yFor(summary.leastStable.energyKcalMol)} r={2.6} fill={LEAST_STABLE_COLOR} />

      {tickAngles.map((angle) => (
        <text key={angle} x={xFor(angle)} y={height - 2} fontSize={7} textAnchor="middle" fill="currentColor" fillOpacity={0.6}>
          {angle}°
        </text>
      ))}
    </svg>
  );
}
