import type { Atom, Bond } from "../../types/chemistry";
import { insetSegment } from "../../model/geometry";
import { isMetalLike } from "../../model/valence";
import { memo } from "react";

interface BondViewProps {
  bond: Bond;
  a1?: Atom;
  a2?: Atom;
  /** Pre-resolved "center"/"left"/"right" for order-2 bonds; see resolveDoubleBondSide. */
  resolvedSide?: "center" | "left" | "right";
  /** True when this bond is one edge of a ring currently shown with an
   * inscribed aromatic circle instead of its own alternating double-bond
   * lines (see engine/aromaticRings.ts and the ring's own
   * AromaticRingDisplay) -- draws as a single line regardless of the
   * bond's real order, same as the circle's whole point: the underlying
   * Kekule order is untouched, only how this one bond happens to render
   * right now. */
  hideForAromaticCircle?: boolean;
  /** How far to pull the line back from each end to clear that atom's label (0 for a bare vertex). */
  r1?: number;
  r2?: number;
}

/**
 * Memoized: every prop here is either a stable object identity (the bond and
 * its two atoms are reused untouched by the immutable reducers in
 * model/molecule.ts) or a primitive, so a draw can only re-render the bonds
 * it actually affected instead of every bond on the canvas. See
 * MoleculeContent's doc comment in MoleculeCanvas.tsx for the wider reason
 * this matters.
 */
export const BondView = memo(function BondView({ bond, a1, a2, resolvedSide, hideForAromaticCircle, r1 = 0, r2 = 0 }: BondViewProps) {
  if (!a1 || !a2) return null;
  const strokes = <BondStrokes bond={bond} a1={a1} a2={a2} resolvedSide={resolvedSide} hideForAromaticCircle={hideForAromaticCircle} r1={r1} r2={r2} />;
  if (!bond.highlightColor) return strokes;
  // A thick, translucent underlay along the same segment as the real
  // bond line(s) — drawn first (so it sits behind), same idea as
  // AtomView's highlight halo. Only need the endpoints, not to touch any
  // of the order/stereo-specific line math below.
  const { p1, p2 } = insetSegment(a1, a2, r1, r2);
  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={bond.highlightColor} strokeWidth="7" strokeLinecap="round" opacity={0.4} className="bond-highlight" />
      {strokes}
    </g>
  );
});

function BondStrokes({ bond, a1, a2, resolvedSide, hideForAromaticCircle, r1 = 0, r2 = 0 }: Required<Pick<BondViewProps, "bond" | "a1" | "a2">> & Pick<BondViewProps, "resolvedSide" | "hideForAromaticCircle" | "r1" | "r2">) {

  // Pull the endpoints in from each atom's center so the line stops at the
  // edge of that atom's label instead of running underneath it. Needed by
  // the dative-bond arrow below too, so it's computed before that check
  // rather than after (order normalization, right below, isn't).
  const { p1, p2 } = insetSegment(a1, a2, r1, r2);

  // A dative/coordinate bond (see Bond.dative's doc comment) is drawn as a
  // plain arrow into the acceptor, not as any of the order/stereo styles
  // below \u2014 real coordination-compound drawings don't combine "this is a
  // dative bond" with a wedge/dash 3D depiction on the same bond, so this
  // takes full precedence rather than layering on top of order/stereo.
  // markerEnd puts the arrowhead at the line's second endpoint, so the
  // line's own point order needs to end at the acceptor (metal-like) atom
  // \u2014 detected the same way the rest of the app already treats an atom as
  // "no ordinary valence rules apply" (see valence.ts): no VALENCE entry.
  // Only reversed when that's unambiguous (exactly one endpoint qualifies);
  // any other case (both, neither, or unresolved) keeps a1\u2192a2, same as an
  // ordinary bond's natural draw direction.
  if (bond.dative) {
    const arrowIntoA1 = isMetalLike(a1.element) && !isMetalLike(a2.element);
    const [lx1, ly1, lx2, ly2] = arrowIntoA1 ? [p2.x, p2.y, p1.x, p1.y] : [p1.x, p1.y, p2.x, p2.y];
    return (
      <line
        x1={lx1} y1={ly1} x2={lx2} y2={ly2}
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        markerEnd="url(#arrowhead-small)"
      />
    );
  }

  // Defensively normalize order: anything other than a real 1/2/3 (e.g. an
  // aromatic "4" or a query bond type from an imported MOL/SDF file) falls
  // back to a single bond rather than being misrendered as a triple bond.
  // A ring bond currently shown with an inscribed circle (see
  // hideForAromaticCircle's own doc comment) draws the same way regardless
  // of its real order -- the circle stands in for whatever double bonds
  // this ring would otherwise show.
  const order = hideForAromaticCircle ? 1 : bond.order === 2 ? 2 : bond.order === 3 ? 3 : 1;

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

  // Bold bond: the same solid line as an ordinary single bond but drawn
  // heavy — the "this bond is the point" emphasis ChemDraw's Bold Bond
  // tool gives (reaction-center callouts, discussion figures).
  if (bond.stereo === "bold") {
    return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth="4.6" strokeLinecap="round" />;
  }

  // Bold wedged hash: the hashed wedge's marks both start thicker AND
  // grow wider along the bond, reading as the heavy-stroke sibling of the
  // plain hashed dash above (ChemDraw's Wedged Hash, bold weight).
  if (bond.stereo === "boldHash") {
    const n = 6;
    const lines = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const w = 1.4 + t * 7.2;
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      lines.push(
        <line key={i} x1={x + ux * w} y1={y + uy * w} x2={x - ux * w} y2={y - uy * w} stroke={color} strokeWidth="2.6" strokeLinecap="round" />
      );
    }
    return <g>{lines}</g>;
  }

  // Plain dashed bond: a non-stereochemical broken line — partial bonds,
  // transition states, hydrogen bonds, "here be a forming interaction".
  // Unlike the hashed "dash" above, the marks run ALONG the bond and are
  // uniform, so it reads as a gap, not as depth.
  if (bond.stereo === "dashed") {
    return (
      <line
        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={color} strokeWidth="1.8" strokeLinecap="round"
        strokeDasharray="5 4"
      />
    );
  }

  // Bold double bond: two heavy parallel lines — ChemDraw's "Bold Double"
  // bond for emphasis on reaction-center double bonds.
  if (bond.stereo === "boldDouble") {
    const off = 3.0;
    return (
      <g>
        <line x1={p1.x + ux * off} y1={p1.y + uy * off} x2={p2.x + ux * off} y2={p2.y + uy * off} stroke={color} strokeWidth="4.6" strokeLinecap="round" />
        <line x1={p1.x - ux * off} y1={p1.y - uy * off} x2={p2.x - ux * off} y2={p2.y - uy * off} stroke={color} strokeWidth="4.6" strokeLinecap="round" />
      </g>
    );
  }

  // Dashed double bond: two dashed parallel lines — partial double bond,
  // resonance hybrid, transition state.
  if (bond.stereo === "dashedDouble") {
    const off = 2.0;
    return (
      <g>
        <line x1={p1.x + ux * off} y1={p1.y + uy * off} x2={p2.x + ux * off} y2={p2.y + uy * off} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="5 4" />
        <line x1={p1.x - ux * off} y1={p1.y - uy * off} x2={p2.x - ux * off} y2={p2.y - uy * off} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="5 4" />
      </g>
    );
  }

  // Hollow wedge: wedge outline only (no fill) — "this bond comes out
  // toward you" shown as an unfilled triangular outline.
  if (bond.stereo === "hollowWedge") {
    const w = 6.2;
    return (
      <polygon
        points={`${p1.x},${p1.y} ${p2.x + ux * w},${p2.y + uy * w} ${p2.x - ux * w},${p2.y - uy * w}`}
        fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round"
      />
    );
  }

  if (bond.stereo === "wavy") {
    // A sine wave along the bond axis — the standard notation for
    // unspecified/mixed stereochemistry at this bond (as opposed to wedge/
    // dash, which each commit to one specific configuration).
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const waveLen = 7;
    const amp = 2.6;
    const cycles = Math.max(2, Math.round(len / waveLen));
    let d = `M ${p1.x} ${p1.y}`;
    for (let i = 0; i < cycles * 2; i++) {
      const t0 = i / (cycles * 2);
      const t1 = (i + 1) / (cycles * 2);
      const sign = i % 2 === 0 ? 1 : -1;
      const midT = (t0 + t1) / 2;
      const midX = p1.x + (p2.x - p1.x) * midT + ux * amp * sign;
      const midY = p1.y + (p2.y - p1.y) * midT + uy * amp * sign;
      const endX = p1.x + (p2.x - p1.x) * t1;
      const endY = p1.y + (p2.y - p1.y) * t1;
      d += ` Q ${midX} ${midY} ${endX} ${endY}`;
    }
    return <path d={d} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />;
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
