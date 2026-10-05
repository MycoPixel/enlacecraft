# resources/

## The NMR backend must be built with the container script

`python/freeze_in_container.sh` freezes the NMR prediction backend inside a
pinned old-glibc container and copies the verified result straight into
this folder:

    ./python/freeze_in_container.sh

**Don't freeze it by hand for a release build.** PyInstaller does not bundle
glibc — the frozen executable resolves it from whatever machine runs it —
so freezing on a recent distro produces a bundle that demands a glibc
almost no user has, and it fails at startup rather than at build time. That
is how all three backends in the released 1.7.1 AppImage broke: they died
with ``version `GLIBC_2.44' not found`` on a machine running glibc 2.43.
See `../python/Dockerfile.nmrgraph` for the image pinning, and
`../python/freeze_in_container.sh` for the glibc check it runs on the
result.

The host-side freeze (`pyinstaller` directly) is still fine for debugging
a build failure itself; just don't ship it.

The other two backends don't have a container script yet — see each
folder's own README.md. They have the same glibc exposure, so the same
pinning applies when they get one.

## nmrgraph_server/

`nmrgraph_server/` (gitignored, not present until you create it) is where
the frozen NMR prediction backend goes before running `npm run dist:*`.

See "Bundling the NMR prediction server" in ../ELECTRON.md for the exact
steps. Short version: it's a copy of NMRGraph's
`dist/nmrgraph_server/` (PyInstaller output), including the model
checkpoints, placed here as:

    resources/nmrgraph_server/nmrgraph_server        (Linux)
    resources/nmrgraph_server/nmrgraph_server.exe     (Windows)
    resources/nmrgraph_server/data/models/*.pt
    resources/nmrgraph_server/... (all of PyInstaller's other output files)

Rebuild and re-copy this whenever the model or backend code changes.
NMRGraph is a git submodule (see `../.gitmodules`), so `git submodule
update` pulls in upstream changes - but nothing here is auto-synced, and
the submodule pointer only moves when you commit it.

## structure3d_server/

`structure3d_server/` (also gitignored) is the equivalent for the
GFN2-xTB 3D-refinement backend — unlike NMRGraph, its source lives in
this repo at `../python/structure3d_server/`, since it has no external
model checkpoint dependency. See that folder's own README.md for exactly
how to freeze it (PyInstaller) and what to copy here:

    resources/structure3d_server/structure3d_server        (Linux)
    resources/structure3d_server/structure3d_server.exe     (Windows)
    resources/structure3d_server/xtb/bin/xtb (or xtb.exe)
    resources/structure3d_server/... (all of PyInstaller's other output files)

