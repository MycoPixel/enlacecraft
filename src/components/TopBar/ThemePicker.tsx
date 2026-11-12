import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { THEMES, type ThemeInfo } from "../../styles/themes";
import type { Theme } from "../../types/chemistry";
import { useT } from "../../i18n/useT";
import { isInsideAnyMenu } from "../common/menuGuard";

/**
 * The three-dot palette preview: canvas tone, panel tone, accent phosphor.
 * Same three colors the theme's own CSS variables hold, in the same order,
 * so a glance at the chip tells you what the workspace is going to look like
 * before you commit to it. Shared by the trigger button (where it doubles as
 * the "which theme am I in?" indicator) and the picker rows.
 */
function ThemeSwatch({ theme, size = 18 }: { theme: ThemeInfo; size?: number }) {
  // The dot stays small relative to the chip: a larger one swallows the
  // panel band and the whole preview collapses into a colored blob, which
  // is the one thing a swatch must not do — the point is showing three
  // distinct colors at once.
  const dot = Math.max(2, Math.round(size * 0.17));
  const band = Math.round(size * 0.3);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={Math.round(size * 0.22)} fill={theme.canvas} stroke="var(--panel-border)" strokeWidth="1" />
      <path d={`M 0.5,${size - band - 0.5} h ${size - 1} v ${band - 0.5} h ${-(size - 1)} z`} fill={theme.panel} />
      <line x1="0.5" y1={size - band - 0.5} x2={size - 0.5} y2={size - band - 0.5} stroke="var(--panel-border)" strokeWidth="1" />
      <circle cx={size / 2} cy={(size - band) / 2} r={dot} fill={theme.accent} />
    </svg>
  );
}

/**
 * Theme selector for the top bar.
 *
 * A popover of swatch cards rather than the light/dark cycle button it
 * replaced: with five themes, cycling is up to four clicks to reach a given
 * one and says nothing about what's coming; a card per theme is one click
 * and shows the actual palette.
 *
 * Same portal + fixed-position reasoning as ViewOptionsMenu/ExportMenu: the
 * top bar's toolstrip can scroll and clip, so the popover is portaled to
 * document.body and positioned from the trigger's own bounding rect.
 */
export function ThemePicker({ variant = "icon", label, onDone }: { variant?: "icon" | "menu-row"; label?: string; onDone?: () => void } = {}) {
  const theme = useMoleculeStore((s) => s.theme);
  const setTheme = useMoleculeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = useT();

  const current = THEMES.find((x) => x.id === theme) ?? THEMES[0];

  const reposition = () => {
    const btn = btnWrapRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };

  // Opens with the current theme focused, so Enter re-picks what's already
  // active (a no-op that just closes) rather than jumping to the top of the
  // list. Focus moves into the menu in the layout effect below, so the
  // arrow keys below actually receive their keydowns.
  const toggleOpen = () => {
    setActiveIndex(Math.max(0, THEMES.findIndex((x) => x.id === theme)));
    setOpen((o) => !o);
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    dropdownRef.current?.querySelector<HTMLElement>(`[data-theme-index="${activeIndex}"]`)?.focus();
    // Positioning and initial focus only depend on the popover having just
    // opened; the theme/activeIndex values it reads are set immediately
    // before it (toggleOpen), never changed while it stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (isInsideAnyMenu(target)) return;
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

  // Roving focus: the arrow keys move the highlight between cards, Enter
  // applies it, Escape closes and hands focus back to the trigger so the
  // keyboard never ends up stranded with nothing focused.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const delta = e.key === "ArrowDown" ? 1 : -1;
    const next = (activeIndex + delta + THEMES.length) % THEMES.length;
    setActiveIndex(next);
    dropdownRef.current?.querySelector<HTMLElement>(`[data-theme-index="${next}"]`)?.focus();
  };

  const choose = (id: Theme) => {
    setTheme(id);
    setOpen(false);
    triggerRef.current?.focus();
    onDone?.();
  };

  return (
    <div className="theme-picker" ref={btnWrapRef}>
      {variant === "menu-row" ? (
        <button
          ref={triggerRef}
          type="button"
          className={`tool-dropdown__row${open ? " tool-dropdown__row--open" : ""}`}
          title={`${t("tool.theme")} — ${t(current.labelKey)}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggleOpen}
        >
          <span className="tool-dropdown__row-icon"><ThemeSwatch theme={current} size={17} /></span>
          <span className="tool-dropdown__row-label">{label ?? t("tool.theme")}</span>
          <ChevronRight size={14} className="tool-dropdown__row-chevron" aria-hidden="true" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="tool-btn theme-picker__trigger"
          title={`${t("tool.theme")} — ${t(current.labelKey)}`}
          aria-label={t("tool.theme")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggleOpen}
        >
          <ThemeSwatch theme={current} size={20} />
        </button>
      )}
      {open && coords &&
        createPortal(
          <div
            className="theme-picker__menu"
            ref={dropdownRef}
            role="menu"
            aria-label={t("tool.theme")}
            style={{ top: coords.top, right: coords.right }}
            onKeyDown={onKeyDown}
          >
            {THEMES.map((info, i) => {
              const active = info.id === theme;
              return (
                <button
                  key={info.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  data-theme-index={i}
                  className={`theme-picker__row${active ? " theme-picker__row--active" : ""}${i === activeIndex ? " theme-picker__row--focus" : ""}`}
                  tabIndex={i === activeIndex ? 0 : -1}
                  onClick={() => choose(info.id)}
                  onFocus={() => setActiveIndex(i)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <ThemeSwatch theme={info} size={26} />
                  <span className="theme-picker__text">
                    <span className="theme-picker__name">{t(info.labelKey)}</span>
                    <span className="theme-picker__desc">{t(info.descriptionKey)}</span>
                  </span>
                  {active && <Check size={15} className="theme-picker__check" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
