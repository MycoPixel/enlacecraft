"""
Resolves paths to bundled resources (model checkpoints, etc.) so they
work identically whether running from source (`python -m ...`) or as
a PyInstaller-frozen executable launched by Electron.

Why this is needed: relative paths like Path("data/models/gnn_v1.pt")
only work if the process's current working directory happens to be
the project root - true when you run things from a terminal in this
repo, but NOT guaranteed once Electron spawns the frozen executable
(its cwd could be anywhere). A frozen executable also doesn't have
this file's original __file__ location to fall back on the normal
way, since PyInstaller extracts everything into a temp/bundle dir.

Design choice: large files (model checkpoints, currently tens of MB
each) are kept OUT of the PyInstaller onefile bundle itself and
instead shipped as plain files sitting next to the frozen executable
(electron-builder's extraResources copies them there - see
ELECTRON.md once that's updated). PyInstaller onefile bundles get
re-extracted to a fresh temp directory on every single launch, which
is wasteful and slow for large binary blobs that never change -
better to just read them directly from disk next to the exe.
"""

import sys
from pathlib import Path


def is_frozen():
    """True when running as a PyInstaller-frozen executable."""
    return getattr(sys, "frozen", False)


def _project_root():
    # This file lives at <project_root>/src/paths.py
    return Path(__file__).resolve().parent.parent


def _frozen_base_dir():
    # Directory containing the frozen executable itself - this is
    # where electron-builder's extraResources should place model
    # checkpoints (as siblings of the executable, or in a known
    # subfolder - see resolve_path's "data/models/..." convention
    # below, which callers don't need to change between the two modes).
    return Path(sys.executable).resolve().parent


def resolve_path(*parts):
    """
    Build an absolute path to a resource, e.g.:
        resolve_path("data", "models", "gnn_v1.pt")
    Works the same whether called from source or from a frozen build -
    callers don't need to know or care which mode they're in.
    """

    base = _frozen_base_dir() if is_frozen() else _project_root()

    return base.joinpath(*parts)
