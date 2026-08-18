// Packaged Electron apps on Windows run as a GUI-subsystem executable,
// so a plain double-click launch has no visible console — console.log
// output from server.cjs/structure3d_server.cjs/main.cjs goes nowhere
// anyone can see. This mirrors every log line to a plain text file
// instead, so diagnosing a "why didn't the bundled server start"
// report doesn't depend on getting a terminal/devtools attached to a
// user's machine first.
//
// Safe to require before app.isReady() (getExecutablePath()-style
// callers may log early) - the log directory is created lazily on
// first write, not at require time.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function getLogPath() {
  return path.join(app.getPath("userData"), "logs", "app.log");
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    const logPath = getLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line + "\n");
  } catch {
    // Logging is a diagnostic nicety, not something that should ever
    // take the app down - a disk-full or permissions failure here
    // just means this particular line only reaches the (invisible)
    // console instead of the file too.
  }
}

module.exports = { log, getLogPath };
