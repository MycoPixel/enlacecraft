import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ToolButton } from "./ToolButton";

interface ToolDropdownProps {
  title: string;
  active: boolean;
  children: ReactNode;
  /** Rendered inside the dropdown; receives a `close` callback to call once a choice is made. */
  renderContent: (close: () => void) => ReactNode;
  /** Fired once when the dropdown transitions from closed to open — for a
   * dropdown whose content depends on doing something (like a network
   * request) at the moment it's opened, rather than always being ready to
   * render immediately from static/already-loaded data. */
  onOpen?: () => void;
}

/**
 * A tool button that, instead of activating a tool directly, opens a
 * dropdown of choices (styles, variants, etc.) — the same "click to reveal
 * options" pattern as the top bar's Export button. Portaled to
 * `document.body` and positioned with `position: fixed` from the button's
 * own bounding rect, since the sidebar scrolls vertically
 * (`overflow-y: auto`) and an absolutely-positioned dropdown would get
 * clipped by that same scroll container.
 */
export function ToolDropdown({ title, active, children, renderContent, onOpen }: ToolDropdownProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.top, left: rect.right + 8 });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
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

  return (
    <div ref={btnWrapRef}>
      <ToolButton
        title={title}
        active={active}
        onClick={() => setOpen((o) => {
          if (!o) onOpen?.();
          return !o;
        })}
      >
        {children}
      </ToolButton>
      {open && coords &&
        createPortal(
          <div className="tool-dropdown" ref={dropdownRef} style={{ top: coords.top, left: coords.left }}>
            {renderContent(() => setOpen(false))}
          </div>,
          document.body
        )}
    </div>
  );
}
