import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { ToolButton } from "../Sidebar/ToolButton";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";

const POPOVER_WIDTH = 220;

/**
 * The "clear drawing" button, with its own in-app confirmation popover
 * instead of the browser's native `window.confirm()`.
 *
 * `window.confirm` blocks the whole page while it's open, and — especially
 * in the Electron/Capacitor-packaged builds — can leave the renderer's
 * focus in a broken state once it closes: clicks still land, but the
 * keyboard no longer reaches whatever's focused (e.g. the compound search
 * box) until the app is fully restarted. A portaled, non-blocking popover
 * (the same pattern ToolDropdown already uses for the sidebar's ring/arrow
 * pickers) sidesteps that whole class of bug.
 */
export function ClearDrawingButton({ withLabel }: { withLabel?: boolean }) {
  const t = useT();
  const clear = useMoleculeStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8);
    setCoords({ top: rect.bottom + 8, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onReposition = () => reposition();
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div ref={btnWrapRef}>
      <ToolButton title={t("tool.clearDrawing")} onClick={() => setOpen((o) => !o)}>
        <Trash2 size={withLabel ? 17 : 18} />
        {withLabel && <span className="btn-label">{t("tool.clearLabel")}</span>}
      </ToolButton>
      {open && coords &&
        createPortal(
          <div
            className="confirm-popover"
            ref={popoverRef}
            role="alertdialog"
            aria-label={t("confirm.clearDrawing")}
            style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
          >
            <p>{t("confirm.clearDrawing")}</p>
            <div className="confirm-popover__actions">
              <button type="button" className="confirm-popover__btn" onClick={() => setOpen(false)}>
                {t("confirm.cancel")}
              </button>
              <button
                type="button"
                className="confirm-popover__btn confirm-popover__btn--danger"
                onClick={() => { setOpen(false); clear(); }}
              >
                {t("confirm.confirmClear")}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
