import type { ShapeVariant } from "../../types/chemistry";
import { useT } from "../../i18n/useT";

const VARIANTS: ShapeVariant[] = ["rectangle", "ellipse", "line"];

/** The little glyph shown on each variant button (and on the tool itself). */
export function MiniShape({ variant }: { variant: ShapeVariant }) {
  return (
    <svg width="26" height="18" viewBox="0 0 26 18">
      {variant === "rectangle" && <rect x="3" y="3" width="20" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />}
      {variant === "ellipse" && <ellipse cx="13" cy="9" rx="10" ry="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      {variant === "line" && <line x1="3" y1="14" x2="23" y2="4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

interface ShapeVariantPickerProps {
  /** Currently picked variant — also mirrors the selected shape's own
   * variant when one is selected, so the grid shows what's live. */
  variant: ShapeVariant;
  filled: boolean;
  onChange: (variant: ShapeVariant) => void;
  onFilledChange: (filled: boolean) => void;
  active: boolean;
}

/**
 * Shape-tool picker: the three graphics primitives (rectangle / ellipse /
 * line) plus the filled/outline toggle ChemDraw's shape tools carry. Picking
 * a variant both sets what the NEXT drag will draw and (mirroring the arrow
 * picker's behavior, via the caller) restyles any shape selected right now.
 */
export function ShapeVariantPicker({ variant, filled, onChange, onFilledChange, active }: ShapeVariantPickerProps) {
  const t = useT();
  return (
    <div>
      <div className="arrow-variant-grid" role="radiogroup" aria-label={t("tool.shape")}>
        {VARIANTS.map((v) => (
          <button
            key={v}
            className={`arrow-variant-btn ${active && variant === v ? "arrow-variant-btn--active" : ""}`}
            onClick={() => onChange(v)}
            title={t(`shape.${v}`)}
          >
            <MiniShape variant={v} />
          </button>
        ))}
      </div>
      <button
        className={`arrow-variant-btn shape-fill-toggle ${active && filled ? "arrow-variant-btn--active" : ""}`}
        onClick={() => onFilledChange(!filled)}
        title={t("shape.filled")}
      >
        <MiniShape variant="rectangle" />
        <span className="shape-fill-toggle__label">{filled ? t("shape.filled") : t("shape.outline")}</span>
      </button>
    </div>
  );
}
