import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, Atom, Contrast, Grid3x3, Grid2x2, Square, Check, Ruler, Crosshair, SquareDashed, ChevronRight } from "lucide-react";
import { ToolButton } from "../Sidebar/ToolButton";
import { ExpandedFormulaIcon } from "./ExpandedFormulaIcon";
import { isInsideAnyMenu } from "../common/menuGuard";
import { useT } from "../../i18n/useT";

interface ViewOptionsMenuProps {
  showHydrogens: boolean;
  onToggleHydrogens: () => void;
  /** Whether the current molecule already has real, explicit terminal
   * hydrogen atoms (see model/molecule.ts's hasExplicitHydrogens) --
   * read straight from the molecule's own content, not a separately
   * tracked view preference, since toggling this now performs a real,
   * undoable structural edit rather than a display-only setting. */
  hasExplicitHydrogens: boolean;
  onToggleExplicitHydrogens: () => void;
  monochromeAtoms: boolean;
  onToggleMonochromeAtoms: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showRulers: boolean;
  onToggleRulers: () => void;
  showCrosshair: boolean;
  onToggleCrosshair: () => void;
  showPageOutline: boolean;
  onTogglePageOutline: () => void;
  rulerUnit: "mm" | "in" | "bond";
  onSetRulerUnit: (unit: "mm" | "in" | "bond") => void;
  canvasBackground: "white" | "theme";
  onToggleCanvasBackground: () => void;
  variant?: "icon" | "menu-row";
  label?: string;
  /** Called after a setting is toggled when this menu is nested in another
   * menu (the mobile overflow), so the parent closes with it. Standalone
   * use keeps the menu open for multiple toggles. */
  onDone?: () => void;
}

/**
 * Groups the display toggles that used to be five separate icons in the top
 * bar's `.top-actions` strip (hydrogens, expanded formula, monochrome, canvas
 * background, grid) into one dropdown. These are all "set once and forget"
 * view settings rather than per-action tools like undo/export, so they don't
 * need to be one click away permanently — and folding them into a single
 * button meaningfully de-clutters the bar. The menu deliberately stays open
 * after a row is clicked (unlike ExportMenu, where each item ends the
 * interaction) since toggling one setting here often means the user wants to
 * toggle another right after.
 *
 * Same portal + fixed-position reasoning as ExportMenu: the top bar's
 * toolstrip can scroll/clip, so the dropdown is portaled to document.body and
 * positioned from the trigger button's own bounding rect.
 */
export function ViewOptionsMenu({
  showHydrogens, onToggleHydrogens,
  hasExplicitHydrogens, onToggleExplicitHydrogens,
  monochromeAtoms, onToggleMonochromeAtoms,
  showGrid, onToggleGrid,
  showRulers, onToggleRulers,
  showCrosshair, onToggleCrosshair,
  showPageOutline, onTogglePageOutline,
  rulerUnit, onSetRulerUnit,
  canvasBackground, onToggleCanvasBackground,
  variant = "icon", label,
  onDone,
}: ViewOptionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useT();

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

  // Any one of these being "on" (in the sense of differing from the
  // all-off default) lights up the trigger button itself, so the group as a
  // whole still gives an at-a-glance signal the way the standalone icons
  // used to — you don't have to open the menu just to know something in
  // here is active.
  const anyActive = showHydrogens || hasExplicitHydrogens || monochromeAtoms || showGrid || canvasBackground === "white" || showRulers || showCrosshair || showPageOutline;

  // Offered in every theme, the dark ones included: a white canvas there
  // re-resolves the drawing's own ink colors (styles/theme.css), so this no
  // longer has to be disabled where the theme is dark.
  const canvasBgTitle = canvasBackground === "white" ? t("tool.canvasBgUseTheme") : t("tool.canvasBgUseWhite");

  return (
    <div className="view-options-menu" ref={btnWrapRef}>
      {variant === "menu-row" ? (
        <button
          type="button"
          className={`tool-dropdown__row${open ? " tool-dropdown__row--open" : ""}${anyActive ? " tool-dropdown__row--active" : ""}`}
          title={t("tool.viewOptions")}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="tool-dropdown__row-icon"><SlidersHorizontal size={16} /></span>
          <span className="tool-dropdown__row-label">{label ?? t("tool.viewOptions")}</span>
          <ChevronRight size={14} className="tool-dropdown__row-chevron" aria-hidden="true" />
        </button>
      ) : (
        <ToolButton title={t("tool.viewOptions")} active={anyActive} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal size={18} />
        </ToolButton>
      )}
      {open && coords &&
        createPortal(
          <div
            className="view-options-dropdown"
            ref={dropdownRef}
            style={{ top: coords.top, right: coords.right }}
            onClick={(e) => {
              if (!onDone) return;
              if ((e.target as HTMLElement).closest("button:not(:disabled)")) {
                setOpen(false);
                onDone();
              }
            }}
          >
            <ViewOptionRow
              icon={<Atom size={16} />}
              label={t("tool.viewOptionsHydrogens")}
              active={showHydrogens}
              onClick={onToggleHydrogens}
            />
            <ViewOptionRow
              icon={<ExpandedFormulaIcon size={16} />}
              label={t("tool.viewOptionsExpandedFormula")}
              active={hasExplicitHydrogens}
              onClick={onToggleExplicitHydrogens}
            />
            <ViewOptionRow
              icon={<Contrast size={16} />}
              label={t("tool.viewOptionsMonochrome")}
              active={monochromeAtoms}
              onClick={onToggleMonochromeAtoms}
            />
            <div className="view-options-dropdown__divider" />
            <ViewOptionRow
              icon={<Grid3x3 size={16} />}
              label={t("tool.viewOptionsGrid")}
              active={showGrid}
              onClick={onToggleGrid}
            />
            <ViewOptionRow
              icon={canvasBackground === "white" ? <Grid2x2 size={16} /> : <Square size={16} />}
              label={t("tool.viewOptionsCanvasBg")}
              active={canvasBackground === "white"}
              title={canvasBgTitle}
              onClick={onToggleCanvasBackground}
            />
            <div className="view-options-dropdown__divider" />
            <ViewOptionRow
              icon={<Ruler size={16} />}
              label={t("tool.viewOptionsRulers")}
              active={showRulers}
              onClick={onToggleRulers}
            />
            {showRulers && (
              <div className="view-options-dropdown__units" role="group" aria-label={t("tool.viewOptionsRulerUnit")}>
                {(["mm", "in", "bond"] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    className={`view-options-dropdown__unit ${rulerUnit === unit ? "view-options-dropdown__unit--active" : ""}`}
                    aria-pressed={rulerUnit === unit}
                    onClick={() => onSetRulerUnit(unit)}
                  >
                    {unit === "mm" ? t("ruler.mm") : unit === "in" ? t("ruler.in") : t("ruler.bond")}
                  </button>
                ))}
              </div>
            )}
            <ViewOptionRow
              icon={<Crosshair size={16} />}
              label={t("tool.viewOptionsCrosshair")}
              active={showCrosshair}
              onClick={onToggleCrosshair}
            />
            <ViewOptionRow
              icon={<SquareDashed size={16} />}
              label={t("tool.viewOptionsPageOutline")}
              active={showPageOutline}
              onClick={onTogglePageOutline}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

interface ViewOptionRowProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

function ViewOptionRow({ icon, label, active, disabled, title, onClick }: ViewOptionRowProps) {
  return (
    <button
      type="button"
      className="view-options-dropdown__row"
      disabled={disabled}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="view-options-dropdown__row-icon">{icon}</span>
      <span className="view-options-dropdown__row-label">{label}</span>
      {active && <Check size={15} className="view-options-dropdown__row-check" />}
    </button>
  );
}
