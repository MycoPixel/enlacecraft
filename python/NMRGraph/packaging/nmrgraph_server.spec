# PyInstaller spec for the NMRGraph prediction server.
#
# This is the file ELECTRON.md and server_entrypoint.py's docstring
# already refer to (packaging/nmrgraph_server.spec) but that doesn't
# actually exist yet in the repo - that's the missing piece.
#
# Build (from the NMRGraph project root):
#     pyinstaller packaging/nmrgraph_server.spec
#
# Output: dist/nmrgraph_server/  (a folder containing the executable
# plus its dependencies - "onedir" mode). This is what
# electron/server.cjs and ELECTRON.md expect to be copied wholesale
# into enlacecraft/resources/nmrgraph_server/.
#
# Onedir (not onefile) is used deliberately: onefile re-extracts the
# whole bundle to a temp dir on every launch, which is slow and
# fragile for something this size (torch + rdkit), and it's what
# electron/server.cjs's own comments assume ("PyInstaller onedir
# output").
#
# After building, the model checkpoints still need to be copied in
# by hand (see packaging/README.md) - they're deliberately excluded
# from this spec, per src/paths.py's design notes.

import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# The directory this .spec file lives in, and the project root above it.
# Using SPECPATH (injected by PyInstaller into the spec's exec
# namespace) instead of a relative path means `pyinstaller
# packaging/nmrgraph_server.spec` works the same regardless of the
# shell's current directory.
PROJECT_ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
ENTRY_SCRIPT = os.path.join(PROJECT_ROOT, "server_entrypoint.py")

# rdkit and torch both ship real non-Python data/binary files
# (rdkit's Data/ directory of chemistry tables, torch's compiled
# backend .so files) and both do some dynamic/plugin-style importing
# that PyInstaller's static analysis can't see. collect_all() grabs
# the submodules AND the package's data/binary files in one go -
# without this, the frozen server either crashes on startup with a
# missing-module error, or starts but fails on the first real
# prediction because rdkit can't find its data tables.
rdkit_datas, rdkit_binaries, rdkit_hidden = collect_all("rdkit")
torch_datas, torch_binaries, torch_hidden = collect_all("torch")

# uvicorn selects its event loop and HTTP/WebSocket protocol
# implementations at runtime via importlib (uvicorn.loops.auto,
# uvicorn.protocols.http.auto, etc.), based on what's installed.
# PyInstaller's static import scanner doesn't follow that, so without
# these the frozen exe fails immediately on startup with something
# like "ModuleNotFoundError: uvloop" even though uvicorn[standard] is
# installed and everything works fine unfrozen.
uvicorn_hidden = collect_submodules("uvicorn")

hiddenimports = sorted(set(
    rdkit_hidden
    + torch_hidden
    + uvicorn_hidden
    + [
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "fastapi",
        "pydantic",
    ]
))

a = Analysis(
    [ENTRY_SCRIPT],
    pathex=[PROJECT_ROOT],
    binaries=rdkit_binaries + torch_binaries,
    datas=rdkit_datas + torch_datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Training-only / notebook-only deps: not needed for serving
        # predictions, and excluding them keeps the freeze noticeably
        # smaller and faster to build. Safe to drop from this list if
        # something under src/models ever needs to run frozen too.
        "matplotlib",
        "jupyter",
        "notebook",
        "IPython",
        "xgboost",
        "sklearn",
        "pandas",
    ],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="nmrgraph_server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # UPX-compressing torch's compiled libs is a common
                # cause of "works unfrozen, silently fails frozen"
                # bugs - not worth the smaller download size here.
    console=True,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipped_data,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="nmrgraph_server",
)
