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

export interface ElectronBridge {
  isElectron: true;
  getNmrServerStatus: () => Promise<ServerStatus>;
  getStructure3DServerStatus: () => Promise<ServerStatus>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  quitAndInstallUpdate: () => Promise<boolean>;
}

declare global {
  interface Window {
    // Only present when running inside the Electron desktop build (see
    // electron/preload.cjs) - undefined in the regular browser/webapp
    // build, so any use of this must check for its presence first.
    electron?: ElectronBridge;
  }
}
