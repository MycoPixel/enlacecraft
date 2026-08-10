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
          <RingIcon templateId={tmpl.id} />
        </button>
      ))}
    </div>
  );
}

/** The icon for one ring template — also used standalone as the collapsed
 * dropdown trigger's icon, so the sidebar shows which ring is currently
 * selected without needing the whole grid open. */
export function RingIcon({ templateId }: { templateId: string }) {
  const tmpl = RING_TEMPLATES.find((r) => r.id === templateId) ?? RING_TEMPLATES[0];
  return tmpl.fused ? <MiniNaphthalene /> : <MiniRing sides={tmpl.sides} aromatic={tmpl.aromatic} heteroatoms={tmpl.heteroatoms} />;
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

/**
 * Two small fused hexagons sharing a vertical edge — a distinct glyph from
 * the generic single-hexagon MiniRing above, so naphthalene reads as its
 * own (fused, two-ring) structure at a glance in the picker. Each hexagon
 * gets its own small aromatic circle, same convention MiniRing uses for
 * every other aromatic template, so naphthalene's aromaticity reads at a
 * glance instead of looking like a plain (non-aromatic) fused ring pair.
 */
function MiniNaphthalene() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <polygon
        points="12,9 12,15 6.8,18 1.6,15 1.6,9 6.8,6"
        fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <polygon
        points="12,15 12,9 17.2,6 22.4,9 22.4,15 17.2,18"
        fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <circle cx="6.8" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="17.2" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
