/** A central vertex fanned out to three explicit substituents — evokes
 * making implicit hydrogens explicit (real bonds, not just text) without
 * depicting any one specific element, since the action applies to
 * whatever's on the canvas. Deliberately distinct from the plain-atom
 * "Atom" icon used for the showHydrogens (text-only) toggle it sits
 * next to. */
export function ExpandedFormulaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" />
      <line x1="12" y1="14" x2="12" y2="4" />
      <line x1="12" y1="14" x2="20" y2="18" />
      <line x1="12" y1="14" x2="4" y2="18" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
