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
# TRIAL-RUN ON A REAL WINDOWS MACHINE
# ----------------------------------
# This was originally written against GitHub's windows-latest image and
# against the per-backend Windows steps already documented in this repo
# (each backend folder's README.md, and iupac_fallback_server\
# build_windows.ps1, whose JRE handling and smoke test this mirrors).
# It has since had a real run on Windows, which is what turned up the
# PowerShell 5.1 issue Invoke-Native below exists to work around - see
# that function's comment for the full story.

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

# Runs a native command (python, pip, PyInstaller, micromamba, tar) without
# letting its diagnostics kill the script, and fails the script if the tool
# actually reports an error.
#
# WHY THIS EXISTS
# ---------------
# $ErrorActionPreference is "Stop" for the whole script, so every cmdlet
# below fails fast on a real problem. But in *Windows PowerShell 5.1* -
# powershell.exe, which is what "open PowerShell and run this script" means
# on most Windows machines - a native command's stderr is written to the
# error stream, and with "Stop" in effect that becomes a *terminating*
# NativeCommandError the moment the script's output is being captured:
#
#     .\freeze_windows.ps1 2>&1 | Tee-Object log.txt
#     .\freeze_windows.ps1 > log.txt 2>&1
#
# which are all completely normal things to do to a build this long. PyInstaller
# writes essentially its entire log to stderr, so the script died at its very
# first line:
#
#     ==> Freezing nmrgraph_server with PyInstaller
#     python.exe : 237 INFO: PyInstaller: 6.22.3, contrib hooks: 2026.8
#     At ...\freeze_windows.ps1:79 char:9
#     +         & $PythonExe -m PyInstaller --noconfirm $Spec
#         + FullyQualifiedErrorId : NativeCommandError
#
# ...with exit code 1, no clue why, and - worst of all - *after* the
# Remove-Item that had just deleted the previous, working dist/. PowerShell 7
# (pwsh) doesn't have this behavior, which is exactly why the Windows job in
# .github/workflows/build.yml runs this same script under `shell: pwsh` and
# has never seen the problem.
#
# Setting $ErrorActionPreference to "Continue" just around the native call
# keeps the strict behavior everywhere else while letting a tool talk. The
# exit-code check below is what actually catches a real failure, so nothing
# is lost by relaxing it here: a pip install that fails now stops the script
# with a clear message instead of silently leaving PyInstaller to fail later
# with a confusing "module not found".
function Invoke-Native([scriptblock]$Command, [string]$What) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Command
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
        Write-Error "ERROR: $What failed (exit code $code)"
        exit 1
    }
}

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
        Invoke-Native -What "creating a venv in $Dir" -Command {
            $null = python -m venv $VenvName
        }
    } finally { Pop-Location }
    return (Join-Path $venvPath "Scripts\python.exe")
}

function Invoke-PyInstaller([string]$Dir, [string]$Spec, [string]$BundleName, [string]$PythonExe) {
    Write-Host "==> Freezing $BundleName with PyInstaller"
    Push-Location $Dir
    try {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue build, dist
        Invoke-Native -What "freezing $BundleName with PyInstaller" -Command {
            & $PythonExe -m PyInstaller --noconfirm $Spec
        }
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
#
# WHY THE HEALTH POLL USES -TimeoutSec 10, NOT 2
# ---------------------------------------------
# This loop originally used -TimeoutSec 2, and it failed 100% of the time on a
# real Windows machine: all 60 polls timed out and the script reported
# "server never became healthy" for a server that was, in fact, healthy and
# answering /health with 200 in ~2.6s.
#
# The cause is Windows PowerShell 5.1's Invoke-WebRequest itself, not the
# server. Measured on the same machine, same binary, same port:
#
#     -TimeoutSec 2   -> 60/60 polls timed out  (~151s, then gave up)
#     -TimeoutSec 5   -> healthy on the first poll (~2.6s)
#     raw HttpWebRequest, Timeout 5000 -> healthy on the first poll (~2.1s)
#
# Once the server is already up, -TimeoutSec 2 succeeds 29 times out of 30 at
# ~14ms each - so the server is nowhere near slow enough to explain it. What
# makes 2 fail is 5.1's first-use cost for the request stack in a fresh
# process (proxy/IE configuration init), which lands squarely in the 2-3s
# window and is paid before any of the 2s budget is spent on the server. 10
# clears that one-time cost with room to spare and still bounds a genuinely
# dead server quickly, since the loop's own iteration count is what sets the
# overall budget.
#
# This is the same class of Windows-PowerShell-5.1-only trap as the stderr
# issue Invoke-Native handles above: invisible under PowerShell 7, which is
# what CI runs.
function Invoke-SmokeTest([string]$Exe, [int]$Port, [string]$Path, [string]$Body, [scriptblock]$Assert) {
    Write-Host "==> Smoke-testing $(Split-Path -Leaf $Exe) (real $Path request)"
    $proc = Start-Process -FilePath $Exe -ArgumentList "--port", "$Port" -PassThru -WindowStyle Hidden
    try {
        $healthy = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $resp = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 10
                if ($resp.StatusCode -eq 200) { $healthy = $true; break }
            } catch {
                # Not up yet -- keep polling until the loop's own limit.
            }
        }
        if (-not $healthy) {
            # String concatenation via -join rather than adjacent string
            # literals across backtick-continued lines, which PowerShell
            # parses inconsistently enough to be worth avoiding in a script
            # this long.
            throw (@(
                "server never became healthy within 30s.",
                "Its own stdout/stderr is where the real reason is - run it by hand:",
                "    $Exe --port $Port"
            ) -join " ")
        }

        # -UseBasicParsing also stops Windows PowerShell 5.1 from trying to
        # build a DOM object out of the response body, which is slow enough
        # on a large JSON payload to eat into the timeout below.
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
        # taskkill /T rather than Stop-Process: these are console exes
        # (console=True in the spec files), and a /T kill takes the whole
        # tree - uvicorn's own children included. Stop-Process leaves
        # grandchildren holding locks on the freshly written dist/ files,
        # which then breaks the very next Remove-Item -Recurse in this
        # script or a rebuild in the developer workflow. Same approach,
        # same reason, as electron/*.cjs's stopServer().
        #
        # Deliberately NOT via Invoke-Native. taskkill exits 128 with
        # "The process N not found" when the server has already exited on
        # its own - which is a *good* outcome here (the process we wanted
        # gone is gone), but treating it as fatal turns an otherwise
        # passing smoke test into a failed script. Routing it through
        # Invoke-Native also printed that harmless line as a red error,
        # burying the real failure that got us into this catch block.
        & taskkill /PID $proc.Id /F /T 2>&1 | Out-Null
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
# --no-compile on every pip install below, for one specific reason: pip's
# post-install step bytecode-compiles each installed file and then asserts the
# .pyc landed (`assert os.path.exists(pyc_path)` in
# pip/_internal/operations/install/wheel.py). That assert is known to fire
# spuriously on Windows, killing the whole install with a bare
# `AssertionError` and a 30-line traceback that names no package and no
# cause. It bit this script on a real run here: the exact same command
# succeeded immediately afterwards on the same machine with the same pip
# (26.2.1), so it's a flake in pip, not this dependency list.
#
# Nothing downstream needs those .pyc files. PyInstaller reads the .py
# sources, and this venv is thrown away at the end of the freeze - it's a
# build environment, not something anyone imports from. Skipping the
# bytecode step removes the failure mode and takes a little time off each
# install; pip re-compiles on first import anyway if a .pyc is ever wanted.
$NoCompile = "--no-compile"
Invoke-Native -What "upgrading pip" -Command { & $nmrPy -m pip install --quiet --upgrade pip }
Invoke-Native -What "installing torch (CPU index)" -Command {
    & $nmrPy -m pip install --quiet $NoCompile --index-url https://download.pytorch.org/whl/cpu torch
}
Invoke-Native -What "installing nmrgraph_server's dependencies" -Command {
    & $nmrPy -m pip install --quiet $NoCompile rdkit scikit-learn xgboost numpy pandas fastapi "uvicorn[standard]" pyinstaller
}
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
# The win-64 archive extracts the binary at Library\bin\micromamba.exe - NOT
# at the root of the archive. This path used to be built as
# Join-Path $MambaRoot "micromamba.exe", which never existed, so the very
# first real run on Windows downloaded and successfully extracted micromamba
# and then reported "micromamba.exe not found after extraction" anyway. Hence
# the search below rather than a hardcoded path: if micromamba ever changes
# its internal layout, this says where it actually put the exe instead of
# failing with a bare "not found".
$micromamba = $null
if (Test-Path $MambaRoot) {
    $found = Get-ChildItem -Path $MambaRoot -Filter "micromamba.exe" -Recurse -File -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) { $micromamba = $found.FullName }
}
if (-not $micromamba) {
    Write-Host "==> Fetching micromamba (cached in .cache\micromamba)"
    New-Item -ItemType Directory -Force -Path $MambaRoot | Out-Null
    $archive = Join-Path $CacheDir "micromamba-win-64.tar.bz2"
    Invoke-WebRequest -Uri "https://micro.mamba.pm/api/micromamba/win-64/latest" -OutFile $archive
    Push-Location $MambaRoot
    try {
        Invoke-Native -What "extracting micromamba" -Command { & tar -xf $archive }
    } finally { Pop-Location }
    Remove-Item -Force -ErrorAction SilentlyContinue $archive
    $found = Get-ChildItem -Path $MambaRoot -Filter "micromamba.exe" -Recurse -File -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) { $micromamba = $found.FullName }
}
if (-not $micromamba) {
    Write-Error (@(
        "ERROR: no micromamba.exe anywhere under $MambaRoot after extracting the",
        "win-64 archive. Expected it at .cache\micromamba\Library\bin\micromamba.exe.",
        "Whatever was actually extracted:"
    ) -join [Environment]::NewLine)
    Get-ChildItem -Path $MambaRoot -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 20 -ExpandProperty FullName | ForEach-Object { Write-Host "    $_" }
    exit 1
}
Write-Host "    using $($micromamba.Replace($PSScriptRoot, '.'))"

$env:MAMBA_ROOT_PREFIX = Join-Path $CacheDir "mamba-root"
$structEnv = "struct3d"
Write-Host "==> Creating the conda-forge env (python + xtb $XtbVersion)"
Invoke-Native -What "micromamba create (conda-forge python=3.12, xtb $XtbVersion, rdkit)" -Command {
    & $micromamba create -y -n $structEnv -c conda-forge "python=3.12" "xtb=$XtbVersion" rdkit
}

$structPrefix = Join-Path $env:MAMBA_ROOT_PREFIX "envs\$structEnv"
$structPy = Join-Path $structPrefix "python.exe"
Invoke-Native -What "upgrading pip in the struct3d env" -Command { & $structPy -m pip install --quiet --upgrade pip }
Invoke-Native -What "installing structure3d_server's dependencies" -Command {
    & $structPy -m pip install --quiet $NoCompile fastapi "uvicorn[standard]" pydantic pyinstaller pyinstaller-hooks-contrib
}
Invoke-PyInstaller $StructureDir "structure3d_server.spec" "structure3d_server" $structPy

# main.py's find_xtb_binary() looks for exactly <exe_dir>\xtb\bin\xtb.exe.
# conda-forge's Windows xtb is DLL-linked, so the whole Library\bin goes over
# - xtb.exe alone would fail to load on a user's machine.
Write-Host "==> Bundling xtb next to the executable (with its DLLs)"
$xtbDest = Join-Path $StructureDir "dist\structure3d_server\xtb\bin"
New-Item -ItemType Directory -Force -Path $xtbDest | Out-Null
Copy-Item (Join-Path $structPrefix "Library\bin\*") $xtbDest -Recurse

# conda-forge's Windows rdkit is a SECOND, separate consumer of that same
# Library\bin, and it is not optional either.
#
# This backend is the only one built from a conda env, and on Windows conda
# keeps every compiled library in <env>\Library\bin rather than inside the
# package - rdkit's rdBase.pyd (which _internal\rdkit\rdBase.pyd is just a
# copy of) loads RDKitCatalogs.dll and ~79 siblings from there. Nothing in
# the build environment tells PyInstaller that, and
# pyinstaller-hooks-contrib ships no rdkit hook at all, so a default freeze
# produces a bundle that dies on startup before it can serve anything:
#
#     ImportError: DLL load failed while importing rdBase: The specified
#     module could not be found.
#
# Note this is a different failure from the xtb one above and needs a
# different destination: xtb.exe is spawned as a subprocess and resolves its
# DLLs from its own folder (xtb\bin\), but rdBase.pyd is loaded *in-process*
# by the frozen exe from _internal\rdkit\, whose DLL search never looks in
# xtb\bin. Hence copying into _internal\ rather than reusing $xtbDest.
#
# nmrgraph_server doesn't need any of this - it's built from pip wheels,
# which bundle their DLLs inside the package where collect_all() in its spec
# finds them. That spec is the worked example of doing it right; this spec
# has no equivalent, which is why it has to be a post-freeze copy step.
Write-Host "==> Copying conda Library\bin DLLs into _internal\ (rdkit's native libs)"
$structInternal = Join-Path $StructureDir "dist\structure3d_server\_internal"
if (-not (Test-Path $structInternal)) {
    Write-Error (@(
        "ERROR: expected a PyInstaller onedir _internal\ folder at",
        "$structInternal - did the freeze actually produce a onedir bundle?"
    ) -join [Environment]::NewLine)
    exit 1
}
Copy-Item (Join-Path $structPrefix "Library\bin\*.dll") $structInternal -Force

# Assert it rather than trusting the copy. The smoke test below would catch
# this too, but by then the only clue in the message is an ImportError for a
# DLL that lives three directories away from anything the log mentions.
if (-not (Test-Path (Join-Path $structInternal "RDKitCatalogs.dll"))) {
    Write-Error (@(
        "ERROR: _internal\RDKitCatalogs.dll missing after the copy - rdkit would",
        "fail to import in the frozen build and every /embed3d/xtb request would",
        "500 with an ImportError."
    ) -join [Environment]::NewLine)
    exit 1
}
Write-Host "    found _internal\RDKitCatalogs.dll"

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
Invoke-Native -What "upgrading pip" -Command { & $iupacPy -m pip install --quiet --upgrade pip }
Invoke-Native -What "installing iupac_fallback_server's requirements.txt" -Command {
    & $iupacPy -m pip install --quiet $NoCompile -r (Join-Path $IupacDir "requirements.txt")
}
Invoke-Native -What "installing PyInstaller" -Command {
    & $iupacPy -m pip install --quiet $NoCompile pyinstaller pyinstaller-hooks-contrib
}
Invoke-PyInstaller $IupacDir "iupac_fallback_server.spec" "iupac_fallback_server" $iupacPy

# The JRE is load-bearing, not optional: a packaged end user has no system
# Java, so a bundle missing jre\ answers /health fine and then fails every
# real /name call. Assert the exact path naming.py's _bundled_jre_jvm_path()
# builds on win32 before declaring success.
Write-Host "==> Bundling the pinned JRE $JreVersion next to the executable"
$jreCache = Join-Path $CacheDir "windows-$($JreVersion -replace '\+','-').zip"
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
if (-not (Test-Path $jreCache)) {
    Invoke-WebRequest -Uri $JreUrl -OutFile $jreCache
}
$jreExtract = Join-Path $env:TEMP ("iupac-jre-" + (Get-Random))
Expand-Archive -Path $jreCache -DestinationPath $jreExtract
$jreDir = Get-ChildItem -Path $jreExtract -Directory | Where-Object { $_.Name -like "jdk-*" } | Select-Object -First 1
if (-not $jreDir) {
    Write-Error "ERROR: no jdk-* directory inside the downloaded JRE archive at" `
        "$jreCache - is the pinned Temurin URL still serving a zip?"
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $jreExtract
    exit 1
}
# naming.py's _bundled_jre_jvm_path() looks for <exe_dir>\jre\bin\server\jvm.dll,
# so the archive's own top-level jdk-21.0.9+10-jre\ folder has to become jre\
# itself - Copy-Item -Recurse of the directory onto a non-existent $jreDest
# creates jre\ *containing that folder's contents*, which is what we want here.
# (The assertion a few lines below is what actually catches it if it ever isn't.)
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