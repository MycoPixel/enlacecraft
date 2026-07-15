import type { ArrowVariant } from "../../types/chemistry";
import { useT } from "../../i18n/useT";

interface ArrowVariantPickerProps {
  value: ArrowVariant;
  onChange: (v: ArrowVariant) => void;
  active: boolean;
  barb: "full" | "single";
  onBarbChange: (b: "full" | "single") => void;
}

const VARIANTS: ArrowVariant[] = ["forward", "equilibrium", "resonance", "curved", "curvedReverse"];
const BARBS: ("full" | "single")[] = ["full", "single"];

export function ArrowVariantPicker({ value, onChange, active, barb, onBarbChange }: ArrowVariantPickerProps) {
  const t = useT();
  return (
    <div>
      <div className="arrow-variant-grid">
        {VARIANTS.map((v) => (
          <button
            key={v}
            className={`arrow-variant-btn ${active && value === v ? "arrow-variant-btn--active" : ""}`}
            onClick={() => onChange(v)}
            title={t(`arrow.${v}`)}
          >
            <MiniArrow variant={v} barb={barb} />
          </button>
        ))}
      </div>
      {/* Arrowhead style: full (electron pair) vs fishhook (single electron)
          — this is the mechanism-arrow distinction, orthogonal to the shape
          chosen above (most relevant for "curved"/"curvedReverse", but
          applies to any variant). */}
      <div className="arrow-barb-grid">
        {BARBS.map((b) => (
          <button
            key={b}
            className={`arrow-variant-btn ${active && barb === b ? "arrow-variant-btn--active" : ""}`}
            onClick={() => onBarbChange(b)}
            title={t(`arrow.barb.${b}`)}
          >
            <MiniArrow variant={value} barb={b} />
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniArrow({ variant, barb }: { variant: ArrowVariant; barb: "full" | "single" }) {
  const markerId = `mini-arrowhead-${variant}-${barb}`;
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          {barb === "full"
            ? <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            : <path d="M 0.5,1.5 Q 7,2 9.5,5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />}
        </marker>
      </defs>
      {variant === "forward" && (
        <line x1={3} y1={9} x2={23} y2={9} stroke="currentColor" strokeWidth={1.4} markerEnd={`url(#${markerId})`} />
      )}
      {variant === "curved" && (
        <path d="M 3,12 Q 13,1 23,9" stroke="currentColor" strokeWidth={1.4} fill="none" markerEnd={`url(#${markerId})`} />
      )}
      {variant === "curvedReverse" && (
        <path d="M 3,9 Q 13,17 23,12" stroke="currentColor" strokeWidth={1.4} fill="none" markerEnd={`url(#${markerId})`} />
      )}
      {variant === "resonance" && (
        <line x1={3} y1={9} x2={23} y2={9} stroke="currentColor" strokeWidth={1.4} markerEnd={`url(#${markerId})`} markerStart={`url(#${markerId})`} />
      )}
      {variant === "equilibrium" && (
        <>
          <line x1={3} y1={6} x2={23} y2={6} stroke="currentColor" strokeWidth={1.2} markerEnd={`url(#${markerId})`} />
          <line x1={23} y1={12} x2={3} y2={12} stroke="currentColor" strokeWidth={1.2} markerEnd={`url(#${markerId})`} />
        </>
      )}
    </svg>
  );
}
