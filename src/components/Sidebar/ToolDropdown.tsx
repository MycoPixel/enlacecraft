import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ToolButton } from "./ToolButton";
import { isInsideAnyMenu } from "../common/menuGuard";
import { useMediaQuery } from "../../hooks/useMediaQuery";

/**
 * Which dropdown is currently open, shared across all ToolDropdown instances.
 * A dropdown that declares a `menuId` closes when a *different* menuId opens.
 * That keeps a menu-row list (the Analyze menu) from leaving several result
 * panels stacked on screen while the list itself stays open.
 */
let activeMenuId: string | null = null;
const activeMenuListeners = new Set<(id: string | null) => void>();

function setActiveMenuId(id: string | null): void {
  if (activeMenuId === id) return;
  activeMenuId = id;
  for (const listener of activeMenuListeners) listener(id);
}

function subscribeActiveMenu(listener: (id: string | null) => void): () => void {
  activeMenuListeners.add(listener);
  return () => activeMenuListeners.delete(listener);
}

/**
 * Hook form of the same signal for popovers that don't use ToolDropdown
 * (the molecule-info popover is hand-rolled): announce this menu while it is
 * open, and call `onOtherOpens` when a different analysis panel takes over.
 */
export function useMenuActivity(menuId: string | undefined, open: boolean, onOtherOpens: () => void): void {
  const closeRef = useRef(onOtherOpens);
  useEffect(() => {
    closeRef.current = onOtherOpens;
  }, [onOtherOpens]);
  useEffect(() => {
    if (!open || !menuId) return;
    setActiveMenuId(menuId);
  }, [open, menuId]);
  useEffect(() => {
    if (!menuId) return;
    return subscribeActiveMenu((id) => {
      if (id !== menuId) closeRef.current();
    });
  }, [menuId]);
}

export type TriggerVariant = "icon" | "labeled" | "menu-row";

/** The trigger-shape props shared by every analysis component, so the
 * Analyze menu can render them as menu rows instead of toolbar icons. */
export interface ToolDropdownTriggerProps {
  variant?: TriggerVariant;
  label?: string;
  menuId?: string;
}

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
  /** Fired once when the dropdown closes, whether by choosing an item, a
   * click outside, or the trigger itself. Lets a panel drop expensive state
   * (and cached computed rows) while it isn't visible. */
  onClose?: () => void;
  /** "icon" (default) is the square 40px button every toolbar uses.
   * "labeled" adds a visible label and a chevron to that toolbar button,
   * and "menu-row" renders a full-width row for nesting inside another
   * dropdown instead of a standalone button. */
  variant?: TriggerVariant;
  /** Visible text for the "labeled" and "menu-row" variants. Falls back to
   * the tooltip text (title) when omitted. */
  label?: string;
  /** Extra classes for the toolbar button (labeled variant only). */
  triggerClassName?: string;
  /** See setActiveMenuId above: give the analysis panels distinct ids so
   * opening another one closes this one. */
  menuId?: string;
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
export function ToolDropdown({
  title,
  active,
  children,
  renderContent,
  onOpen,
  onClose,
  variant = "icon",
  label,
  triggerClassName,
  menuId,
}: ToolDropdownProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // A row nested in another menu is a result *panel* (analysis output), and
  // those are too wide to squeeze beside a menu on a phone. On a phone they
  // dock to the bottom of the screen instead; the breakpoint matches the
  // app's mobile layout (useIsMobile, and the CSS `max-width: 759px` block).
  const isPhone = useMediaQuery("(max-width: 759px)");
  const asSheet = variant === "menu-row" && isPhone;

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Clamp within the viewport instead of always anchoring off the
    // button's right edge — on a narrow/mobile top bar (this dropdown
    // backs the top bar's structure-search/IUPAC/NMR buttons, which sit
    // well left of center) `rect.right + 8` plus the panel's own width
    // routinely overflows past the right edge with nothing to pull it
    // back. Same reasoning as ClearDrawingButton's popover, which already
    // does this; falls back to a generous width estimate before the panel
    // has mounted once (its content is data-dependent), then re-measures
    // its real width/height on the next layout pass.
    const estimatedWidth = dropdownRef.current?.offsetWidth ?? (variant === "menu-row" ? 300 : 260);
    const estimatedHeight = dropdownRef.current?.offsetHeight ?? 240;
    const left = Math.min(rect.right + 8, window.innerWidth - estimatedWidth - 8);
    const fitsBelowTop = rect.top + estimatedHeight <= window.innerHeight - 8;
    const top = fitsBelowTop ? rect.top : Math.max(8, window.innerHeight - estimatedHeight - 8);
    setCoords({ top, left: Math.max(8, left) });
  };

  useLayoutEffect(() => {
    if (open && !asSheet) reposition();
  }, [open, asSheet]);

  // Re-run once the panel has actually mounted so the clamping above uses
  // its real measured size instead of the estimate (its content is
  // data-dependent — search results, an IUPAC name, an NMR prediction —
  // so the first open can't know the real width/height in advance).
  useLayoutEffect(() => {
    if (open && !asSheet && coords) reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!coords, asSheet]);

  // Announce this menu as the active one; a sibling analysis panel that
  // declares a different id closes itself in response.
  useEffect(() => {
    if (!open || !menuId) return;
    setActiveMenuId(menuId);
  }, [open, menuId]);

  useEffect(() => {
    if (!menuId) return;
    return subscribeActiveMenu((id) => {
      if (id !== menuId) setOpen(false);
    });
  }, [menuId]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      // Keep a parent menu open while its nested panel is being used.
      if (isInsideAnyMenu(target)) return;
      setOpen(false);
      onClose?.();
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
  }, [open, onClose]);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const toggle = () => {
    if (open) {
      close();
    } else {
      setOpen(true);
      onOpen?.();
    }
  };

  return (
    <div ref={btnWrapRef} className={variant === "menu-row" ? "tool-dropdown-trigger" : undefined}>
      {variant === "menu-row" ? (
        <button
          type="button"
          className={`tool-dropdown__row${open ? " tool-dropdown__row--open" : ""}`}
          title={title}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
        >
          <span className="tool-dropdown__row-icon">{children}</span>
          <span className="tool-dropdown__row-label">{label ?? title}</span>
          <ChevronRight size={14} className="tool-dropdown__row-chevron" aria-hidden="true" />
        </button>
      ) : (
        <ToolButton
          title={title}
          active={active}
          onClick={toggle}
          className={variant === "labeled" ? `tool-btn--labeled ${triggerClassName ?? ""}` : triggerClassName}
        >
          {children}
          {variant === "labeled" && <span className="tool-btn__label">{label ?? title}</span>}
          {variant === "labeled" && <ChevronDown size={14} className="tool-btn__chevron" aria-hidden="true" />}
        </ToolButton>
      )}
      {open && (asSheet || coords) &&
        createPortal(
          asSheet ? (
            <>
              <div className="tool-sheet-scrim" aria-hidden="true" onClick={close} />
              <div
                ref={dropdownRef}
                className={`tool-dropdown tool-dropdown--${variant} tool-dropdown--sheet`}
                role="dialog"
                aria-modal="true"
              >
                {renderContent(close)}
              </div>
            </>
          ) : (
            <div className={`tool-dropdown tool-dropdown--${variant}`} ref={dropdownRef} style={{ top: coords!.top, left: coords!.left }}>
              {renderContent(close)}
            </div>
          ),
          document.body
        )}
    </div>
  );
}
