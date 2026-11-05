// Wraps electron-updater's autoUpdater with the same lightweight
// status-object pattern as server.cjs/structure3d_server.cjs, so the
// renderer can show its own "checking / downloading / ready to
// restart" UI instead of relying on electron-updater's default native
// OS notification (checkForUpdatesAndNotify()).
//
// Only active in a packaged build (app.isPackaged === true) - there's
// no app-update.yml to read outside a real electron-builder build
// (electron-builder generates it from the "publish" config in
// package.json at build time), and autoUpdater throws if you call it
// without one.
const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

// Download automatically once an update is found (small, low-friction
// background work) but do NOT auto-install the moment it's ready.
// This app already has a careful unsaved-changes flow for closing the
// window (see main.cjs's will-prevent-unload handler) - silently
// restarting mid-edit would blow right past that. Instead: install is
// either triggered explicitly by the user (quitAndInstall(), wired to
// a "restart to update" prompt in the renderer) or happens naturally
// the next time they quit on their own, via autoInstallOnAppQuit.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
// Never install an older or pre-release build over a stable one, even if a
// release feed is tampered with or mis-tagged. (These are the defaults;
// spelled out so a future edit has to change them on purpose.)
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;

const status = {
  state: "idle", // "idle" | "checking" | "downloading" | "downloaded" | "not-available" | "error"
  version: null,
  percent: null,
  error: null,
};

function getStatus() {
  return { ...status };
}

function init() {
  if (!app.isPackaged) {
    console.log("[updater] Skipping - not a packaged build (no app-update.yml to read).");
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    status.state = "checking";
    console.log("[updater] Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    // autoDownload=true means the download starts immediately after
    // this fires - "downloading" is the more useful state for the UI
    // to show than a momentary "available".
    status.state = "downloading";
    status.version = info.version;
    status.percent = 0;
    console.log(`[updater] Update available: ${info.version} - downloading.`);
  });

  autoUpdater.on("update-not-available", () => {
    status.state = "not-available";
    console.log("[updater] Already on the latest version.");
  });

  autoUpdater.on("download-progress", (progress) => {
    status.percent = Math.round(progress.percent);
  });

  autoUpdater.on("update-downloaded", (info) => {
    status.state = "downloaded";
    status.version = info.version;
    status.percent = 100;
    console.log(`[updater] Update ${info.version} downloaded - ready to install.`);
  });

  autoUpdater.on("error", (error) => {
    status.state = "error";
    status.error = String(error);
    console.error("[updater] Error:", error);
  });

  autoUpdater.checkForUpdates().catch((error) => {
    // checkForUpdates() already emits 'error' above for most failure
    // modes, but a launch-time network failure (e.g. opened offline)
    // can reject this promise too - catching here just stops that
    // becoming an unhandled rejection. Missing one check isn't worth
    // surfacing to the user; the next launch tries again.
    console.error("[updater] checkForUpdates() rejected:", error);
  });
}

// Only proceeds if an update has actually finished downloading -
// calling electron-updater's quitAndInstall() with nothing downloaded
// yet is a no-op at best and a confusing error at worst, so the
// renderer's "restart to update" prompt should only appear once
// status.state === "downloaded" anyway, but this guards the IPC call
// itself too.
function quitAndInstall() {
  if (status.state !== "downloaded") return false;
  autoUpdater.quitAndInstall();
  return true;
}

module.exports = { init, getStatus, quitAndInstall };
