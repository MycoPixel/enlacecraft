// Manages the bundled iupac_fallback_server child process. A near-exact
// mirror of server.cjs and structure3d_server.cjs — same packaged-only
// auto-start behavior, same health-check/status shape, same shutdown
// handling. Kept as a separate module/process/port (8002, vs. NMR's
// 8000 and structure3d's 8001) for the same reason those two are kept
// separate from each other: independently built, independently
// versioned pieces (this one lives in this repo, at
// python/iupac_fallback_server/ — see resources/README.md), so a bug
// or slow start in one shouldn't have any way to affect the others.
//
// One difference from the other two: this backend also bundles its own
// portable JRE (OPSIN, the naming library it wraps, needs a JVM) —
// nothing to do with routing here, since naming.py's start_jvm() finds
// that bundled JRE itself once this process is running (see that
// file's _bundled_jre_jvm_path()). It's mentioned here only because
// it's why this backend's resources/iupac_fallback_server/ folder is
// larger than you'd expect from the Python code alone.
const { app } = require("electron");
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const logger = require("./logger.cjs");

const PORT = 8002;

let serverProcess = null;

const status = {
  state: "not-started", // "not-started" | "starting" | "ready" | "failed"
  error: null,
};

function getStatus() {
  return { ...status };
}

function getExecutablePath() {
  // electron-builder's extraResources (see package.json) copies
  // python/iupac_fallback_server's PyInstaller onedir output (plus the
  // bundled jre/ folder — see python/iupac_fallback_server/README.md)
  // into resources/iupac_fallback_server/ inside the packaged app.
  const binaryName = process.platform === "win32" ? "iupac_fallback_server.exe" : "iupac_fallback_server";
  return path.join(process.resourcesPath, "iupac_fallback_server", binaryName);
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/health", timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
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
    console.log("[iupac-fallback-server] Skipping auto-start - not a packaged build. Run it manually for dev/preview.");
    return;
  }

  const exePath = getExecutablePath();
  logger.log(`[iupac-fallback-server] Starting: ${exePath}`);

  const exists = fs.existsSync(exePath);
  logger.log(`[iupac-fallback-server] Executable exists at that path: ${exists}`);
  if (!exists) {
    status.state = "failed";
    status.error = `Executable not found at ${exePath}`;
    logger.log(`[iupac-fallback-server] ${status.error}`);
    return;
  }

  status.state = "starting";
  status.error = null;

  try {
    serverProcess = spawn(exePath, ["--port", String(PORT)], {
      stdio: ["ignore", "pipe", "pipe"],
      // Unlike server.cjs / structure3d_server.cjs, no KMP_DUPLICATE_LIB_OK
      // override here — that works around a numpy+torch-specific OpenMP
      // clash (see server.cjs's comment), and this backend's dependency
      // chain (RDKit, JPype, an embedded JVM) doesn't include either of
      // those, so there's no known reason to expect the same issue. If a
      // similar duplicate-runtime error ever shows up in this backend's
      // own logs, that comment explains the fix.
      env: { ...process.env },
    });
  } catch (error) {
    console.error("[iupac-fallback-server] Failed to spawn:", error);
    status.state = "failed";
    status.error = String(error);
    return;
  }

  serverProcess.stdout.on("data", (data) => process.stdout.write(`[iupac-fallback-server] ${data}`));
  serverProcess.stderr.on("data", (data) => {
    process.stderr.write(`[iupac-fallback-server] ${data}`);
    logger.log(`[iupac-fallback-server] stderr: ${data}`);
  });

  serverProcess.on("exit", (code, signal) => {
    logger.log(`[iupac-fallback-server] Exited (code=${code}, signal=${signal})`);
    if (status.state !== "ready" || code !== 0) {
      status.state = "failed";
      status.error = `Server process exited (code=${code})`;
    }
    serverProcess = null;
  });

  const healthy = await waitForHealth();

  if (healthy) {
    status.state = "ready";
    logger.log("[iupac-fallback-server] Ready.");
  } else if (status.state === "starting") {
    status.state = "failed";
    status.error = "Server did not become healthy within the timeout.";
    logger.log(`[iupac-fallback-server] ${status.error}`);
  }
}

function stopServer() {
  if (!serverProcess) return Promise.resolve();

  const proc = serverProcess;
  const pid = proc.pid;
  console.log(`[iupac-fallback-server] Stopping (pid=${pid})`);

  // See server.cjs's stopServer() for why this waits for the actual
  // exit rather than firing-and-forgetting the kill signal.
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimeout);
      resolve();
    };
    const safetyTimeout = setTimeout(finish, 4000);
    proc.once("exit", finish);

    if (process.platform === "win32") {
      execFile("taskkill", ["/pid", String(pid), "/f", "/t"], () => {}); // argv array, no shell
    } else {
      proc.kill("SIGTERM");
    }
  });
}

module.exports = { startServer, stopServer, getStatus };
