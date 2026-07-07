import type { ArrowVariant } from "../../types/chemistry";
import { useT } from "../../i18n/useT";

interface ArrowVariantPickerProps {
  value: ArrowVariant;
  onChange: (v: ArrowVariant) => void;
  active: boolean;
}

const VARIANTS: ArrowVariant[] = ["forward", "equilibrium", "resonance", "curved", "curvedReverse"];

export function ArrowVariantPicker({ value, onChange, active }: ArrowVariantPickerProps) {
  const t = useT();
  return (
    <div className="arrow-variant-grid">
      {VARIANTS.map((v) => (
        <button
          key={v}
          className={`arrow-variant-btn ${active && value === v ? "arrow-variant-btn--active" : ""}`}
          onClick={() => onChange(v)}
          title={t(`arrow.${v}`)}
        >
          <MiniArrow variant={v} />
        </button>
      ))}
    </div>
  );
}

function MiniArrow({ variant }: { variant: ArrowVariant }) {
  const markerId = `mini-arrowhead-${variant}`;
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
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
