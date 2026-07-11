import { useEffect, useRef } from "react";
import { useMoleculeStore } from "./store/useMoleculeStore";
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
    document.documentElement.setAttribute("data-canvas-bg", canvasBackground);
  }, [canvasBackground]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);

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
