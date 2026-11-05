import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { ToolButton } from "../Sidebar/ToolButton";
import { useT } from "../../i18n/useT";

export type ExportBackground = "transparent" | "white" | "theme";

interface ExportMenuProps {
  onPNG: (background: ExportBackground) => void;
  onSVG: (background: ExportBackground) => void;
  /** Opens the page setup dialog (paper, margins, bond length). */
  onPageSetup: () => void;
  onPDF: (background: ExportBackground) => void;
  onPrint: (background: ExportBackground) => void;
  onMOL: () => void;
  onSDF: () => void;
  onSDFWithProperties: () => void;
  onRXN: () => void;
  onReactionSmiles: () => void;
  onCDXML: () => void;
  onSmiles: () => void;
  /** Copy As: puts ONE format directly on the OS clipboard (the download
   * entries above always write files). SVG/PNG copy the whole canvas; the
   * chemistry formats copy the current selection, or the whole molecule
   * when nothing is selected — matching the download entries' semantics. */
  onCopyAs: (format: "svg" | "png" | "cdxml" | "mol" | "molV3000" | "smiles" | "inchi") => void;
  /** Copy As entries need something to copy — chemistry formats are
   * disabled on an empty canvas, SVG/PNG copy the (empty) frame either way. */
  copyAsDisabled: boolean;
  /** When on, SVG/PNG/HTML exports are framed on the page-setup paper
   * (the same box PDF/print use) instead of tightly cropping to the ink. */
  fitExportsToPage: boolean;
  onToggleFitExportsToPage: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onCopyShareLink: () => void;
  onOpenShareLink: () => void;
  onCopyEmbedCode: () => void;
  onExportHtmlViewer: (background: ExportBackground) => void;
  /** RXN and reaction SMILES only make sense once a scheme exists. */
  reactionExportDisabled: boolean;
  /** File this project was last saved to, shown next to the Save entry so
   * it's visible where a plain Save is going before it's pressed. */
  projectFileName: string | null;
}

/**
 * The export button lives among many other icons in the top bar's
 * `.top-actions` strip, which scrolls horizontally on narrow windows
 * (`overflow-x: auto`). A dropdown positioned with `position: absolute`
 * relative to that button gets clipped by that same scroll container, so it
 * could end up invisible unless the user happened to scroll the bar to just
 * the right spot. Rendering the dropdown into a portal attached to
 * `document.body` and positioning it with `position: fixed` from the
 * button's own bounding rect sidesteps that entirely — it's never inside any
 * scrolling/clipping ancestor.
 */
export function ExportMenu({
  onPNG,
  onSVG,
  onPageSetup,
  onPDF,
  onPrint,
  onMOL,
  onSDF,
  onSDFWithProperties,
  onRXN,
  onReactionSmiles,
  onCDXML,
  onSmiles,
  onCopyAs,
  copyAsDisabled,
  fitExportsToPage,
  onToggleFitExportsToPage,
  onSaveProject,
  onSaveProjectAs,
  onCopyShareLink,
  onOpenShareLink,
  onCopyEmbedCode,
  onExportHtmlViewer,
  reactionExportDisabled,
  projectFileName,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState<ExportBackground>("transparent");
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

  return (
    <div className="export-menu" ref={btnWrapRef}>
      <ToolButton title={t("tool.export")} onClick={() => setOpen((o) => !o)}>
        <Download size={18} />
      </ToolButton>
      {open && coords &&
        createPortal(
          <div className="export-dropdown" ref={dropdownRef} style={{ top: coords.top, right: coords.right }}>
            {/* Save overwrites the file named here with no dialog; Save As
                always asks. Shown only once something has been chosen —
                before that, Save and Save As do exactly the same thing. */}
            <button
              className="export-dropdown__item export-dropdown__item--primary"
              onClick={() => { onSaveProject(); setOpen(false); }}
              title={projectFileName ? t("tool.saveProjectTo", { name: projectFileName }) : undefined}
            >
              {t("tool.save")}
              {projectFileName && <span className="export-dropdown__item-detail">{projectFileName}</span>}
            </button>
            <button className="export-dropdown__item" onClick={() => { onSaveProjectAs(); setOpen(false); }}>
              {t("tool.saveAs")}
            </button>
            <div className="export-dropdown__divider" />
            <div className="export-dropdown__section-label">{t("tool.share")}</div>
            <button className="export-dropdown__item" onClick={() => { onCopyShareLink(); setOpen(false); }}>
              {t("tool.copyShareLink")}
            </button>
            <button className="export-dropdown__item" onClick={() => { onOpenShareLink(); setOpen(false); }}>
              {t("tool.openShareLink")}
            </button>
            <button className="export-dropdown__item" onClick={() => { onCopyEmbedCode(); setOpen(false); }}>
              {t("tool.copyEmbedCode")}
            </button>
            <button className="export-dropdown__item" onClick={() => { onExportHtmlViewer(background); setOpen(false); }}>
              {t("tool.exportHtmlViewer")}
            </button>
            <div className="export-dropdown__divider" />
            <div className="export-dropdown__section-label">{t("tool.exportBackground")}</div>
            <div className="export-bg-picker" role="radiogroup" aria-label={t("tool.exportBackground")}>
              {(["transparent", "white", "theme"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={background === mode}
                  className={`export-bg-swatch export-bg-swatch--${mode} ${background === mode ? "export-bg-swatch--active" : ""}`}
                  title={t(mode === "transparent" ? "tool.bgTransparent" : mode === "white" ? "tool.bgWhite" : "tool.bgTheme")}
                  onClick={() => setBackground(mode)}
                />
              ))}
            </div>
            <label className="export-dropdown__check">
              <input type="checkbox" checked={fitExportsToPage} onChange={onToggleFitExportsToPage} />
              {t("tool.fitExportsToPage")}
            </label>
            <button className="export-dropdown__item" onClick={() => { onPNG(background); setOpen(false); }}>{t("tool.exportPNG")}</button>
            <button className="export-dropdown__item" onClick={() => { onSVG(background); setOpen(false); }}>{t("tool.exportSVG")}</button>
            <button className="export-dropdown__item" onClick={() => { onPageSetup(); setOpen(false); }}>{t("tool.pageSetup")}</button>
            <button className="export-dropdown__item" onClick={() => { onPDF(background); setOpen(false); }}>{t("tool.exportPDF")}</button>
            <button className="export-dropdown__item" onClick={() => { onPrint(background); setOpen(false); }}>{t("tool.exportPrintPDF")}</button>
            <div className="export-dropdown__divider" />
            <div className="export-dropdown__section-label">{t("tool.copyAs")}</div>
            {([
              ["svg", "tool.copyAsSvg"],
              ["png", "tool.copyAsPng"],
              ["cdxml", "tool.copyAsCdxml"],
              ["mol", "tool.copyAsMol"],
              ["molV3000", "tool.copyAsMolV3000"],
              ["smiles", "tool.copyAsSmiles"],
              ["inchi", "tool.copyAsInchi"],
            ] as const).map(([format, titleKey]) => (
              <button
                key={format}
                className="export-dropdown__item"
                disabled={copyAsDisabled && format !== "svg" && format !== "png"}
                title={copyAsDisabled && format !== "svg" && format !== "png" ? t("tool.copyAsDisabled") : undefined}
                onClick={() => { onCopyAs(format); setOpen(false); }}
              >
                {t(titleKey)}
              </button>
            ))}
            <div className="export-dropdown__divider" />
            <button className="export-dropdown__item" onClick={() => { onMOL(); setOpen(false); }}>{t("tool.exportMOL")}</button>
            <button className="export-dropdown__item" onClick={() => { onSDF(); setOpen(false); }}>{t("tool.exportSDF")}</button>
            <button className="export-dropdown__item" onClick={() => { onSDFWithProperties(); setOpen(false); }}>{t("tool.exportSDFWithProperties")}</button>
            <button className="export-dropdown__item" onClick={() => { onCDXML(); setOpen(false); }}>{t("tool.exportCDXML")}</button>
            <button className="export-dropdown__item" onClick={() => { onSmiles(); setOpen(false); }}>{t("tool.exportSmiles")}</button>
            <div className="export-dropdown__divider" />
            <button
              className="export-dropdown__item"
              disabled={reactionExportDisabled}
              title={reactionExportDisabled ? t("tool.exportReactionDisabled") : undefined}
              onClick={() => { onRXN(); setOpen(false); }}
            >
              {t("tool.exportRXN")}
            </button>
            <button
              className="export-dropdown__item"
              disabled={reactionExportDisabled}
              title={reactionExportDisabled ? t("tool.exportReactionDisabled") : undefined}
              onClick={() => { onReactionSmiles(); setOpen(false); }}
            >
              {t("tool.exportReactionSmiles")}
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
