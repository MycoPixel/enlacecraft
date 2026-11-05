import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useMoleculeStore } from "./store/useMoleculeStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useKeyboardDrawing } from "./hooks/useKeyboardDrawing";
import { useClipboard } from "./hooks/useClipboard";
import { useIsMobile } from "./hooks/useIsMobile";
import { useAutosave } from "./hooks/useAutosave";
import { useVersionHistory } from "./hooks/useVersionHistory";
import { useFileImport } from "./hooks/useFileImport";
import { LIMITS } from "./io/validate";
import { useT } from "./i18n/useT";
import { TopBar } from "./components/TopBar/TopBar";
import { TabBar } from "./components/TabBar/TabBar";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { MoleculeCanvas } from "./components/Canvas/MoleculeCanvas";
import { Rulers } from "./components/Canvas/Rulers";
import { LiveIupacPanel } from "./components/Canvas/LiveIupacPanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { MobileToolbar } from "./components/MobileToolbar/MobileToolbar";
import { ShortcutsOverlay } from "./components/common/ShortcutsOverlay";
import { CommandPalette } from "./components/common/CommandPalette";
import { VersionHistoryPanel } from "./components/TopBar/VersionHistoryPanel";
import { OnboardingOverlay } from "./components/common/OnboardingOverlay";
import { ContextMenu } from "./components/ContextMenu/ContextMenu";
import { registerCommandGroup, unregisterCommandGroup, type AppCommand } from "./commands/commands";
import { useStructureDescription } from "./hooks/useStructureDescription";

// Lazy: pulls in 3Dmol.js + OpenChemLib (a few MB combined), which most
// sketching sessions never need — see vite.config.ts's manualChunks for
// how this stays a separate, non-precached chunk. Suspense's fallback is
// null (rather than a spinner) since the panel itself already shows a
// "loading" overlay state right after mount, so there's nothing useful
// to say in the brief moment before that.
const Molecule3DView = lazy(() =>
  import("./components/Molecule3D/Molecule3DView").then((m) => ({ default: m.Molecule3DView }))
);

export default function App() {
  const theme = useMoleculeStore((s) => s.theme);
  const canvasBackground = useMoleculeStore((s) => s.canvasBackground);
  const language = useMoleculeStore((s) => s.language);
  const hasSeenOnboarding = useMoleculeStore((s) => s.hasSeenOnboarding);
  const markOnboardingSeen = useMoleculeStore((s) => s.markOnboardingSeen);
  const setStatus = useMoleculeStore((s) => s.setStatus);
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const t = useT();
  const structureDescription = useStructureDescription();
  const keyboardDrawing = useMoleculeStore((s) => s.keyboardDrawing);
  const keyboardWasOn = useRef(keyboardDrawing);
  const storeAnnouncement = useMoleculeStore((s) => s.announcement);
  // Screen-reader announcements trail the edits instead of narrating every
  // intermediate atom of a fast drag. The SVG's own aria-label is immediate.
  // The same polite slot also reports entering/leaving keyboard drawing; the
  // latest message wins rather than concatenating stale ones.
  const [announcement, setAnnouncement] = useState("");
  const importFileContent = useFileImport();
  // Tracks nesting depth of dragenter/dragleave rather than a plain
  // boolean: the drop target is the whole app, which has many child
  // elements, and the browser fires a dragleave for every child boundary
  // crossed (not just when the pointer actually leaves the window) — a
  // boolean flips off mid-drag every time that happens. Counting
  // enter/leave pairs and only clearing the overlay at 0 is the standard
  // fix for that.
  const [dragDepth, setDragDepth] = useState(0);
  const show3DView = useMoleculeStore((s) => s.show3DView);
  const toggle3DView = useMoleculeStore((s) => s.toggle3DView);
  // Local, session-only width for the 3D panel — deliberately not in the
  // global store (unlike sidebarWidth) since there's no cross-session
  // persistence need for a panel that itself starts closed every launch.
  const [panel3DWidth, setPanel3DWidth] = useState(360);
  const panelResizeDrag = useRef<{ startX: number; startWidth: number } | null>(null);
  const onPanelResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    panelResizeDrag.current = { startX: e.clientX, startWidth: panel3DWidth };
  };
  const onPanelResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panelResizeDrag.current) return;
    // Dragging the handle grows/shrinks the panel from its left edge, so
    // moving the pointer left (negative dx) should widen it — the mirror
    // image of the sidebar's own resize handle on the opposite side of
    // the screen.
    const dx = e.clientX - panelResizeDrag.current.startX;
    const next = panelResizeDrag.current.startWidth - dx;
    setPanel3DWidth(Math.min(720, Math.max(260, Math.round(next))));
  };
  const onPanelResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    panelResizeDrag.current = null;
    if ((e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
  };
  // Seeded once from the persisted flag (see hasSeenOnboarding in the
  // store) so a first-time visitor sees it automatically; afterward this
  // is just local UI state, reopened on demand from the shortcuts overlay
  // regardless of the (by-then-permanently-true) persisted flag.
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasSeenOnboarding);

  useKeyboardShortcuts();
  useKeyboardDrawing(svgRef);
  const { copySelection, pasteFromClipboard } = useClipboard(svgRef);
  useAutosave();
  useVersionHistory(svgRef);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncement(structureDescription), 600);
    return () => window.clearTimeout(timer);
  }, [structureDescription]);

  // Announce entering/leaving keyboard drawing. The initial "off" state is
  // not worth reading on every page load, so only actual changes announce.
  useEffect(() => {
    if (keyboardDrawing === keyboardWasOn.current) return;
    keyboardWasOn.current = keyboardDrawing;
    setAnnouncement(t(keyboardDrawing ? "status.keyboardOn" : "status.keyboardOff"));
  }, [keyboardDrawing, t]);

  // Actions that don't change the structure description (grouping,
  // restacking) push a message through the store; the same polite slot
  // reports it so it doesn't go unannounced. `seq` makes two identical
  // actions in a row still re-announce.
  useEffect(() => {
    if (!storeAnnouncement) return;
    setAnnouncement(t(storeAnnouncement.key, storeAnnouncement.params));
  }, [storeAnnouncement, t]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    // The stored preference is applied as-is in every theme: the canvas
    // re-resolves its ink colors for a white background (see the rule in
    // styles/theme.css), so a dark theme no longer has to force its own
    // canvas here the way it used to.
    document.documentElement.setAttribute("data-canvas-bg", canvasBackground);
  }, [canvasBackground]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);

  // Drag-and-drop file import (.mol/.sdf/.cdxml/.enlacecraft) onto the app
  // window — works the same in the web build and the desktop build alike,
  // since it's a plain browser API rather than anything Electron-specific
  // (unlike the native Open/Save dialogs in TopBar.tsx, which only exist
  // in the desktop build). preventDefault() on dragOver is required for
  // drop to fire at all; without it (and without one on drop itself) the
  // browser's/Electron's default behavior is to navigate the window to
  // the dropped file instead.
  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragDepth(0);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    if (files.length > 1) setStatus(t("status.droppedMultipleFiles"));
    const file = files[0];
    if (file.size > LIMITS.maxFileChars) {
      setStatus(t("status.fileTooLarge", { name: file.name }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => importFileContent(file.name, String(reader.result));
    reader.readAsText(file);
  };

  useEffect(() => {
    // Warns before closing/reloading/navigating away if there's anything
    // that hasn't been saved via "Save project" yet in ANY tab (see
    // hasUnsavedChanges's doc comment in the store for exactly what counts
    // as dirty, and why it alone isn't enough here — an inactive tab with
    // its own unsaved edits wouldn't otherwise be caught). Reads the latest
    // state at fire-time via getState() rather than depending on a stale
    // closure value, so this only needs to be registered once.
    const handler = (e: BeforeUnloadEvent) => {
      const s = useMoleculeStore.getState();
      const anyUnsaved = s.hasUnsavedChanges || Object.values(s.tabDocuments).some((doc) => doc.hasUnsavedChanges);
      if (!anyUnsaved) return;
      e.preventDefault();
      e.returnValue = ""; // Chrome requires returnValue to be set to show the native prompt
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Commands owned by the editor shell. Export/share/save commands register
  // themselves from TopBar, where their implementations already live.
  useEffect(() => {
    const store = () => useMoleculeStore.getState();
    const zoomBy = (factor: number) => {
      const s = store();
      const { view, canvasSize } = s;
      const mx = canvasSize.width / 2;
      const my = canvasSize.height / 2;
      const scale = Math.min(8, Math.max(0.1, view.scale * factor));
      s.setView({
        scale,
        tx: mx - ((mx - view.tx) / view.scale) * scale,
        ty: my - ((my - view.ty) / view.scale) * scale,
      });
    };

    const tool = (id: string, toolId: Parameters<ReturnType<typeof store>["setTool"]>[0], keywords = ""): AppCommand => ({
      id,
      titleKey: id,
      sectionKey: "palette.section.tools",
      keywords,
      run: () => store().setTool(toolId),
    });

    const commands: AppCommand[] = [
      { ...tool("tool.select", "select", "move pointer"), shortcut: "V" },
      { ...tool("tool.lasso", "lasso", "freeform selection"), shortcut: "Q" },
      tool("tool.pan", "pan", "hand drag"),
      tool("tool.erase", "erase", "delete remove"),
      { ...tool("tool.bondSingle", "bond-1", "single bond"), shortcut: "B / 1" },
      { ...tool("tool.bondDouble", "bond-2", "double bond"), shortcut: "2" },
      { ...tool("tool.bondTriple", "bond-3", "triple bond"), shortcut: "3" },
      { ...tool("tool.wedge", "wedge", "stereo front"), shortcut: "W" },
      tool("tool.hollowWedge", "hollow-wedge", "stereo outline"),
      tool("tool.dash", "dash", "stereo back hash"),
      tool("tool.wavy", "wavy", "unknown stereo"),
      tool("tool.bold", "bold", "emphasis"),
      tool("tool.boldHash", "bold-hash", "hashed wedge"),
      tool("tool.dashed", "dashed", "partial bond hydrogen bond"),
      tool("tool.dative", "dative", "donor metal arrow"),
      tool("tool.atom", "atom", "element place"),
      { ...tool("tool.chain", "chain", "zig zag carbon"), shortcut: "C" },
      { ...tool("tool.ring", "ring", "cycle template"), shortcut: "R" },
      tool("tool.functionalGroup", "functional-group", "group"),
      tool("tool.chargePlus", "charge-plus", "positive cation"),
      tool("tool.chargeMinus", "charge-minus", "negative anion"),
      tool("tool.lonePair", "lone-pair", "electron pair"),
      tool("tool.radical", "radical", "electron"),
      tool("tool.stereoLabel", "stereo-label", "r s chirality"),
      tool("tool.mapNumber", "map-number", "reaction mapping"),
      { ...tool("tool.text", "text", "label caption"), shortcut: "T" },
      { ...tool("tool.arrow", "arrow", "reaction mechanism"), shortcut: "A" },
      { ...tool("tool.bracket", "bracket", "parenthesis group"), shortcut: "K" },
      tool("tool.shape", "shape", "rectangle ellipse line"),
      tool("tool.orbital", "orbital", "s p lobe"),
      tool("tool.tlc", "tlc", "chromatography plate"),
      { ...tool("tool.cycle", "cycle", "catalytic cycle ring intermediates"), shortcut: "Y" },
      { ...tool("tool.plus", "plus", "reaction plus"), shortcut: "+" },

      {
        id: "edit.undo",
        titleKey: "tool.undo",
        sectionKey: "palette.section.edit",
        shortcut: "Ctrl+Z",
        keywords: "history back",
        run: () => store().undo(),
      },
      {
        id: "edit.redo",
        titleKey: "tool.redo",
        sectionKey: "palette.section.edit",
        shortcut: "Ctrl+Y",
        keywords: "history forward",
        run: () => store().redo(),
      },
      {
        id: "edit.selectAll",
        titleKey: "shortcuts.selectAll",
        sectionKey: "palette.section.edit",
        shortcut: "Ctrl+A",
        keywords: "everything",
        run: () => store().selectAll(),
      },
      {
        id: "edit.duplicate",
        titleKey: "shortcuts.duplicate",
        sectionKey: "palette.section.edit",
        shortcut: "Ctrl+D",
        keywords: "copy clone",
        run: () => store().duplicateSelection(),
      },
      {
        id: "edit.delete",
        titleKey: "shortcuts.delete",
        sectionKey: "palette.section.edit",
        shortcut: "Delete",
        keywords: "remove erase",
        run: () => store().deleteSelection(),
      },
      {
        id: "edit.keyboardDrawing",
        titleKey: "shortcuts.keyboardDrawing",
        sectionKey: "palette.section.edit",
        shortcut: "Ctrl+Shift+K",
        keywords: "keyboard accessible a11y cursor place atom bond arrow keys",
        run: () => store().setKeyboardDrawing(!store().keyboardDrawing),
      },
      {
        id: "edit.cleanUp",
        titleKey: "tool.cleanUp",
        sectionKey: "palette.section.edit",
        keywords: "tidy geometry bond length angle",
        run: () => store().cleanUpSelection(),
      },
      {
        id: "edit.separate",
        titleKey: "tool.separateOverlapping",
        sectionKey: "palette.section.edit",
        keywords: "layout overlap fragments",
        run: () => store().separateOverlappingStructures(),
      },
      {
        id: "edit.rotateLeft",
        titleKey: "tool.rotateCCW",
        sectionKey: "palette.section.edit",
        shortcut: "[",
        run: () => store().rotateSelection(-30),
      },
      {
        id: "edit.rotateRight",
        titleKey: "tool.rotateCW",
        sectionKey: "palette.section.edit",
        shortcut: "]",
        run: () => store().rotateSelection(30),
      },
      {
        id: "edit.flipHorizontal",
        titleKey: "tool.flipHorizontal",
        sectionKey: "palette.section.edit",
        run: () => store().mirrorSelection("horizontal"),
      },
      {
        id: "edit.flipVertical",
        titleKey: "tool.flipVertical",
        sectionKey: "palette.section.edit",
        run: () => store().mirrorSelection("vertical"),
      },
      {
        id: "reaction.create",
        titleKey: "tool.createReactionScheme",
        sectionKey: "palette.section.reaction",
        keywords: "scheme reactants products group arrow",
        isDisabled: () => {
          const s = store();
          return s.selected.size === 0 || s.selectedAnnotationIds.size === 0;
        },
        run: () => { store().createSchemeFromSelection(); },
      },
      {
        id: "reaction.clean",
        titleKey: "tool.cleanReaction",
        sectionKey: "palette.section.reaction",
        shortcut: "Ctrl+Shift+X",
        keywords: "tidy align arrow row layout",
        isDisabled: () => (store().molecule.schemes?.length ?? 0) === 0,
        run: () => { store().cleanReaction(); },
      },
      {
        id: "reaction.cleanAugmented",
        titleKey: "tool.cleanReactionAugmented",
        sectionKey: "palette.section.reaction",
        keywords: "tidy align rotate map products",
        isDisabled: () => (store().molecule.schemes?.length ?? 0) === 0,
        run: () => { store().cleanReaction(undefined, { augmented: true }); },
      },
      {
        id: "reaction.map",
        titleKey: "tool.mapReaction",
        sectionKey: "palette.section.reaction",
        shortcut: "Ctrl+Shift+M",
        keywords: "atom map number correspondence",
        isDisabled: () => (store().molecule.schemes?.length ?? 0) === 0,
        run: () => { store().mapReactionAtoms(); },
      },
      {
        id: "reaction.clearMap",
        titleKey: "tool.clearReactionMap",
        sectionKey: "palette.section.reaction",
        keywords: "atom map remove number",
        isDisabled: () => (store().molecule.schemes?.length ?? 0) === 0,
        run: () => { store().clearReactionMap(); },
      },
      {
        id: "reaction.interpret",
        titleKey: "tool.showReactionInterpretation",
        sectionKey: "palette.section.reaction",
        keywords: "reactant product condition roles overlay",
        isDisabled: () => (store().molecule.schemes?.length ?? 0) === 0,
        run: () => store().toggleReactionInterpretation(),
      },

      {
        id: "cycle.create",
        titleKey: "tool.createCycle",
        sectionKey: "palette.section.cycle",
        keywords: "ring intermediates catalytic live",
        isDisabled: () => store().selected.size === 0,
        run: () => { store().addCatalyticCycle(); },
      },
      {
        id: "cycle.addNode",
        titleKey: "tool.addCycleNode",
        sectionKey: "palette.section.cycle",
        keywords: "intermediate add structure",
        isDisabled: () => {
          const s = store();
          return (s.molecule.cycles?.length ?? 0) === 0 || s.selected.size === 0;
        },
        run: () => {
          const s = store();
          const id = s.selectedCycleId ?? s.molecule.cycles?.[0]?.id;
          if (id) s.addCycleNode(id);
        },
      },
      {
        id: "cycle.remove",
        titleKey: "tool.removeCycle",
        sectionKey: "palette.section.cycle",
        keywords: "delete ring figure",
        isDisabled: () => (store().molecule.cycles?.length ?? 0) === 0,
        run: () => {
          const s = store();
          const id = s.selectedCycleId ?? s.molecule.cycles?.[0]?.id;
          if (id) s.removeCatalyticCycle(id);
        },
      },
      {
        id: "cycle.flip",
        titleKey: "tool.flipCycleDirection",
        sectionKey: "palette.section.cycle",
        keywords: "clockwise anticlockwise reverse",
        isDisabled: () => (store().molecule.cycles?.length ?? 0) === 0,
        run: () => {
          const s = store();
          const id = s.selectedCycleId ?? s.molecule.cycles?.[0]?.id;
          if (id) s.setCycleDirection(id);
        },
      },
      {
        id: "cycle.reagentIn",
        titleKey: "tool.cycleReagentIn",
        sectionKey: "palette.section.cycle",
        keywords: "substrate enter arrow",
        isDisabled: () => (store().molecule.cycles?.length ?? 0) === 0,
        run: () => {
          const s = store();
          const id = s.selectedCycleId ?? s.molecule.cycles?.[0]?.id;
          if (id) s.addCycleSide(id, "in");
        },
      },
      {
        id: "cycle.productOut",
        titleKey: "tool.cycleProductOut",
        sectionKey: "palette.section.cycle",
        keywords: "leave arrow product",
        isDisabled: () => (store().molecule.cycles?.length ?? 0) === 0,
        run: () => {
          const s = store();
          const id = s.selectedCycleId ?? s.molecule.cycles?.[0]?.id;
          if (id) s.addCycleSide(id, "out");
        },
      },

      {
        id: "view.zoomIn",
        titleKey: "tool.zoomIn",
        sectionKey: "palette.section.view",
        keywords: "bigger magnify",
        run: () => zoomBy(1.2),
      },
      {
        id: "view.zoomOut",
        titleKey: "tool.zoomOut",
        sectionKey: "palette.section.view",
        keywords: "smaller shrink",
        run: () => zoomBy(1 / 1.2),
      },
      {
        id: "view.reset",
        titleKey: "tool.resetView",
        sectionKey: "palette.section.view",
        keywords: "fit center home",
        run: () => store().resetView(),
      },
      {
        id: "view.grid",
        titleKey: "tool.gridOn",
        sectionKey: "palette.section.view",
        keywords: "snap grid toggle",
        run: () => store().toggleShowGrid(),
      },
      {
        id: "view.hydrogens",
        titleKey: "tool.showHydrogens",
        sectionKey: "palette.section.view",
        keywords: "h toggle",
        run: () => store().toggleShowHydrogens(),
      },
      {
        id: "view.explicitHydrogens",
        titleKey: "tool.showExpandedFormula",
        sectionKey: "palette.section.view",
        keywords: "expand add real hydrogens",
        run: () => store().toggleExplicitHydrogens(),
      },
      {
        id: "view.monochrome",
        titleKey: "tool.monochromeOn",
        sectionKey: "palette.section.view",
        keywords: "black white atoms color",
        run: () => store().toggleMonochromeAtoms(),
      },
      {
        id: "view.canvasBackground",
        titleKey: "tool.viewOptionsCanvasBg",
        sectionKey: "palette.section.view",
        keywords: "white background theme",
        run: () => store().toggleCanvasBackground(),
      },
      {
        id: "view.language",
        titleKey: "tool.language",
        sectionKey: "palette.section.view",
        keywords: "spanish english idioma",
        run: () => store().toggleLanguage(),
      },
      {
        id: "view.3d",
        titleKey: "tool.view3d",
        sectionKey: "palette.section.view",
        keywords: "three dimension structure",
        run: () => store().toggle3DView(),
      },
      {
        id: "edit.group",
        titleKey: "tool.group",
        sectionKey: "palette.section.edit",
        shortcut: "Ctrl+G",
        keywords: "group selection combine",
        run: () => store().groupSelection(),
      },
      {
        id: "edit.ungroup",
        titleKey: "tool.ungroup",
        sectionKey: "palette.section.edit",
        shortcut: "Ctrl+Shift+G",
        keywords: "ungroup split",
        run: () => store().ungroupSelection(),
      },
      {
        id: "edit.bringToFront",
        titleKey: "tool.bringToFront",
        sectionKey: "palette.section.edit",
        keywords: "z order restack layer",
        run: () => store().bringToFront(),
      },
      {
        id: "edit.sendToBack",
        titleKey: "tool.sendToBack",
        sectionKey: "palette.section.edit",
        keywords: "z order restack layer",
        run: () => store().sendToBack(),
      },
      {
        id: "edit.bringForward",
        titleKey: "tool.bringForward",
        sectionKey: "palette.section.edit",
        keywords: "z order restack layer",
        run: () => store().bringForward(),
      },
      {
        id: "edit.sendBackward",
        titleKey: "tool.sendBackward",
        sectionKey: "palette.section.edit",
        keywords: "z order restack layer",
        run: () => store().sendBackward(),
      },
      {
        id: "file.newTab",
        titleKey: "tab.add",
        sectionKey: "palette.section.file",
        keywords: "document",
        run: () => store().addTab(),
      },
    ];

    registerCommandGroup("app", commands);
    return () => unregisterCommandGroup("app");
  }, []);

  return (
    <div className="app" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <TopBar svgRef={svgRef} onOpenShortcuts={() => setShortcutsOpen(true)} onOpenVersionHistory={() => setVersionHistoryOpen(true)} />
      <TabBar />
      <div className="body">
        {!isMobile && <Sidebar />}
        <main className="canvas-wrap">
          <MoleculeCanvas ref={svgRef} />
          <Rulers />
          <LiveIupacPanel />
          <StatusBar />
        </main>
        {show3DView && (
          <div
            className={isMobile ? "molecule-3d-dock molecule-3d-dock--mobile" : "molecule-3d-dock"}
            style={isMobile ? undefined : { width: panel3DWidth }}
          >
            {!isMobile && (
              <div
                className="molecule-3d-dock-resize-handle"
                onPointerDown={onPanelResizePointerDown}
                onPointerMove={onPanelResizePointerMove}
                onPointerUp={onPanelResizePointerUp}
                onPointerCancel={onPanelResizePointerUp}
              />
            )}
            <Suspense fallback={null}>
              <Molecule3DView onClose={toggle3DView} />
            </Suspense>
          </div>
        )}
      </div>
      {isMobile && <MobileToolbar />}
      <ShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        onReplayOnboarding={() => setOnboardingOpen(true)}
      />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <VersionHistoryPanel open={versionHistoryOpen} onClose={() => setVersionHistoryOpen(false)} svgRef={svgRef} />
      <OnboardingOverlay
        open={onboardingOpen}
        onClose={() => { setOnboardingOpen(false); markOnboardingSeen(); }}
      />
      <ContextMenu copySelection={copySelection} pasteFromClipboard={pasteFromClipboard} />
      {dragDepth > 0 && (
        <div className="drop-overlay">
          <div className="drop-overlay__box">{t("dragDrop.hint")}</div>
        </div>
      )}
    </div>
  );
}
