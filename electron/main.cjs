// Electron main process. Kept as plain CommonJS (.cjs) regardless of the
// rest of the project being ESM ("type": "module" in package.json), since
// Electron's main process is simplest and most compatible as CJS.
const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const nmrServer = require("./server.cjs");

// Set by `npm run electron:dev` to point at the Vite dev server instead of
// the built dist/ files, so you get hot reload while working on the app.
const devServerUrl = process.env.ELECTRON_START_URL;

// How long to wait for a response to the "you have unsaved changes"
// prompt before giving up and closing anyway. This app autosaves a
// recoverable snapshot ~1.5s after every edit (see useAutosave.ts), so
// letting a stalled close proceed after this timeout risks at most the
// last second or two of work, not the whole session - a far smaller
// problem than the window hanging open indefinitely with nothing able
// to answer the dialog, which is exactly what made a Windows installer
// unable to close the app to install an update.
const UNLOAD_PROMPT_TIMEOUT_MS = 15000;

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1b2027", // matches the app's dark theme-color, avoids a white flash on load
    autoHideMenuBar: true, // the app has its own in-page TopBar; hide Electron's default menu bar
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Any link the app tries to open in a new window/tab (e.g. target="_blank")
  // opens in the user's real OS browser instead of a second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // The renderer's `beforeunload` handler (App.tsx) prevents the page from
  // unloading when there are unsaved changes, exactly like it does in a
  // regular browser. But unlike a browser, Electron never shows a native
  // "leave site? changes may not be saved" dialog for that — it just
  // silently blocks the close, which looks like the close button did
  // nothing. `will-prevent-unload` is the event Electron fires instead, and
  // it's on us to show a dialog and decide whether to let the close through.
  win.webContents.on("will-prevent-unload", (event) => {
    // Deliberately does NOT call event.preventDefault() synchronously
    // here - that's what actually lets the close through, and we don't
    // know the user's answer yet. showMessageBox below is the async
    // version specifically so a dialog nobody can click (e.g. because
    // this close was triggered by an update installer trying to shut
    // the app down before overwriting its files, not by someone sitting
    // at the keyboard) doesn't block forever - the previous version
    // used the blocking showMessageBoxSync, which is exactly what could
    // leave the app stuck open with an installer reporting it "can't be
    // closed". If nothing answers within UNLOAD_PROMPT_TIMEOUT_MS, this
    // falls back to closing anyway (win.destroy() bypasses beforeunload
    // entirely rather than re-triggering this same event), trusting
    // autosave to have already captured the recent work.
    let settled = false;
    const forceClose = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      win.destroy();
    };
    const timeout = setTimeout(forceClose, UNLOAD_PROMPT_TIMEOUT_MS);

    dialog
      .showMessageBox(win, {
        type: "warning",
        buttons: ["Discard changes", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Unsaved changes",
        message: "You have unsaved changes.",
        detail: "If you close now, your changes will be lost. Save your project first if you want to keep them.",
      })
      .then(({ response }) => {
        if (settled) return; // already force-closed by the timeout
        clearTimeout(timeout);
        settled = true;
        if (response === 0) win.destroy();
        // response === 1 (Cancel): leave the window open, nothing to do.
      });
  });

  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  nmrServer.startServer(); // no-op in dev/preview - see server.cjs

  app.on("activate", () => {
    // macOS convention: re-create a window when the dock icon is clicked
    // and no windows are open. Harmless no-op on Windows/Linux.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Lets the renderer check whether the bundled NMR server is up yet
// (e.g. to show "starting up" instead of a generic network error on
// the very first prediction attempt right after launch). Not wired
// into the UI yet - this is the plumbing for that, ready to use
// whenever NmrPredictionButton.tsx wants it via
// window.electron.getNmrServerStatus().
ipcMain.handle("nmr-server:get-status", () => nmrServer.getStatus());

let quitConfirmed = false;
app.on("before-quit", (event) => {
  if (quitConfirmed) return; // already waited once - let this one through
  event.preventDefault();
  // Don't let the app (and, in a packaged build, the whole process tree
  // an update installer is watching) report itself quit until the
  // bundled NMR server child process has actually exited - see
  // server.cjs's stopServer() doc comment for why the previous
  // fire-and-forget version of this could leave a file lock behind
  // right as an installer tried to overwrite the install directory.
  nmrServer.stopServer().finally(() => {
    quitConfirmed = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
