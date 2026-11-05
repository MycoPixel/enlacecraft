import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POPOVER_WIDTH = 220;

/**
 * A small, portaled, non-blocking confirmation popover anchored to a
 * trigger element — the same `window.confirm()` replacement pattern
 * ClearDrawingButton introduced (see that component's doc comment for why
 * a blocking native confirm is worth avoiding here), pulled out into a
 * standalone component so other multi-instance confirmations (e.g. one
 * close button per tab in the tab strip) don't each need to reimplement
 * the positioning/outside-click/Escape handling by hand.
 *
 * Renders nothing while `open` is false. The caller owns `open`'s state
 * and is expected to close it from both `onConfirm` and `onCancel`.
 */
export function ConfirmPopover({
  open,
  anchorRef,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8);
    // Prefer the popover's real measured height once mounted; fall back to
    // an estimate for the very first open. Flips the popover above the
    // anchor when it wouldn't fit below, so triggers near the bottom of the
    // viewport don't open a popover that's invisible off-screen.
    const estimatedHeight = popoverRef.current?.offsetHeight ?? 110;
    const fitsBelow = rect.bottom + 8 + estimatedHeight <= window.innerHeight - 8;
    const top = fitsBelow ? rect.bottom + 8 : Math.max(8, rect.top - estimatedHeight - 8);
    setCoords({ top, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (open) reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-run once mounted so the flip-above check uses the real height.
  useLayoutEffect(() => {
    if (open && coords) reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!coords]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onCancel();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !coords) return null;

  return createPortal(
    <div
      className="confirm-popover"
      ref={popoverRef}
      role="alertdialog"
      aria-label={message}
      style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
    >
      <p>{message}</p>
      <div className="confirm-popover__actions">
        <button type="button" className="confirm-popover__btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="confirm-popover__btn confirm-popover__btn--danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}
