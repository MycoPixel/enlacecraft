import { exportProject, importProject, ProjectParseError, type ProjectTab } from "./project";

const DB_NAME = "enlacecraft-autosave";
const STORE_NAME = "snapshots";
const RECORD_KEY = "current";
const DB_VERSION = 1;

/**
 * Silent, continuous backup of the whole session (every tab, exactly the
 * same shape "Save project" writes out — see io/project.ts) to the
 * browser's own IndexedDB, restored automatically on the next visit.
 *
 * This exists because, before it, the *only* thing that persisted between
 * sessions was preferences (language, sidebar width) — the actual drawing
 * only survived a refresh, crash, or accidentally closed tab if someone
 * remembered to explicitly "Save project" first. That's an easy thing to
 * forget, and increasingly costly to forget now that the app is
 * installable as a PWA people may treat like a persistent app rather than
 * a page they re-visit deliberately.
 *
 * Deliberately best-effort: every operation here is wrapped so a failure
 * (private browsing mode, storage quota, IndexedDB unavailable/disabled)
 * degrades to "autosave just doesn't happen" rather than surfacing an
 * error or interrupting anything — the explicit "Save project" export
 * remains the durable, user-controlled save; this is only a safety net on
 * top of it.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAutosaveSnapshot(data: { activeTabId: string; tabs: ProjectTab[] }): Promise<void> {
  try {
    const db = await openDB();
    const json = exportProject(data);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(json, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Autosave failed", err);
  }
}

export async function loadAutosaveSnapshot(): Promise<{ activeTabId: string; tabs: ProjectTab[] } | null> {
  try {
    const db = await openDB();
    const json = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!json) return null;
    const project = importProject(json);
    return { activeTabId: project.activeTabId, tabs: project.tabs };
  } catch (err) {
    // A corrupt/unreadable autosave shouldn't block the app from starting
    // — just proceed as if there were none.
    if (!(err instanceof ProjectParseError)) console.warn("Autosave restore failed", err);
    return null;
  }
}

/** Whether a snapshot actually has anything worth restoring/notifying
 * about — the trivial "one blank tab" case (every fresh session's
 * starting point) shouldn't trigger a "restored your session" message. */
export function hasAnyContent(tabs: ProjectTab[]): boolean {
  return tabs.some((tb) => Object.keys(tb.molecule.atoms).length > 0 || Object.keys(tb.annotations).length > 0);
}
