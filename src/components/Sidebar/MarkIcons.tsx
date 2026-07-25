/** Two small dots — represents a lone pair (matches how one is actually drawn on an atom). */
export function LonePairIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="5.5" cy="8" r="1.6" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** A single dot — represents an unpaired (radical) electron. */
export function RadicalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

/** "R/S" text, matching how the label itself actually renders (italic, in parens). */
export function StereoLabelIcon() {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16">
      <text x="10" y="12" textAnchor="middle" fontSize="10" fontStyle="italic" fontWeight="700" fill="currentColor">
        R/S
      </text>
    </svg>
  );
}

/** A reaction arrow with a couple of short lines above it, standing in for
 * reagent/condition text written over the arrow — the layout the "Add
 * reagent text" button reproduces. */
export function ReagentTextIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18">
      <line x1="2" y1="4" x2="9" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="13" x2="14.5" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13,10 L17,13 L13,16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
