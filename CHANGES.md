# Windows exe + Linux AppImage packaging for iupac_fallback_server

This adds the third backend to your existing bundled-Python-server
pattern (alongside `nmrgraph_server` and `structure3d_server`), so
`npm run dist:win` / `dist:linux` picks it up the same way the other
two already are.

## Apply these files

Drop each into your repo at the same path, EXCEPT:
- `resources-README.md` in this zip → your `resources/README.md`
  (renamed here only because your real `resources/` folder isn't part
  of this patch — see below).

Everything else overlays cleanly at its actual path:
`electron/`, `src/types/electron.d.ts`, `package.json`, `.gitignore`,
`ELECTRON.md`, `python/iupac_fallback_server/*`.

**`package.json` and `.gitignore` are full-file copies** (not diffs) —
diff them against your working copy before overwriting, in case you've
changed either since I last touched them. The only changes in each:
one new `extraResources` entry and one new gitignore line, both for
`resources/iupac_fallback_server/`.

## What's new vs. modified

New:
- `python/iupac_fallback_server/iupac_fallback_server.spec` — the
  PyInstaller spec (its own header comment explains the two non-obvious
  `datas` entries it needs).
- `python/iupac_fallback_server/build_linux.sh` — freezes, downloads +
  bundles a portable JRE, smoke-tests the real frozen binary, writes
  straight to `resources/iupac_fallback_server/`. **Run and verified
  end-to-end** in the environment I built this in — see "What I
  actually tested" below.
- `python/iupac_fallback_server/build_windows.ps1` — same thing for
  Windows. **Not run end-to-end** (no Windows machine available to me)
  — every external piece it depends on was individually verified (see
  below), but give it one trial run before trusting its output for a
  real release. Its own header comment says the same thing.
- `electron/iupac_fallback_server.cjs` — process manager, a close
  mirror of your existing `structure3d_server.cjs`.

Modified:
- `python/iupac_fallback_server/main.py` — added `/health` (matches
  your other two backends' convention) and `--port` CLI handling for
  when it's run as the frozen executable.
- `python/iupac_fallback_server/naming.py` — `start_jvm()` now looks
  for a JRE bundled next to the executable first (only true in a
  frozen build), falling back to your system-installed Java for dev
  mode exactly as before.
- `python/iupac_fallback_server/README.md` — added the "Bundling for a
  packaged Electron build" section `ELECTRON.md` points to.
- `electron/main.cjs` / `electron/preload.cjs` /
  `src/types/electron.d.ts` — wired the new backend in alongside the
  other two (require, startServer/stopServer, IPC status handler,
  preload bridge method). Also fixed two now-stale comments in
  `main.cjs` that said "both"/"the two" backends.
- `package.json` — third `extraResources` entry.
- `.gitignore` — ignores `resources/iupac_fallback_server/`.
- `ELECTRON.md` — new "Bundling the IUPAC-naming fallback server"
  section, and updated the cross-building note to say "three backends"
  instead of two.
- `resources/README.md` (→ `resources-README.md` in this zip) — new
  section for the third backend.

## What I actually tested

Everything Linux-side, for real, in the environment I built this in:

- Froze the service with the spec file, hit the exact "OPSIN jar
  missing" failure a bare `pyinstaller main.py` would give you, fixed
  it, then confirmed the jar actually lands inside the frozen bundle.
- Downloaded a real Temurin 21 JRE, bundled it in, then **hid all
  system Java** (moved `/usr/bin/java` and `/usr/lib/jvm` out of the
  way, cleared `JAVA_HOME`) and ran the frozen binary anyway — it
  started and named molecules correctly using only the bundled JRE,
  which is the actual scenario a packaged end user is in.
- Measured cold-start: ~3 seconds from launch to `/health` returning
  200, comfortably inside the 30-second timeout
  `iupac_fallback_server.cjs` already uses (same default as your other
  two).
- Ran `build_linux.sh` itself, from a clean `build`/`dist` state,
  start to finish — it froze, bundled the JRE, smoke-tested the actual
  binary via real HTTP requests, and wrote a working
  `resources/iupac_fallback_server/` (~370MB, in the same size range
  as your other two backends once their own dependencies are counted).
- `tsc -b` clean and `npx vitest run` 113/113 after all the `.cjs` /
  `.d.ts` changes.

For Windows, I verified every piece I couldn't run directly: confirmed
the exact Temurin JRE zip URL `build_windows.ps1` downloads actually
exists and returns the right file, and inspected its contents directly
(via Python's zipfile, no Windows needed) to confirm
`jre\bin\server\jvm.dll` is really at the path `naming.py`'s
`_bundled_jre_jvm_path()` expects. I did not run PyInstaller on
Windows or execute the `.ps1` script itself — there's no way to do
that from here. Give it a real run before shipping a release build
from it.

## One thing I didn't touch

Your top-level `.gitignore` has a blanket `python/` entry, which
would also exclude `python/iupac_fallback_server`'s actual source
files (main.py, naming.py, etc.) from git — not just its `build/`/
`dist/`/`jre-cache/` output. `ELECTRON.md` describes
`structure3d_server`'s source as "living in this repo," which reads
like it's meant to be tracked, so this might be worth a second look on
your end — I left it alone since I can't see `structure3d_server`'s
actual file layout (it's outside this patch) and didn't want to guess
at a gitignore negation pattern that might not match how you've
actually organized it.
