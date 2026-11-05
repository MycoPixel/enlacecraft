import { exportProject, importProject, ProjectParseError, type ProjectTab } from "./project";
import { openLocalDb, CHECKPOINTS_STORE } from "./localDb";

/** How often (at most) a checkpoint is taken while the app sits open and
 * being edited — see useVersionHistory.ts, which also takes one
 * opportunistically whenever the tab/window is hidden, regardless of this
 * interval, so the last stretch of work before closing isn't lost. */
export const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000;
/** Minimum spacing between hide-triggered (visibilitychange) checkpoints, so
 * rapid window-switching can't hammer the serialization + rasterization path. */
export const MIN_HIDDEN_CHECKPOINT_GAP_MS = 30 * 1000;
/** Oldest checkpoints are pruned once there are more than this many — see
 * saveCheckpoint's doc comment for the storage-size reasoning behind this
 * number. */
export const MAX_CHECKPOINTS = 100;

export interface CheckpointSummary {
  id: number;
  timestamp: number;
  /** A small PNG data URL — see useVersionHistory.ts for how it's
   * generated (reuses exportImage.ts's rasterization pipeline). */
  thumbnail: string;
}

/**
 * A separate, coarser-grained layer on top of autosave.ts's single-slot
 * crash-recovery snapshot: many timestamped checkpoints instead of one,
 * browsable and individually restorable from the version-history panel
 * (components/TopBar/VersionHistoryPanel.tsx). See useVersionHistory.ts
 * for when a checkpoint actually gets taken.
 *
 * Records a new checkpoint and prunes anything beyond MAX_CHECKPOINTS.
 *
 * Sizing: a project's exported JSON is typically a few KB up to a few tens
 * of KB for a large multi-tab reaction scheme; the thumbnail (a small,
 * deliberately low-resolution PNG) adds roughly 5–15 KB. At
 * MAX_CHECKPOINTS that's on the order of a few MB in the steady state,
 * negligible next to typical per-origin IndexedDB quotas.
 *
 * Pruning walks the store in key order (auto-incrementing ids, so lowest
 * key = oldest) rather than tracking count separately, so it stays correct
 * even if a checkpoint is deleted out of band (deleteCheckpoint below).
 */
export async function saveCheckpoint(data: { activeTabId: string; tabs: ProjectTab[] }, thumbnail: string): Promise<void> {
  try {
    const db = await openLocalDb();
    const json = exportProject(data);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHECKPOINTS_STORE, "readwrite");
      const store = tx.objectStore(CHECKPOINTS_STORE);
      store.add({ timestamp: Date.now(), json, thumbnail });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await pruneOldCheckpoints(db);
    db.close();
  } catch (err) {
    // Mirrors autosave.ts's own philosophy: version history is a bonus
    // safety net, not something that should ever interrupt the person's
    // actual work if storage is unavailable or full.
    console.warn("Checkpoint save failed", err);
  }
}

async function pruneOldCheckpoints(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(CHECKPOINTS_STORE, "readwrite");
  const store = tx.objectStore(CHECKPOINTS_STORE);
  await new Promise<void>((resolve, reject) => {
    const countReq = store.count();
    countReq.onerror = () => reject(countReq.error);
    countReq.onsuccess = () => {
      const excess = countReq.result - MAX_CHECKPOINTS;
      if (excess <= 0) {
        resolve();
        return;
      }
      let deleted = 0;
      const cursorReq = store.openCursor(); // default direction "next" = ascending key order = oldest first
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || deleted >= excess) {
          resolve();
          return;
        }
        cursor.delete();
        deleted++;
        cursor.continue();
      };
    };
  });
}

/** Lightweight list for the version-history panel — every stored field
 * except the (potentially large) project json, which loadCheckpoint fetches
 * separately only once the user actually picks a specific checkpoint to
 * restore. Newest first. */
export async function listCheckpoints(): Promise<CheckpointSummary[]> {
  try {
    const db = await openLocalDb();
    const all = await new Promise<Array<{ id: number; timestamp: number; thumbnail: string }>>((resolve, reject) => {
      const tx = db.transaction(CHECKPOINTS_STORE, "readonly");
      const req = tx.objectStore(CHECKPOINTS_STORE).getAll();
      req.onsuccess = () => resolve(req.result as Array<{ id: number; timestamp: number; thumbnail: string }>);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return all.map((r) => ({ id: r.id, timestamp: r.timestamp, thumbnail: r.thumbnail })).sort((a, b) => b.id - a.id);
  } catch (err) {
    console.warn("Listing checkpoints failed", err);
    return [];
  }
}

export async function loadCheckpoint(id: number): Promise<{ activeTabId: string; tabs: ProjectTab[] } | null> {
  try {
    const db = await openLocalDb();
    const record = await new Promise<{ json: string } | undefined>((resolve, reject) => {
      const tx = db.transaction(CHECKPOINTS_STORE, "readonly");
      const req = tx.objectStore(CHECKPOINTS_STORE).get(id);
      req.onsuccess = () => resolve(req.result as { json: string } | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record) return null;
    const project = importProject(record.json);
    return { activeTabId: project.activeTabId, tabs: project.tabs };
  } catch (err) {
    if (!(err instanceof ProjectParseError)) console.warn("Loading checkpoint failed", err);
    return null;
  }
}

export async function deleteCheckpoint(id: number): Promise<void> {
  try {
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHECKPOINTS_STORE, "readwrite");
      tx.objectStore(CHECKPOINTS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Deleting checkpoint failed", err);
  }
}
