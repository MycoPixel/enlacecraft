// Electron main process. Kept as plain CommonJS (.cjs) regardless of the
// rest of the project being ESM ("type": "module" in package.json), since
// Electron's main process is simplest and most compatible as CJS.
const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const nmrServer = require("./server.cjs");

// Set by `npm run electron:dev` to point at the Vite dev server instead of
// the built dist/ files, so you get hot reload while working on the app.
const devServerUrl = process.env.ELECTRON_START_URL;

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
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Discard changes", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Unsaved changes",
      message: "You have unsaved changes.",
      detail: "If you close now, your changes will be lost. Save your project first if you want to keep them.",
    });
    // event.preventDefault() here means "override the beforeunload's
    // attempt to prevent the unload", i.e. it lets the close proceed.
    if (choice === 0) event.preventDefault();
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

app.on("before-quit", () => {
  nmrServer.stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
