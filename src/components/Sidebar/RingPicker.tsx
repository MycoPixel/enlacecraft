import { RING_TEMPLATES } from "../../model/constants";
import type { RingTemplateLayout } from "../../types/chemistry";
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
  if (tmpl.layout) return <MiniLayout layout={tmpl.layout} />;
  return tmpl.fused ? <MiniNaphthalene /> : <MiniRing sides={tmpl.sides} aromatic={tmpl.aromatic} heteroatoms={tmpl.heteroatoms} />;
}

/**
 * A miniature of a fixed RingTemplate.layout (chair/boat/decalin/
 * norbornane), fitted into the same 24x24 box as MiniRing. Drawing the
 * layout's real bonds rather than a generic polygon is what makes the
 * chair/boat/decalin/norbornane glyphs read as those specific shapes; the
 * wedge/dash strokes on the decalin bridgehead H-bonds are what distinguish
 * cis from trans at a glance.
 */
function MiniLayout({ layout }: { layout: RingTemplateLayout }) {
  const pad = 2;
  const minX = Math.min(...layout.atoms.map((a) => a.x));
  const maxX = Math.max(...layout.atoms.map((a) => a.x));
  const minY = Math.min(...layout.atoms.map((a) => a.y));
  const maxY = Math.max(...layout.atoms.map((a) => a.y));
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const scale = Math.min((24 - pad * 2) / w, (24 - pad * 2) / h);
  const offX = (24 - w * scale) / 2;
  const offY = (24 - h * scale) / 2;
  const toSvg = (p: { x: number; y: number }) => ({
    x: offX + (p.x - minX) * scale,
    y: offY + (maxY - p.y) * scale,
  });
  const byKey = new Map(layout.atoms.map((a) => [a.key, a]));

  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      {layout.bonds.map((bond, i) => {
        const a = byKey.get(bond.from);
        const b = byKey.get(bond.to);
        if (!a || !b) return null;
        const p1 = toSvg(a);
        const p2 = toSvg(b);
        if (bond.stereo === "wedge") {
          const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const perp = ang + Math.PI / 2;
          const half = 1.1;
          const pts = `${p1.x},${p1.y} ${p2.x + Math.cos(perp) * half},${p2.y + Math.sin(perp) * half} ${p2.x - Math.cos(perp) * half},${p2.y - Math.sin(perp) * half}`;
          return <polygon key={i} points={pts} fill="currentColor" />;
        }
        if (bond.stereo === "dash") {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = -dy / len;
          const uy = dx / len;
          return (
            <g key={i}>
              {[0.35, 0.6, 0.85].map((t) => {
                const cx = p1.x + dx * t;
                const cy = p1.y + dy * t;
                const half = 0.3 + t * 0.8;
                return <line key={t} x1={cx - ux * half} y1={cy - uy * half} x2={cx + ux * half} y2={cy + uy * half} stroke="currentColor" strokeWidth="0.9" />;
              })}
            </g>
          );
        }
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />;
      })}
      {layout.atoms.map((atom) => {
        if (atom.element === "C" || atom.element === "H") return null;
        const p = toSvg(atom);
        return (
          <text key={atom.key} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="5" fontWeight={600} stroke="var(--panel)" strokeWidth={1.5} paintOrder="stroke">
            {atom.element}
          </text>
        );
      })}
    </svg>
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
