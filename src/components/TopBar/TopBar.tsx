import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Undo2, Redo2, Upload, Languages, AlertTriangle, HelpCircle, Box, History, ClipboardPaste, FlaskConical } from "lucide-react";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { themeViewerBackground } from "../../styles/themes";
import { ToolButton, Divider } from "../Sidebar/ToolButton";
import { ExportMenu, type ExportBackground } from "./ExportMenu";
import { PageSetupDialog } from "./PageSetupDialog";
import { PasteStructureDialog } from "./PasteStructureDialog";
import { ReactionBuilderDialog } from "./ReactionBuilderDialog";
import { OpenShareLinkDialog } from "./OpenShareLinkDialog";
import { ViewOptionsMenu } from "./ViewOptionsMenu";
import { ThemePicker } from "./ThemePicker";
import { CompoundSearch } from "./CompoundSearch";
import { StructureSearchButton } from "./StructureSearchButton";
import { IupacNameButton } from "./IupacNameButton";
import { NmrPredictionButton } from "./NmrPredictionButton";
import { MoleculeInfoButton } from "./MoleculeInfoButton";
import { MassSpecButton } from "./MassSpecButton";
import { PropertiesButton } from "./PropertiesButton";
import { AromaticityButton } from "./AromaticityButton";
import { IrSpectrumButton } from "./IrSpectrumButton";
import { DesktopDownloadButton } from "./DesktopDownloadButton";
import { ClearDrawingButton } from "../common/ClearDrawingButton";
import { isOverValent, hasIgnoredValenceAtoms, overValentAtomIds, suggestValenceFix, valenceExplainParams } from "../../model/valence";
import { hasExplicitHydrogens } from "../../model/molecule";
import { exportPNG, exportSVG, downloadBlob, serializeExportSVG } from "../../io/exportImage";
import { pageBoundsInWorld } from "../../model/pageSetup";
import { exportPDF } from "../../io/pdfExport";
import { printMolecule } from "../../io/printExport";
import { exportMol } from "../../io/molfile";
import { exportAllReactionSmiles, exportRxn, exportSdf, hasExportableReaction } from "../../io/reactionExport";
import { buildPropertyRows, propertyRowToSdfFields } from "../../io/propertiesTable";
import { exportCdxmlDocument } from "../../io/cdxml";
import { exportSmiles } from "../../io/smiles";
import { runProjectSave } from "../../io/projectSaver";
import { ShareLinkError, buildShareUrl, createEmbedCodeForTab, createShareUrlForTab } from "../../io/shareLink";
import { buildHtmlViewer } from "../../io/htmlViewer";
import { writeClipboardText } from "../../io/clipboard";
import type { CopyAsFormat } from "../../hooks/useClipboard";
import { useFileImport } from "../../hooks/useFileImport";
import { useHorizontalStripScroll } from "../../hooks/useHorizontalStripScroll";
import { LIMITS } from "../../io/validate";
import { useT } from "../../i18n/useT";
import { APP_VERSION } from "../../version";
import { registerCommandGroup, unregisterCommandGroup, type AppCommand } from "../../commands/commands";

interface TopBarProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  onOpenShortcuts: () => void;
  onOpenVersionHistory: () => void;
  /** Copy As handlers (one format straight to the clipboard) — see
   * useClipboard's copyAs, which owns the actual logic; TopBar only routes
   * menu/palette entries to it and reports the outcome in the status line. */
  copyAs: (format: CopyAsFormat) => Promise<boolean>;
}

export function TopBar({ svgRef, onOpenShortcuts, onOpenVersionHistory, copyAs }: TopBarProps) {
  const molecule = useMoleculeStore((s) => s.molecule);
  const annotations = useMoleculeStore((s) => s.annotations);
  const page = useMoleculeStore((s) => s.page);
  const theme = useMoleculeStore((s) => s.theme);
  const canvasBackground = useMoleculeStore((s) => s.canvasBackground);
  const toggleCanvasBackground = useMoleculeStore((s) => s.toggleCanvasBackground);
  const showGrid = useMoleculeStore((s) => s.showGrid);
  const toggleShowGrid = useMoleculeStore((s) => s.toggleShowGrid);
  const showRulers = useMoleculeStore((s) => s.showRulers);
  const toggleShowRulers = useMoleculeStore((s) => s.toggleShowRulers);
  const showCrosshair = useMoleculeStore((s) => s.showCrosshair);
  const toggleShowCrosshair = useMoleculeStore((s) => s.toggleShowCrosshair);
  const showPageOutline = useMoleculeStore((s) => s.showPageOutline);
  const toggleShowPageOutline = useMoleculeStore((s) => s.toggleShowPageOutline);
  const rulerUnit = useMoleculeStore((s) => s.rulerUnit);
  const fitExportsToPage = useMoleculeStore((s) => s.fitExportsToPage);
  const toggleFitExportsToPage = useMoleculeStore((s) => s.toggleFitExportsToPage);
  const selectedCount = useMoleculeStore((s) => s.selected.size);
  const setRulerUnit = useMoleculeStore((s) => s.setRulerUnit);
  const toggleLanguage = useMoleculeStore((s) => s.toggleLanguage);
  const undo = useMoleculeStore((s) => s.undo);
  const redo = useMoleculeStore((s) => s.redo);
  const setAtomCharge = useMoleculeStore((s) => s.setAtomCharge);
  const canUndo = useMoleculeStore((s) => s.canUndo());
  const canRedo = useMoleculeStore((s) => s.canRedo());
  // Display only — the actual save (and the dirty flag) is owned by
  // runProjectSave, which the menu and the shortcut both call.
  const projectFileName = useMoleculeStore((s) => s.projectFileName);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const showHydrogens = useMoleculeStore((s) => s.showHydrogens);
  const toggleShowHydrogens = useMoleculeStore((s) => s.toggleShowHydrogens);
  const toggleExplicitHydrogens = useMoleculeStore((s) => s.toggleExplicitHydrogens);
  const monochromeAtoms = useMoleculeStore((s) => s.monochromeAtoms);
  const toggleMonochromeAtoms = useMoleculeStore((s) => s.toggleMonochromeAtoms);
  const show3DView = useMoleculeStore((s) => s.show3DView);
  const toggle3DView = useMoleculeStore((s) => s.toggle3DView);
  const tabs = useMoleculeStore((s) => s.tabs);
  const activeTabId = useMoleculeStore((s) => s.activeTabId);
  const language = useMoleculeStore((s) => s.language);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Valence-warnings popover (opened from the warning chip) — local UI
  // state, closed again after a fix is applied or the chip re-clicked.
  const [valenceOpen, setValenceOpen] = useState(false);
  // Paste-to-import dialog (SMILES / MOL / CDXML text) — open state lives
  // here rather than in the dialog so the trigger button stays a plain
  // ToolButton like every other top-bar action.
  const [pasteOpen, setPasteOpen] = useState(false);
  // Reaction builder dialog (type names/SMILES into reactant/product boxes).
  const [reactionBuilderOpen, setReactionBuilderOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  // The palette commands below are registered once, but each action must run
  // the *current* render's handler (fresh molecule, language, background).
  // This ref is refreshed every render and read only when a command fires.
  const commandActionsRef = useRef<Record<string, () => void | Promise<void>>>({});
  // The action strip scrolls sideways when the window is too narrow for
  // every button; this is what makes a plain mouse wheel drive it.
  const topActionsRef = useRef<HTMLDivElement>(null);
  useHorizontalStripScroll(topActionsRef);
  const t = useT();
  const importFileContent = useFileImport();

  // Memoized on the molecule object: this scan touches every atom and, via
  // isOverValent, its bonds. Computing it inline on every render made every
  // hover/drag re-render of the whole top bar pay O(atoms) work even when
  // nothing about the drawing had changed (the adjacency index inside
  // valence.ts keeps a single pass cheap; the memo keeps it to one pass per
  // actual molecule change).
  const hasOverValence = useMemo(() => Object.keys(molecule.atoms).some((id) => isOverValent(molecule, id)), [molecule]);
  // The 3D viewer's embedding/optimization step (MMFF94, or the xTB
  // backend) needs real force-field parameters for every atom's bonding
  // — same reasoning as IupacNameButton/NmrPredictionButton's identical
  // check, see Atom.ignoreValence's doc comment.
  const blockedByIgnoredValence = hasIgnoredValenceAtoms(molecule);
  const reactionExportDisabled = !hasExportableReaction(molecule);

  const resolveBackground = (bg: ExportBackground): string | null => {
    if (bg === "transparent") return null;
    if (bg === "white") return "#ffffff";
    return themeViewerBackground(theme);
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
  const withDeselected = <T,>(action: () => T): T => {
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
      return action();
    } finally {
      if (hadSelection) {
        flushSync(() => {
          store.setSelected(prevSelected);
          store.setSelectedAnnotationIds(prevAnnotationIds);
        });
      }
    }
  };

  /** Page-sized framing for SVG/PNG/HTML exports when fitExportsToPage is
   * on (the same box PDF/print place content on). Null keeps the default
   * tight crop around the drawing. */
  const exportBoundsOverride = () => {
    const s = useMoleculeStore.getState();
    return s.fitExportsToPage ? pageBoundsInWorld(s.page) : null;
  };

  const doExportPNG = (bg: ExportBackground) => {
    if (!svgRef.current) return;
    withDeselected(() => exportPNG(svgRef.current!, resolveBackground(bg), "molecule.png", undefined, exportBoundsOverride()));
  };
  const doExportSVG = (bg: ExportBackground) => {
    if (!svgRef.current) return;
    // The exported .svg carries the drawing's CDXML in a <metadata> block,
    // so re-importing it (here or in another EnlaceCraft) rebuilds the
    // editable structure — the Inkscape/Illustrator round trip. Whole-canvas
    // CDXML, regardless of selection: the frame is the whole canvas too.
    withDeselected(() => exportSVG(svgRef.current!, resolveBackground(bg), "molecule.svg", exportBoundsOverride(), exportCdxmlDocument(molecule, Object.values(useMoleculeStore.getState().annotations), "molecule", useMoleculeStore.getState().page)));
  };

  /** Copy As menu/palette entries — see useClipboard's copyAs. Reports the
   * outcome so an InChI lookup failure (offline) or an empty selection is
   * a status message, not a silent no-op. */
  const doCopyAs = (format: CopyAsFormat) => {
    void copyAs(format)
      .then((ok) => setStatus(ok ? t("status.copiedToClipboard") : t("status.copyAsNothing")))
      .catch((err) => {
        console.warn("Copy As failed", err);
        setStatus(t("status.copyAsError", { error: err instanceof Error ? err.message : String(err) }));
      });
  };
  const doExportPrint = (bg: ExportBackground) => {
    if (!svgRef.current) return;
    // "transparent" has no printed-page equivalent (paper has no
    // transparency) — falls through to resolveBackground's own
    // null-background handling, which prints on plain white the same as
    // an explicit "white" choice.
    const title = tabs.find((tb) => tb.id === activeTabId)?.title ?? "";
    withDeselected(() => printMolecule(svgRef.current!, resolveBackground(bg), title, page));
  };
  const doExportPDF = async (bg: ExportBackground) => {
    if (!svgRef.current) return;
    const title = tabs.find((tb) => tb.id === activeTabId)?.title ?? "molecule";
    try {
      // exportPDF clones the SVG synchronously before its lazy import
      // resolves, so selection can be restored as soon as this call
      // returns — the export itself continues with the already-taken copy.
      await withDeselected(() =>
        exportPDF(svgRef.current!, resolveBackground(bg), page, "molecule.pdf", title)
      );
      setStatus(t("status.pdfExported"));
    } catch (err) {
      setStatus(t("status.pdfExportError", { error: err instanceof Error ? err.message : String(err) }));
    }
  };
  const doExportMol = () => downloadBlob(new Blob([exportMol(molecule)], { type: "chemical/x-mdl-molfile" }), "molecule.mol");
  const doExportSdf = () => {
    const sdf = exportSdf(molecule);
    if (!sdf) return;
    downloadBlob(new Blob([sdf], { type: "chemical/x-mdl-sdfile" }), "molecule.sdf");
    setStatus(t("status.sdfDownloaded"));
  };
  // Same records as plain SDF, plus one `> <Field>` block per computed
  // property. buildPropertyRows and exportSdf both split by
  // findConnectedFragments, so properties[i] is always the fragment in
  // record i — no second, potentially reordered fragment walk.
  const doExportSdfWithProperties = () => {
    const properties = buildPropertyRows(molecule).map(propertyRowToSdfFields);
    const sdf = exportSdf(molecule, "molecule", { properties });
    if (!sdf) return;
    downloadBlob(
      new Blob([sdf], { type: "chemical/x-mdl-sdfile" }),
      "molecule-properties.sdf",
    );
    setStatus(t("status.sdfWithPropertiesDownloaded"));
  };
  const doExportRxn = () => {
    const rxn = exportRxn(molecule);
    if (!rxn) {
      setStatus(t("status.noReactionScheme"));
      return;
    }
    downloadBlob(new Blob([rxn], { type: "chemical/x-mdl-rxnfile" }), "molecule.rxn");
    setStatus(t("status.rxnDownloaded"));
  };
  const doExportReactionSmiles = async () => {
    const smiles = exportAllReactionSmiles(molecule);
    if (!smiles) {
      setStatus(t("status.noReactionScheme"));
      return;
    }
    try {
      await writeClipboardText(smiles);
      setStatus(t("status.reactionSmilesCopied", { smiles }));
    } catch {
      downloadBlob(new Blob([smiles], { type: "chemical/x-daylight-smiles" }), "reaction.smi");
      setStatus(t("status.reactionSmilesDownloaded"));
    }
  };
  // Document-level export: arrows, brackets and caption text go into the
  // file alongside the molecule, so a drawing saved as .cdxml opens in
  // ChemDraw with its reaction arrows and labels intact (and re-imports
  // here losslessly — see io/cdxml.ts for what round-trips and what is
  // deliberately dropped, e.g. curved mechanism arrows).
  const doExportCdxml = () =>
    downloadBlob(
      new Blob([exportCdxmlDocument(molecule, Object.values(annotations), "molecule", page)], { type: "chemical/x-cdxml" }),
      "molecule.cdxml",
    );
  const doExportSmiles = async () => {
    const smiles = exportSmiles(molecule);
    try {
      await writeClipboardText(smiles);
      setStatus(t("status.smilesCopied", { smiles }));
    } catch {
      // Clipboard access can fail (permissions, insecure context, older
      // WebViews) — a downloaded .smi file still gets the data to the user.
      downloadBlob(new Blob([smiles], { type: "chemical/x-daylight-smiles" }), "molecule.smi");
      setStatus(t("status.smilesDownloaded"));
    }
  };

  // Both delegate to runProjectSave so the menu and the Ctrl+S shortcut can't
  // drift apart; see projectSaver.ts's doc comment.
  const doSaveProject = () => { void runProjectSave(false); };
  const doSaveProjectAs = () => { void runProjectSave(true); };

  // The active tab's *full* document (molecule, annotations, view, page) as
  // the project format sees it — the same data Save writes, not just the
  // in-memory slice the canvas is rendering from.
  const activeTabForShare = () => {
    const store = useMoleculeStore.getState();
    const all = store.getAllTabsForSave();
    return all.find((tb) => tb.id === store.activeTabId) ?? all[0];
  };

  const shareFailureMessage = (err: unknown) => {
    if (err instanceof ShareLinkError) {
      if (err.code === "too-large") return t("status.shareLinkTooLarge");
      if (err.code === "not-web") return t("status.shareLinkNotWeb");
      if (err.code === "unsupported") return t("status.shareLinkUnsupported");
    }
    return t("status.shareLinkError", { error: err instanceof Error ? err.message : String(err) });
  };

  const writeClipboard = writeClipboardText;

  const doCopyShareLink = async () => {
    const tab = activeTabForShare();
    if (!tab) return;
    let url: string;
    try {
      url = await createShareUrlForTab(tab);
    } catch (err) {
      setStatus(shareFailureMessage(err));
      return;
    }
    try {
      await writeClipboard(url);
      setStatus(t("status.shareLinkCopied"));
    } catch {
      // Clipboard access can be denied (permissions, insecure context,
      // iframes). The link still works, so hand it over as a text file
      // rather than losing it — same fallback policy as the SMILES copies.
      downloadBlob(new Blob([url], { type: "text/plain" }), "share-link.txt");
      setStatus(t("status.shareLinkDownloaded"));
    }
  };

  const doCopyEmbedCode = async () => {
    const tab = activeTabForShare();
    if (!tab) return;
    let code: string;
    try {
      code = await createEmbedCodeForTab(tab, undefined, tab.title);
    } catch (err) {
      setStatus(shareFailureMessage(err));
      return;
    }
    try {
      await writeClipboard(code);
      setStatus(t("status.embedCodeCopied"));
    } catch {
      downloadBlob(new Blob([code], { type: "text/html" }), "embed-code.html");
      setStatus(t("status.embedCodeDownloaded"));
    }
  };

  /**
   * Opens a link the user pasted into the shared-link dialog.
   *
   * Desktop gets its own read-only window (main.cjs builds the same `#view=`
   * URL from the token), because navigating this window away from the
   * editor's `file:` page would be blocked and reloading it would trigger the
   * unsaved-changes prompt. The web build simply opens a new tab.
   */
  const doOpenShareLink = async (token: string) => {
    if (window.electron) {
      try {
        const opened = await window.electron.openShareLink(token);
        setStatus(opened ? t("status.shareLinkOpened") : t("status.shareLinkOpenFailed"));
      } catch (err) {
        setStatus(t("status.shareLinkOpenFailed"));
        console.warn("Could not open shared link", err);
      }
      return;
    }
    try {
      window.open(buildShareUrl(token), "_blank", "noopener,noreferrer");
    } catch (err) {
      setStatus(shareFailureMessage(err));
    }
  };

  // A single self-contained page wrapping the same SVG the SVG export
  // writes. The markup comes from our exporter, so it is embedded verbatim;
  // htmlViewer.ts escapes only the caller-supplied title/background/lang.
  const doExportHtmlViewer = (bg: ExportBackground) => {
    if (!svgRef.current) return;
    try {
      const title = tabs.find((tb) => tb.id === activeTabId)?.title ?? "EnlaceCraft";
      const background = resolveBackground(bg) ?? "#ffffff";
      const svg = withDeselected(() => serializeExportSVG(svgRef.current!, background, exportBoundsOverride()));
      const html = buildHtmlViewer(svg, { title, background, lang: language });
      const safe = title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "molecule";
      downloadBlob(new Blob([html], { type: "text/html" }), `${safe}.html`);
      setStatus(t("status.htmlViewerExported"));
    } catch (err) {
      setStatus(t("status.htmlViewerError", { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  const doImportFile = (file: File) => {
    if (file.size > LIMITS.maxFileChars) {
      setStatus(t("status.fileTooLarge", { name: file.name }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => importFileContent(file.name, String(reader.result));
    reader.readAsText(file);
  };

  // Desktop build: a real native "Open" dialog (see electron/main.cjs's
  // "dialog:open-file" handler) instead of the hidden <input type="file">
  // below — the main process reads the file directly off disk and hands
  // back its text, which importFileContent() then parses exactly the same
  // way it would browser-read content.
  const doOpen = async () => {
    if (window.electron) {
      const result = await window.electron.openFile();
      if (result.canceled) return;
      if (result.error) {
        setStatus(t("status.openFileError", { error: result.error }));
        return;
      }
      importFileContent(result.fileName ?? "", result.content ?? "", result.filePath);
      return;
    }
    fileInputRef.current?.click();
  };

  // Palette-facing commands for actions whose implementation lives here.
  // Wrappers read `commandActionsRef` so the registered group never has to be
  // rebuilt (and re-registered) on every edit.
  useEffect(() => {
    commandActionsRef.current = {
      "file.open": doOpen,
      "file.paste": () => setPasteOpen(true),
      "reaction.build": () => setReactionBuilderOpen(true),
      "file.save": () => { void runProjectSave(false); },
      "file.saveAs": () => { void runProjectSave(true); },
      "export.png": () => doExportPNG("transparent"),
      "export.svg": () => doExportSVG("transparent"),
      "export.pageSetup": () => setPageSetupOpen(true),
      "export.pdf": () => { void doExportPDF("transparent"); },
      "export.print": () => doExportPrint("transparent"),
      "export.mol": doExportMol,
      "export.sdf": doExportSdf,
      "export.sdfProperties": doExportSdfWithProperties,
      "export.cdxml": doExportCdxml,
      "export.smiles": () => { void doExportSmiles(); },
      "copyAs.svg": () => doCopyAs("svg"),
      "copyAs.png": () => doCopyAs("png"),
      "copyAs.cdxml": () => doCopyAs("cdxml"),
      "copyAs.mol": () => doCopyAs("mol"),
      "copyAs.molV3000": () => doCopyAs("molV3000"),
      "copyAs.smiles": () => doCopyAs("smiles"),
      "copyAs.inchi": () => doCopyAs("inchi"),
      "export.rxn": doExportRxn,
      "export.reactionSmiles": () => { void doExportReactionSmiles(); },
      "share.copyLink": () => { void doCopyShareLink(); },
      "share.open": () => setShareLinkOpen(true),
      "share.copyEmbed": () => { void doCopyEmbedCode(); },
      "share.html": () => doExportHtmlViewer("transparent"),
    };
  });

  useEffect(() => {
    const reactionDisabled = () => !hasExportableReaction(useMoleculeStore.getState().molecule);
    const commands: AppCommand[] = [
      { id: "file.open", titleKey: "tool.import", sectionKey: "palette.section.file", keywords: "open load read", run: () => commandActionsRef.current["file.open"]?.() },
      { id: "file.paste", titleKey: "tool.pasteStructure", sectionKey: "palette.section.file", keywords: "smiles mol cdxml import", run: () => commandActionsRef.current["file.paste"]?.() },
      { id: "file.save", titleKey: "tool.saveProject", sectionKey: "palette.section.file", shortcut: "Ctrl+S", keywords: "project enlacecraft", run: () => commandActionsRef.current["file.save"]?.() },
      { id: "file.saveAs", titleKey: "tool.saveAs", sectionKey: "palette.section.file", shortcut: "Ctrl+Shift+S", keywords: "project enlacecraft", run: () => commandActionsRef.current["file.saveAs"]?.() },
      { id: "reaction.build", titleKey: "tool.buildReaction", sectionKey: "palette.section.reaction", keywords: "reaction scheme name smiles reactant product conditions arrow", run: () => commandActionsRef.current["reaction.build"]?.() },
      { id: "export.png", titleKey: "tool.exportPNG", sectionKey: "palette.section.export", keywords: "image raster", run: () => commandActionsRef.current["export.png"]?.() },
      { id: "export.svg", titleKey: "tool.exportSVG", sectionKey: "palette.section.export", keywords: "vector image", run: () => commandActionsRef.current["export.svg"]?.() },
      { id: "export.pageSetup", titleKey: "tool.pageSetup", sectionKey: "palette.section.export", keywords: "paper size margin orientation bond length", run: () => commandActionsRef.current["export.pageSetup"]?.() },
      { id: "export.pdf", titleKey: "tool.exportPDF", sectionKey: "palette.section.export", keywords: "document publication print", run: () => commandActionsRef.current["export.pdf"]?.() },
      { id: "export.print", titleKey: "tool.exportPrintPDF", sectionKey: "palette.section.export", keywords: "print paper", run: () => commandActionsRef.current["export.print"]?.() },
      { id: "export.mol", titleKey: "tool.exportMOL", sectionKey: "palette.section.export", keywords: "molfile mdl", run: () => commandActionsRef.current["export.mol"]?.() },
      { id: "export.sdf", titleKey: "tool.exportSDF", sectionKey: "palette.section.export", keywords: "sd file records", run: () => commandActionsRef.current["export.sdf"]?.() },
      { id: "export.sdfProperties", titleKey: "tool.exportSDFWithProperties", sectionKey: "palette.section.export", keywords: "descriptors data", run: () => commandActionsRef.current["export.sdfProperties"]?.() },
      { id: "export.cdxml", titleKey: "tool.exportCDXML", sectionKey: "palette.section.export", keywords: "chemdraw xml", run: () => commandActionsRef.current["export.cdxml"]?.() },
      { id: "export.smiles", titleKey: "tool.exportSmiles", sectionKey: "palette.section.export", keywords: "copy text", run: () => commandActionsRef.current["export.smiles"]?.() },
      { id: "copyAs.svg", titleKey: "tool.copyAsSvg", sectionKey: "palette.section.export", keywords: "clipboard vector", run: () => commandActionsRef.current["copyAs.svg"]?.() },
      { id: "copyAs.png", titleKey: "tool.copyAsPng", sectionKey: "palette.section.export", keywords: "clipboard raster image", run: () => commandActionsRef.current["copyAs.png"]?.() },
      { id: "copyAs.cdxml", titleKey: "tool.copyAsCdxml", sectionKey: "palette.section.export", keywords: "clipboard chemdraw", run: () => commandActionsRef.current["copyAs.cdxml"]?.() },
      { id: "copyAs.mol", titleKey: "tool.copyAsMol", sectionKey: "palette.section.export", keywords: "clipboard molfile mdl v2000", run: () => commandActionsRef.current["copyAs.mol"]?.() },
      { id: "copyAs.molV3000", titleKey: "tool.copyAsMolV3000", sectionKey: "palette.section.export", keywords: "clipboard molfile mdl v3000 rdkit", run: () => commandActionsRef.current["copyAs.molV3000"]?.() },
      { id: "copyAs.smiles", titleKey: "tool.copyAsSmiles", sectionKey: "palette.section.export", keywords: "clipboard smiles text", run: () => commandActionsRef.current["copyAs.smiles"]?.() },
      { id: "copyAs.inchi", titleKey: "tool.copyAsInchi", sectionKey: "palette.section.export", keywords: "clipboard inchi identifier", run: () => commandActionsRef.current["copyAs.inchi"]?.() },
      { id: "export.rxn", titleKey: "tool.exportRXN", sectionKey: "palette.section.export", keywords: "reaction scheme", isDisabled: reactionDisabled, run: () => commandActionsRef.current["export.rxn"]?.() },
      { id: "export.reactionSmiles", titleKey: "tool.exportReactionSmiles", sectionKey: "palette.section.export", keywords: "reaction scheme copy", isDisabled: reactionDisabled, run: () => commandActionsRef.current["export.reactionSmiles"]?.() },
      { id: "share.copyLink", titleKey: "tool.copyShareLink", sectionKey: "palette.section.share", keywords: "read only link url", run: () => commandActionsRef.current["share.copyLink"]?.() },
      { id: "share.open", titleKey: "tool.openShareLink", sectionKey: "palette.section.share", keywords: "view shared url", run: () => commandActionsRef.current["share.open"]?.() },
      { id: "share.copyEmbed", titleKey: "tool.copyEmbedCode", sectionKey: "palette.section.share", keywords: "iframe embed", run: () => commandActionsRef.current["share.copyEmbed"]?.() },
      { id: "share.html", titleKey: "tool.exportHtmlViewer", sectionKey: "palette.section.share", keywords: "offline standalone html", run: () => commandActionsRef.current["share.html"]?.() },
    ];
    registerCommandGroup("topbar", commands);
    return () => unregisterCommandGroup("topbar");
  }, []);

  return (
    <header className="topbar">
      <div className="brand" title={`EnlaceCraft v${APP_VERSION}`}>
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
      <MassSpecButton />
      <AromaticityButton />
      <IrSpectrumButton />

      {hasOverValence && (
        <div className="valence-warn-wrap">
          <button
            type="button"
            className="valence-warn valence-warn--button"
            aria-expanded={valenceOpen}
            onClick={() => setValenceOpen((o) => !o)}
          >
            <AlertTriangle size={13} />
            <span>{t("valence.exceeded")}</span>
          </button>
          {valenceOpen && (
            <div className="valence-popover" role="dialog" aria-label={t("valence.popoverTitle")}>
              <div className="valence-popover__title">{t("valence.popoverTitle")}</div>
              {overValentAtomIds(molecule).map((id) => {
                const params = valenceExplainParams(molecule, id);
                const fix = suggestValenceFix(molecule, id);
                return (
                  <div key={id} className="valence-popover__row">
                    <span
                      className="valence-popover__explain"
                      title={t("valence.explain", params)}
                    >
                      <strong>{params.element}</strong>
                      {t("valence.explainShort", params)}
                    </span>
                    {fix !== null ? (
                      <button
                        type="button"
                        className="valence-popover__fix"
                        title={t("valence.fixTitle", params)}
                        onClick={() => {
                          setAtomCharge(id, fix);
                          setValenceOpen(false);
                        }}
                      >
                        {t("valence.fix", { charge: `+${fix}` })}
                      </button>
                    ) : (
                      <span className="valence-popover__nofix" title={t("valence.explain", params)}>
                        {t("valence.noFix")}
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="valence-popover__hint">{t("valence.popoverHint")}</div>
            </div>
          )}
        </div>
      )}

      <div className="top-actions" ref={topActionsRef}>
        <ToolButton title={t("tool.undo")} onClick={undo}>
          <Undo2 size={18} style={{ opacity: canUndo ? 1 : 0.35 }} />
        </ToolButton>
        <ToolButton title={t("tool.redo")} onClick={redo}>
          <Redo2 size={18} style={{ opacity: canRedo ? 1 : 0.35 }} />
        </ToolButton>
        <Divider />
        <ToolButton title={t("tool.import")} onClick={doOpen}>
          <Upload size={18} />
        </ToolButton>
        <ToolButton title={t("tool.pasteStructure")} onClick={() => setPasteOpen(true)}>
          <ClipboardPaste size={18} />
        </ToolButton>
        <ToolButton title={t("tool.buildReaction")} onClick={() => setReactionBuilderOpen(true)}>
          <FlaskConical size={18} />
        </ToolButton>
        <ExportMenu
          onPNG={doExportPNG}
          onSVG={doExportSVG}
          onPageSetup={() => setPageSetupOpen(true)}
          onPDF={doExportPDF}
          onPrint={doExportPrint}
          onMOL={doExportMol}
          onSDF={doExportSdf}
          onSDFWithProperties={doExportSdfWithProperties}
          onRXN={doExportRxn}
          onReactionSmiles={doExportReactionSmiles}
          onCDXML={doExportCdxml}
          onSmiles={doExportSmiles}
          onCopyAs={doCopyAs}
          copyAsDisabled={selectedCount === 0}
          fitExportsToPage={fitExportsToPage}
          onToggleFitExportsToPage={toggleFitExportsToPage}
          onSaveProject={doSaveProject}
          onSaveProjectAs={doSaveProjectAs}
          onCopyShareLink={doCopyShareLink}
          onOpenShareLink={() => setShareLinkOpen(true)}
          onCopyEmbedCode={doCopyEmbedCode}
          onExportHtmlViewer={doExportHtmlViewer}
          reactionExportDisabled={reactionExportDisabled}
          projectFileName={projectFileName}
        />
        <ToolButton title={t("tool.versionHistory")} onClick={onOpenVersionHistory}>
          <History size={18} />
        </ToolButton>
        <MoleculeInfoButton />
        <PropertiesButton />
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
          hasExplicitHydrogens={hasExplicitHydrogens(molecule)}
          onToggleExplicitHydrogens={toggleExplicitHydrogens}
          monochromeAtoms={monochromeAtoms}
          onToggleMonochromeAtoms={toggleMonochromeAtoms}
          showGrid={showGrid}
          onToggleGrid={toggleShowGrid}
          showRulers={showRulers}
          onToggleRulers={toggleShowRulers}
          showCrosshair={showCrosshair}
          onToggleCrosshair={toggleShowCrosshair}
          showPageOutline={showPageOutline}
          onTogglePageOutline={toggleShowPageOutline}
          rulerUnit={rulerUnit}
          onSetRulerUnit={setRulerUnit}
          canvasBackground={canvasBackground}
          onToggleCanvasBackground={toggleCanvasBackground}
        />
        <ToolButton title={t("tool.language")} onClick={toggleLanguage}>
          <Languages size={18} />
        </ToolButton>
        <Divider />
        <ThemePicker />
        <ToolButton title={t("tool.shortcuts")} onClick={onOpenShortcuts}>
          <HelpCircle size={18} />
        </ToolButton>
        <ClearDrawingButton />
        <DesktopDownloadButton />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mol,.sdf,.cdxml,.smi,.smiles,.svg,.enlacecraft"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && doImportFile(e.target.files[0])}
      />

      {/* Mounted only while open — the dialog's text/error state then
          initializes fresh each time, no reset-on-open effect needed. */}
      {pasteOpen && <PasteStructureDialog onClose={() => setPasteOpen(false)} />}
      {reactionBuilderOpen && (
        <ReactionBuilderDialog onClose={() => setReactionBuilderOpen(false)} />
      )}
      {shareLinkOpen && (
        <OpenShareLinkDialog onClose={() => setShareLinkOpen(false)} onOpen={doOpenShareLink} />
      )}
      {pageSetupOpen && <PageSetupDialog onClose={() => setPageSetupOpen(false)} />}
    </header>
  );
}

