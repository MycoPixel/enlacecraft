import type { OrbitalVariant } from "../../types/chemistry";
import { useT } from "../../i18n/useT";

const VARIANTS: OrbitalVariant[] = ["s", "p", "lobe"];

/** Shared teardrop lobe (nucleus at the pointed left end), mirroring the
 * canvas renderer's path so the picker looks exactly like what gets drawn. */
function miniLobe(size = 10): string {
  const w = size * 0.36;
  return `M 0 0 C ${size * 0.22} ${-w} ${size * 0.7} ${-w * 1.05} ${size} 0 C ${size * 0.7} ${w * 1.05} ${size * 0.22} ${w} 0 0 Z`;
}

/** The little glyph shown on each variant button (and on the tool itself). */
export function MiniOrbital({ variant, filled = false }: { variant: OrbitalVariant; filled?: boolean }) {
  const fill = filled ? "currentColor" : "none";
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <g transform="translate(3 9)">
        {variant === "s" && <circle cx="11" cy="0" r="7" fill={fill} stroke="currentColor" strokeWidth="1.6" />}
        {variant === "p" && (
          <>
            <path d={miniLobe(11)} fill={fill} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d={miniLobe(11)} fill={fill} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" transform="rotate(180)" />
          </>
        )}
        {variant === "lobe" && <path d={miniLobe(18)} fill={fill} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" transform="translate(3 0)" />}
      </g>
    </svg>
  );
}

interface OrbitalVariantPickerProps {
  variant: OrbitalVariant;
  filled: boolean;
  onChange: (variant: OrbitalVariant) => void;
  onFilledChange: (filled: boolean) => void;
  active: boolean;
}

/**
 * Orbital-tool picker: s (circle), p (dumbbell), and the free single lobe,
 * plus the filled/shaded toggle. Same dual behavior as the shape and arrow
 * pickers: sets the next placement AND restyles the selected orbital.
 */
export function OrbitalVariantPicker({ variant, filled, onChange, onFilledChange, active }: OrbitalVariantPickerProps) {
  const t = useT();
  return (
    <div>
      <div className="arrow-variant-grid" role="radiogroup" aria-label={t("tool.orbital")}>
        {VARIANTS.map((v) => (
          <button
            key={v}
            className={`arrow-variant-btn ${active && variant === v ? "arrow-variant-btn--active" : ""}`}
            onClick={() => onChange(v)}
            title={t(`orbital.${v}`)}
          >
            <MiniOrbital variant={v} />
          </button>
        ))}
      </div>
      <button
        className={`arrow-variant-btn shape-fill-toggle ${active && filled ? "arrow-variant-btn--active" : ""}`}
        onClick={() => onFilledChange(!filled)}
        title={t("orbital.filled")}
      >
        <MiniOrbital variant={variant === "s" ? "s" : "p"} filled />
        <span className="shape-fill-toggle__label">{filled ? t("orbital.filled") : t("orbital.outline")}</span>
      </button>
    </div>
  );
}
