# structure3d_server

Backend for EnlaceCraft's "High accuracy (GFN2-xTB)" 3D structure method.
A small FastAPI service that takes a starting 3D structure (the frontend
already generates one client-side via OpenChemLib/MMFF94 — see
`src/io/embed3d.ts`) and refines it with **GFN2-xTB**, a real
semi-empirical quantum-mechanical method, via the `xtb` command-line
program. See the module docstring in `main.py` for the fuller design
rationale (why refine rather than embed from scratch, why shell out to
the `xtb` binary instead of a Python binding).

This mirrors the NMRGraph prediction server's existing pattern in this
app (small uvicorn/FastAPI service, `/health` + one real endpoint,
spawned and health-checked by Electron in packaged builds — see
`../../electron/server.cjs`) rather than introducing a new architecture.

## Prerequisites

- Python 3.10+
- The `xtb` binary on your `PATH` (this is the one non-pip dependency).
  If you're already using micromamba/conda for other environments here:

  ```
  micromamba create -n structure3d -c conda-forge python=3.11 xtb
  micromamba activate structure3d
  ```

  Otherwise, prebuilt binaries are published at
  https://github.com/grimme-lab/xtb/releases (grab the linux-x86_64
  archive — it's statically linked, so `bin/xtb` alone works with
  nothing else to put on your `LD_LIBRARY_PATH`).

## Running for development

```
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --port 8001 --reload
```

Then `curl http://localhost:8001/health` — `xtb_available` should be
`true`. If it's `false`, `xtb` isn't on `PATH` (or set `XTB_BIN` to its
full path as an escape hatch — see `find_xtb_binary()` in `main.py`).

The frontend's `src/io/xtbRefine.ts` expects this service at
`http://localhost:8001` — same convention as NMRGraph's port 8000.

## Bundling for a packaged Electron build

Same shape as NMRGraph's bundling step (see "Bundling the NMR prediction
server" in `../../ELECTRON.md`), summarized here:

1. Freeze this service:
   ```
   .venv/bin/pip install -r requirements-build.txt
   .venv/bin/pyinstaller --onedir --name structure3d_server main.py
   ```
   Output lands in `dist/structure3d_server/`.

2. Alongside the frozen executable, add an `xtb/` folder containing the
   `xtb` release binary — i.e. `dist/structure3d_server/xtb/bin/xtb`.
   Use the official GitHub-release binary for this step specifically
   (not a conda-forge install) — it's statically linked, so there's no
   `lib/` directory or `LD_LIBRARY_PATH` to also bundle. `find_xtb_binary()`
   in `main.py` looks for exactly this layout next to the frozen
   executable when running packaged. (Windows: `xtb/bin/xtb.exe`.)

3. Copy the whole `dist/structure3d_server/` folder to
   `../../resources/structure3d_server/` in the main EnlaceCraft repo —
   see `../../resources/README.md`.

4. Rebuild EnlaceCraft (`npm run dist:*`) — `electron-builder`'s
   `extraResources` config (`package.json`) copies it into the packaged
   app, and `electron/structure3d_server.cjs` spawns/health-checks it
   exactly like the NMR server.

Rebuild and re-copy whenever this backend or your `xtb` version changes
— nothing here is auto-synced, same as NMRGraph.

## A note on the reported energy

The energy this service reports (`energy_kcal_mol` in the response) is
GFN2-xTB's **total electronic energy** — a large negative number on an
entirely different scale from the MMFF94 method's energy (which is a
small relative steric/strain number, not a total electronic energy).
Don't compare the two numbers directly; each is only meaningful relative
to other results from the *same* method. The frontend's `view3d.energy`
label is method-specific for this reason — see `Molecule3DView.tsx`.
