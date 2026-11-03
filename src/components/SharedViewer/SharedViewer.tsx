import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { MoleculeCanvas } from "../Canvas/MoleculeCanvas";
import { useMoleculeStore } from "../../store/useMoleculeStore";
import { useT } from "../../i18n/useT";
import { decodeShareProject, ShareLinkError } from "../../io/shareLink";
import { exportProject, type ProjectFile } from "../../io/project";
import { downloadBlob } from "../../io/exportImage";

interface SharedViewerProps {
  token: string;
}

function projectFileName(project: ProjectFile): string {
  const title = project.tabs[0]?.title ?? "";
  const safe = title.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return `${safe || "shared-drawing"}.enlacecraft`;
}

function failureKey(err: unknown): "generic" | "unsupported" | "too-large" {
  if (!(err instanceof ShareLinkError)) return "generic";
  if (err.code === "unsupported") return "unsupported";
  if (err.code === "too-large") return "too-large";
  return "generic";
}

/**
 * The page a `#view=` link opens.
 *
 * It deliberately does not mount the editor: no TopBar, Sidebar, keyboard
 * shortcuts, context menu or autosave. The canvas itself is inert (CSS
 * pointer-events:none) and the surrounding stage owns the only interaction,
 * wheel/drag pan and zoom. That keeps a shared drawing genuinely read-only
 * without sprinkling `if (readOnly)` guards through every editing action.
 *
 * `?embed=1` drops the header and controls, for use in an iframe.
 */
export function SharedViewer({ token }: SharedViewerProps) {
  const t = useT();
  const embedded = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).has("embed");
    } catch {
      return false;
    }
  }, []);

  const [project, setProject] = useState<ProjectFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [failureDetail, setFailureDetail] = useState<"generic" | "unsupported" | "too-large">("generic");
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const fittedRef = useRef(false);

  const setView = useMoleculeStore((s) => s.setView);
  const resetView = useMoleculeStore((s) => s.resetView);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const decoded = await decodeShareProject(token);
        if (cancelled) return;
        useMoleculeStore.getState().loadProject(decoded);
        setProject(decoded);
        document.title = `${decoded.tabs[0]?.title || "EnlaceCraft"} — EnlaceCraft`;
      } catch (err) {
        console.warn("Could not open shared drawing", err);
        if (!cancelled) {
          setFailureDetail(failureKey(err));
          setFailed(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Fit the drawing once the canvas has laid out. `resetView` needs the real
  // viewport size, so this waits a frame after the canvas mounts.
  useEffect(() => {
    if (!project || fittedRef.current) return;
    const raf = requestAnimationFrame(() => {
      if (fittedRef.current) return;
      fittedRef.current = true;
      resetView();
    });
    return () => cancelAnimationFrame(raf);
  }, [project, resetView]);

  const zoomAtCenter = (factor: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const mx = (rect?.width ?? 0) / 2;
    const my = (rect?.height ?? 0) / 2;
    setView((v) => {
      const scale = Math.min(8, Math.max(0.1, v.scale * factor));
      return {
        scale,
        tx: mx - ((mx - v.tx) / v.scale) * scale,
        ty: my - ((my - v.ty) / v.scale) * scale,
      };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomAtCenter(e.deltaY < 0 ? 1.12 : 0.89);
  };

  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const view = useMoleculeStore.getState().view;
    panRef.current = { startX: e.clientX, startY: e.clientY, tx: view.tx, ty: view.ty };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    setView((v) => ({ ...v, tx: pan.tx + (e.clientX - pan.startX), ty: pan.ty + (e.clientY - pan.startY) }));
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const downloadProject = () => {
    if (!project) return;
    downloadBlob(
      new Blob([exportProject(project)], { type: "application/json" }),
      projectFileName(project),
    );
  };

  const openApp = () => {
    window.location.hash = "";
    window.location.reload();
  };

  if (failed) {
    const failureMessageKey =
      failureDetail === "unsupported"
        ? "sharedView.errorUnsupported"
        : failureDetail === "too-large"
        ? "sharedView.errorTooLarge"
        : "sharedView.errorBody";
    return (
      <div className="shared-viewer shared-viewer--message">
        <div className="shared-message">
          <h1>{t("sharedView.errorTitle")}</h1>
          <p>{t(failureMessageKey)}</p>
          <button type="button" className="shared-button" onClick={openApp}>
            {t("sharedView.openApp")}
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="shared-viewer shared-viewer--message">
        <p className="shared-loading">{t("sharedView.loading")}</p>
      </div>
    );
  }

  const title = project.tabs[0]?.title || "EnlaceCraft";

  return (
    <div className={`shared-viewer ${embedded ? "shared-viewer--embed" : ""}`}>
      {!embedded && (
        <header className="shared-header">
          <div className="shared-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 3h6M10 3v5.5L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 8.5V3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="9" cy="15" r="1.1" fill="currentColor" />
              <circle cx="13" cy="17.5" r="0.9" fill="currentColor" />
            </svg>
            <span>EnlaceCraft</span>
          </div>
          <div className="shared-title" title={title}>{title}</div>
          <span className="shared-badge">{t("sharedView.readOnly")}</span>
          <div className="shared-actions">
            <button type="button" className="shared-button" onClick={downloadProject}>
              {t("sharedView.downloadProject")}
            </button>
          </div>
        </header>
      )}
      <div
        ref={stageRef}
        className={`shared-stage ${panning ? "shared-stage--panning" : ""}`}
        onWheel={onWheel}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={() => resetView()}
      >
        <MoleculeCanvas ref={svgRef} />
        {!embedded && (
          <div className="shared-controls">
            <button type="button" className="shared-control" title={t("sharedView.zoomIn")} aria-label={t("sharedView.zoomIn")} onClick={() => zoomAtCenter(1.2)}>
              <ZoomIn size={16} />
            </button>
            <button type="button" className="shared-control" title={t("sharedView.zoomOut")} aria-label={t("sharedView.zoomOut")} onClick={() => zoomAtCenter(0.83)}>
              <ZoomOut size={16} />
            </button>
            <button type="button" className="shared-control" title={t("sharedView.fit")} aria-label={t("sharedView.fit")} onClick={() => resetView()}>
              <Maximize size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
