// Manages the bundled NMRGraph prediction server as a child process.
//
// Only used in a truly packaged build (app.isPackaged === true) - both
// `npm run electron:dev` and `npm run electron:preview` leave this
// untouched, so the existing manual dev workflow (run uvicorn or the
// frozen binary yourself) keeps working exactly as before. This only
// kicks in for a real `npm run dist:*` build, where there's no
// developer around to start a server by hand.
const { app } = require("electron");
const { spawn, exec } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const PORT = 8000;

let serverProcess = null;

// Simple in-memory status the renderer can poll via IPC (see
// preload.cjs / main.cjs's ipcMain.handle wiring) - useful for
// showing a "starting up" state instead of a generic network error
// on the very first prediction attempt right after launch.
const status = {
  state: "not-started", // "not-started" | "starting" | "ready" | "failed"
  error: null,
};

function getStatus() {
  return { ...status };
}

function getExecutablePath() {
  // electron-builder's extraResources (see package.json) copies the
  // PyInstaller onedir output into resources/nmrgraph_server/ inside
  // the packaged app - accessible at runtime via process.resourcesPath.
  const binaryName = process.platform === "win32" ? "nmrgraph_server.exe" : "nmrgraph_server";
  return path.join(process.resourcesPath, "nmrgraph_server", binaryName);
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/health", timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume(); // drain, don't care about the body here
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth({ timeoutMs = 30000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await checkHealth()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return false;
}

async function startServer() {
  if (!app.isPackaged) {
    console.log("[nmr-server] Skipping auto-start - not a packaged build. Run the server manually for dev/preview.");
    return;
  }

  const exePath = getExecutablePath();
  console.log(`[nmr-server] Starting: ${exePath}`);

  status.state = "starting";
  status.error = null;

  try {
    serverProcess = spawn(exePath, ["--port", String(PORT)], {
      // cwd doesn't actually matter for model-checkpoint resolution -
      // src/paths.py resolves relative to the executable's own
      // location (sys.executable), not the process cwd, specifically
      // so this wouldn't be fragile to how Electron invokes it.
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    console.error("[nmr-server] Failed to spawn:", error);
    status.state = "failed";
    status.error = String(error);
    return;
  }

  serverProcess.stdout.on("data", (data) => process.stdout.write(`[nmr-server] ${data}`));
  serverProcess.stderr.on("data", (data) => process.stderr.write(`[nmr-server] ${data}`));

  serverProcess.on("exit", (code, signal) => {
    console.log(`[nmr-server] Exited (code=${code}, signal=${signal})`);
    if (status.state !== "ready" || code !== 0) {
      // An exit before we ever saw it healthy, or a nonzero exit at
      // any point, means predictions won't work this session - but
      // the rest of the app (drawing, etc.) is unaffected, so this
      // is logged rather than surfaced as a blocking error.
      status.state = "failed";
      status.error = `Server process exited (code=${code})`;
    }
    serverProcess = null;
  });

  const healthy = await waitForHealth();

  if (healthy) {
    status.state = "ready";
    console.log("[nmr-server] Ready.");
  } else if (status.state === "starting") {
    // Still "starting" (not already flagged "failed" by the exit
    // handler above) but never became healthy within the timeout.
    status.state = "failed";
    status.error = "Server did not become healthy within the timeout.";
    console.error(`[nmr-server] ${status.error}`);
  }
}

function stopServer() {
  if (!serverProcess) return Promise.resolve();

  const proc = serverProcess;
  const pid = proc.pid;
  console.log(`[nmr-server] Stopping (pid=${pid})`);

  // Waits for the process to actually be gone rather than firing the
  // kill and immediately reporting done — the previous version did the
  // latter, which meant app quit could proceed (and, packaged, an
  // update installer could try to overwrite this .exe and its DLLs)
  // while nmrgraph_server.exe was still alive for a moment, still
  // holding its own files locked. That's the same class of bug as an
  // installer failing with "can't be closed": something outlives the
  // point the app claimed to have shut down.
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimeout);
      resolve();
    };
    // Safety net: taskkill or the exit event failing to fire shouldn't
    // hang app quit forever - a process that lingers a couple seconds
    // past its kill signal is a much smaller problem than an update
    // that can never install because we're waiting on it indefinitely.
    const safetyTimeout = setTimeout(finish, 4000);
    proc.once("exit", finish);

    if (process.platform === "win32") {
      // child.kill() is unreliable for console executables on Windows -
      // taskkill is the standard, actually-works fix.
      exec(`taskkill /pid ${pid} /f /t`);
    } else {
      proc.kill("SIGTERM");
    }
  });
  // serverProcess is nulled by the 'exit' listener already registered
  // in startServer(), once the process actually exits - not here.
}

module.exports = { startServer, stopServer, getStatus };
