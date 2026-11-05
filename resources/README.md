# resources/

## Always build these with the container scripts

Each of the three backends below has a freeze script that builds it inside a
pinned old-glibc container and copies the verified result straight into this
folder. Run them from the repo root:

    ./python/freeze_in_container.sh      # nmrgraph_server
    ./python/freeze_structure3d.sh       # structure3d_server
    ./python/freeze_iupac.sh             # iupac_fallback_server

**Don't freeze these by hand for a release build.** PyInstaller does not bundle
glibc — the frozen executable resolves it from whatever machine runs it —
so freezing on a recent distro produces a bundle that demands a glibc
almost no user has, and it fails at startup rather than at build time. That
is how all three backends in the released 1.7.1 AppImage broke: they died
with ``version `GLIBC_2.44' not found`` on a machine running glibc 2.43.
See `../python/Dockerfile.*` for the image pinning and `../python/freeze_lib.sh`
for the shared glibc check the scripts run on each result.

Each script also smoke-tests the frozen binary against a real request, not
just `/health` — `/health` returns 200 even when a backend's extra runtime
binary is missing, so it can't catch "builds fine, every real request fails".
The iupac one specifically checks the bundled JRE is present, because a
bundle missing `jre/` starts fine and then fails every `/name` call.

The host-side freeze (`pyinstaller` directly) is still fine for debugging
a build failure itself; just don't ship it. See each backend folder's
README.md for the Windows equivalents.

### If a freeze dies at the very end with "Permission denied"

On a host with SELinux in Enforcing mode (Fedora, RHEL), the freeze used to
die after ~5 minutes of apparently-successful PyInstaller output, right at
the `COLLECT` step:

    PermissionError: [Errno 13] Permission denied: '/src/dist/<bundle>'

That is SELinux, not the build: the container is denied write access to the
bind-mounted `dist/` folder even though it runs as root, so PyInstaller
completes Analysis/PYZ/EXE and only fails when it tries to create the output
directory. `freeze_lib.sh` now detects an enforcing SELinux host and adds
`--security-opt label=disable` to the `docker run` (see
`docker_selinux_flags` there for why the container opt-out is preferable to
`:z` relabeling the source tree). If you hit this on an older checkout, pull
that fix before re-running — otherwise you will burn a full container build
per backend and fail identically at the end.

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

