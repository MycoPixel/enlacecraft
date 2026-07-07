// Electron main process. Kept as plain CommonJS (.cjs) regardless of the
// rest of the project being ESM ("type": "module" in package.json), since
// Electron's main process is simplest and most compatible as CJS.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");

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

  app.on("activate", () => {
    // macOS convention: re-create a window when the dock icon is clicked
    // and no windows are open. Harmless no-op on Windows/Linux.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
