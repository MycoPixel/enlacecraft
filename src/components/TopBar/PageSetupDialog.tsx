import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import {
  DEFAULT_PAGE_MARGIN,
  PAPER_PRESETS,
  findPaperPreset,
  matchingPaperPreset,
  pageOrientation,
  pageSetupFromPreset,
  type PageOrientation,
} from "../../model/pageSetup";
import type { PageSetup } from "../../types/chemistry";

interface PageSetupDialogProps {
  onClose: () => void;
}

const MM_PER_PT = 25.4 / 72;
const PT_PER_MM = 72 / 25.4;

/** Formats a point value as millimetres with at most one decimal place. */
function ptToMm(pt: number): string {
  const mm = pt * MM_PER_PT;
  return String(Math.round(mm * 10) / 10);
}

function mmToPt(mm: string): number {
  const value = Number(mm);
  return Number.isFinite(value) && value >= 0 ? value * PT_PER_MM : NaN;
}

/**
 * Paper, orientation and bond-length setup for the active tab.
 *
 * The dialog edits a local draft and only writes to the store on Apply, so
 * cancelling leaves the printed page untouched. That also means the number
 * inputs can hold half-typed values ("1", "") without corrupting the page.
 *
 * The page itself is not part of the drawing's undo history (see
 * `setPageSetup`): paper choice is a document property like the file name,
 * not an edit to the molecule.
 */
export function PageSetupDialog({ onClose }: PageSetupDialogProps) {
  const t = useT();
  const page = useMoleculeStore((s) => s.page);
  const setPageSetup = useMoleculeStore((s) => s.setPageSetup);
  const setStatus = useMoleculeStore((s) => s.setStatus);

  // The whole draft lives in one object except for the three text fields,
  // which need to tolerate transient non-numeric input.
  const initialPreset = matchingPaperPreset(page);
  const [draft, setDraft] = useState<PageSetup>(page);
  const [presetId, setPresetId] = useState(initialPreset?.id ?? "custom");
  const [marginMm, setMarginMm] = useState(() => ptToMm(page.margin ?? DEFAULT_PAGE_MARGIN));
  const [bondLength, setBondLength] = useState(String(page.bondLength));
  const [marginWidth, setMarginWidth] = useState(String(page.marginWidth));

  const orientation = pageOrientation(draft);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const adoptPage = (next: PageSetup) => {
    setDraft(next);
    setMarginMm(ptToMm(next.margin ?? DEFAULT_PAGE_MARGIN));
    setBondLength(String(next.bondLength));
    setMarginWidth(String(next.marginWidth));
  };

  const onPresetChange = (id: string) => {
    setPresetId(id);
    if (id === "custom") return;
    adoptPage(pageSetupFromPreset(findPaperPreset(id), orientation));
  };

  const onOrientationChange = (next: PageOrientation) => {
    if (next === orientation) return;
    if (presetId !== "custom") {
      adoptPage(pageSetupFromPreset(findPaperPreset(presetId), next));
      return;
    }
    setDraft((current) => ({ ...current, width: current.height, height: current.width }));
  };

  const canApply =
    Number.isFinite(mmToPt(marginMm)) &&
    Number.isFinite(Number(bondLength)) &&
    Number(bondLength) >= 1 &&
    Number.isFinite(Number(marginWidth)) &&
    Number(marginWidth) >= 0;

  const apply = () => {
    if (!canApply) return;
    const margin = mmToPt(marginMm);
    setPageSetup({
      ...draft,
      margin: Number.isFinite(margin) ? margin : DEFAULT_PAGE_MARGIN,
      bondLength: Math.max(1, Number(bondLength)),
      marginWidth: Math.max(0, Number(marginWidth)),
    });
    setStatus(t("status.pageSetupApplied"));
    onClose();
  };

  const widthMm = Math.round(draft.width * MM_PER_PT);
  const heightMm = Math.round(draft.height * MM_PER_PT);

  return createPortal(
    <div className="paste-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="paste-dialog page-setup-dialog" role="dialog" aria-modal="true" aria-label={t("pageSetup.title")}>
        <div className="paste-dialog__header">
          <h2>{t("pageSetup.title")}</h2>
          <button type="button" className="paste-dialog__close" onClick={onClose} aria-label={t("shortcuts.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="paste-dialog__body page-setup-dialog__body">
          <label className="page-setup-field">
            <span>{t("pageSetup.paper")}</span>
            <select value={presetId} onChange={(e) => onPresetChange(e.target.value)}>
              {PAPER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{t(preset.labelKey)}</option>
              ))}
              <option value="custom">{t("pageSetup.custom")}</option>
            </select>
          </label>

          <fieldset className="page-setup-field page-setup-field--inline">
            <legend>{t("pageSetup.orientation")}</legend>
            {(["portrait", "landscape"] as const).map((value) => (
              <label key={value} className="page-setup-radio">
                <input
                  type="radio"
                  name="page-orientation"
                  value={value}
                  checked={orientation === value}
                  onChange={() => onOrientationChange(value)}
                />
                <span>{t(value === "portrait" ? "pageSetup.portrait" : "pageSetup.landscape")}</span>
              </label>
            ))}
          </fieldset>

          <label className="page-setup-field">
            <span>{t("pageSetup.margin")}</span>
            <input
              type="number"
              min={0}
              step={1}
              value={marginMm}
              onChange={(e) => setMarginMm(e.target.value)}
            />
          </label>

          <label className="page-setup-field">
            <span>{t("pageSetup.bondLength")}</span>
            <input
              type="number"
              min={1}
              step={1}
              value={bondLength}
              onChange={(e) => setBondLength(e.target.value)}
            />
          </label>

          <label className="page-setup-field">
            <span>{t("pageSetup.marginWidth")}</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={marginWidth}
              onChange={(e) => setMarginWidth(e.target.value)}
            />
          </label>

          <div className="page-setup-dialog__summary">
            {t("pageSetup.size", { width: widthMm, height: heightMm })}
          </div>
          <div className="page-setup-dialog__hint">{t("pageSetup.hint")}</div>
        </div>
        <div className="paste-dialog__footer">
          <button type="button" className="paste-dialog__cancel" onClick={onClose}>
            {t("pageSetup.cancel")}
          </button>
          <button type="button" className="paste-dialog__add" disabled={!canApply} onClick={apply}>
            {t("pageSetup.apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
