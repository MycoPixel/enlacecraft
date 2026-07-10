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
          <MiniRing sides={tmpl.sides} aromatic={tmpl.aromatic} heteroatoms={tmpl.heteroatoms} />
        </button>
      ))}
    </div>
  );
}

function MiniRing({ sides, aromatic, heteroatoms }: { sides: number; aromatic: boolean; heteroatoms?: { position: number; element: string }[] }) {
  const r = 9;
  const cx = 12;
  const cy = 12;
  const vertices = Array.from({ length: sides }, (_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
  });
  const pts = vertices.map((v) => `${v.x},${v.y}`).join(" ");
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {aromatic && <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke="currentColor" strokeWidth="1.2" />}
      {heteroatoms?.map(({ position, element }) => {
        const v = vertices[position];
        if (!v) return null;
        return (
          <text key={position} x={v.x} y={v.y} textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight={600} stroke="var(--panel)" strokeWidth={2.5} paintOrder="stroke">
            {element}
          </text>
        );
      })}
    </svg>
  );
}
