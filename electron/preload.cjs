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
});
