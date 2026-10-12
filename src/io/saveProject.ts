import { downloadBlob } from "./exportImage";

/**
 * Where a project save actually goes.
 *
 * Three builds need three different strategies, and the user should not be
 * asked to think about which one they have:
 *
 *  - **Desktop** writes through the main process, which keeps its own record
 *    of the file the user chose and can write back to it with no dialog. That
 *    is the whole point of the Save / Save As split; see
 *    electron/security.cjs's createProjectSaveTarget for why the path comes
 *    from the main process and never from here.
 *  - **Chromium browsers** get the same behaviour via the File System Access
 *    API: the picker returns a handle we keep for the rest of the session,
 *    and writing through it needs no further prompting.
 *  - **Everything else** (Firefox, Safari, and any browser without the API)
 *    falls back to a download, which always prompts. Save then behaves like
 *    Save As — honest rather than silently pretending to have saved.
 *
 * The handle is deliberately session-scoped and never persisted to IndexedDB.
 * A handle restored from disk would need its permission re-granted, and a
 * remembered destination from a previous session is exactly the thing that
 * makes a plain Save overwrite a file the user forgot they had open.
 */

export type SaveOutcome =
  /** Written. `name` is for display only. */
  | { kind: "saved"; name: string }
  /** No destination chosen yet — the caller must run Save As. */
  | { kind: "needs-dialog" }
  /** The user dismissed the picker. Not an error; the project is untouched. */
  | { kind: "canceled" }
  | { kind: "error"; message: string };

/** The browser File System Access handle for this session, if we have one. */
let browserHandle: FileSystemFileHandle | null = null;

interface FileSystemAccessCapableWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && typeof (window as FileSystemAccessCapableWindow).showSaveFilePicker === "function";
}

/** Last path segment, tolerating both Windows and POSIX separators. Electron
 * hands back native paths, which on Windows use backslashes that
 * String.split("/") would not split on. */
export function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Plain Save: write to the destination already chosen this session.
 * Returns `needs-dialog` when there isn't one yet, which is a normal state
 * for a project that has never been saved rather than a failure.
 */
export async function saveToCurrent(json: string): Promise<SaveOutcome> {
  // Desktop first: the main process owns the path, so we don't consult
  // browserHandle at all there.
  if (window.electron) {
    const result = await window.electron.saveProjectFileToCurrent(json);
    if (!result.hasTarget) return { kind: "needs-dialog" };
    if (result.error) return { kind: "error", message: result.error };
    return { kind: "saved", name: baseName(result.filePath ?? "") };
  }

  if (hasFileSystemAccess() && browserHandle) {
    try {
      const writable = await browserHandle.createWritable();
      await writable.write(json);
      await writable.close();
      return { kind: "saved", name: browserHandle.name };
    } catch (err) {
      // A revoked or read-only handle is recoverable: drop it so the next
      // Save goes back to asking, rather than failing forever.
      browserHandle = null;
      return { kind: "error", message: errorMessage(err) };
    }
  }

  return { kind: "needs-dialog" };
}

/**
 * Save As: always asks for a destination, and remembers it for subsequent
 * plain Saves. Writes through the same mechanisms as saveToCurrent.
 */
export async function saveAs(json: string, defaultName: string, extension: string): Promise<SaveOutcome> {
  if (window.electron) {
    const result = await window.electron.saveProjectFile(defaultName, json);
    if (result.canceled) return { kind: "canceled" };
    if (result.error) return { kind: "error", message: result.error };
    return { kind: "saved", name: baseName(result.filePath ?? "") };
  }

  if (hasFileSystemAccess()) {
    try {
      const handle = await (window as FileSystemAccessCapableWindow).showSaveFilePicker!({
        suggestedName: defaultName,
        types: [{ description: "EnlaceCraft project", accept: { [extension]: [] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      browserHandle = handle;
      return { kind: "saved", name: handle.name };
    } catch (err) {
      // AbortError is the user closing the picker — not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return { kind: "canceled" };
      return { kind: "error", message: errorMessage(err) };
    }
  }

  // No File System Access API: a download is the only option, and the
  // browser decides its own naming and prompts for a location. Reported as
  // "saved" so the dirty flag clears, but there is no remembered
  // destination, so the next plain Save will prompt again.
  downloadBlob(new Blob([json], { type: "application/json" }), defaultName);
  browserHandle = null;
  return { kind: "saved", name: defaultName };
}

/**
 * Forgets the remembered destination. Called when a new unsaved document
 * replaces the current one (Clear, or opening a non-project file), so a
 * later Save can't write over the file that was open before it.
 */
export function forgetSaveDestination(): void {
  browserHandle = null;
}

/** Test seam: the current session's remembered browser handle. */
export function currentBrowserHandle(): FileSystemFileHandle | null {
  return browserHandle;
}