import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useMoleculeStore, effectiveCanvasBackground } from "./store/useMoleculeStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useClipboard } from "./hooks/useClipboard";
import { useIsMobile } from "./hooks/useIsMobile";
import { useAutosave } from "./hooks/useAutosave";
import { TopBar } from "./components/TopBar/TopBar";
import { TabBar } from "./components/TabBar/TabBar";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { MoleculeCanvas } from "./components/Canvas/MoleculeCanvas";
import { LiveIupacPanel } from "./components/Canvas/LiveIupacPanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { MobileToolbar } from "./components/MobileToolbar/MobileToolbar";
import { ShortcutsOverlay } from "./components/common/ShortcutsOverlay";
import { OnboardingOverlay } from "./components/common/OnboardingOverlay";
import { ContextMenu } from "./components/ContextMenu/ContextMenu";

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
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
  const { copySelection, pasteFromClipboard } = useClipboard(svgRef);
  useAutosave();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-canvas-bg", effectiveCanvasBackground(theme, canvasBackground));
  }, [theme, canvasBackground]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);

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

  return (
    <div className="app">
      <TopBar svgRef={svgRef} onOpenShortcuts={() => setShortcutsOpen(true)} />
      <TabBar />
      <div className="body">
        {!isMobile && <Sidebar />}
        <main className="canvas-wrap">
          <MoleculeCanvas ref={svgRef} />
          <LiveIupacPanel />
          <StatusBar />
        </main>
        {show3DView && !isMobile && (
          <div className="molecule-3d-dock" style={{ width: panel3DWidth }}>
            <div
              className="molecule-3d-dock-resize-handle"
              onPointerDown={onPanelResizePointerDown}
              onPointerMove={onPanelResizePointerMove}
              onPointerUp={onPanelResizePointerUp}
              onPointerCancel={onPanelResizePointerUp}
            />
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
      <OnboardingOverlay
        open={onboardingOpen}
        onClose={() => { setOnboardingOpen(false); markOnboardingSeen(); }}
      />
      <ContextMenu copySelection={copySelection} pasteFromClipboard={pasteFromClipboard} />
    </div>
  );
}
