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
  // Reliable text copy (see src/io/clipboard.ts). The async Clipboard API is
  // not dependable from a file:// page, so the share link and other text
  // copies go through Electron's own clipboard instead. Resolves true when
  // the text was written.
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  // Opens a `#view=` share link in a separate, read-only window. Used by the
  // desktop "Open shared link…" action when the link was copied from another
  // machine (see electron/main.cjs's "share:open-window" handler).
  openShareLink: (token) => ipcRenderer.invoke("share:open-window", token),
  // Plain "Save" - writes to the file already chosen this session, no
  // dialog. Takes no path: the main process only ever writes to a path it
  // previously handed out itself, so a compromised renderer can't turn this
  // into an arbitrary-file-write primitive. Resolves
  // { hasTarget: false } when nothing has been saved or opened yet, which
  // the renderer treats as "fall back to Save As".
  saveProjectFileToCurrent: (content) => ipcRenderer.invoke("dialog:save-project-to", { content }),
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
});
