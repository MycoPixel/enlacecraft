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
});
