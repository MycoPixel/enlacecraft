export interface ServerStatus {
  state: "not-started" | "starting" | "ready" | "failed";
  error: string | null;
}

export interface UpdaterStatus {
  state: "idle" | "checking" | "downloading" | "downloaded" | "not-available" | "error";
  version: string | null;
  percent: number | null;
  error: string | null;
}

export interface SaveProjectResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface OpenFileResult {
  canceled: boolean;
  fileName?: string;
  content?: string;
  error?: string;
}

export interface ElectronBridge {
  isElectron: true;
  getNmrServerStatus: () => Promise<ServerStatus>;
  getStructure3DServerStatus: () => Promise<ServerStatus>;
  getIupacFallbackServerStatus: () => Promise<ServerStatus>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  quitAndInstallUpdate: () => Promise<boolean>;
  // Native "Save As" dialog for the project (.enlacecraft) format — see
  // electron/main.cjs's "dialog:save-project" handler. defaultName is just
  // the pre-filled filename suggestion; content is the already-serialized
  // project JSON (from io/project.ts's exportProject), written to disk
  // as-is by the main process. Only present in the desktop build; the web
  // build keeps using the browser download fallback (see TopBar.tsx).
  saveProjectFile: (defaultName: string, content: string) => Promise<SaveProjectResult>;
  // Native "Open" dialog covering every format this app can import
  // (.enlacecraft/.mol/.cdxml) in one picker — see electron/main.cjs's
  // "dialog:open-file" handler. Returns the file's raw text content
  // already read from disk, ready to hand to useFileImport() exactly like
  // a browser-read File's content would be.
  openFile: () => Promise<OpenFileResult>;
}

declare global {
  interface Window {
    // Only present when running inside the Electron desktop build (see
    // electron/preload.cjs) - undefined in the regular browser/webapp
    // build, so any use of this must check for its presence first.
    electron?: ElectronBridge;
  }
}
