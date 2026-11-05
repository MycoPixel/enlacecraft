// @vitest-environment jsdom
// fake-indexeddb/auto polyfills the global indexedDB for these tests, matching
// src/io/versionHistory.test.ts - autosave.ts is otherwise untestable in jsdom
// without it, since jsdom ships no IndexedDB.
import "fake-indexeddb/auto";
import indexedDB from "fake-indexeddb";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { importProject } from "./project";
import { emptyMolecule, addAtom, addBond } from "../model/molecule";
import { loadAutosaveSnapshot, saveAutosaveSnapshot, autosaveKeysForTest } from "./autosave";

/**
 * An autosave snapshot that cannot be read must never be silently replaced.
 *
 * `loadAutosaveSnapshot` used to return `snapshot | null`, so "nothing was
 * saved" and "something WAS saved and we failed to parse it" were
 * indistinguishable. The caller started blank either way and said nothing,
 * because the console warning was suppressed for exactly the ProjectParseError
 * case:
 *
 *     if (!(err instanceof ProjectParseError)) console.warn(...)
 *
 * which is backwards. ProjectParseError is the LIKELY failure - a snapshot
 * written by a newer build, or one that trips an import limit - because
 * exportProject applies no limits at all while importProject refuses
 * over-limit files. The app can therefore save a project it will not read back.
 *
 * And the single slot gets overwritten by the very next autosave, which at
 * startup is nearly immediate: a ResizeObserver or a stray mouse move counts
 * as a store change. So the sequence was blank canvas -> silent -> only copy
 * replaced by the blank state, with no way back.
 */

const drawing = () => {
  const a = addAtom(emptyMolecule(), "2", { x: 0, y: 0 }, "C");
  const b = addAtom(a, "3", { x: 40, y: 0 }, "O");
  return addBond(b, "9", "2", "3", 1, "none");
};

const projectOf = (mol = drawing()) => ({
  activeTabId: "tab-1",
  tabs: [
    {
      id: "tab-1",
      title: "Tab 1",
      molecule: mol,
      annotations: {},
      view: { scale: 1, tx: 0, ty: 0 },
    },
  ],
});

/** Raw record access, for asserting the snapshot was preserved rather than lost. */
async function readRaw(key: string): Promise<string | undefined> {
  const { openLocalDb, SNAPSHOTS_STORE } = await import("./localDb");
  const db = await openLocalDb();
  const out = await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS_STORE, "readonly");
    const req = tx.objectStore(SNAPSHOTS_STORE).get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

// fake-indexeddb persists in memory for the life of the process and this
// module's DB name is fixed and SHARED with autosave.ts by design (see
// localDb.ts), so without this, records from one test leak into the next.
beforeEach(() => {
  indexedDB.deleteDatabase("enlacecraft-autosave");
});

describe("loadAutosaveSnapshot outcomes", () => {
  test("reports 'none' when nothing was ever saved", async () => {
    // Distinct from the failure case, which is the whole point of the union.
    const outcome = await loadAutosaveSnapshot();
    expect(outcome.kind).toBe("none");
  });

  test("reports 'ok' for a readable snapshot", async () => {
    await saveAutosaveSnapshot(projectOf());
    const outcome = await loadAutosaveSnapshot();
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") throw new Error("expected ok");
    expect(Object.keys(outcome.tabs[0].molecule.atoms)).toHaveLength(2);
  });

  test("reports 'unreadable' - NOT 'none' - for a snapshot it cannot parse", async () => {
    // A snapshot from a newer build: version 3 doesn't exist, so import throws.
    // Returning 'none' here is what previously erased the distinction and let
    // the app look like it had simply never saved anything.
    const { openLocalDb, SNAPSHOTS_STORE } = await import("./localDb");
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).put(
        JSON.stringify({ version: 3, activeTabId: "tab-1", tabs: [] }),
        "current",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outcome = await loadAutosaveSnapshot();
    warn.mockRestore();

    expect(outcome.kind).toBe("unreadable");
    if (outcome.kind !== "unreadable") throw new Error("expected unreadable");
    expect(outcome.reason).toBeTruthy();
  });

  test("WARNS on an unparseable snapshot - the suppression was the bug", async () => {
    const { openLocalDb, SNAPSHOTS_STORE } = await import("./localDb");
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).put("{ not json at all", "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    // Assert BEFORE restoring: mockRestore() resets the spy's call history, so
    // checking afterwards would pass vacuously.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outcome = await loadAutosaveSnapshot();

    // Previously: silent for ProjectParseError, which is the expected failure.
    expect(warn).toHaveBeenCalled();
    expect(outcome.kind).toBe("unreadable");
    warn.mockRestore();
  });
});

describe("an unreadable snapshot is preserved, not destroyed", () => {
  test("the raw JSON survives under the quarantine key", async () => {
    const garbage = JSON.stringify({ version: 99, activeTabId: "tab-1", tabs: [], note: "precious" });
    const { openLocalDb, SNAPSHOTS_STORE } = await import("./localDb");
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).put(garbage, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadAutosaveSnapshot();
    warn.mockRestore();

    const kept = await readRaw(autosaveKeysForTest.quarantine);
    expect(kept).toBe(garbage);
    // The user's data is still there, byte for byte, for manual recovery.
    expect(JSON.parse(kept!).note).toBe("precious");
  });

  test("a later autosave no longer destroys it", async () => {
    // The whole failure: the next save went to the same slot.
    const { openLocalDb, SNAPSHOTS_STORE } = await import("./localDb");
    const write = async (value: string, key: string) => {
      const db = await openLocalDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
        tx.objectStore(SNAPSHOTS_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    };
    const unreadable = JSON.stringify({ version: 99, note: "precious" });
    await write(unreadable, "current");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadAutosaveSnapshot();
    warn.mockRestore();

    // Simulate the startup autosave that used to clobber the only copy.
    await saveAutosaveSnapshot(projectOf(emptyMolecule()));

    expect(await readRaw(autosaveKeysForTest.quarantine)).toBe(unreadable);
    // And the live slot has moved on to the new, valid state.
    const live = await readRaw(autosaveKeysForTest.live);
    expect(importProject(live!).tabs).toHaveLength(1);
  });

  test("quarantine is never restored automatically", async () => {
    // A file the parser already rejected has no business being restored, so the
    // key exists for manual recovery only.
    const { openLocalDb, SNAPSHOTS_STORE } = await import("./localDb");
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SNAPSHOTS_STORE, "readwrite");
      tx.objectStore(SNAPSHOTS_STORE).put(JSON.stringify({ version: 99, tabs: [] }), "unreadable");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const outcome = await loadAutosaveSnapshot();
    expect(outcome.kind).toBe("none");
  });
});