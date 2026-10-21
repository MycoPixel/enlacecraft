import type { BracketAnnotation, BracketVariant } from "../../types/chemistry";
import { bracketPath } from "../Canvas/BracketAnnotationView";
import { useT } from "../../i18n/useT";

interface BracketVariantPickerProps {
  variant: BracketVariant;
  onChange: (variant: BracketVariant) => void;
  active: boolean;
}

const VARIANTS: BracketVariant[] = ["paren", "square", "curly"];

/**
 * Picks the bracket *style* only — the bracket tool always places a
 * matched open+close pair in one drag (see addBracketPair), so there's no
 * separate "which facing" choice to make here anymore. Each button previews
 * both halves together to make that pairing clear at a glance.
 */
export function BracketVariantPicker({ variant, onChange, active }: BracketVariantPickerProps) {
  const t = useT();
  return (
    <div className="bracket-variant-grid">
      {VARIANTS.map((v) => (
        <button
          key={v}
          className={`bracket-variant-btn ${active && variant === v ? "bracket-variant-btn--active" : ""}`}
          onClick={() => onChange(v)}
          title={t(`bracket.${v}.pair`)}
        >
          <MiniBracketPair variant={v} />
        </button>
      ))}
    </div>
  );
}

/**
 * Reuses the exact same path-building code the real canvas rendering uses
 * (bracketPath, from BracketAnnotationView) rather than a separately
 * hand-drawn approximation — the previous version had its own simplified
 * curve formula for the mini icons, which had drifted from the real
 * rendering and ended up drawing the curly variant backwards. Building the
 * preview from two throwaway BracketAnnotation-shaped objects guarantees
 * this can't happen again: the icon is always exactly what you'll draw.
 */
function MiniBracketPair({ variant }: { variant: BracketVariant }) {
  const y = 2, w = 5, h = 14;
  const openX = 3;
  const closeX = 16;
  const open: BracketAnnotation = { id: "__mini_open__", kind: "bracket", x: openX, y, width: w, height: h, variant, facing: "open" };
  const close: BracketAnnotation = { id: "__mini_close__", kind: "bracket", x: closeX, y, width: w, height: h, variant, facing: "close" };
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <path d={bracketPath(open)} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={bracketPath(close)} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
