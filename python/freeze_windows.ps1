# Freezes all three bundled Python backends for Windows, then copies each
# result into resources/ for electron-builder to bundle.
#
# WHY THIS EXISTS
# ---------------
# Same reason as the Linux container scripts, inverted: PyInstaller cannot
# cross-compile, so the Windows binaries have to be frozen ON Windows. This
# is the Windows half of .github/workflows/build.yml, and it's what the
# `npm run dist:win` job runs there.
#
# There is no container for Windows, so unlike Linux the glibc floor isn't
# the concern here - on Windows, a host-side freeze is fine. What is NOT fine
# is picking up whatever Python happens to be installed, which is why each
# backend below gets a purpose-built environment (a throwaway venv, or a
# micromamba env where a conda-only dependency forces it).
#
# Run from the python/ directory, in PowerShell:
#     .\freeze_windows.ps1
#
# NOT YET TRIAL-RUN END TO END
# -----------------------------
# This was written against GitHub's windows-latest image and against the
# per-backend Windows steps already documented in this repo (each backend
# folder's README.md, and iupac_fallback_server\build_windows.ps1, whose
# JRE handling and smoke test this mirrors). Every external dependency was
# individually confirmed to exist with the layout assumed here, but the
# script as a whole has not had a run on a real Windows machine. Expect to
# fix a path separator or two on the first execution.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Where the Windows builds land. Matches package.json's build.extraResources.
$ResourcesRoot = Join-Path (Split-Path -Parent $PSScriptRoot) "resources"
$NmrGraphDir  = Join-Path $PSScriptRoot "NMRGraph"
$StructureDir = Join-Path $PSScriptRoot "structure3d_server"
$IupacDir     = Join-Path $PSScriptRoot "iupac_fallback_server"
$CacheDir     = Join-Path $PSScriptRoot ".cache"

# Pinned, like the Linux images: a rebuild months from now should bundle the
# same JRE, not whatever Temurin shipped last week. Temurin 21 is an LTS
# release so it still gets security updates; the pin is about reproducibility.
$JreVersion = "21.0.9+10"
$JreUrl = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9+10/OpenJDK21U-jre_x64_windows_hotspot_21.0.9_10.zip"

# conda-forge's Windows xtb, which is the maintained one. grimme-lab's own
# releases only ship a stale 6.7.1pre-windows build - see
# structure3d_server/README.md. There is no PyPI wheel for xtb, so conda-forge
# is the only sane source on Windows.
$XtbVersion = "6.7.1"

function New-IsolatedVenv([string]$Dir, [string]$VenvName = ".build-venv") {
    # A dedicated throwaway venv, not "whatever pip resolves to". PyInstaller's
    # Analysis walks every package importable in the build environment, so a
    # machine with more than one Qt binding installed globally makes it refuse
    # to build at all ("attempt to collect multiple Qt bindings packages") even
    # though none of these services uses Qt. That bit this project on a real
    # Linux machine once; the isolation is the actual fix, the spec files'
    # excludes list is just a second layer.
    $venvPath = Join-Path $Dir $VenvName
    Write-Host "==> Creating an isolated build venv ($VenvName) in $Dir"
    Push-Location $Dir
    try {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $VenvName
        # $null = so nothing the command writes to stdout can end up being
        # captured as this function's return value, which is the venv's
        # python.exe path - a stray line would silently corrupt every later
        # pip/pyinstaller invocation in the caller.
        $null = python -m venv $VenvName
    } finally { Pop-Location }
    return (Join-Path $venvPath "Scripts\python.exe")
}

function Invoke-PyInstaller([string]$Dir, [string]$Spec, [string]$BundleName, [string]$PythonExe) {
    Write-Host "==> Freezing $BundleName with PyInstaller"
    Push-Location $Dir
    try {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue build, dist
        & $PythonExe -m PyInstaller --noconfirm $Spec
    } finally { Pop-Location }
    $exe = Join-Path $Dir "dist\$BundleName\$BundleName.exe"
    if (-not (Test-Path $exe)) {
        Write-Error "ERROR: freeze produced no executable at $exe"
        exit 1
    }
}

# Starts a frozen server, waits for /health, runs a real request, asserts on
# the response, and shuts it down. The $Assert gets the response body; return
# $true to pass.
#
# The real request matters: /health returns 200 even when the backend's extra
# runtime dependency (xtb, the JVM) is missing, so a health-only smoke test
# cannot catch "builds fine, every real request fails".
function Invoke-SmokeTest([string]$Exe, [int]$Port, [string]$Path, [string]$Body, [scriptblock]$Assert) {
    Write-Host "==> Smoke-testing $(Split-Path -Leaf $Exe) (real $Path request)"
    $proc = Start-Process -FilePath $Exe -ArgumentList "--port", "$Port" -PassThru -WindowStyle Hidden
    try {
        $healthy = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $resp = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 2
                if ($resp.StatusCode -eq 200) { $healthy = $true; break }
            } catch {
                # Not up yet -- keep polling until the loop's own limit.
            }
        }
        if (-not $healthy) { throw "server never became healthy" }

        $result = Invoke-WebRequest -Uri "http://localhost:$Port$Path" -Method Post `
            -Body $Body -ContentType "application/json" -UseBasicParsing -TimeoutSec 240
        if (-not (& $Assert $result.Content)) {
            throw "assertion failed on $Path response: $($result.Content)"
        }
        Write-Host "Smoke test OK: $Path -> $($result.Content)"
    } catch {
        Write-Error "Smoke test FAILED: $($_.Exception.Message)"
        exit 1
    } finally {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}

function Publish-Bundle([string]$BundleName) {
    $src = $null
    foreach ($d in @($NmrGraphDir, $StructureDir, $IupacDir)) {
        $candidate = Join-Path $d "dist\$BundleName"
        if (Test-Path $candidate) { $src = $candidate; break }
    }
    if (-not $src) { Write-Error "ERROR: no dist\$BundleName found to publish"; exit 1 }
    $dest = Join-Path $ResourcesRoot $BundleName
    Write-Host "==> Copying into resources\$BundleName"
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $dest
    Copy-Item -Recurse $src $dest
}

# ---------------------------------------------------------------------------
# 1. nmrgraph_server (NMR prediction)
# ---------------------------------------------------------------------------
# pip rather than conda here: torch, rdkit, scikit-learn, xgboost, numpy and
# pandas all publish win_amd64 wheels, so there's no reason to pay for a conda
# solve. torch comes from the PyTorch CPU index explicitly -- the default PyPI
# Linux *and* Windows wheels are the CUDA flavour (~2.5GB) and this server
# only ever runs GNN inference on CPU.
Write-Host "`n########## nmrgraph_server ##########"
$nmrPy = New-IsolatedVenv $NmrGraphDir
& $nmrPy -m pip install --quiet --upgrade pip
& $nmrPy -m pip install --quiet --index-url https://download.pytorch.org/whl/cpu torch
& $nmrPy -m pip install --quiet rdkit scikit-learn xgboost numpy pandas fastapi "uvicorn[standard]" pyinstaller
Invoke-PyInstaller $NmrGraphDir "packaging/nmrgraph_server.spec" "nmrgraph_server" $nmrPy

# The checkpoints are deliberately excluded from the spec (src/paths.py resolves
# data/models/ relative to the frozen executable, not the cwd).
Write-Host "==> Copying model checkpoints alongside the executable"
$nmrModels = Join-Path $NmrGraphDir "dist\nmrgraph_server\data\models"
New-Item -ItemType Directory -Force -Path $nmrModels | Out-Null
Copy-Item (Join-Path $NmrGraphDir "data\models\*.pt") $nmrModels

Invoke-SmokeTest (Join-Path $NmrGraphDir "dist\nmrgraph_server\nmrgraph_server.exe") 18098 "/predict" `
    '{"smiles":"CCO"}' {
        param($content)
        # The server returns 200 with an empty/absent results list if it
        # started but never loaded the checkpoints, so assert on content and
        # not just the status code.
        return ($content -match '"results"')
    }
Publish-Bundle "nmrgraph_server"

# ---------------------------------------------------------------------------
# 2. structure3d_server (GFN2-xTB)
# ---------------------------------------------------------------------------
# The one backend that needs conda on Windows: xtb has no PyPI wheel, and
# conda-forge's Windows build is dynamically linked, so its DLLs have to be
# bundled next to the executable or Windows can't load xtb.exe at all.
Write-Host "`n########## structure3d_server ##########"
$MambaRoot = Join-Path $CacheDir "micromamba"
$micromamba = Join-Path $MambaRoot "micromamba.exe"
if (-not (Test-Path $micromamba)) {
    Write-Host "==> Fetching micromamba (cached in .cache\micromamba)"
    New-Item -ItemType Directory -Force -Path $MambaRoot | Out-Null
    $archive = Join-Path $CacheDir "micromamba-win-64.tar.bz2"
    Invoke-WebRequest -Uri "https://micro.mamba.pm/api/micromamba/win-64/latest" -OutFile $archive
    # The win-64 archive carries the binary at Library\bin\micromamba.exe.
    Push-Location $MambaRoot
    try { & tar -xf $archive } finally { Pop-Location }
    Remove-Item -Force -ErrorAction SilentlyContinue $archive
}
if (-not (Test-Path $micromamba)) { Write-Error "ERROR: micromamba.exe not found after extraction"; exit 1 }

$env:MAMBA_ROOT_PREFIX = Join-Path $CacheDir "mamba-root"
$structEnv = "struct3d"
Write-Host "==> Creating the conda-forge env (python + xtb $XtbVersion)"
& $micromamba create -y -n $structEnv -c conda-forge "python=3.12" "xtb=$XtbVersion" rdkit 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error "ERROR: micromamba create failed"; exit 1 }

$structPrefix = Join-Path $env:MAMBA_ROOT_PREFIX "envs\$structEnv"
$structPy = Join-Path $structPrefix "python.exe"
& $structPy -m pip install --quiet --upgrade pip
& $structPy -m pip install --quiet fastapi "uvicorn[standard]" pydantic pyinstaller pyinstaller-hooks-contrib
Invoke-PyInstaller $StructureDir "structure3d_server.spec" "structure3d_server" $structPy

# main.py's find_xtb_binary() looks for exactly <exe_dir>\xtb\bin\xtb.exe.
# conda-forge's Windows xtb is DLL-linked, so the whole Library\bin goes over
# - xtb.exe alone would fail to load on a user's machine.
Write-Host "==> Bundling xtb next to the executable (with its DLLs)"
$xtbDest = Join-Path $StructureDir "dist\structure3d_server\xtb\bin"
New-Item -ItemType Directory -Force -Path $xtbDest | Out-Null
Copy-Item (Join-Path $structPrefix "Library\bin\*") $xtbDest -Recurse

Invoke-SmokeTest (Join-Path $StructureDir "dist\structure3d_server\structure3d_server.exe") 18097 "/embed3d/xtb" `
    '{"molfile":"water\n  Mrv\n\n  3  2  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n    0.9572    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.2400    0.9266    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  1  3  1  0\nM  END\n","charge":0}' {
        param($content)
        return ($content -match '"converged"')
    }
Publish-Bundle "structure3d_server"

# ---------------------------------------------------------------------------
# 3. iupac_fallback_server (OPSIN naming, needs a JVM)
# ---------------------------------------------------------------------------
Write-Host "`n########## iupac_fallback_server ##########"
$iupacPy = New-IsolatedVenv $IupacDir
& $iupacPy -m pip install --quiet --upgrade pip
& $iupacPy -m pip install --quiet -r (Join-Path $IupacDir "requirements.txt")
& $iupacPy -m pip install --quiet pyinstaller pyinstaller-hooks-contrib
Invoke-PyInstaller $IupacDir "iupac_fallback_server.spec" "iupac_fallback_server" $iupacPy

# The JRE is load-bearing, not optional: a packaged end user has no system
# Java, so a bundle missing jre\ answers /health fine and then fails every
# real /name call. Assert the exact path naming.py's _bundled_jre_jvm_path()
# builds on win32 before declaring success.
Write-Host "==> Bundling the pinned JRE $JreVersion next to the executable"
$jreCache = Join-Path $CacheDir "windows-$($JreVersion -replace '\+','-').zip"
if (-not (Test-Path $jreCache)) {
    Invoke-WebRequest -Uri $JreUrl -OutFile $jreCache
}
$jreExtract = Join-Path $env:TEMP ("iupac-jre-" + (Get-Random))
Expand-Archive -Path $jreCache -DestinationPath $jreExtract
$jreDir = Get-ChildItem -Path $jreExtract -Directory | Where-Object { $_.Name -like "jdk-*" } | Select-Object -First 1
$jreDest = Join-Path $IupacDir "dist\iupac_fallback_server\jre"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $jreDest
Copy-Item -Recurse $jreDir.FullName $jreDest
Remove-Item -Recurse -Force $jreExtract

$jvmDll = Join-Path $jreDest "bin\server\jvm.dll"
if (-not (Test-Path $jvmDll)) {
    Write-Error "ERROR: jre\bin\server\jvm.dll missing from the bundle - the frozen" `
        "server would fall back to a system Java that a packaged end user" `
        "doesn't have, and OPSIN naming would fail on every call."
    exit 1
}
Write-Host "    found jre\bin\server\jvm.dll"

Invoke-SmokeTest (Join-Path $IupacDir "dist\iupac_fallback_server\iupac_fallback_server.exe") 18096 "/name" `
    '{"smiles":"CF"}' {
        param($content)
        # CF is fluoromethane, so a working OPSIN round-trip names it
        # fluoro-something. A 200 with a wrong name means the JVM started but
        # OPSIN isn't actually working.
        return ($content -match "fluoro")
    }
Publish-Bundle "iupac_fallback_server"

Write-Host "`n==> All three backends frozen into resources\. Run 'npm run dist:win' to package."