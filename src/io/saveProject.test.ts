// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { saveToCurrent, saveAs, forgetSaveDestination, baseName, currentBrowserHandle } from "./saveProject";

/**
 * Covers the three save strategies and, most importantly, the fallback
 * behaviour each one promises: a browser with no File System Access API must
 * say "needs-dialog" rather than silently reporting a save it didn't do.
 */

/** Stand-in for the bridge. A loose record rather than ElectronBridge: only
 * the two save methods matter here, and a partial can never satisfy the real
 * interface's dozen other members. */
type FakeBridge = Record<string, unknown>;
type Win = Window & {
  showSaveFilePicker?: (o?: unknown) => Promise<FileSystemFileHandle>;
};

/** Installs a bridge stub. Assigned through an untyped alias because
 * window.electron is declared as the full ElectronBridge, and a two-method
 * partial can never satisfy it. */
function useElectron(bridge: FakeBridge) {
  (window as unknown as Record<string, unknown>).electron = bridge;
}

/** Removes the bridge (or picker) stub between tests. */
function clearGlobal(key: "electron" | "showSaveFilePicker") {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, key);
}

const win = window as Win;

function fakeHandle(name = "molecule.enlacecraft") {
  const written: string[] = [];
  const handle = {
    name,
    createWritable: vi.fn(async () => ({
      write: async (text: string) => {
        written.push(text);
      },
      close: async () => {},
    })),
  } as unknown as FileSystemFileHandle;
  return { handle, written };
}

beforeEach(() => {
  clearGlobal("electron");
  clearGlobal("showSaveFilePicker");
  forgetSaveDestination();
});

afterEach(() => {
  clearGlobal("electron");
  clearGlobal("showSaveFilePicker");
});

describe("baseName", () => {
  test("splits POSIX paths", () => {
    expect(baseName("/home/u/a.enlacecraft")).toBe("a.enlacecraft");
  });

  test("splits Windows paths", () => {
    // Electron hands back native paths; backslashes would survive a naive
    // split("/") and put the whole path in the status message.
    expect(baseName("C:\\Users\\u\\a.enlacecraft")).toBe("a.enlacecraft");
  });

  test("returns a bare name unchanged", () => {
    expect(baseName("a.enlacecraft")).toBe("a.enlacecraft");
  });
});

describe("saveToCurrent with no destination yet", () => {
  test("asks for a dialog rather than pretending to have saved", () => {
    return expect(saveToCurrent("{}")).resolves.toEqual({ kind: "needs-dialog" });
  });

  test("does the same in the desktop build when nothing has been saved", async () => {
    useElectron({ saveProjectFileToCurrent: async () => ({ hasTarget: false }) });
    await expect(saveToCurrent("{}")).resolves.toEqual({ kind: "needs-dialog" });
  });
});

describe("saveToCurrent in the desktop build", () => {
  test("reports the file it saved to", async () => {
    useElectron({
      saveProjectFileToCurrent: async () => ({ hasTarget: true, canceled: false, filePath: "/home/u/work.enlacecraft" }),
    });
    await expect(saveToCurrent("{}")).resolves.toEqual({ kind: "saved", name: "work.enlacecraft" });
  });

  test("surfaces a write failure instead of clearing the dirty flag", async () => {
    useElectron({
      saveProjectFileToCurrent: async () => ({ hasTarget: true, canceled: false, filePath: "/x.enlacecraft", error: "ENOSPC" }),
    });
    const outcome = await saveToCurrent("{}");
    expect(outcome.kind).toBe("error");
  });

  test("does not consult a browser handle even if one exists", async () => {
    // Set the browser handle up first (no electron present yet), then switch
    // to the desktop build. The main process owns the path there, so a stale
    // browser handle must never be able to redirect a desktop save.
    const { handle } = fakeHandle("browser.enlacecraft");
    win.showSaveFilePicker = async () => handle;
    await saveAs("{}", "m.enlacecraft", ".enlacecraft");
    expect(currentBrowserHandle()).toBe(handle);

    useElectron({
      saveProjectFileToCurrent: async () => ({ hasTarget: true, canceled: false, filePath: "/desk.enlacecraft" }),
      saveProjectFile: async () => ({ canceled: false, filePath: "/desktop-dialog.enlacecraft" }),
    });
    const outcome = await saveToCurrent("{}");
    expect(outcome).toEqual({ kind: "saved", name: "desk.enlacecraft" });
    expect((handle.createWritable as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1); // untouched since the browser save
  });
});

describe("saveAs with the File System Access API", () => {
  test("writes through the handle and remembers it", async () => {
    const { handle, written } = fakeHandle("picked.enlacecraft");
    win.showSaveFilePicker = async () => handle;

    const outcome = await saveAs('{"a":1}', "suggested.enlacecraft", ".enlacecraft");
    expect(outcome).toEqual({ kind: "saved", name: "picked.enlacecraft" });
    expect(written).toEqual(['{"a":1}']);
    expect(currentBrowserHandle()).toBe(handle);
  });

  test("a later plain Save writes to the remembered handle with no prompt", async () => {
    const { handle, written } = fakeHandle("picked.enlacecraft");
    const picker = vi.fn(async () => handle);
    win.showSaveFilePicker = picker;

    await saveAs("first", "s.enlacecraft", ".enlacecraft");
    const outcome = await saveToCurrent("second");

    expect(picker).toHaveBeenCalledTimes(1); // no second prompt
    expect(outcome).toEqual({ kind: "saved", name: "picked.enlacecraft" });
    expect(written).toEqual(["first", "second"]);
  });

  test("dismissing the picker is a cancel, not an error", async () => {
    win.showSaveFilePicker = async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    };
    await expect(saveAs("{}", "s.enlacecraft", ".enlacecraft")).resolves.toEqual({ kind: "canceled" });
  });

  test("a genuine picker failure is an error", async () => {
    win.showSaveFilePicker = async () => {
      throw new DOMException("disk on fire", "NotAllowedError");
    };
    const outcome = await saveAs("{}", "s.enlacecraft", ".enlacecraft");
    expect(outcome.kind).toBe("error");
  });

  test("a revoked handle drops the destination instead of failing forever", async () => {
    const { handle } = fakeHandle("revoked.enlacecraft");
    win.showSaveFilePicker = async () => handle;
    await saveAs("{}", "s.enlacecraft", ".enlacecraft");

    (handle.createWritable as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException("permission revoked", "NotAllowedError")
    );
    const outcome = await saveToCurrent("next");
    expect(outcome.kind).toBe("error");
    // Forgotten, so the next Save asks again rather than repeating the error.
    expect(currentBrowserHandle()).toBeNull();
  });
});

describe("saveAs without the File System Access API", () => {
  test("falls back to a download and remembers nothing", async () => {
    // Firefox and Safari land here. The download prompts like it always has;
    // crucially no destination is remembered, so the next plain Save asks
    // again rather than claiming to overwrite a file it never wrote.
    const { handle } = fakeHandle();
    win.showSaveFilePicker = undefined;

    const outcome = await saveAs("{}", "molecule.enlacecraft", ".enlacecraft");
    expect(outcome.kind).toBe("saved");
    expect(currentBrowserHandle()).toBeNull();
    void handle;
  });
});

describe("forgetSaveDestination", () => {
  test("makes the next plain Save ask again", async () => {
    const { handle } = fakeHandle("picked.enlacecraft");
    win.showSaveFilePicker = async () => handle;
    await saveAs("{}", "s.enlacecraft", ".enlacecraft");
    expect(currentBrowserHandle()).not.toBeNull();

    forgetSaveDestination();
    expect(currentBrowserHandle()).toBeNull();
    await expect(saveToCurrent("{}")).resolves.toEqual({ kind: "needs-dialog" });
  });
});