# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for iupac_fallback_server. Build with:
#
#     pyinstaller iupac_fallback_server.spec
#
# See README.md's "Bundling for a packaged Electron build" section for
# the full procedure, including the JRE that has to be copied in
# alongside this build's output afterward (PyInstaller only freezes
# Python -- it has no idea this app also needs a JVM at runtime).
#
# Two things beyond a bare `pyinstaller main.py` are needed here, both
# because PyInstaller's default analysis only follows *Python* imports
# -- it can't see files a package reaches via a runtime path/glob
# rather than a normal `import`:
#
#  - py2opsin's bundled OPSIN jar (naming.py's _opsin_jar_path() finds
#    it via glob against py2opsin.__file__'s directory at runtime, not
#    an import PyInstaller's analysis would ever see) -- collect_data_files
#    below places it back at the same py2opsin-relative path inside the
#    frozen bundle, which is exactly what that glob still expects to find,
#    frozen or not.
#  - nispo ships its own internal template/resource files (naming
#    rules, ring templates, etc. -- see its `resource_manifest` /
#    `resource_templates` / `template_store` modules) that its own code
#    loads the same path-relative way -- collect_all catches both those
#    data files and anything nispo needs declared as a hidden import.
#
# `excludes` below is belt-and-suspenders, not the actual fix for the
# thing it guards against: this service has no GUI dependency of its
# own, but PyInstaller's Analysis walks whatever's importable in the
# *build environment*, not just this project's own requirements.txt --
# on a dev machine with more than one Qt binding installed globally
# (PyQt5 alongside PyQt6, say, from some unrelated app), PyInstaller
# refuses to build at all ("attempt to collect multiple Qt bindings
# packages"), even though neither is actually used here. The real fix
# is building from an isolated virtualenv in the first place (see
# build_linux.sh / build_windows.ps1, both of which create one) so the
# build environment only ever contains this file's own dependencies --
# these excludes just make that same guarantee explicit and robust to
# someone running PyInstaller by hand outside those scripts.
from PyInstaller.utils.hooks import collect_all, collect_data_files

nispo_datas, nispo_binaries, nispo_hiddenimports = collect_all("nispo")

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=nispo_binaries,
    datas=collect_data_files("py2opsin") + nispo_datas,
    hiddenimports=nispo_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["PyQt5", "PyQt6", "PySide2", "PySide6", "tkinter", "matplotlib"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="iupac_fallback_server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="iupac_fallback_server",
)
