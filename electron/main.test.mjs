// Loads the REAL electron/main.cjs against a hand-written fake "electron"
// module and drives the handlers it registers — so the wiring (which events
// are guarded, which IPC channels check the sender, what the window is
// created with) is tested, not just the helper functions. This is not a
// substitute for launching the packaged app, but it catches wiring mistakes
// with no Electron binary needed.
import { afterEach, describe, expect, test } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const req = createRequire(import.meta.url);
const Module = req("node:module");
const electronDir = path.dirname(fileURLToPath(import.meta.url));
const distIndexUrl = pathToFileURL(path.join(electronDir, "..", "dist", "index.html")).href;

const EXPECTED_CHANNELS = [
  "dialog:open-file",
  "dialog:save-project",
  "dialog:save-project-to",
  "iupac-fallback-server:get-status",
  "nmr-server:get-status",
  "structure3d-server:get-status",
  "updater:get-status",
  "updater:quit-and-install",
];

function makeFakeElectron({ singleInstance = true, userData }) {
  const ipc = new Map();
  const appListeners = new Map();
  const state = { opened: [], quitCalls: 0, windows: [], dialogs: { save: null, open: null }, saveOptions: null, session: {} };

  const app = {
    isPackaged: false,
    requestSingleInstanceLock: () => singleInstance,
    quit: () => void state.quitCalls++,
    whenReady: () => Promise.resolve(),
    getPath: () => userData,
    getVersion: () => "0.0.0-test",
    on(event, fn) {
      if (!appListeners.has(event)) appListeners.set(event, []);
      appListeners.get(event).push(fn);
    },
    emit(event, ...args) {
      for (const fn of appListeners.get(event) ?? []) fn(...args);
    },
  };

  class FakeWebContents extends EventEmitter {
    constructor() {
      super();
      this.windowOpenHandler = null;
    }
    setWindowOpenHandler(fn) {
      this.windowOpenHandler = fn;
    }
    openDevTools() {}
    getURL() {
      return "";
    }
  }

  class BrowserWindow {
    static getAllWindows() {
      return state.windows;
    }
    static fromWebContents() {
      return state.windows[0] ?? null;
    }
    constructor(opts) {
      this.opts = opts;
      this.webContents = new FakeWebContents();
      this.focused = false;
      state.windows.push(this);
      app.emit("web-contents-created", {}, this.webContents); // real Electron does this for every WebContents
    }
    loadFile(f) {
      this.loadedFile = f;
    }
    loadURL(u) {
      this.loadedUrl = u;
    }
    isMinimized() {
      return false;
    }
    restore() {}
    focus() {
      this.focused = true;
    }
    destroy() {}
  }

  const electron = {
    app,
    BrowserWindow,
    shell: { openExternal: (url) => void state.opened.push(url) },
    Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
    dialog: {
      showMessageBox: async () => ({ response: 1 }),
      showSaveDialog: async (_win, options) => {
        state.saveOptions = options;
        return state.dialogs.save;
      },
      showOpenDialog: async () => state.dialogs.open,
    },
    ipcMain: { handle: (channel, fn) => void ipc.set(channel, fn) },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (fn) => void (state.session.request = fn),
        setPermissionCheckHandler: (fn) => void (state.session.check = fn),
      },
    },
  };
  return { electron, app, ipc, state };
}

const fakeUpdater = {
  autoUpdater: Object.assign(new EventEmitter(), { checkForUpdates: async () => {}, quitAndInstall: () => {} }),
};

/** Loads a fresh copy of main.cjs (and its sibling modules) against a fresh fake Electron. */
async function loadMain({ singleInstance = true, devServerUrl } = {}) {
  const userData = await fsp.mkdtemp(path.join(os.tmpdir(), "enlacecraft-main-"));
  const fake = makeFakeElectron({ singleInstance, userData });

  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") return fake.electron;
    if (request === "electron-updater") return fakeUpdater;
    return origLoad.call(this, request, ...rest);
  };
  for (const key of Object.keys(req.cache)) if (key.startsWith(electronDir)) delete req.cache[key];
  const prevEnv = process.env.ELECTRON_START_URL;
  if (devServerUrl) process.env.ELECTRON_START_URL = devServerUrl;
  else delete process.env.ELECTRON_START_URL;

  try {
    req("./main.cjs");
    await new Promise((r) => setImmediate(r)); // let app.whenReady().then(...) run
  } finally {
    Module._load = origLoad;
    if (prevEnv === undefined) delete process.env.ELECTRON_START_URL;
    else process.env.ELECTRON_START_URL = prevEnv;
  }
  return { ...fake, userData, win: fake.state.windows[0] };
}

const frame = (url, parent = null) => ({ url, parent });
/** Calls a registered IPC handler as if from `senderFrame`. Always async so sync throws become rejections, like real invoke(). */
const invoke = (ctx, channel, senderFrame, ...args) => {
  const handler = ctx.ipc.get(channel);
  return (async () => handler({ sender: ctx.win.webContents, senderFrame }, ...args))();
};
const cancellableEvent = () => ({
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
});

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});
const load = async (opts) => {
  const ctx = await loadMain(opts);
  cleanups.push(() => fsp.rm(ctx.userData, { recursive: true, force: true }));
  return ctx;
};

describe("window creation", () => {
  test("creates one hardened window that loads the built app from dist/", async () => {
    const { state, win } = await load();
    expect(state.windows).toHaveLength(1);
    expect(win.opts.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      safeDialogs: true,
    });
    expect(win.loadedFile).toBe(path.join(electronDir, "../dist/index.html"));
    expect(win.loadedUrl).toBeUndefined();
  });

  test("dev mode loads the dev server URL instead", async () => {
    const { win } = await load({ devServerUrl: "http://localhost:5173" });
    expect(win.loadedUrl).toBe("http://localhost:5173");
  });
});

describe("links and navigation", () => {
  test("window.open forwards only https:/mailto: to the OS, and always denies the new window", async () => {
    const { state, win } = await load();
    const open = (url) => win.webContents.windowOpenHandler({ url });
    expect(open("https://github.com/MycoPixel/enlacecraft-releases")).toEqual({ action: "deny" });
    expect(open("mailto:a@b.example")).toEqual({ action: "deny" });
    for (const bad of ["file:///C:/Windows/System32/calc.exe", "smb://x/y", "javascript:alert(1)", "ms-msdt:/id x", "http://example.com", "https://a@evil.example/"]) {
      expect(open(bad)).toEqual({ action: "deny" });
    }
    expect(state.opened).toEqual(["https://github.com/MycoPixel/enlacecraft-releases", "mailto:a@b.example"]);
  });

  test("will-navigate: untrusted pages are blocked (https ones open in the real browser); our own pages pass", async () => {
    const { state, win } = await load();
    const nav = (url) => {
      const e = cancellableEvent();
      win.webContents.emit("will-navigate", e, url);
      return e.defaultPrevented;
    };
    expect(nav(distIndexUrl)).toBe(false);
    expect(nav("https://evil.example/phish")).toBe(true);
    expect(nav("file:///etc/passwd")).toBe(true);
    expect(nav("javascript:alert(1)")).toBe(true);
    expect(state.opened).toEqual(["https://evil.example/phish"]);
  });

  test("will-redirect blocks untrusted targets without opening anything", async () => {
    const { state, win } = await load();
    const e1 = cancellableEvent();
    win.webContents.emit("will-redirect", e1, "https://evil.example/");
    const e2 = cancellableEvent();
    win.webContents.emit("will-redirect", e2, distIndexUrl);
    expect(e1.defaultPrevented).toBe(true);
    expect(e2.defaultPrevented).toBe(false);
    expect(state.opened).toEqual([]);
  });

  test("<webview> attachment is always blocked", async () => {
    const { win } = await load();
    const e = cancellableEvent();
    win.webContents.emit("will-attach-webview", e);
    expect(e.defaultPrevented).toBe(true);
  });

  test("dev mode trusts the dev-server origin for navigation, not file: pages", async () => {
    const { win } = await load({ devServerUrl: "http://localhost:5173" });
    const nav = (url) => {
      const e = cancellableEvent();
      win.webContents.emit("will-navigate", e, url);
      return e.defaultPrevented;
    };
    expect(nav("http://localhost:5173/")).toBe(false);
    expect(nav(distIndexUrl)).toBe(true);
  });
});

describe("permissions", () => {
  test("only the two clipboard permissions, only for our pages", async () => {
    const { state } = await load();
    const ask = (permission, requestingUrl) => {
      let out;
      state.session.request({ getURL: () => "" }, permission, (v) => (out = v), { requestingUrl });
      return out;
    };
    expect(ask("clipboard-read", distIndexUrl)).toBe(true);
    expect(ask("clipboard-sanitized-write", distIndexUrl)).toBe(true);
    expect(ask("clipboard-read", "https://evil.example/")).toBe(false);
    for (const p of ["media", "geolocation", "notifications", "midi", "fullscreen"]) expect(ask(p, distIndexUrl)).toBe(false);
    expect(state.session.check({ getURL: () => "" }, "media", "file://", { requestingUrl: distIndexUrl })).toBe(false);
    expect(state.session.check({ getURL: () => "" }, "clipboard-read", "file://", { requestingUrl: distIndexUrl })).toBe(true);
  });
});

describe("IPC sender validation", () => {
  test("registers exactly the expected channels", async () => {
    const { ipc } = await load();
    expect([...ipc.keys()].sort()).toEqual(EXPECTED_CHANNELS);
  });

  test.each(EXPECTED_CHANNELS)("%s rejects untrusted senders, sub-frames and missing frames", async (channel) => {
    const ctx = await load();
    const args =
      channel === "dialog:save-project" ? [{ defaultName: "x", content: "{}" }]
      : channel === "dialog:save-project-to" ? [{ content: "{}" }]
      : [];
    await expect(invoke(ctx, channel, frame("https://evil.example/"), ...args)).rejects.toThrow(/untrusted/i);
    await expect(invoke(ctx, channel, frame("file:///etc/hostile.html"), ...args)).rejects.toThrow(/untrusted/i);
    await expect(invoke(ctx, channel, frame(distIndexUrl, { some: "parent" }), ...args)).rejects.toThrow(/untrusted/i);
    await expect(invoke(ctx, channel, null, ...args)).rejects.toThrow(/untrusted/i);
    expect(ctx.state.saveOptions).toBeNull(); // no dialog was ever shown to an untrusted caller
  });

  test("a trusted top-level frame is served", async () => {
    const ctx = await load();
    const status = await invoke(ctx, "updater:get-status", frame(distIndexUrl));
    expect(status).toHaveProperty("state");
    expect(await invoke(ctx, "nmr-server:get-status", frame(distIndexUrl))).toHaveProperty("state");
  });

  test("rejections are logged", async () => {
    const ctx = await load();
    await invoke(ctx, "updater:get-status", frame("https://evil.example/")).catch(() => {});
    const log = await fsp.readFile(path.join(ctx.userData, "logs", "app.log"), "utf-8");
    expect(log).toMatch(/Rejected "updater:get-status"/);
  });
});

describe("dialog:save-project", () => {
  test("validates the payload before showing any dialog", async () => {
    const ctx = await load();
    for (const bad of [undefined, null, "x", {}, { content: 42 }]) {
      const r = await invoke(ctx, "dialog:save-project", frame(distIndexUrl), bad);
      expect(r).toMatchObject({ canceled: false, error: expect.any(String) });
    }
    expect(ctx.state.saveOptions).toBeNull();
  });

  test("sanitizes the suggested name, forces the extension, and writes atomically", async () => {
    const ctx = await load();
    const target = path.join(ctx.userData, "chosen-name"); // user typed no extension
    ctx.state.dialogs.save = { canceled: false, filePath: target };
    const r = await invoke(ctx, "dialog:save-project", frame(distIndexUrl), { defaultName: "../../evil<name>", content: '{"ok":true}' });
    expect(ctx.state.saveOptions.defaultPath).toBe("evil_name_.enlacecraft");
    expect(r).toEqual({ canceled: false, filePath: target + ".enlacecraft" });
    expect(await fsp.readFile(target + ".enlacecraft", "utf-8")).toBe('{"ok":true}');
    expect((await fsp.readdir(ctx.userData)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  test("cancel writes nothing", async () => {
    const ctx = await load();
    ctx.state.dialogs.save = { canceled: true, filePath: undefined };
    expect(await invoke(ctx, "dialog:save-project", frame(distIndexUrl), { defaultName: "a", content: "{}" })).toEqual({ canceled: true });
  });

  test("a write failure comes back as { error }, not a thrown IPC error", async () => {
    const ctx = await load();
    ctx.state.dialogs.save = { canceled: false, filePath: path.join(ctx.userData, "no-such-dir", "x.enlacecraft") };
    const r = await invoke(ctx, "dialog:save-project", frame(distIndexUrl), { defaultName: "a", content: "{}" });
    expect(r).toMatchObject({ canceled: false, error: expect.any(String) });
  });
});

describe("dialog:save-project-to (plain Save)", () => {
  test("reports hasTarget:false before anything has been saved, so the renderer falls back to Save As", async () => {
    const ctx = await load();
    const r = await invoke(ctx, "dialog:save-project-to", frame(distIndexUrl), { content: "{}" });
    expect(r).toEqual({ hasTarget: false });
    // Crucially, no dialog was shown and nothing was written.
    expect(ctx.state.dialogs.save).toBeNull();
  });

  test("a renderer-supplied filePath is ignored — the destination is the main process's own record", async () => {
    const ctx = await load();
    // Establish a legitimate target through a real Save As dialog...
    const target = path.join(ctx.userData, "real.enlacecraft");
    ctx.state.dialogs.save = { canceled: false, filePath: target };
    await invoke(ctx, "dialog:save-project", frame(distIndexUrl), { defaultName: "real", content: "{}" });

    // ...then try to redirect a later plain Save somewhere else entirely.
    const r = await invoke(ctx, "dialog:save-project-to", frame(distIndexUrl), {
      content: "{}",
      filePath: path.join(ctx.userData, "somewhere-else.enlacecraft"),
    });
    expect(r).toMatchObject({ hasTarget: true, filePath: target });
    expect(await fsp.readFile(target, "utf-8")).toBe("{}");
    // And nothing was created at the path the renderer asked for.
    await expect(fsp.stat(path.join(ctx.userData, "somewhere-else.enlacecraft"))).rejects.toThrow();
  });

  test("a plain Save overwrites the remembered file with no dialog", async () => {
    const ctx = await load();
    const target = path.join(ctx.userData, "work.enlacecraft");
    await fsp.writeFile(target, "old contents");
    ctx.state.dialogs.save = { canceled: false, filePath: target };
    await invoke(ctx, "dialog:save-project", frame(distIndexUrl), { defaultName: "work", content: "first" });

    const r = await invoke(ctx, "dialog:save-project-to", frame(distIndexUrl), { content: "second" });
    expect(r).toMatchObject({ hasTarget: true, canceled: false, filePath: target });
    expect(await fsp.readFile(target, "utf-8")).toBe("second");
    expect(ctx.state.dialogs.save).not.toBeNull(); // the dialog object is untouched; none was shown
  });

  test("rejects a non-string body before touching the filesystem", async () => {
    const ctx = await load();
    const target = path.join(ctx.userData, "work.enlacecraft");
    ctx.state.dialogs.save = { canceled: false, filePath: target };
    await invoke(ctx, "dialog:save-project", frame(distIndexUrl), { defaultName: "work", content: "first" });

    const r = await invoke(ctx, "dialog:save-project-to", frame(distIndexUrl), { content: 42 });
    expect(r).toMatchObject({ canceled: false, error: expect.any(String) });
    expect(await fsp.readFile(target, "utf-8")).toBe("first"); // unchanged
  });
});

describe("dialog:open-file", () => {
  test("returns the content and name of a supported file", async () => {
    const ctx = await load();
    const file = path.join(ctx.userData, "benzene.mol");
    await fsp.writeFile(file, "molblock");
    ctx.state.dialogs.open = { canceled: false, filePaths: [file] };
    // filePath comes back so the renderer can display where the open document
    // came from, and so Save-after-Open has a destination to match.
    expect(await invoke(ctx, "dialog:open-file", frame(distIndexUrl))).toEqual({
      canceled: false,
      fileName: "benzene.mol",
      content: "molblock",
      filePath: file,
    });
  });

  test("refuses unsupported types and oversized files with an error result", async () => {
    const ctx = await load();
    const exe = path.join(ctx.userData, "payload.exe");
    await fsp.writeFile(exe, "MZ");
    ctx.state.dialogs.open = { canceled: false, filePaths: [exe] };
    expect(await invoke(ctx, "dialog:open-file", frame(distIndexUrl))).toMatchObject({ canceled: false, error: expect.stringMatching(/unsupported/i) });

    const big = path.join(ctx.userData, "huge.enlacecraft");
    await fsp.writeFile(big, "");
    await fsp.truncate(big, 25 * 1024 * 1024 + 1);
    ctx.state.dialogs.open = { canceled: false, filePaths: [big] };
    expect(await invoke(ctx, "dialog:open-file", frame(distIndexUrl))).toMatchObject({ canceled: false, error: expect.stringMatching(/too large/i) });
  });

  test("cancel", async () => {
    const ctx = await load();
    ctx.state.dialogs.open = { canceled: true, filePaths: [] };
    expect(await invoke(ctx, "dialog:open-file", frame(distIndexUrl))).toEqual({ canceled: true });
  });
});

describe("single instance", () => {
  test("the winning instance focuses its window when a second one starts", async () => {
    const { app, win } = await load();
    expect(win.focused).toBe(false);
    app.emit("second-instance");
    expect(win.focused).toBe(true);
  });

  test("the losing instance quits without creating a window", async () => {
    const { state } = await load({ singleInstance: false });
    expect(state.quitCalls).toBeGreaterThanOrEqual(1);
    expect(state.windows).toHaveLength(0);
    expect(state.session.request).toBeUndefined();
  });
});
