import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Molecule } from "../../types/chemistry";
import { useT } from "../../i18n/useT";
import type { ShiftPrediction, H1ShiftPrediction } from "../../io/nmrPredict";
import { buildAtomLabels } from "../../io/nmrPredict";

interface AtomShifts {
  c13?: number;
  h1?: { shift: number; numHs: number };
}

/**
 * Full-screen, read-only view showing predicted NMR shifts labeled
 * directly on the structure — separate from the canvas (which stays
 * editable and shouldn't get temporary prediction labels baked into
 * it) and separate from NmrPredictionButton's compact dropdown list
 * (too small a space to also show a diagram).
 *
 * Atom identification: `atomOrder[i]` is the atom id that ended up at
 * RDKit atom-index i when the exported SMILES was parsed (see
 * exportSmilesWithAtomOrder in io/smiles.ts) — that's what lets each
 * prediction's atomIndex be resolved back to an actual atom in
 * `fragment` here, rather than shown as a meaningless bare number.
 * Display labels (e.g. "C3") use a fresh 1-based position in that same
 * order, per element, purely for a short, readable, stable label — not
 * IUPAC numbering.
 */
export function NmrReportView({
  open,
  onClose,
  fragment,
  atomOrder,
  predictions,
  predictionsH1,
}: {
  open: boolean;
  onClose: () => void;
  fragment: Molecule;
  atomOrder: string[];
  predictions: ShiftPrediction[];
  predictionsH1: H1ShiftPrediction[];
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Per-element running counter, in atomOrder's traversal order, so
  // labels read like "C1, C2, C3..." / "O1, O2..." - shared with
  // NmrPredictionButton's compact list so the same atom shows the
  // same label in both places.
  const labelOf = useMemo(() => buildAtomLabels(fragment, atomOrder), [atomOrder, fragment]);

  const shiftsByAtom = useMemo(() => {
    const map = new Map<string, AtomShifts>();
    for (const p of predictions) {
      const atomId = atomOrder[p.atomIndex];
      if (!atomId) continue;
      const entry = map.get(atomId) ?? {};
      entry.c13 = p.predictedShiftPpm;
      map.set(atomId, entry);
    }
    for (const p of predictionsH1) {
      const atomId = atomOrder[p.atomIndex];
      if (!atomId) continue;
      const entry = map.get(atomId) ?? {};
      entry.h1 = { shift: p.predictedShiftPpm, numHs: p.numHs };
      map.set(atomId, entry);
    }
    return map;
  }, [predictions, predictionsH1, atomOrder]);

  const atoms = Object.values(fragment.atoms);
  const bonds = Object.values(fragment.bonds);

  const viewBox = useMemo(() => {
    if (atoms.length === 0) return "0 0 100 100";
    const xs = atoms.map((a) => a.x);
    const ys = atoms.map((a) => a.y);
    const pad = 55;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    return `${minX} ${minY} ${w} ${h}`;
  }, [atoms]);

  if (!open) return null;

  const rows = [...labelOf.entries()]
    .map(([atomId, label]) => ({ atomId, label, shifts: shiftsByAtom.get(atomId) }))
    .filter((r) => r.shifts?.c13 !== undefined || r.shifts?.h1 !== undefined);

  return createPortal(
    <div className="nmr-report-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="nmr-report-dialog" role="dialog" aria-modal="true" aria-label={t("nmr.reportTitle")}>
        <div className="nmr-report-dialog__header">
          <h2>{t("nmr.reportTitle")}</h2>
          <button type="button" className="nmr-report-dialog__close" onClick={onClose} aria-label={t("nmr.reportClose")}>
            <X size={18} />
          </button>
        </div>

        <p className="nmr-report-dialog__hint">{t("nmr.reportHint")}</p>

        <div className="nmr-report-dialog__body">
          <svg className="nmr-report-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
            {bonds.map((bond) => {
              const a1 = fragment.atoms[bond.a1];
              const a2 = fragment.atoms[bond.a2];
              if (!a1 || !a2) return null;
              const dx = a2.x - a1.x;
              const dy = a2.y - a1.y;
              const len = Math.hypot(dx, dy) || 1;
              // Perpendicular unit vector, for offsetting the extra
              // parallel line(s) of a double/triple bond.
              const ox = (-dy / len) * 4;
              const oy = (dx / len) * 4;
              const lines = bond.order === 1 ? [0] : bond.order === 2 ? [-1, 1] : [-1.6, 0, 1.6];
              return lines.map((k, i) => (
                <line
                  key={`${bond.id}-${i}`}
                  x1={a1.x + ox * k}
                  y1={a1.y + oy * k}
                  x2={a2.x + ox * k}
                  y2={a2.y + oy * k}
                  className="nmr-report-svg__bond"
                />
              ));
            })}

            {atoms.map((atom) => {
              const label = labelOf.get(atom.id);
              const shifts = shiftsByAtom.get(atom.id);
              if (!label) return null;
              return (
                <g key={atom.id}>
                  <circle cx={atom.x} cy={atom.y} r={10} className="nmr-report-svg__atom" />
                  <text x={atom.x} y={atom.y} className="nmr-report-svg__atom-label">
                    {label}
                  </text>
                  {shifts?.c13 !== undefined && (
                    <text x={atom.x + 14} y={atom.y - 12} className="nmr-report-svg__badge nmr-report-svg__badge--c">
                      {shifts.c13.toFixed(1)}
                    </text>
                  )}
                  {shifts?.h1 !== undefined && (
                    <text x={atom.x + 14} y={atom.y + 22} className="nmr-report-svg__badge nmr-report-svg__badge--h">
                      {shifts.h1.shift.toFixed(2)} ({shifts.h1.numHs}H)
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <table className="nmr-report-table">
            <thead>
              <tr>
                <th>{t("nmr.reportColAtom")}</th>
                <th>{t("nmr.section13c")}</th>
                <th>{t("nmr.section1h")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.atomId}>
                  <td>{r.label}</td>
                  <td>{r.shifts?.c13 !== undefined ? `${r.shifts.c13.toFixed(2)} ppm` : "\u2014"}</td>
                  <td>{r.shifts?.h1 !== undefined ? `${r.shifts.h1.shift.toFixed(2)} ppm (${r.shifts.h1.numHs}H)` : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="nmr-report-dialog__caveat">{t("nmr.caveat")}</p>
      </div>
    </div>,
    document.body
  );
}
