// Preload script, runs in an isolated context with access to Node/Electron
// APIs before the page's own scripts run.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  // Status of the bundled NMR prediction server (only meaningful in a
  // packaged build - see electron/server.cjs). Returns
  // { state: "not-started" | "starting" | "ready" | "failed", error: string | null }.
  // Not consumed by the UI yet - available for NmrPredictionButton.tsx
  // to use later if you want a "starting up" state instead of relying
  // on the existing network-error handling for an early click.
  getNmrServerStatus: () => ipcRenderer.invoke("nmr-server:get-status"),
  // Status of the bundled GFN2-xTB 3D-refinement server (only
  // meaningful in a packaged build - see electron/structure3d_server.cjs).
  // Same shape as getNmrServerStatus above. Not consumed by the UI yet -
  // Molecule3DView.tsx currently relies on xtbRefine.ts's own network-
  // error handling instead, same as the NMR button does today.
  getStructure3DServerStatus: () => ipcRenderer.invoke("structure3d-server:get-status"),
  // Status of the bundled IUPAC-naming fallback server (only
  // meaningful in a packaged build - see
  // electron/iupac_fallback_server.cjs). Same shape as
  // getNmrServerStatus above. Not consumed by the UI yet -
  // io/iupacLookup.ts currently relies on io/iupacFallback.ts's own
  // network-error handling instead, same as the other two backends do
  // today.
  getIupacFallbackServerStatus: () => ipcRenderer.invoke("iupac-fallback-server:get-status"),
  // Status of the auto-updater (only meaningful in a packaged build -
  // see electron/updater.cjs). Returns
  // { state: "idle" | "checking" | "downloading" | "downloaded" | "not-available" | "error",
  //   version: string | null, percent: number | null, error: string | null }.
  // Not consumed by the UI yet - a "restart to update" prompt (e.g. in
  // the status bar) should poll this and show quitAndInstall() once
  // state is "downloaded".
  getUpdaterStatus: () => ipcRenderer.invoke("updater:get-status"),
  // Only takes effect once getUpdaterStatus() reports state:
  // "downloaded" - returns false (and does nothing) otherwise. Safe to
  // call unconditionally on a button click without checking state
  // first, but the button/prompt itself should still only be shown
  // once "downloaded", so the user isn't clicking something that does
  // nothing.
  quitAndInstallUpdate: () => ipcRenderer.invoke("updater:quit-and-install"),
  // See electron/main.cjs's "dialog:save-project" / "dialog:open-file"
  // handlers, and src/types/electron.d.ts for the return shapes.
  saveProjectFile: (defaultName, content) => ipcRenderer.invoke("dialog:save-project", { defaultName, content }),
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
});
