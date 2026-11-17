import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardCopy, Plus, Trash2, X } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { writeClipboardText } from "../../io/clipboard";
import {
  computeReagentTable,
  formatReagentNumber,
  newReagentRow,
  reagentRowsFromAtoms,
  reagentTableToCsv,
} from "../../model/reagentTable";
import type { ReagentRole, ReagentRow, ReagentTable } from "../../types/chemistry";

interface ReagentTableDialogProps {
  onClose: () => void;
}

const ROLES: ReagentRole[] = ["reactant", "reagent", "catalyst", "solvent", "product"];

/** A number input that tolerates a half-typed value: empty means "not
 * given", anything non-finite is ignored rather than written as NaN. */
function NumberCell({
  value,
  onChange,
  step = "any",
  title,
  ariaLabel,
  placeholder,
  overridden = false,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: string;
  title?: string;
  ariaLabel: string;
  placeholder?: string;
  overridden?: boolean;
}) {
  return (
    <input
      type="number"
      className={`reagent-table__num${overridden ? " reagent-table__num--override" : ""}`}
      min={0}
      step={step}
      title={title}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") return onChange(undefined);
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }}
    />
  );
}

/**
 * The sheet's reagent table: roles, equivalents, masses, volumes and yield.
 *
 * Edits live in a local draft and are written to the store on Apply, so a
 * column of typed numbers is one undo step rather than one per keystroke
 * (the same reason PageSetupDialog works this way). Calculated columns come
 * from `model/reagentTable.ts` — the dialog never recomputes them itself,
 * so the on-screen numbers and the CSV cannot disagree.
 */
export function ReagentTableDialog({ onClose }: ReagentTableDialogProps) {
  const t = useT();
  const stored = useMoleculeStore((s) => s.molecule.reagentTable);
  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const setReagentTable = useMoleculeStore((s) => s.setReagentTable);
  const setStatus = useMoleculeStore((s) => s.setStatus);

  const [draft, setDraft] = useState<ReagentTable>(() => stored ?? { rows: [] });
  const [scaleText, setScaleText] = useState(() => (stored?.scaleMmol ? String(stored.scaleMmol) : ""));

  const scaleMmol = useMemo(() => {
    const n = Number(scaleText);
    return scaleText.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
  }, [scaleText]);

  const computed = useMemo(
    () => computeReagentTable({ rows: draft.rows, scaleMmol }),
    [draft.rows, scaleMmol]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const patchRow = (id: string, patch: Partial<Omit<ReagentRow, "id">>) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  };

  const removeRow = (id: string) => {
    setDraft((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== id) }));
  };

  const addBlank = () => {
    setDraft((current) => ({ ...current, rows: [...current.rows, newReagentRow()] }));
  };

  const addSelection = () => {
    const rows = reagentRowsFromAtoms(molecule, selected);
    if (rows.length === 0) {
      setStatus(t("reagent.noSelection"));
      return;
    }
    setDraft((current) => ({ ...current, rows: [...current.rows, ...rows] }));
  };

  const markLimiting = (id: string) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => ({ ...row, limiting: row.id === id ? true : undefined })),
    }));
  };

  const copyCsv = async () => {
    try {
      await writeClipboardText(reagentTableToCsv({ rows: draft.rows, scaleMmol }));
      setStatus(t("reagent.copied"));
    } catch {
      setStatus(t("reagent.copyFailed"));
    }
  };

  const apply = () => {
    setReagentTable(draft.rows.length > 0 ? { rows: draft.rows, ...(scaleMmol ? { scaleMmol } : {}) } : undefined);
    setStatus(t("reagent.applied", { n: draft.rows.length }));
    onClose();
  };

  const computedById = new Map(computed.rows.map((row) => [row.row.id, row]));

  return createPortal(
    <div className="paste-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="paste-dialog reagent-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("reagent.title")}
      >
        <div className="paste-dialog__header">
          <h2>{t("reagent.title")}</h2>
          <button type="button" className="paste-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
            <X size={18} />
          </button>
        </div>

        <div className="paste-dialog__body reagent-dialog__body">
          <div className="reagent-dialog__bar">
            <label className="reagent-dialog__scale">
              <span>{t("reagent.scale")}</span>
              <input
                type="number"
                min={0}
                step="any"
                value={scaleText}
                placeholder={formatReagentNumber(computed.scaleMmol)}
                onChange={(e) => setScaleText(e.target.value)}
              />
              <span className="reagent-dialog__unit">mmol</span>
            </label>
            <span className="reagent-dialog__effective">
              {t("reagent.effectiveScale", { mmol: formatReagentNumber(computed.scaleMmol) })}
            </span>
            <div className="reagent-dialog__buttons">
              <button type="button" className="reagent-btn" onClick={addBlank}>
                <Plus size={14} /> {t("reagent.addRow")}
              </button>
              <button
                type="button"
                className="reagent-btn"
                onClick={addSelection}
                disabled={selected.size === 0}
                title={t("reagent.addSelectionHint")}
              >
                <Plus size={14} /> {t("reagent.addSelection")}
              </button>
            </div>
          </div>

          {draft.rows.length === 0 ? (
            <div className="reagent-dialog__empty">
              <p>{t("reagent.empty")}</p>
              <p className="reagent-dialog__hint">{t("reagent.emptyHint")}</p>
            </div>
          ) : (
            <div className="reagent-table-wrap">
              <table className="reagent-table">
                <thead>
                  <tr>
                    <th>{t("reagent.col.name")}</th>
                    <th>{t("reagent.col.role")}</th>
                    <th>{t("reagent.col.formula")}</th>
                    <th>{t("reagent.col.mw")}</th>
                    <th>{t("reagent.col.eq")}</th>
                    <th>{t("reagent.col.mmol")}</th>
                    <th>{t("reagent.col.mass")}</th>
                    <th>{t("reagent.col.volume")}</th>
                    <th>{t("reagent.col.density")}</th>
                    <th>{t("reagent.col.concentration")}</th>
                    <th>{t("reagent.col.yield")}</th>
                    <th>{t("reagent.col.limiting")}</th>
                    <th aria-label={t("reagent.col.remove")} />
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((row) => {
                    const c = computedById.get(row.id);
                    const mmolOverridden =
                      row.role !== "product" && row.id !== computed.limitingId && row.mmol !== undefined;
                    return (
                      <tr key={row.id}>
                        <td>
                          <input
                            className="reagent-table__text"
                            value={row.name}
                            placeholder={row.formula ?? ""}
                            aria-label={t("reagent.col.name")}
                            onChange={(e) => patchRow(row.id, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            className="reagent-table__role"
                            value={row.role}
                            aria-label={t("reagent.col.role")}
                            onChange={(e) => patchRow(row.id, { role: e.target.value as ReagentRole })}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {t(`reagent.role.${role}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="reagent-table__text reagent-table__text--tight"
                            value={row.formula ?? ""}
                            aria-label={t("reagent.col.formula")}
                            onChange={(e) => patchRow(row.id, { formula: e.target.value || undefined })}
                          />
                        </td>
                        <td>
                          <NumberCell
                            value={row.mw}
                            ariaLabel={t("reagent.col.mw")}
                            onChange={(v) => patchRow(row.id, { mw: v })}
                          />
                        </td>
                        <td>
                          <NumberCell
                            value={row.equivalents}
                            ariaLabel={t("reagent.col.eq")}
                            onChange={(v) => patchRow(row.id, { equivalents: v })}
                          />
                        </td>
                        <td>
                          <NumberCell
                            value={row.mmol}
                            ariaLabel={t("reagent.col.mmol")}
                            title={t("reagent.mmolHint")}
                            placeholder={formatReagentNumber(c?.mmol)}
                            overridden={mmolOverridden}
                            onChange={(v) => patchRow(row.id, { mmol: v })}
                          />
                        </td>
                        <td className="reagent-table__derived">
                          {formatReagentNumber(c?.massMg)}
                          {row.role === "product" && c?.isolatedMassMg !== null && (
                            <span className="reagent-table__secondary" title={t("reagent.isolatedHint")}>
                              → {formatReagentNumber(c?.isolatedMassMg)}
                            </span>
                          )}
                        </td>
                        <td className="reagent-table__derived">{formatReagentNumber(c?.volumeMl)}</td>
                        <td>
                          <NumberCell
                            value={row.density}
                            step="0.001"
                            ariaLabel={t("reagent.col.density")}
                            onChange={(v) => patchRow(row.id, { density: v })}
                          />
                        </td>
                        <td>
                          <NumberCell
                            value={row.concentration}
                            step="0.001"
                            ariaLabel={t("reagent.col.concentration")}
                            onChange={(v) => patchRow(row.id, { concentration: v })}
                          />
                        </td>
                        <td>
                          {row.role === "product" ? (
                            <NumberCell
                              value={row.yieldPercent}
                              step="1"
                              ariaLabel={t("reagent.col.yield")}
                              onChange={(v) => patchRow(row.id, { yieldPercent: v })}
                            />
                          ) : (
                            <span className="reagent-table__muted">—</span>
                          )}
                        </td>
                        <td className="reagent-table__limiting">
                          <input
                            type="radio"
                            name="reagent-limiting"
                            checked={row.id === computed.limitingId}
                            aria-label={t("reagent.col.limiting")}
                            onChange={() => markLimiting(row.id)}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="reagent-table__remove"
                            onClick={() => removeRow(row.id)}
                            aria-label={t("reagent.col.remove")}
                            title={t("reagent.col.remove")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="reagent-dialog__summary">
            <span>{t("reagent.rows", { n: draft.rows.length })}</span>
            <span>
              {t("reagent.totalMass", { mg: formatReagentNumber(computed.totalReactantMassMg) })}
            </span>
            {computed.limitingId && (
              <span>
                {t("reagent.limitedBy", {
                  name:
                    draft.rows.find((row) => row.id === computed.limitingId)?.name ||
                    draft.rows.find((row) => row.id === computed.limitingId)?.formula ||
                    t("reagent.unnamed"),
                })}
              </span>
            )}
          </div>
          <p className="reagent-dialog__hint">{t("reagent.hint")}</p>
        </div>

        <div className="paste-dialog__footer reagent-dialog__footer">
          <button type="button" className="paste-dialog__cancel" onClick={copyCsv} disabled={draft.rows.length === 0}>
            <ClipboardCopy size={14} /> {t("reagent.copyCsv")}
          </button>
          <button
            type="button"
            className="paste-dialog__cancel"
            onClick={() => setDraft({ rows: [] })}
            disabled={draft.rows.length === 0}
          >
            {t("reagent.clear")}
          </button>
          <span className="reagent-dialog__spacer" />
          <button type="button" className="paste-dialog__cancel" onClick={onClose}>
            {t("reagent.close")}
          </button>
          <button type="button" className="paste-dialog__add" onClick={apply}>
            {t("reagent.apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
