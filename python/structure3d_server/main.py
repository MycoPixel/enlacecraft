"""
structure3d_server — the backend half of EnlaceCraft's "High accuracy
(GFN2-xTB)" 3D method (see src/io/xtbRefine.ts on the frontend, and
Molecule3DView.tsx for where it's offered as a method choice).

Deliberately a *refinement* service, not a from-scratch embedder: the
frontend already generates a perfectly reasonable starting 3D structure
client-side (OpenChemLib's conformer generator + MMFF94, see
src/io/embed3d.ts) with zero network dependency. This service takes that
molfile and relaxes it further against GFN2-xTB — a real semi-empirical
quantum-mechanical tight-binding method (Grimme group), genuinely more
accurate than a force field, at a computational cost that's still fine
for the small teaching molecules this app is for. Starting from an
already-sane MMFF94 geometry rather than a bare distance-geometry guess
also converges faster and more reliably than cold-starting xtb.

This is a small, deliberately boring FastAPI wrapper around the `xtb`
command-line binary (not a Python xtb binding) — see the "Why shell out"
note in run_xtb_optimization below for why. Mirrors NMRGraph's API shape
(a small uvicorn/FastAPI service, /health plus two real endpoints,
/embed3d/xtb and /ir, CORS open for the file:// packaged-Electron origin) —
see ../../electron/server.cjs
and src/io/nmrPredict.ts for that established pattern on the JS side.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from rdkit import Chem

app = FastAPI(title="structure3d_server")

ALLOWED_ORIGINS = frozenset([
    "file://",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MAX_REQUEST_BYTES = 25 * 1024 * 1024

_rate_limit_log: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request too large"})

    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    _rate_limit_log[client_ip] = [
        t for t in _rate_limit_log[client_ip] if now - t < RATE_LIMIT_WINDOW_SECONDS
    ]
    if len(_rate_limit_log[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
    _rate_limit_log[client_ip].append(now)

    return await call_next(request)

HARTREE_TO_KCAL_MOL = 627.5094740631

# Generous, but bounded — an unbounded subprocess call is the one thing
# that could make a single bad request hang the whole service for every
# other tab/window using it. A few hundred atoms at GFN2-xTB should
# finish well inside this on ordinary hardware; anything hitting the
# ceiling is almost certainly not going to converge anyway.
XTB_TIMEOUT_SECONDS = 180


class Embed3DXtbRequest(BaseModel):
    # V2000 molfile with a starting 3D conformer and explicit hydrogens —
    # exactly what src/io/embed3d.ts's "mmff94" method already produces.
    # Bonds/connectivity from this are preserved unchanged in the
    # response; only atom positions are updated.
    molfile: str
    # Net formal charge of the whole structure. xtb needs this to pick
    # the right electron count — get it wrong and the optimization runs
    # against the wrong electronic state entirely, silently. The
    # frontend computes this by summing Atom.charge over the drawn
    # molecule (see src/io/xtbRefine.ts) rather than trying to infer it
    # here from valence, since the app already tracks it authoritatively.
    charge: int = 0


class Embed3DXtbResponse(BaseModel):
    molfile: str
    energy_kcal_mol: float
    converged: bool


@app.get("/health")
def health():
    return {"status": "ok", "xtb_available": find_xtb_binary() is not None}


@app.post("/embed3d/xtb", response_model=Embed3DXtbResponse)
def embed3d_xtb(req: Embed3DXtbRequest):
    xtb_bin = find_xtb_binary()
    if xtb_bin is None:
        raise HTTPException(
            status_code=503,
            detail="xtb binary not found — see python/structure3d_server/README.md for how to install it.",
        )

    mol = Chem.MolFromMolBlock(req.molfile, sanitize=True, removeHs=False)
    if mol is None:
        raise HTTPException(status_code=400, detail="Could not parse molfile")
    if mol.GetNumConformers() == 0:
        raise HTTPException(status_code=400, detail="Molfile has no 3D coordinates to refine")

    try:
        final_coords, energy_hartree, converged = run_xtb_optimization(xtb_bin, mol, req.charge)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="xtb optimization timed out")
    except XtbFailure as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    conformer = mol.GetConformer()
    for i, (x, y, z) in enumerate(final_coords):
        conformer.SetAtomPosition(i, (x, y, z))

    return Embed3DXtbResponse(
        molfile=Chem.MolToMolBlock(mol),
        energy_kcal_mol=energy_hartree * HARTREE_TO_KCAL_MOL,
        converged=converged,
    )


class IrRequest(BaseModel):
    # Same starting-3D-conformer molfile the refinement endpoint takes.
    molfile: str
    charge: int = 0


class IrMode(BaseModel):
    wavenumber: float  # cm**-1
    intensity_km_mol: float


class IrResponse(BaseModel):
    modes: list[IrMode]
    converged: bool
    # Modes with a negative wavenumber: the Hessian says this geometry isn't
    # actually a minimum. Reported rather than hidden because it usually means
    # the optimizer stalled, and every frequency from that run is then
    # suspect - see the frontend's warning.
    imaginary_count: int


# xtb's `vibspectrum` file. Data rows are
#     <mode> <symmetry> <wavenumber cm-1> <IR intensity km/mol> <IR allowed>
# The six zero rows xtb emits first (3 translations + 3 rotations) carry a
# bare "-" instead of a selection-rule word, so they split into 4 fields
# rather than 5 and drop out of the len==5 filter below for free.
_VIBSPECTRUM_ROW = re.compile(r"^\s*(\d+)\s+(\S+)\s+(-?[\d.]+)\s+([\d.]+)\s+(\S+)\s*$")


def parse_vibspectrum(text: str) -> tuple[list[IrMode], int]:
    modes: list[IrMode] = []
    imaginary = 0
    for line in text.splitlines():
        match = _VIBSPECTRUM_ROW.match(line)
        if not match:
            continue
        wavenumber = float(match.group(3))
        intensity = float(match.group(4))
        if wavenumber <= 0:
            # Negative = imaginary. Near-zero = the six translations/rotations,
            # which the regex already let through when they had a 5th field.
            if wavenumber < -1.0:
                imaginary += 1
            continue
        modes.append(IrMode(wavenumber=wavenumber, intensity_km_mol=intensity))
    return modes, imaginary


def run_xtb_ir(xtb_bin: str, mol: Chem.Mol, charge: int) -> tuple[list[IrMode], bool, int]:
    """Optimizes `mol` then computes its numerical Hessian, returning the
    vibrational modes with IR intensities.

    `--ohess` rather than `--hess`: the Hessian has to be taken at a real
    minimum, and at a non-converged geometry every frequency is meaningless.
    Optimizing first also costs nothing extra -- it is the same SCF work.

    Note there is no `--vibspectrum` flag; the file is a side effect of
    `--hess`. Passing it anyway is silently ignored by xtb (which is why an
    earlier draft of this looked like it worked).
    """
    with tempfile.TemporaryDirectory(prefix="enlacecraft_ir_") as tmpdir:
        tmpdir_path = Path(tmpdir)
        write_xyz_from_mol(mol, tmpdir_path)

        result = run_xtb(xtb_bin, tmpdir_path, ["--gfn", "2", "--chrg", str(charge), "--ohess", "tight"])

        spectrum_path = tmpdir_path / "vibspectrum"
        if not spectrum_path.exists():
            tail = "\n".join(result.stdout.strip().splitlines()[-15:])
            raise XtbFailure(f"xtb did not produce a vibrational spectrum.\n{tail}")

        modes, imaginary = parse_vibspectrum(spectrum_path.read_text(errors="replace"))
        if not modes:
            raise XtbFailure("xtb produced a vibrational spectrum with no real modes")

        return modes, result.returncode == 0, imaginary


@app.post("/ir", response_model=IrResponse)
def ir_spectrum(req: IrRequest):
    xtb_bin = find_xtb_binary()
    if xtb_bin is None:
        raise HTTPException(
            status_code=503,
            detail="xtb binary not found — see python/structure3d_server/README.md for how to install it.",
        )

    mol = Chem.MolFromMolBlock(req.molfile, sanitize=True, removeHs=False)
    if mol is None:
        raise HTTPException(status_code=400, detail="Could not parse molfile")
    if mol.GetNumConformers() == 0:
        raise HTTPException(status_code=400, detail="Molfile has no 3D coordinates to analyze")

    try:
        modes, converged, imaginary = run_xtb_ir(xtb_bin, mol, req.charge)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="xtb vibrational analysis timed out")
    except XtbFailure as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return IrResponse(modes=modes, converged=converged, imaginary_count=imaginary)


class XtbFailure(RuntimeError):
    pass


def run_xtb(xtb_bin: str, workdir: Path, extra_args: list[str]) -> subprocess.CompletedProcess:
    """Runs the xtb CLI in `workdir` with `input.xyz` already written there.

    Shared by the 3D refinement and the IR spectrum so the encoding handling
    below can't be fixed on one path and left broken on the other.
    """
    try:
        return subprocess.run(
            [xtb_bin, "input.xyz", *extra_args],
            cwd=workdir,
            capture_output=True,
            # Pin the encoding rather than relying on text=True's
            # locale-dependent default. xtb writes UTF-8 - its citation
            # header alone contains non-ASCII author names, e.g.
            # "Hölzer" - but on Windows text=True decodes with cp1252,
            # which raises UnicodeDecodeError inside subprocess's own
            # reader thread the moment it hits a byte cp1252 can't
            # represent. On Linux the locale is UTF-8 so this never
            # showed up; on Windows it fired on *every* xtb call,
            # losing the tail of stdout (the only diagnostic the
            # XtbFailure messages have) and leaving the parent
            # thread waiting on a stream nobody would ever finish
            # writing to, so the request sat there until
            # XTB_TIMEOUT_SECONDS instead of returning.
            #
            # errors="replace" as well as the explicit encoding: this
            # output is only ever read for a human-readable error tail
            # (the results themselves come from the files xtb writes),
            # so an undecodable byte is never worth failing a request
            # over.
            encoding="utf-8",
            errors="replace",
            timeout=XTB_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise XtbFailure(f"Could not run xtb binary at {xtb_bin!r}") from exc


def write_xyz_from_mol(mol: Chem.Mol, workdir: Path) -> None:
    """Writes `mol`'s current conformer to `workdir/input.xyz`."""
    conformer = mol.GetConformer()
    write_xyz(
        workdir / "input.xyz",
        [atom.GetSymbol() for atom in mol.GetAtoms()],
        [conformer.GetAtomPosition(i) for i in range(mol.GetNumAtoms())],
    )


def run_xtb_optimization(
    xtb_bin: str, mol: Chem.Mol, charge: int
) -> tuple[list[tuple[float, float, float]], float, bool]:
    """
    Writes `mol`'s current conformer to a .xyz file, runs `xtb --opt`
    against it, and reads back the optimized geometry + energy.

    Why shell out to the xtb CLI rather than use a Python binding
    (xtb-python/tblite): those wrap a compiled Fortran/C extension
    module, which is one of the more fragile things to get a clean
    PyInstaller freeze of across Windows/Linux (compiled-extension
    hooks, bundled shared libs, etc.). The plain `xtb` executable is
    just a binary this service calls via subprocess — PyInstaller
    doesn't need to understand it at all, it's bundled as a plain
    extraResources file the exact same way nmrgraph_server's model
    checkpoints are (see resources/README.md). Simpler to freeze
    reliably, at the cost of a small amount of subprocess/tempfile
    plumbing here.
    """
    symbols = [atom.GetSymbol() for atom in mol.GetAtoms()]
    conformer = mol.GetConformer()
    coords = [conformer.GetAtomPosition(i) for i in range(mol.GetNumAtoms())]

    with tempfile.TemporaryDirectory(prefix="enlacecraft_xtb_") as tmpdir:
        tmpdir_path = Path(tmpdir)
        xyz_path = tmpdir_path / "input.xyz"
        write_xyz(xyz_path, symbols, coords)

        result = run_xtb(xtb_bin, tmpdir_path, ["--opt", "--gfn", "2", "--chrg", str(charge)])

        optimized_path = tmpdir_path / "xtbopt.xyz"
        if not optimized_path.exists():
            # xtb prints a reasonably human-readable failure reason to
            # stdout (SCF didn't converge, an implausible input
            # geometry, etc.) — surfaced as-is rather than a generic
            # "something went wrong", since it's usually the actual
            # useful diagnostic.
            tail = "\n".join(result.stdout.strip().splitlines()[-15:])
            raise XtbFailure(f"xtb did not produce an optimized structure.\n{tail}")

        final_coords, energy_hartree = read_optimized_xyz(optimized_path)
        # A completed xtbopt.xyz with a normal exit code is xtb's own
        # definition of "converged" for our purposes — good enough
        # without re-deriving convergence criteria from its log output.
        converged = result.returncode == 0

    return final_coords, energy_hartree, converged


def write_xyz(path: Path, symbols: list[str], coords) -> None:
    lines = [str(len(symbols)), "EnlaceCraft starting geometry"]
    for symbol, pos in zip(symbols, coords):
        lines.append(f"{symbol} {pos.x:.6f} {pos.y:.6f} {pos.z:.6f}")
    path.write_text("\n".join(lines) + "\n")


_ENERGY_RE = re.compile(r"energy:\s*(-?\d+\.\d+)")


def read_optimized_xyz(path: Path) -> tuple[list[tuple[float, float, float]], float]:
    lines = path.read_text().splitlines()
    n_atoms = int(lines[0].strip())
    match = _ENERGY_RE.search(lines[1])
    if not match:
        raise XtbFailure(f"Could not find energy in xtb output comment line: {lines[1]!r}")
    energy_hartree = float(match.group(1))

    coords: list[tuple[float, float, float]] = []
    for line in lines[2 : 2 + n_atoms]:
        _symbol, x, y, z = line.split()[:4]
        coords.append((float(x), float(y), float(z)))

    if len(coords) != n_atoms:
        raise XtbFailure("xtb output atom count did not match the .xyz header")

    return coords, energy_hartree


def find_xtb_binary() -> str | None:
    # 1. Explicit override — useful for dev, and an escape hatch if the
    #    bundled/PATH lookups below ever guess wrong on some platform.
    env_path = os.environ.get("XTB_BIN")
    if env_path and Path(env_path).is_file():
        return env_path

    # 2. Bundled alongside this frozen executable — see
    #    python/structure3d_server/README.md for exactly how it gets
    #    there (mirrors nmrgraph_server's own sys.executable-relative
    #    resolution, referenced from electron/server.cjs).
    if getattr(sys, "frozen", False):
        bundled_name = "xtb.exe" if sys.platform == "win32" else "xtb"
        bundled = Path(sys.executable).parent / "xtb" / "bin" / bundled_name
        if bundled.is_file():
            return str(bundled)

    # 3. Whatever's on PATH — the normal case in dev, once xtb's
    #    installed via conda-forge (`micromamba install -c conda-forge
    #    xtb`) or however else the person set it up locally.
    found = shutil.which("xtb")
    if found:
        return found

    return None


if __name__ == "__main__":
    # Only reached when this file is executed directly — i.e. the
    # PyInstaller-frozen executable, which electron/structure3d_server.cjs
    # spawns as `structure3d_server --port 8001` (see PORT there). `uvicorn
    # main:app --port ...` (the dev-mode command in README.md) never hits
    # this block at all — uvicorn imports this module and serves `app`
    # itself, so this entrypoint's only job is to make the *frozen binary*
    # do the same thing on its own when there's no separate `uvicorn`
    # command around to do it for it.
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")

