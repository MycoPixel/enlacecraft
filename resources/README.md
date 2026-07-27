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
