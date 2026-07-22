import { useRef } from "react";
import { flushSync } from "react-dom";
import { Undo2, Redo2, Upload, Sun, Moon, Atom, Languages, Contrast, AlertTriangle, Grid2x2, Square, Grid3x3, HelpCircle } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton, Divider } from "../Sidebar/ToolButton";
import { ExportMenu, type ExportBackground } from "./ExportMenu";
import { CompoundSearch } from "./CompoundSearch";
import { StructureSearchButton } from "./StructureSearchButton";
import { IupacNameButton } from "./IupacNameButton";
import { MoleculeInfoButton } from "./MoleculeInfoButton";
import { ClearDrawingButton } from "../common/ClearDrawingButton";
import { isOverValent } from "../../model/valence";
import { exportPNG, exportSVG } from "../../io/exportImage";
import { exportMol, importMol } from "../../io/molfile";
import { exportCdxml, importCdxml } from "../../io/cdxml";
import { exportSmiles } from "../../io/smiles";
import { exportProject, importProject, PROJECT_FILE_EXTENSION, ProjectParseError } from "../../io/project";
import { downloadBlob } from "../../io/exportImage";
import { useT } from "../../i18n/useT";

interface TopBarProps {
  svgRef: React.RefObject<SVGSVGElement>;
  onOpenShortcuts: () => void;
}

export function TopBar({ svgRef, onOpenShortcuts }: TopBarProps) {
  const molecule = useMoleculeStore((s) => s.molecule);
  const theme = useMoleculeStore((s) => s.theme);
  const toggleTheme = useMoleculeStore((s) => s.toggleTheme);
  const canvasBackground = useMoleculeStore((s) => s.canvasBackground);
  const toggleCanvasBackground = useMoleculeStore((s) => s.toggleCanvasBackground);
  const showGrid = useMoleculeStore((s) => s.showGrid);
  const toggleShowGrid = useMoleculeStore((s) => s.toggleShowGrid);
  const toggleLanguage = useMoleculeStore((s) => s.toggleLanguage);
  const undo = useMoleculeStore((s) => s.undo);
  const redo = useMoleculeStore((s) => s.redo);
  const canUndo = useMoleculeStore((s) => s.canUndo());
  const canRedo = useMoleculeStore((s) => s.canRedo());
  const loadMolecule = useMoleculeStore((s) => s.loadMolecule);
  const loadProject = useMoleculeStore((s) => s.loadProject);
  const markProjectSaved = useMoleculeStore((s) => s.markProjectSaved);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const toggleShowHydrogens = useMoleculeStore((s) => s.toggleShowHydrogens);
  const showExpandedFormula = useMoleculeStore((s) => s.showExpandedFormula);
  const toggleShowExpandedFormula = useMoleculeStore((s) => s.toggleShowExpandedFormula);
  const monochromeAtoms = useMoleculeStore((s) => s.monochromeAtoms);
  const toggleMonochromeAtoms = useMoleculeStore((s) => s.toggleMonochromeAtoms);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

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
  const doExportSmiles = async () => {
    const smiles = exportSmiles(molecule);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard API");
      await navigator.clipboard.writeText(smiles);
      setStatus(t("status.smilesCopied", { smiles }));
    } catch {
      // Clipboard access can fail (permissions, insecure context, older
      // WebViews) — a downloaded .smi file still gets the data to the user.
      downloadBlob(new Blob([smiles], { type: "chemical/x-daylight-smiles" }), "molecule.smi");
      setStatus(t("status.smilesDownloaded"));
    }
  };

  const doSaveProject = () => {
    const store = useMoleculeStore.getState();
    const json = exportProject({ activeTabId: store.activeTabId, tabs: store.getAllTabsForSave() });
    downloadBlob(new Blob([json], { type: "application/json" }), `molecule${PROJECT_FILE_EXTENSION}`);
    markProjectSaved();
  };

  const doImportFile = (file: File) => {
    const isCdxml = /\.cdxml$/i.test(file.name);
    const isProject = file.name.toLowerCase().endsWith(PROJECT_FILE_EXTENSION);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (isProject) {
          const project = importProject(String(reader.result));
          loadProject(project);
          const atomCount = project.tabs.reduce((sum, tb) => sum + Object.keys(tb.molecule.atoms).length, 0);
          setStatus(t("status.imported", { count: atomCount }));
          return;
        }
        const parsed = isCdxml ? importCdxml(String(reader.result)) : importMol(String(reader.result));
        loadMolecule(parsed);
        setStatus(t("status.imported", { count: Object.keys(parsed.atoms).length }));
      } catch (err) {
        setStatus(t(err instanceof ProjectParseError ? "status.projectImportError" : "status.importError", { name: file.name }));
      }
    };
    reader.readAsText(file);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M9 3h6M10 3v5.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="9" cy="15" r="1.1" fill="currentColor" />
          <circle cx="13" cy="17.5" r="0.9" fill="currentColor" />
        </svg>
        <span>EnlaceCraft</span>
      </div>

      <CompoundSearch />
      <StructureSearchButton />
      <IupacNameButton />

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
        <ExportMenu onPNG={doExportPNG} onSVG={doExportSVG} onMOL={doExportMol} onCDXML={doExportCdxml} onSmiles={doExportSmiles} onSaveProject={doSaveProject} />
        <MoleculeInfoButton />
        <Divider />
        <ToolButton title={showHydrogens ? t("tool.hideHydrogens") : t("tool.showHydrogens")} active={showHydrogens} onClick={toggleShowHydrogens}>
          <Atom size={18} />
        </ToolButton>
        <ToolButton
          title={showExpandedFormula ? t("tool.hideExpandedFormula") : t("tool.showExpandedFormula")}
          active={showExpandedFormula}
          onClick={toggleShowExpandedFormula}
        >
          <ExpandedFormulaIcon />
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
          title={theme === "dark" ? t("tool.canvasBgUnavailableDark") : (canvasBackground === "white" ? t("tool.canvasBgUseTheme") : t("tool.canvasBgUseWhite"))}
          active={theme === "light" && canvasBackground === "white"}
          disabled={theme === "dark"}
          onClick={toggleCanvasBackground}
        >
          {canvasBackground === "white" ? <Grid2x2 size={18} /> : <Square size={18} />}
        </ToolButton>
        <ToolButton
          title={showGrid ? t("tool.gridOff") : t("tool.gridOn")}
          active={showGrid}
          onClick={toggleShowGrid}
        >
          <Grid3x3 size={18} />
        </ToolButton>
        <ToolButton title={t("tool.shortcuts")} onClick={onOpenShortcuts}>
          <HelpCircle size={18} />
        </ToolButton>
        <ClearDrawingButton />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mol,.cdxml,.enlacecraft"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && doImportFile(e.target.files[0])}
      />
    </header>
  );
}

/** A central vertex fanned out to three explicit substituents — evokes the
 * "expanded structural formula" view (implicit hydrogens drawn as real
 * bonds) without depicting any one specific element, since the toggle
 * applies to whatever's on the canvas. Deliberately distinct from the
 * plain-atom "Atom" icon used for the showHydrogens (text-only) toggle
 * right next to it. */
function ExpandedFormulaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" />
      <line x1="12" y1="14" x2="12" y2="4" />
      <line x1="12" y1="14" x2="20" y2="18" />
      <line x1="12" y1="14" x2="4" y2="18" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
