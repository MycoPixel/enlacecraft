# Freezes iupac_fallback_server for Windows with PyInstaller and bundles
# a portable JRE alongside it (OPSIN needs a JVM at runtime; PyInstaller
# only freezes Python -- see README.md's "Bundling for a packaged
# Electron build" section for the full explanation of why).
#
# Builds inside a throwaway venv (.build-venv\, created fresh on every
# run) rather than whatever pip happens to resolve to -- see the
# comment above the venv creation below for why: a polluted
# global/system Python (e.g. one with both PyQt5 and PyQt6 installed
# from unrelated apps) can make PyInstaller refuse to build at all.
# This bit us on a real machine once already (Linux, but the same
# thing can happen on Windows) -- see build_linux.sh's matching comment.
#
# Must be run ON an actual Windows machine (or VM) -- PyInstaller can't
# cross-compile, same constraint as this project's other two bundled
# backends (see ..\..\ELECTRON.md). Run from this directory
# (python\iupac_fallback_server\) in PowerShell:
#     .\build_windows.ps1
#
# Output: ..\..\resources\iupac_fallback_server\ -- matches
# package.json's build.extraResources entry for this service exactly,
# so `npm run dist:win` picks it up with no further steps.
#
# Verified against build_linux.sh's Linux counterpart (same JRE version,
# same spec file, same smoke test, same venv-isolation fix) but NOT
# itself run end-to-end on a real Windows machine while writing this --
# the environment this was written in only has Linux available. Every
# external piece it depends on (the JRE zip URL below, its internal
# bin\server\jvm.dll layout) was individually confirmed to exist and be
# structured as expected before writing this script, but the script AS
# A WHOLE should get one trial run on your machine before you rely on
# its output for a real release.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Pinned so a rebuild months from now bundles the exact same JRE build
# rather than silently picking up whatever's newest -- bump deliberately,
# not by accident. Matches build_linux.sh's pinned version; any Temurin
# 21 JRE build works, this is just the one this was last verified against.
$JreVersion = "21.0.9+10"
$JreUrl = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9+10/OpenJDK21U-jre_x64_windows_hotspot_21.0.9_10.zip"
$JreCacheName = "windows-" + ($JreVersion -replace '\+', '-') + ".zip"
$JreCache = Join-Path "jre-cache" $JreCacheName

# A dedicated, throwaway venv -- not just "whatever pip/pyinstaller
# happen to resolve to" -- is the actual fix for a real failure this
# hit on a Linux machine that also had both PyQt5 and PyQt6 installed
# globally (from unrelated apps): PyInstaller's Analysis walks every
# package importable in the build environment, not just this file's
# own requirements.txt, and refuses to build at all when it finds more
# than one Qt binding, even though this service uses neither. The spec
# file's own `excludes` list is a second layer of defense against that
# same class of problem, but this venv is what actually guarantees the
# build environment only ever contains what THIS file's
# requirements.txt put there.
Write-Host "==> Creating an isolated build venv (.build-venv\)"
python -m venv .build-venv
& .build-venv\Scripts\Activate.ps1

Write-Host "==> Installing Python dependencies"
pip install --quiet -r requirements.txt
pip install --quiet pyinstaller

Write-Host "==> Freezing with PyInstaller"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue build, dist
pyinstaller iupac_fallback_server.spec

Write-Host "==> Fetching portable JRE $JreVersion (Windows x64), if not already cached"
New-Item -ItemType Directory -Force -Path jre-cache | Out-Null
if (-not (Test-Path $JreCache)) {
    Invoke-WebRequest -Uri $JreUrl -OutFile $JreCache
}

Write-Host "==> Bundling JRE into the frozen output"
$jreExtractDir = Join-Path $env:TEMP ("iupac-jre-extract-" + (Get-Random))
Expand-Archive -Path $JreCache -DestinationPath $jreExtractDir
$jreDir = Get-ChildItem -Path $jreExtractDir -Directory | Where-Object { $_.Name -like "jdk-*" } | Select-Object -First 1
$destJre = "dist\iupac_fallback_server\jre"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $destJre
Copy-Item -Recurse $jreDir.FullName $destJre
Remove-Item -Recurse -Force $jreExtractDir

Write-Host "==> Smoke-testing the frozen binary (bundled JRE, real HTTP request)"
$proc = Start-Process -FilePath "dist\iupac_fallback_server\iupac_fallback_server.exe" `
    -ArgumentList "--port", "18099" -PassThru -WindowStyle Hidden

$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:18099/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch {
        # Not up yet -- keep polling until the loop's own limit.
    }
}
if (-not $healthy) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Write-Error "Smoke test FAILED: server never became healthy"
    exit 1
}

$body = '{"smiles":"CF"}'
$result = Invoke-WebRequest -Uri "http://localhost:18099/name" -Method Post -Body $body `
    -ContentType "application/json" -UseBasicParsing
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue

if ($result.Content -notmatch "fluoro") {
    Write-Error "Smoke test FAILED: unexpected response: $($result.Content)"
    exit 1
}
Write-Host "Smoke test OK: $($result.Content)"

Write-Host "==> Copying into resources\iupac_fallback_server"
$resourcesDir = "..\..\resources\iupac_fallback_server"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $resourcesDir
Copy-Item -Recurse "dist\iupac_fallback_server" $resourcesDir

Write-Host "==> Done. resources\iupac_fallback_server\ is ready -- run npm run dist:win."
