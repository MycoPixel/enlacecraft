/**
 * Bond tool glyphs for the sidebar and mobile toolbar.
 *
 * All seven are drawn on the same 28x16 grid with a 2px nominal stroke, so
 * switching tools never changes the apparent weight or the vertical extent
 * of the glyph — only its shape. Geometry is stated in absolute units
 * (separation, bar heights, taper points) rather than left to whatever the
 * previous values happened to be, so a tweak to one glyph can't silently
 * knock it out of alignment with the rest.
 */
export const BondGlyph = {
  single: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  /** 4.5px separation, both lines symmetric about the 8px centerline. */
  double: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="5.75" x2="26" y2="5.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="10.25" x2="26" y2="10.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  /** Same 4.5px separation as the double bond, at a lighter 1.6px so three
   *  lines don't fuse into a solid block at sidebar size. */
  triple: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="3.5" x2="26" y2="3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2" y1="12.5" x2="26" y2="12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  /** Isosceles wedge, sharp corner at the narrow end — the standard
   *  stereochemical read of "toward the viewer". */
  wedge: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <polygon points="2,8 26,2.5 26,13.5" fill="currentColor" />
    </svg>
  ),
  /** Six hashes stepping 2.5 -> 10px tall, evenly spaced along the bond
   *  axis and each centered on it — reads as "away from the viewer". */
  dash: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t = i / 5;
        const h = 2.5 + t * 7.5;
        const x = 4 + i * 4;
        return <line key={i} x1={x} y1={8 - h / 2} x2={x} y2={8 + h / 2} stroke="currentColor" strokeWidth="2" />;
      })}
    </svg>
  ),
  /** One full sine period as two mirrored cubic segments, so the curve is
   *  genuinely smooth through both centerline crossings instead of
   *  approximating it with quadratic arcs. */
  wavy: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <path d="M 2 8 C 5.5 3.2 10.5 3.2 14 8 C 17.5 12.8 21.5 12.8 26 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  ),
  /** Bold bond: the plain single-bond line at double weight — the only
   *  difference from `single` is the stroke, which IS the tool's whole
   *  point, so it must read as "same bond, heavier" at a glance. */
  bold: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  ),
  /** Bold wedged hash: same six growing hashes as `dash` but drawn at a
   *  heavier stroke and a slightly wider spread, so the bold weight is
   *  visible even at this size without turning into a solid wedge. */
  boldHash: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t = i / 5;
        const h = 3 + t * 8;
        const x = 4 + i * 4;
        return <line key={i} x1={x} y1={8 - h / 2} x2={x} y2={8 + h / 2} stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />;
      })}
    </svg>
  ),
  /** Plain dashed bond: uniform dashes ALONG the bond axis — deliberately
   *  unlike `dash` (the hashed wedge), whose marks grow across it, so the
   *  two glyphs can't be confused side by side. */
  dashed: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="8" x2="26" y2="8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4.5 3.5" />
    </svg>
  ),
  /** Dative/coordinate bond: a plain line ending in an arrowhead, the
   *  M←L donor convention (see Bond.dative's doc comment). */
  dative: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <polygon points="26,8 19,4.5 19,11.5" fill="currentColor" />
    </svg>
  ),
  /** Hollow wedge: the same isosceles wedge as `wedge`, but outline-only —
   *  "toward the viewer" without committing to a filled face. */
  hollowWedge: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <polygon points="2,8 26,2.5 26,13.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  /** Five-node zigzag with miter joins, so the vertices stay sharp points
   *  instead of rounding off at this size. */
  chain: (
    <svg viewBox="0 0 28 16" width="22" height="14">
      <polyline points="2,12 8,4 14,12 20,4 26,12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="miter" />
    </svg>
  ),
};
