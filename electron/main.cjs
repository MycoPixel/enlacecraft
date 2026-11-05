// Electron main process. Kept as plain CommonJS (.cjs) regardless of the
// rest of the project being ESM ("type": "module" in package.json), since
// Electron's main process is simplest and most compatible as CJS.
const { app, BrowserWindow, shell, Menu, dialog, ipcMain, session, clipboard, nativeImage, ClipboardItem } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const nmrServer = require("./server.cjs");
const structure3dServer = require("./structure3d_server.cjs");
const iupacFallbackServer = require("./iupac_fallback_server.cjs");
const updater = require("./updater.cjs");
const security = require("./security.cjs");
const logger = require("./logger.cjs");

// Set by `npm run electron:dev` to point at the Vite dev server instead of
// the built dist/ files, so you get hot reload while working on the app.
const devServerUrl = process.env.ELECTRON_START_URL;

// "Is this URL part of our app?" — the dev server origin, or a file inside
// the built dist/. Gates IPC, permissions and navigation (see security.cjs).
const isTrustedUrl = security.createTrustedUrlChecker({ devServerUrl, distDir: path.join(__dirname, "../dist") });

// Only one running copy: a second launch would try to start a second set of
// backend servers on the same fixed ports (8000-8002) and fight the first.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

// Registers an IPC handler that refuses to run unless the caller is the
// top-level frame of one of OUR pages. Without this, anything that ever got
// script running in the window (or a navigation that slipped through) could
// call the same file-dialog/updater APIs the app itself uses.
function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!security.isTrustedSender(event, isTrustedUrl)) {
      logger.log(`[ipc] Rejected "${channel}" from an untrusted sender (${event.senderFrame ? event.senderFrame.url : "no frame"})`);
      throw new Error("Untrusted IPC sender");
    }
    return handler(event, ...args);
  });
}

// Applies to every WebContents this app ever creates, not just the main window.
app.on("web-contents-created", (_event, contents) => {
  // <webview> would let a page embed another with its own privileges.
  contents.on("will-attach-webview", (event) => event.preventDefault());

  // The window must never navigate away from the app. A link click to an
  // http(s) page opens in the real browser instead; anything else is dropped.
  contents.on("will-navigate", (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    if (security.isSafeExternalUrl(url)) shell.openExternal(url);
  });
  contents.on("will-redirect", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
});

// How long to wait for a response to the "you have unsaved changes"
// prompt before giving up and closing anyway. This app autosaves a
// recoverable snapshot ~1.5s after every edit (see useAutosave.ts), so
// letting a stalled close proceed after this timeout risks at most the
// last second or two of work, not the whole session - a far smaller
// problem than the window hanging open indefinitely with nothing able
// to answer the dialog, which is exactly what made a Windows installer
// unable to close the app to install an update.
const UNLOAD_PROMPT_TIMEOUT_MS = 15000;

/**
 * Builds one app window. `shareToken` turns it into a read-only shared-drawing
 * window (the same `#view=` route the web build uses) instead of an editor;
 * the token is appended as a URL fragment, never a path, and is validated by
 * the "share:open-window" handler before it gets here.
 */
function createWindow(shareToken = null) {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1b2027", // matches the app's dark theme-color, avoids a white flash on load
    autoHideMenuBar: true, // the app has its own in-page TopBar; hide Electron's default menu bar
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      safeDialogs: true, // a page can't spam alert()/confirm() dialogs
    },
  });

  // Any link the app tries to open in a new window/tab (e.g. target="_blank")
  // opens in the user's real OS browser instead of a second Electron window.
  // Only https: and mailto: are ever handed to the OS (see security.cjs);
  // file:, smb:, custom-protocol handlers etc. are refused.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (security.isSafeExternalUrl(url)) shell.openExternal(url);
    else logger.log(`[security] Blocked window.open to ${String(url).slice(0, 200)}`);
    return { action: "deny" };
  });

  // The renderer's `beforeunload` handler (App.tsx) prevents the page from
  // unloading when there are unsaved changes, exactly like it does in a
  // regular browser. But unlike a browser, Electron never shows a native
  // "leave site? changes may not be saved" dialog for that — it just
  // silently blocks the close, which looks like the close button did
  // nothing. `will-prevent-unload` is the event Electron fires instead, and
  // it's on us to show a dialog and decide whether to let the close through.
  win.webContents.on("will-prevent-unload", (_event) => {
    // Deliberately does NOT call event.preventDefault() synchronously
    // here - that's what actually lets the close through, and we don't
    // know the user's answer yet. showMessageBox below is the async
    // version specifically so a dialog nobody can click (e.g. because
    // this close was triggered by an update installer trying to shut
    // the app down before overwriting its files, not by someone sitting
    // at the keyboard) doesn't block forever - the previous version
    // used the blocking showMessageBoxSync, which is exactly what could
    // leave the app stuck open with an installer reporting it "can't be
    // closed". If nothing answers within UNLOAD_PROMPT_TIMEOUT_MS, this
    // falls back to closing anyway (win.destroy() bypasses beforeunload
    // entirely rather than re-triggering this same event), trusting
    // autosave to have already captured the recent work.
    let settled = false;
    const forceClose = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      win.destroy();
    };
    const timeout = setTimeout(forceClose, UNLOAD_PROMPT_TIMEOUT_MS);

    dialog
      .showMessageBox(win, {
        type: "warning",
        buttons: ["Discard changes", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Unsaved changes",
        message: "You have unsaved changes.",
        detail: "If you close now, your changes will be lost. Save your project first if you want to keep them.",
      })
      .then(({ response }) => {
        if (settled) return; // already force-closed by the timeout
        clearTimeout(timeout);
        settled = true;
        if (response === 0) win.destroy();
        // response === 1 (Cancel): leave the window open, nothing to do.
      });
  });

  if (devServerUrl) {
    win.loadURL(shareToken ? `${devServerUrl}#view=${shareToken}` : devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else if (shareToken) {
    win.loadFile(path.join(__dirname, "../dist/index.html"), { hash: `view=${shareToken}` });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return; // this is the losing second instance; app.quit() is already underway

  // Deny every permission request (camera, microphone, geolocation,
  // notifications, ...) except the two clipboard ones the app really uses,
  // and only for our own pages.
  const permissions = security.createPermissionHandlers(isTrustedUrl);
  session.defaultSession.setPermissionRequestHandler(permissions.request);
  session.defaultSession.setPermissionCheckHandler(permissions.check);

  // Don't use Menu.setApplicationMenu(null) here. On Windows/Linux, the
  // OS doesn't supply copy/paste/cut/select-all/undo/redo keyboard
  // shortcuts on its own - those only exist in Electron because they're
  // accelerators tied to the standard "Edit" menu's roles. A null menu
  // has no roles, so it silently kills those shortcuts app-wide (this is
  // how the NMR report's shift table ended up selectable with the mouse
  // but uncopyable with Ctrl+C on the Linux AppImage build).
  //
  // But the menu's accelerators must NOT be registered either. A
  // registered accelerator is consumed before the page ever sees the key,
  // and the roles' native commands (webContents.copy() etc.) only act on
  // real DOM text selections - which a canvas app never has. That is
  // exactly how Ctrl+C/V/A/Z went dead for canvas actions in the packaged
  // build while working in the browser: the menu swallowed the key and
  // then copied nothing, so the OS clipboard never received anything at
  // all. registerAccelerator: false keeps the menu (and, on macOS, the
  // standard menu-bar behavior) while every key reaches the page's own
  // keydown handlers (useClipboard / useKeyboardShortcuts), which know
  // whether the focus is the canvas (app-level copy/paste/undo/select-all)
  // or a text field (forwarded back here via "edit:native-command").
  // The click handlers below serve the menu itself being clicked
  // (Alt, then Edit) - clicks never produce a page keydown.
  const sendEditCommand = (command) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.send("edit:command", command);
  };
  const editMenuItem = (label, command, accelerator) => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => sendEditCommand(command),
  });
  const editMenu = Menu.buildFromTemplate([
    {
      label: "Edit",
      submenu: [
        editMenuItem("Undo", "undo", "CmdOrCtrl+Z"),
        editMenuItem("Redo", "redo", "Shift+CmdOrCtrl+Z"),
        { type: "separator" },
        editMenuItem("Cut", "cut", "CmdOrCtrl+X"),
        editMenuItem("Copy", "copy", "CmdOrCtrl+C"),
        editMenuItem("Paste", "paste", "CmdOrCtrl+V"),
        { type: "separator" },
        editMenuItem("Select All", "selectAll", "CmdOrCtrl+A"),
      ],
    },
  ]);
  Menu.setApplicationMenu(editMenu);
  createWindow();
  nmrServer.startServer(); // no-op in dev/preview - see server.cjs
  structure3dServer.startServer(); // no-op in dev/preview - see structure3d_server.cjs
  iupacFallbackServer.startServer(); // no-op in dev/preview - see iupac_fallback_server.cjs
  updater.init(); // no-op in dev/preview - see updater.cjs

  app.on("activate", () => {
    // macOS convention: re-create a window when the dock icon is clicked
    // and no windows are open. Harmless no-op on Windows/Linux.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Lets the renderer check whether the bundled NMR server is up yet
// (e.g. to show "starting up" instead of a generic network error on
// the very first prediction attempt right after launch). Not wired
// into the UI yet - this is the plumbing for that, ready to use
// whenever NmrPredictionButton.tsx wants it via
// window.electron.getNmrServerStatus().
handleTrusted("nmr-server:get-status", () => nmrServer.getStatus());
// Same idea as the NMR server's status IPC above, for the GFN2-xTB 3D
// refinement backend - see structure3d_server.cjs and, on the renderer
// side, preload.cjs's getStructure3DServerStatus().
handleTrusted("structure3d-server:get-status", () => structure3dServer.getStatus());
// Same idea again, for the IUPAC-naming fallback backend - see
// iupac_fallback_server.cjs and preload.cjs's
// getIupacFallbackServerStatus(). Not wired into the UI yet either -
// see io/iupacLookup.ts's own network-error handling, which covers
// this the same way NmrPredictionButton.tsx's does today.
handleTrusted("iupac-fallback-server:get-status", () => iupacFallbackServer.getStatus());
// Lets the renderer show its own "checking for updates / downloading /
// restart to update" UI - see updater.cjs. quit-and-install triggers
// the same before-quit sequence below (server shutdown, then
// autoUpdater's own quit-and-relaunch-installer flow), so it's just as
// safe to call as a normal window close.
handleTrusted("updater:get-status", () => updater.getStatus());
handleTrusted("updater:quit-and-install", () => updater.quitAndInstall());

// Text copy through the main process. See src/io/clipboard.ts for why the
// renderer does not rely on navigator.clipboard alone in the packaged build.
// The size cap mirrors the share-token ceiling; nothing here touches disk or
// the network.
handleTrusted("clipboard:write-text", async (_event, text) => {
  if (typeof text !== "string" || text.length > security.MAX_SHARE_TOKEN_LENGTH) return false;
  // writeText is async on Electron ≥ 44 (the whole clipboard module moved to
  // the W3C-shaped API). Awaiting keeps "resolved" meaning "on the OS
  // clipboard", not "queued" — a paste racing an uncommitted write would
  // read nothing at all.
  await clipboard.writeText(text);
  return true;
});

// Rich copy: text + HTML flavor + a native bitmap in one clipboard write,
// so a copied drawing pastes as a picture into Office/LibreOffice and as
// editable text (CDXML/MOL/SMILES) into chemistry-aware targets. Every
// field is optional and validated — the HTML is rendered by pasting apps
// as an image, never as live markup, and the PNG arrives as raw bytes.
// Text/html payloads are capped well above the share-token ceiling (a full
// serialized SVG with inlined fonts can reach hundreds of KB) but still
// bounded, so a hostile renderer can't wedge the main process with an
// unbounded string.
const MAX_CLIPBOARD_TEXT_LENGTH = 2_000_000;
handleTrusted("clipboard:write-rich", async (_event, payload) => {
  if (!payload || typeof payload !== "object") return false;
  const { text, html, png } = payload;
  if (text !== undefined && (typeof text !== "string" || text.length > MAX_CLIPBOARD_TEXT_LENGTH)) return false;
  if (html !== undefined && (typeof html !== "string" || html.length > MAX_CLIPBOARD_TEXT_LENGTH)) return false;
  // The PNG crosses IPC as a structured-cloned Uint8Array (verified on
  // Electron 44: a Uint8Array sent from the renderer arrives as a
  // Uint8Array, NOT a Buffer — Buffer.isBuffer() is false). Only a
  // Buffer created Node-side survives as one. Accept both byte-container
  // types or every PNG-bearing rich copy would be rejected here and
  // silently fall back to the renderer's web path.
  if (png !== undefined && !(Buffer.isBuffer(png) || png instanceof Uint8Array)) return false;
  const pngBytes = png === undefined || png.length === 0 ? null : Buffer.isBuffer(png) ? png : Buffer.from(png);
  if (!html && !pngBytes && !(typeof text === "string" && text.length > 0)) return false;

  if (typeof ClipboardItem === "function") {
    // Electron ≥ 44: the clipboard module exposes the W3C-shaped API —
    // write() takes MIME-typed ClipboardItem entries, and the legacy
    // object form ({ text, html, image }) now throws "clipboard.write
    // expects an array of ClipboardItem". The PNG rides as a Blob under
    // image/png, which Chromium turns into the platform bitmap flavor
    // (CF_DIB on Windows) that Office apps paste; text/html becomes
    // CF_HTML and text/plain CF_UNICODETEXT, all in one atomic write.
    const itemData = {};
    if (typeof text === "string" && text.length > 0) itemData["text/plain"] = text;
    if (typeof html === "string" && html.length > 0) itemData["text/html"] = html;
    if (pngBytes) itemData["image/png"] = new Blob([pngBytes], { type: "image/png" });
    try {
      await clipboard.write([new ClipboardItem(itemData)]);
    } catch (err) {
      logger.log(`[clipboard] rich write failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    return true;
  }

  // Legacy Electron (< 44): the plain object write with a nativeImage
  // bitmap. Kept so this main process still runs against older pins.
  const legacy = {};
  if (typeof text === "string" && text.length > 0) legacy.text = text;
  if (typeof html === "string" && html.length > 0) legacy.html = html;
  if (pngBytes) legacy.image = nativeImage.createFromBuffer(pngBytes);
  if (Object.keys(legacy).length === 0) return false;
  clipboard.write(legacy);
  return true;
});

// Native editor commands for the desktop build - the other half of the Edit
// menu arrangement at the top of app.whenReady(): with the menu accelerators
// unregistered, a keydown that lands in a text field reaches the renderer's
// handlers instead of the menu, and those forward the command here so the
// focused input edits through exactly one channel. Verified on Electron 44:
// Chromium DOES have built-in input-edit bindings for these keys in text
// fields, so the renderer preventDefaults the key and this forwarded command
// is the one and only action - running both was the "pasted twice in a row"
// report (Ctrl+V pasted the clipboard text twice). The Edit menu's click
// handlers send the same commands over this IPC. Command names are
// whitelisted; anything else is refused rather than looked up on the sender.
const NATIVE_EDIT_COMMANDS = new Set(["undo", "redo", "cut", "copy", "paste", "selectAll"]);
handleTrusted("edit:native-command", (event, command) => {
  if (typeof command !== "string" || !NATIVE_EDIT_COMMANDS.has(command)) return false;
  event.sender[command]();
  return true;
});

// Opens a shared drawing in its own window (same `#view=` route as the web
// build). Tokens are validated before being put in a URL; a malformed one is
// rejected rather than loaded.
handleTrusted("share:open-window", (_event, token) => {
  if (!security.isShareToken(token)) return false;
  createWindow(token);
  return true;
});

// Native "Save As" for the project format (see src/io/project.ts /
// PROJECT_FILE_EXTENSION) — the renderer already has the fully serialized
// JSON in hand (same string the web build would hand to a browser
// download), this just asks the OS where to put it and writes it there
// instead. Returning { error } rather than throwing/rejecting: a failed
// write (permissions, full disk, a removable drive pulled mid-save) is an
// expected-enough outcome that the renderer should show a normal status
// message for it, not treat it as an IPC-layer failure.
//
// Hardened: the payload is validated (string content, size cap, file name
// stripped of path parts), the chosen path always ends in .enlacecraft, and
// the write goes through a temp file + rename so a crash mid-save can't
// leave a truncated project where the previous good one was.
// The project file the user has already chosen this session, so a plain
// "Save" can write back to it without re-prompting — see
// security.createProjectSaveTarget's doc comment for why the renderer is not
// allowed to name this path itself.
const projectSaveTarget = security.createProjectSaveTarget();

handleTrusted("dialog:save-project", async (event, payload) => {
  const request = security.validateSaveRequest(payload);
  if (!request.ok) return { canceled: false, error: request.error };
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Save project",
    defaultPath: request.defaultName,
    filters: [{ name: "EnlaceCraft project", extensions: ["enlacecraft"] }],
  });
  if (canceled || !filePath) return { canceled: true };
  const target = security.ensureProjectExtension(filePath);
  try {
    await security.writeFileAtomic(fs, target, request.content);
    projectSaveTarget.remember(target);
    return { canceled: false, filePath: target };
  } catch (err) {
    return { canceled: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Plain "Save": writes to the path already chosen this session, with no
// dialog. `hasTarget: false` is a normal outcome, not an error — it means the
// project has never been saved and the renderer should fall back to Save As.
// No path is accepted from the renderer here; see createProjectSaveTarget.
handleTrusted("dialog:save-project-to", async (event, payload) => {
  const request = security.validateSaveToRequest(payload);
  if (!request.ok) return { canceled: false, error: request.error };
  const target = projectSaveTarget.get();
  if (!target) return { hasTarget: false };
  try {
    await security.writeFileAtomic(fs, target, request.content);
    return { hasTarget: true, canceled: false, filePath: target };
  } catch (err) {
    return { hasTarget: true, canceled: false, filePath: target, error: err instanceof Error ? err.message : String(err) };
  }
});

// Native "Open" covering every format this app imports in one picker —
// mirrors the browser <input accept=".mol,.sdf,.cdxml,.enlacecraft"> in
// TopBar.tsx. Reads the file here (main process has real filesystem
// access; the renderer, even in Electron, does not) and hands the raw
// text straight back — the renderer's useFileImport() hook then parses it
// exactly the same way it would a browser-read File's content, so the
// two paths share all their actual import logic.
//
// Hardened: only .enlacecraft/.mol/.sdf/.cdxml, only regular files, and
// nothing over 25 MB is read into memory (see security.readOpenableFile).
handleTrusted("dialog:open-file", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Open",
    properties: ["openFile"],
    filters: [
      { name: "All supported files", extensions: ["enlacecraft", "mol", "sdf", "cdxml", "smi", "smiles", "svg"] },
      { name: "EnlaceCraft project", extensions: ["enlacecraft"] },
      { name: "MDL Molfile", extensions: ["mol"] },
      { name: "MDL SD file", extensions: ["sdf"] },
      { name: "ChemDraw XML", extensions: ["cdxml"] },
      { name: "SMILES", extensions: ["smi", "smiles"] },
      { name: "SVG with embedded structure", extensions: ["svg"] },
    ],
  });
  if (canceled || filePaths.length === 0) return { canceled: true };
  try {
    const { fileName, content } = await security.readOpenableFile(fs, filePaths[0]);
    // Remembered so a later plain "Save" writes back to the file that was
    // just opened, which is what every editor does. createProjectSaveTarget
    // only accepts .enlacecraft, so opening a .mol or .cdxml leaves the save
    // target alone and Save will prompt for a new project file instead of
    // overwriting the imported one.
    projectSaveTarget.remember(filePaths[0]);
    return { canceled: false, fileName, content, filePath: filePaths[0] };
  } catch (err) {
    return { canceled: false, error: err instanceof Error ? err.message : String(err) };
  }
});

let quitConfirmed = false;
app.on("before-quit", (event) => {
  if (quitConfirmed) return; // already waited once - let this one through
  event.preventDefault();
  // Don't let the app (and, in a packaged build, the whole process tree
  // an update installer is watching) report itself quit until all
  // bundled backend child processes have actually exited - see
  // server.cjs's stopServer() doc comment for why the previous
  // fire-and-forget version of this could leave a file lock behind
  // right as an installer tried to overwrite the install directory.
  // Run in parallel rather than sequenced - there's no shared resource
  // contention between any of the three (still true, per the original
  // version of this comment, written when there were only two), and
  // this path is now also what runs before electron-updater's
  // quitAndInstall() hands off to the installer (see updater.cjs).
  // electron-updater has its own limited patience for the app to
  // actually finish quitting before it proceeds
  // regardless; each server already has its own 4s safety net below,
  // so sequential (up to ~12s worst case, now that there are three)
  // risked losing that race in a way parallel (up to ~4s worst case)
  // doesn't.
  Promise.all([nmrServer.stopServer(), structure3dServer.stopServer(), iupacFallbackServer.stopServer()]).finally(() => {
    quitConfirmed = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
