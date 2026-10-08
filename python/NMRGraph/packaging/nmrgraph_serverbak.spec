# PyInstaller spec for the NMRGraph prediction server.
#
# Build (from the project root, NOT from inside packaging/):
#     pyinstaller packaging/nmrgraph_server.spec
#
# Output lands in dist/nmrgraph_server/ (a folder, not a single file -
# see the note on onedir vs onefile below).
#
# Model checkpoints (data/models/*.pt) are deliberately NOT bundled
# here - see src/paths.py for why. Copy them into
# dist/nmrgraph_server/data/models/ manually after building, to test
# the frozen binary standalone (electron-builder will do this copy
# automatically later, via extraResources).

import sys
from pathlib import Path

block_cipher = None

# -----------------------------------------------------------------
# RDKit's data files (isotope tables, fragment definitions, etc.) -
# RDKit loads these from disk at runtime, so if PyInstaller doesn't
# bundle them, you get file-not-found errors deep inside RDKit calls
# that are confusing to trace back to this cause.
#
# IMPORTANT: this must be computed and passed into Analysis(datas=...)
# directly, NOT appended to a.datas afterward - once Analysis() has
# run, a.datas is already normalized into PyInstaller's internal
# 3-element TOC format, and appending raw 2-element tuples on top of
# that produces a mixed list that fails later at build time with a
# cryptic "not enough values to unpack" error.
# -----------------------------------------------------------------
try:
    from PyInstaller.utils.hooks import collect_data_files

    rdkit_datas = collect_data_files("rdkit")
except Exception as e:
    print(f"WARNING: could not auto-collect rdkit data files: {e}")
    print("If the frozen binary fails with RDKit file-not-found errors,")
    print("this is almost certainly why - see packaging/README.md.")
    rdkit_datas = []

# -----------------------------------------------------------------
# Hidden imports uvicorn needs but PyInstaller's static analysis
# often misses, since uvicorn picks these at runtime based on config
# rather than importing them directly in code PyInstaller can see.
# -----------------------------------------------------------------
uvicorn_hidden_imports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
]

a = Analysis(
    ["../server_entrypoint.py"],
    pathex=[str(Path(SPECPATH).parent)],  # project root, so `src.*` imports resolve
    binaries=[],
    datas=rdkit_datas,
    hiddenimports=uvicorn_hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # If your environment has GPU torch installed, exclude these
        # to avoid bundling multi-GB CUDA libraries for a CPU-only
        # desktop app running a small model that doesn't need a GPU.
        # Safe to leave in even if you don't have them - PyInstaller
        # just won't find anything to exclude.
        #
        # NOTE: torch.distributed is deliberately NOT excluded here,
        # even though this app never uses it - torch.utils.data.
        # dataloader imports it unconditionally at module load time
        # (not lazily), so excluding it breaks the freeze with a
        # ModuleNotFoundError. Learned this the hard way - don't
        # re-add it without testing.
        "nvidia",
        "torch.utils.tensorboard",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
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
    upx=False,  # UPX compression + PyTorch's binaries have a history
                # of not playing well together - leave off unless you
                # specifically need the smaller size and have verified
                # it still works.
    console=True,  # keep a console window for now, for visibility
                    # into startup errors during development. Can be
                    # set to False once this is fully working and
                    # wired into Electron, so the end user doesn't see
                    # a terminal flash on app start.
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="nmrgraph_server",
)

# NOTE on onedir vs onefile:
# This spec produces a "onedir" build (a folder with the exe + all its
# dependencies as separate files) rather than "onefile" (a single
# .exe that self-extracts to a temp dir on every launch). onedir is
# deliberately chosen here: onefile's self-extraction step adds
# startup latency that gets worse the bigger your bundled dependencies
# are (and PyTorch is not small), and onedir gives you a real folder
# you can just look inside when something goes wrong. Electron will
# bundle this whole output folder as a resource - see ELECTRON.md.
