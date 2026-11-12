import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, ChevronRight } from "lucide-react";
import { ToolButton } from "../Sidebar/ToolButton";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { isInsideAnyMenu } from "./menuGuard";

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
export function ClearDrawingButton({ withLabel, variant = "icon", label, onDone }: { withLabel?: boolean; variant?: "icon" | "menu-row"; label?: string; onDone?: () => void }) {
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
    // Use the popover's real height once it's mounted; before that (the
    // very first open), fall back to a generous estimate. Without this, a
    // trigger near the bottom of the viewport — like this button, which
    // the sidebar's `.spacer` pushes to the bottom edge — would open a
    // popover that renders mostly or entirely below the visible window.
    const estimatedHeight = popoverRef.current?.offsetHeight ?? 110;
    const fitsBelow = rect.bottom + 8 + estimatedHeight <= window.innerHeight - 8;
    const top = fitsBelow ? rect.bottom + 8 : Math.max(8, rect.top - estimatedHeight - 8);
    setCoords({ top, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  // Re-run once the popover has actually mounted so the flip-above check
  // above uses its real measured height instead of the estimate.
  useLayoutEffect(() => {
    if (open && coords) reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!coords]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      if (isInsideAnyMenu(target)) return;
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
      {variant === "menu-row" ? (
        <button
          type="button"
          className={`tool-dropdown__row${open ? " tool-dropdown__row--open" : ""}`}
          title={t("tool.clearDrawing")}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="tool-dropdown__row-icon"><Trash2 size={16} /></span>
          <span className="tool-dropdown__row-label">{label ?? t("tool.clearDrawing")}</span>
          <ChevronRight size={14} className="tool-dropdown__row-chevron" aria-hidden="true" />
        </button>
      ) : (
        <ToolButton title={t("tool.clearDrawing")} onClick={() => setOpen((o) => !o)}>
          <Trash2 size={withLabel ? 17 : 18} />
          {withLabel && <span className="btn-label">{t("tool.clearLabel")}</span>}
        </ToolButton>
      )}
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
                onClick={() => { setOpen(false); clear(); onDone?.(); }}
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
