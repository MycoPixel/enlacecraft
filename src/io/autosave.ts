import { exportProject, importProject, type ProjectTab } from "./project";
import { openLocalDb, SNAPSHOTS_STORE } from "./localDb";

const RECORD_KEY = "current";
/**
 * Where an unreadable snapshot is kept instead of being overwritten.
 *
 * Never restored automatically - see quarantineSnapshot.
 */
const QUARANTINE_KEY = "unreadable";

/**
 * Record keys, for tests that need to assert what is actually in storage.
 *
 * Exported deliberately: the behaviour that matters here - that an unreadable
 * snapshot is preserved rather than overwritten - is invisible from the public
 * API, since loadAutosaveSnapshot reports an outcome rather than a location.
 */
export const autosaveKeysForTest = {
  live: RECORD_KEY,
  quarantine: QUARANTINE_KEY,
} as const;

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
 *
 * This is the *single-slot* safety net — always just the most recent
 * state, overwritten every time. For browsing/restoring further back than
 * that, see io/versionHistory.ts, a separate, coarser-grained layer on top
 * of the same database (see io/localDb.ts for why they share one opener).
 */
export async function saveAutosaveSnapshot(data: { activeTabId: string; tabs: ProjectTab[] }): Promise<void> {
  try {
    const db = await openLocalDb();
    const json = exportProject(data);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).put(json, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Autosave failed", err);
  }
}

/**
 * Outcome of the startup restore attempt.
 *
 * Previously this returned `snapshot | null`, which could not distinguish
 * "there was nothing saved" from "something WAS saved and we could not read
 * it" - so the caller treated both as "start empty". That matters because a
 * parse failure is the interesting case: the user's work is sitting in
 * IndexedDB, and the next autosave would overwrite it.
 */
export type AutosaveRestore =
  | { kind: "none" }
  | { kind: "ok"; activeTabId: string; tabs: ProjectTab[] }
  /** Saved, present, and unreadable. The raw JSON is preserved, not discarded. */
  | { kind: "unreadable"; reason: string };

export async function loadAutosaveSnapshot(): Promise<AutosaveRestore> {
  let json: string | undefined;
  try {
    const db = await openLocalDb();
    json = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
      const req = tx.objectStore(SNAPSHOTS_STORE).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result as string | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch (err) {
    // Storage itself unavailable (private browsing, IndexedDB disabled). Not a
    // problem with the user's data, so nothing to recover and nothing to warn
    // about beyond the console.
    console.warn("Autosave storage unavailable", err);
    return { kind: "none" };
  }

  if (!json) return { kind: "none" };

  try {
    const project = importProject(json);
    return { kind: "ok", activeTabId: project.activeTabId, tabs: project.tabs };
  } catch (err) {
    // A corrupt or unreadable autosave must not block the app from starting,
    // but it must NOT be silent either. The previous code suppressed the
    // warning for exactly this case (`if (!(err instanceof ProjectParseError))`),
    // which is backwards: ProjectParseError is the LIKELY failure - a snapshot
    // written by a newer build, or one that trips an import limit - and the
    // user saw a blank canvas with no message at all.
    //
    // exportProject applies no size limits while importProject refuses
    // over-limit files, so the app can save a project it will not read back.
    // That asymmetry is why this is reachable at all.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("Autosave snapshot could not be restored", err);
    await quarantineSnapshot(json);
    return { kind: "unreadable", reason };
  }
}

/**
 * Moves an unreadable snapshot aside instead of leaving it in the live slot.
 *
 * The single slot is overwritten by the very next autosave - and at startup
 * that is almost immediate, since a ResizeObserver or a mouse move counts as a
 * store change. So leaving the bad snapshot where it was meant a blank canvas
 * followed within a second by the only copy being replaced with the blank
 * state, and no way to get it back.
 *
 * Copying it to a second key is cheap relative to losing a session, and it
 * leaves the data in a place a developer can still recover by hand. It is
 * never read back automatically: a file the parser already rejected has no
 * business being restored.
 */
async function quarantineSnapshot(json: string): Promise<void> {
  try {
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).put(json, QUARANTINE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    // Best effort. Failing to preserve it is unfortunate but must not itself
    // throw - the caller is already on the failure path.
    console.warn("Could not preserve the unreadable autosave snapshot", err);
  }
}

/** Whether a snapshot actually has anything worth restoring/notifying
 * about — the trivial "one blank tab" case (every fresh session's
 * starting point) shouldn't trigger a "restored your session" message. */
export function hasAnyContent(tabs: ProjectTab[]): boolean {
  return tabs.some((tb) => Object.keys(tb.molecule.atoms).length > 0 || Object.keys(tb.annotations).length > 0);
}
