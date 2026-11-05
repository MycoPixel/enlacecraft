const DB_NAME = "enlacecraft-autosave";
const DB_VERSION = 2;
export const SNAPSHOTS_STORE = "snapshots";
export const CHECKPOINTS_STORE = "checkpoints";

/**
 * Single shared owner of this app's local IndexedDB schema/version.
 * autosave.ts (the single-slot crash-recovery snapshot) and
 * versionHistory.ts (many timestamped, restorable checkpoints — see that
 * file's doc comments) both store into the same database, and IndexedDB
 * refuses to open a connection at a version lower than the database's
 * current version — it throws a VersionError, synchronously breaking that
 * caller — so every opener MUST request the same version number. Having
 * exactly one function that does the opening, imported by both, is what
 * guarantees that rather than relying on two separately-maintained
 * constants staying in sync by hand.
 */
export function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // typeof indexedDB, not "indexedDB" in window: matches how the rest of
    // this function already references the global directly (indexedDB.open
    // below, not window.indexedDB.open), and doesn't assume a `window`
    // exists at all — indexedDB is available on the global object in any
    // browser/Electron-renderer context this runs in regardless.
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 1 && !db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        db.createObjectStore(SNAPSHOTS_STORE);
      }
      if (event.oldVersion < 2 && !db.objectStoreNames.contains(CHECKPOINTS_STORE)) {
        db.createObjectStore(CHECKPOINTS_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
