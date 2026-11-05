// Pure, Electron-free security helpers for main.cjs. Nothing in here
// requires "electron", so all of it is unit-testable in plain Node (see
// security.test.mjs) — main.cjs only wires these into real Electron
// events. Kept as CommonJS for the same reason main.cjs is.
const path = require("node:path");
const { fileURLToPath } = require("node:url");

/** Largest project/MOL/CDXML file the app will read or write (bytes).
 * Mirrors LIMITS.maxFileChars in src/io/validate.ts — keep in sync. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const PROJECT_EXTENSION = ".enlacecraft";

/** Mirrors MAX_SHARE_TOKEN_LENGTH in src/io/shareLink.ts — keep in sync. */
const MAX_SHARE_TOKEN_LENGTH = 48000;

/**
 * A `#view=` token is plain base64url behind a one-character format prefix
 * ("c." compressed or "u." plain). No path, query or whitespace can get into
 * the URL this way, which matters because the token is appended to a file URL.
 */
function isShareToken(value) {
  return (
    typeof value === "string" &&
    value.length > 2 &&
    value.length <= MAX_SHARE_TOKEN_LENGTH &&
    /^[cu]\.[A-Za-z0-9_-]+$/.test(value)
  );
}
// Structure formats the Open dialog / drag-onto-window flows may read.
// .smi/.smiles are plain-text SMILES files (one molecule per line, often
// "SMILES name" pairs) — parsed by io/smilesImport.ts on the renderer side.
// .sdf is a multi-record MDL SD file, parsed by io/molfile.ts's importSdf.
const OPENABLE_EXTENSIONS = new Set([PROJECT_EXTENSION, ".mol", ".sdf", ".cdxml", ".smi", ".smiles"]);

// ---------------------------------------------------------------------------
// External links
// ---------------------------------------------------------------------------

// shell.openExternal hands its argument to the OS, which will happily run
// file:, smb:, ms-msdt:, search-ms: and other custom-protocol handlers.
// Only ever forward the two schemes this app actually links to.
const SAFE_EXTERNAL_PROTOCOLS = new Set(["https:", "mailto:"]);

function isSafeExternalUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return false;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) return false;
  if (url.protocol === "https:") {
    // No credentials in the URL ("https://github.com@evil.example") and a real host.
    if (url.username || url.password || !url.hostname) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Which pages count as "our" app
// ---------------------------------------------------------------------------

/**
 * Returns `(url) => boolean`: true only for pages that are part of this app —
 * the Vite dev server origin when running `electron:dev`, otherwise any
 * file:// URL inside the built dist/ directory. Everything else (a remote
 * site, a file elsewhere on disk, about:blank) is untrusted, and so gets no
 * IPC access, no permissions and no navigation.
 */
function createTrustedUrlChecker({ devServerUrl, distDir }) {
  let devOrigin = null;
  if (devServerUrl) {
    try {
      devOrigin = new URL(devServerUrl).origin;
    } catch {
      devOrigin = null;
    }
  }
  const root = distDir ? path.resolve(distDir) : null;

  return function isTrustedUrl(raw) {
    if (typeof raw !== "string" || raw.length === 0) return false;
    let url;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    if (devServerUrl) return devOrigin !== null && url.origin === devOrigin;
    if (url.protocol !== "file:" || !root) return false;
    let target;
    try {
      target = path.resolve(fileURLToPath(url));
    } catch {
      return false;
    }
    const rel = path.relative(root, target);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
}

/**
 * IPC guard: the handler may only run for the top-level frame of a trusted
 * page. `event.senderFrame` is null if the frame is already gone, and a
 * sub-frame (an <iframe>) has a non-null `parent`.
 */
function isTrustedSender(event, isTrustedUrl) {
  const frame = event && event.senderFrame;
  if (!frame) return false;
  if (frame.parent != null) return false;
  return isTrustedUrl(frame.url);
}

// ---------------------------------------------------------------------------
// Permissions (camera, mic, geolocation, notifications... all denied)
// ---------------------------------------------------------------------------

// What the renderer legitimately needs: writing SMILES/names to the
// clipboard, and reading our own fragment format back for Ctrl+V.
const ALLOWED_PERMISSIONS = new Set(["clipboard-read", "clipboard-sanitized-write"]);

function createPermissionHandlers(isTrustedUrl) {
  const urlOf = (webContents, details) =>
    (details && (details.requestingUrl || details.embeddingOrigin)) || (webContents && webContents.getURL && webContents.getURL()) || "";
  return {
    request(webContents, permission, callback, details) {
      callback(ALLOWED_PERMISSIONS.has(permission) && isTrustedUrl(urlOf(webContents, details)));
    },
    check(webContents, permission, _requestingOrigin, details) {
      return ALLOWED_PERMISSIONS.has(permission) && isTrustedUrl(urlOf(webContents, details));
    },
  };
}

// ---------------------------------------------------------------------------
// File dialogs
// ---------------------------------------------------------------------------

/** A safe default file name for the Save dialog: no path parts, no reserved characters. */
function sanitizeSaveName(name) {
  let base = typeof name === "string" ? path.basename(name.replace(/\\/g, "/")) : "";
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "");
  if (base.length > 100) base = base.slice(0, 100);
  if (base === "") base = "molecule";
  return base.toLowerCase().endsWith(PROJECT_EXTENSION) ? base : base + PROJECT_EXTENSION;
}

function ensureProjectExtension(filePath) {
  return filePath.toLowerCase().endsWith(PROJECT_EXTENSION) ? filePath : filePath + PROJECT_EXTENSION;
}

/** Validates the payload of the "dialog:save-project" IPC call. */
function validateSaveRequest(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid save request" };
  const { defaultName, content } = payload;
  if (typeof content !== "string") return { ok: false, error: "Invalid save request" };
  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) {
    return { ok: false, error: "Project is too large to save (limit: 25 MB)" };
  }
  return { ok: true, defaultName: sanitizeSaveName(defaultName), content };
}

/** Validates the payload of the "dialog:save-project-to" IPC call — a save
 * to an already-chosen path, with no dialog (see createProjectSaveTarget).
 * Note that `filePath` is deliberately NOT read here: the main process
 * ignores whatever the renderer sends and uses the path it previously handed
 * out itself. Validating it would only create the impression that the value
 * is honoured. */
function validateSaveToRequest(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid save request" };
  const { content } = payload;
  if (typeof content !== "string") return { ok: false, error: "Invalid save request" };
  if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) {
    return { ok: false, error: "Project is too large to save (limit: 25 MB)" };
  }
  return { ok: true, content };
}

/**
 * Tracks the project file the user has already chosen, so a plain "Save" can
 * write back to it without re-prompting.
 *
 * WHY THIS IS STATEFUL RATHER THAN "THE RENDERER SENDS A PATH"
 * -----------------------------------------------------------
 * A save dialog is user consent: the path comes from the person, through the
 * OS. If the renderer could just name a path, a compromised renderer would
 * have an arbitrary-file-write primitive — it could overwrite anything the
 * user can write, with no prompt at all. So the main process remembers only
 * paths it handed out itself, from a dialog or from Open, and refuses
 * everything else. The renderer's idea of the current path is display-only
 * and is never used to choose where bytes land.
 *
 * Deliberately NOT persisted across restarts: a remembered path from a
 * previous session would let a plain Save overwrite a file the user may not
 * remember opening. Every session starts needing a Save As once.
 *
 * Only .enlacecraft paths are ever recorded. Opening a .mol or .cdxml and
 * pressing Save must start a Save As rather than overwrite the file that was
 * opened, which is a different format and would destroy it.
 */
function createProjectSaveTarget() {
  let current = null;
  return {
    /** Record a path the user just chose through a dialog or Open. */
    remember(filePath) {
      if (typeof filePath === "string" && filePath.toLowerCase().endsWith(PROJECT_EXTENSION)) {
        current = filePath;
      }
      return current;
    },
    /** The remembered path, or null if none this session. */
    get() {
      return current;
    },
    /** Forget it — used when a new unsaved document replaces the old one. */
    clear() {
      current = null;
    },
  };
}

function isOpenableFile(filePath) {
  return OPENABLE_EXTENSIONS.has(path.extname(String(filePath)).toLowerCase());
}

/**
 * Writes via a temp file + rename so a crash or power loss mid-save leaves
 * the previous version intact instead of a truncated project. If the
 * rename is refused (Windows: antivirus/OneDrive briefly holding the
 * target), falls back to a direct write rather than failing the save.
 * `fsp` is node:fs/promises (injected for testing).
 */
async function writeFileAtomic(fsp, filePath, content) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(tmp, content, "utf-8");
    try {
      await fsp.rename(tmp, filePath);
    } catch (err) {
      if (err && (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EXDEV")) {
        await fsp.writeFile(filePath, content, "utf-8");
        await fsp.unlink(tmp).catch(() => {});
      } else {
        throw err;
      }
    }
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }
}

/** Reads a user-picked file with type, extension and size checks. Returns { fileName, content } or throws an Error with a user-readable message. */
async function readOpenableFile(fsp, filePath) {
  if (!isOpenableFile(filePath)) throw new Error("Unsupported file type");
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw new Error("Not a regular file");
  if (stat.size > MAX_FILE_BYTES) throw new Error("File is too large (limit: 25 MB)");
  const content = await fsp.readFile(filePath, "utf-8");
  return { fileName: path.basename(filePath), content };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Rotates app.log -> app.old.log once it passes maxBytes (single generation). */
function rotateLogIfNeeded(fs, logPath, maxBytes = 1024 * 1024) {
  try {
    if (fs.statSync(logPath).size > maxBytes) fs.renameSync(logPath, logPath.replace(/\.log$/, ".old.log"));
  } catch {
    // no log yet, or rotation raced with another write — nothing to do
  }
}

module.exports = {
  MAX_FILE_BYTES,
  PROJECT_EXTENSION,
  MAX_SHARE_TOKEN_LENGTH,
  ALLOWED_PERMISSIONS,
  isShareToken,
  isSafeExternalUrl,
  createTrustedUrlChecker,
  isTrustedSender,
  createPermissionHandlers,
  sanitizeSaveName,
  ensureProjectExtension,
  validateSaveRequest,
  validateSaveToRequest,
  createProjectSaveTarget,
  isOpenableFile,
  writeFileAtomic,
  readOpenableFile,
  rotateLogIfNeeded,
};
