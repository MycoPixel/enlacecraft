// Preload script, runs in an isolated context with access to Node/Electron
// APIs before the page's own scripts run. The app is currently fully
// self-contained in the renderer and doesn't need any native APIs, so
// nothing is exposed yet — this file exists as the wiring you'd extend if
// you later want native file save/open dialogs, OS clipboard access, etc.,
// via contextBridge.exposeInMainWorld(...).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
});
