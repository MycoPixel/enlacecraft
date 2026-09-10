import { useEffect, useRef } from "react";
import { useMoleculeStore } from "../store/useMoleculeStore";
import { saveCheckpoint, CHECKPOINT_INTERVAL_MS } from "../io/versionHistory";
import { hasAnyContent } from "../io/autosave";
import { exportProject, type ProjectTab } from "../io/project";
import { exportPNGBlob } from "../io/exportImage";

/** Deliberately much smaller than exportPNG's default (8) — a checkpoint
 * thumbnail is a small list-item preview, not something anyone zooms into,
 * so there's no reason to spend the bytes a full-resolution export would. */
const THUMBNAIL_PIXELS_PER_UNIT = 2;
/** A tighter ceiling than exportPNG's own MAX_RASTER_DIMENSION (8000) —
 * without this, a very spread-out multi-tab reaction scheme would still
 * produce a needlessly large thumbnail image. */
const THUMBNAIL_MAX_DIMENSION = 320;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Rasterizes a thumbnail from the live canvas and saves a checkpoint —
 * unconditionally, unlike useVersionHistory's own periodic/hide-triggered
 * calls, which gate this behind "has anything changed since the last one".
 * Exported standalone (not just used internally below) so
 * VersionHistoryPanel.tsx can call it too, for exactly one deliberate,
 * ungated case: capturing whatever's on screen right before a restore
 * overwrites it, so restoring — like everything else destructive in this
 * app — has a way back.
 */
export async function captureCheckpointNow(svg: SVGSVGElement, data: { activeTabId: string; tabs: ProjectTab[] }): Promise<void> {
  const blob = await exportPNGBlob(svg, "#ffffff", THUMBNAIL_PIXELS_PER_UNIT, THUMBNAIL_MAX_DIMENSION);
  const thumbnail = blob ? await blobToDataUrl(blob) : "";
  await saveCheckpoint(data, thumbnail);
}

/**
 * Periodically records a timestamped, restorable checkpoint of the whole
 * session — a separate, coarser-grained layer on top of useAutosave's
 * single-slot crash-recovery snapshot (this hook runs alongside that one,
 * unchanged; see io/versionHistory.ts's doc comment for the storage design
 * and io/localDb.ts for why they share one database connection).
 *
 * Takes a checkpoint in two situations, both gated on "has anything
 * actually changed since the last checkpoint" (a plain string compare
 * against the last exported project JSON — cheap, and avoids the history
 * filling up with near-duplicate entries):
 *  1. At most once every CHECKPOINT_INTERVAL_MS, while the app is open.
 *  2. Whenever the tab/window is hidden (switched away from, minimized, or
 *     about to close). Deliberately `visibilitychange`'s "hidden" state
 *     rather than `beforeunload` — the latter can't reliably complete async
 *     work (an IndexedDB write) before the page actually unloads, is
 *     unsupported in some mobile/backgrounding scenarios, and blocks the
 *     back/forward cache; `visibilitychange` fires earlier and doesn't have
 *     any of those problems. App.tsx's own beforeunload listener (the
 *     "unsaved changes" warning) is a separate, unrelated concern and isn't
 *     touched by this.
 */
export function useVersionHistory(svgRef: React.RefObject<SVGSVGElement | null>) {
  const lastCheckpointedJson = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const takeCheckpointIfChanged = async () => {
      const state = useMoleculeStore.getState();
      const data = { activeTabId: state.activeTabId, tabs: state.getAllTabsForSave() };
      if (!hasAnyContent(data.tabs)) return; // nothing worth checkpointing yet
      const json = exportProject(data);
      if (json === lastCheckpointedJson.current) return; // unchanged since the last checkpoint
      const svg = svgRef.current;
      if (!svg) return;
      await captureCheckpointNow(svg, data);
      if (cancelled) return;
      lastCheckpointedJson.current = json;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void takeCheckpointIfChanged();
    };

    const interval = window.setInterval(() => void takeCheckpointIfChanged(), CHECKPOINT_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // Mount-only: takeCheckpointIfChanged always reads current state via
    // getState()/svgRef.current at call time, so it never goes stale —
    // the same reasoning useAutosave.ts's own mount-only effect documents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
