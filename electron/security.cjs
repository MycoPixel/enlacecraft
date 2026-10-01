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
const OPENABLE_EXTENSIONS = new Set([PROJECT_EXTENSION, ".mol", ".cdxml"]);

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
  ALLOWED_PERMISSIONS,
  isSafeExternalUrl,
  createTrustedUrlChecker,
  isTrustedSender,
  createPermissionHandlers,
  sanitizeSaveName,
  ensureProjectExtension,
  validateSaveRequest,
  isOpenableFile,
  writeFileAtomic,
  readOpenableFile,
  rotateLogIfNeeded,
};
