// Fails the build if the three frozen Python backends aren't in resources/.
//
// WHY THIS EXISTS
// ---------------
// package.json's build.extraResources lists three folders to copy into the
// packaged app:
//
//     resources/nmrgraph_server/
//     resources/structure3d_server/
//     resources/iupac_fallback_server/
//
// electron-builder does NOT error when one of those `from` paths doesn't
// exist - it just skips it, without a warning you can't miss. All three
// are gitignored (they're ~2.5GB of PyInstaller output, see
// resources/README.md), so a fresh `git clone` has none of them, and this
// is the exact sequence a new machine follows:
//
//     git clone ...
//     python/freeze_windows.ps1        # or the Linux freeze scripts
//     npm install
//     npm run dist:win -- --publish never
//
// Run that where the freeze step failed, was skipped, or was interrupted
// halfway, and you get a perfectly plausible-looking installer: a working
// molecule editor with the three backend-driven features simply absent -
// no NMR prediction, no GFN2-xTB 3D refinement, no local IUPAC naming
// fallback. The app only logs "Executable not found at ..." to its own
// log file (electron/*.cjs), so nothing surfaces in the UI to say why.
//
// This turns that silent failure into a build failure with an actionable
// message, before the installer is ever produced.
//
// WHAT IT CHECKS, AND WHY EACH ONE
// --------------------------------
// A present folder isn't enough. Each backend has one non-Python runtime
// dependency that the freeze step copies in by hand, and all three answer
// /health with 200 even when that dependency is missing - the same trap
// the freeze scripts' own smoke tests were written to catch (they send a
// *real* request, not just a health check, precisely for this reason).
// These are exactly the paths the Python side resolves at runtime:
//
//   nmrgraph_server/data/models/*.pt        -> NMRGraph's src/paths.py
//   structure3d_server/xtb/bin/xtb[.exe]    -> main.py find_xtb_binary()
//   iupac_fallback_server/jre/bin/server/jvm.dll
//                                            -> naming.py _bundled_jre_jvm_path()
//
// A bundle missing any of them installs and starts fine, then fails on
// every real request, which is worse to diagnose after release than a
// build that refuses to produce anything.
//
// Usage: node scripts/check-backends.mjs   (wired up as the npm
// `predist:win` / `predist:linux` / `predist` hooks, so it runs
// automatically before any installer is built).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

// Which platform the *installer* is being built for, when the caller knows.
// `npm run dist:win` on Linux would otherwise be checked against the Linux
// resources/ layout and pass -- while packaging Linux ELF binaries into a
// Windows installer, which builds cleanly and then fails at runtime when the
// app tries to spawn a backend it cannot execute.
//
// Deliberately optional: a bare `check:backends` still means "is this host's
// layout complete", which is what the dev workflow wants.
const targetArg = process.argv[2] ?? null;
const targetPlatform = targetArg === "win32" ? "win32" : targetArg === "linux" ? "linux" : null;
const TARGET_MISMATCH = targetPlatform !== null && targetPlatform !== process.platform;

/** "elf" | "pe" | null, read from the file's own magic bytes. */
function binaryFormat(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(4);
    const read = fs.readSync(fd, head, 0, 4, 0);
    if (read < 4) return null;
    if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return "elf";
    // Windows PE executables are DOS stubs beginning "MZ".
    if (head[0] === 0x4d && head[1] === 0x5a) return "pe";
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// The exe suffix only applies to Windows; the Linux binaries are
// extensionless. Matched against process.platform rather than the target
// electron-builder is building, which is deliberate: a cross-built
// Windows installer from Linux (electron-builder can do this via Wine -
// see ELECTRON.md) is checked against the Linux resources/ layout, which
// is the one that was actually frozen there.
const exeName = (name) => (isWindows ? `${name}.exe` : name);

// The JVM shared library inside the bundle's own portable JRE. This is the
// one path in here that is genuinely platform-specific: PyInstaller's
// onedir output on Windows is bin\server\jvm.dll, on Linux it's
// lib\server\libjvm.so - the same two branches naming.py's
// _bundled_jre_jvm_path() resolves at runtime.
const jvmPath = isWindows
  ? ["jre", "bin", "server", "jvm.dll"]
  : ["jre", "lib", "server", "libjvm.so"];

const backends = [
  {
    name: "nmrgraph_server",
    dir: "nmrgraph_server",
    exe: () => [exeName("nmrgraph_server")],
    also: [
      {
        // The GNN checkpoints are deliberately excluded from
        // nmrgraph_server.spec and copied in afterwards (see
        // src/paths.py's design notes), so a freeze interrupted between
        // the two steps leaves an exe that starts, reports model_loaded,
        // and returns an empty results list for every prediction.
        label: "data/models/*.pt (GNN checkpoints)",
        match: (dir) =>
          fs.existsSync(path.join(dir, "data", "models")) &&
          fs.readdirSync(path.join(dir, "data", "models")).some((f) => f.endsWith(".pt")),
        hint: "run python/freeze_windows.ps1 (or python/freeze_in_container.sh on Linux) - the checkpoints are copied in after the freeze",
      },
    ],
  },
  {
    name: "structure3d_server",
    dir: "structure3d_server",
    exe: () => [exeName("structure3d_server")],
    also: [
      {
        // conda-forge's Windows xtb is dynamically linked, so on Windows
        // the DLLs have to travel with xtb.exe - see
        // python/structure3d_server/README.md's Windows section.
        label: () => `xtb/bin/${exeName("xtb")} (+ its DLLs on Windows)`,
        match: (dir) =>
          fs.existsSync(path.join(dir, "xtb", "bin", exeName("xtb"))) &&
          (!isWindows ||
            fs.readdirSync(path.join(dir, "xtb", "bin")).some((f) => f.toLowerCase().endsWith(".dll"))),
        hint: "the xtb binary is copied in after the freeze; see python/structure3d_server/README.md",
      },
    ],
  },
  {
    name: "iupac_fallback_server",
    dir: "iupac_fallback_server",
    exe: () => [exeName("iupac_fallback_server")],
    also: [
      {
        // A packaged end user has no system Java, so this bundle is the
        // only JVM OPSIN can possibly find. Without it the server still
        // answers /health and then fails every single /name call.
        label: () => jvmPath.join("/") + " (bundled portable JRE)",
        match: (dir) => fs.existsSync(path.join(dir, ...jvmPath)),
        hint: "the JRE is downloaded and copied in after the freeze; see python/iupac_fallback_server/README.md",
      },
    ],
  },
];

const problems = [];

for (const backend of backends) {
  const dir = path.join(repoRoot, "resources", backend.dir);
  const rel = `resources/${backend.dir}`;

  if (!fs.existsSync(dir)) {
    problems.push({ rel, what: `${backend.name} is missing entirely`, hint: null });
    continue;
  }

  const exeRel = path.join(...backend.exe());
  const exeAbs = path.join(dir, exeRel);
  if (!fs.existsSync(exeAbs)) {
    problems.push({ rel, what: `no executable at ${backend.dir}/${exeRel}`, hint: null });
  } else {
    // Cross-build guard: these binaries are what actually gets shipped, and
    // electron-builder copies resources/ into the installer without ever
    // looking at what they are.
    const format = binaryFormat(exeAbs);
    const wanted = process.platform === "win32" ? "pe" : "elf";
    if (format !== null && format !== wanted) {
      problems.push({
        rel,
        what: `${backend.dir}/${exeRel} is a ${format.toUpperCase()} binary, but this is a ${process.platform} build`,
        hint: "PyInstaller cannot cross-compile. Freeze the backends on the platform you are packaging for (see ELECTRON.md).",
      });
    }
    if (TARGET_MISMATCH) {
      problems.push({
        rel,
        what: `you asked for a ${targetPlatform} build, but these binaries are ${process.platform}'s`,
        hint:
          targetPlatform === "win32"
            ? "Freeze on Windows (python\\freeze_windows.ps1), then run dist:win there."
            : "Freeze on Linux, then run dist:linux.",
      });
    }
  }

  for (const also of backend.also) {
    if (!also.match(dir)) {
      problems.push({
        rel,
        what: `no ${typeof also.label === "function" ? also.label() : also.label}`,
        hint: also.hint,
      });
    }
  }
}

if (problems.length === 0) {
  console.log("==> All three frozen backends look complete in resources/.");
  process.exit(0);
}

console.error("ERROR: the bundled Python backends are not ready to package.\n");
for (const { rel, what, hint } of problems) {
  console.error(`  ${rel}/  -  ${what}`);
  if (hint) console.error(`      ${hint}`);
}
console.error(
  [
    "",
    TARGET_MISMATCH
      ? [
          `These backends were frozen for ${process.platform}, and you asked to`,
          `package a ${targetPlatform} build. electron-builder copies resources/`,
          "into the installer without ever looking at what those files are, so",
          "the build would succeed and produce an installer whose backends",
          "cannot execute - failing at runtime, not at build time.",
        ]
      : [
          "electron-builder skips a missing extraResources path silently, so",
          "without this check the build would produce an installer where NMR",
          "prediction, GFN2-xTB 3D refinement and the IUPAC naming fallback",
          "are all quietly absent - the app starts fine and only logs",
          "'Executable not found at ...' to its own log file.",
        ],
    "",
    "To fix, freeze them on the platform you are packaging for (see",
    "resources/README.md and ELECTRON.md - PyInstaller cannot cross-compile):",
    isWindows
      ? "    cd python; .\\freeze_windows.ps1"
      : "    cd python; ./freeze_in_container.sh && ./freeze_structure3d.sh && ./freeze_iupac.sh",
    "",
    "Then re-run this build.",
  ].join("\n"),
);

process.exit(1);
