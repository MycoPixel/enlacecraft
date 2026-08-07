# resources/

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

Rebuild and re-copy this whenever the model or backend code changes -
nothing here is auto-synced from the NMRGraph project.

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

