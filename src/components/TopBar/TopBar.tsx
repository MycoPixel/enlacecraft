import { useRef } from "react";
import { flushSync } from "react-dom";
import { Undo2, Redo2, Upload, Sun, Moon, Atom, Languages, Trash2, Contrast, AlertTriangle, Grid2x2, Square } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton, Divider } from "../Sidebar/ToolButton";
import { ExportMenu, type ExportBackground } from "./ExportMenu";
import { CompoundSearch } from "./CompoundSearch";
import { computeFormula, computeMolecularWeight, isOverValent } from "../../model/valence";
import { exportPNG, exportSVG } from "../../io/exportImage";
import { exportMol, importMol } from "../../io/molfile";
import { exportCdxml, importCdxml } from "../../io/cdxml";
import { downloadBlob } from "../../io/exportImage";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useT } from "../../i18n/useT";

interface TopBarProps {
  svgRef: React.RefObject<SVGSVGElement>;
}

export function TopBar({ svgRef }: TopBarProps) {
  const molecule = useMoleculeStore((s) => s.molecule);
  const theme = useMoleculeStore((s) => s.theme);
  const toggleTheme = useMoleculeStore((s) => s.toggleTheme);
  const canvasBackground = useMoleculeStore((s) => s.canvasBackground);
  const toggleCanvasBackground = useMoleculeStore((s) => s.toggleCanvasBackground);
  const toggleLanguage = useMoleculeStore((s) => s.toggleLanguage);
  const undo = useMoleculeStore((s) => s.undo);
  const redo = useMoleculeStore((s) => s.redo);
  const canUndo = useMoleculeStore((s) => s.canUndo());
  const canRedo = useMoleculeStore((s) => s.canRedo());
  const loadMolecule = useMoleculeStore((s) => s.loadMolecule);
  const clear = useMoleculeStore((s) => s.clear);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const toggleShowHydrogens = useMoleculeStore((s) => s.toggleShowHydrogens);
  const monochromeAtoms = useMoleculeStore((s) => s.monochromeAtoms);
  const toggleMonochromeAtoms = useMoleculeStore((s) => s.toggleMonochromeAtoms);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const t = useT();

  const formula = computeFormula(molecule);
  const mw = computeMolecularWeight(molecule);
  const hasOverValence = Object.keys(molecule.atoms).some((id) => isOverValent(molecule, id));

  const resolveBackground = (bg: ExportBackground): string | null => {
    if (bg === "transparent") return null;
    if (bg === "white") return "#ffffff";
    return theme === "dark" ? "#1c1f24" : "#ffffff";
  };

  /**
   * Selection highlights (the atom halo, annotation drag handles, the
   * "selected" accent color on arrows/brackets) are editing affordances, not
   * part of the molecule itself, so exports should look the same whether or
   * not something happens to be selected at the moment. Clearing selection
   * with flushSync forces React to re-render synchronously before the SVG is
   * read, so the export captures the deselected appearance; the previous
   * selection is restored right afterwards.
   */
  const withDeselected = (action: () => void) => {
    const store = useMoleculeStore.getState();
    const prevSelected = store.selected;
    const prevAnnotationIds = store.selectedAnnotationIds;
    const hadSelection = prevSelected.size > 0 || prevAnnotationIds.size > 0;
    if (hadSelection) {
      flushSync(() => {
        store.setSelected(new Set());
        store.setSelectedAnnotationIds(new Set());
      });
    }
    try {
      action();
    } finally {
      if (hadSelection) {
        flushSync(() => {
          store.setSelected(prevSelected);
          store.setSelectedAnnotationIds(prevAnnotationIds);
        });
      }
    }
  };

  const doExportPNG = (bg: ExportBackground) => {
    if (!svgRef.current) return;
    withDeselected(() => exportPNG(svgRef.current!, resolveBackground(bg)));
  };
  const doExportSVG = (bg: ExportBackground) => {
    if (!svgRef.current) return;
    withDeselected(() => exportSVG(svgRef.current!, resolveBackground(bg)));
  };
  const doExportMol = () => downloadBlob(new Blob([exportMol(molecule)], { type: "chemical/x-mdl-molfile" }), "molecule.mol");
  const doExportCdxml = () => downloadBlob(new Blob([exportCdxml(molecule)], { type: "chemical/x-cdxml" }), "molecule.cdxml");

  const doImportFile = (file: File) => {
    const isCdxml = /\.cdxml$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = isCdxml ? importCdxml(String(reader.result)) : importMol(String(reader.result));
        loadMolecule(parsed);
        setStatus(t("status.imported", { count: Object.keys(parsed.atoms).length }));
      } catch {
        setStatus(t("status.importError", { name: file.name }));
      }
    };
    reader.readAsText(file);
  };

  const onClear = () => {
    if (confirm(t("confirm.clearDrawing"))) clear();
  };

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9 3h6M10 3v5.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="9" cy="15" r="1.1" fill="currentColor" />
          <circle cx="13" cy="17.5" r="0.9" fill="currentColor" />
        </svg>
        <span>MolSketch</span>
      </div>

      <CompoundSearch />

      {!isMobile && (
        <div className="formula">
          {formula || "\u2014"}
          {mw > 0 && <span className="formula__mw">{mw.toFixed(2)} g/mol</span>}
        </div>
      )}

      {hasOverValence && (
        <div className="valence-warn" title={t("valence.exceeded")}>
          <AlertTriangle size={13} />
          <span>{t("valence.exceeded")}</span>
        </div>
      )}

      <div className="top-actions">
        <ToolButton title={t("tool.undo")} onClick={undo}>
          <Undo2 size={18} style={{ opacity: canUndo ? 1 : 0.35 }} />
        </ToolButton>
        <ToolButton title={t("tool.redo")} onClick={redo}>
          <Redo2 size={18} style={{ opacity: canRedo ? 1 : 0.35 }} />
        </ToolButton>
        <Divider />
        <ToolButton title={t("tool.import")} onClick={() => fileInputRef.current?.click()}>
          <Upload size={18} />
        </ToolButton>
        <ExportMenu onPNG={doExportPNG} onSVG={doExportSVG} onMOL={doExportMol} onCDXML={doExportCdxml} />
        <Divider />
        <ToolButton title={showHydrogens ? t("tool.hideHydrogens") : t("tool.showHydrogens")} active={showHydrogens} onClick={toggleShowHydrogens}>
          <Atom size={18} />
        </ToolButton>
        <ToolButton title={monochromeAtoms ? t("tool.monochromeOff") : t("tool.monochromeOn")} active={monochromeAtoms} onClick={toggleMonochromeAtoms}>
          <Contrast size={18} />
        </ToolButton>
        <ToolButton title={t("tool.language")} onClick={toggleLanguage}>
          <Languages size={18} />
        </ToolButton>
        <Divider />
        <ToolButton title={t("tool.theme")} onClick={toggleTheme}>
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </ToolButton>
        <ToolButton
          title={canvasBackground === "white" ? t("tool.canvasBgUseTheme") : t("tool.canvasBgUseWhite")}
          active={canvasBackground === "white"}
          onClick={toggleCanvasBackground}
        >
          {canvasBackground === "white" ? <Grid2x2 size={18} /> : <Square size={18} />}
        </ToolButton>
        <ToolButton title={t("tool.clearDrawing")} onClick={onClear}>
          <Trash2 size={18} />
        </ToolButton>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mol,.cdxml"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && doImportFile(e.target.files[0])}
      />
    </header>
  );
}
