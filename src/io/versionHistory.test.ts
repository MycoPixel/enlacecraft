// fake-indexeddb/auto polyfills the global indexedDB/IDBKeyRange etc. for
// plain Node — no jsdom needed, since openLocalDb (see localDb.ts) checks
// for the global `indexedDB` directly rather than requiring a `window`.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import indexedDB from "fake-indexeddb";
import {
  saveCheckpoint,
  listCheckpoints,
  loadCheckpoint,
  deleteCheckpoint,
  MAX_CHECKPOINTS,
} from "./versionHistory";
import type { ProjectTab } from "./project";

function emptyTab(id: string): ProjectTab {
  return {
    id,
    title: "Tab 1",
    molecule: { atoms: {}, bonds: {}, hapticBonds: {}, aromaticRingDisplays: {} },
    annotations: {},
    view: { scale: 1, tx: 0, ty: 0 },
  };
}

function projectData(tabId = "tab-1") {
  return { activeTabId: tabId, tabs: [emptyTab(tabId)] };
}

// Each test gets a clean database — fake-indexeddb persists in memory for
// the life of the process, and this module's DB name is fixed (shared with
// autosave.ts's snapshot store by design, see localDb.ts), so without this
// checkpoints from one test would leak into the next.
beforeEach(() => {
  indexedDB.deleteDatabase("enlacecraft-autosave");
});

describe("saveCheckpoint / listCheckpoints", () => {
  test("a saved checkpoint appears in the list with its thumbnail and a timestamp", async () => {
    await saveCheckpoint(projectData(), "data:image/png;base64,AAA");
    const list = await listCheckpoints();
    expect(list).toHaveLength(1);
    expect(list[0].thumbnail).toBe("data:image/png;base64,AAA");
    expect(list[0].timestamp).toBeGreaterThan(0);
  });

  test("listCheckpoints returns newest first", async () => {
    await saveCheckpoint(projectData("tab-1"), "thumb-1");
    await saveCheckpoint(projectData("tab-2"), "thumb-2");
    await saveCheckpoint(projectData("tab-3"), "thumb-3");
    const list = await listCheckpoints();
    expect(list.map((c) => c.thumbnail)).toEqual(["thumb-3", "thumb-2", "thumb-1"]);
  });

  test("an empty store lists as an empty array, not an error", async () => {
    expect(await listCheckpoints()).toEqual([]);
  });
});

describe("loadCheckpoint", () => {
  test("round-trips the exact project data that was saved", async () => {
    const data = projectData("my-tab");
    await saveCheckpoint(data, "thumb");
    const [{ id }] = await listCheckpoints();
    const loaded = await loadCheckpoint(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.activeTabId).toBe("my-tab");
    expect(loaded!.tabs).toHaveLength(1);
    expect(loaded!.tabs[0].id).toBe("my-tab");
  });

  test("a nonexistent id resolves to null rather than throwing", async () => {
    expect(await loadCheckpoint(999999)).toBeNull();
  });
});

describe("deleteCheckpoint", () => {
  test("removes exactly the targeted checkpoint, leaving the others", async () => {
    await saveCheckpoint(projectData("a"), "thumb-a");
    await saveCheckpoint(projectData("b"), "thumb-b");
    const list = await listCheckpoints();
    const toDelete = list.find((c) => c.thumbnail === "thumb-a")!;
    await deleteCheckpoint(toDelete.id);
    const remaining = await listCheckpoints();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].thumbnail).toBe("thumb-b");
  });
});

describe("retention: pruning beyond MAX_CHECKPOINTS", () => {
  test("keeps at most MAX_CHECKPOINTS, dropping the oldest first", async () => {
    // MAX_CHECKPOINTS is 100 in production — saving that many real
    // IndexedDB records one at a time would make this test slow for
    // little extra confidence, so the pruning logic (which only cares
    // about "how many records are there", not their content) is exercised
    // directly via its exported constant rather than hardcoding 100 here,
    // keeping the test meaningful even if that constant is tuned later.
    const total = MAX_CHECKPOINTS + 5;
    for (let i = 0; i < total; i++) {
      await saveCheckpoint(projectData(`tab-${i}`), `thumb-${i}`);
    }
    const list = await listCheckpoints();
    expect(list).toHaveLength(MAX_CHECKPOINTS);
    // The 5 oldest (thumb-0..thumb-4) should be gone; the most recent
    // MAX_CHECKPOINTS should all still be present.
    const thumbnails = list.map((c) => c.thumbnail);
    expect(thumbnails).not.toContain("thumb-0");
    expect(thumbnails).not.toContain("thumb-4");
    expect(thumbnails).toContain(`thumb-${total - 1}`);
    expect(thumbnails).toContain("thumb-5");
  }, 20000);
});
