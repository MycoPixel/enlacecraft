import type { Atom } from "../../types/chemistry";
import { insetSegment } from "../../model/geometry";

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074",
  "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
};

function superscript(n: number): string {
  return String(n).split("").map((d) => SUPERSCRIPT_DIGITS[d] ?? d).join("");
}

interface HapticBondViewProps {
  metal?: Atom;
  ringAtoms: Atom[];
  /** How far to pull the line back from the metal atom's center to clear
   * its label \u2014 same atomLabelRadius(...) MoleculeCanvas already computes
   * for ordinary bonds touching this atom (see its BondView call sites).
   * No equivalent radius exists for the centroid end since there's no
   * label there to clear. */
  r1?: number;
}

/**
 * Renders a haptic (\u03b7) bond \u2014 metal atom to the live centroid of its ring
 * atoms, e.g. ferrocene's Fe-to-Cp bonds \u2014 as a dashed line (visually
 * distinct from both an ordinary covalent bond and a dative arrow) with
 * an \u03b7n label near its midpoint, n = ringAtoms.length. See HapticBond's
 * doc comment (types/chemistry.ts) for why this needs its own render
 * path rather than reusing BondView: this "bond" doesn't have two fixed
 * atom endpoints \u2014 it has one atom and a centroid recomputed every
 * render from wherever the ring atoms currently are \u2014 so none of
 * BondView's order/stereo/dative logic applies, and there's nothing here
 * for that logic to accidentally interact with either.
 */
export function HapticBondView({ metal, ringAtoms, r1 = 0 }: HapticBondViewProps) {
  if (!metal || ringAtoms.length < 2) return null;

  const centroid = {
    x: ringAtoms.reduce((sum, a) => sum + a.x, 0) / ringAtoms.length,
    y: ringAtoms.reduce((sum, a) => sum + a.y, 0) / ringAtoms.length,
  };
  const { p1, p2 } = insetSegment(metal, centroid, r1, 0);
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  return (
    <g className="haptic-bond" pointerEvents="none">
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 3" opacity={0.75} />
      <text x={midX + 6} y={midY - 4} fontSize="10.5" fontStyle="italic" fill="currentColor" className="atom-label">
        {`\u03b7${superscript(ringAtoms.length)}`}
      </text>
    </g>
  );
}
