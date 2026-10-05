# iupac_fallback_server

A small local companion service — same idea as `structure3d_server` and
NMRGraph — that gives EnlaceCraft's IUPAC-naming feature a **verified**
fallback for structures PubChem's own naming can't handle.

## Why this exists

PubChem's `compound/smiles/property/IUPACName` endpoint (what
`src/io/pubchem.ts` calls) only reliably returns a name once your exact
structure already exists as an indexed Compound in PubChem's own
~120-million-record database. For a SMILES that isn't already a known
compound, PubChem can auto-generate a lightweight record with a few
basic properties, but IUPAC naming specifically needs its full
Lexichem/OEChem toolkit — documented as too expensive to compute on the
fly for non-indexed structures — so the property just comes back empty.

That's not a bug in the app's SMILES export; it's a structure that
simply isn't already in PubChem's index. A less-common substitution
(certain fluorinated compounds, for instance) is much more likely to
hit this than a common one, purely because the common one is more
likely to already be a catalogued compound.

## How it closes the gap

1. **[NISPO](https://github.com/oxpig/nispo)** generates a candidate
   name — a rule-based, RDKit-driven namer (not a language model), so
   its failure mode is "can't name this" rather than a confident wrong
   guess.
2. **OPSIN** (name → structure, the reverse direction) independently
   re-parses that candidate name back into a structure.
3. The result is compared to the original input via RDKit canonical
   SMILES. **Only an exact match is ever returned.** A name that
   doesn't round-trip is treated as a failure, not a best-effort guess.

This mirrors the same PubChem → verified-fallback pattern used by
[smiles2iupac](https://github.com/gvmfhy/smiles2iupac).

On a 103-million-molecule PubChem benchmark, NISPO's raw output
round-trips correctly about 98.1% of the time (PubChem's own
Lexichem-generated names hit 99.0% on the same test) — so it's normal
for a small fraction of structures to come back as "no verified name,"
even for things that look fairly ordinary. The round-trip check above
is what turns that ~98% average into a hard guarantee for whatever this
service actually returns.

STOUT (a neural SMILES→name model) was considered instead of NISPO but
intentionally left out: it's a pattern-matching model rather than a
rule-based one, which is a worse fit for exactly the out-of-distribution
structures this fallback exists to handle, and its published weights
were unreachable (404) as of when this was written. Worth revisiting
later as a third, clearly-labeled "unverified" tier if NISPO's coverage
ever feels too thin in practice — but it's not wired in here.

## Setup

Requires **Java 8+** on top of the Python dependencies (OPSIN itself is
a Java library, run here via an embedded JVM — see `naming.py`'s doc
comment for why it's kept warm across requests rather than started
fresh per call).

```bash
cd python/iupac_fallback_server
pip install -r requirements.txt
uvicorn main:app --port 8002
```

The first request after startup takes a little longer (NISPO's own
first-use resource loading); every request after that is typically
single-digit-to-low-double-digit milliseconds.

## API

`POST /name`

```json
{ "smiles": "c1ccccc1F" }
```

→ `200 OK`

```json
{ "smiles": "Fc1ccccc1", "name": "fluorobenzene" }
```

Anything that isn't a verified name — invalid SMILES, NISPO producing
nothing, or a generated name that doesn't round-trip — comes back as
`404`. Empty input is `400`.

## Notes

- Like `structure3d_server` and NMRGraph, this is hardcoded to
  `localhost` for now (see `src/io/iupacFallback.ts`) — no env-var
  wiring yet. Same caveat applies before deploying EnlaceCraft anywhere
  real.
- Entirely optional: if this service isn't running, `iupacLookup.ts`
  falls straight back to PubChem's original error message, exactly as
  if this file didn't exist.

## Bundling for a packaged Electron build

For `npm run dist:win` / `dist:linux` to produce a working installer,
this service needs to be frozen into a standalone executable (no
end-user Python install) AND paired with a portable JVM (no end-user
Java install either — OPSIN, the naming-verification library this
wraps, is a Java library). Neither of `structure3d_server` or
NMRGraph needed that second part; this one does.

**Run the platform's build script** from this directory:

```bash
./build_linux.sh          # on Linux
```
```powershell
.\build_windows.ps1       # on Windows, in PowerShell
```

Each one, in order:

1. Installs this folder's `requirements.txt` and PyInstaller.
2. Freezes with `pyinstaller iupac_fallback_server.spec` (the spec
   file's own comments explain the two non-obvious `datas` entries it
   needs beyond a bare `pyinstaller main.py` — the OPSIN jar and
   NISPO's internal resource files, neither of which a default
   PyInstaller analysis would find on its own).
3. Downloads a pinned Eclipse Temurin JRE build (~50MB compressed) —
   cached in `jre-cache/` after the first run, so rebuilding the
   Python side alone doesn't re-download it every time — and copies it
   in as `jre/` next to the frozen executable.
4. **Actually starts the frozen binary and sends it a real request**
   (health check, then a `/name` POST for fluoromethane) before
   declaring success — this catches a broken freeze (a missing data
   file, a JRE that didn't land where the code expects it) right here,
   rather than leaving it to surface later as a silent "why doesn't
   naming work" in a shipped build.
5. On success, copies the result straight to
   `../../resources/iupac_fallback_server/` — ready for
   `npm run dist:win` / `dist:linux` to pick up via
   `package.json`'s `build.extraResources`, no manual copy step.

**Same platform-specific caveat as the other two backends:** freeze it
ON the target platform. PyInstaller cannot cross-compile at all, and
neither can the JRE-bundling step really be faked cross-platform
either (this project's Linux build downloads a Linux JRE; Windows
needs its own Windows one, which `build_windows.ps1` handles, but only
when actually run on Windows).

**Why a bundled JRE at all**, rather than asking the end user to
install Java: `naming.py`'s `start_jvm()` looks for a JRE at
`<executable's own directory>/jre/` first, and only falls back to
JPype's own system-Java auto-detection when that's absent (which is
exactly the dev-mode case — see the main README above). A packaged
end user has no system Java and no reason to expect a molecule-drawing
app would need one, so shipping it inline was the only option
consistent with how `structure3d_server` already bundles its own
`xtb` dependency rather than asking for a separate install.

**If `pyinstaller iupac_fallback_server.spec` fails with "attempt to
collect multiple Qt bindings packages"** — this happened on a real dev
machine that had both PyQt5 and PyQt6 installed globally (from
unrelated apps sharing that same system Python). PyInstaller's
Analysis walks every package importable in the *build environment*,
not just this service's own `requirements.txt`, and refuses to build
at all once it finds more than one Qt binding — even though this
service uses neither. Both build scripts now create and build inside
an isolated `.build-venv/` for exactly this reason, so this shouldn't
recur if you're running them as-is; the spec file's `excludes` list is
a second, independent layer of defense against the same problem if
you're ever invoking `pyinstaller` by hand instead.

**If naming via the fallback doesn't work in a packaged build**, check
the app's console output for lines prefixed `[iupac-fallback-server]`
— `electron/iupac_fallback_server.cjs` logs the service's own
stdout/stderr through with that prefix, same convention as the other
two backends.
