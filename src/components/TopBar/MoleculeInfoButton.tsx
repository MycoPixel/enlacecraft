import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, Copy, Check, AlertTriangle } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useFormulaDisplay } from "../../hooks/useFormulaDisplay";
import { hasPlaceholderLabels } from "../../model/valence";
import { Formula } from "../common/Formula";
import { exportSmiles } from "../../io/smiles";
import { ToolButton } from "../Sidebar/ToolButton";
import { useT } from "../../i18n/useT";

/**
 * Formula/MW/SMILES used to sit permanently in the top bar, which meant a
 * number was always on screen whether or not anyone cared about it right
 * now. This puts the same data behind a button instead — same portal +
 * fixed-position pattern as ExportMenu, so it can't be clipped by the top
 * bar's horizontally-scrolling toolstrip.
 *
 * SMILES is always for the *whole* canvas (exportSmiles doesn't take a
 * subset), even when a selection narrows the formula/MW above it — same
 * scope as the existing "Copy SMILES" export action.
 */
export function MoleculeInfoButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const molecule = useMoleculeStore((s) => s.molecule);
  const selected = useMoleculeStore((s) => s.selected);
  const { fragments } = useFormulaDisplay();
  const hasAnyAtoms = Object.keys(molecule.atoms).length > 0;
  const hasPlaceholder = hasPlaceholderLabels(molecule);

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReposition = () => reposition();
    document.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const smiles = hasAnyAtoms ? exportSmiles(molecule) : "";

  const doCopySmiles = async () => {
    if (!smiles) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard API");
      await navigator.clipboard.writeText(smiles);
      setCopied(true);
    } catch {
      // Ignore — the SMILES is still shown/selectable in the popover.
    }
  };

  return (
    <div className="molecule-info" ref={btnWrapRef}>
      <ToolButton title={t("tool.moleculeInfo")} active={open} onClick={() => setOpen((o) => !o)}>
        <Info size={18} />
        {hasPlaceholder && <AlertTriangle size={10} className="molecule-info__badge" />}
      </ToolButton>
      {open && coords &&
        createPortal(
          <div className="molecule-info-dropdown" ref={dropdownRef} style={{ top: coords.top, right: coords.right }}>
            <div className="molecule-info__label">
              {selected.size > 0 ? t("moleculeInfo.selection") : t("moleculeInfo.molecule")}
            </div>
            {fragments.length === 0 ? (
              <div className="molecule-info__empty">{t("moleculeInfo.empty")}</div>
            ) : (
              <div className="molecule-info__fragments">
                {fragments.map((f, i) => (
                  <div className="molecule-info__row" key={i}>
                    <span className="molecule-info__formula">
                      <Formula formula={f.formula} />
                    </span>
                    {f.mw > 0 && <span className="molecule-info__mw">{f.mw.toFixed(2)} g/mol</span>}
                  </div>
                ))}
              </div>
            )}
            {hasPlaceholder && (
              <div className="molecule-info__warning">
                <AlertTriangle size={13} />
                <span>{t("moleculeInfo.placeholderWarning")}</span>
              </div>
            )}
            <div className="molecule-info__divider" />
            <div className="molecule-info__label">{t("moleculeInfo.smiles")}</div>
            <div className="molecule-info__smiles-row">
              <code className="molecule-info__smiles">{smiles || "\u2014"}</code>
              {smiles && (
                <button className="molecule-info__copy" onClick={doCopySmiles} title={t("tool.exportSmiles")}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
