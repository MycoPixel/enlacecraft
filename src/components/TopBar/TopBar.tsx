import { useRef } from "react";
import { flushSync } from "react-dom";
import { Undo2, Redo2, Upload, Sun, Moon, Languages, AlertTriangle, HelpCircle, Box } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { ToolButton, Divider } from "../Sidebar/ToolButton";
import { ExportMenu, type ExportBackground } from "./ExportMenu";
import { ViewOptionsMenu } from "./ViewOptionsMenu";
import { CompoundSearch } from "./CompoundSearch";
import { StructureSearchButton } from "./StructureSearchButton";
import { IupacNameButton } from "./IupacNameButton";
import { NmrPredictionButton } from "./NmrPredictionButton";
import { MoleculeInfoButton } from "./MoleculeInfoButton";
import { DesktopDownloadButton } from "./DesktopDownloadButton";
import { ClearDrawingButton } from "../common/ClearDrawingButton";
import { isOverValent, hasIgnoredValenceAtoms } from "../../model/valence";
import { exportPNG, exportSVG } from "../../io/exportImage";
import { exportMol, importMol } from "../../io/molfile";
import { exportCdxml, importCdxml } from "../../io/cdxml";
import { exportSmiles } from "../../io/smiles";
import { exportProject, importProject, PROJECT_FILE_EXTENSION, ProjectParseError } from "../../io/project";
import { downloadBlob } from "../../io/exportImage";
import { useT } from "../../i18n/useT";

interface TopBarProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
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
  const importMoleculeAsNewTab = useMoleculeStore((s) => s.importMoleculeAsNewTab);
  const importProjectAsNewTabs = useMoleculeStore((s) => s.importProjectAsNewTabs);
  const markProjectSaved = useMoleculeStore((s) => s.markProjectSaved);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const toggleShowHydrogens = useMoleculeStore((s) => s.toggleShowHydrogens);
  const showExpandedFormula = useMoleculeStore((s) => s.showExpandedFormula);
  const toggleShowExpandedFormula = useMoleculeStore((s) => s.toggleShowExpandedFormula);
  const monochromeAtoms = useMoleculeStore((s) => s.monochromeAtoms);
  const toggleMonochromeAtoms = useMoleculeStore((s) => s.toggleMonochromeAtoms);
  const show3DView = useMoleculeStore((s) => s.show3DView);
  const toggle3DView = useMoleculeStore((s) => s.toggle3DView);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  const hasOverValence = Object.keys(molecule.atoms).some((id) => isOverValent(molecule, id));
  // The 3D viewer's embedding/optimization step (MMFF94, or the xTB
  // backend) needs real force-field parameters for every atom's bonding
  // — same reasoning as IupacNameButton/NmrPredictionButton's identical
  // check, see Atom.ignoreValence's doc comment.
  const blockedByIgnoredValence = hasIgnoredValenceAtoms(molecule);

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
          importProjectAsNewTabs(project);
          const atomCount = project.tabs.reduce((sum, tb) => sum + Object.keys(tb.molecule.atoms).length, 0);
          setStatus(t("status.imported", { count: atomCount }));
          return;
        }
        const parsed = isCdxml ? importCdxml(String(reader.result)) : importMol(String(reader.result));
        const title = file.name.replace(/\.(mol|cdxml)$/i, "");
        importMoleculeAsNewTab(parsed, title);
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
      <NmrPredictionButton />

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
        <ToolButton
          title={blockedByIgnoredValence ? t("tool.view3dBlocked") : t("tool.view3d")}
          active={show3DView}
          disabled={blockedByIgnoredValence}
          onClick={toggle3DView}
        >
          <Box size={18} />
        </ToolButton>
        <Divider />
        <ViewOptionsMenu
          showHydrogens={showHydrogens}
          onToggleHydrogens={toggleShowHydrogens}
          showExpandedFormula={showExpandedFormula}
          onToggleExpandedFormula={toggleShowExpandedFormula}
          monochromeAtoms={monochromeAtoms}
          onToggleMonochromeAtoms={toggleMonochromeAtoms}
          showGrid={showGrid}
          onToggleGrid={toggleShowGrid}
          canvasBackground={canvasBackground}
          onToggleCanvasBackground={toggleCanvasBackground}
          isDarkTheme={theme === "dark"}
        />
        <ToolButton title={t("tool.language")} onClick={toggleLanguage}>
          <Languages size={18} />
        </ToolButton>
        <Divider />
        <ToolButton title={t("tool.theme")} onClick={toggleTheme}>
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </ToolButton>
        <ToolButton title={t("tool.shortcuts")} onClick={onOpenShortcuts}>
          <HelpCircle size={18} />
        </ToolButton>
        <ClearDrawingButton />
        <DesktopDownloadButton />
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

