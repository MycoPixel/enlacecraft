#!/usr/bin/env bash
# Freezes iupac_fallback_server for Linux with PyInstaller and bundles
# a portable JRE alongside it (OPSIN needs a JVM at runtime; PyInstaller
# only freezes Python -- see README.md's "Bundling for a packaged
# Electron build" section for the full explanation of why).
#
# Builds inside a throwaway venv (.build-venv/, created fresh on every
# run) rather than whatever pip happens to resolve to -- see the
# comment above the venv creation below for why that isn't just
# tidiness here: a polluted global/system Python (e.g. one with both
# PyQt5 and PyQt6 installed from unrelated apps) can make PyInstaller
# refuse to build at all.
#
# Run from this directory (python/iupac_fallback_server/):
#     ./build_linux.sh
#
# Output: ../../resources/iupac_fallback_server/ -- matches
# package.json's build.extraResources entry for this service exactly,
# so `npm run dist:linux` picks it up with no further steps.
#
# Only for Linux builds -- see build_windows.ps1 for Windows, which
# must be run on an actual Windows machine (PyInstaller can't
# cross-compile, same constraint as this project's other two bundled
# backends -- see ../../ELECTRON.md).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Pinned so a rebuild months from now bundles the exact same JRE build
# rather than silently picking up whatever's newest -- bump deliberately,
# not by accident. Any Temurin 21 JRE build works; this is just the one
# this was last verified against.
JRE_VERSION="21.0.9+10"
JRE_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9+10/OpenJDK21U-jre_x64_linux_hotspot_21.0.9_10.tar.gz"
JRE_CACHE="jre-cache/linux-${JRE_VERSION}.tar.gz"

# A dedicated, throwaway venv -- NOT just "whatever pip/pyinstaller
# happen to resolve to" -- is what actually matters here, more than it
# might look. PyInstaller's Analysis walks every package importable in
# the build environment, not just this file's own requirements.txt: on
# a dev machine that also has other Python GUI apps installed globally
# (say, anything pulling in both PyQt5 and PyQt6), PyInstaller refuses
# to build at all ("attempt to collect multiple Qt bindings packages"),
# even though this service uses neither. The spec file's own `excludes`
# list is a second layer of defense against that same class of problem,
# but this venv is the actual fix -- it's what guarantees the build
# environment only ever contains what THIS file's requirements.txt put
# there, regardless of anything else installed on the machine running
# this script.
echo "==> Creating an isolated build venv (.build-venv/)"
python3 -m venv .build-venv
# shellcheck disable=SC1091
source .build-venv/bin/activate

echo "==> Installing Python dependencies"
pip install --quiet -r requirements.txt
pip install --quiet pyinstaller

echo "==> Freezing with PyInstaller"
rm -rf build dist
pyinstaller iupac_fallback_server.spec

echo "==> Fetching portable JRE ${JRE_VERSION} (Linux x64), if not already cached"
mkdir -p jre-cache
if [ ! -f "$JRE_CACHE" ]; then
  curl -L -o "$JRE_CACHE" "$JRE_URL"
fi

echo "==> Bundling JRE into the frozen output"
jre_extract_dir=$(mktemp -d)
tar xzf "$JRE_CACHE" -C "$jre_extract_dir"
jre_dir=$(find "$jre_extract_dir" -maxdepth 1 -type d -name 'jdk-*')
rm -rf dist/iupac_fallback_server/jre
cp -r "$jre_dir" dist/iupac_fallback_server/jre
rm -rf "$jre_extract_dir"

echo "==> Smoke-testing the frozen binary (bundled JRE, real HTTP request)"
./dist/iupac_fallback_server/iupac_fallback_server --port 18099 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

healthy=""
for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:18099/health 2>/dev/null)" = "200" ]; then
    healthy="1"
    break
  fi
  sleep 0.5
done
if [ -z "$healthy" ]; then
  echo "Smoke test FAILED: server never became healthy" >&2
  exit 1
fi

result=$(curl -s -X POST http://localhost:18099/name -H "Content-Type: application/json" -d '{"smiles":"CF"}')
kill "$server_pid" 2>/dev/null || true
trap - EXIT

if [[ "$result" != *"fluoro"* ]]; then
  echo "Smoke test FAILED: unexpected response: $result" >&2
  exit 1
fi
echo "Smoke test OK: $result"

echo "==> Copying into resources/iupac_fallback_server"
resources_dir="../../resources/iupac_fallback_server"
rm -rf "$resources_dir"
cp -r dist/iupac_fallback_server "$resources_dir"

echo "==> Done. resources/iupac_fallback_server/ is ready -- run npm run dist:linux."
