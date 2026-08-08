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
(or a Windows CI runner) instead. This is separate from, and stricter than,
the two bundled Python backends below (NMR prediction, 3D structure) - those
use PyInstaller, which genuinely cannot cross-compile at all (not just
"unreliable") - so a Windows build always needs those two frozen on an
actual Windows machine or VM, no way around it, regardless of whether
`dist:win` itself happens to work via Wine from Linux.

## Bundling the NMR prediction server

The NMR prediction feature needs a small Python/PyTorch backend, which lives
in a **separate project** (NMRGraph). For the packaged desktop build to work
without the end user installing Python/conda/anything, that backend gets
frozen into a standalone executable (via PyInstaller, in the NMRGraph repo)
and copied in here before running electron-builder.

**This copy step is manual, every time you rebuild the server** - it's not
automated yet:

1. In the NMRGraph project, build the frozen server (see its
   `packaging/README.md`):
   ```
   pyinstaller packaging/nmrgraph_server.spec
   ```
   Then copy the model checkpoints into the build output:
   ```
   cp data/models/*.pt dist/nmrgraph_server/data/models/
   ```

2. Copy the ENTIRE output folder into this project, at exactly this path:
   ```
   cp -r <path-to-NMRGraph>/dist/nmrgraph_server ./resources/nmrgraph_server
   ```
   `resources/nmrgraph_server/` is gitignored (it's a large generated
   artifact - regenerate it from NMRGraph rather than committing it).

3. Now `npm run dist:win` / `dist:linux` will pick it up automatically -
   `package.json`'s `build.extraResources` config bundles whatever's in
   `resources/nmrgraph_server/` into the installer, and
   `electron/server.cjs` spawns it (as `nmrgraph_server` on Linux,
   `nmrgraph_server.exe` on Windows) when the packaged app launches.

**Important: the frozen server is platform-specific.** A Linux build of
`nmrgraph_server` only runs on Linux - repeat step 1 ON a Windows machine to
get a Windows-compatible one before running `dist:win`. There's no
cross-compiling this part, unlike some of Electron's own cross-building
support mentioned above.

**Dev mode (`electron:dev` / `electron:preview`) does NOT auto-start this
server** - `electron/server.cjs` only spawns it in a truly packaged build
(`app.isPackaged === true`). While developing, keep running the server
yourself the way you already do (`uvicorn src.api.main:app --reload`, or the
frozen binary directly) - this was a deliberate choice to avoid hardcoding
machine-specific Python paths into the dev workflow.

**If predictions don't work in a packaged build**, check the app's console
output for lines prefixed `[nmr-server]` - `electron/server.cjs` logs the
server's own stdout/stderr through with that prefix, plus its own
start/stop/health-check status.

## Bundling the 3D structure server (GFN2-xTB)

The 3D panel's "Force field (MMFF94)" method needs nothing extra - it runs
entirely in the renderer (OpenChemLib, see `src/io/embed3d.ts`). Its "High
accuracy (GFN2-xTB)" method is the one that needs a backend, and follows the
exact same pattern as the NMR server above, with one difference: unlike
NMRGraph, its source lives **in this repo**, at `python/structure3d_server/`
- there's no separate project to go build first.

1. Follow `python/structure3d_server/README.md`'s "Bundling for a packaged
   Electron build" section - it has separate Linux and Windows walkthroughs
   (they differ more than you'd expect - conda-forge's Windows `xtb` build
   needs its DLLs bundled alongside it, unlike Linux's statically-linked
   binary). Freeze with PyInstaller, add `xtb`, then copy the result here:
   ```
   cp -r python/structure3d_server/dist/structure3d_server ./resources/structure3d_server
   ```
   `resources/structure3d_server/` is gitignored, same reasoning as
   `resources/nmrgraph_server/`.

2. `npm run dist:win` / `dist:linux` picks it up the same way - see
   `package.json`'s `build.extraResources` and
   `electron/structure3d_server.cjs` (spawns it as `structure3d_server` /
   `structure3d_server.exe` on port 8001, alongside the NMR server on 8000).

Same platform-specific caveat as NMRGraph: freeze it ON the target platform,
no cross-compiling. Same dev-mode behavior too - `electron:dev` /
`electron:preview` don't auto-start it; run
`uvicorn main:app --port 8001 --reload` yourself while developing (see that
folder's README). Console output is prefixed `[structure3d-server]`.

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
