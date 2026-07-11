# Desktop builds (Windows / Linux)

This app can be packaged as a native desktop app with Electron: same codebase,
same features, just wrapped in its own window instead of a browser tab.

## One-time setup

```
npm install
```

(This downloads Electron's runtime binary the first time — needs a normal
internet connection, it's a ~100MB download per platform.)

## Development

```
npm run electron:dev
```

Runs the Vite dev server and opens it in an Electron window with hot reload,
same as `npm run dev` in a browser but in a native window.

## Building installers

```
npm run dist:win     # -> release/*.exe  (NSIS installer)
npm run dist:linux   # -> release/*.AppImage and release/*.deb
npm run dist         # both, in one go
```

Each of these runs the normal web build first (`vite build`) and then wraps
that same `dist/` output with Electron via electron-builder. Output lands in
`release/` (gitignored, just like `dist/`).

**Cross-building note:** electron-builder can build a Windows installer from
Linux (and vice versa) in many setups, but it's most reliable to build each
target on its own OS, or use their CI action if you want both from one
machine. If `dist:win` fails on Linux, run it on an actual Windows machine
(or a Windows CI runner) instead.

## Adding features later

There's only one app — you keep editing the same `src/` files as always.
`electron/main.cjs` and `electron/preload.cjs` are the only Electron-specific
files, and you likely won't need to touch them again unless you want native
OS integration (e.g. real file save/open dialogs instead of browser
downloads, which would go through `electron/preload.cjs`'s `contextBridge`).
Every new feature you add to `src/` shows up in the web version, the Windows
build, and the Linux build automatically the next time you run `npm run dist`.

## Icon

`build/icon.png` and `build/icon.ico` are placeholder icons (a simple
molecule glyph) so the build doesn't fail on a missing icon. Swap them out
for real branding whenever you have it:
- `build/icon.png` — at least 512×512, used for the Linux AppImage/.deb
- `build/icon.ico` — multi-resolution .ico, used for the Windows installer
