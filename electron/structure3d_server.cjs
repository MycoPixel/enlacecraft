// Manages the bundled structure3d_server (GFN2-xTB 3D refinement)
// child process. A near-exact mirror of server.cjs (the NMR prediction
// server manager) — same packaged-only auto-start behavior, same
// health-check/status shape, same shutdown handling. Kept as a
// separate module/process/port (8001, vs. NMR's 8000) rather than
// merged into one server: the two are independently built, independently
// versioned Python projects (this one lives in this repo, at
// python/structure3d_server/; NMRGraph is external — see
// resources/README.md for both), so a bug or slow start in one
// shouldn't have any way to affect the other.
const { app } = require("electron");
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const logger = require("./logger.cjs");

const PORT = 8001;

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
  // python/structure3d_server's PyInstaller onedir output (plus the
  // bundled xtb/ folder — see python/structure3d_server/README.md)
  // into resources/structure3d_server/ inside the packaged app.
  const binaryName = process.platform === "win32" ? "structure3d_server.exe" : "structure3d_server";
  return path.join(process.resourcesPath, "structure3d_server", binaryName);
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
    console.log("[structure3d-server] Skipping auto-start - not a packaged build. Run it manually for dev/preview.");
    return;
  }

  const exePath = getExecutablePath();
  logger.log(`[structure3d-server] Starting: ${exePath}`);

  const exists = fs.existsSync(exePath);
  logger.log(`[structure3d-server] Executable exists at that path: ${exists}`);
  if (!exists) {
    status.state = "failed";
    status.error = `Executable not found at ${exePath}`;
    logger.log(`[structure3d-server] ${status.error}`);
    return;
  }

  status.state = "starting";
  status.error = null;

  try {
    serverProcess = spawn(exePath, ["--port", String(PORT)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Preventative, mirroring the fix in server.cjs (see that
        // file's comment for the full explanation) - not yet observed
        // here specifically, but this process likely shares the same
        // numpy/scipy dependency chain that caused it for nmrgraph_server,
        // so there's no reason to wait for the same bug to show up twice.
        KMP_DUPLICATE_LIB_OK: "TRUE",
      },
    });
  } catch (error) {
    console.error("[structure3d-server] Failed to spawn:", error);
    status.state = "failed";
    status.error = String(error);
    return;
  }

  serverProcess.stdout.on("data", (data) => process.stdout.write(`[structure3d-server] ${data}`));
  serverProcess.stderr.on("data", (data) => {
    process.stderr.write(`[structure3d-server] ${data}`);
    logger.log(`[structure3d-server] stderr: ${data}`);
  });

  serverProcess.on("exit", (code, signal) => {
    logger.log(`[structure3d-server] Exited (code=${code}, signal=${signal})`);
    if (status.state !== "ready" || code !== 0) {
      status.state = "failed";
      status.error = `Server process exited (code=${code})`;
    }
    serverProcess = null;
  });

  const healthy = await waitForHealth();

  if (healthy) {
    status.state = "ready";
    logger.log("[structure3d-server] Ready.");
  } else if (status.state === "starting") {
    status.state = "failed";
    status.error = "Server did not become healthy within the timeout.";
    logger.log(`[structure3d-server] ${status.error}`);
  }
}

function stopServer() {
  if (!serverProcess) return Promise.resolve();

  const proc = serverProcess;
  const pid = proc.pid;
  console.log(`[structure3d-server] Stopping (pid=${pid})`);

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
