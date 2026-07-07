import { RING_TEMPLATES } from "../../model/constants";
import { useT } from "../../i18n/useT";

interface RingPickerProps {
  value: string;
  onChange: (id: string) => void;
  active: boolean;
}

export function RingPicker({ value, onChange, active }: RingPickerProps) {
  const t = useT();
  return (
    <div className="ring-grid">
      {RING_TEMPLATES.map((tmpl) => (
        <button
          key={tmpl.id}
          className={`ring-btn ${active && value === tmpl.id ? "ring-btn--active" : ""}`}
          onClick={() => onChange(tmpl.id)}
          title={t(`ring.${tmpl.id}`)}
        >
          <MiniRing sides={tmpl.sides} aromatic={tmpl.aromatic} />
        </button>
      ))}
    </div>
  );
}

function MiniRing({ sides, aromatic }: { sides: number; aromatic: boolean }) {
  const r = 9;
  const cx = 12;
  const cy = 12;
  const pts = Array.from({ length: sides }, (_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
  }).join(" ");
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {aromatic && <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  );
}
