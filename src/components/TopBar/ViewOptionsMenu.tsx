import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, Atom, Contrast, Grid3x3, Grid2x2, Square, Check } from "lucide-react";
import { ToolButton } from "../Sidebar/ToolButton";
import { ExpandedFormulaIcon } from "./ExpandedFormulaIcon";
import { useT } from "../../i18n/useT";

interface ViewOptionsMenuProps {
  showHydrogens: boolean;
  onToggleHydrogens: () => void;
  showExpandedFormula: boolean;
  onToggleExpandedFormula: () => void;
  monochromeAtoms: boolean;
  onToggleMonochromeAtoms: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  canvasBackground: "white" | "theme";
  onToggleCanvasBackground: () => void;
  isDarkTheme: boolean;
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
  showExpandedFormula, onToggleExpandedFormula,
  monochromeAtoms, onToggleMonochromeAtoms,
  showGrid, onToggleGrid,
  canvasBackground, onToggleCanvasBackground,
  isDarkTheme,
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
  const anyActive = showHydrogens || showExpandedFormula || monochromeAtoms || showGrid || (!isDarkTheme && canvasBackground === "white");

  const canvasBgDisabled = isDarkTheme;
  const canvasBgTitle = isDarkTheme
    ? t("tool.canvasBgUnavailableDark")
    : (canvasBackground === "white" ? t("tool.canvasBgUseTheme") : t("tool.canvasBgUseWhite"));

  return (
    <div className="view-options-menu" ref={btnWrapRef}>
      <ToolButton title={t("tool.viewOptions")} active={anyActive} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={18} />
      </ToolButton>
      {open && coords &&
        createPortal(
          <div className="view-options-dropdown" ref={dropdownRef} style={{ top: coords.top, right: coords.right }}>
            <ViewOptionRow
              icon={<Atom size={16} />}
              label={t("tool.viewOptionsHydrogens")}
              active={showHydrogens}
              onClick={onToggleHydrogens}
            />
            <ViewOptionRow
              icon={<ExpandedFormulaIcon size={16} />}
              label={t("tool.viewOptionsExpandedFormula")}
              active={showExpandedFormula}
              onClick={onToggleExpandedFormula}
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
              active={!isDarkTheme && canvasBackground === "white"}
              disabled={canvasBgDisabled}
              title={canvasBgTitle}
              onClick={onToggleCanvasBackground}
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
