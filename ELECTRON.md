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
npm run dist:linux   # -> release/*.AppImage
npm run dist         # both, in one go
```

Linux builds AppImage only — `electron-updater`'s auto-update support doesn't
cover `.deb` installs, so there was no reason to keep publishing an update
path that would silently never trigger.

Each of these runs the normal web build first (`vite build`) and then wraps
that same `dist/` output with Electron via electron-builder. Output lands in
`release/` (gitignored, just like `dist/`).

**Cross-building note:** electron-builder can build a Windows installer from
Linux (and vice versa) in many setups, but it's most reliable to build each
target on its own OS, or use their CI action if you want both from one
machine. If `dist:win` fails on Linux, run it on an actual Windows machine
(or a Windows CI runner) instead. This is separate from, and stricter than,
the three bundled Python backends below (NMR prediction, 3D structure,
IUPAC-naming fallback) - those use PyInstaller, which genuinely cannot
cross-compile at all (not just "unreliable") - so a Windows build always
needs those three frozen on an actual Windows machine or VM, no way around
it, regardless of whether `dist:win` itself happens to work via Wine from
Linux.

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

**Important: freeze all three backends inside their pinned containers on
Linux.** One script per backend, each doing the freeze, the extra bundled
binary, the verification and the copy into `resources/` in one go — use them
instead of the manual steps above:

    ./python/freeze_in_container.sh      # nmrgraph_server   (Dockerfile.nmrgraph)
    ./python/freeze_structure3d.sh       # structure3d_server(Dockerfile.structure3d)
    ./python/freeze_iupac.sh             # iupac_fallback_server (Dockerfile.iupac)

All three build on `ubuntu:20.04` (glibc 2.31) with conda-forge's Python
3.12, because PyInstaller doesn't bundle glibc: a host-side freeze on a
recent distro yields an executable that demands a glibc almost no user has,
and it fails at startup on their machine rather than at build time on yours.
That's not hypothetical — all three backends in the 1.7.1 release died
exactly that way (`GLIBC_2.44 not found` on a glibc-2.43 machine), because
1.7.1 was frozen with the system Python 3.14 on a glibc-2.44 host rather than
in the pinned containers. Pinned as built, all three land at `GLIBC_2.17`.

Each backend's freeze logic and its container-specific extras live in its own
`Dockerfile.*`; the shared freeze/verify/smoke helpers are in
`python/freeze_lib.sh`, which also holds the single `MAX_GLIBC` constant
that the verification runs against.

The scripts verify the result rather than trusting it: each scans every ELF
file in the output for the highest `GLIBC_*` symbol it requires and fails the
build if that's above the target. That turns "works on the build machine,
broken on every user's" into a hard, immediate failure. Each also
smoke-tests the frozen binary against a *real* request, not just `/health`
— because `/health` returns 200 even when the backend's extra binary is
missing, so it can't detect the "builds fine, 503s on every real request"
failure mode on its own.

**Docker is required for the Linux freeze.** If it isn't installed, use the
host-side freeze in each folder's README for debugging a build failure — just
don't ship what it produces.

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

On Linux, use `./python/freeze_structure3d.sh` (see "freeze all three
backends inside their pinned containers" above) — it freezes inside
`python/Dockerfile.structure3d`, downloads the pinned xtb release binary
into the bundle, and copies the verified result to
`resources/structure3d_server/`. The old manual steps (freezing with
`pyinstaller` on the host, then `cp -r dist/... resources/`) are still
accurate for Windows, which must freeze on a Windows machine/VM.

`npm run dist:win` / `dist:linux` then picks it up automatically — see
`package.json`'s `build.extraResources` and `electron/structure3d_server.cjs`
(spawns it as `structure3d_server` / `structure3d_server.exe` on port 8001,
alongside the NMR server on 8000).

Same platform-specific caveat as NMRGraph: freeze it ON the target platform,
no cross-compiling. Same dev-mode behavior too - `electron:dev` /
`electron:preview` don't auto-start it; run
`uvicorn main:app --port 8001 --reload` yourself while developing (see that
folder's README). Console output is prefixed `[structure3d-server]`.

## Bundling the IUPAC-naming fallback server

The IUPAC name lookup normally goes straight to PubChem. When PubChem has no
name for the exact structure drawn (see `src/io/iupacFallback.ts`'s doc
comment for why that happens even for perfectly valid chemistry, and how
common it is for less-common structures), it falls back to a small local
service that generates a name and independently verifies it before ever
returning it. Same overall pattern as the two backends above - source lives
in this repo, at `python/iupac_fallback_server/` - with one added wrinkle:
this one wraps OPSIN, a Java library, so the frozen build needs a JVM
bundled alongside it too, not just Python.

1. On **Linux**, run `./python/freeze_iupac.sh` (see "freeze all three
   backends inside their pinned containers" above). It freezes inside
   `python/Dockerfile.iupac`, bundles a pinned Eclipse Temurin JRE (21.0.9+10,
   downloaded in the image) in as `jre/` alongside the executable, asserts
   the JRE is at the exact path `naming.py`'s `_bundled_jre_jvm_path()`
   looks for, smoke-tests `/name` (a real OPSIN round-trip, which needs the
   JVM), and copies the verified result to
   `resources/iupac_fallback_server/`.
   On **Windows**, run the platform build script from
   `python/iupac_fallback_server/`:
   ```
   .\build_windows.ps1
   ```
   which does the equivalent (freeze, pinned JRE, smoke test, copy to
   `resources/iupac_fallback_server/`).
2. `npm run dist:win` / `dist:linux` picks it up the same way - see
   `package.json`'s `build.extraResources` and
   `electron/iupac_fallback_server.cjs` (spawns it as `iupac_fallback_server`
   / `iupac_fallback_server.exe` on port 8002, alongside the other two on
   8000/8001).

**The bundled JRE is not optional.** A packaged end user has no system Java,
so if `jre/` is missing from the bundle the server starts (its `/health`
doesn't touch the JVM) but every `/name` call fails — OPSIN naming is simply
dead in the shipped app. `freeze_iupac.sh` checks for this specifically,
because it's exactly the kind of thing that "builds fine" and "breaks for
every user".

Same platform-specific caveat as the other two backends: freeze it ON the
target platform, no cross-compiling. Same dev-mode behavior too -
`electron:dev` / `electron:preview` don't auto-start it; run
`uvicorn main:app --port 8002 --reload` yourself while developing (needs a
plain system-installed Java 8+ in dev mode - see that folder's README for
why a packaged build doesn't need one). Console output is prefixed
`[iupac-fallback-server]`.

## Publishing a release

Built installers are published to the public
[MycoPixel/enlacecraft-releases](https://github.com/MycoPixel/enlacecraft-releases)
repo (see `package.json`'s `build.publish` config), which is what
`electron-updater` (`electron/updater.cjs`) checks against on every launch.
Publishing a new version there is what makes already-installed copies of the
app notice an update exists.

1. **Bump the version** in `package.json` (e.g. `1.1.0` → `1.1.1`). This
   becomes the release tag automatically — there's no separate manual
   tagging step. Pull/copy that change to both build machines (Windows,
   Linux) before building either, so they end up publishing to the same
   release instead of two different ones.
2. **Set a GitHub token** in the terminal you're building from —
   `export GH_TOKEN=...` (Linux) or `$env:GH_TOKEN="..."` (Windows
   PowerShell). Needs a fine-grained PAT scoped to only
   `enlacecraft-releases`, with Contents: Read and write. This is what lets
   electron-builder create the release on your behalf.
3. **Build and publish**, on each machine:
   ```
   npm install                              # only if package.json changed
   npm run dist:win -- --publish always     # Windows machine
   npm run dist:linux -- --publish always   # Linux machine
   ```
   `--publish always` is required — publishing never happens by default,
   even with `build.publish` configured, unless a CI environment is
   detected. Building both platforms under the same version number adds
   both to the same release rather than creating two.
4. **Review and publish the draft.** electron-builder creates the release as
   a draft, not public, by default. Open
   [the releases page](https://github.com/MycoPixel/enlacecraft-releases/releases),
   confirm the installers AND their small `latest*.yml` manifests are both
   attached (the `.yml` files are what `electron-updater` actually reads —
   an installer with no matching `.yml` silently won't be picked up as an
   update), then click **Publish release**. Until that click, it's invisible
   to `electron-updater` — GitHub's "latest release" only counts non-draft
   releases.

Once published, an already-running older copy of the app checks on its next
launch, downloads the update in the background, and shows "Restart to
update" in the status bar once it's ready.

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
- `build/icon.png` — at least 512×512, used for the Linux AppImage
- `build/icon.ico` — multi-resolution .ico, used for the Windows installer
