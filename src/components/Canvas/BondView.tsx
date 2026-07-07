import type { Atom, Bond } from "../../types/chemistry";
import { insetSegment } from "../../model/geometry";

interface BondViewProps {
  bond: Bond;
  a1?: Atom;
  a2?: Atom;
  /** Pre-resolved "center"/"left"/"right" for order-2 bonds; see resolveDoubleBondSide. */
  resolvedSide?: "center" | "left" | "right";
  /** How far to pull the line back from each end to clear that atom's label (0 for a bare vertex). */
  r1?: number;
  r2?: number;
}

export function BondView({ bond, a1, a2, resolvedSide, r1 = 0, r2 = 0 }: BondViewProps) {
  if (!a1 || !a2) return null;

  // Defensively normalize order: anything other than a real 1/2/3 (e.g. an
  // aromatic "4" or a query bond type from an imported MOL/SDF file) falls
  // back to a single bond rather than being misrendered as a triple bond.
  const order = bond.order === 2 ? 2 : bond.order === 3 ? 3 : 1;

  // Pull the endpoints in from each atom's center so the line stops at the
  // edge of that atom's label instead of running underneath it.
  const { p1, p2 } = insetSegment(a1, a2, r1, r2);

  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const perp = ang + Math.PI / 2;
  const ux = Math.cos(perp);
  const uy = Math.sin(perp);
  // "currentColor" lets a wrapping <g style={{color: ...}}> recolor bonds,
  // which the live drag preview uses to render as a tinted ghost.
  const color = "currentColor";

  if (bond.stereo === "wedge") {
    const w = 6.2;
    const pts = `${p1.x},${p1.y} ${p2.x + ux * w},${p2.y + uy * w} ${p2.x - ux * w},${p2.y - uy * w}`;
    return <polygon points={pts} fill={color} />;
  }

  if (bond.stereo === "dash") {
    const n = 6;
    const lines = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const w = 1 + t * 5.5;
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      lines.push(
        <line key={i} x1={x + ux * w} y1={y + uy * w} x2={x - ux * w} y2={y - uy * w} stroke={color} strokeWidth="1.6" />
      );
    }
    return <g>{lines}</g>;
  }

  if (order === 1) {
    return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth="1.8" strokeLinecap="round" />;
  }

  const gap = 3.1;
  if (order === 2) {
    const side = resolvedSide ?? (bond.doubleSide === "auto" ? "center" : bond.doubleSide);

    if (side !== "center") {
      // Primary line sits exactly on the atom-atom axis; the second line is
      // offset to just one side and inset from the endpoints, matching the
      // conventional look for ring double bonds (e.g. benzene).
      const sign = side === "left" ? -1 : 1;
      const inset = 0.16;
      const ix1 = p1.x + (p2.x - p1.x) * inset;
      const iy1 = p1.y + (p2.y - p1.y) * inset;
      const ix2 = p1.x + (p2.x - p1.x) * (1 - inset);
      const iy2 = p1.y + (p2.y - p1.y) * (1 - inset);
      const off = gap * 2 * sign;
      return (
        <g>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <line x1={ix1 + ux * off} y1={iy1 + uy * off} x2={ix2 + ux * off} y2={iy2 + uy * off} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      );
    }

    return (
      <g>
        <line x1={p1.x + ux * gap} y1={p1.y + uy * gap} x2={p2.x + ux * gap} y2={p2.y + uy * gap} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <line x1={p1.x - ux * gap} y1={p1.y - uy * gap} x2={p2.x - ux * gap} y2={p2.y - uy * gap} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </g>
    );
  }

  // order === 3
  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1={p1.x + ux * gap * 1.7} y1={p1.y + uy * gap * 1.7} x2={p2.x + ux * gap * 1.7} y2={p2.y + uy * gap * 1.7} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1={p1.x - ux * gap * 1.7} y1={p1.y - uy * gap * 1.7} x2={p2.x - ux * gap * 1.7} y2={p2.y - uy * gap * 1.7} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}
