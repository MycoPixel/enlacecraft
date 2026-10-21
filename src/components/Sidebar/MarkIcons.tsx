/**
 * Mark & mechanism icons for the sidebar and mobile toolbar.
 *
 * Each stands in for something the sidebar draws directly on a molecule, so
 * these are drawn to match how the real thing renders (a lone pair really
 * is two dots; a stereo label really is italic) rather than as generic
 * pictograms. Small marks sit on a 16x16 box and the wider ones on 20x16,
 * with the dots centered on the box's own optical center.
 */

/** Two small dots — represents a lone pair (matches how one is actually
 *  drawn on an atom). Centered as a pair on x=8, spanning 3..13. */
export function LonePairIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="5" cy="8" r="2" fill="currentColor" />
      <circle cx="11" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

/** A single dot — represents an unpaired (radical) electron. 2.2px radius
 *  is optically balanced against the lone pair's two 2px dots. */
export function RadicalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** "R/S" text, matching how the label itself actually renders (italic, in parens). */
export function StereoLabelIcon() {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16">
      <text x="10" y="11.5" textAnchor="middle" fontSize="10.5" fontStyle="italic" fontWeight="700" fill="currentColor">
        R/S
      </text>
    </svg>
  );
}

/** A reaction arrow with a couple of short lines above it, standing in for
 *  reagent/condition text written over the arrow — the layout the "Add
 *  reagent text" button reproduces. */
export function ReagentTextIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18">
      <line x1="2" y1="3.5" x2="9" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="3.5" x2="16" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="13" x2="14.5" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M13,10 L17,13 L13,16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A TLC plate as the tool draws it: portrait frame, baseline near the
 *  bottom, dashed solvent front near the top, and two spots on the run —
 *  the exact elements TlcPlateAnnotationView renders on the canvas. */
export function TlcIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="4" y="1.5" width="8" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="4" y1="12.8" x2="12" y2="12.8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="4" y1="3.2" x2="12" y2="3.2" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2 1.4" />
      <circle cx="6.6" cy="10.8" r="1.4" fill="currentColor" />
      <circle cx="9.4" cy="7.6" r="1.4" fill="currentColor" />
    </svg>
  );
}
