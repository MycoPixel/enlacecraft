import type { BracketFacing, BracketVariant } from "../../types/chemistry";
import { useT } from "../../i18n/useT";

interface BracketVariantPickerProps {
  variant: BracketVariant;
  facing: BracketFacing;
  onChange: (variant: BracketVariant, facing: BracketFacing) => void;
  active: boolean;
}

const OPTIONS: { variant: BracketVariant; facing: BracketFacing }[] = [
  { variant: "paren", facing: "open" }, { variant: "paren", facing: "close" },
  { variant: "square", facing: "open" }, { variant: "square", facing: "close" },
  { variant: "curly", facing: "open" }, { variant: "curly", facing: "close" },
];

export function BracketVariantPicker({ variant, facing, onChange, active }: BracketVariantPickerProps) {
  const t = useT();
  return (
    <div className="bracket-variant-grid">
      {OPTIONS.map((opt) => (
        <button
          key={`${opt.variant}-${opt.facing}`}
          className={`bracket-variant-btn ${active && variant === opt.variant && facing === opt.facing ? "bracket-variant-btn--active" : ""}`}
          onClick={() => onChange(opt.variant, opt.facing)}
          title={t(`bracket.${opt.variant}.${opt.facing}`)}
        >
          <MiniBracket variant={opt.variant} facing={opt.facing} />
        </button>
      ))}
    </div>
  );
}

function MiniBracket({ variant, facing }: { variant: BracketVariant; facing: BracketFacing }) {
  const x = 12, y = 3, w = 6, h = 12;
  const open = facing === "open";
  let d: string;
  if (variant === "square") {
    const strokeX = open ? x : x + w;
    const tickToX = open ? x + w : x;
    d = `M ${tickToX},${y} L ${strokeX},${y} L ${strokeX},${y + h} L ${tickToX},${y + h}`;
  } else if (variant === "paren") {
    const anchorX = open ? x + w : x;
    const peakX = open ? x : x + w;
    d = `M ${anchorX},${y} C ${peakX},${y + h * 0.15} ${peakX},${y + h * 0.85} ${anchorX},${y + h}`;
  } else {
    const anchorX = open ? x : x + w;
    const tipX = open ? x + w : x;
    const midY = y + h / 2;
    d = `M ${anchorX},${y} Q ${anchorX},${midY - h * 0.15} ${tipX},${midY} Q ${anchorX},${midY + h * 0.15} ${anchorX},${y + h}`;
  }
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <path d={d} stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
