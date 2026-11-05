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

/**
 * Result of a plain (no-dialog) Save.
 *
 * `hasTarget: false` is a normal outcome, not an error: the project has never
 * been saved or opened in this session, so there is nothing to write back to
 * and the caller should fall back to Save As. `error` is only set when a
 * target existed but the write failed (disk full, file locked, permissions).
 */
export interface SaveProjectToCurrentResult {
  hasTarget: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

export interface OpenFileResult {
  canceled: boolean;
  fileName?: string;
  content?: string;
  /** The path actually opened. The renderer only uses this for display — the
   * main process separately remembers it as the save target, and is the only
   * thing allowed to decide where a later plain Save writes. */
  filePath?: string;
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
  /** Copies text through Electron's own clipboard. Resolves true when it was
   * written. Used instead of the async Clipboard API from `file:` pages,
   * where that API is not dependable — see src/io/clipboard.ts. */
  writeClipboardText: (text: string) => Promise<boolean>;
  /** Rich copy through Electron's own clipboard: writes text plus an HTML
   * flavor and a native bitmap where provided, so a copied drawing pastes
   * as a picture into Office/LibreOffice *and* as editable text into
   * chemistry-aware targets — see src/io/clipboard.ts writeClipboardPayload.
   * `png` is the raw bytes of a PNG blob. Resolves true when written. */
  writeClipboardRich: (payload: { text?: string; html?: string; png?: Uint8Array }) => Promise<boolean>;
  /** Runs a native editor command on the sending WebContents (undo/redo/
   * cut/copy/paste/selectAll). Part of the desktop Edit menu arrangement —
   * the menu does not register its accelerators, so keys pressed in a text
   * field are forwarded here by the renderer's keydown handlers. See
   * electron/main.cjs's "edit:native-command" handler and io/nativeEdit.ts.
   * Resolves true when the command was known. */
  nativeEditCommand: (command: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll") => Promise<boolean>;
  /** Subscribes to commands sent by the application Edit menu's click
   * handlers (which produce no page keydown). Returns an unsubscribe
   * function. See electron/main.cjs's edit-menu construction. */
  onEditCommand: (callback: (command: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll") => void) => () => void;
  /** Opens a read-only `#view=` share link in its own app window, so a link
   * copied from another machine can be viewed in the desktop build without
   * leaving for a browser. Resolves false when the token was rejected. */
  openShareLink: (token: string) => Promise<boolean>;
  // Plain "Save": writes to the file already chosen this session with no
  // dialog. Deliberately takes no path argument — see the comment in
  // electron/preload.cjs and security.createProjectSaveTarget for why the
  // renderer isn't allowed to name the destination.
  saveProjectFileToCurrent: (content: string) => Promise<SaveProjectToCurrentResult>;
  // Native "Open" dialog covering every format this app can import
  // (.enlacecraft/.mol/.sdf/.cdxml) in one picker — see electron/main.cjs's
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
