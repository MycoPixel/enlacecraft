import { useEffect, useRef } from "react";
import { useMoleculeStore, effectiveCanvasBackground } from "./store/useMoleculeStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useClipboard } from "./hooks/useClipboard";
import { useIsMobile } from "./hooks/useIsMobile";
import { TopBar } from "./components/TopBar/TopBar";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { MoleculeCanvas } from "./components/Canvas/MoleculeCanvas";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { MobileToolbar } from "./components/MobileToolbar/MobileToolbar";

export default function App() {
  const theme = useMoleculeStore((s) => s.theme);
  const canvasBackground = useMoleculeStore((s) => s.canvasBackground);
  const language = useMoleculeStore((s) => s.language);
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);

  useKeyboardShortcuts();
  useClipboard(svgRef);

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
    // that hasn't been saved via "Save project" yet (see hasUnsavedChanges's
    // doc comment in the store for exactly what counts as dirty). Reads the
    // latest state at fire-time via getState() rather than depending on a
    // stale `hasUnsavedChanges` closure value, so this only needs to be
    // registered once.
    const handler = (e: BeforeUnloadEvent) => {
      if (!useMoleculeStore.getState().hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = ""; // Chrome requires returnValue to be set to show the native prompt
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return (
    <div className="app">
      <TopBar svgRef={svgRef} />
      <div className="body">
        {!isMobile && <Sidebar />}
        <main className="canvas-wrap">
          <MoleculeCanvas ref={svgRef} />
          <StatusBar />
        </main>
      </div>
      {isMobile && <MobileToolbar />}
    </div>
  );
}
